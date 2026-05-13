import base64
import hashlib
import hmac
import json
import mimetypes
import re

import requests
from django.conf import settings
from django.utils import timezone

from .models import CaptureRequest, ExtractedMessage, AnalysisResult


GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class NoAnalyzableMessage(ValueError):
    code = "no_analyzable_other_message"

    def __str__(self):
        return self.code


class NoNewOtherMessage(ValueError):
    code = "no_new_other_message"

    def __str__(self):
        return self.code


def build_capture_image_hash(attrs):
    if attrs.get("image_base64"):
        return _hmac_hexdigest(_strip_data_url(attrs["image_base64"]).encode("utf-8"))

    image_file = attrs.get("image_file")
    if image_file:
        position = image_file.tell() if hasattr(image_file, "tell") else None
        content = image_file.read()
        if position is not None and hasattr(image_file, "seek"):
            image_file.seek(position)
        return _hmac_hexdigest(content)

    if attrs.get("image_url"):
        return _hmac_hexdigest(f"url:{attrs['image_url']}".encode("utf-8"))

    if attrs.get("image_hash"):
        return _hmac_hexdigest(f"client:{attrs['image_hash']}".encode("utf-8"))

    return ""


def analyze_capture(capture):
    capture.processing_status = CaptureRequest.ProcessingStatus.EXTRACTING
    capture.processing_started_at = timezone.now()
    capture.error_message = ""
    capture.save(update_fields=["processing_status", "processing_started_at", "error_message", "updated_at"])

    try:
        payload = _build_gemini_payload(capture)
        response_data = _call_gemini(payload)
        capture.gemini_extract_raw = response_data
        capture.processing_status = CaptureRequest.ProcessingStatus.ANALYZING
        capture.save(update_fields=["gemini_extract_raw", "processing_status", "updated_at"])

        parsed = _parse_gemini_response(response_data)
        messages = _normalize_messages(parsed.get("messages", []))
        latest_message = _latest_meaningful_message(messages)
        if not latest_message or latest_message["sender_type"] != ExtractedMessage.SenderType.OTHER:
            raise NoAnalyzableMessage()
        if _is_same_as_latest_saved_other_message(capture.session, latest_message["content"]):
            raise NoNewOtherMessage()

        analysis = parsed.get("analysis", {})

        ExtractedMessage.objects.filter(capture_request=capture).delete()
        AnalysisResult.objects.filter(capture_request=capture).delete()

        for index, message in enumerate(messages, start=1):
            ExtractedMessage.objects.create(
                capture_request=capture,
                session=capture.session,
                sender_type=message.get("sender_type", ExtractedMessage.SenderType.UNKNOWN),
                content=message.get("content", ""),
                message_order=message.get("message_order") or index,
                confidence_score=message.get("confidence_score"),
                raw_metadata=message,
            )

        result = AnalysisResult.objects.create(
            session=capture.session,
            capture_request=capture,
            summary=analysis.get("summary", ""),
            emotion=analysis.get("emotion", AnalysisResult.EmotionType.UNKNOWN),
            tone=analysis.get("tone", AnalysisResult.ToneType.UNKNOWN),
            risk_level=analysis.get("risk_level", AnalysisResult.RiskLevel.UNKNOWN),
            strategy=analysis.get("strategy", ""),
            recommended_replies=analysis.get("recommended_replies", []),
            caution_points=analysis.get("caution_points", []),
            follow_up_suggestions=analysis.get("follow_up_suggestions", []),
            model_name=settings.GEMINI_MODEL,
            raw_result=parsed,
        )

        capture.gemini_analyze_raw = parsed
        capture.processing_status = CaptureRequest.ProcessingStatus.COMPLETED
        capture.processing_completed_at = timezone.now()
        capture.save(update_fields=[
            "gemini_analyze_raw",
            "processing_status",
            "processing_completed_at",
            "updated_at",
        ])
        return result
    except Exception as exc:
        capture.processing_status = CaptureRequest.ProcessingStatus.FAILED
        capture.error_message = str(exc)
        capture.processing_completed_at = timezone.now()
        capture.save(update_fields=[
            "processing_status",
            "error_message",
            "processing_completed_at",
            "updated_at",
        ])
        raise
    finally:
        _clear_capture_image_data(capture)


def analyze_manual_message(session, received_message):
    capture = CaptureRequest.objects.create(
        session=session,
        source_type=CaptureRequest.SourceType.API,
        processing_status=CaptureRequest.ProcessingStatus.ANALYZING,
        processing_started_at=timezone.now(),
        screen_context={
            "analysis_type": "manual_input",
            "received_message": received_message,
        },
    )

    try:
        response_data = _call_gemini(_build_manual_analysis_payload(session, received_message))
        parsed = _parse_gemini_response(response_data)
        analysis = parsed.get("analysis", {})

        message = ExtractedMessage.objects.create(
            capture_request=capture,
            session=session,
            sender_type=ExtractedMessage.SenderType.OTHER,
            content=received_message,
            message_order=1,
            confidence_score=1.0,
            raw_metadata={"source": "manual_input"},
        )

        result = AnalysisResult.objects.create(
            session=session,
            capture_request=capture,
            summary=analysis.get("summary", ""),
            emotion=analysis.get("emotion", AnalysisResult.EmotionType.UNKNOWN),
            tone=analysis.get("tone", AnalysisResult.ToneType.UNKNOWN),
            risk_level=analysis.get("risk_level", AnalysisResult.RiskLevel.UNKNOWN),
            strategy=analysis.get("strategy", ""),
            recommended_replies=analysis.get("recommended_replies", []),
            caution_points=analysis.get("caution_points", []),
            follow_up_suggestions=analysis.get("follow_up_suggestions", []),
            model_name=settings.GEMINI_MODEL,
            raw_result=parsed,
        )

        capture.gemini_analyze_raw = parsed
        capture.processing_status = CaptureRequest.ProcessingStatus.COMPLETED
        capture.processing_completed_at = timezone.now()
        capture.save(update_fields=[
            "gemini_analyze_raw",
            "processing_status",
            "processing_completed_at",
            "updated_at",
        ])
        return capture, message, result
    except Exception as exc:
        capture.processing_status = CaptureRequest.ProcessingStatus.FAILED
        capture.error_message = str(exc)
        capture.processing_completed_at = timezone.now()
        capture.save(update_fields=[
            "processing_status",
            "error_message",
            "processing_completed_at",
            "updated_at",
        ])
        raise


def _build_gemini_payload(capture):
    session = capture.session
    avatar = session.avatar
    contact_name = avatar.name if avatar else session.contact_name
    relation_type = avatar.current_relation if avatar and avatar.current_relation else (
        avatar.relation_type if avatar else session.relation_type
    )
    relationship_background = avatar.background if avatar else session.relationship_context
    avatar_context = "No avatar selected."
    if avatar:
        avatar_context = f"""
- avatar name: {avatar.name}
- avatar age group: {avatar.age_group}
- avatar current relationship: {avatar.current_relation}
- avatar target relationship: {avatar.target_relation}
- avatar relationship type: {avatar.relation_type}
- avatar age: {avatar.age or "unknown"}
- avatar gender: {avatar.gender}
- avatar personality: {avatar.personality}
- avatar speech style: {avatar.speech_style}
- avatar background with user: {avatar.background}
- avatar memo: {avatar.memo}
"""
    prompt = f"""
You are Respondy's Korean conversation coaching engine.
Read the KakaoTalk screenshot, extract chat messages in order, then analyze the conversation.

Session context:
- chat room title: {session.title}
- platform: {session.platform_type}
- contact name: {contact_name}
- relationship: {relation_type}
- goal type: {session.goal_type}
- relationship background: {relationship_background}
- current situation: {session.situation_context}
- user's analysis goal: {session.analysis_goal}
- screen context: {capture.screen_context}

Avatar context:
{avatar_context}

Extraction rules:
- Extract only visible chat messages from the screenshot. Ignore buttons, menus, timestamps, room codes, profile names, and system UI unless they are needed to understand the message.
- Preserve the other person's message text as-is, including slang, typos, profanity, laughter, punctuation, and emojis.
- If a sticker or emoticon is important, describe it briefly in Korean inside content, for example "[웃는 이모티콘]" or "[당황한 표정의 이모티콘]".
- Do not invent hidden or cropped messages. If text is unreadable, use sender_type "unknown" and content "[읽기 어려움]".
- Use message_order to reflect the visible chronological order.

Analysis and reply rules:
- Write all analysis fields in Korean.
- Reflect the avatar relationship, current situation, and user's analysis goal.
- Do not overreact to short replies such as "그래", "ㅇㅇ", "ㅋㅋ"; interpret them cautiously.
- Recommended replies must be immediately copy-pasteable KakaoTalk-style messages.
- Return exactly 3 recommended replies. Keep each reply natural, short, and not overly formal unless the relationship requires it.
- Avoid excessive confession, pressure, apology, persuasion, or emotional over-explanation.
- If the conversation seems risky, tense, or ambiguous, increase risk_level and include concrete caution_points.
- If no meaningful chat message is visible, set emotion, tone, and risk_level to "unknown" and recommend asking for clarification.

Return only valid JSON with this exact shape:
{{
  "messages": [
    {{
      "sender_type": "user|other|unknown",
      "content": "message text",
      "message_order": 1,
      "confidence_score": 0.0
    }}
  ],
  "analysis": {{
    "summary": "short Korean summary",
    "emotion": "positive|neutral|annoyed|sad|angry|anxious|mixed|unknown",
    "tone": "friendly|casual|polite|cold|sensitive|aggressive|awkward|unknown",
    "risk_level": "low|medium|high|unknown",
    "strategy": "Korean reply strategy",
    "recommended_replies": ["Korean reply 1", "Korean reply 2", "Korean reply 3"],
    "caution_points": ["Korean caution point"],
    "follow_up_suggestions": ["Korean follow-up suggestion"]
  }}
}}
"""
    return {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": _get_image_inline_data(capture)},
            ],
        }],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        },
    }


def _build_manual_analysis_payload(session, received_message):
    avatar = session.avatar
    contact_name = avatar.name if avatar else session.contact_name
    relation_type = avatar.current_relation if avatar and avatar.current_relation else (
        avatar.relation_type if avatar else session.relation_type
    )
    relationship_background = avatar.background if avatar else session.relationship_context
    avatar_context = "No avatar selected."
    if avatar:
        avatar_context = f"""
- avatar name: {avatar.name}
- avatar age group: {avatar.age_group}
- avatar current relationship: {avatar.current_relation}
- avatar target relationship: {avatar.target_relation}
- avatar relationship type: {avatar.relation_type}
- avatar age: {avatar.age or "unknown"}
- avatar gender: {avatar.gender}
- avatar personality: {avatar.personality}
- avatar speech style: {avatar.speech_style}
- avatar background with user: {avatar.background}
- avatar memo: {avatar.memo}
"""

    prompt = f"""
You are Respondy's Korean reply coaching engine.
Analyze a manually entered received message and recommend natural Korean replies.

Session context:
- title: {session.title}
- platform: {session.platform_type}
- contact name: {contact_name}
- relationship: {relation_type}
- goal type: {session.goal_type}
- relationship background: {relationship_background}
- current situation: {session.situation_context}
- user's analysis goal: {session.analysis_goal}

Avatar context:
{avatar_context}

Received message from the other person:
{received_message}

Analysis and reply rules:
- Write all analysis fields in Korean.
- Analyze the received message in the context of the selected avatar, relationship, situation, and user's goal.
- Preserve the meaning of the received message as written, including slang, typos, profanity, laughter, punctuation, and emojis.
- Do not assume romantic interest, anger, rejection, or conflict from a short message alone.
- Recommended replies must be immediately copy-pasteable KakaoTalk-style messages.
- Return exactly 3 recommended replies. Keep each reply natural, short, and not overly formal unless the relationship requires it.
- Avoid excessive confession, pressure, apology, persuasion, or emotional over-explanation.
- If the received message is ambiguous, explain the ambiguity in summary or strategy and suggest safe, low-pressure replies.
- If the message contains insults, conflict, or sensitive content, raise risk_level and include caution_points.

Return only valid JSON with this exact shape:
{{
  "analysis": {{
    "summary": "short Korean summary",
    "emotion": "positive|neutral|annoyed|sad|angry|anxious|mixed|unknown",
    "tone": "friendly|casual|polite|cold|sensitive|aggressive|awkward|unknown",
    "risk_level": "low|medium|high|unknown",
    "strategy": "Korean reply strategy",
    "recommended_replies": ["Korean reply 1", "Korean reply 2", "Korean reply 3"],
    "caution_points": ["Korean caution point"],
    "follow_up_suggestions": ["Korean follow-up suggestion"]
  }}
}}
"""
    return {
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}],
        }],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        },
    }


def _call_gemini(payload):
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    url = GEMINI_ENDPOINT.format(model=settings.GEMINI_MODEL)
    response = requests.post(
        url,
        params={"key": settings.GEMINI_API_KEY},
        json=payload,
        timeout=45,
    )
    if not response.ok:
        raise RuntimeError(
            f"Gemini API request failed with status {response.status_code}: "
            f"{response.text[:500]}"
        )
    return response.json()


def _get_image_inline_data(capture):
    if capture.image_base64:
        return {
            "mime_type": _guess_base64_mime_type(capture.image_base64),
            "data": _strip_data_url(capture.image_base64),
        }

    if capture.image_file:
        content = capture.image_file.read()
        mime_type = mimetypes.guess_type(capture.image_file.name)[0] or "image/png"
        return {
            "mime_type": mime_type,
            "data": base64.b64encode(content).decode("ascii"),
        }

    if capture.image_url:
        response = requests.get(capture.image_url, timeout=20)
        response.raise_for_status()
        return {
            "mime_type": response.headers.get("content-type", "image/png").split(";")[0],
            "data": base64.b64encode(response.content).decode("ascii"),
        }

    raise ValueError("One of image_base64, image_file, or image_url is required.")


def _clear_capture_image_data(capture):
    update_fields = []

    if capture.image_base64:
        capture.image_base64 = ""
        update_fields.append("image_base64")

    if capture.image_file:
        storage = capture.image_file.storage
        name = capture.image_file.name
        capture.image_file = None
        update_fields.append("image_file")
        if name:
            storage.delete(name)

    if update_fields:
        update_fields.append("updated_at")
        capture.save(update_fields=update_fields)


def _parse_gemini_response(response_data):
    candidates = response_data.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    text = "".join(part.get("text", "") for part in parts)
    text = _strip_code_fence(text.strip())
    return json.loads(text)


def _normalize_messages(messages):
    normalized = []
    for message in messages or []:
        content = str(message.get("content", "")).strip()
        if not content:
            continue

        sender_type = message.get("sender_type", ExtractedMessage.SenderType.UNKNOWN)
        valid_sender_types = {
            ExtractedMessage.SenderType.USER,
            ExtractedMessage.SenderType.OTHER,
            ExtractedMessage.SenderType.UNKNOWN,
        }
        if sender_type not in valid_sender_types:
            sender_type = ExtractedMessage.SenderType.UNKNOWN

        normalized.append({
            **message,
            "sender_type": sender_type,
            "content": content,
        })
    return normalized


def _latest_meaningful_message(messages):
    unreadable_values = {"[읽기 어려움]", "[인식 불가]", "[읽을 수 없음]"}
    meaningful_messages = [
        message
        for message in messages
        if message.get("sender_type") in {
            ExtractedMessage.SenderType.USER,
            ExtractedMessage.SenderType.OTHER,
        }
        and message.get("content", "").strip()
        and message.get("content", "").strip() not in unreadable_values
    ]
    if not meaningful_messages:
        return None
    return sorted(
        meaningful_messages,
        key=lambda message: message.get("message_order") or 0,
    )[-1]


def _is_same_as_latest_saved_other_message(session, content):
    latest_other_message = (
        ExtractedMessage.objects
        .filter(
            session=session,
            sender_type=ExtractedMessage.SenderType.OTHER,
        )
        .order_by("-capture_request__created_at", "-message_order", "-id")
        .first()
    )
    return bool(
        latest_other_message
        and latest_other_message.content.strip() == content.strip()
    )


def _strip_code_fence(text):
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    return match.group(1) if match else text


def _strip_data_url(value):
    if "," in value and value.strip().startswith("data:"):
        return value.split(",", 1)[1]
    return value


def _guess_base64_mime_type(value):
    if value.startswith("data:") and ";" in value:
        return value.split(";", 1)[0].replace("data:", "")
    return "image/png"


def _hmac_hexdigest(value):
    secret = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(secret, value, hashlib.sha256).hexdigest()
