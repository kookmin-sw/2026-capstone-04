"use client";

import { useEffect, useRef, useState } from "react";
import { getRespondy } from "../lib/respondy-client";
import type {
  AnalysisHistorySection,
  AuthState,
  AvatarProfile as BackendAvatarProfile,
  NotificationPayload,
} from "../../shared/respondy-types";

type AuthView = "login" | "signup";
type AppView = "home" | "realtime" | "manual" | "chat" | "mypage" | "help";
type NavView = Exclude<AppView, "help">;
type ChatStep = "select" | "conversation";
type ChatRole = "user" | "assistant";
type ChatBubble = { id: string; role: ChatRole; text: string; at: number };

type AnalysisSource = "realtime" | "manual";
type PersonProfile = {
  id: string;
  name: string;
  birthDate: string;
  currentRelation: string;
  goalRelation: string;
  personality: string;
  speechStyle: string;
  background: string;
  notes: string;
  createdAt: number;
};

type AnalysisRecord = {
  id: string;
  at: number;
  source: AnalysisSource;
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

const navItems: { key: NavView; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "realtime", label: "실시간 분석" },
  { key: "manual", label: "수동 입력" },
  { key: "chat", label: "AI챗" },
  { key: "mypage", label: "마이페이지" },
];

const homeFeatures: {
  key: Exclude<NavView, "home">;
  title: string;
  description: string;
  tag: string;
}[] = [
  {
    key: "realtime",
    title: "실시간 분석",
    description:
      "카카오톡 대화 화면을 감지해 새 메시지마다 감정·맥락을 분석하고 답장을 추천합니다.",
    tag: "실시간",
  },
  {
    key: "manual",
    title: "수동 입력",
    description:
      "상황과 받은 메시지를 직접 입력해 분석 결과와 추천 답장을 바로 확인합니다.",
    tag: "직접 입력",
  },
  {
    key: "chat",
    title: "AI챗",
    description:
      "인물의 성격·말투를 반영한 AI와 대화하며 표현을 연습할 수 있습니다.",
    tag: "연습",
  },
  {
    key: "mypage",
    title: "마이페이지",
    description: "분석 기록과 대화 상대 인물 정보를 저장·관리합니다.",
    tag: "기록",
  },
];

const AGE_GROUP_OPTIONS = [
  "10대",
  "20대",
  "30대",
  "40대",
  "50대",
  "60대 이상",
] as const;

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password))
    return "비밀번호에 영문자를 최소 1자 포함해 주세요.";
  if (!/\d/.test(password)) return "비밀번호에 숫자를 최소 1자 포함해 주세요.";
  return null;
}

function formatChatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toPersonProfile(avatar: BackendAvatarProfile): PersonProfile {
  return {
    id: String(avatar.id),
    name: avatar.name,
    birthDate: avatar.ageGroup,
    currentRelation: avatar.currentRelation,
    goalRelation: avatar.targetRelation,
    personality: avatar.personality,
    speechStyle: avatar.speechStyle,
    background: avatar.background,
    notes: avatar.memo,
    createdAt: avatar.createdAt,
  };
}

const EMPTY_REALTIME_RESULT = {
  emotion: "",
  context: "",
  suggestions: [] as string[],
};

const EMPTY_MANUAL_RESULT = {
  emotion: "",
  context: "",
  suggestions: [] as string[],
};

export default function HomePage() {
  const [authView, setAuthView] = useState<AuthView>("login");
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState("ABC");
  const [profileEmail, setProfileEmail] = useState("abc@kookmin.ac.kr");
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [privacyConsentAt, setPrivacyConsentAt] = useState("");
  const [privacyConsentLoaded, setPrivacyConsentLoaded] = useState(false);
  const [showPrivacyConsentModal, setShowPrivacyConsentModal] = useState(false);
  const [privacyConsentChecked, setPrivacyConsentChecked] = useState(false);
  const [privacyConsentBusy, setPrivacyConsentBusy] = useState(false);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileEmail, setEditProfileEmail] = useState("");
  const [editProfileBirthDate, setEditProfileBirthDate] = useState("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [selectedView, setSelectedView] = useState<AppView>("home");
  const [selectedChatPerson, setSelectedChatPerson] = useState("");
  const [chatStep, setChatStep] = useState<ChatStep>("select");
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [realtimeReceivedMessage, setRealtimeReceivedMessage] = useState("");
  const [personProfiles, setPersonProfiles] = useState<PersonProfile[]>([]);
  const [selectedRealtimePerson, setSelectedRealtimePerson] = useState("");
  const [showPersonCreateModal, setShowPersonCreateModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonBirthDate, setNewPersonBirthDate] = useState("");
  const [newPersonCurrentRelation, setNewPersonCurrentRelation] = useState("");
  const [newPersonGoalRelation, setNewPersonGoalRelation] = useState("");
  const [newPersonPersonality, setNewPersonPersonality] = useState("");
  const [newPersonSpeechStyle, setNewPersonSpeechStyle] = useState("");
  const [newPersonBackground, setNewPersonBackground] = useState("");
  const [newPersonNotes, setNewPersonNotes] = useState("");
  const [selectedManualPerson, setSelectedManualPerson] = useState("");
  const [manualSituation, setManualSituation] = useState("");
  const [manualReceivedMessage, setManualReceivedMessage] = useState("");
  const [showRealtimeResults, setShowRealtimeResults] = useState(false);
  const [showManualResults, setShowManualResults] = useState(false);
  const [isRealtimeMonitoring, setIsRealtimeMonitoring] = useState(false);
  const [isPickingRegion, setIsPickingRegion] = useState(false);
  const [hasPickedRealtimeRegion, setHasPickedRealtimeRegion] = useState(false);
  const [realtimeResult, setRealtimeResult] = useState(EMPTY_REALTIME_RESULT);
  const [manualResult, setManualResult] = useState(EMPTY_MANUAL_RESULT);
  const [isManualAnalyzing, setIsManualAnalyzing] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);
  const [historyDetailRecord, setHistoryDetailRecord] =
    useState<AnalysisRecord | null>(null);
  const [personDetailId, setPersonDetailId] = useState<string | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [editPersonBirthDate, setEditPersonBirthDate] = useState("");
  const [editPersonCurrentRelation, setEditPersonCurrentRelation] =
    useState("");
  const [editPersonGoalRelation, setEditPersonGoalRelation] = useState("");
  const [editPersonPersonality, setEditPersonPersonality] = useState("");
  const [editPersonSpeechStyle, setEditPersonSpeechStyle] = useState("");
  const [editPersonBackground, setEditPersonBackground] = useState("");
  const [editPersonNotes, setEditPersonNotes] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const [copiedSuggestionId, setCopiedSuggestionId] = useState<string | null>(
    null,
  );
  const realtimeSituationRef = useRef("");

  const copySuggestion = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSuggestionId(id);
      window.setTimeout(() => setCopiedSuggestionId(null), 1500);
    } catch {
      window.alert(
        "클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.",
      );
    }
  };

  useEffect(() => {
    if (selectedView !== "chat") {
      setChatStep("select");
      setActiveChatId(null);
      setChatMessages([]);
      setChatDraft("");
      setChatTyping(false);
    }
  }, [selectedView]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chatMessages, chatTyping, chatStep]);

  useEffect(() => {
    if (selectedView !== "realtime") {
      setShowRealtimeResults(false);
      void stopRealtimeDetection();
    }
  }, [selectedView]);

  useEffect(() => {
    const respondy = getRespondy();
    if (!respondy) return;
    return respondy.onNotification((payload: NotificationPayload) => {
      if (payload.source !== "ocr") return;

      const emotion = payload.summary?.trim() || payload.emotion?.trim() || "";
      const context = payload.strategy?.trim() || payload.tone?.trim() || "";
      const suggestions =
        payload.recommendedReplies?.filter((item) => item.trim()) ?? [];
      const hasMessage = Boolean(payload.message?.trim());
      if (!emotion && !context && suggestions.length === 0 && !hasMessage) {
        return;
      }

      setRealtimeResult({
        emotion,
        context,
        suggestions,
      });
      setShowRealtimeResults(true);
    });
  }, []);

  useEffect(() => {
    realtimeSituationRef.current = realtimeReceivedMessage;
  }, [realtimeReceivedMessage]);

  useEffect(() => {
    if (selectedView !== "manual") setShowManualResults(false);
  }, [selectedView]);

  useEffect(() => {
    const respondy = getRespondy();
    if (!respondy) return;
    void respondy
      .getRealtimeDetectionState()
      .then((state) => setIsRealtimeMonitoring(Boolean(state?.active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      void getRespondy()?.stopRealtimeDetection();
    };
  }, []);

  useEffect(() => {
    const respondy = getRespondy();
    if (!respondy) {
      setAuthReady(true);
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    void respondy
      .getAuthState()
      .then((state) => {
        applyAuthState(state);
      })
      .catch((e) => {
        setAuthError(
          e instanceof Error ? e.message : "인증 상태를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        setAuthBusy(false);
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      setPersonProfiles([]);
      setAnalysisHistory([]);
      setPrivacyConsentAt("");
      setPrivacyConsentLoaded(false);
      setShowPrivacyConsentModal(false);
      setPrivacyConsentChecked(false);
      setHasPickedRealtimeRegion(false);
      return;
    }
    setHasPickedRealtimeRegion(false);
    setPrivacyConsentLoaded(false);
    void loadUserProfile();
    void loadPersonProfiles();
    void loadAnalysisHistory();
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) {
      setShowPrivacyConsentModal(false);
      setPrivacyConsentChecked(false);
      return;
    }
    const needsConsent =
      privacyConsentLoaded &&
      (selectedView === "realtime" || selectedView === "manual") &&
      !privacyConsentAt;
    setShowPrivacyConsentModal(needsConsent);
    if (!needsConsent) {
      setPrivacyConsentChecked(false);
    }
  }, [loggedIn, privacyConsentAt, privacyConsentLoaded, selectedView]);

  useEffect(() => {
    setHistoryDetailId(null);
    setPersonDetailId(null);
  }, [selectedView]);

  useEffect(() => {
    if (!historyDetailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryDetailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDetailId]);

  useEffect(() => {
    if (!historyDetailId) {
      setHistoryDetailRecord(null);
      return;
    }
    const respondy = getRespondy();
    if (!respondy) return;
    let cancelled = false;
    void respondy
      .getAnalysisHistoryDetail(historyDetailId)
      .then((detail) => {
        if (cancelled) return;
        setHistoryDetailRecord(detail);
        setAnalysisHistory((prev) =>
          prev.map((item) => (item.id === detail.id ? detail : item)),
        );
      })
      .catch(() => {
        if (!cancelled) setHistoryDetailRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [historyDetailId]);

  function applyAuthState(state: AuthState) {
    if (state.isAuthenticated && state.user) {
      setLoggedIn(true);
      if (state.user.username?.trim()) {
        setUserName(state.user.username.trim());
      }
      if (state.user.email?.trim()) {
        setProfileEmail(state.user.email.trim());
      }
      return;
    }
    setLoggedIn(false);
  }

  const resetSessionUi = () => {
    setRealtimeReceivedMessage("");
    setPrivacyConsentAt("");
    setPrivacyConsentLoaded(false);
    setShowPrivacyConsentModal(false);
    setPrivacyConsentChecked(false);
    setPersonProfiles([]);
    setSelectedRealtimePerson("");
    setSelectedChatPerson("");
    setShowPersonCreateModal(false);
    setNewPersonName("");
    setNewPersonBirthDate("");
    setNewPersonCurrentRelation("");
    setNewPersonGoalRelation("");
    setNewPersonPersonality("");
    setNewPersonSpeechStyle("");
    setNewPersonBackground("");
    setNewPersonNotes("");
    setShowRealtimeResults(false);
    setRealtimeResult(EMPTY_REALTIME_RESULT);
    setIsRealtimeMonitoring(false);
    setHasPickedRealtimeRegion(false);
    setSelectedManualPerson("");
    setManualSituation("");
    setManualReceivedMessage("");
    setShowManualResults(false);
    setManualResult(EMPTY_MANUAL_RESULT);
    setSelectedView("home");
  };

  const loadPersonProfiles = async () => {
    const respondy = getRespondy();
    if (!respondy) return;
    try {
      const avatars = await respondy.listAvatars();
      const profiles = avatars.map(toPersonProfile);
      setPersonProfiles(profiles);
      if (
        selectedRealtimePerson &&
        !profiles.some((person) => person.name === selectedRealtimePerson)
      ) {
        setSelectedRealtimePerson("");
      }
      if (
        selectedManualPerson &&
        !profiles.some((person) => person.name === selectedManualPerson)
      ) {
        setSelectedManualPerson("");
      }
      if (
        selectedChatPerson &&
        !profiles.some((person) => person.name === selectedChatPerson)
      ) {
        setSelectedChatPerson("");
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "인물 목록을 불러오지 못했습니다.";
      setAuthError(message);
    }
  };

  const loadUserProfile = async () => {
    const respondy = getRespondy();
    if (!respondy) return;
    try {
      const profile = await respondy.getUserProfile();
      if (profile.name?.trim()) {
        setUserName(profile.name.trim());
      }
      if (profile.email?.trim()) {
        setProfileEmail(profile.email.trim());
      }
      setProfileBirthDate(profile.birthDate?.trim() || "");
      setPrivacyConsentAt(profile.privacyConsentAt?.trim() || "");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "프로필 정보를 불러오지 못했습니다.";
      setAuthError(message);
    } finally {
      setPrivacyConsentLoaded(true);
    }
  };

  const loadAnalysisHistory = async () => {
    const respondy = getRespondy();
    if (!respondy) return;
    try {
      const history = await respondy.listAnalysisHistory();
      setAnalysisHistory(history);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "분석 기록을 불러오지 못했습니다.";
      setAuthError(message);
    }
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const respondy = getRespondy();
    if (!respondy) {
      setAuthError("Electron 환경에서만 백엔드 로그인을 사용할 수 있습니다.");
      return;
    }

    const form = event.currentTarget;
    const usernameField = form.elements.namedItem("login-email");
    const passwordField = form.elements.namedItem("login-password");
    const username =
      usernameField instanceof HTMLInputElement
        ? usernameField.value.trim()
        : "";
    const password =
      passwordField instanceof HTMLInputElement ? passwordField.value : "";
    if (!username || !password) {
      setAuthError("아이디(또는 이메일)와 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const state = await respondy.login({ username, password });
      applyAuthState(state);
      resetSessionUi();
      await loadPersonProfiles();
      form.reset();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "로그인에 실패했습니다.";
      const invalidCreds = /invalid username or password/i.test(raw);
      if (invalidCreds && username.includes("@")) {
        setAuthError(
          "이메일이 아니라 회원가입 때 쓴 아이디로 로그인해 주세요. 아이디와 비밀번호가 맞지 않으면 같은 오류가 납니다.",
        );
      } else if (invalidCreds) {
        setAuthError(
          "입력하신 아이디와 비밀번호가 일치하지 않습니다. 다시 확인해 주세요.",
        );
      } else {
        const stripped = raw.replace(
          /^Error invoking remote method '[^']+':\s*/i,
          "",
        );
        const withoutErrorType = stripped.replace(/^BackendApiError:\s*/i, "");
        setAuthError(withoutErrorType.trim() || raw);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignupSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const respondy = getRespondy();
    if (!respondy) {
      setAuthError("Electron 환경에서만 회원가입을 사용할 수 있습니다.");
      return;
    }

    const form = event.currentTarget;
    const nameField = form.elements.namedItem("signup-name");
    const emailField = form.elements.namedItem("signup-email");
    const passwordField = form.elements.namedItem("signup-password");
    const confirmPasswordField = form.elements.namedItem(
      "signup-password-confirm",
    );
    const birthDateField = form.elements.namedItem("signup-birthdate");
    const username =
      nameField instanceof HTMLInputElement ? nameField.value.trim() : "";
    const email =
      emailField instanceof HTMLInputElement ? emailField.value.trim() : "";
    const password =
      passwordField instanceof HTMLInputElement ? passwordField.value : "";
    const confirmPassword =
      confirmPasswordField instanceof HTMLInputElement
        ? confirmPasswordField.value
        : "";
    const birthDate =
      birthDateField instanceof HTMLInputElement
        ? birthDateField.value.trim()
        : "";
    if (!username || !password) {
      setAuthError("이름(아이디)과 비밀번호를 입력해 주세요.");
      return;
    }
    if (!birthDate) {
      setAuthError("생년월일을 입력해 주세요.");
      return;
    }
    const passwordPolicyError = validatePasswordPolicy(password);
    if (passwordPolicyError) {
      setAuthError(passwordPolicyError);
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const state = await respondy.signup({
        username,
        email: email || undefined,
        password,
      });
      applyAuthState(state);
      resetSessionUi();
      await respondy.updateUserProfile({
        name: username,
        email: email || state.user?.email?.trim() || "",
        birthDate,
      });
      await loadPersonProfiles();
      setProfileBirthDate(birthDate);
      form.reset();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "회원가입에 실패했습니다.";
      if (/username.*already|already exists|중복/i.test(message)) {
        setAuthError(
          "이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.",
        );
      } else {
        setAuthError(message);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const renderAuthCard = () => {
    if (authView === "signup") {
      return (
        <form
          key="signup"
          className="respondy-card respondy-auth-card"
          onSubmit={handleSignupSubmit}
        >
          <h2 className="respondy-title">회원가입</h2>
          <label className="respondy-label" htmlFor="signup-name">
            아이디
          </label>
          <input
            id="signup-name"
            name="signup-name"
            className="respondy-input"
            autoComplete="username"
            placeholder="아이디를 입력하세요"
            disabled={authBusy}
          />
          <label className="respondy-label" htmlFor="signup-email">
            이메일 주소
          </label>
          <input
            id="signup-email"
            name="signup-email"
            className="respondy-input"
            type="email"
            autoComplete="email"
            disabled={authBusy}
          />
          <label className="respondy-label" htmlFor="signup-password">
            비밀번호
          </label>
          <input
            id="signup-password"
            name="signup-password"
            className="respondy-input"
            type="password"
            autoComplete="new-password"
            disabled={authBusy}
          />
          <label className="respondy-label" htmlFor="signup-password-confirm">
            비밀번호 확인
          </label>
          <input
            id="signup-password-confirm"
            name="signup-password-confirm"
            className="respondy-input"
            type="password"
            autoComplete="new-password"
            disabled={authBusy}
          />
          <label className="respondy-label" htmlFor="signup-birthdate">
            생년월일
          </label>
          <input
            id="signup-birthdate"
            name="signup-birthdate"
            className="respondy-input"
            type="date"
            disabled={authBusy}
          />
          <button
            className="respondy-primary-btn"
            type="submit"
            disabled={authBusy}
          >
            {authBusy ? "처리 중..." : "회원가입"}
          </button>
          <p className="respondy-helper-text respondy-helper-text--compact">
            이미 계정이 있으신가요?{" "}
            <button
              type="button"
              className="respondy-link-btn"
              onClick={() => setAuthView("login")}
              disabled={authBusy}
            >
              로그인
            </button>
          </p>
          {authError && (
            <p className="respondy-helper-text respondy-helper-text--inline">
              {authError}
            </p>
          )}
        </form>
      );
    }

    return (
      <form
        key="login"
        className="respondy-card respondy-auth-card"
        onSubmit={handleLoginSubmit}
      >
        <h2 className="respondy-title">로그인</h2>
        <label className="respondy-label" htmlFor="login-email">
          아이디
        </label>
        <input
          id="login-email"
          name="login-email"
          className="respondy-input"
          type="text"
          autoComplete="username"
          disabled={authBusy}
        />
        <label className="respondy-label" htmlFor="login-password">
          비밀번호
        </label>
        <input
          id="login-password"
          name="login-password"
          className="respondy-input"
          type="password"
          autoComplete="current-password"
          disabled={authBusy}
        />
        <button
          className="respondy-primary-btn"
          type="submit"
          disabled={authBusy}
        >
          {authBusy ? "처리 중..." : "로그인"}
        </button>
        <p className="respondy-helper-text">
          계정이 없으신가요?{" "}
          <button
            type="button"
            className="respondy-link-btn"
            onClick={() => setAuthView("signup")}
            disabled={authBusy}
          >
            회원가입
          </button>
        </p>
        {authError && (
          <p className="respondy-helper-text respondy-helper-text--inline">
            {authError}
          </p>
        )}
      </form>
    );
  };

  const clearRealtimeResults = () => {
    setShowRealtimeResults(false);
    setRealtimeResult(EMPTY_REALTIME_RESULT);
  };
  const clearManualResults = () => {
    setShowManualResults(false);
    setManualResult(EMPTY_MANUAL_RESULT);
  };

  const ensurePrivacyConsentForAnalysis = async (): Promise<boolean> => {
    if (privacyConsentAt) return true;
    setShowPrivacyConsentModal(true);
    window.alert(
      "개인정보 수집 및 이용 동의 후 분석 기능을 사용할 수 있습니다.",
    );
    return false;
  };

  const submitPrivacyConsent = async () => {
    const respondy = getRespondy();
    if (!respondy) return;
    if (!privacyConsentChecked) return;
    try {
      setPrivacyConsentBusy(true);
      await respondy.submitPrivacyConsent();
      await loadUserProfile();
      setShowPrivacyConsentModal(false);
      setPrivacyConsentChecked(false);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "개인정보 동의 처리 중 오류가 발생했습니다.";
      window.alert(message);
    } finally {
      setPrivacyConsentBusy(false);
    }
  };

  const startRealtimeDetection = async (): Promise<boolean> => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 실시간 감지를 시작할 수 있습니다.");
      return false;
    }
    const allowed = await ensurePrivacyConsentForAnalysis();
    if (!allowed) return false;
    if (!hasPickedRealtimeRegion) {
      window.alert("먼저 캡처 영역 선택 버튼을 눌러 영역을 설정해 주세요.");
      return false;
    }
    try {
      const realtimeTitle = selectedRealtimePerson.trim()
        ? `${selectedRealtimePerson.trim()} 실시간 분석`
        : "Respondy 실시간 분석";
      const selectedProfile = personProfiles.find(
        (person) => person.name === selectedRealtimePerson,
      );
      await respondy.startRealtimeDetection({
        title: realtimeTitle,
        situationContext: realtimeReceivedMessage.trim(),
        analysisGoal: "상대 메시지 맥락 기반 답장 추천",
        avatarId: selectedProfile ? Number(selectedProfile.id) : null,
      });
      setIsRealtimeMonitoring(true);
      return true;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "실시간 감지를 시작하지 못했습니다.";
      window.alert(message);
      return false;
    }
  };

  const stopRealtimeDetection = async (refreshHistory = false) => {
    const respondy = getRespondy();
    try {
      await respondy?.stopRealtimeDetection();
    } catch {
      // ignore stop race during view transitions
    } finally {
      setIsRealtimeMonitoring(false);
      if (refreshHistory && loggedIn) {
        await loadAnalysisHistory();
      }
    }
  };

  const handleRealtimeMonitoringToggle = async () => {
    if (isRealtimeMonitoring) {
      await stopRealtimeDetection(true);
      return;
    }

    const started = await startRealtimeDetection();
    if (!started) return;
    setRealtimeResult(EMPTY_REALTIME_RESULT);
    setShowRealtimeResults(false);
  };

  const pickRealtimeRegion = async () => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 영역 선택을 사용할 수 있습니다.");
      return;
    }
    try {
      setIsPickingRegion(true);
      const picked = await respondy.pickOcrRegion();
      if (!picked) return;
      setHasPickedRealtimeRegion(true);
      window.alert(
        `캡처 영역 설정 완료: x=${picked.x}, y=${picked.y}, w=${picked.width}, h=${picked.height}`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "영역 선택 중 오류가 발생했습니다.";
      window.alert(message);
    } finally {
      setIsPickingRegion(false);
    }
  };

  const manualFormReady =
    selectedManualPerson.trim() &&
    manualSituation.trim() &&
    manualReceivedMessage.trim();
  const selectedRealtimeProfile = personProfiles.find(
    (person) => person.name === selectedRealtimePerson,
  );
  const selectedManualProfile = personProfiles.find(
    (person) => person.name === selectedManualPerson,
  );

  const selectedChatProfile = personProfiles.find(
    (person) => person.name === selectedChatPerson,
  );
  const chatRelationLabel = selectedChatPerson.trim() || "인물 미선택";

  const toChatBubble = (message: {
    id: number;
    senderType: "user" | "assistant";
    content: string;
    createdAt: number;
  }): ChatBubble => ({
    id: `chat-${message.id}`,
    role: message.senderType === "assistant" ? "assistant" : "user",
    text: message.content,
    at: message.createdAt || Date.now(),
  });

  const startChatSession = async () => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 AI 챗을 사용할 수 있습니다.");
      return;
    }
    if (!selectedChatPerson.trim()) return;
    const avatarId = Number(selectedChatProfile?.id);
    if (!Number.isFinite(avatarId) || avatarId <= 0) {
      window.alert("인물을 다시 선택해 주세요.");
      return;
    }
    try {
      setChatTyping(true);
      const created = await respondy.createCoachingChat({
        avatarId,
        title: `${selectedChatPerson.trim()}와 대화 연습`,
        situationContext:
          selectedChatProfile?.goalRelation?.trim() ||
          selectedChatProfile?.currentRelation?.trim() ||
          "자연스럽게 대화 이어가기",
      });
      const detail = await respondy.getCoachingChatDetail(created.id);
      setActiveChatId(detail.id);
      setChatStep("conversation");
      setChatMessages(detail.messages.map((message) => toChatBubble(message)));
      setChatDraft("");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "AI 챗 시작에 실패했습니다.";
      window.alert(message);
    } finally {
      setChatTyping(false);
    }
  };

  const leaveChatConversation = () => {
    const chatId = activeChatId;
    const respondy = getRespondy();
    if (respondy && chatId) {
      void respondy.archiveCoachingChat(chatId).catch(() => undefined);
    }
    setChatStep("select");
    setActiveChatId(null);
    setChatMessages([]);
    setChatDraft("");
    setChatTyping(false);
  };

  const sendChatMessage = () => {
    const text = chatDraft.trim();
    if (!text || chatTyping) return;
    const chatId = activeChatId;
    if (!chatId) {
      window.alert("채팅 세션이 준비되지 않았습니다. 다시 시작해 주세요.");
      return;
    }
    const nextUserMessage: ChatBubble = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      at: Date.now(),
    };
    setChatMessages((m) => [...m, nextUserMessage]);
    setChatDraft("");
    setChatTyping(true);
    void (async () => {
      const respondy = getRespondy();
      if (!respondy) {
        setChatMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: "현재 환경에서는 AI 챗봇을 사용할 수 없습니다.",
            at: Date.now(),
          },
        ]);
        setChatTyping(false);
        return;
      }

      try {
        const res = await respondy.sendCoachingChatMessage(chatId, text);
        const warmReply =
          res.assistantMessage.content || "좋아, 조금 더 얘기해볼까?";

        setChatMessages((m) => [
          ...m.filter((item) => item.id !== nextUserMessage.id),
          toChatBubble(res.userMessage),
          {
            id: `chat-${res.assistantMessage.id}`,
            role: "assistant",
            text: warmReply,
            at: res.assistantMessage.createdAt || Date.now(),
          },
        ]);
      } catch (e) {
        const fallback =
          e instanceof Error
            ? `응답 생성 중 오류가 있었어: ${e.message}`
            : "응답 생성 중 오류가 있었어.";
        setChatMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: fallback,
            at: Date.now(),
          },
        ]);
      } finally {
        setChatTyping(false);
      }
    })();
  };

  const closePersonCreateModal = () => {
    setShowPersonCreateModal(false);
    setNewPersonName("");
    setNewPersonBirthDate("");
    setNewPersonCurrentRelation("");
    setNewPersonGoalRelation("");
    setNewPersonPersonality("");
    setNewPersonNotes("");
  };

  const openProfileEditModal = () => {
    setEditProfileName(userName);
    setEditProfileEmail(profileEmail);
    setEditProfileBirthDate(profileBirthDate);
    setShowProfileEditModal(true);
  };

  const closeProfileEditModal = () => {
    setShowProfileEditModal(false);
    setEditProfileName("");
    setEditProfileEmail("");
    setEditProfileBirthDate("");
  };

  const openPasswordChangeModal = () => {
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordChangeError("");
    setShowPasswordChangeModal(true);
  };

  const closePasswordChangeModal = () => {
    setShowPasswordChangeModal(false);
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordChangeError("");
  };

  const saveProfile = async () => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 프로필 수정이 가능합니다.");
      return;
    }
    const nextName = userName.trim();
    const nextEmail = editProfileEmail.trim();
    if (!nextEmail) return;
    try {
      setAuthBusy(true);
      const profile = await respondy.updateUserProfile({
        name: nextName,
        email: nextEmail,
        birthDate: editProfileBirthDate,
      });
      setUserName(profile.name || nextName);
      setProfileEmail(profile.email || nextEmail);
      setProfileBirthDate(profile.birthDate || editProfileBirthDate);
      closeProfileEditModal();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "프로필 저장 중 오류가 발생했습니다.";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const saveChangedPassword = async () => {
    const respondy = getRespondy();
    if (!respondy) return;
    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput)
      return;
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError(
        "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.",
      );
      return;
    }
    if (newPasswordInput === currentPasswordInput) {
      setPasswordChangeError(
        "새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.",
      );
      return;
    }
    const passwordPolicyError = validatePasswordPolicy(newPasswordInput);
    if (passwordPolicyError) {
      setPasswordChangeError(passwordPolicyError);
      return;
    }
    try {
      setAuthBusy(true);
      setPasswordChangeError("");
      await respondy.changePassword({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
        confirmPassword: confirmPasswordInput,
      });
      closePasswordChangeModal();
      window.alert("비밀번호가 변경되었습니다.");
    } catch (e) {
      setPasswordChangeError(
        e instanceof Error
          ? e.message
          : "비밀번호 변경 중 오류가 발생했습니다.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const createPersonProfile = async () => {
    if (isCreatingPerson) return;
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 인물 생성이 가능합니다.");
      return;
    }
    const personName = newPersonName.trim();
    if (!personName) return;
    const existingPerson = personProfiles.find(
      (person) => person.name === personName,
    );
    if (existingPerson) {
      setSelectedRealtimePerson(existingPerson.name);
      setSelectedManualPerson(existingPerson.name);
      setSelectedChatPerson(existingPerson.name);
      closePersonCreateModal();
      return;
    }
    try {
      setIsCreatingPerson(true);
      const created = await respondy.createAvatar({
        name: personName,
        ageGroup: newPersonBirthDate,
        currentRelation: newPersonCurrentRelation.trim(),
        targetRelation: newPersonGoalRelation.trim(),
        personality: newPersonPersonality.trim(),
        speechStyle: newPersonSpeechStyle.trim(),
        background: newPersonBackground.trim(),
        memo: newPersonNotes.trim(),
      });
      const nextProfile = toPersonProfile(created);
      setPersonProfiles((prev) => [...prev, nextProfile]);
      setSelectedRealtimePerson(nextProfile.name);
      setSelectedManualPerson(nextProfile.name);
      setSelectedChatPerson(nextProfile.name);
      closePersonCreateModal();
      clearRealtimeResults();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "인물 생성 중 오류가 발생했습니다.";
      window.alert(message);
    } finally {
      setIsCreatingPerson(false);
    }
  };

  const openPersonDetailModal = (person: PersonProfile) => {
    setPersonDetailId(person.id);
    setEditPersonName(person.name);
    setEditPersonBirthDate(person.birthDate);
    setEditPersonCurrentRelation(person.currentRelation);
    setEditPersonGoalRelation(person.goalRelation);
    setEditPersonPersonality(person.personality);
    setEditPersonSpeechStyle(person.speechStyle);
    setEditPersonBackground(person.background);
    setEditPersonNotes(person.notes);
  };

  const closePersonDetailModal = () => {
    setPersonDetailId(null);
    setEditPersonName("");
    setEditPersonBirthDate("");
    setEditPersonCurrentRelation("");
    setEditPersonGoalRelation("");
    setEditPersonPersonality("");
    setEditPersonSpeechStyle("");
    setEditPersonBackground("");
    setEditPersonNotes("");
  };

  const savePersonDetail = async () => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 인물 수정이 가능합니다.");
      return;
    }
    if (!personDetailId) return;
    const nextName = editPersonName.trim();
    if (!nextName) return;
    const originalPerson = personProfiles.find(
      (person) => person.id === personDetailId,
    );
    if (!originalPerson) return;

    const prevName = originalPerson.name;
    try {
      const updated = await respondy.updateAvatar(Number(personDetailId), {
        name: nextName,
        ageGroup: editPersonBirthDate,
        currentRelation: editPersonCurrentRelation.trim(),
        targetRelation: editPersonGoalRelation.trim(),
        personality: editPersonPersonality.trim(),
        speechStyle: editPersonSpeechStyle.trim(),
        background: editPersonBackground.trim(),
        memo: editPersonNotes.trim(),
      });
      const nextProfile = toPersonProfile(updated);
      setPersonProfiles((prev) =>
        prev.map((person) =>
          person.id === personDetailId ? { ...person, ...nextProfile } : person,
        ),
      );

      if (selectedRealtimePerson === prevName)
        setSelectedRealtimePerson(nextName);
      if (selectedManualPerson === prevName) setSelectedManualPerson(nextName);
      if (selectedChatPerson === prevName) setSelectedChatPerson(nextName);
      closePersonDetailModal();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "인물 수정 중 오류가 발생했습니다.";
      window.alert(message);
    }
  };

  const removeAnalysisRecord = async (recordId: string) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    const respondy = getRespondy();
    if (!respondy) return;
    try {
      await respondy.deleteAnalysisHistoryRecord(recordId);
      setAnalysisHistory((prev) =>
        prev.filter((record) => record.id !== recordId),
      );
      if (historyDetailId === recordId) setHistoryDetailId(null);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "분석 기록 삭제 중 오류가 발생했습니다.";
      window.alert(message);
    }
  };

  const removePersonProfile = async (personId: string) => {
    const respondy = getRespondy();
    if (!respondy) {
      window.alert("Electron 환경에서만 인물 삭제가 가능합니다.");
      return;
    }
    if (!window.confirm("삭제하시겠습니까?")) return;
    const target = personProfiles.find((person) => person.id === personId);
    if (!target) return;
    try {
      await respondy.deleteAvatar(Number(personId));
      setPersonProfiles((prev) =>
        prev.filter((person) => person.id !== personId),
      );
      if (selectedRealtimePerson === target.name) setSelectedRealtimePerson("");
      if (selectedManualPerson === target.name) setSelectedManualPerson("");
      if (selectedChatPerson === target.name) setSelectedChatPerson("");
      if (personDetailId === personId) closePersonDetailModal();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "인물 삭제 중 오류가 발생했습니다.";
      window.alert(message);
    }
  };

  const renderRealtimeView = () => (
    <section className="respondy-three-column">
      <article className="respondy-card">
        <h3 className="respondy-card-title">컨텍스트 입력</h3>
        <label className="respondy-label" htmlFor="realtime-person-select">
          인물 선택
        </label>
        <div className="respondy-inline-row">
          <select
            id="realtime-person-select"
            className="respondy-input respondy-select"
            value={selectedRealtimePerson}
            onChange={(e) => {
              setSelectedRealtimePerson(e.target.value);
              clearRealtimeResults();
            }}
          >
            <option value="">인물을 선택하세요</option>
            {personProfiles.map((person) => (
              <option key={person.id} value={person.name}>
                {person.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="respondy-add-btn"
            onClick={() => setShowPersonCreateModal(true)}
            aria-label="인물 생성"
            title="인물 생성"
          >
            +
          </button>
        </div>
        {personProfiles.length === 0 && (
          <p className="respondy-helper-text respondy-helper-text--inline">
            등록된 인물이 없습니다. <strong>+</strong> 버튼으로 인물을 먼저
            만들어 주세요.
          </p>
        )}
        <label className="respondy-label">상황 설명</label>
        <textarea
          className="respondy-textarea"
          value={realtimeReceivedMessage}
          onChange={(e) => {
            setRealtimeReceivedMessage(e.target.value);
            clearRealtimeResults();
          }}
          placeholder="분석할 상황을 입력하세요"
          autoComplete="off"
        />
        <div className="respondy-realtime-action-stack">
          <button
            className="respondy-primary-btn respondy-secondary-btn"
            type="button"
            onClick={() => void pickRealtimeRegion()}
            disabled={isPickingRegion}
          >
            {isPickingRegion ? "영역 선택 중..." : "캡처 영역 선택"}
          </button>
          <button
            className={`respondy-primary-btn ${isRealtimeMonitoring ? "respondy-danger-btn" : ""}`}
            type="button"
            onClick={() => void handleRealtimeMonitoringToggle()}
          >
            {isRealtimeMonitoring ? "종료하기" : "실시간 감지 시작"}
          </button>
        </div>
      </article>

      <article className="respondy-card">
        <h3 className="respondy-card-title">AI 분석 결과</h3>
        <label className="respondy-label">감정 분석</label>
        <textarea
          className={`respondy-textarea respondy-readonly-area respondy-output-area ${
            showRealtimeResults
              ? ""
              : isRealtimeMonitoring
                ? "respondy-output-analyzing"
                : "respondy-output-pending"
          }`}
          readOnly
          value={
            showRealtimeResults
              ? realtimeResult.emotion
              : isRealtimeMonitoring
                ? "분석 중…"
                : ""
          }
          placeholder="왼쪽 패널을 모두 입력한 뒤 실시간 감지 시작을 누르면 표시됩니다"
        />
        <label className="respondy-label">맥락 해석</label>
        <textarea
          className={`respondy-textarea respondy-readonly-area respondy-output-area ${
            showRealtimeResults
              ? ""
              : isRealtimeMonitoring
                ? "respondy-output-analyzing"
                : "respondy-output-pending"
          }`}
          readOnly
          value={
            showRealtimeResults
              ? realtimeResult.context
              : isRealtimeMonitoring
                ? "분석 중…"
                : ""
          }
          placeholder="왼쪽 패널을 모두 입력한 뒤 실시간 감지 시작을 누르면 표시됩니다"
        />
      </article>

      <article className="respondy-card respondy-replies-panel">
        <h3 className="respondy-card-title">추천 답장</h3>
        {showRealtimeResults ? (
          realtimeResult.suggestions.length > 0 ? (
            <div className="respondy-suggestions-body">
              {realtimeResult.suggestions.map((message, index) => {
                const copyId = `realtime-${index}`;
                return (
                  <div key={message} className="respondy-suggestion">
                    <div className="respondy-readonly-box">{message}</div>
                    <button
                      className="respondy-primary-btn"
                      type="button"
                      onClick={() => void copySuggestion(message, copyId)}
                    >
                      {copiedSuggestionId === copyId ? "복사됨" : "복사하기"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="respondy-output-empty">
              이번 분석에는 추천 답장이 없습니다.
            </p>
          )
        ) : isRealtimeMonitoring ? (
          <p className="respondy-output-empty respondy-output-empty--analyzing">
            분석 중…
          </p>
        ) : (
          <p className="respondy-output-empty">
            분석 후 추천 답장이 여기에 표시됩니다.
          </p>
        )}
      </article>
    </section>
  );

  const renderManualView = () => (
    <section className="respondy-three-column">
      <article className="respondy-card">
        <h3 className="respondy-card-title">컨텍스트 입력</h3>
        <label className="respondy-label" htmlFor="manual-person-select">
          인물 선택
        </label>
        <div className="respondy-inline-row">
          <select
            id="manual-person-select"
            className="respondy-input respondy-select"
            value={selectedManualPerson}
            onChange={(e) => {
              setSelectedManualPerson(e.target.value);
              clearManualResults();
            }}
          >
            <option value="">인물을 선택하세요</option>
            {personProfiles.map((person) => (
              <option key={person.id} value={person.name}>
                {person.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="respondy-add-btn"
            onClick={() => setShowPersonCreateModal(true)}
            aria-label="인물 생성"
            title="인물 생성"
          >
            +
          </button>
        </div>
        {personProfiles.length === 0 && (
          <p className="respondy-helper-text respondy-helper-text--inline">
            등록된 인물이 없습니다. <strong>+</strong> 버튼으로 인물을 먼저
            만들어 주세요.
          </p>
        )}
        <label className="respondy-label">상황 설명</label>
        <textarea
          className="respondy-textarea"
          value={manualSituation}
          onChange={(e) => {
            setManualSituation(e.target.value);
            clearManualResults();
          }}
          placeholder="상황을 입력하세요"
        />
        <label className="respondy-label">받은 메시지</label>
        <textarea
          className="respondy-textarea"
          value={manualReceivedMessage}
          onChange={(e) => {
            setManualReceivedMessage(e.target.value);
            clearManualResults();
          }}
          placeholder="답장이 필요한 상대 메시지를 입력하세요"
        />
        <button
          className="respondy-primary-btn"
          type="button"
          onClick={() => {
            if (!manualFormReady) return;
            const respondy = getRespondy();
            if (!respondy) {
              window.alert(
                "Electron 환경에서만 수동 분석을 실행할 수 있습니다.",
              );
              return;
            }
            const avatarId = Number(selectedManualProfile?.id);
            if (!Number.isFinite(avatarId) || avatarId <= 0) {
              window.alert("아바타를 다시 선택해 주세요.");
              return;
            }
            void (async () => {
              const allowed = await ensurePrivacyConsentForAnalysis();
              if (!allowed) return;
              setIsManualAnalyzing(true);
              try {
                const result = await respondy.analyzeManualConversation({
                  avatarId,
                  situationContext: manualSituation.trim(),
                  receivedMessage: manualReceivedMessage.trim(),
                });
                setManualResult(result);
                setShowManualResults(true);
                await loadAnalysisHistory();
              } catch (e) {
                const message =
                  e instanceof Error
                    ? e.message
                    : "수동 분석 중 오류가 발생했습니다.";
                window.alert(message);
              } finally {
                setIsManualAnalyzing(false);
              }
            })();
          }}
          disabled={!manualFormReady || isManualAnalyzing}
        >
          {isManualAnalyzing ? "분석 중..." : "AI 분석 시작"}
        </button>
      </article>

      <article className="respondy-card">
        <h3 className="respondy-card-title">AI 분석 결과</h3>
        <label className="respondy-label">감정 분석</label>
        <textarea
          className={`respondy-textarea respondy-readonly-area respondy-output-area ${showManualResults ? "" : "respondy-output-pending"}`}
          readOnly
          value={showManualResults ? manualResult.emotion : ""}
          placeholder="왼쪽 패널을 모두 입력한 뒤 AI 분석 시작을 누르면 표시됩니다"
        />
        <label className="respondy-label">맥락 해석</label>
        <textarea
          className={`respondy-textarea respondy-readonly-area respondy-output-area ${showManualResults ? "" : "respondy-output-pending"}`}
          readOnly
          value={showManualResults ? manualResult.context : ""}
          placeholder="왼쪽 패널을 모두 입력한 뒤 AI 분석 시작을 누르면 표시됩니다"
        />
      </article>

      <article className="respondy-card respondy-replies-panel">
        <h3 className="respondy-card-title">추천 답장</h3>
        {showManualResults ? (
          <div className="respondy-suggestions-body">
            {manualResult.suggestions.map((message, index) => {
              const copyId = `manual-${index}`;
              return (
                <div key={message} className="respondy-suggestion">
                  <div className="respondy-readonly-box">{message}</div>
                  <button
                    className="respondy-primary-btn"
                    type="button"
                    onClick={() => void copySuggestion(message, copyId)}
                  >
                    {copiedSuggestionId === copyId ? "복사됨" : "복사하기"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="respondy-output-empty">
            분석 후 추천 답장이 여기에 표시됩니다.
          </p>
        )}
      </article>
    </section>
  );

  const renderChatView = () => {
    if (chatStep === "select") {
      return (
        <section className="respondy-single-wrap">
          <article className="respondy-card respondy-chat-select-card">
            <h2 className="respondy-title respondy-title--card">
              AI 대화 연습
            </h2>
            <p className="respondy-section-label">인물 선택</p>
            <div className="respondy-inline-row">
              <select
                id="chat-person-select"
                className="respondy-input respondy-select"
                value={selectedChatPerson}
                onChange={(e) => setSelectedChatPerson(e.target.value)}
              >
                <option value="">인물을 선택하세요</option>
                {personProfiles.map((person) => (
                  <option key={person.id} value={person.name}>
                    {person.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="respondy-add-btn"
                onClick={() => setShowPersonCreateModal(true)}
                aria-label="인물 생성"
                title="인물 생성"
              >
                +
              </button>
            </div>
            {personProfiles.length === 0 && (
              <p className="respondy-helper-text respondy-helper-text--inline">
                등록된 인물이 없습니다. <strong>+</strong> 버튼으로 인물을 먼저
                만들어 주세요.
              </p>
            )}
            <button
              className="respondy-primary-btn"
              type="button"
              onClick={startChatSession}
              disabled={!selectedChatPerson.trim()}
            >
              대화 시작하기
            </button>
          </article>
        </section>
      );
    }

    return (
      <section className="respondy-chat-stage" aria-label="AI 대화 연습">
        <div className="respondy-chat-messenger">
          <header className="respondy-chat-messenger-top">
            <div className="respondy-chat-messenger-title">
              <button
                type="button"
                className="respondy-chat-back-btn"
                onClick={leaveChatConversation}
                aria-label="인물 선택으로 돌아가기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div>
                <p className="respondy-chat-messenger-name">AI 대화 파트너</p>
                <p className="respondy-chat-messenger-sub">
                  연습 모드 ·{" "}
                  <span
                    className="respondy-chat-relation-badge"
                    title={chatRelationLabel}
                  >
                    {chatRelationLabel}
                  </span>
                </p>
              </div>
            </div>
            <span className="respondy-chat-status-dot" aria-hidden />
          </header>

          <div ref={chatScrollRef} className="respondy-chat-messenger-body">
            <div className="respondy-chat-day-divider">
              <span>오늘</span>
            </div>
            {chatMessages.map((msg) =>
              msg.role === "assistant" ? (
                <div key={msg.id} className="respondy-chat-msg-ai">
                  <div className="respondy-chat-avatar-ai" aria-hidden>
                    AI
                  </div>
                  <div className="respondy-chat-ai-col">
                    <div className="respondy-chat-bubble-ai">{msg.text}</div>
                    <span className="respondy-chat-meta">
                      {formatChatTime(msg.at)}
                    </span>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="respondy-chat-msg-user">
                  <div className="respondy-chat-bubble-user">{msg.text}</div>
                  <span className="respondy-chat-meta respondy-chat-meta--user">
                    {formatChatTime(msg.at)}
                  </span>
                </div>
              ),
            )}
            {chatTyping && (
              <div className="respondy-chat-msg-ai">
                <div
                  className="respondy-chat-avatar-ai respondy-chat-avatar-ai--typing"
                  aria-hidden
                >
                  AI
                </div>
                <div className="respondy-chat-typing-bubble" aria-live="polite">
                  <span className="respondy-chat-typing-dot" />
                  <span className="respondy-chat-typing-dot respondy-chat-typing-dot--d1" />
                  <span className="respondy-chat-typing-dot respondy-chat-typing-dot--d2" />
                </div>
              </div>
            )}
          </div>

          <footer className="respondy-chat-composer-wrap">
            <div className="respondy-chat-composer-inner">
              <textarea
                className="respondy-chat-composer-input"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder="메시지를 입력하세요…"
                rows={1}
                disabled={chatTyping}
              />
              <button
                type="button"
                className="respondy-chat-send-btn"
                onClick={sendChatMessage}
                disabled={!chatDraft.trim() || chatTyping}
                aria-label="메시지 전송"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <p className="respondy-chat-composer-hint">
              Enter로 전송 · Shift+Enter로 줄 바꿈
            </p>
          </footer>
        </div>
      </section>
    );
  };

  const renderMyPage = () => (
    <section className="respondy-three-column respondy-mypage-grid">
      <article className="respondy-card">
        <h3 className="respondy-title">내 정보</h3>
        <div className="respondy-profile-head">
          <div className="respondy-profile-avatar" aria-hidden>
            {(userName.trim().slice(0, 1) || "U").toUpperCase()}
          </div>
          <div className="respondy-profile-identity">
            <p className="respondy-profile-name">{userName || "이름 미입력"}</p>
            <p className="respondy-profile-email">
              {profileEmail || "이메일 미입력"}
            </p>
          </div>
        </div>
        <dl className="respondy-profile-meta">
          <dt>아이디</dt>
          <dd>{userName || "—"}</dd>
          <dt>이메일</dt>
          <dd>{profileEmail || "—"}</dd>
          <dt>생년월일</dt>
          <dd>{profileBirthDate || "—"}</dd>
        </dl>
        <div className="respondy-profile-actions">
          <button
            className="respondy-primary-btn"
            type="button"
            onClick={openProfileEditModal}
          >
            프로필 수정
          </button>
          <button
            className="respondy-primary-btn respondy-secondary-btn"
            type="button"
            onClick={openPasswordChangeModal}
          >
            비밀번호 변경
          </button>
        </div>
      </article>

      <article className="respondy-card">
        <h3 className="respondy-title">분석 기록</h3>
        <p className="respondy-history-hint">
          실시간 분석·수동 입력에서 분석을 실행하면 여기에 쌓입니다. 항목을
          누르면 상세를 다시 볼 수 있어요.
        </p>
        {analysisHistory.length === 0 ? (
          <p className="respondy-output-empty respondy-history-empty">
            아직 저장된 분석 기록이 없습니다.
          </p>
        ) : (
          <div className="respondy-history-list">
            {analysisHistory.map((rec) => (
              <div
                key={rec.id}
                role="button"
                tabIndex={0}
                className="respondy-history-item respondy-history-item--button"
                onClick={() => setHistoryDetailId(rec.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHistoryDetailId(rec.id);
                  }
                }}
              >
                <div className="respondy-history-item-top">
                  <time
                    className="respondy-history-item-date"
                    dateTime={new Date(rec.at).toISOString()}
                  >
                    {new Date(rec.at).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span
                    className={`respondy-history-item-badge ${rec.source === "realtime" ? "is-realtime" : "is-manual"}`}
                  >
                    {rec.source === "realtime" ? "실시간 분석" : "수동 입력"}
                  </span>
                </div>
                <div className="respondy-history-item-divider" aria-hidden />
                <span className="respondy-history-item-title">
                  {rec.title || "(제목 없음)"}
                </span>
                <div className="respondy-history-item-actions">
                  <button
                    type="button"
                    className="respondy-item-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeAnalysisRecord(rec.id);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
      <article className="respondy-card">
        <h3 className="respondy-title">인물 관리</h3>
        <p className="respondy-history-hint">
          실시간 분석에서 생성한 인물 정보가 저장됩니다.
        </p>
        {personProfiles.length === 0 ? (
          <p className="respondy-output-empty respondy-history-empty">
            저장된 인물 정보가 없습니다.
          </p>
        ) : (
          <div className="respondy-person-list">
            {personProfiles.map((person) => (
              <div
                key={person.id}
                role="button"
                tabIndex={0}
                className="respondy-history-item respondy-history-item--button respondy-person-item-btn"
                onClick={() => openPersonDetailModal(person)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPersonDetailModal(person);
                  }
                }}
              >
                <div className="respondy-history-item-top">
                  <span className="respondy-person-name">{person.name}</span>
                  <span className="respondy-history-item-badge is-realtime">
                    인물
                  </span>
                </div>
                <div className="respondy-history-item-divider" aria-hidden />
                <span className="respondy-person-item-summary">
                  {person.currentRelation || "관계 미입력"} ·{" "}
                  {person.goalRelation || "목표 미입력"}
                </span>
                <div className="respondy-history-item-actions">
                  <button
                    type="button"
                    className="respondy-item-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPersonDetailModal(person);
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="respondy-item-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removePersonProfile(person.id);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          className="respondy-primary-btn"
          type="button"
          onClick={() => setShowPersonCreateModal(true)}
        >
          인물 생성
        </button>
      </article>
    </section>
  );

  const renderHomeView = () => (
    <section className="respondy-home">
      <header className="respondy-home-hero">
        <p className="respondy-home-eyebrow">Communication Assistant</p>
        <h2 className="respondy-home-title">
          안녕하세요, <span className="respondy-home-name">{userName}</span>님
        </h2>
        <p className="respondy-home-lead">
          대화 맥락과 감정을 분석해, 상황에 맞는 답장을 추천해 드립니다.
        </p>
      </header>

      <div
        className="respondy-home-features"
        role="navigation"
        aria-label="기능 바로가기"
      >
        {homeFeatures.map((feature) => (
          <button
            key={feature.key}
            type="button"
            className="respondy-home-feature-card"
            onClick={() => setSelectedView(feature.key)}
          >
            <span className="respondy-home-feature-tag">{feature.tag}</span>
            <h3 className="respondy-home-feature-title">{feature.title}</h3>
            <p className="respondy-home-feature-desc">{feature.description}</p>
            <span className="respondy-home-feature-cta">시작하기 →</span>
          </button>
        ))}
      </div>
    </section>
  );

  const renderHelpView = () => (
    <section className="respondy-center">
      <article className="respondy-card respondy-help-card">
        <h2 className="respondy-title respondy-title--card">사용 설명</h2>
        <p className="respondy-help-intro">
          RESPONDY는 상대와의 대화를 더 자연스럽게 이어가기 위한 실시간
          커뮤니케이션 코치 앱입니다.
        </p>
        <div className="respondy-help-sections">
          <section>
            <h3 className="respondy-help-subtitle">1) 실시간 분석</h3>
            <p>
              상대 메시지를 입력하고 실시간 분석을 시작하면 감정 흐름과 맥락,
              추천 답장을 확인할 수 있습니다.
            </p>
          </section>
          <section>
            <h3 className="respondy-help-subtitle">2) 수동 입력</h3>
            <p>
              특정 상황을 직접 입력해 결과를 보고 싶을 때 사용합니다. 메시지와
              상황을 적으면 분석 결과를 즉시 확인할 수 있습니다.
            </p>
          </section>
          <section>
            <h3 className="respondy-help-subtitle">3) AI챗</h3>
            <p>
              대화 연습이 필요할 때 AI챗에서 톤과 표현을 점검할 수 있습니다.
              Enter 전송, Shift+Enter 줄바꿈이 가능합니다.
            </p>
          </section>
          <section>
            <h3 className="respondy-help-subtitle">4) 마이페이지</h3>
            <p>
              분석 기록과 인물 정보를 저장/관리할 수 있습니다. 기록 또는 인물
              항목을 누르면 상세 내용을 다시 볼 수 있습니다.
            </p>
          </section>
        </div>
        <button
          className="respondy-primary-btn"
          type="button"
          onClick={() => setSelectedView("home")}
        >
          홈으로 돌아가기
        </button>
      </article>
    </section>
  );

  const renderMainContent = () => {
    if (!authReady) {
      return (
        <section className="respondy-center respondy-center--auth">
          <article className="respondy-card respondy-auth-card respondy-auth-card--status">
            <p className="respondy-helper-text">로그인 상태를 확인하는 중...</p>
          </article>
        </section>
      );
    }

    if (!loggedIn) {
      return (
        <section className="respondy-center respondy-center--auth">
          {renderAuthCard()}
        </section>
      );
    }

    if (selectedView === "home") return renderHomeView();
    if (selectedView === "manual") return renderManualView();
    if (selectedView === "chat") return renderChatView();
    if (selectedView === "mypage") return renderMyPage();
    if (selectedView === "help") return renderHelpView();
    return renderRealtimeView();
  };

  const historyDetail =
    historyDetailRecord ??
    (historyDetailId
      ? (analysisHistory.find((r) => r.id === historyDetailId) ?? null)
      : null);
  const historyPersonFromTitle = historyDetail?.title
    ? personProfiles.find((person) => historyDetail.title.includes(person.name))
    : undefined;
  const historyRelationDisplay =
    historyDetail &&
    (historyDetail.relation === historyPersonFromTitle?.name ||
      historyDetail.relation === "—" ||
      !historyDetail.relation.trim())
      ? historyPersonFromTitle?.currentRelation || "—"
      : historyDetail?.relation || "—";
  const historyGoalRelationDisplay =
    historyDetail &&
    (historyDetail.goalRelation === "대화 유지" ||
      historyDetail.goalRelation === "—" ||
      !historyDetail.goalRelation.trim())
      ? historyPersonFromTitle?.goalRelation || "—"
      : historyDetail?.goalRelation || "—";
  const historyAnalysisSections: AnalysisHistorySection[] = historyDetail
    ? historyDetail.analysisSections?.length
      ? historyDetail.analysisSections
      : [
          {
            id: `${historyDetail.id}-summary`,
            at: historyDetail.at,
            emotion: historyDetail.emotion,
            context: historyDetail.context,
            suggestions: historyDetail.suggestions,
          },
        ]
    : [];
  const personDetail = personDetailId
    ? personProfiles.find((person) => person.id === personDetailId)
    : undefined;

  return (
    <div
      className={`respondy-shell${!loggedIn ? " respondy-shell--auth" : ""}`}
    >
      <header className="respondy-header">
        {loggedIn ? (
          <button
            type="button"
            className={`respondy-logo respondy-logo-btn ${selectedView === "home" ? "is-active" : ""}`}
            onClick={() => setSelectedView("home")}
          >
            RESPONDY
          </button>
        ) : (
          <h1 className="respondy-logo">RESPONDY</h1>
        )}
        {loggedIn ? (
          <nav className="respondy-nav" aria-label="주요 메뉴">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`respondy-nav-item ${selectedView === item.key ? "is-active" : ""}`}
                onClick={() => setSelectedView(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="respondy-header-spacer-grow" aria-hidden />
        )}
        <div className="respondy-header-trailing">
          {loggedIn ? (
            <>
              <button
                className="respondy-help-btn"
                type="button"
                aria-label="사용 설명 보기"
                onClick={() => setSelectedView("help")}
              >
                ?
              </button>
              <button
                className="respondy-logout-btn"
                type="button"
                disabled={authBusy}
                onClick={() => {
                  void (async () => {
                    const respondy = getRespondy();
                    setAuthBusy(true);
                    setAuthError(null);
                    try {
                      await respondy?.logout();
                    } catch (e) {
                      const message =
                        e instanceof Error
                          ? e.message
                          : "로그아웃에 실패했습니다.";
                      setAuthError(message);
                    } finally {
                      void stopRealtimeDetection();
                      setLoggedIn(false);
                      setAuthView("login");
                      setSelectedView("home");
                      setAnalysisHistory([]);
                      setHistoryDetailId(null);
                      setAuthBusy(false);
                    }
                  })();
                }}
              >
                로그아웃
              </button>
            </>
          ) : (
            <span className="respondy-header-spacer" aria-hidden />
          )}
        </div>
      </header>

      <main
        className={`respondy-main${!loggedIn ? " respondy-main--auth" : ""}`}
      >
        {renderMainContent()}
      </main>

      {loggedIn && showPrivacyConsentModal && (
        <div className="respondy-modal-backdrop" role="presentation">
          <div
            className="respondy-modal respondy-person-modal respondy-consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-consent-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">필수 동의</p>
                <h2
                  id="privacy-consent-modal-title"
                  className="respondy-modal-title"
                >
                  개인정보 수집 및 이용 동의
                </h2>
              </div>
            </div>
            <div className="respondy-modal-body respondy-consent-modal-body">
              <p className="respondy-consent-desc">
                분석 기능 사용을 위해 개인정보 수집 및 이용 동의가 필요합니다.
              </p>
              <label
                className="respondy-consent-checkrow"
                htmlFor="privacy-consent"
              >
                <input
                  id="privacy-consent"
                  type="checkbox"
                  className="respondy-consent-checkbox"
                  checked={privacyConsentChecked}
                  onChange={(e) => setPrivacyConsentChecked(e.target.checked)}
                  disabled={privacyConsentBusy}
                />
                <span className="respondy-consent-checklabel">
                  개인정보 수집 및 이용에 동의합니다.
                </span>
              </label>
              <div className="respondy-modal-actions respondy-consent-actions">
                <button
                  type="button"
                  className="respondy-primary-btn respondy-modal-primary-btn"
                  onClick={() => void submitPrivacyConsent()}
                  disabled={!privacyConsentChecked || privacyConsentBusy}
                >
                  {privacyConsentBusy ? "처리 중..." : "확인"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedIn && showProfileEditModal && (
        <div
          className="respondy-modal-backdrop"
          role="presentation"
          onClick={closeProfileEditModal}
        >
          <div
            className="respondy-modal respondy-person-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-edit-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">프로필 수정</p>
                <h2
                  id="profile-edit-modal-title"
                  className="respondy-modal-title"
                >
                  내 정보 편집
                </h2>
              </div>
              <button
                type="button"
                className="respondy-modal-close"
                onClick={closeProfileEditModal}
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="respondy-modal-body">
              <div className="respondy-person-form-grid">
                <label className="respondy-label" htmlFor="profile-name">
                  아이디
                </label>
                <input
                  id="profile-name"
                  className="respondy-input"
                  value={editProfileName}
                  readOnly
                  disabled
                  autoComplete="name"
                />
                <p className="respondy-helper-text respondy-helper-text--inline">
                  아이디는 변경할 수 없습니다.
                </p>
                <label className="respondy-label" htmlFor="profile-email">
                  이메일
                </label>
                <input
                  id="profile-email"
                  className="respondy-input"
                  type="email"
                  value={editProfileEmail}
                  onChange={(e) => setEditProfileEmail(e.target.value)}
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                />
                <label className="respondy-label" htmlFor="profile-birthdate">
                  생년월일
                </label>
                <input
                  id="profile-birthdate"
                  type="date"
                  className="respondy-input"
                  value={editProfileBirthDate}
                  onChange={(e) => setEditProfileBirthDate(e.target.value)}
                />
              </div>
              <div className="respondy-modal-actions">
                <button
                  type="button"
                  className="respondy-modal-secondary-btn"
                  onClick={closeProfileEditModal}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="respondy-primary-btn respondy-modal-primary-btn"
                  onClick={() => void saveProfile()}
                  disabled={!editProfileName.trim() || !editProfileEmail.trim()}
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedIn && showPasswordChangeModal && (
        <div
          className="respondy-modal-backdrop"
          role="presentation"
          onClick={closePasswordChangeModal}
        >
          <div
            className="respondy-modal respondy-person-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-change-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">보안 설정</p>
                <h2
                  id="password-change-modal-title"
                  className="respondy-modal-title"
                >
                  비밀번호 변경
                </h2>
              </div>
              <button
                type="button"
                className="respondy-modal-close"
                onClick={closePasswordChangeModal}
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="respondy-modal-body">
              <div className="respondy-person-form-grid">
                <label className="respondy-label" htmlFor="current-password">
                  현재 비밀번호
                </label>
                <input
                  id="current-password"
                  className="respondy-input"
                  type="password"
                  value={currentPasswordInput}
                  onChange={(e) => {
                    setCurrentPasswordInput(e.target.value);
                    setPasswordChangeError("");
                  }}
                  autoComplete="current-password"
                />
                <label className="respondy-label" htmlFor="new-password">
                  새 비밀번호
                </label>
                <input
                  id="new-password"
                  className="respondy-input"
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setPasswordChangeError("");
                  }}
                  autoComplete="new-password"
                />
                <label className="respondy-label" htmlFor="confirm-password">
                  새 비밀번호 확인
                </label>
                <input
                  id="confirm-password"
                  className="respondy-input"
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    setPasswordChangeError("");
                  }}
                  autoComplete="new-password"
                />
              </div>
              {passwordChangeError && (
                <p className="respondy-helper-text respondy-helper-text--inline">
                  {passwordChangeError}
                </p>
              )}
              <div className="respondy-modal-actions">
                <button
                  type="button"
                  className="respondy-modal-secondary-btn"
                  onClick={closePasswordChangeModal}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="respondy-primary-btn respondy-modal-primary-btn"
                  onClick={() => void saveChangedPassword()}
                  disabled={
                    !currentPasswordInput ||
                    !newPasswordInput ||
                    !confirmPasswordInput
                  }
                >
                  변경하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedIn && showPersonCreateModal && (
        <div
          className="respondy-modal-backdrop"
          role="presentation"
          onClick={closePersonCreateModal}
        >
          <div
            className="respondy-modal respondy-person-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-create-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">인물 생성</p>
                <h2
                  id="person-create-modal-title"
                  className="respondy-modal-title"
                >
                  새 인물 만들기
                </h2>
              </div>
              <button
                type="button"
                className="respondy-modal-close"
                onClick={closePersonCreateModal}
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="respondy-modal-body">
              <div className="respondy-person-form-grid">
                <label className="respondy-label" htmlFor="person-name">
                  이름
                </label>
                <input
                  id="person-name"
                  className="respondy-input"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder="예: 김민지"
                  autoComplete="off"
                />
                <label className="respondy-label" htmlFor="person-age-group">
                  나이대
                </label>
                <select
                  id="person-age-group"
                  className="respondy-input respondy-select"
                  value={newPersonBirthDate}
                  onChange={(e) => setNewPersonBirthDate(e.target.value)}
                >
                  <option value="">나이대를 선택하세요</option>
                  {AGE_GROUP_OPTIONS.map((ageGroup) => (
                    <option key={ageGroup} value={ageGroup}>
                      {ageGroup}
                    </option>
                  ))}
                </select>
                <label
                  className="respondy-label"
                  htmlFor="person-current-relation"
                >
                  현재 관계
                </label>
                <input
                  id="person-current-relation"
                  className="respondy-input"
                  value={newPersonCurrentRelation}
                  onChange={(e) => setNewPersonCurrentRelation(e.target.value)}
                  placeholder="예: 선후배"
                  autoComplete="off"
                />
                <label
                  className="respondy-label"
                  htmlFor="person-goal-relation"
                >
                  목표 관계
                </label>
                <input
                  id="person-goal-relation"
                  className="respondy-input"
                  value={newPersonGoalRelation}
                  onChange={(e) => setNewPersonGoalRelation(e.target.value)}
                  placeholder="예: 친한 친구"
                  autoComplete="off"
                />
                <label className="respondy-label" htmlFor="person-personality">
                  성격
                </label>
                <textarea
                  id="person-personality"
                  className="respondy-textarea"
                  value={newPersonPersonality}
                  onChange={(e) => setNewPersonPersonality(e.target.value)}
                  placeholder="예: 조용하지만 배려심이 많음"
                />
                <label className="respondy-label" htmlFor="person-speech-style">
                  말투
                </label>
                <textarea
                  id="person-speech-style"
                  className="respondy-textarea"
                  value={newPersonSpeechStyle}
                  onChange={(e) => setNewPersonSpeechStyle(e.target.value)}
                  placeholder="예: 짧고 캐주얼한 말투를 자주 사용함"
                />
                <label className="respondy-label" htmlFor="person-background">
                  배경
                </label>
                <textarea
                  id="person-background"
                  className="respondy-textarea"
                  value={newPersonBackground}
                  onChange={(e) => setNewPersonBackground(e.target.value)}
                  placeholder="예: 동아리에서 자주 만나고 수업도 같이 듣는 사이"
                />
                <label className="respondy-label" htmlFor="person-notes">
                  특이사항
                </label>
                <textarea
                  id="person-notes"
                  className="respondy-textarea"
                  value={newPersonNotes}
                  onChange={(e) => setNewPersonNotes(e.target.value)}
                  placeholder="예: 주말엔 답장이 늦는 편"
                />
              </div>
              <div className="respondy-modal-actions">
                <button
                  type="button"
                  className="respondy-modal-secondary-btn"
                  onClick={closePersonCreateModal}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="respondy-primary-btn respondy-modal-primary-btn"
                  onClick={() => void createPersonProfile()}
                  disabled={!newPersonName.trim() || isCreatingPerson}
                >
                  {isCreatingPerson ? "생성 중..." : "인물 생성"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedIn && personDetail && (
        <div
          className="respondy-modal-backdrop"
          role="presentation"
          onClick={closePersonDetailModal}
        >
          <div
            className="respondy-modal respondy-person-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-detail-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">인물 상세</p>
                <h2
                  id="person-detail-modal-title"
                  className="respondy-modal-title"
                >
                  인물 정보 수정
                </h2>
              </div>
              <button
                type="button"
                className="respondy-modal-close"
                onClick={closePersonDetailModal}
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="respondy-modal-body">
              <div className="respondy-person-form-grid">
                <label className="respondy-label" htmlFor="person-detail-name">
                  이름
                </label>
                <input
                  id="person-detail-name"
                  className="respondy-input"
                  value={editPersonName}
                  onChange={(e) => setEditPersonName(e.target.value)}
                  autoComplete="off"
                />
                <label
                  className="respondy-label"
                  htmlFor="person-detail-age-group"
                >
                  나이대
                </label>
                <select
                  id="person-detail-age-group"
                  className="respondy-input respondy-select"
                  value={editPersonBirthDate}
                  onChange={(e) => setEditPersonBirthDate(e.target.value)}
                >
                  <option value="">나이대를 선택하세요</option>
                  {AGE_GROUP_OPTIONS.map((ageGroup) => (
                    <option key={ageGroup} value={ageGroup}>
                      {ageGroup}
                    </option>
                  ))}
                </select>
                <label
                  className="respondy-label"
                  htmlFor="person-detail-current-relation"
                >
                  현재 관계
                </label>
                <input
                  id="person-detail-current-relation"
                  className="respondy-input"
                  value={editPersonCurrentRelation}
                  onChange={(e) => setEditPersonCurrentRelation(e.target.value)}
                  autoComplete="off"
                />
                <label
                  className="respondy-label"
                  htmlFor="person-detail-goal-relation"
                >
                  목표 관계
                </label>
                <input
                  id="person-detail-goal-relation"
                  className="respondy-input"
                  value={editPersonGoalRelation}
                  onChange={(e) => setEditPersonGoalRelation(e.target.value)}
                  autoComplete="off"
                />
                <label
                  className="respondy-label"
                  htmlFor="person-detail-personality"
                >
                  성격
                </label>
                <textarea
                  id="person-detail-personality"
                  className="respondy-textarea"
                  value={editPersonPersonality}
                  onChange={(e) => setEditPersonPersonality(e.target.value)}
                />
                <label
                  className="respondy-label"
                  htmlFor="person-detail-speech-style"
                >
                  말투
                </label>
                <textarea
                  id="person-detail-speech-style"
                  className="respondy-textarea"
                  value={editPersonSpeechStyle}
                  onChange={(e) => setEditPersonSpeechStyle(e.target.value)}
                />
                <label
                  className="respondy-label"
                  htmlFor="person-detail-background"
                >
                  배경
                </label>
                <textarea
                  id="person-detail-background"
                  className="respondy-textarea"
                  value={editPersonBackground}
                  onChange={(e) => setEditPersonBackground(e.target.value)}
                />
                <label className="respondy-label" htmlFor="person-detail-notes">
                  특이사항
                </label>
                <textarea
                  id="person-detail-notes"
                  className="respondy-textarea"
                  value={editPersonNotes}
                  onChange={(e) => setEditPersonNotes(e.target.value)}
                />
              </div>
              <div className="respondy-modal-actions">
                <button
                  type="button"
                  className="respondy-modal-secondary-btn"
                  onClick={closePersonDetailModal}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="respondy-primary-btn respondy-modal-primary-btn"
                  onClick={() => void savePersonDetail()}
                  disabled={!editPersonName.trim()}
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedIn && historyDetail && (
        <div
          className="respondy-modal-backdrop"
          role="presentation"
          onClick={() => setHistoryDetailId(null)}
        >
          <div
            className="respondy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="respondy-modal-head">
              <div className="respondy-modal-head-text">
                <p className="respondy-modal-eyebrow">저장된 분석</p>
                <h2 id="history-modal-title" className="respondy-modal-title">
                  분석 기록 상세
                </h2>
              </div>
              <button
                type="button"
                className="respondy-modal-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryDetailId(null);
                }}
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="respondy-modal-meta">
              <span
                className={`respondy-modal-badge ${historyDetail.source === "realtime" ? "is-realtime" : "is-manual"}`}
              >
                {historyDetail.source === "realtime"
                  ? "실시간 분석"
                  : "수동 입력"}
              </span>
              <span className="respondy-modal-meta-sep" aria-hidden>
                ·
              </span>
              <span className="respondy-modal-time">
                {new Date(historyDetail.at).toLocaleString("ko-KR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </span>
            </div>
            <div className="respondy-modal-body">
              <section className="respondy-modal-section respondy-modal-panel">
                <h3 className="respondy-modal-section-title">입력 요약</h3>
                <dl className="respondy-modal-dl">
                  <dt>제목</dt>
                  <dd>{historyDetail.title || "—"}</dd>
                  <dt>상대방과의 관계</dt>
                  <dd>{historyRelationDisplay}</dd>
                  <dt>목표 관계</dt>
                  <dd>{historyGoalRelationDisplay}</dd>
                  <dt>상황 설명</dt>
                  <dd className="respondy-modal-pre">
                    {historyDetail.situation || "—"}
                  </dd>
                  {historyDetail.source === "manual" && (
                    <>
                      <dt>받은 메시지</dt>
                      <dd className="respondy-modal-pre">
                        {historyDetail.receivedMessage || "—"}
                      </dd>
                    </>
                  )}
                </dl>
              </section>
              <section className="respondy-modal-section respondy-history-session-section">
                <h3 className="respondy-modal-section-title respondy-history-session-title">
                  세션별 AI 분석
                </h3>
                <div className="respondy-history-session-list">
                  {historyAnalysisSections.map((section, sectionIndex) => (
                    <article
                      key={section.id}
                      className="respondy-history-session-card"
                    >
                      <div className="respondy-history-session-card-head">
                        <span className="respondy-history-session-card-title">
                          분석 {sectionIndex + 1}
                        </span>
                        <span className="respondy-history-session-card-time">
                          {new Date(section.at).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="respondy-modal-label">감정 분석</p>
                      <div className="respondy-modal-textbox">
                        {section.emotion}
                      </div>
                      <p className="respondy-modal-label">맥락 해석</p>
                      <div className="respondy-modal-textbox">
                        {section.context}
                      </div>
                      <p className="respondy-modal-label">추천 답장</p>
                      <ul className="respondy-modal-suggestions">
                        {section.suggestions.map((s, i) => {
                          const copyId = `history-${historyDetail.id}-${section.id}-${i}`;
                          return (
                            <li
                              key={`${section.id}-s-${i}`}
                              className="respondy-modal-suggestion"
                            >
                              <span className="respondy-modal-suggestion-index">
                                {i + 1}
                              </span>
                              <span className="respondy-modal-suggestion-text">
                                {s}
                              </span>
                              <button
                                type="button"
                                className="respondy-modal-copy-btn"
                                onClick={() => void copySuggestion(s, copyId)}
                              >
                                {copiedSuggestionId === copyId
                                  ? "복사됨"
                                  : "복사하기"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
