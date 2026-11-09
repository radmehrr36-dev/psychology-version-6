import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { friendlyError, supabase, supabaseConfigured } from "./supabase";
import { invokeFunction, type ChallengeInfo } from "./gateway";
import type { AccountKind, Profile } from "./types";

export type { ChallengeInfo } from "./gateway";

export interface RegisterInput {
  kind: AccountKind;
  fullName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
  /** حساب تأییدنشده: کاربر باید کد OTP را وارد کند */
  needsVerification?: boolean;
  challenge?: ChallengeInfo;
  profile?: Profile | null;
  emailConfirmationSent?: boolean;
  /** تصمیم سرور: نشست واردشده هنوز به تأیید شماره نیاز دارد */
  requiresPhoneVerification?: boolean;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  permissions: string[];
  error: string | null;
  /** identifier: ایمیل، شماره‌ی موبایل یا نام کاربری */
  signIn: (identifier: string, password: string) => Promise<AuthResult>;
  /** ثبت‌نام عمومی؛ فقط user / psychologist / support_specialist. نقش مدیریتی از اینجا ساخته نمی‌شود */
  registerAccount: (input: RegisterInput) => Promise<AuthResult>;
  verifyOtp: (challenge: string, code: string) => Promise<{ ok: boolean; error?: string; accountKind?: AccountKind; accountStatus?: string }>;
  resendOtp: (challenge?: string) => Promise<AuthResult>;
  signOut: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
  can: (resource: string, action: string) => boolean;
  hasAnyRole: boolean;
  accountKind: AccountKind;
  isPsychologist: boolean;
  isSupportSpecialist: boolean;
  /** فقط وقتی migration اعمال شده و contact_verified_at صراحتاً null است (ثبت‌نام‌شده‌ی تأییدنشده) */
  needsVerification: boolean;
  /** مقصد پنل بر اساس داده‌ی سمت‌سرور پروفایل */
  homePath: string;
}

/** مقصد بعد از ورود: فقط بر اساس نقش/نوع حساب واقعی پروفایل (نه query یا localStorage) */
export function homePathFor(profile: Pick<Profile, "role" | "account_status" | "account_kind"> | null | undefined): string {
  if (!profile) return "/account";
  if (profile.role && profile.account_status === "active") return "/admin";
  if (profile.account_kind === "psychologist") return "/pro";
  if (profile.account_kind === "support_specialist") return "/desk";
  return "/account";
}

const PROFILE_SELECTS = [
  "id,email,full_name,avatar_url,role,account_status,account_kind,username,phone,phone_verified_at,contact_verified_at,last_seen_at,created_at,updated_at",
  // پیش از migration 20261109000000
  "id,email,full_name,avatar_url,role,account_status,account_kind,last_seen_at,created_at,updated_at",
  // پیش از migration حساب‌ها (20260105)
  "id,email,full_name,avatar_url,role,account_status,last_seen_at,created_at,updated_at",
];

const BAD_CREDENTIALS = "اطلاعات ورود نادرست است.";
const NOT_CONFIGURED = "Supabase پیکربندی نشده است.";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // پیش‌فرض امن: هر پروفایل بدون نقش و بدون contact_verified_at نیازمند تأیید شماره است،
  // مگر سرور (auth-gateway / session_status) صراحتاً معافیت حساب آزمایشی را تأیید کند.
  const [phoneRequired, setPhoneRequired] = useState(false);
  const phoneRequiredRef = useRef(false);

  const loadProfile = useCallback(async (nextSession: Session | null): Promise<Profile | null> => {
    if (!supabase || !nextSession?.user) {
      setProfile(null);
      setPermissions([]);
      setLoading(false);
      return null;
    }
    try {
      let data: Profile | null = null;
      let lastError: { message: string } | null = null;
      for (const select of PROFILE_SELECTS) {
        const res = await supabase.from("profiles").select(select).eq("id", nextSession.user.id).maybeSingle();
        if (!res.error) {
          data = (res.data as unknown as Profile | null) ?? null;
          lastError = null;
          break;
        }
        lastError = res.error;
        // فقط خطای «ستون وجود ندارد» به انتخاب قدیمی‌تر می‌رود
        if (!/column|schema cache|does not exist/i.test(res.error.message)) break;
      }
      if (lastError) throw lastError;

      let required = Boolean(data && !data.role && !data.contact_verified_at);
      if (required) {
        const status = await invokeFunction<{ ok: boolean; phoneVerificationRequired?: boolean }>("auth-gateway", { action: "session_status" });
        // فقط پاسخ صریح سرور معافیت می‌دهد؛ خطا یا نبود Function = همان رفتار قبلی (نیاز به تأیید)
        if (status.ok && status.data.phoneVerificationRequired === false) required = false;
      }
      phoneRequiredRef.current = required;
      setPhoneRequired(required);
      setProfile(data);
      void supabase.rpc("touch_last_seen").then(() => undefined, () => undefined);

      if (data?.role && data.account_status === "active") {
        const { data: perms, error: permError } = await supabase.from("role_permissions").select("resource,action").eq("role", data.role);
        if (permError) throw permError;
        setPermissions((perms ?? []).map((p: { resource: string; action: string }) => `${p.resource}.${p.action}`));
      } else {
        setPermissions([]);
      }
      return data;
    } catch (e) {
      setError(friendlyError(e));
      phoneRequiredRef.current = false;
      setPhoneRequired(false);
      setProfile(null);
      setPermissions([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void loadProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(nextSession);
        if (event === "SIGNED_IN") setLoading(true);
        // callback باید همگام بماند؛ فراخوانی Supabase را به بعد از آن می‌سپاریم
        window.setTimeout(() => void loadProfile(nextSession), 0);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const startSession = useCallback(
    async (s: Session | null): Promise<AuthResult> => {
      setSession(s);
      const p = await loadProfile(s);
      if (!s || !p) {
        await supabase?.auth.signOut({ scope: "local" });
        setSession(null);
        return { ok: false, error: "اطلاعات حساب دریافت نشد. دوباره تلاش کنید یا با پشتیبانی تماس بگیرید." };
      }
      return { ok: true, profile: p, requiresPhoneVerification: phoneRequiredRef.current };
    },
    [loadProfile]
  );

  const signIn = useCallback(
    async (identifier: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: NOT_CONFIGURED };
      setError(null);
      const id = identifier.trim();

      // ایمیل: مستقیم با Supabase Auth (بدون نیاز به Edge Function؛ ورود مدیران همین مسیر است)
      if (id.includes("@")) {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: id, password });
        if (!signInError) return startSession(data.session);
        if (/email not confirmed/i.test(signInError.message)) {
          return { ok: false, error: "اطلاعات ورود نادرست است یا تأیید حساب کامل نشده است." };
        }
        return { ok: false, error: /invalid|credentials/i.test(signInError.message) ? BAD_CREDENTIALS : friendlyError(signInError) };
      }

      // موبایل / نام کاربری: جستجو فقط سمت سرور
      const res = await invokeFunction<
        { ok: boolean; needsVerification?: boolean; session?: { access_token: string; refresh_token: string } } & Partial<ChallengeInfo>
      >("auth-gateway", { action: "login", identifier: id, password });
      if (!res.ok) return { ok: false, error: res.status === 401 ? BAD_CREDENTIALS : res.message };
      if (res.data.needsVerification && res.data.challenge) {
        return {
          ok: false,
          needsVerification: true,
          challenge: { challenge: res.data.challenge, expiresIn: res.data.expiresIn ?? 120, resendAfter: res.data.resendAfter ?? 45 },
        };
      }
      if (!res.data.session) return { ok: false, error: BAD_CREDENTIALS };
      const { data, error: sessionError } = await supabase.auth.setSession(res.data.session);
      if (sessionError) return { ok: false, error: friendlyError(sessionError) };
      return startSession(data.session);
    },
    [startSession]
  );

  const registerAccount = useCallback(async (input: RegisterInput): Promise<AuthResult> => {
    const res = await invokeFunction<ChallengeInfo & { emailConfirmationSent?: boolean }>("auth-gateway", { action: "register", ...input });
    if (!res.ok) return { ok: false, error: res.message, fields: res.fields };
    return { ok: true, challenge: { challenge: res.data.challenge, expiresIn: res.data.expiresIn, resendAfter: res.data.resendAfter }, emailConfirmationSent: res.data.emailConfirmationSent };
  }, []);

  const verifyOtp = useCallback(async (challenge: string, code: string) => {
    const res = await invokeFunction<{ ok: boolean }>("auth-gateway", { action: "verify", challenge, code });
    if (!res.ok) return { ok: false, error: res.message };
    return { ok: res.data.ok };
  }, []);

  const resendOtp = useCallback(async (challenge?: string): Promise<AuthResult> => {
    const res = await invokeFunction<ChallengeInfo>("auth-gateway", { action: "resend", ...(challenge ? { challenge } : {}) });
    if (!res.ok) return { ok: false, error: res.message };
    return { ok: true, challenge: { challenge: res.data.challenge, expiresIn: res.data.expiresIn, resendAfter: res.data.resendAfter } };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return false;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError("خروج از حساب انجام نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.");
      return false;
    }
    setError(null);
    setSession(null);
    setProfile(null);
    setPermissions([]);
    return true;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { ok: false, error: NOT_CONFIGURED };
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) return { ok: false, error: friendlyError(resetError) };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return { ok: false, error: NOT_CONFIGURED };
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return { ok: false, error: /same|different/i.test(updateError.message) ? "رمز جدید باید با رمز قبلی متفاوت باشد." : /password/i.test(updateError.message) ? "رمز عبور به‌اندازه‌ی کافی قوی نیست." : friendlyError(updateError) };
    }
    return { ok: true };
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const can = useCallback(
    (resource: string, action: string) => {
      if (!profile || profile.account_status !== "active" || !profile.role) return false;
      if (profile.role === "super_admin") return true;
      return (
        permissions.includes(`${resource}.${action}`) ||
        permissions.includes(`${resource}.*`) ||
        permissions.includes(`*.${action}`) ||
        permissions.includes("*.*")
      );
    },
    [profile, permissions]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      profile,
      permissions,
      error,
      signIn,
      registerAccount,
      verifyOtp,
      resendOtp,
      signOut,
      resetPassword,
      updatePassword,
      refresh,
      can,
      hasAnyRole: Boolean(profile?.role && profile.account_status === "active"),
      accountKind: profile?.account_kind ?? "user",
      isPsychologist: profile?.account_kind === "psychologist",
      isSupportSpecialist: profile?.account_kind === "support_specialist",
      needsVerification: Boolean(profile) && phoneRequired,
      homePath: homePathFor(profile),
    }),
    [loading, session, profile, permissions, error, phoneRequired, signIn, registerAccount, verifyOtp, resendOtp, signOut, resetPassword, updatePassword, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
