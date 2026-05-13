from django.http import JsonResponse
from django.contrib.auth import authenticate, get_user_model
from django.db.models import OuterRef, Q, Subquery

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from .models import (
    UserProfile,
    Avatar,
    ConversationSession,
    CaptureRequest,
    ExtractedMessage,
    AnalysisResult,
)
from .serializers import (
    AvatarSerializer,
    SignupSerializer,
    UserSerializer,
    PasswordChangeSerializer,
    UserProfileSerializer,
    PrivacyConsentSerializer,
    ConversationSessionSerializer,
    ConversationSessionDetailSerializer,
    CaptureRequestSerializer,
    ExtractedMessageSerializer,
    AnalysisResultSerializer,
    ManualAnalysisRequestSerializer,
    get_tokens_for_user,
)
from .services import (
    NoNewOtherMessage,
    NoAnalyzableMessage,
    analyze_capture,
    analyze_manual_message,
    build_capture_image_hash,
)

User = get_user_model()

CAPTURE_SKIP_CODES = {
    NoAnalyzableMessage.code,
    NoNewOtherMessage.code,
}


def has_privacy_consent(user):
    try:
        return bool(user.profile.privacy_consent_at)
    except UserProfile.DoesNotExist:
        return False


def privacy_consent_required_response():
    return Response({
        "success": False,
        "message": "privacy consent is required before AI analysis.",
        "code": "privacy_consent_required",
    }, status=status.HTTP_403_FORBIDDEN)


def health_check(request):
    return JsonResponse({
        "success": True,
        "message": "server is running"
    })


def db_check(request):
    user_count = User.objects.count()
    return JsonResponse({
        "success": True,
        "message": "database connection is working",
        "user_count": user_count
    })


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            tokens = get_tokens_for_user(user)

            return Response({
                "success": True,
                "message": "signup successful",
                "data": {
                    "user": UserSerializer(user).data,
                    "access": tokens["access"],
                    "refresh": tokens["refresh"],
                }
            }, status=status.HTTP_201_CREATED)

        return Response({
            "success": False,
            "message": "signup failed",
            "errors": serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(request, username=username, password=password)
        if user is not None:
            tokens = get_tokens_for_user(user)

            return Response({
                "success": True,
                "message": "login successful",
                "data": {
                    "user": UserSerializer(user).data,
                    "access": tokens["access"],
                    "refresh": tokens["refresh"],
                }
            }, status=status.HTTP_200_OK)

        return Response({
            "success": False,
            "message": "invalid username or password"
        }, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({
            "success": True,
            "message": "logout successful"
        }, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "success": True,
            "data": UserSerializer(request.user).data
        }, status=status.HTTP_200_OK)


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "success": True,
            "data": UserProfileSerializer(request.user).data
        }, status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = UserProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "success": True,
            "message": "profile updated successfully",
            "data": serializer.data
        }, status=status.HTTP_200_OK)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "success": True,
            "message": "password changed successfully"
        }, status=status.HTTP_200_OK)


class PrivacyConsentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PrivacyConsentSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "success": True,
            "message": "privacy consent saved successfully",
            "data": UserProfileSerializer(request.user).data,
        }, status=status.HTTP_200_OK)


class AvatarListCreateView(generics.ListCreateAPIView):
    serializer_class = AvatarSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Avatar.objects.filter(user=self.request.user).order_by("name", "-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AvatarDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AvatarSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Avatar.objects.filter(user=self.request.user)


class ConversationSessionListCreateView(generics.ListCreateAPIView):
    serializer_class = ConversationSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        latest_capture = CaptureRequest.objects.filter(
            session=OuterRef("pk")
        ).order_by("-created_at")
        latest_analysis = AnalysisResult.objects.filter(
            session=OuterRef("pk")
        ).order_by("-created_at")

        return (
            ConversationSession.objects
            .filter(user=self.request.user)
            .filter(analysis_results__isnull=False)
            .select_related("avatar")
            .annotate(
                latest_capture_source_type=Subquery(latest_capture.values("source_type")[:1]),
                latest_capture_status_value=Subquery(latest_capture.values("processing_status")[:1]),
                latest_analysis_summary=Subquery(latest_analysis.values("summary")[:1]),
                latest_analysis_emotion=Subquery(latest_analysis.values("emotion")[:1]),
                latest_analysis_tone=Subquery(latest_analysis.values("tone")[:1]),
                latest_analysis_risk_level=Subquery(latest_analysis.values("risk_level")[:1]),
            )
            .distinct()
            .order_by("-updated_at")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ConversationSessionDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ConversationSessionDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ConversationSession.objects.filter(user=self.request.user)


class EndConversationSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = ConversationSession.objects.filter(
            id=pk,
            user=request.user,
        ).first()

        if not session:
            raise PermissionDenied("해당 세션에 접근할 수 없습니다.")

        session.status = ConversationSession.StatusType.ARCHIVED
        session.save(update_fields=["status", "updated_at"])

        return Response({
            "success": True,
            "message": "session ended successfully",
            "data": ConversationSessionDetailSerializer(
                session,
                context={"request": request},
            ).data,
        }, status=status.HTTP_200_OK)


class ManualAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not has_privacy_consent(request.user):
            return privacy_consent_required_response()

        serializer = ManualAnalysisRequestSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        avatar = data["avatar"]
        title = data.get("title") or f"{avatar.name} 수동 입력 분석"

        session = ConversationSession.objects.create(
            user=request.user,
            avatar=avatar,
            title=title,
            platform_type=data.get("platform_type", ConversationSession.PlatformType.UNKNOWN),
            goal_type=data.get("goal_type", ConversationSession.GoalType.GENERAL),
            situation_context=data.get("situation_context", ""),
            analysis_goal=data.get("analysis_goal", ""),
        )

        try:
            capture, message, analysis = analyze_manual_message(
                session,
                data["received_message"],
            )
        except Exception:
            capture = session.captures.order_by("-created_at").first()
            return Response({
                "success": False,
                "data": {
                    "session": ConversationSessionSerializer(session, context={"request": request}).data,
                    "capture": CaptureRequestSerializer(capture, context={"request": request}).data if capture else None,
                },
            }, status=status.HTTP_201_CREATED)

        return Response({
            "success": True,
            "data": {
                "session": ConversationSessionSerializer(session, context={"request": request}).data,
                "capture": CaptureRequestSerializer(capture, context={"request": request}).data,
                "received_message": ExtractedMessageSerializer(message, context={"request": request}).data,
                "analysis": AnalysisResultSerializer(analysis, context={"request": request}).data,
            },
        }, status=status.HTTP_201_CREATED)


class CaptureRequestListCreateView(generics.ListCreateAPIView):
    serializer_class = CaptureRequestSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_session(self):
        session_id = self.kwargs["session_id"]
        session = ConversationSession.objects.filter(
            id=session_id,
            user=self.request.user
        ).first()

        if not session:
            raise PermissionDenied("해당 세션에 접근할 수 없습니다.")

        return session

    def get_queryset(self):
        session = self.get_session()
        return CaptureRequest.objects.filter(session=session).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(session=self.get_session())

    def get_capture_response_data(self, capture):
        data = CaptureRequestSerializer(capture, context=self.get_serializer_context()).data
        data["messages"] = ExtractedMessageSerializer(
            capture.extracted_messages.all(),
            many=True,
            context=self.get_serializer_context(),
        ).data
        data["analysis_results"] = AnalysisResultSerializer(
            capture.analysis_results.all(),
            many=True,
            context=self.get_serializer_context(),
        ).data
        return data

    def create(self, request, *args, **kwargs):
        if not has_privacy_consent(request.user):
            return privacy_consent_required_response()

        session = self.get_session()
        if session.status != ConversationSession.StatusType.ACTIVE:
            return Response({
                "success": False,
                "message": "session is already ended.",
                "code": "session_ended",
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        image_hash = build_capture_image_hash(serializer.validated_data)
        if image_hash:
            duplicate_capture = CaptureRequest.objects.filter(
                session=session,
                image_hash=image_hash,
            ).filter(
                Q(processing_status=CaptureRequest.ProcessingStatus.COMPLETED)
                | Q(
                    processing_status=CaptureRequest.ProcessingStatus.FAILED,
                    error_message__in=CAPTURE_SKIP_CODES,
                )
            ).order_by("-created_at").first()
            if duplicate_capture:
                skipped = duplicate_capture.error_message in CAPTURE_SKIP_CODES
                return Response({
                    "success": True,
                    "duplicate": True,
                    "skipped": skipped,
                    "code": duplicate_capture.error_message if skipped else "",
                    "message": "capture skipped" if skipped else "same capture skipped",
                    "data": self.get_capture_response_data(duplicate_capture),
                }, status=status.HTTP_200_OK)

        serializer.save(session=session, image_hash=image_hash)
        capture = serializer.instance

        try:
            analyze_capture(capture)
        except (NoAnalyzableMessage, NoNewOtherMessage) as exc:
            return Response({
                "success": True,
                "duplicate": False,
                "skipped": True,
                "code": exc.code,
                "message": "capture skipped",
                "data": self.get_capture_response_data(capture),
            }, status=status.HTTP_200_OK)
        except Exception:
            pass

        return Response({
            "success": capture.processing_status == CaptureRequest.ProcessingStatus.COMPLETED,
            "duplicate": False,
            "skipped": False,
            "message": "capture analyzed successfully"
            if capture.processing_status == CaptureRequest.ProcessingStatus.COMPLETED
            else "capture analysis failed",
            "data": self.get_capture_response_data(capture),
        }, status=status.HTTP_201_CREATED)


class ExtractedMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ExtractedMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        capture_id = self.kwargs["capture_id"]
        capture = CaptureRequest.objects.filter(
            id=capture_id,
            session__user=self.request.user
        ).first()

        if not capture:
            raise PermissionDenied("해당 캡처에 접근할 수 없습니다.")

        return ExtractedMessage.objects.filter(capture_request=capture).order_by("message_order", "id")

    def perform_create(self, serializer):
        capture_id = self.kwargs["capture_id"]
        capture = CaptureRequest.objects.filter(
            id=capture_id,
            session__user=self.request.user
        ).first()

        if not capture:
            raise PermissionDenied("해당 캡처에 접근할 수 없습니다.")

        serializer.save(
            session=capture.session,
            capture_request=capture
        )


class AnalysisResultListCreateView(generics.ListCreateAPIView):
    serializer_class = AnalysisResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        capture_id = self.kwargs["capture_id"]
        capture = CaptureRequest.objects.filter(
            id=capture_id,
            session__user=self.request.user
        ).first()

        if not capture:
            raise PermissionDenied("해당 캡처에 접근할 수 없습니다.")

        return AnalysisResult.objects.filter(capture_request=capture).order_by("-created_at")

    def perform_create(self, serializer):
        capture_id = self.kwargs["capture_id"]
        capture = CaptureRequest.objects.filter(
            id=capture_id,
            session__user=self.request.user
        ).first()

        if not capture:
            raise PermissionDenied("해당 캡처에 접근할 수 없습니다.")

        serializer.save(
            session=capture.session,
            capture_request=capture
        )   
