from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
import re

from .models import (
    UserProfile,
    Avatar,
    ConversationSession,
    CaptureRequest,
    ExtractedMessage,
    AnalysisResult,
)


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def validate_password(self, value):
        validate_respondy_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"]
        )
        UserProfile.objects.create(user=user, name=user.username)
        return user


def validate_respondy_password(value, user=None):
    try:
        validate_password(value, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages)
    if len(value) < 8:
        raise serializers.ValidationError("비밀번호는 8자 이상이어야 합니다.")
    if not re.search(r"[A-Za-z]", value):
        raise serializers.ValidationError("비밀번호에는 영문이 포함되어야 합니다.")
    if not re.search(r"\d", value):
        raise serializers.ValidationError("비밀번호에는 숫자가 포함되어야 합니다.")


class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    birth_date = serializers.SerializerMethodField()
    privacy_consent_at = serializers.SerializerMethodField()
    privacy_consent_version = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "email",
            "birth_date",
            "privacy_consent_at",
            "privacy_consent_version",
        ]

    def get_name(self, obj):
        profile, _ = UserProfile.objects.get_or_create(
            user=obj,
            defaults={"name": obj.username},
        )
        return profile.name or obj.username

    def get_birth_date(self, obj):
        profile, _ = UserProfile.objects.get_or_create(
            user=obj,
            defaults={"name": obj.username},
        )
        return profile.birth_date

    def get_privacy_consent_at(self, obj):
        profile, _ = UserProfile.objects.get_or_create(
            user=obj,
            defaults={"name": obj.username},
        )
        return profile.privacy_consent_at

    def get_privacy_consent_version(self, obj):
        profile, _ = UserProfile.objects.get_or_create(
            user=obj,
            defaults={"name": obj.username},
        )
        return profile.privacy_consent_version


class UserProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=150)
    birth_date = serializers.DateField(required=False, allow_null=True)
    privacy_consent_at = serializers.DateTimeField(read_only=True)
    privacy_consent_version = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "birth_date",
            "privacy_consent_at",
            "privacy_consent_version",
        ]
        read_only_fields = ["id", "privacy_consent_at", "privacy_consent_version"]

    def to_representation(self, instance):
        profile, _ = UserProfile.objects.get_or_create(
            user=instance,
            defaults={"name": instance.username},
        )
        return {
            "id": instance.id,
            "name": profile.name or instance.username,
            "email": instance.email,
            "birth_date": profile.birth_date,
            "privacy_consent_at": profile.privacy_consent_at,
            "privacy_consent_version": profile.privacy_consent_version,
        }

    def update(self, instance, validated_data):
        profile_data = {}
        if "name" in validated_data:
            profile_data["name"] = validated_data.pop("name")
        if "birth_date" in validated_data:
            profile_data["birth_date"] = validated_data.pop("birth_date")

        instance.email = validated_data.get("email", instance.email)
        instance.save(update_fields=["email"])

        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(
                user=instance,
                defaults={"name": instance.username},
            )
            profile.name = profile_data.get("name", profile.name)
            if "birth_date" in profile_data:
                profile.birth_date = profile_data["birth_date"]
            profile.save(update_fields=["name", "birth_date", "updated_at"])

        return instance


class PrivacyConsentSerializer(serializers.Serializer):
    agreed = serializers.BooleanField()
    version = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_agreed(self, value):
        if not value:
            raise serializers.ValidationError("privacy consent is required.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"name": user.username},
        )
        profile.privacy_consent_at = timezone.now()
        profile.privacy_consent_version = self.validated_data.get("version") or "2026-05-13"
        profile.save(update_fields=[
            "privacy_consent_at",
            "privacy_consent_version",
            "updated_at",
        ])
        return profile


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("현재 비밀번호가 올바르지 않습니다.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({
                "new_password_confirm": "새 비밀번호가 일치하지 않습니다."
            })
        try:
            validate_respondy_password(
                attrs["new_password"],
                self.context["request"].user,
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.detail})
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class AvatarSerializer(serializers.ModelSerializer):
    class Meta:
        model = Avatar
        fields = [
            "id",
            "name",
            "age_group",
            "current_relation",
            "target_relation",
            "relation_type",
            "age",
            "gender",
            "personality",
            "speech_style",
            "background",
            "memo",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


class CaptureRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaptureRequest
        fields = [
            "id",
            "session",
            "image_url",
            "image_file",
            "image_base64",
            "image_hash",
            "source_type",
            "processing_status",
            "detected_at",
            "uploaded_at",
            "processing_started_at",
            "processing_completed_at",
            "error_message",
            "gemini_extract_raw",
            "gemini_analyze_raw",
            "screen_context",
            "retry_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "session",
            "uploaded_at",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "image_base64": {"write_only": True},
            "image_hash": {"write_only": True},
        }

    def validate(self, attrs):
        has_image = attrs.get("image_url") or attrs.get("image_file") or attrs.get("image_base64")
        if not has_image and not self.instance:
            raise serializers.ValidationError(
                "image_url, image_file, image_base64 중 하나는 필요합니다."
            )
        return attrs


class ExtractedMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtractedMessage
        fields = [
            "id",
            "capture_request",
            "session",
            "sender_type",
            "content",
            "message_order",
            "confidence_score",
            "raw_metadata",
            "extracted_at",
        ]
        read_only_fields = ["id", "capture_request", "session", "extracted_at"]


class AnalysisResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisResult
        fields = [
            "id",
            "session",
            "capture_request",
            "summary",
            "emotion",
            "tone",
            "risk_level",
            "strategy",
            "recommended_replies",
            "caution_points",
            "follow_up_suggestions",
            "model_name",
            "raw_result",
            "created_at",
        ]
        read_only_fields = ["id", "session", "capture_request", "created_at"]


class ManualAnalysisRequestSerializer(serializers.Serializer):
    avatar_id = serializers.PrimaryKeyRelatedField(
        source="avatar",
        queryset=Avatar.objects.none(),
        required=True,
    )
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    platform_type = serializers.ChoiceField(
        choices=ConversationSession.PlatformType.choices,
        default=ConversationSession.PlatformType.UNKNOWN,
        required=False,
    )
    goal_type = serializers.ChoiceField(
        choices=ConversationSession.GoalType.choices,
        default=ConversationSession.GoalType.GENERAL,
        required=False,
    )
    situation_context = serializers.CharField(required=False, allow_blank=True)
    analysis_goal = serializers.CharField(required=False, allow_blank=True)
    received_message = serializers.CharField(required=True, allow_blank=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            self.fields["avatar_id"].queryset = Avatar.objects.filter(user=request.user)

    def validate_received_message(self, value):
        if not value.strip():
            raise serializers.ValidationError("받은 메시지를 입력해주세요.")
        return value.strip()


class ConversationSessionSerializer(serializers.ModelSerializer):
    avatar = AvatarSerializer(read_only=True)
    avatar_id = serializers.PrimaryKeyRelatedField(
        source="avatar",
        queryset=Avatar.objects.none(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    analysis_type = serializers.SerializerMethodField()
    avatar_name = serializers.SerializerMethodField()
    latest_summary = serializers.SerializerMethodField()
    latest_emotion = serializers.SerializerMethodField()
    latest_tone = serializers.SerializerMethodField()
    latest_risk_level = serializers.SerializerMethodField()
    latest_capture_status = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            self.fields["avatar_id"].queryset = Avatar.objects.filter(user=request.user)

    def _latest_capture(self, obj):
        if not hasattr(obj, "_latest_capture_cache"):
            obj._latest_capture_cache = obj.captures.order_by("-created_at").first()
        return obj._latest_capture_cache

    def _latest_analysis(self, obj):
        if not hasattr(obj, "_latest_analysis_cache"):
            obj._latest_analysis_cache = obj.analysis_results.order_by("-created_at").first()
        return obj._latest_analysis_cache

    def get_analysis_type(self, obj):
        source_type = getattr(obj, "latest_capture_source_type", None)
        if source_type:
            if source_type == CaptureRequest.SourceType.API:
                return "manual"
            if source_type == CaptureRequest.SourceType.ELECTRON:
                return "realtime"
            return source_type

        capture = self._latest_capture(obj)
        if not capture:
            return None
        if capture.source_type == CaptureRequest.SourceType.API:
            return "manual"
        if capture.source_type == CaptureRequest.SourceType.ELECTRON:
            return "realtime"
        return capture.source_type

    def get_avatar_name(self, obj):
        return obj.avatar.name if obj.avatar else obj.contact_name

    def get_latest_summary(self, obj):
        summary = getattr(obj, "latest_analysis_summary", None)
        if summary is not None:
            return summary

        analysis = self._latest_analysis(obj)
        return analysis.summary if analysis else ""

    def get_latest_emotion(self, obj):
        emotion = getattr(obj, "latest_analysis_emotion", None)
        if emotion is not None:
            return emotion

        analysis = self._latest_analysis(obj)
        return analysis.emotion if analysis else None

    def get_latest_tone(self, obj):
        tone = getattr(obj, "latest_analysis_tone", None)
        if tone is not None:
            return tone

        analysis = self._latest_analysis(obj)
        return analysis.tone if analysis else None

    def get_latest_risk_level(self, obj):
        risk_level = getattr(obj, "latest_analysis_risk_level", None)
        if risk_level is not None:
            return risk_level

        analysis = self._latest_analysis(obj)
        return analysis.risk_level if analysis else None

    def get_latest_capture_status(self, obj):
        processing_status = getattr(obj, "latest_capture_status_value", None)
        if processing_status is not None:
            return processing_status

        capture = self._latest_capture(obj)
        return capture.processing_status if capture else None

    class Meta:
        model = ConversationSession
        fields = [
            "id",
            "avatar",
            "avatar_id",
            "title",
            "platform_type",
            "contact_name",
            "conversation_key",
            "relation_type",
            "relationship_context",
            "goal_type",
            "analysis_goal",
            "situation_context",
            "status",
            "analysis_type",
            "avatar_name",
            "latest_summary",
            "latest_emotion",
            "latest_tone",
            "latest_risk_level",
            "latest_capture_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ConversationSessionDetailSerializer(serializers.ModelSerializer):
    avatar = AvatarSerializer(read_only=True)
    captures = CaptureRequestSerializer(many=True, read_only=True)
    analysis_results = AnalysisResultSerializer(many=True, read_only=True)
    analysis_type = serializers.SerializerMethodField()
    latest_capture = serializers.SerializerMethodField()
    latest_messages = serializers.SerializerMethodField()
    latest_analysis = serializers.SerializerMethodField()

    def _latest_capture(self, obj):
        if not hasattr(obj, "_latest_capture_cache"):
            obj._latest_capture_cache = obj.captures.order_by("-created_at").first()
        return obj._latest_capture_cache

    def _latest_analysis(self, obj):
        if not hasattr(obj, "_latest_analysis_cache"):
            obj._latest_analysis_cache = obj.analysis_results.order_by("-created_at").first()
        return obj._latest_analysis_cache

    def get_analysis_type(self, obj):
        capture = self._latest_capture(obj)
        if not capture:
            return None
        if capture.source_type == CaptureRequest.SourceType.API:
            return "manual"
        if capture.source_type == CaptureRequest.SourceType.ELECTRON:
            return "realtime"
        return capture.source_type

    def get_latest_capture(self, obj):
        capture = self._latest_capture(obj)
        if not capture:
            return None
        return CaptureRequestSerializer(capture, context=self.context).data

    def get_latest_messages(self, obj):
        capture = self._latest_capture(obj)
        if not capture:
            return []
        messages = capture.extracted_messages.order_by("message_order", "id")
        return ExtractedMessageSerializer(messages, many=True, context=self.context).data

    def get_latest_analysis(self, obj):
        analysis = self._latest_analysis(obj)
        if not analysis:
            return None
        return AnalysisResultSerializer(analysis, context=self.context).data

    class Meta:
        model = ConversationSession
        fields = [
            "id",
            "avatar",
            "title",
            "platform_type",
            "contact_name",
            "conversation_key",
            "relation_type",
            "relationship_context",
            "goal_type",
            "analysis_goal",
            "situation_context",
            "status",
            "created_at",
            "updated_at",
            "analysis_type",
            "latest_capture",
            "latest_messages",
            "latest_analysis",
            "captures",
            "analysis_results",
        ]
