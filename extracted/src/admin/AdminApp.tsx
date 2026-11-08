import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeft, Database, Loader2, ShieldAlert, Terminal } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { AdminShell } from "./AdminShell";
import { LoginPage } from "./LoginPage";
import { Button, ToastProvider } from "./ui";
import { AdminPrefsProvider } from "./prefs";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { AdminsPage } from "./pages/AdminsPage";
import { TestsPage } from "./pages/TestsPage";
import { TestEditorPage } from "./pages/TestEditorPage";
import { ContentPages } from "./pages/ContentPages";
import { MediaPage } from "./pages/MediaPage";
import { MessagesPage } from "./pages/MessagesPage";
import { PsychologistsPage } from "./pages/PsychologistsPage";
import { NavigationPage } from "./pages/NavigationPage";
import { ApiSettingsPage, AuditLogsPage, SiteSettingsPage } from "./pages/SystemPages";

export function AdminApp() {
  const { configured, loading, error } = useAuth();

  if (!configured) return <SetupScreen />;
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f6fa] text-ink">
        <Loader2 className="h-6 w-6 animate-spin text-steel" />
        <p className="text-[13px] font-semibold text-body">بررسی نشست و مجوزها…</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AdminPrefsProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          element={
            <Guard>
              <AdminShell />
            </Guard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="tests/:testId" element={<TestEditorPage />} />
          <Route path="pages" element={<ContentPages />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="navigation" element={<NavigationPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="psychologists" element={<PsychologistsPage />} />
          <Route path="articles" element={<ContentPages initialTab="articles" />} />
          <Route path="magazines" element={<ContentPages initialTab="magazines" />} />
          <Route path="books" element={<ContentPages initialTab="books" />} />
          <Route path="api-settings" element={<ApiSettingsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SiteSettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
      </AdminPrefsProvider>
      {error && <p className="sr-only" role="alert">{error}</p>}
    </ToastProvider>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const { session, hasAnyRole, profile, signOut } = useAuth();

  if (!session) return <Navigate to="/admin/login" replace />;

  if (!hasAnyRole) {
    const suspended = profile?.account_status === "suspended";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fa] px-4">
        <div className="w-full max-w-md rounded-2xl border border-ink/8 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fbeceb] text-[#a33a34]">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mb-2 text-[15px] font-extrabold text-ink">
            {suspended ? "حساب شما مسدود شده است" : "دسترسی مدیریتی فعال نیست"}
          </h1>
          <p className="mb-5 text-[12.5px] leading-6 text-body">
            {suspended
              ? "برای پیگیری، با مدیر ارشد آریاسازه تماس بگیرید."
              : profile
                ? "حساب شما در سیستم وجود دارد اما نقش مدیریتی فعال ندارد. مدیر ارشد باید نقش و وضعیت حساب را تعیین کند."
                : "پروفایل مدیریتی برای این حساب یافت نشد. اگر به‌تازگی دعوت شده‌اید، از مدیر ارشد بخواهید وضعیت شما را بررسی کند."}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await signOut();
                window.location.assign("/admin/login");
              }}
            >
              خروج از حساب
            </Button>
            <Link to="/" className="text-[12px] font-bold text-steel hover:text-ink">
              بازگشت به سایت
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SetupScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fbfcfe] to-pearl-deep px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-6 flex items-center gap-3">
          <LogoMark className="h-10 w-10 text-ink" />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold text-ink">آریاسازه</span>
            <span className="block text-[11px] text-body">پنل مدیریت</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-ink/8 bg-white p-6 md:p-8">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-steel/10 text-steel">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-ink">پنل مدیریت به Supabase متصل نیست</h1>
              <p className="mt-1 text-[12.5px] leading-6 text-body">
                این نسخه به‌جای داده‌ی ساختگی، وضعیت عدم اتصال را نشان می‌دهد. برای فعال‌سازی پنل، مراحل زیر را یک‌بار
                اجرا کنید. پس از آن تمام صفحات با داده‌ی واقعی پایگاه داده کار می‌کنند.
              </p>
            </div>
          </div>

          <ol className="space-y-4">
            <Step n={1} title="ساخت پروژه‌ی Supabase">
              یک پروژه در <span dir="ltr">supabase.com</span> بسازید، سپس از بخش Settings → API مقدار
              <code dir="ltr" className="mx-1 rounded bg-mist px-1.5 py-0.5 text-[11px]">Project URL</code>
              و کلید <code dir="ltr" className="mx-1 rounded bg-mist px-1.5 py-0.5 text-[11px]">anon (publishable)</code>
              را بردارید.
            </Step>
            <Step n={2} title="تنظیم متغیرهای محیطی">
              <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-[#232c44] p-3 text-[11px] leading-6 text-[#e6edf8]">{`cp .env.example .env.local
# سپس مقادیر را در .env.local قرار دهید:
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY`}</pre>
            </Step>
            <Step n={3} title="اعمال migrationها و Storage">
              <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-[#232c44] p-3 text-[11px] leading-6 text-[#e6edf8]">{`supabase link --project-ref YOUR_REF
supabase db push
supabase functions deploy admin`}</pre>
              <p className="mt-1 text-[11px] text-body">
                یا فایل‌های <code dir="ltr">supabase/migrations/*.sql</code> را به‌ترتیب در SQL Editor اجرا کنید.
              </p>
            </Step>
            <Step n={4} title="ساخت اولین مدیر ارشد">
              <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-[#232c44] p-3 text-[11px] leading-6 text-[#e6edf8]">{`SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \\
node scripts/bootstrap-admin.mjs`}</pre>
              <p className="mt-1 text-[11px] text-body">
                کلید <code dir="ltr">service_role</code> فقط در همین دستور محلی استفاده می‌شود و هرگز در فرانت‌اند قرار
                نمی‌گیرد.
              </p>
            </Step>
            <Step n={5} title="سرویس Vite را دوباره اجرا کنید">
              <code dir="ltr" className="mt-1 block rounded-lg bg-mist px-3 py-2 text-[11.5px] text-ink">npm run dev</code>
            </Step>
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/8 pt-5">
            <Link
              to="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-steel px-4 text-[13px] font-bold text-white hover:bg-[#33527f]"
            >
              <ArrowLeft className="h-4 w-4" />
              بازگشت به سایت
            </Link>
            <span className="flex items-center gap-1.5 text-[11.5px] text-body">
              <Terminal className="h-3.5 w-3.5" />
              راهنمای کامل: README.md
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-steel text-[11px] font-extrabold text-white">
        {n.toLocaleString("fa-IR")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        <div className="mt-1 text-[12px] leading-6 text-body">{children}</div>
      </div>
    </li>
  );
}
