from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile"
    )
    name = models.CharField(max_length=150, blank=True)
    birth_date = models.DateField(blank=True, null=True)
    privacy_consent_at = models.DateTimeField(blank=True, null=True)
    privacy_consent_version = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} profile"


class Avatar(models.Model):
    class RelationType(models.TextChoices):
        FRIEND = "friend", "Friend"
        CRUSH = "crush", "Crush"
        PARTNER = "partner", "Partner"
        FAMILY = "family", "Family"
        BOSS = "boss", "Boss"
        COWORKER = "coworker", "Coworker"
        OTHER = "other", "Other"

    class GenderType(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        NON_BINARY = "non_binary", "Non-binary"
        UNKNOWN = "unknown", "Unknown"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="avatars"
    )
    name = models.CharField(max_length=100)
    age_group = models.CharField(max_length=20, blank=True)
    current_relation = models.CharField(max_length=100, blank=True)
    target_relation = models.CharField(max_length=100, blank=True)
    relation_type = models.CharField(
        max_length=20,
        choices=RelationType.choices,
        default=RelationType.OTHER
    )
    age = models.PositiveSmallIntegerField(blank=True, null=True)
    gender = models.CharField(
        max_length=20,
        choices=GenderType.choices,
        default=GenderType.UNKNOWN
    )
    personality = models.TextField(blank=True)
    speech_style = models.TextField(blank=True)
    background = models.TextField(blank=True)
    memo = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "-updated_at"]
        indexes = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["user", "relation_type"]),
            models.Index(fields=["user", "name"]),
            models.Index(fields=["user", "current_relation"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.user})"


class ConversationSession(models.Model):
    class PlatformType(models.TextChoices):
        KAKAO = "kakao", "KakaoTalk"
        INSTAGRAM = "instagram", "Instagram"
        SMS = "sms", "SMS"
        DISCORD = "discord", "Discord"
        WHATSAPP = "whatsapp", "WhatsApp"
        UNKNOWN = "unknown", "Unknown"

    class RelationType(models.TextChoices):
        FRIEND = "friend", "Friend"
        CRUSH = "crush", "Crush"
        PARTNER = "partner", "Partner"
        FAMILY = "family", "Family"
        BOSS = "boss", "Boss"
        COWORKER = "coworker", "Coworker"
        OTHER = "other", "Other"

    class GoalType(models.TextChoices):
        KEEP_GOOD = "keep_good", "Keep Good Relationship"
        BUILD_INTEREST = "build_interest", "Build Interest"
        RESOLVE_CONFLICT = "resolve_conflict", "Resolve Conflict"
        PERSUADE = "persuade", "Persuade"
        DISTANCE = "distance", "Keep Distance"
        GENERAL = "general", "General"

    class StatusType(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversation_sessions"
    )
    avatar = models.ForeignKey(
        Avatar,
        on_delete=models.SET_NULL,
        related_name="conversation_sessions",
        blank=True,
        null=True
    )
    title = models.CharField(max_length=255)
    platform_type = models.CharField(
        max_length=20,
        choices=PlatformType.choices,
        default=PlatformType.UNKNOWN
    )
    contact_name = models.CharField(max_length=100, blank=True)
    conversation_key = models.CharField(max_length=255, blank=True, null=True)

    relation_type = models.CharField(
        max_length=20,
        choices=RelationType.choices,
        default=RelationType.OTHER
    )
    relationship_context = models.TextField(blank=True)
    goal_type = models.CharField(
        max_length=30,
        choices=GoalType.choices,
        default=GoalType.GENERAL
    )
    analysis_goal = models.TextField(blank=True)
    situation_context = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=StatusType.choices,
        default=StatusType.ACTIVE
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "platform_type"]),
            models.Index(fields=["conversation_key"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.user})"


class CaptureRequest(models.Model):
    class SourceType(models.TextChoices):
        ELECTRON = "electron", "Electron"
        WEB = "web", "Web"
        API = "api", "API"
        OTHER = "other", "Other"

    class ProcessingStatus(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        EXTRACTING = "extracting", "Extracting"
        EXTRACTED = "extracted", "Extracted"
        ANALYZING = "analyzing", "Analyzing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    session = models.ForeignKey(
        ConversationSession,
        on_delete=models.CASCADE,
        related_name="captures"
    )
    image_url = models.URLField(max_length=1000, blank=True)
    image_file = models.FileField(upload_to="captures/%Y/%m/%d/", blank=True, null=True)
    image_base64 = models.TextField(blank=True)
    image_hash = models.CharField(max_length=128, blank=True)
    source_type = models.CharField(
        max_length=20,
        choices=SourceType.choices,
        default=SourceType.ELECTRON
    )
    processing_status = models.CharField(
        max_length=20,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.UPLOADED
    )

    detected_at = models.DateTimeField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processing_started_at = models.DateTimeField(blank=True, null=True)
    processing_completed_at = models.DateTimeField(blank=True, null=True)

    error_message = models.TextField(blank=True)
    gemini_extract_raw = models.JSONField(blank=True, null=True)
    gemini_analyze_raw = models.JSONField(blank=True, null=True)

    screen_context = models.JSONField(blank=True, null=True)
    retry_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session", "processing_status"]),
            models.Index(fields=["session", "image_hash"]),
            models.Index(fields=["uploaded_at"]),
            models.Index(fields=["detected_at"]),
        ]

    def __str__(self):
        return f"Capture #{self.id} - {self.session.title}"


class ExtractedMessage(models.Model):
    class SenderType(models.TextChoices):
        USER = "user", "User"
        OTHER = "other", "Other"
        UNKNOWN = "unknown", "Unknown"

    capture_request = models.ForeignKey(
        CaptureRequest,
        on_delete=models.CASCADE,
        related_name="extracted_messages"
    )
    session = models.ForeignKey(
        ConversationSession,
        on_delete=models.CASCADE,
        related_name="extracted_messages"
    )

    sender_type = models.CharField(
        max_length=10,
        choices=SenderType.choices,
        default=SenderType.UNKNOWN
    )
    content = models.TextField()
    message_order = models.PositiveIntegerField()
    confidence_score = models.FloatField(blank=True, null=True)
    raw_metadata = models.JSONField(blank=True, null=True)
    extracted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["message_order", "id"]
        indexes = [
            models.Index(fields=["capture_request", "message_order"]),
            models.Index(fields=["session"]),
        ]

    def __str__(self):
        return f"{self.sender_type}: {self.content[:30]}"


class AnalysisResult(models.Model):
    class EmotionType(models.TextChoices):
        POSITIVE = "positive", "Positive"
        NEUTRAL = "neutral", "Neutral"
        ANNOYED = "annoyed", "Annoyed"
        SAD = "sad", "Sad"
        ANGRY = "angry", "Angry"
        ANXIOUS = "anxious", "Anxious"
        MIXED = "mixed", "Mixed"
        UNKNOWN = "unknown", "Unknown"

    class ToneType(models.TextChoices):
        FRIENDLY = "friendly", "Friendly"
        CASUAL = "casual", "Casual"
        POLITE = "polite", "Polite"
        COLD = "cold", "Cold"
        SENSITIVE = "sensitive", "Sensitive"
        AGGRESSIVE = "aggressive", "Aggressive"
        AWKWARD = "awkward", "Awkward"
        UNKNOWN = "unknown", "Unknown"

    class RiskLevel(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        UNKNOWN = "unknown", "Unknown"

    session = models.ForeignKey(
        ConversationSession,
        on_delete=models.CASCADE,
        related_name="analysis_results"
    )
    capture_request = models.ForeignKey(
        CaptureRequest,
        on_delete=models.CASCADE,
        related_name="analysis_results"
    )

    summary = models.TextField(blank=True)
    emotion = models.CharField(
        max_length=20,
        choices=EmotionType.choices,
        default=EmotionType.UNKNOWN
    )
    tone = models.CharField(
        max_length=20,
        choices=ToneType.choices,
        default=ToneType.UNKNOWN
    )
    risk_level = models.CharField(
        max_length=20,
        choices=RiskLevel.choices,
        default=RiskLevel.UNKNOWN
    )

    strategy = models.TextField(blank=True)
    recommended_replies = models.JSONField(default=list, blank=True)
    caution_points = models.JSONField(default=list, blank=True)
    follow_up_suggestions = models.JSONField(default=list, blank=True)

    model_name = models.CharField(max_length=100, blank=True)
    raw_result = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["capture_request"]),
            models.Index(fields=["risk_level"]),
        ]

    def __str__(self):
        return f"Analysis #{self.id} - {self.session.title}"
