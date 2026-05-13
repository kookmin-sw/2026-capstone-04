from rest_framework import serializers

from conversations.models import Avatar
from conversations.serializers import AvatarSerializer

from .models import AIChatMessage, AIChatSession


class AIChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIChatMessage
        fields = [
            "id",
            "chat_session",
            "sender_type",
            "content",
            "status",
            "error_message",
            "raw_response",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "chat_session",
            "sender_type",
            "status",
            "error_message",
            "raw_response",
            "created_at",
        ]


class AIChatSessionSerializer(serializers.ModelSerializer):
    avatar = AvatarSerializer(read_only=True)
    avatar_id = serializers.PrimaryKeyRelatedField(
        source="avatar",
        queryset=Avatar.objects.none(),
        write_only=True,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            self.fields["avatar_id"].queryset = Avatar.objects.filter(user=request.user)

    class Meta:
        model = AIChatSession
        fields = [
            "id",
            "avatar",
            "avatar_id",
            "title",
            "situation_context",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]


class AIChatSessionDetailSerializer(AIChatSessionSerializer):
    messages = AIChatMessageSerializer(many=True, read_only=True)

    class Meta(AIChatSessionSerializer.Meta):
        fields = AIChatSessionSerializer.Meta.fields + ["messages"]


class AIChatSessionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIChatSession
        fields = [
            "title",
            "situation_context",
        ]


class SendAIChatMessageSerializer(serializers.Serializer):
    content = serializers.CharField(trim_whitespace=True)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("메시지를 입력해주세요.")
        return value
