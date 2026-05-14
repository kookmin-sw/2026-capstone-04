export type NotificationPayload = {
  sender: string;
  message: string;
  raw?: string;
  source: "windows" | "darwin" | "simulated" | "ocr";
  receivedAt: number;
  summary?: string;
  emotion?: string;
  tone?: string;
  riskLevel?: string;
  strategy?: string;
  recommendedReplies?: string[];
};

export type OcrRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrSettings = {
  enabled: boolean;
  intervalMs: number;
  region: OcrRegion;
  incomingOnly: boolean;
};

export type AuthUser = {
  id: number;
  username: string;
  email?: string | null;
};

export type AuthState = {
  isAuthenticated: boolean;
  user: AuthUser | null;
};

export type LoginInput = {
  username: string;
  password: string;
};

export type SignupInput = {
  username: string;
  email?: string;
  password: string;
};

export type SentimentLabel = {
  label: string;
  score: number;
};

export type SentimentResult = {
  labels: SentimentLabel[];
  dominant: string;
  summary: string;
};

export type ReplyTone = "warm" | "witty" | "firm";

export type ReplySuggestion = {
  tone: ReplyTone;
  text: string;
};

export type GenerateRepliesInput = {
  sender: string;
  message: string;
  sentimentSummary: string;
  dominantLabel: string;
};

export type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RealtimeDetectionStartInput = {
  title?: string;
  situationContext?: string;
  analysisGoal?: string;
  avatarId?: number | null;
};

export type AvatarProfile = {
  id: number;
  name: string;
  ageGroup: string;
  currentRelation: string;
  targetRelation: string;
  personality: string;
  speechStyle: string;
  background: string;
  memo: string;
  createdAt: number;
};

export type AvatarCreateInput = {
  name: string;
  ageGroup?: string;
  currentRelation?: string;
  targetRelation?: string;
  personality?: string;
  speechStyle?: string;
  background?: string;
  memo?: string;
};

export type AvatarUpdateInput = AvatarCreateInput;

export type AnalysisHistoryRecord = {
  id: string;
  at: number;
  source: "realtime" | "manual";
  title: string;
  relation: string;
  goalRelation: string;
  situation: string;
  receivedMessage?: string;
  emotion: string;
  context: string;
  suggestions: string[];
  analysisSections?: AnalysisHistorySection[];
};

export type AnalysisHistorySection = {
  id: string;
  at: number;
  emotion: string;
  context: string;
  suggestions: string[];
};

export type ManualAnalysisInput = {
  avatarId: number;
  situationContext: string;
  receivedMessage: string;
};

export type ManualAnalysisResult = {
  emotion: string;
  context: string;
  suggestions: string[];
};

export type UserProfile = {
  name: string;
  email: string;
  birthDate: string;
  privacyConsentAt: string;
};

export type UserProfileUpdateInput = {
  name: string;
  email: string;
  birthDate: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type CoachingChatStatus = "active" | "archived";
export type CoachingChatSenderType = "user" | "assistant";

export type CoachingChatMessage = {
  id: number;
  senderType: CoachingChatSenderType;
  content: string;
  status: string;
  createdAt: number;
};

export type CoachingChatSession = {
  id: number;
  avatarId: number | null;
  avatarName: string;
  title: string;
  situationContext: string;
  status: CoachingChatStatus;
  messages: CoachingChatMessage[];
};

export type CoachingChatCreateInput = {
  avatarId: number;
  title: string;
  situationContext: string;
};

export type CoachingChatUpdateInput = {
  title?: string;
  situationContext?: string;
};

export type RespondyApi = {
  onNotification: (
    callback: (payload: NotificationPayload) => void,
  ) => () => void;
  analyzeSentiment: (text: string) => Promise<SentimentResult>;
  generateReplies: (
    payload: GenerateRepliesInput,
  ) => Promise<ReplySuggestion[]>;
  login: (payload: LoginInput) => Promise<AuthState>;
  signup: (payload: SignupInput) => Promise<AuthState>;
  logout: () => Promise<void>;
  getAuthState: () => Promise<AuthState>;
  startRealtimeDetection: (
    input?: RealtimeDetectionStartInput,
  ) => Promise<void>;
  stopRealtimeDetection: () => Promise<void>;
  getRealtimeDetectionState: () => Promise<{ active: boolean }>;
  pickOcrRegion: () => Promise<OcrRegion | null>;
  submitOcrRegionSelection: (region: OcrRegion) => void;
  cancelOcrRegionSelection: () => void;
  getOcrSettings: () => Promise<OcrSettings>;
  setOcrSettings: (partial: Partial<OcrSettings>) => Promise<void>;
  getDisplayBounds: () => Promise<DisplayBounds>;
  listAvatars: () => Promise<AvatarProfile[]>;
  createAvatar: (payload: AvatarCreateInput) => Promise<AvatarProfile>;
  updateAvatar: (
    avatarId: number,
    payload: AvatarUpdateInput,
  ) => Promise<AvatarProfile>;
  deleteAvatar: (avatarId: number) => Promise<void>;
  listAnalysisHistory: () => Promise<AnalysisHistoryRecord[]>;
  getAnalysisHistoryDetail: (recordId: string) => Promise<AnalysisHistoryRecord>;
  deleteAnalysisHistoryRecord: (recordId: string) => Promise<void>;
  analyzeManualConversation: (
    payload: ManualAnalysisInput,
  ) => Promise<ManualAnalysisResult>;
  listCoachingChats: (
    status?: "active" | "archived" | "all",
  ) => Promise<CoachingChatSession[]>;
  createCoachingChat: (
    payload: CoachingChatCreateInput,
  ) => Promise<CoachingChatSession>;
  getCoachingChatDetail: (chatId: number) => Promise<CoachingChatSession>;
  updateCoachingChat: (
    chatId: number,
    payload: CoachingChatUpdateInput,
  ) => Promise<CoachingChatSession>;
  sendCoachingChatMessage: (
    chatId: number,
    content: string,
  ) => Promise<{
    userMessage: CoachingChatMessage;
    assistantMessage: CoachingChatMessage;
  }>;
  retryCoachingChat: (chatId: number) => Promise<CoachingChatSession>;
  archiveCoachingChat: (chatId: number) => Promise<void>;
  getUserProfile: () => Promise<UserProfile>;
  updateUserProfile: (payload: UserProfileUpdateInput) => Promise<UserProfile>;
  submitPrivacyConsent: () => Promise<void>;
  changePassword: (payload: PasswordChangeInput) => Promise<void>;
};
