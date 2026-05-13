from django.contrib import admin
from .models import (
    UserProfile,
    Avatar,
    ConversationSession,
    CaptureRequest,
    ExtractedMessage,
    AnalysisResult,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "name", "birth_date", "privacy_consent_at", "privacy_consent_version", "updated_at")
    search_fields = ("name", "user__username", "user__email")
    ordering = ("-updated_at",)


@admin.register(Avatar)
class AvatarAdmin(admin.ModelAdmin):
    list_display = (
        "id", "name", "user", "current_relation", "target_relation", "age_group", "relation_type", "age",
        "gender", "is_active", "updated_at"
    )
    list_filter = ("relation_type", "gender", "is_active")
    search_fields = ("name", "current_relation", "target_relation", "background", "memo", "user__username")
    ordering = ("name", "-updated_at")


@admin.register(ConversationSession)
class ConversationSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id", "title", "user", "avatar", "platform_type", "contact_name",
        "relation_type", "goal_type", "status", "updated_at"
    )
    list_filter = ("platform_type", "relation_type", "goal_type", "status")
    search_fields = ("title", "contact_name", "conversation_key", "user__username")
    ordering = ("-updated_at",)


@admin.register(CaptureRequest)
class CaptureRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id", "session", "source_type", "processing_status",
        "uploaded_at", "processing_started_at", "processing_completed_at"
    )
    list_filter = ("source_type", "processing_status")
    search_fields = ("session__title", "image_url")
    ordering = ("-created_at",)


@admin.register(ExtractedMessage)
class ExtractedMessageAdmin(admin.ModelAdmin):
    list_display = (
        "id", "session", "capture_request", "sender_type",
        "message_order", "confidence_score", "extracted_at"
    )
    list_filter = ("sender_type",)
    search_fields = ("content", "session__title")
    ordering = ("capture_request", "message_order")


@admin.register(AnalysisResult)
class AnalysisResultAdmin(admin.ModelAdmin):
    list_display = (
        "id", "session", "capture_request", "emotion",
        "tone", "risk_level", "model_name", "created_at"
    )
    list_filter = ("emotion", "tone", "risk_level")
    search_fields = ("summary", "strategy", "session__title")
    ordering = ("-created_at",)
