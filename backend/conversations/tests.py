from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    AnalysisResult,
    Avatar,
    CaptureRequest,
    ConversationSession,
    ExtractedMessage,
    UserProfile,
)


User = get_user_model()


class ConversationsAPITests(APITestCase):
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
        self.profile = UserProfile.objects.create(user=self.user, name="사용자")
        UserProfile.objects.create(user=self.other_user, name="다른 사용자")
        self.avatar = Avatar.objects.create(
            user=self.user,
            name="민지",
            age_group="20대",
            current_relation="선후배",
            target_relation="친한 친구",
            personality="조용하지만 배려심이 많음",
            speech_style="짧고 부드럽게 말함",
            background="같은 동아리에서 만남",
            memo="답장이 느린 편",
        )
        self.other_avatar = Avatar.objects.create(
            user=self.other_user,
            name="다른 사람",
        )

    def authenticate(self):
        self.client.force_authenticate(user=self.user)

    def consent(self):
        self.profile.privacy_consent_at = timezone.now()
        self.profile.privacy_consent_version = "test"
        self.profile.save(update_fields=[
            "privacy_consent_at",
            "privacy_consent_version",
            "updated_at",
        ])

    def mock_analysis_response(self):
        return {
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": """
{
  "messages": [
    {
      "sender_type": "other",
      "content": "그래",
      "message_order": 1,
      "confidence_score": 0.95
    }
  ],
  "analysis": {
    "summary": "짧고 중립적인 답장입니다.",
    "emotion": "neutral",
    "tone": "casual",
    "risk_level": "low",
    "strategy": "부담 없이 대화를 이어갑니다.",
    "recommended_replies": ["좋아~", "그럼 그때 보자!", "오케이 편하게 보자"],
    "caution_points": [],
    "follow_up_suggestions": []
  }
}
""",
                    }],
                },
            }],
        }

    def test_signup_creates_user_profile_and_tokens(self):
        response = self.client.post("/api/auth/signup/", {
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        user = User.objects.get(username="newuser")
        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

    def test_login_returns_tokens(self):
        response = self.client.post("/api/auth/login/", {
            "username": "user",
            "password": "password123",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

    def test_profile_update_changes_user_and_profile_fields(self):
        self.authenticate()

        response = self.client.patch("/api/auth/profile/", {
            "name": "홍길동",
            "email": "hong@example.com",
            "birth_date": "2001-01-01",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.user.email, "hong@example.com")
        self.assertEqual(self.profile.name, "홍길동")
        self.assertEqual(str(self.profile.birth_date), "2001-01-01")

    def test_privacy_consent_saves_timestamp_and_version(self):
        self.authenticate()

        response = self.client.post("/api/auth/privacy-consent/", {
            "agreed": True,
            "version": "2026-05-13",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertIsNotNone(self.profile.privacy_consent_at)
        self.assertEqual(self.profile.privacy_consent_version, "2026-05-13")

    def test_avatar_list_only_returns_current_users_avatars(self):
        self.authenticate()

        response = self.client.get("/api/avatars/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.avatar.id)

    def test_create_avatar_assigns_current_user(self):
        self.authenticate()

        response = self.client.post("/api/avatars/", {
            "name": "수현",
            "age_group": "20대",
            "current_relation": "친구",
            "target_relation": "친한 친구",
            "personality": "활발함",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        avatar = Avatar.objects.get(id=response.data["id"])
        self.assertEqual(avatar.user, self.user)

    def test_manual_analysis_requires_privacy_consent(self):
        self.authenticate()

        response = self.client.post("/api/manual-analysis/", {
            "avatar_id": self.avatar.id,
            "received_message": "그래",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "privacy_consent_required")

    @patch("conversations.services._call_gemini")
    def test_manual_analysis_creates_session_capture_message_and_result(self, mock_call_gemini):
        self.authenticate()
        self.consent()
        mock_call_gemini.return_value = self.mock_analysis_response()

        response = self.client.post("/api/manual-analysis/", {
            "avatar_id": self.avatar.id,
            "title": "민지와 수동 입력",
            "platform_type": "kakao",
            "goal_type": "general",
            "situation_context": "약속을 잡는 상황",
            "analysis_goal": "부담스럽지 않게 답장",
            "received_message": "그래",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(ConversationSession.objects.count(), 1)
        self.assertEqual(CaptureRequest.objects.count(), 1)
        self.assertEqual(ExtractedMessage.objects.count(), 1)
        self.assertEqual(AnalysisResult.objects.count(), 1)
        capture = CaptureRequest.objects.get()
        self.assertEqual(capture.source_type, CaptureRequest.SourceType.API)
        self.assertEqual(capture.processing_status, CaptureRequest.ProcessingStatus.COMPLETED)

    def test_capture_analysis_requires_privacy_consent(self):
        self.authenticate()
        session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="실시간 분석",
        )

        response = self.client.post(f"/api/sessions/{session.id}/captures/", {
            "image_base64": "data:image/png;base64,AAAA",
            "source_type": "electron",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "privacy_consent_required")

    @patch("conversations.services._call_gemini")
    def test_capture_analysis_creates_hash_and_clears_image_base64(self, mock_call_gemini):
        self.authenticate()
        self.consent()
        mock_call_gemini.return_value = self.mock_analysis_response()
        session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="실시간 분석",
        )

        response = self.client.post(f"/api/sessions/{session.id}/captures/", {
            "image_base64": "data:image/png;base64,AAAA",
            "source_type": "electron",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["duplicate"])
        capture = CaptureRequest.objects.get()
        self.assertTrue(capture.image_hash)
        self.assertEqual(capture.image_base64, "")
        self.assertEqual(capture.processing_status, CaptureRequest.ProcessingStatus.COMPLETED)

    @patch("conversations.services._call_gemini")
    def test_duplicate_capture_returns_existing_result_without_new_gemini_call(self, mock_call_gemini):
        self.authenticate()
        self.consent()
        mock_call_gemini.return_value = self.mock_analysis_response()
        session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="실시간 분석",
        )

        first_response = self.client.post(f"/api/sessions/{session.id}/captures/", {
            "image_base64": "data:image/png;base64,AAAA",
            "source_type": "electron",
        }, format="json")
        second_response = self.client.post(f"/api/sessions/{session.id}/captures/", {
            "image_base64": "data:image/png;base64,AAAA",
            "source_type": "electron",
        }, format="json")

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertTrue(second_response.data["duplicate"])
        self.assertEqual(CaptureRequest.objects.count(), 1)
        self.assertEqual(mock_call_gemini.call_count, 1)

    def test_end_session_archives_session(self):
        self.authenticate()
        session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="실시간 분석",
        )

        response = self.client.post(f"/api/sessions/{session.id}/end/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.status, ConversationSession.StatusType.ARCHIVED)
        self.assertEqual(response.data["data"]["status"], ConversationSession.StatusType.ARCHIVED)

    def test_ended_session_rejects_new_captures(self):
        self.authenticate()
        self.consent()
        session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="실시간 분석",
            status=ConversationSession.StatusType.ARCHIVED,
        )

        response = self.client.post(f"/api/sessions/{session.id}/captures/", {
            "image_base64": "data:image/png;base64,AAAA",
            "source_type": "electron",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "session_ended")

    def test_session_list_only_returns_current_users_sessions(self):
        self.authenticate()
        own_session = ConversationSession.objects.create(
            user=self.user,
            avatar=self.avatar,
            title="내 분석",
        )
        ConversationSession.objects.create(
            user=self.other_user,
            avatar=self.other_avatar,
            title="다른 사용자 분석",
        )

        response = self.client.get("/api/sessions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_session.id)

    def test_other_users_session_detail_is_forbidden(self):
        self.authenticate()
        other_session = ConversationSession.objects.create(
            user=self.other_user,
            avatar=self.other_avatar,
            title="다른 사용자 분석",
        )

        response = self.client.get(f"/api/sessions/{other_session.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
