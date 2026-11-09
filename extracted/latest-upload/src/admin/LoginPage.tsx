import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { supabaseProjectHost } from "../lib/supabase";
import { Button, Field, inputClass } from "./ui";

export function LoginPage() {
  const { configured, loading, session, profile, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (configured && !loading && session && profile?.role) {
    return <Navigate to="/admin" replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!configured) {
      setError("اتصال Supabase پیکربندی نشده است. ابتدا فایل .env.local را بسازید.");
      return;
    }
    setBusy(true);
    if (mode === "reset") {
      const res = await resetPassword(email);
      setBusy(false);
      if (res.ok) setNotice("اگر این ایمیل در سیستم مدیریتی وجود داشته باشد، لینک بازیابی ارسال می‌شود.");
      else setError(res.error ?? "ارسال لینک بازیابی ناموفق بود.");
      return;
    }
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) navigate("/admin", { replace: true });
    else setError(res.error ?? "ورود ناموفق بود.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[#fbfcfe] to-pearl-deep px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-ice/15 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <LogoMark className="h-10 w-10 text-ink" />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold text-ink">آریاسازه</span>
            <span className="block text-[11px] text-body">پنل مدیریت محتوا و آزمون‌ها</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(46,56,82,0.25)]">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-steel/10 text-steel">
              <LockKeyhole className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-[15px] font-extrabold text-ink">{mode === "login" ? "ورود مدیران" : "بازیابی رمز عبور"}</h1>
              <p className="text-[11.5px] text-body">
                {mode === "login" ? "فقط حساب‌های دارای نقش مدیریتی امکان ورود دارند." : "لینک بازیابی به ایمیل شما ارسال می‌شود."}
              </p>
            </div>
          </div>

          {!configured && (
            <div className="mb-4 rounded-lg border border-[#e5c98f] bg-[#fdf6e8] p-3 text-[12px] leading-6 text-[#8a641f]">
              Supabase پیکربندی نشده است. برای فعال‌شدن ورود، فایل <code dir="ltr">.env.local</code> و migrationها را طبق
              README تنظیم کنید.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="ایمیل مدیر" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`${inputClass} pr-9 text-left`}
                  placeholder="admin@example.com"
                  aria-label="ایمیل"
                />
              </div>
            </Field>

            {mode === "login" && (
              <Field label="رمز عبور" required>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
                  <input
                    type={showPass ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className={`${inputClass} pr-9 pl-10 text-left`}
                    placeholder="••••••••"
                    aria-label="رمز عبور"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "پنهان‌کردن رمز" : "نمایش رمز"}
                    className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-fog hover:text-ink"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-[#d9a19d] bg-[#fbeceb] px-3 py-2 text-[12px] font-semibold leading-6 text-[#8f322d]">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg border border-mint/40 bg-[#e9f6f2] px-3 py-2 text-[12px] font-semibold leading-6 text-[#256b5e]">
                {notice}
              </p>
            )}

            <Button type="submit" className="w-full" loading={busy} disabled={!configured}>
              {mode === "login" ? "ورود به پنل" : "ارسال لینک بازیابی"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-[11.5px]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "reset" : "login");
                setError(null);
                setNotice(null);
              }}
              className="font-semibold text-steel hover:text-ink"
            >
              {mode === "login" ? "رمز عبور را فراموش کرده‌اید؟" : "بازگشت به ورود"}
            </button>
            <Link to="/" className="flex items-center gap-1 font-semibold text-body hover:text-ink">
              بازگشت به سایت
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#f8fafc] p-3 text-[11px] leading-5 text-body">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-steel" />
            <span>
              ثبت‌نام عمومی برای مدیران غیرفعال است. حساب‌های مدیریتی فقط با دعوت مدیر ارشد یا اسکریپت امن bootstrap
              ساخته می‌شوند.
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-[10.5px] text-fog">
          {supabaseProjectHost ? (
            <span dir="ltr">Supabase: {supabaseProjectHost}</span>
          ) : (
            <span>محیط توسعه — اتصال به Supabase برقرار نشده است</span>
          )}
        </p>
        {loading && configured && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-body">
            <Loader2 className="h-3 w-3 animate-spin" />
            بررسی نشست…
          </p>
        )}
      </div>
    </div>
  );
}
