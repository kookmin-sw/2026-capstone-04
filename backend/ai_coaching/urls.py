from django.urls import path

from .views import (
    ArchiveAIChatSessionView,
    AIChatSessionDetailView,
    AIChatSessionListCreateView,
    RetryAIChatMessageView,
    SendAIChatMessageView,
)

urlpatterns = [
    path("chats/", AIChatSessionListCreateView.as_view(), name="ai-chat-list-create"),
    path("chats/<int:pk>/", AIChatSessionDetailView.as_view(), name="ai-chat-detail"),
    path("chats/<int:pk>/archive/", ArchiveAIChatSessionView.as_view(), name="ai-chat-archive"),
    path("chats/<int:pk>/messages/", SendAIChatMessageView.as_view(), name="ai-chat-send-message"),
    path("chats/<int:pk>/retry/", RetryAIChatMessageView.as_view(), name="ai-chat-retry"),
]
