from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AIChatMessage, AIChatSession
from .serializers import (
    AIChatMessageSerializer,
    AIChatSessionDetailSerializer,
    AIChatSessionSerializer,
    AIChatSessionUpdateSerializer,
    SendAIChatMessageSerializer,
)
from .services import (
    AIChatReplyGenerationError,
    generate_avatar_reply,
    generate_avatar_reply_for_message,
)


class AIChatSessionListCreateView(generics.ListCreateAPIView):
    serializer_class = AIChatSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AIChatSession.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get("status", AIChatSession.StatusType.ACTIVE)

        if status_filter == "all":
            return queryset.order_by("-updated_at")
        if status_filter in AIChatSession.StatusType.values:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AIChatSessionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AIChatSessionDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AIChatSession.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return AIChatSessionUpdateSerializer
        return AIChatSessionDetailSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response({
            "success": True,
            "data": AIChatSessionDetailSerializer(
                instance,
                context=self.get_serializer_context(),
            ).data,
        }, status=status.HTTP_200_OK)


class ArchiveAIChatSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        chat_session = AIChatSession.objects.filter(
            id=pk,
            user=request.user,
        ).first()

        if not chat_session:
            raise PermissionDenied("해당 AI 채팅에 접근할 수 없습니다.")

        chat_session.status = AIChatSession.StatusType.ARCHIVED
        chat_session.save(update_fields=["status", "updated_at"])

        return Response({
            "success": True,
            "data": AIChatSessionDetailSerializer(
                chat_session,
                context={"request": request},
            ).data,
        }, status=status.HTTP_200_OK)


class SendAIChatMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        chat_session = AIChatSession.objects.filter(
            id=pk,
            user=request.user,
            status=AIChatSession.StatusType.ACTIVE,
        ).first()

        if not chat_session:
            raise PermissionDenied("해당 AI 채팅에 접근할 수 없습니다.")

        serializer = SendAIChatMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user_message, assistant_message = generate_avatar_reply(
                chat_session,
                serializer.validated_data["content"],
            )
        except AIChatReplyGenerationError as exc:
            return Response({
                "success": False,
                "message": "AI 답변 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
                "error": str(exc.original_error),
                "data": {
                    "user_message": AIChatMessageSerializer(exc.user_message).data,
                    "assistant_message": AIChatMessageSerializer(exc.assistant_message).data,
                },
            }, status=status.HTTP_502_BAD_GATEWAY)

        return Response({
            "success": True,
            "data": {
                "user_message": AIChatMessageSerializer(user_message).data,
                "assistant_message": AIChatMessageSerializer(assistant_message).data,
            },
        }, status=status.HTTP_201_CREATED)


class RetryAIChatMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        chat_session = AIChatSession.objects.filter(
            id=pk,
            user=request.user,
            status=AIChatSession.StatusType.ACTIVE,
        ).first()

        if not chat_session:
            raise PermissionDenied("해당 AI 채팅에 접근할 수 없습니다.")

        user_message = chat_session.messages.filter(
            sender_type=AIChatMessage.SenderType.USER,
            status=AIChatMessage.MessageStatus.COMPLETED,
        ).order_by("-created_at", "-id").first()

        if not user_message:
            return Response({
                "success": False,
                "message": "다시 시도할 사용자 메시지가 없습니다.",
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            _, assistant_message = generate_avatar_reply_for_message(
                chat_session,
                user_message,
            )
        except AIChatReplyGenerationError as exc:
            return Response({
                "success": False,
                "message": "AI 답변 재생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
                "error": str(exc.original_error),
                "data": {
                    "user_message": AIChatMessageSerializer(exc.user_message).data,
                    "assistant_message": AIChatMessageSerializer(exc.assistant_message).data,
                },
            }, status=status.HTTP_502_BAD_GATEWAY)

        return Response({
            "success": True,
            "data": {
                "user_message": AIChatMessageSerializer(user_message).data,
                "assistant_message": AIChatMessageSerializer(assistant_message).data,
            },
        }, status=status.HTTP_201_CREATED)
