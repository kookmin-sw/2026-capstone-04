import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  AvatarCreateInput,
  AvatarUpdateInput,
  DisplayBounds,
  ManualAnalysisInput,
  PasswordChangeInput,
  NotificationPayload,
  OcrRegion,
  OcrSettings,
  RealtimeDetectionStartInput,
  RespondyApi,
  SentimentResult,
  UserProfileUpdateInput,
} from "../shared/respondy-types";

const respondy: RespondyApi = {
  onNotification(callback: (payload: NotificationPayload) => void) {
    const subscription = (
      _event: IpcRendererEvent,
      payload: NotificationPayload,
    ) => callback(payload);
    ipcRenderer.on("notification-detected", subscription);
    return () => {
      ipcRenderer.removeListener("notification-detected", subscription);
    };
  },
  analyzeSentiment(text: string): Promise<SentimentResult> {
    return ipcRenderer.invoke("analyze-sentiment", text);
  },
  generateReplies(payload) {
    return ipcRenderer.invoke("generate-replies", payload);
  },
  login(payload) {
    return ipcRenderer.invoke("auth:login", payload);
  },
  signup(payload) {
    return ipcRenderer.invoke("auth:signup", payload);
  },
  logout() {
    return ipcRenderer.invoke("auth:logout");
  },
  getAuthState() {
    return ipcRenderer.invoke("auth:get-state");
  },
  startRealtimeDetection(input?: RealtimeDetectionStartInput): Promise<void> {
    return ipcRenderer.invoke("ocr:start", input);
  },
  stopRealtimeDetection(): Promise<void> {
    return ipcRenderer.invoke("ocr:stop");
  },
  getRealtimeDetectionState(): Promise<{ active: boolean }> {
    return ipcRenderer.invoke("ocr:get-runtime-state");
  },
  pickOcrRegion(): Promise<OcrRegion | null> {
    return ipcRenderer.invoke("ocr:pick-region");
  },
  submitOcrRegionSelection(region: OcrRegion) {
    ipcRenderer.send("ocr:picker-submit", region);
  },
  cancelOcrRegionSelection() {
    ipcRenderer.send("ocr:picker-cancel");
  },
  getOcrSettings(): Promise<OcrSettings> {
    return ipcRenderer.invoke("ocr:get-settings");
  },
  setOcrSettings(partial: Partial<OcrSettings>): Promise<void> {
    return ipcRenderer.invoke("ocr:set-settings", partial);
  },
  getDisplayBounds(): Promise<DisplayBounds> {
    return ipcRenderer.invoke("ocr:get-display-bounds");
  },
  listAvatars() {
    return ipcRenderer.invoke("avatar:list");
  },
  createAvatar(payload: AvatarCreateInput) {
    return ipcRenderer.invoke("avatar:create", payload);
  },
  updateAvatar(avatarId: number, payload: AvatarUpdateInput) {
    return ipcRenderer.invoke("avatar:update", avatarId, payload);
  },
  deleteAvatar(avatarId: number) {
    return ipcRenderer.invoke("avatar:delete", avatarId);
  },
  listAnalysisHistory() {
    return ipcRenderer.invoke("analysis:history:list");
  },
  getAnalysisHistoryDetail(recordId: string) {
    return ipcRenderer.invoke("analysis:history:detail", recordId);
  },
  deleteAnalysisHistoryRecord(recordId: string) {
    return ipcRenderer.invoke("analysis:history:delete", recordId);
  },
  analyzeManualConversation(payload: ManualAnalysisInput) {
    return ipcRenderer.invoke("analysis:manual", payload);
  },
  getUserProfile() {
    return ipcRenderer.invoke("profile:get");
  },
  updateUserProfile(payload: UserProfileUpdateInput) {
    return ipcRenderer.invoke("profile:update", payload);
  },
  submitPrivacyConsent() {
    return ipcRenderer.invoke("privacy:consent");
  },
  changePassword(payload: PasswordChangeInput) {
    return ipcRenderer.invoke("password:change", payload);
  },
};

contextBridge.exposeInMainWorld("respondy", respondy);

const legacyIpc = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

contextBridge.exposeInMainWorld("ipc", legacyIpc);

export type { RespondyApi };
export type IpcHandler = typeof legacyIpc;
