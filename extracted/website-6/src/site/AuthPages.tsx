import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AtSign,
  Check,
  Eye,
  EyeOff,
  Headset,
  Loader2,
  LockKeyhole,
  Mail,
  MailCheck,
  Phone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { homePathFor, useAuth, type ChallengeInfo } from "../lib/auth";
import type { AccountKind, Profile } from "../lib/types";
import { cn } from "../utils/cn";

/* ───────────────────────── اجزای مشترک ───────────────────────── */

const faDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

function useNextPath() {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !/^\/(login|register|verify)/.test(next) ? next : null;
}

/** مقصد بعد از ورود: مدیر همیشه به پنل مدیریت؛ بقیه به مسیر درخواستی (در صورت امن بودن) یا پنل نوع حساب */
function destinationFor(profile: Profile | null | undefined, next: string | null): string {
  const home = homePathFor(profile);
  if (profile?.role && profile.account_status === "active") return home;
  return next ?? home;
}

function AuthLayout({ title, subtitle, icon: Icon, children, wide = false }: { title: string; subtitle: string; icon: LucideIcon; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto grid w-full items-stretch gap-6", wide ? "max-w-6xl" : "max-w-5xl lg:grid-cols-[1.05fr_0.95fr]")}>
      <div className="card-glass p-6 sm:p-9">
        <div className="mb-7 flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steel/10 text-steel">
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
            <p className="text-[14px] leading-6 text-body">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
      {!wide && (
        <aside className="relative hidden overflow-hidden rounded-[32px] border border-white/80 bg-gradient-to-br from-haze via-white to-cream-alt shadow-card lg:block" aria-hidden="true">
          <div className="ai-halo absolute -top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full blur-2xl" />
          <img src="/images/hero-brain.png" alt="" className="fade-edges relative mx-auto mt-6 h-[22rem] w-full object-cover object-[50%_42%]" />
          <ul className="relative space-y-3 px-8 pb-8">
            {[
              [ShieldCheck, "حریم خصوصی محافظت‌شده؛ نتایج فقط برای شماست."],
              [Sparkles, "گزارش‌های شخصی و تمرین‌های روزانه."],
              [Stethoscope, "ساخته‌شده با همراهی متخصصان؛ جایگزین درمان نیست."],
            ].map(([I, text]) => {
              const Ico = I as LucideIcon;
              return (
                <li key={text as string} className="chip-glass flex items-center gap-3 px-4 py-3 text-[14px] font-semibold text-ink">
                  <Ico className="h-4.5 w-4.5 shrink-0 text-steel" strokeWidth={1.8} />
                  {text as string}
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const style = tone === "error" ? "bg-[#fbeceb] text-[#8f322d]" : tone === "success" ? "bg-[#e7f5f0] text-[#256b5e]" : "bg-steel/8 text-steel-deep";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-2xl px-4 py-3 text-[14px] font-semibold leading-7", style)}>
      {children}
    </p>
  );
}

function TextField({ label, icon: Icon, error, hint, className, ...rest }: { label: string; icon?: LucideIcon; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-bold text-ink">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />}
        <input {...rest} aria-invalid={error ? true : undefined} className={cn("input-field", Icon && "pr-11", error && "border-[#c9605a]", className)} />
      </span>
      {error ? <span className="mt-1.5 block text-[13px] font-semibold text-[#a33a34]">{error}</span> : hint ? <span className="mt-1.5 block text-[13px] text-body">{hint}</span> : null}
    </label>
  );
}

function strengthOf(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Za-z\u0600-\u06FF]/.test(pw) && /[0-9۰-۹]/.test(pw)) score++;
  if (/[^A-Za-z0-9\u0600-\u06FF۰-۹]/.test(pw)) score++;
  return score;
}

function PasswordField({ label, value, onChange, autoComplete, error, showStrength = false }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; error?: string; showStrength?: boolean }) {
  const [show, setShow] = useState(false);
  const score = strengthOf(value);
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-ink">{label}</span>
        <span className="relative block">
          <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
          <input
            type={show ? "text" : "password"}
            dir="ltr"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            required
            aria-invalid={error ? true : undefined}
            className={cn("input-field pr-11 pl-12 text-left", error && "border-[#c9605a]")}
            placeholder="••••••••"
          />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "پنهان‌کردن رمز" : "نمایش رمز"} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-fog hover:text-ink">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {showStrength && value && (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? (score <= 1 ? "bg-[#d9776f]" : score === 2 ? "bg-[#e0a458]" : "bg-[#5aa78f]") : "bg-ink/10")} />
            ))}
          </div>
          <span className="text-[12.5px] font-semibold text-body">{score <= 1 ? "ضعیف" : score === 2 ? "متوسط" : "قوی"}</span>
        </div>
      )}
      {error && <span className="mt-1.5 block text-[13px] font-semibold text-[#a33a34]">{error}</span>}
    </div>
  );
}

function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled} className="btn-primary w-full">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ───────────────────────── کد تأیید (OTP) ───────────────────────── */

function useTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60).toLocaleString("fa-IR")}:${String(s % 60).padStart(2, "0").replace(/\d/g, (d) => Number(d).toLocaleString("fa-IR"))}`;
};

function OtpForm({ info, onInfo, onVerified, destinationHint }: { info: ChallengeInfo; onInfo: (c: ChallengeInfo) => void; onVerified: () => void | Promise<void>; destinationHint?: string }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + info.expiresIn * 1000);
  const [resendAt, setResendAt] = useState(() => Date.now() + info.resendAfter * 1000);
  const now = useTick();
  const submittingRef = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("کد تأیید ۶ رقمی است.");
    submittingRef.current = true;
    setBusy(true);
    const res = await verifyOtp(info.challenge, code);
    if (!res.ok) {
      setBusy(false);
      submittingRef.current = false;
      return setError(res.error ?? "تأیید کد ناموفق بود.");
    }
    await onVerified();
    setBusy(false);
    submittingRef.current = false;
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    const res = await resendOtp(info.challenge);
    setResending(false);
    if (!res.ok || !res.challenge) return setError(res.error ?? "ارسال دوباره‌ی کد ناموفق بود.");
    onInfo(res.challenge);
    setCode("");
    setExpiresAt(Date.now() + res.challenge.expiresIn * 1000);
    setResendAt(Date.now() + res.challenge.resendAfter * 1000);
    setNotice("اگر اطلاعات شما معتبر باشد، کد جدید ارسال شد.");
  };

  const expired = now >= expiresAt;
  const canResend = now >= resendAt && !resending;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone="info">
        اگر اطلاعات شما معتبر باشد، کد تأیید ۶ رقمی{destinationHint ? ` به شماره‌ی ${destinationHint}` : ""} ارسال شده است.
        {import.meta.env.DEV && " (محیط توسعه: کد در ترمینال سرور backend، یعنی خروجی supabase functions serve، چاپ می‌شود.)"}
      </Alert>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-ink">کد تأیید</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(faDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
          className="input-field text-center text-2xl font-bold tracking-[0.55em]"
          placeholder="------"
          aria-label="کد تأیید ۶ رقمی"
          autoFocus
        />
      </label>
      <p className={cn("text-center text-[14px] font-semibold", expired ? "text-[#a33a34]" : "text-body")} aria-live="polite">
        {expired ? "مدت اعتبار کد تمام شد؛ کد جدید بگیرید." : `اعتبار کد: ${mmss(expiresAt - now)}`}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <SubmitButton busy={busy} disabled={expired || code.length !== 6}>تأیید و ادامه</SubmitButton>
      <button type="button" onClick={() => void resend()} disabled={!canResend} className="mx-auto flex min-h-11 items-center gap-2 text-[14px] font-bold text-steel disabled:opacity-50">
        {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {canResend ? "ارسال دوباره‌ی کد" : `ارسال دوباره تا ${mmss(resendAt - now)}`}
      </button>
    </form>
  );
}

/* ───────────────────────── ورود ───────────────────────── */

export function LoginPage() {
  const { session, profile, loading, configured, signIn, needsVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = useNextPath();
  const flash = (location.state as { notice?: string } | null)?.notice;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session && profile) {
    return <Navigate to={needsVerification ? "/verify" : destinationFor(profile, next)} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!configured) return setError("اتصال به سرویس حساب کاربری برقرار نیست.");
    if (!identifier.trim() || !password) return setError("شناسه و رمز عبور را وارد کنید.");
    setBusy(true);
    const res = await signIn(identifier, password);
    setBusy(false);
    if (res.needsVerification && res.challenge) return navigate("/verify", { state: { challenge: res.challenge }, replace: true });
    if (!res.ok) return setError(res.error ?? "ورود ناموفق بود.");
    if (res.profile && !res.profile.role && res.profile.contact_verified_at === null) return navigate("/verify", { replace: true });
    navigate(destinationFor(res.profile, next), { replace: true });
  };

  return (
    <AuthLayout title="ورود به آریاسازه" subtitle="با ایمیل، شماره‌ی موبایل یا نام کاربری وارد شوید." icon={UserRound}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {flash && <Alert tone="success">{flash}</Alert>}
        <TextField label="ایمیل، موبایل یا نام کاربری" icon={AtSign} dir="ltr" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="text-left" placeholder="you@example.com  |  09123456789  |  username" />
        <PasswordField label="رمز عبور" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <Alert tone="error">{error}</Alert>}
        <SubmitButton busy={busy} disabled={!configured}>ورود</SubmitButton>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <Link to="/forgot-password" className="font-semibold text-steel hover:text-ink">رمز عبور را فراموش کرده‌اید؟</Link>
        <Link to={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-body hover:text-ink">حساب ندارید؟ ثبت‌نام</Link>
      </div>
    </AuthLayout>
  );
}

/* ───────────────────────── ثبت‌نام ───────────────────────── */

const KIND_CARDS: Array<{ kind: AccountKind; title: string; desc: string; cta: string; icon: LucideIcon; note?: string }> = [
  { kind: "user", title: "کاربر عادی", desc: "آزمون‌های خودشناسی، گزارش‌های شخصی، تمرین‌ها و پشتیبانی آنلاین برای شناخت بهتر خودتان.", cta: "ثبت‌نام به‌عنوان کاربر عادی", icon: UserRound },
  { kind: "psychologist", title: "روانشناس", desc: "پروفایل حرفه‌ای، ثبت مدارک و همکاری با آریاسازه در پنل مخصوص متخصصان.", cta: "ثبت‌نام به‌عنوان روانشناس", icon: Stethoscope, note: "پروفایل پس از بررسی مدارک فعال می‌شود." },
  { kind: "support_specialist", title: "متخصص پشتیبان", desc: "پاسخ‌گویی به پیام‌های کاربران و پیگیری تیکت‌ها در پنل مخصوص پشتیبانی.", cta: "ثبت‌نام به‌عنوان متخصص پشتیبان", icon: Headset, note: "فعال‌سازی حساب با تأیید مدیر انجام می‌شود." },
];

const KIND_LABEL: Record<AccountKind, string> = { user: "کاربر عادی", psychologist: "روانشناس", support_specialist: "متخصص پشتیبان" };

const maskPhone = (p: string) => {
  const d = faDigits(p).replace(/\D/g, "");
  return d.length >= 7 ? `${d.slice(0, 4)}***${d.slice(-3)}` : "";
};

export function RegisterPage() {
  const { session, profile, loading, configured, registerAccount, signIn, needsVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = useNextPath();
  const queryKind = new URLSearchParams(location.search).get("kind");
  const preset = KIND_CARDS.find((c) => c.kind === queryKind)?.kind ?? null;

  const [step, setStep] = useState<"kind" | "form" | "otp">(preset ? "form" : "kind");
  const [kind, setKind] = useState<AccountKind>(preset ?? "user");
  const [form, setForm] = useState({ fullName: "", username: "", email: "", phone: "", password: "", confirm: "" });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<ChallengeInfo | null>(null);

  if (!loading && session && profile && step !== "otp") {
    return <Navigate to={needsVerification ? "/verify" : destinationFor(profile, next)} replace />;
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errs.fullName = "نام و نام خانوادگی را وارد کنید.";
    if (!/^[a-zA-Z][a-zA-Z0-9_.]{2,23}$/.test(form.username.trim())) errs.username = "۳ تا ۲۴ کاراکتر انگلیسی (حرف، عدد، _ و .) و شروع با حرف.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "ایمیل معتبر وارد کنید.";
    if (!/^(\+98|0098|98|0)?9\d{9}$/.test(faDigits(form.phone).replace(/[\s-]/g, ""))) errs.phone = "شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789).";
    if (form.password.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(form.password) || !/[0-9۰-۹]/.test(form.password)) errs.password = "حداقل ۸ کاراکتر و شامل حرف و عدد باشد.";
    if (form.confirm !== form.password) errs.confirm = "تکرار رمز عبور یکسان نیست.";
    return errs;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!configured) return setError("اتصال به سرویس حساب کاربری برقرار نیست.");
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return setError("اطلاعات واردشده را بررسی کنید.");
    if (!accepted) return setError("پذیرش قوانین و حریم خصوصی لازم است.");
    setBusy(true);
    const res = await registerAccount({
      kind,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: faDigits(form.phone).replace(/[\s-]/g, ""),
      username: form.username.trim(),
      password: form.password,
    });
    setBusy(false);
    if (!res.ok || !res.challenge) {
      if (res.fields) setFieldErrors(res.fields);
      return setError(res.error ?? "ثبت‌نام ناموفق بود.");
    }
    setInfo(res.challenge);
    setStep("otp");
  };

  const afterVerified = async () => {
    const res = await signIn(form.email, form.password);
    setForm((f) => ({ ...f, password: "", confirm: "" })); // رمز از حافظه‌ی صفحه پاک می‌شود
    if (res.ok) navigate(destinationFor(res.profile, next), { replace: true });
    else navigate("/login", { replace: true, state: { notice: "شماره‌ی شما تأیید شد. اکنون وارد شوید." } });
  };

  if (step === "otp" && info) {
    return (
      <AuthLayout title="تأیید شماره‌ی موبایل" subtitle={`ثبت‌نام به‌عنوان ${KIND_LABEL[kind]}`} icon={MailCheck}>
        <OtpForm info={info} onInfo={setInfo} onVerified={afterVerified} destinationHint={maskPhone(form.phone)} />
        <p className="mt-5 text-center text-[13px] leading-6 text-body">
          قبلاً ثبت‌نام کرده‌اید؟ <Link to="/login" className="font-bold text-steel">وارد شوید</Link> یا <Link to="/forgot-password" className="font-bold text-steel">رمز را بازیابی کنید</Link>.
        </p>
      </AuthLayout>
    );
  }

  if (step === "kind") {
    return (
      <AuthLayout wide title="ساخت حساب" subtitle="نوع حساب خود را انتخاب کنید." icon={Sparkles}>
        <div className="grid gap-4 md:grid-cols-3">
          {KIND_CARDS.map((c) => (
            <button
              key={c.kind}
              type="button"
              onClick={() => { setKind(c.kind); setStep("form"); }}
              className="group flex flex-col rounded-3xl border border-ink/8 bg-white/80 p-6 text-right shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-steel/40 hover:shadow-card focus-visible:ring-4 focus-visible:ring-steel/15"
            >
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-steel/10 text-steel transition-colors group-hover:bg-steel group-hover:text-white">
                <c.icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="mb-2 text-lg font-semibold text-ink">{c.title}</span>
              <span className="mb-3 flex-1 text-[14px] leading-7 text-body">{c.desc}</span>
              {c.note && <span className="mb-4 text-[13px] font-semibold text-steel-deep">{c.note}</span>}
              <span className="inline-flex items-center gap-2 text-[14px] font-bold text-steel">
                {c.cta}
                <Check className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-[14px] text-body">
          قبلاً ثبت‌نام کرده‌اید؟ <Link to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-steel">وارد شوید</Link>
        </p>
      </AuthLayout>
    );
  }

  const card = KIND_CARDS.find((c) => c.kind === kind)!;
  return (
    <AuthLayout title={`ثبت‌نام ${card.title}`} subtitle="اطلاعات خود را وارد کنید؛ کد تأیید به موبایل شما ارسال می‌شود." icon={card.icon}>
      <button type="button" onClick={() => setStep("kind")} className="mb-5 text-[14px] font-bold text-steel hover:text-ink">← تغییر نوع حساب</button>
      {card.note && <div className="mb-4"><Alert tone="info">{card.note}</Alert></div>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="نام و نام خانوادگی" icon={UserRound} value={form.fullName} onChange={set("fullName")} autoComplete="name" error={fieldErrors.fullName} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="نام کاربری" icon={AtSign} dir="ltr" className="text-left" value={form.username} onChange={set("username")} autoComplete="username" error={fieldErrors.username} placeholder="username" />
          <TextField label="شماره‌ی موبایل" icon={Phone} dir="ltr" className="text-left" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" error={fieldErrors.phone} placeholder="09123456789" />
        </div>
        <TextField label="ایمیل" icon={Mail} type="email" dir="ltr" className="text-left" value={form.email} onChange={set("email")} autoComplete="email" error={fieldErrors.email} placeholder="you@example.com" />
        <PasswordField label="رمز عبور" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} autoComplete="new-password" showStrength error={fieldErrors.password} />
        <PasswordField label="تکرار رمز عبور" value={form.confirm} onChange={(v) => setForm((f) => ({ ...f, confirm: v }))} autoComplete="new-password" error={fieldErrors.confirm} />
        <label className="flex items-start gap-2.5 text-[14px] leading-6 text-body">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1.5 h-4 w-4 accent-[#4a58a6]" />
          <span>
            <Link to="/p/terms" className="font-bold text-steel">قوانین</Link> و <Link to="/p/privacy" className="font-bold text-steel">حریم خصوصی</Link> را می‌پذیرم. آزمون‌ها برای خودشناسی‌اند و جایگزین تشخیص یا درمان نیستند.
          </span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <SubmitButton busy={busy} disabled={!configured}>دریافت کد تأیید</SubmitButton>
      </form>
      <p className="mt-4 text-center text-[14px] text-body">
        قبلاً ثبت‌نام کرده‌اید؟ <Link to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-steel">وارد شوید</Link>
      </p>
    </AuthLayout>
  );
}

/* ───────────────────────── تأیید OTP برای حساب‌های تأییدنشده ───────────────────────── */

export function VerifyPage() {
  const { session, profile, loading, needsVerification, resendOtp, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = (location.state as { challenge?: ChallengeInfo } | null)?.challenge ?? null;
  const [info, setInfo] = useState<ChallengeInfo | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  // حساب واردشده و تأییدنشده: درخواست کد با JWT (فقط یک‌بار)
  useEffect(() => {
    if (info || requested.current || loading || !session || !needsVerification) return;
    requested.current = true;
    void resendOtp().then((res) => {
      if (res.ok && res.challenge) setInfo(res.challenge);
      else setError(res.error ?? "ارسال کد ناموفق بود.");
    });
  }, [info, loading, session, needsVerification, resendOtp]);

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />در حال بررسی…</div>;
  if (!session && !info) return <Navigate to="/login" replace />;
  if (session && profile && !needsVerification) return <Navigate to={homePathFor(profile)} replace />;

  const done = async () => {
    if (session) await refresh();
    else navigate("/login", { replace: true, state: { notice: "شماره‌ی شما تأیید شد. اکنون وارد شوید." } });
  };

  return (
    <AuthLayout title="تأیید شماره‌ی موبایل" subtitle="برای ادامه، کد ارسال‌شده را وارد کنید." icon={MailCheck}>
      {info ? (
        <OtpForm info={info} onInfo={setInfo} onVerified={done} />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <div className="flex items-center gap-2 py-6 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />در حال ارسال کد…</div>
      )}
      {session && (
        <button type="button" onClick={() => void signOut()} className="mt-5 text-[14px] font-bold text-body hover:text-ink">خروج از حساب</button>
      )}
    </AuthLayout>
  );
}

/* ───────────────────────── فراموشی و تعیین رمز جدید ───────────────────────── */

export function ForgotPasswordPage() {
  const { resetPassword, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("ایمیل معتبر وارد کنید.");
    setBusy(true);
    const res = await resetPassword(email);
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error ?? "ارسال لینک بازیابی ناموفق بود.");
  };

  return (
    <AuthLayout title="بازیابی رمز عبور" subtitle="لینک تعیین رمز جدید به ایمیل شما ارسال می‌شود." icon={KeyRoundIcon}>
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">اگر این ایمیل ثبت شده باشد، لینک بازیابی رمز ارسال می‌شود. پوشه‌ی هرزنامه را هم بررسی کنید.</Alert>
          <Link to="/login" className="btn-secondary w-full">بازگشت به ورود</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextField label="ایمیل حساب" icon={Mail} type="email" dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
          {error && <Alert tone="error">{error}</Alert>}
          <SubmitButton busy={busy} disabled={!configured}>ارسال لینک بازیابی</SubmitButton>
          <Link to="/login" className="block text-center text-[14px] font-bold text-steel">بازگشت به ورود</Link>
        </form>
      )}
    </AuthLayout>
  );
}

// آیکون کلید: نام lucide در نسخه‌ها متفاوت است؛ از LockKeyhole استفاده می‌شود
const KeyRoundIcon = LockKeyhole;

export function ResetPasswordPage() {
  const { session, loading, updatePassword, homePath, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />در حال بررسی لینک…</div>;

  if (!session) {
    return (
      <AuthLayout title="لینک بازیابی معتبر نیست" subtitle="ممکن است لینک منقضی شده یا قبلاً استفاده شده باشد." icon={KeyRoundIcon}>
        <Link to="/forgot-password" className="btn-primary w-full">درخواست لینک جدید</Link>
      </AuthLayout>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(password) || !/[0-9۰-۹]/.test(password)) return setError("رمز عبور حداقل ۸ کاراکتر و شامل حرف و عدد باشد.");
    if (password !== confirm) return setError("تکرار رمز عبور یکسان نیست.");
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "تغییر رمز ناموفق بود.");
    navigate(homePath, { replace: true });
  };

  return (
    <AuthLayout title="تعیین رمز عبور جدید" subtitle="رمز تازه‌ای انتخاب کنید که قبلاً استفاده نکرده‌اید." icon={KeyRoundIcon}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <PasswordField label="رمز عبور جدید" value={password} onChange={setPassword} autoComplete="new-password" showStrength />
        <PasswordField label="تکرار رمز عبور جدید" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <Alert tone="error">{error}</Alert>}
        <SubmitButton busy={busy}>ذخیره‌ی رمز جدید</SubmitButton>
        <button type="button" onClick={() => void signOut()} className="mx-auto block text-[14px] font-bold text-body hover:text-ink">انصراف و خروج</button>
      </form>
    </AuthLayout>
  );
}

/* ───────────────────────── محافظ مسیرها ───────────────────────── */

function StatusScreen({ tone, title, children }: { tone: "pending" | "suspended" | "error"; title: string; children: ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="mx-auto max-w-lg card-glass p-8 text-center">
      <span className={cn("mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl", tone === "pending" ? "bg-[#fdf3e0] text-[#a56a14]" : "bg-[#fbeceb] text-[#a33a34]")}>
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h1 className="mb-2 text-xl font-semibold text-ink">{title}</h1>
      <div className="mb-6 text-[15px] leading-8 text-body">{children}</div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-secondary">صفحه‌ی اصلی</Link>
        <button type="button" onClick={() => void signOut()} className="btn-primary">خروج از حساب</button>
      </div>
    </div>
  );
}

/**
 * محافظ مسیرهای نیازمند ورود. نکته: این فقط یک لایه‌ی رابط کاربری است؛
 * دسترسی واقعی به داده با RLS و RPCهای سمت سرور کنترل می‌شود.
 *  - kinds: فقط این نوع‌های حساب (دارندگان نقش مدیریتی هم عبور می‌کنند)
 */
export function RequireAuth({ children, kinds, psychologistOnly = false }: { children: ReactNode; kinds?: AccountKind[]; psychologistOnly?: boolean }) {
  const { session, profile, loading, configured, needsVerification, homePath, accountKind } = useAuth();
  const location = useLocation();
  if (!configured) {
    return <div className="mx-auto max-w-md card-glass p-6 text-center text-[15px] leading-7 text-body">حساب کاربری نیازمند اتصال به Supabase است و در این نسخه پیکربندی نشده.</div>;
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[15px] text-body" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        بررسی حساب…
      </div>
    );
  }
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!profile) {
    return <StatusScreen tone="error" title="پروفایل حساب در دسترس نیست">اطلاعات حساب شما دریافت نشد. چند لحظه بعد دوباره تلاش کنید یا از حساب خارج شوید.</StatusScreen>;
  }
  if (needsVerification) return <Navigate to="/verify" replace />;
  if (profile.account_status === "pending") {
    return <StatusScreen tone="pending" title="حساب شما در انتظار تأیید است">شماره‌ی شما تأیید شده، اما فعال‌سازی نهایی این نوع حساب نیازمند تأیید مدیر است. پس از تأیید می‌توانید وارد پنل شوید.</StatusScreen>;
  }
  if (profile.account_status === "suspended") {
    return <StatusScreen tone="suspended" title="حساب شما غیرفعال شده است">برای پیگیری با پشتیبانی آریاسازه تماس بگیرید.</StatusScreen>;
  }
  const allowed = kinds ?? (psychologistOnly ? (["psychologist"] as AccountKind[]) : undefined);
  if (allowed && !profile.role && !allowed.includes(accountKind)) return <Navigate to={homePath} replace />;
  return <>{children}</>;
}
