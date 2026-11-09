import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Circle, Clock3, Loader2, PauseCircle, PlayCircle, Target } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../utils/cn";
import {
  ACTIVITY_STATUS_LABEL, EXERCISE_TYPE_LABEL, PLAN_STATUS_LABEL, callRpc, dateFa, faNum, impError,
  type ExerciseType, type Overview, type PlanMetrics, type PlanSummary, type Recommendation,
} from "./api";
import { useConfirm } from "./useConfirm";

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-steel/10" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "پیشرفت"}>
      <div className="h-full rounded-full bg-steel transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "info" | "ok"; children: React.ReactNode }) {
  const style = tone === "error" ? "bg-[#fbeceb] text-[#8f322d]" : tone === "ok" ? "bg-[#e7f5f0] text-[#256b5e]" : "bg-[#fdf3e0] text-[#8a5a14]";
  return <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-2xl px-4 py-3 text-[14px] font-semibold leading-7", style)}>{children}</p>;
}

function Spinner({ label }: { label: string }) {
  return <div className="flex items-center gap-2 py-8 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

const statusTone = (s: string) =>
  s === "completed" ? "bg-[#e7f5f0] text-[#256b5e]" : s === "in_progress" || s === "active" ? "bg-[#e9edff] text-[#3b478c]" : s === "paused" ? "bg-[#fdf3e0] text-[#8a5a14]" : s === "cancelled" || s === "skipped" ? "bg-ink/8 text-body" : "bg-cream-alt text-body";

export function StatusChip({ status, kind }: { status: string; kind: "plan" | "activity" }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-bold", statusTone(status))}>{(kind === "plan" ? PLAN_STATUS_LABEL : ACTIVITY_STATUS_LABEL)[status] ?? status}</span>;
}

export function useOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const res = await callRpc<Overview>("my_improvement_overview");
    setError(res.error);
    setData(res.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload };
}

/* ───────── کارت مسیر پیشنهادی ───────── */
export function RecommendationCard({ rec, attemptId }: { rec: Recommendation; attemptId?: string }) {
  const q = attemptId ?? rec.attempt_id;
  return (
    <article className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-chip">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-steel/10 px-3 py-1 text-[12.5px] font-bold text-steel"><Target className="h-3.5 w-3.5" />مسیر بهبود</span>
        <span className="text-[13px] text-body">{faNum(rec.duration_days)} روزه</span>
        {rec.strength === "definite" && <span className="rounded-full bg-[#e7f5f0] px-2.5 py-1 text-[12px] font-bold text-[#256b5e]">پیشنهاد اصلی</span>}
      </div>
      <h3 className="text-lg font-semibold text-ink">{rec.title}</h3>
      {rec.goal && <p className="mt-1 text-[14px] leading-7 text-body"><strong className="text-ink">هدف:</strong> {rec.goal}</p>}
      {rec.description && <p className="mt-1 line-clamp-3 text-[14px] leading-7 text-body">{rec.description}</p>}
      {rec.reason && <p className="mt-2 rounded-2xl bg-cream px-3.5 py-2.5 text-[13.5px] leading-7 text-body"><strong className="text-ink">دلیل پیشنهاد:</strong> {rec.reason}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/account/paths/${rec.path_id}?attempt=${q}`} className="btn-secondary min-h-11 px-5 text-[14px]">مشاهده‌ی جزئیات</Link>
        {rec.plan_id ? (
          <Link to={`/account/plans/${rec.plan_id}`} className="btn-primary min-h-11 px-5 text-[14px]">ادامه‌ی مسیر <ArrowLeft className="h-4 w-4" /></Link>
        ) : (
          <Link to={`/account/paths/${rec.path_id}?attempt=${q}&start=1`} className="btn-primary min-h-11 px-5 text-[14px]">شروع مسیر <ArrowLeft className="h-4 w-4" /></Link>
        )}
      </div>
    </article>
  );
}

/* ───────── بخش «پیشنهاد مسیر» در گزارش آزمون ───────── */
export function ResultRecommendations({ attemptId }: { attemptId: string }) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void callRpc<Recommendation[]>("result_path_recommendations", { p_attempt_id: attemptId }).then((r) => {
      if (cancelled) return;
      setError(r.error);
      setRecs(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return (
    <section className="card-glass p-6" aria-labelledby="path-reco-title">
      <h2 id="path-reco-title" className="text-lg font-semibold text-ink">مسیر بهبود پیشنهادی</h2>
      <p className="mt-1 text-[13.5px] leading-7 text-body">پیشنهادها بر اساس نتیجه‌ی ذخیره‌شده‌ی همین آزمون و قواعد تعریف‌شده توسط تیم آریاسازه ساخته می‌شوند و جای مشاوره یا درمان نیستند. نمره و تفسیر آزمون با آن‌ها تغییری نمی‌کند.</p>
      <div className="mt-4 space-y-3">
        {recs === null ? <Spinner label="بررسی مسیرهای مناسب…" /> : error ? <Notice tone="info">{error}</Notice> : recs.length === 0 ? (
          <p className="rounded-2xl bg-cream px-4 py-3 text-[14px] leading-7 text-body">برای این نتیجه، مسیر بهبود مشخصی تعریف نشده است. می‌توانید آزمون‌های دیگر را انجام دهید یا از بخش پشتیبانی راهنمایی بگیرید.</p>
        ) : recs.map((r) => <RecommendationCard key={r.id} rec={r} attemptId={attemptId} />)}
      </div>
    </section>
  );
}

/* ───────── بخش «مسیر بهبود» در داشبورد کاربر (/account) ───────── */
export function ImprovementOverview() {
  const { data, loading, error } = useOverview();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  useEffect(() => {
    void callRpc<Recommendation[]>("my_path_recommendations").then((r) => setRecs(r.data ?? []));
  }, []);
  const active = data?.active_plan ?? null;
  const past = (data?.plans ?? []).filter((p) => p.status !== "active");
  const suggestions = recs.filter((r) => !r.plan_id);

  return (
    <section id="improvement" className="scroll-mt-6 space-y-4" aria-labelledby="improvement-title">
      <h2 id="improvement-title" className="text-xl font-semibold text-ink">مسیر بهبود من</h2>
      {loading ? <Spinner label="دریافت برنامه‌ها…" /> : error ? <Notice tone="info">{error}</Notice> : (
        <>
          {active ? (
            <div className="card-glass p-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-body">مسیر فعال</p>
                  <h3 className="text-xl font-semibold text-ink">{active.title}</h3>
                  <p className="mt-0.5 text-[13.5px] text-body">روز {faNum(Math.min(active.metrics.day_index, active.metrics.planned_days))} از {faNum(active.metrics.planned_days)} · پایان برنامه‌ریزی‌شده: {dateFa(active.planned_end_date)}</p>
                </div>
                <Link to={`/account/plans/${active.id}`} className="btn-secondary min-h-11 px-5 text-[14px]">مشاهده‌ی برنامه</Link>
              </div>
              <div className="mb-1 flex items-center justify-between text-[13.5px]"><span className="font-bold text-ink">{faNum(active.metrics.percent)}٪ تکمیل</span><span className="text-body">{faNum(active.metrics.completed)} از {faNum(active.metrics.total - active.metrics.skipped)} فعالیت</span></div>
              <ProgressBar value={active.metrics.percent} label="پیشرفت برنامه‌ی فعال" />
              {active.metrics.adherence !== null && <p className="mt-2 text-[13px] text-body">پایبندی به برنامه تا امروز: {faNum(active.metrics.adherence)}٪</p>}
              <h4 className="mb-2 mt-5 flex items-center gap-2 text-[15px] font-bold text-ink"><CalendarCheck className="h-4 w-4 text-steel" />فعالیت‌های امروز</h4>
              {active.today.length === 0 ? <p className="rounded-2xl bg-cream px-4 py-3 text-[14px] text-body">برای امروز فعالیتی تعریف نشده است.</p> : (
                <ul className="space-y-2">{active.today.map((a) => (
                  <li key={a.id}><Link to={`/account/plans/${active.id}/activities/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3 transition-colors hover:bg-cream-alt">
                    <span className="font-bold text-ink">{a.title}{!a.is_required && <span className="ms-2 text-[12px] font-normal text-body">(اختیاری)</span>}</span>
                    <span className="flex items-center gap-2 text-[13px] text-body">{a.duration_minutes ? <><Clock3 className="h-3.5 w-3.5" />{faNum(a.duration_minutes)} دقیقه</> : null}<StatusChip status={a.status} kind="activity" /></span>
                  </Link></li>
                ))}</ul>
              )}
              {active.overdue_count > 0 && <Notice tone="info">{faNum(active.overdue_count)} فعالیت از روزهای قبل باقی مانده است. می‌توانید هر زمان آن‌ها را انجام دهید.</Notice>}
            </div>
          ) : (
            <div className="card-glass p-6 text-center">
              <Target className="mx-auto mb-2 h-6 w-6 text-steel" />
              <p className="font-bold text-ink">مسیر فعالی ندارید</p>
              <p className="mt-1 text-[14px] leading-7 text-body">پس از انجام آزمون، مسیرهای مناسب نتیجه‌ی شما اینجا پیشنهاد می‌شوند.</p>
              <Link to="/tests" className="btn-primary mt-4 min-h-11 px-5 text-[14px]">مشاهده‌ی آزمون‌ها</Link>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <h3 className="mb-2 text-[16px] font-bold text-ink">مسیرهای پیشنهادی برای شما</h3>
              <div className="grid gap-3 md:grid-cols-2">{suggestions.map((r) => <RecommendationCard key={r.id} rec={r} />)}</div>
            </div>
          )}

          {past.length > 0 && (
            <div className="card-glass p-6">
              <h3 className="mb-3 text-[16px] font-bold text-ink">تاریخچه‌ی مسیرها</h3>
              <ul className="divide-y divide-ink/6">{past.map((p) => (
                <li key={p.id}><Link to={`/account/plans/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0"><span className="block truncate font-bold text-ink">{p.title}</span><span className="text-[13px] text-body">شروع: {dateFa(p.started_at)} · {faNum(p.metrics.percent)}٪ تکمیل</span></span>
                  <StatusChip status={p.status} kind="plan" />
                </Link></li>
              ))}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ───────── جزئیات مسیر + شروع ───────── */
interface PathDetail {
  id: string; title: string; description: string | null; goal: string | null; duration_days: number; version: number;
  steps: Array<{ id: string; day_number: number; title: string; description: string | null; activities: Array<{ title: string; goal: string | null; duration_minutes: number | null; exercise_type: ExerciseType; is_required: boolean; suggested_time: string | null }> }>;
}

export function PathDetailPage() {
  const { pathId = "" } = useParams();
  const [params] = useSearchParams();
  const attempt = params.get("attempt");
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PathDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    void callRpc<PathDetail>("get_improvement_path_detail", { p_path_id: pathId }).then((r) => {
      if (r.error) setError(r.error);
      else setDetail(r.data);
    });
  }, [pathId]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    setStartError(null);
    const res = await callRpc<string>("start_improvement_plan", { p_path_id: pathId, p_attempt_id: attempt && /^[0-9a-f-]{36}$/i.test(attempt) ? attempt : null });
    setStarting(false);
    if (res.error || !res.data) {
      startedRef.current = false;
      return setStartError(res.error ?? "شروع مسیر ناموفق بود.");
    }
    navigate(`/account/plans/${res.data}`, { replace: true });
  }, [attempt, navigate, pathId]);

  if (error) return <div className="card-glass p-8 text-center"><p className="font-bold text-ink">{error}</p><Link to="/account" className="btn-secondary mt-4">بازگشت به داشبورد</Link></div>;
  if (!detail) return <Spinner label="دریافت جزئیات مسیر…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/account" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel"><ArrowRight className="h-4 w-4" />بازگشت</Link>
      <header className="card-glass p-6">
        <p className="section-label mb-1">مسیر بهبود · {faNum(detail.duration_days)} روزه</p>
        <h1 className="section-title">{detail.title}</h1>
        {detail.goal && <p className="mt-2 text-base leading-8 text-body"><strong className="text-ink">هدف:</strong> {detail.goal}</p>}
        {detail.description && <p className="mt-2 whitespace-pre-line text-base leading-8 text-body">{detail.description}</p>}
        {startError && <div className="mt-4"><Notice tone="error">{startError}</Notice></div>}
        <button type="button" onClick={() => void start()} disabled={starting} className="btn-primary mt-5 min-h-12 px-7">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-5 w-5" />}شروع این مسیر
        </button>
        <p className="mt-3 text-[12.5px] leading-6 text-fog">با شروع، یک برنامه‌ی شخصی برای شما ساخته می‌شود و پیشرفتتان جداگانه ذخیره می‌شود. این مسیر جایگزین مشاوره یا درمان نیست.</p>
      </header>
      <section className="space-y-3" aria-label="مراحل مسیر">
        {detail.steps.map((s) => (
          <div key={s.id} className="card-glass p-5">
            <h2 className="text-[16px] font-bold text-ink">روز {faNum(s.day_number)}: {s.title}</h2>
            {s.description && <p className="mt-1 text-[14px] leading-7 text-body">{s.description}</p>}
            <ul className="mt-3 space-y-2">{s.activities.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-2.5 text-[14px]">
                <span className="font-bold text-ink">{a.title}{!a.is_required && <span className="ms-2 text-[12px] font-normal text-body">(اختیاری)</span>}</span>
                <span className="text-[13px] text-body">{EXERCISE_TYPE_LABEL[a.exercise_type]}{a.duration_minutes ? ` · ${faNum(a.duration_minutes)} دقیقه` : ""}{a.suggested_time ? ` · ${a.suggested_time}` : ""}</span>
              </li>
            ))}</ul>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ───────── صفحه‌ی برنامه ───────── */
interface PlanStep { id: string; day_number: number; title: string; description: string | null; sort_order: number }
interface PlanAct { id: string; plan_step_id: string; title: string; status: string; is_required: boolean; duration_minutes: number | null; exercise_type: ExerciseType; suggested_time: string | null; sort_order: number }

export function PlanPage() {
  const { planId = "" } = useParams();
  const { ask, dialog } = useConfirm();
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [acts, setActs] = useState<PlanAct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const ov = await callRpc<Overview>("my_improvement_overview");
    if (ov.error) { setError(ov.error); setLoaded(true); return; }
    const found = ov.data?.plans.find((p) => p.id === planId) ?? null;
    if (!found) { setError("برنامه یافت نشد."); setLoaded(true); return; }
    setPlan(found);
    if (supabase) {
      const [s, a] = await Promise.all([
        supabase.from("user_plan_steps").select("id,day_number,title,description,sort_order").eq("plan_id", planId).order("day_number").order("sort_order"),
        supabase.from("user_plan_activities").select("id,plan_step_id,title,status,is_required,duration_minutes,exercise_type,suggested_time,sort_order").eq("plan_id", planId).order("sort_order"),
      ]);
      setSteps((s.data ?? []) as PlanStep[]);
      setActs((a.data ?? []) as PlanAct[]);
    }
    setLoaded(true);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (status: "paused" | "active" | "cancelled") => {
    if (status === "cancelled" && !(await ask({ title: "لغو مسیر", description: "این برنامه لغو می‌شود و دیگر قابل ادامه نیست. پاسخ‌های ثبت‌شده‌ی شما حفظ می‌شود. ادامه می‌دهید؟", confirmLabel: "لغو برنامه", dangerous: true }))) return;
    setBusy(true);
    setError(null);
    const res = await callRpc("set_improvement_plan_status", { p_plan_id: planId, p_status: status });
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
  };

  if (!loaded) return <Spinner label="دریافت برنامه…" />;
  if (!plan) return <div className="card-glass p-8 text-center"><p className="font-bold text-ink">{error ?? "برنامه یافت نشد."}</p><Link to="/account" className="btn-secondary mt-4">بازگشت به داشبورد</Link></div>;
  const m: PlanMetrics = plan.metrics;
  const open = plan.status === "active";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/account" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel"><ArrowRight className="h-4 w-4" />داشبورد</Link>
      <header className="card-glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="section-title">{plan.title}</h1><StatusChip status={plan.status} kind="plan" /></div>
        <p className="mt-1 text-[14px] text-body">شروع: {dateFa(plan.started_at)} · پایان برنامه‌ریزی‌شده: {dateFa(plan.planned_end_date)}{plan.completed_at ? ` · تکمیل: ${dateFa(plan.completed_at)}` : ""}</p>
        <div className="mb-1 mt-4 flex justify-between text-[14px]"><span className="font-bold text-ink">{faNum(m.percent)}٪ تکمیل</span><span className="text-body">{faNum(m.completed)} از {faNum(m.total - m.skipped)} فعالیت</span></div>
        <ProgressBar value={m.percent} label="پیشرفت برنامه" />
        {m.adherence !== null && <p className="mt-2 text-[13px] text-body">پایبندی تا امروز: {faNum(m.adherence)}٪ ({faNum(m.due_completed)} از {faNum(m.due_total)} فعالیت موعددار)</p>}
        {plan.status === "completed" && <div className="mt-4"><Notice tone="ok">تبریک! همه‌ی فعالیت‌های الزامی این مسیر را تکمیل کردید.</Notice></div>}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {plan.status === "active" && <button type="button" disabled={busy} onClick={() => void change("paused")} className="btn-secondary min-h-11 px-5 text-[14px]"><PauseCircle className="h-4 w-4" />توقف موقت</button>}
          {plan.status === "paused" && <button type="button" disabled={busy} onClick={() => void change("active")} className="btn-primary min-h-11 px-5 text-[14px]"><PlayCircle className="h-4 w-4" />ادامه‌ی مسیر</button>}
          {(plan.status === "active" || plan.status === "paused") && <button type="button" disabled={busy} onClick={() => void change("cancelled")} className="btn-secondary min-h-11 px-5 text-[14px] !text-[#a33a34]">لغو مسیر</button>}
        </div>
      </header>
      {plan.status === "paused" && <Notice tone="info">این برنامه متوقف است؛ برای ثبت فعالیت‌ها ابتدا آن را از سر بگیرید.</Notice>}
      {steps.map((s) => (
        <section key={s.id} className={cn("card-glass p-5", s.day_number === m.day_index && open && "ring-2 ring-steel/40")}>
          <h2 className="text-[16px] font-bold text-ink">روز {faNum(s.day_number)}: {s.title}{s.day_number === m.day_index && open ? <span className="ms-2 rounded-full bg-steel/10 px-2 py-0.5 text-[12px] text-steel">امروز</span> : null}</h2>
          {s.description && <p className="mt-1 text-[14px] leading-7 text-body">{s.description}</p>}
          <ul className="mt-3 space-y-2">{acts.filter((a) => a.plan_step_id === s.id).map((a) => (
            <li key={a.id}><Link to={`/account/plans/${plan.id}/activities/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3 transition-colors hover:bg-cream-alt">
              <span className="flex items-center gap-2 font-bold text-ink">{a.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-[#2f8d7c]" /> : <Circle className="h-4 w-4 text-fog" />}{a.title}{!a.is_required && <span className="text-[12px] font-normal text-body">(اختیاری)</span>}</span>
              <span className="flex items-center gap-2 text-[13px] text-body">{a.duration_minutes ? `${faNum(a.duration_minutes)} دقیقه` : ""}<StatusChip status={a.status} kind="activity" /></span>
            </Link></li>
          ))}</ul>
        </section>
      ))}
      {dialog}
    </div>
  );
}

/* ───────── اجرای تمرین ───────── */
interface ActivityDetail {
  id: string; plan_id: string; title: string; goal: string | null; instructions: string; duration_minutes: number | null; exercise_type: ExerciseType;
  content: { items?: string[]; min?: number; max?: number; low_label?: string; high_label?: string; prompt?: string };
  response_required: boolean; is_required: boolean; status: string; response: { text?: string; checked?: number[]; rating?: number } | null; user_note: string | null; completed_at: string | null;
}

export function ActivityPage() {
  const { planId = "", activityId = "" } = useParams();
  const [act, setAct] = useState<ActivityDetail | null>(null);
  const [planStatus, setPlanStatus] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PlanMetrics | null>(null);
  const begun = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [a, p] = await Promise.all([
      supabase.from("user_plan_activities").select("id,plan_id,title,goal,instructions,duration_minutes,exercise_type,content,response_required,is_required,status,response,user_note,completed_at").eq("id", activityId).eq("plan_id", planId).maybeSingle(),
      supabase.from("user_improvement_plans").select("status").eq("id", planId).maybeSingle(),
    ]);
    if (a.error || !a.data) return setError(a.error ? impError(a.error) : "فعالیت یافت نشد.");
    const row = a.data as unknown as ActivityDetail;
    setAct(row);
    setPlanStatus((p.data as { status: string } | null)?.status ?? "active");
    setText(row.response?.text ?? "");
    setChecked(row.response?.checked ?? []);
    setRating(row.response?.rating ?? null);
    setNote(row.user_note ?? "");
  }, [activityId, planId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!act || begun.current || act.status !== "not_started" || planStatus !== "active") return;
    begun.current = true;
    void callRpc("begin_plan_activity", { p_activity_id: act.id }).then(() => setAct((cur) => (cur ? { ...cur, status: "in_progress" } : cur)));
  }, [act, planStatus]);

  if (error) return <div className="card-glass p-8 text-center"><p className="font-bold text-ink">{error}</p><Link to={`/account/plans/${planId}`} className="btn-secondary mt-4">بازگشت به برنامه</Link></div>;
  if (!act) return <Spinner label="دریافت تمرین…" />;

  const finished = act.status === "completed";
  const locked = finished || act.status === "skipped" || planStatus !== "active";
  const items = act.content.items ?? [];
  const min = act.content.min ?? 1;
  const max = act.content.max ?? 5;

  const submit = async () => {
    if (busy) return;
    setError(null);
    const response = act.exercise_type === "reflection" ? { text: text.trim() } : act.exercise_type === "checklist" ? { checked } : { rating };
    setBusy(true);
    const res = await callRpc<PlanMetrics>("complete_plan_activity", { p_activity_id: act.id, p_response: response, p_note: note.trim() || null });
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(res.data);
    await load();
  };
  const skip = async () => {
    setBusy(true);
    const res = await callRpc<PlanMetrics>("skip_plan_activity", { p_activity_id: act.id });
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(res.data);
    await load();
  };

  const canSubmit = act.exercise_type === "reflection" ? (!act.response_required || text.trim().length >= 10) : act.exercise_type === "checklist" ? checked.length === items.length : rating !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to={`/account/plans/${planId}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel"><ArrowRight className="h-4 w-4" />بازگشت به برنامه</Link>
      <article className="card-glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="section-label">{EXERCISE_TYPE_LABEL[act.exercise_type]}{act.duration_minutes ? ` · ${faNum(act.duration_minutes)} دقیقه` : ""}</p><StatusChip status={act.status} kind="activity" /></div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{act.title}</h1>
        {act.goal && <p className="mt-1 text-[14px] leading-7 text-body"><strong className="text-ink">هدف:</strong> {act.goal}</p>}
        <div className="mt-4 rounded-2xl bg-cream p-4"><h2 className="mb-1 text-[14px] font-bold text-ink">دستورالعمل</h2><p className="whitespace-pre-line text-[15px] leading-8 text-body">{act.instructions}</p></div>

        {planStatus !== "active" && !finished && <div className="mt-4"><Notice tone="info">این برنامه فعال نیست؛ برای ثبت تمرین ابتدا آن را از صفحه‌ی برنامه از سر بگیرید.</Notice></div>}

        <div className="mt-5 space-y-4">
          {act.exercise_type === "reflection" && (
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">{act.content.prompt || "پاسخ یا یادداشت شما"}{act.response_required ? " (الزامی)" : ""}</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={locked} rows={6} maxLength={5000} className="input-field py-3 leading-8" /></label>
          )}
          {act.exercise_type === "checklist" && (
            <fieldset><legend className="mb-2 text-[14px] font-bold text-ink">موارد را انجام دهید و علامت بزنید</legend>
              <ul className="space-y-2">{items.map((it, i) => (
                <li key={i}><label className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 text-[15px] text-ink"><input type="checkbox" disabled={locked} checked={checked.includes(i)} onChange={(e) => setChecked(e.target.checked ? [...checked, i] : checked.filter((x) => x !== i))} className="h-5 w-5 accent-[#4a58a6]" />{it}</label></li>
              ))}</ul></fieldset>
          )}
          {act.exercise_type === "rating" && (
            <fieldset><legend className="mb-2 text-[14px] font-bold text-ink">{act.content.prompt || "امتیاز خود را انتخاب کنید"}</legend>
              <div className="flex flex-wrap gap-2">{Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
                <label key={v} className={cn("flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border text-base font-bold transition-colors", rating === v ? "border-steel bg-steel text-white" : "border-ink/12 bg-white text-ink hover:border-steel/50", locked && "cursor-default opacity-80")}>
                  <input type="radio" name="rating" value={v} disabled={locked} checked={rating === v} onChange={() => setRating(v)} className="sr-only" />{faNum(v)}</label>
              ))}</div>
              {(act.content.low_label || act.content.high_label) && <p className="mt-2 flex justify-between text-[13px] text-body"><span>{act.content.low_label}</span><span>{act.content.high_label}</span></p>}
            </fieldset>
          )}
          <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">یادداشت شخصی (اختیاری)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={locked} rows={3} maxLength={2000} className="input-field py-3 leading-7" /></label>
        </div>

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {finished ? (
          <div className="mt-4"><Notice tone="ok">این تمرین تکمیل شده است{act.completed_at ? ` (${dateFa(act.completed_at)})` : ""}. پاسخ شما فقط برای خودتان ذخیره شده است.</Notice></div>
        ) : act.status === "skipped" ? null : (
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => void submit()} disabled={busy || locked || !canSubmit} className="btn-primary min-h-12 px-7">{busy && <Loader2 className="h-4 w-4 animate-spin" />}ثبت و تکمیل تمرین</button>
            {!act.is_required && !locked && <button type="button" onClick={() => void skip()} disabled={busy} className="btn-secondary min-h-12 px-6">رد کردن این فعالیت اختیاری</button>}
          </div>
        )}
        {done && <div className="mt-4"><Notice tone="ok">ثبت شد. پیشرفت برنامه: {faNum(done.percent)}٪ — <Link to={`/account/plans/${planId}`} className="underline">بازگشت به برنامه</Link></Notice></div>}
      </article>
    </div>
  );
}
