from django.conf import settings
from django.db import models

from conversations.models import Avatar


class AIChatSession(models.Model):
    class StatusType(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_chat_sessions",
    )
    avatar = models.ForeignKey(
        Avatar,
        on_delete=models.SET_NULL,
        related_name="ai_chat_sessions",
        blank=True,
        null=True,
    )
    title = models.CharField(max_length=255)
    situation_context = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=StatusType.choices,
        default=StatusType.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "avatar"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.user})"


class AIChatMessage(models.Model):
    class SenderType(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    class MessageStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    chat_session = models.ForeignKey(
        AIChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender_type = models.CharField(
        max_length=20,
        choices=SenderType.choices,
    )
    content = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=MessageStatus.choices,
        default=MessageStatus.COMPLETED,
    )
    error_message = models.TextField(blank=True)
    raw_response = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["chat_session", "created_at"]),
            models.Index(fields=["sender_type"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.sender_type}: {self.content[:30]}"
