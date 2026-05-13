from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    health_check,
    db_check,
    AvatarListCreateView,
    AvatarDetailView,
    SignupView,
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    UserProfileView,
    PrivacyConsentView,
    ManualAnalysisView,
    ConversationSessionListCreateView,
    ConversationSessionDetailView,
    EndConversationSessionView,
    CaptureRequestListCreateView,
    ExtractedMessageListCreateView,
    AnalysisResultListCreateView,
)

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("db-check/", db_check, name="db-check"),

    path("auth/signup/", SignupView.as_view(), name="signup"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/password/", PasswordChangeView.as_view(), name="password-change"),
    path("auth/profile/", UserProfileView.as_view(), name="profile"),
    path("auth/privacy-consent/", PrivacyConsentView.as_view(), name="privacy-consent"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    path("avatars/", AvatarListCreateView.as_view(), name="avatar-list-create"),
    path("avatars/<int:pk>/", AvatarDetailView.as_view(), name="avatar-detail"),

    path("manual-analysis/", ManualAnalysisView.as_view(), name="manual-analysis"),

    path("sessions/", ConversationSessionListCreateView.as_view(), name="session-list-create"),
    path("sessions/<int:pk>/", ConversationSessionDetailView.as_view(), name="session-detail"),
    path("sessions/<int:pk>/end/", EndConversationSessionView.as_view(), name="session-end"),

    path("sessions/<int:session_id>/captures/", CaptureRequestListCreateView.as_view(), name="capture-list-create"),
    path("captures/<int:capture_id>/messages/", ExtractedMessageListCreateView.as_view(), name="extracted-message-list-create"),
    path("captures/<int:capture_id>/analysis/", AnalysisResultListCreateView.as_view(), name="analysis-result-list-create"),
]
