import { ImprovementOverview } from "../improvement/UserImprovement";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, FileText, Loader2, PlayCircle, Trash2, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useSiteData } from "../lib/siteData";
import { isMissingBackend } from "../admin/backend";
import { flowError } from "./testFlow";
import { cn } from "../utils/cn";

interface HistoryRow {
  attempt_id: string;
  test_id: string;
  total_score: number;
  min_score: number | null;
  max_score: number | null;
  interpretation: { label?: string } | null;
  computed_at: string;
}
interface OpenAttempt {
  id: string;
  test_id: string;
  started_at: string;
}

const fa = (n: number) => n.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
const dateFa = (v: string) => new Date(v).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });

function Panel({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("rounded-[25.2px] border border-ink/8 bg-white/90 p-6 shadow-soft backdrop-blur", className)}>{children}</div>;
}

export function UserDashboardPage() {
  const { profile, session } = useAuth();
  const { tests } = useSiteData();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [open, setOpen] = useState<OpenAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const [res, att] = await Promise.all([
      supabase.from("test_results").select("attempt_id,test_id,total_score,min_score,max_score,interpretation,computed_at").order("computed_at", { ascending: false }).limit(50),
      supabase.from("test_attempts").select("id,test_id,started_at").eq("status", "started").order("started_at", { ascending: false }).limit(10),
    ]);
    if (res.error) {
      setMissing(isMissingBackend(res.error));
      setError(flowError(res.error));
    } else {
      setHistory((res.data ?? []) as HistoryRow[]);
      setError(null);
    }
    if (!att.error) setOpen((att.data ?? []) as OpenAttempt[]);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleOf = (id: string) => tests.find((t) => t.id === id)?.title ?? "آزمون";
  const slugOf = (id: string) => tests.find((t) => t.id === id)?.slug ?? null;

  const remove = async (attemptId: string) => {
    if (!supabase || !window.confirm("این نتیجه از حساب شما حذف شود؟ این عملیات قابل بازگشت نیست.")) return;
    setDeleting(attemptId);
    const { error: err } = await supabase.from("test_results").delete().eq("attempt_id", attemptId);
    setDeleting(null);
    if (err) return setError(flowError(err));
    setHistory((h) => h.filter((r) => r.attempt_id !== attemptId));
  };

  const name = profile?.full_name || session?.user.email || "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label mb-2">داشبورد من</p>
          <h1 className="section-title">سلام{name ? `، ${name}` : ""}</h1>
          <p className="section-lead mt-2">تاریخچه‌ی آزمون‌ها و گزارش‌های شخصی شما فقط برای خودتان قابل مشاهده است.</p>
        </div>
        <Link to="/account/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 px-5 text-[15px] font-bold text-ink hover:bg-white">
          <UserRound className="h-4 w-4" />
          حساب من
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "آزمون‌های تکمیل‌شده", value: history.length, icon: CheckCircle2 },
          { label: "آزمون‌های نیمه‌کاره", value: open.length, icon: PlayCircle },
          { label: "آزمون‌های در دسترس", value: tests.length, icon: FileText },
        ].map((c) => (
          <Panel key={c.label} className="p-5">
            <c.icon className="mb-2 h-5 w-5 text-steel" />
            <p className="text-[14px] font-semibold text-body">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{loading ? "…" : fa(c.value)}</p>
          </Panel>
        ))}
      </div>

      {open.length > 0 && (
        <Panel>
          <h2 className="mb-3 text-lg font-semibold text-ink">ادامه‌ی آزمون نیمه‌کاره</h2>
          <ul className="space-y-2">
            {open.map((a) => {
              const slug = slugOf(a.test_id);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3">
                  <span className="font-bold text-ink">{titleOf(a.test_id)}</span>
                  <span className="text-[13px] text-body">شروع: {dateFa(a.started_at)}</span>
                  {slug && <Link to={`/tests/${slug}/take`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-bold text-white">ادامه <ArrowLeft className="h-3.5 w-3.5" /></Link>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <ImprovementOverview />

      <Panel id="history" className="scroll-mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">تاریخچه‌ی آزمون‌ها و گزارش‌ها</h2>
          <Link to="/tests" className="text-[14px] font-bold text-steel">آزمون جدید</Link>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت تاریخچه…</div>
        ) : error ? (
          <p role="alert" className={cn("rounded-2xl px-4 py-3 text-[14px] leading-7", missing ? "bg-[#fdf6e8] text-[#8a5a14]" : "bg-[#fbeceb] text-[#8f322d]")}>{error}</p>
        ) : history.length === 0 ? (
          <div className="rounded-2xl bg-cream px-5 py-10 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-steel" />
            <p className="font-bold text-ink">هنوز آزمونی را کامل نکرده‌اید</p>
            <p className="mt-1 text-[14px] text-body">با اولین آزمون، گزارش شخصی شما اینجا ذخیره می‌شود.</p>
            <Link to="/tests" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-coral px-5 text-[15px] font-bold text-ink">مشاهده‌ی آزمون‌ها</Link>
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {history.map((r) => {
              const slug = slugOf(r.test_id);
              return (
                <li key={r.attempt_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-[15px] font-bold text-ink">{titleOf(r.test_id)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-body">
                      <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{dateFa(r.computed_at)}</span>
                      <span>امتیاز: <strong className="text-ink">{fa(r.total_score)}</strong>{r.max_score !== null ? ` از ${fa(r.max_score)}` : ""}</span>
                      {r.interpretation?.label && <span className="rounded-full bg-steel/10 px-2 py-0.5 font-bold text-steel">{r.interpretation.label}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {slug && <Link to={`/tests/${slug}/result/${r.attempt_id}`} className="inline-flex min-h-10 items-center rounded-full border border-ink/15 px-4 text-[14px] font-bold text-ink hover:bg-cream">مشاهده‌ی گزارش</Link>}
                    <button type="button" onClick={() => void remove(r.attempt_id)} disabled={deleting === r.attempt_id} aria-label="حذف نتیجه" className="flex h-10 w-10 items-center justify-center rounded-full text-[#a33a34] hover:bg-[#fbeceb] disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function AccountPage() {
  const { profile, session, refresh, isPsychologist, isSupportSpecialist, homePath } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => setFullName(profile?.full_name ?? ""), [profile?.full_name]);

  const save = async () => {
    if (!supabase || !session) return;
    if (fullName.trim().length < 2) return setMsg({ kind: "err", text: "نام باید حداقل ۲ حرف باشد." });
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", session.user.id);
    setSaving(false);
    if (error) return setMsg({ kind: "err", text: flowError(error) });
    await refresh();
    setMsg({ kind: "ok", text: "اطلاعات حساب ذخیره شد." });
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <p className="section-label mb-2">حساب من</p>
        <h1 className="section-title">اطلاعات حساب</h1>
      </header>
      <Panel>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-ink">نام و نام خانوادگی</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full min-h-12 rounded-xl border border-ink/12 bg-white px-4 text-base text-ink focus:border-steel focus:outline-none focus:ring-2 focus:ring-steel/15" />
        </label>
        <p className="mt-4 text-[14px] text-body">ایمیل: <span dir="ltr" className="font-bold text-ink">{session?.user.email}</span></p>
        <p className="mt-1 text-[14px] text-body">نوع حساب: <span className="font-bold text-ink">{profile?.role ? "مدیر" : isPsychologist ? "روان‌شناس" : isSupportSpecialist ? "متخصص پشتیبانی" : "کاربر"}</span></p>
        {msg && <p role={msg.kind === "ok" ? "status" : "alert"} className={cn("mt-4 rounded-xl px-4 py-2.5 text-[14px] font-semibold", msg.kind === "ok" ? "bg-[#e9f6f2] text-[#256b5e]" : "bg-[#fbeceb] text-[#8f322d]")}>{msg.text}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-bold text-white disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            ذخیره
          </button>
          <Link to={homePath} className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 text-[15px] font-bold text-ink">بازگشت</Link>
        </div>
      </Panel>
      {!isPsychologist && !isSupportSpecialist && !profile?.role && (
        <Panel className="bg-steel/5">
          <p className="text-[15px] font-bold text-ink">متخصص روان‌شناسی هستید؟</p>
          <p className="mt-1 text-[14px] leading-7 text-body">با تکمیل فرم همکاری، پس از بررسی مدارک، پروفایل حرفه‌ای شما در آریاسازه فعال می‌شود.</p>
          <Link to="/pro/apply" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-bold text-steel ring-1 ring-steel/20">درخواست همکاری <ArrowLeft className="h-3.5 w-3.5" /></Link>
        </Panel>
      )}
    </div>
  );
}
