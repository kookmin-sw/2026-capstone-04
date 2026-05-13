from django.contrib import admin

from .models import AIChatMessage, AIChatSession


@admin.register(AIChatSession)
class AIChatSessionAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "user", "avatar", "status", "created_at", "updated_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["title", "user__username", "avatar__name"]


@admin.register(AIChatMessage)
class AIChatMessageAdmin(admin.ModelAdmin):
    list_display = ["id", "chat_session", "sender_type", "created_at"]
    list_filter = ["sender_type", "created_at"]
    search_fields = ["content", "chat_session__title"]
