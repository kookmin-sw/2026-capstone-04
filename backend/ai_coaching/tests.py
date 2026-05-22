from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from conversations.models import Avatar

from .models import AIChatMessage, AIChatSession
from .services import _build_gemini_payload, _clean_reply_text


User = get_user_model()


class AIChatAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="user",
            email="user@example.com",
            password="password123",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="password123",
        )
        self.avatar = Avatar.objects.create(
            user=self.user,
            name="민지",
            age_group="20대",
            current_relation="친구",
            target_relation="좋은 친구",
            relation_type=Avatar.RelationType.FRIEND,
            personality="조용하지만 배려심이 많음",
            speech_style="짧고 담백하게 말함",
            background="대학교 동기",
        )
        self.other_avatar = Avatar.objects.create(
            user=self.other_user,
            name="다른 사람",
        )

    def authenticate(self):
        self.client.force_authenticate(user=self.user)

    def create_chat_session(self, **kwargs):
        defaults = {
            "user": self.user,
            "avatar": self.avatar,
            "title": "민지와 대화 연습",
            "situation_context": "어제 답장이 늦어서 어색한 상황",
        }
        defaults.update(kwargs)
        return AIChatSession.objects.create(**defaults)

    def mock_gemini_response(self, text="응, 알겠어."):
        return {
            "candidates": [{
                "content": {
                    "parts": [{"text": text}],
                },
            }],
        }

    def test_unauthenticated_user_cannot_access_chat_list(self):
        response = self.client.get("/api/coaching/chats/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_chat_session_with_own_avatar(self):
        self.authenticate()

        response = self.client.post("/api/coaching/chats/", {
            "avatar_id": self.avatar.id,
            "title": "민지와 대화 연습",
            "situation_context": "사과를 연습하는 상황",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AIChatSession.objects.count(), 1)
        chat_session = AIChatSession.objects.get()
        self.assertEqual(chat_session.user, self.user)
        self.assertEqual(chat_session.avatar, self.avatar)

    def test_create_chat_session_with_other_users_avatar_fails(self):
        self.authenticate()

        response = self.client.post("/api/coaching/chats/", {
            "avatar_id": self.other_avatar.id,
            "title": "권한 없는 아바타",
            "situation_context": "테스트",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AIChatSession.objects.count(), 0)

    def test_chat_list_only_returns_current_users_sessions(self):
        self.authenticate()
        own_session = self.create_chat_session()
        AIChatSession.objects.create(
            user=self.other_user,
            avatar=self.other_avatar,
            title="다른 사용자 세션",
        )

        response = self.client.get("/api/coaching/chats/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_session.id)

    def test_update_chat_session_title_and_situation_context(self):
        self.authenticate()
        chat_session = self.create_chat_session()

        response = self.client.patch(f"/api/coaching/chats/{chat_session.id}/", {
            "title": "수정된 제목",
            "situation_context": "수정된 상황",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        chat_session.refresh_from_db()
        self.assertEqual(chat_session.title, "수정된 제목")
        self.assertEqual(chat_session.situation_context, "수정된 상황")

    def test_archive_chat_session(self):
        self.authenticate()
        chat_session = self.create_chat_session()

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/archive/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        chat_session.refresh_from_db()
        self.assertEqual(chat_session.status, AIChatSession.StatusType.ARCHIVED)

    @patch("ai_coaching.services._call_gemini")
    def test_send_message_saves_user_and_assistant_messages(self, mock_call_gemini):
        self.authenticate()
        chat_session = self.create_chat_session()
        mock_call_gemini.return_value = self.mock_gemini_response("괜찮아, 다음엔 빨리 답해줘.")

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/messages/", {
            "content": "어제 답장 늦어서 미안해",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(chat_session.messages.count(), 2)
        assistant_message = chat_session.messages.get(sender_type=AIChatMessage.SenderType.ASSISTANT)
        self.assertEqual(assistant_message.status, AIChatMessage.MessageStatus.COMPLETED)
        self.assertEqual(assistant_message.content, "괜찮아, 다음엔 빨리 답해줘.")

    @patch("ai_coaching.services._call_gemini")
    def test_send_message_failure_saves_failed_assistant_message(self, mock_call_gemini):
        self.authenticate()
        chat_session = self.create_chat_session()
        mock_call_gemini.side_effect = RuntimeError("Gemini timeout")

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/messages/", {
            "content": "지금 이야기 가능해?",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(response.data["success"])
        self.assertEqual(chat_session.messages.count(), 2)
        failed_message = chat_session.messages.get(sender_type=AIChatMessage.SenderType.ASSISTANT)
        self.assertEqual(failed_message.status, AIChatMessage.MessageStatus.FAILED)
        self.assertIn("Gemini timeout", failed_message.error_message)

    def test_archived_chat_session_rejects_new_messages(self):
        self.authenticate()
        chat_session = self.create_chat_session(status=AIChatSession.StatusType.ARCHIVED)

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/messages/", {
            "content": "메시지",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("ai_coaching.services._call_gemini")
    def test_retry_uses_last_user_message(self, mock_call_gemini):
        self.authenticate()
        chat_session = self.create_chat_session()
        user_message = AIChatMessage.objects.create(
            chat_session=chat_session,
            sender_type=AIChatMessage.SenderType.USER,
            content="다시 답해줘",
        )
        AIChatMessage.objects.create(
            chat_session=chat_session,
            sender_type=AIChatMessage.SenderType.ASSISTANT,
            content="",
            status=AIChatMessage.MessageStatus.FAILED,
            error_message="timeout",
        )
        mock_call_gemini.return_value = self.mock_gemini_response("응, 다시 말해볼게.")

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/retry/")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["user_message"]["id"], user_message.id)
        self.assertEqual(
            response.data["data"]["assistant_message"]["content"],
            "응, 다시 말해볼게.",
        )

    def test_retry_without_user_message_returns_bad_request(self):
        self.authenticate()
        chat_session = self.create_chat_session()

        response = self.client.post(f"/api/coaching/chats/{chat_session.id}/retry/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])

    def test_gemini_prompt_uses_avatar_name_for_history(self):
        chat_session = self.create_chat_session()
        AIChatMessage.objects.create(
            chat_session=chat_session,
            sender_type=AIChatMessage.SenderType.USER,
            content="회의는 10시에 시작하면 될까요?",
        )
        AIChatMessage.objects.create(
            chat_session=chat_session,
            sender_type=AIChatMessage.SenderType.ASSISTANT,
            content="네, 10시에 시작해도 괜찮아요.",
        )

        payload = _build_gemini_payload(chat_session)
        prompt = payload["contents"][0]["parts"][0]["text"]

        self.assertIn("사용자: 회의는 10시에 시작하면 될까요?", prompt)
        self.assertIn("민지: 네, 10시에 시작해도 괜찮아요.", prompt)
        self.assertNotIn("assistant:", prompt)

    def test_clean_reply_text_removes_labels_and_quotes(self):
        self.assertEqual(_clean_reply_text("AI: 네, 그럼 10시에 시작해요."), "네, 그럼 10시에 시작해요.")
        self.assertEqual(_clean_reply_text('"네, 좋아요."'), "네, 좋아요.")
