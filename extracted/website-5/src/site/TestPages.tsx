import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, Info, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useSiteData } from "../lib/siteData";
import type { PublicTest } from "../lib/types";
import { cn } from "../utils/cn";
import {
  abandonAttempt,
  completeAttempt,
  flowError,
  loadExistingAnswers,
  loadPublishedVersion,
  saveAnswer,
  scoreLabel,
  startAttempt,
  type PublishedVersion,
  type TestResult,
} from "./testFlow";

const fa = (n: number) => n.toLocaleString("fa-IR");

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[28px] border border-ink/8 bg-white/90 p-6 shadow-soft backdrop-blur sm:p-8", className)}>{children}</div>;
}

function Disclaimer() {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-cream px-4 py-3 text-[14px] leading-7 text-body">
      <Info className="mt-1 h-4 w-4 shrink-0 text-steel" />
      این آزمون برای خودشناسی طراحی شده است؛ ابزار تشخیص پزشکی یا روان‌پزشکی نیست و جایگزین مشاوره‌ی تخصصی نمی‌شود. در صورت نیاز با متخصص سلامت روان مشورت کنید.
    </p>
  );
}

/** قالب فهرست: همان کارت‌های صفحه‌ی اصلی، به‌صورت صفحه‌ی مستقل */
export function TestsIndexPage() {
  const { tests, testsSource, loading } = useSiteData();
  return (
    <>
      <header className="mb-8">
        <p className="section-label mb-3">آزمون‌های ما</p>
        <h1 className="section-title">کتابخانه‌ی آزمون‌ها</h1>
        <p className="section-lead mt-3">فقط آزمون‌هایی که بازبینی علمی شده و منتشر شده‌اند در این فهرست دیده می‌شوند.</p>
      </header>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت آزمون‌ها…</div>
      ) : testsSource !== "db" || tests.length === 0 ? (
        <Panel>
          <ShieldCheck className="mb-3 h-6 w-6 text-steel" />
          <p className="text-base font-bold text-ink">هنوز آزمونی منتشر نشده است</p>
          <p className="mt-1 text-[14px] leading-7 text-body">آزمون‌ها در پنل مدیریت ساخته و پس از بازبینی علمی منتشر می‌شوند.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tests.map((t) => (
            <Link key={t.id} to={`/tests/${t.slug}`} className="group flex flex-col rounded-[24px] border border-ink/8 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass">
              <div className="mb-4 flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steel/10 text-steel transition-colors group-hover:bg-steel group-hover:text-white">
                  <FileText className="h-6 w-6" strokeWidth={1.7} />
                </span>
                {t.categoryName && <span className="rounded-full bg-mist px-3 py-1 text-[14px] font-bold text-steel">{t.categoryName}</span>}
              </div>
              <h2 className="mb-2 text-lg font-semibold text-ink">{t.title}</h2>
              <p className="mb-5 line-clamp-3 text-[14px] leading-7 text-body">{t.description ?? "توضیح کوتاه این آزمون ثبت نشده است."}</p>
              <p className="mt-auto flex items-center gap-4 text-[14px] text-body">
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{t.duration_minutes ? `${fa(t.duration_minutes)} دقیقه` : "زمان نامشخص"}</span>
                <span className="ms-auto font-bold text-steel">مشاهده <ArrowLeft className="inline h-3.5 w-3.5" /></span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function useTestBySlug(slug: string) {
  const { tests, loading: siteLoading } = useSiteData();
  const fromSite = tests.find((t) => t.slug === slug) ?? null;
  const [test, setTest] = useState<PublicTest | null>(fromSite);
  const [loading, setLoading] = useState(!fromSite);
  useEffect(() => {
    if (fromSite) {
      setTest(fromSite);
      setLoading(false);
      return;
    }
    if (siteLoading || !supabase) return;
    let cancelled = false;
    supabase
      .from("tests")
      .select("id,slug,title_fa,short_description,description,duration_minutes,report_type,cover_url,scientific_lead,published_at")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("review_status", "approved")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setTest(
          data
            ? { id: data.id, slug: data.slug, title: data.title_fa, description: data.description || data.short_description, duration_minutes: data.duration_minutes, report_type: data.report_type, categoryName: null, cover_url: data.cover_url, scientific_lead: data.scientific_lead, published_at: data.published_at }
            : null
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, fromSite, siteLoading]);
  return { test, loading };
}

/** قالب جزئیات: اطلاعات آزمون + شروع */
export function TestDetailPage() {
  const { slug = "" } = useParams();
  const { test, loading } = useTestBySlug(slug);
  const { session } = useAuth();
  const [version, setVersion] = useState<PublishedVersion | null>(null);

  useEffect(() => {
    if (test) void loadPublishedVersion(test.id).then(setVersion);
  }, [test]);

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت آزمون…</div>;
  if (!test) {
    return (
      <Panel>
        <p className="text-base font-bold text-ink">آزمون یافت نشد</p>
        <p className="mt-1 text-[14px] text-body">این آزمون وجود ندارد یا هنوز منتشر نشده است.</p>
        <Link to="/tests" className="mt-4 inline-flex items-center gap-1.5 font-bold text-steel"><ArrowRight className="h-4 w-4" />همه‌ی آزمون‌ها</Link>
      </Panel>
    );
  }

  const startHref = `/tests/${test.slug}/take`;
  return (
    <>
      <Link to="/tests" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-bold text-steel"><ArrowRight className="h-4 w-4" />همه‌ی آزمون‌ها</Link>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Panel>
            {test.cover_url && <img src={test.cover_url} alt="" className="mb-6 h-56 w-full rounded-2xl object-cover" />}
            {test.categoryName && <span className="mb-3 inline-block rounded-full bg-mist px-3 py-1 text-[14px] font-bold text-steel">{test.categoryName}</span>}
            <h1 className="text-2xl font-semibold leading-relaxed text-ink md:text-3xl">{test.title}</h1>
            <p className="mt-4 whitespace-pre-line text-base leading-8 text-body">{test.description ?? "توضیحی ثبت نشده است."}</p>
            <div className="mt-6"><Disclaimer /></div>
          </Panel>
        </div>
        <aside className="lg:col-span-4">
          <Panel className="lg:sticky lg:top-28">
            <dl className="space-y-3 text-[14px]">
              <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5 text-body"><Clock3 className="h-4 w-4" />زمان تقریبی</dt><dd className="font-bold text-ink">{test.duration_minutes ? `${fa(test.duration_minutes)} دقیقه` : "نامشخص"}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5 text-body"><FileText className="h-4 w-4" />تعداد سؤال</dt><dd className="font-bold text-ink">{version ? fa(version.questions.length) : "—"}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-body">نوع گزارش</dt><dd className="font-bold text-ink">{test.report_type ?? "گزارش شخصی"}</dd></div>
              {test.scientific_lead && <div className="flex items-center justify-between gap-2"><dt className="text-body">مسئول علمی</dt><dd className="font-bold text-ink">{test.scientific_lead}</dd></div>}
              {version && <div className="flex items-center justify-between gap-2"><dt className="text-body">نسخه</dt><dd className="font-bold text-ink">{version.version_label}</dd></div>}
            </dl>
            <div className="mt-6 space-y-2">
              {session ? (
                <Link to={startHref} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-coral text-base font-bold text-ink shadow-soft transition-all hover:bg-coral-deep">
                  شروع آزمون <ArrowLeft className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link to={`/login?next=${encodeURIComponent(startHref)}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-coral text-base font-bold text-ink shadow-soft transition-all hover:bg-coral-deep">
                    <UserRound className="h-4 w-4" /> ورود و شروع آزمون
                  </Link>
                  <p className="text-center text-[13px] leading-6 text-body">برای ذخیره‌ی نتیجه در حساب شما، ورود لازم است.</p>
                </>
              )}
              {!version && supabaseConfigured && <p className="text-center text-[13px] text-body">نسخه‌ی قابل اجرا برای این آزمون یافت نشد.</p>}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** قالب اجرای آزمون: یک سؤال در هر صفحه، ذخیره‌ی پاسخ سمت سرور، اعتبارسنجی الزامی‌ها */
export function TestTakePage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { test, loading } = useTestBySlug(slug);
  const [version, setVersion] = useState<PublishedVersion | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"init" | "save" | "finish" | null>("init");
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!test) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await loadPublishedVersion(test.id);
        if (!v) throw new Error("نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد.");
        const id = await startAttempt(test.id);
        const existing = await loadExistingAnswers(id);
        if (cancelled) return;
        setVersion(v);
        setAttemptId(id);
        setAnswers(existing);
        const firstUnanswered = v.questions.findIndex((q) => !existing[q.id]?.length);
        setIndex(firstUnanswered === -1 ? Math.max(v.questions.length - 1, 0) : firstUnanswered);
      } catch (e) {
        if (!cancelled) setError(flowError(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [test]);

  const q = version?.questions[index];
  const total = version?.questions.length ?? 0;
  const answeredCount = useMemo(() => (version ? version.questions.filter((x) => answers[x.id]?.length).length : 0), [version, answers]);
  const canFinish = useMemo(() => Boolean(version && version.questions.every((x) => x.is_required === false || answers[x.id]?.length)), [version, answers]);

  const choose = useCallback(
    (optionId: string) => {
      if (!q || !attemptId) return;
      const next = q.type === "multi_choice" ? (answers[q.id]?.includes(optionId) ? answers[q.id].filter((o) => o !== optionId) : [...(answers[q.id] ?? []), optionId]) : [optionId];
      setAnswers((prev) => ({ ...prev, [q.id]: next }));
      setError(null);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        if (next.length === 0) return;
        setBusy("save");
        try {
          await saveAnswer(attemptId, q.id, next);
        } catch (e) {
          setError(flowError(e));
        } finally {
          setBusy(null);
        }
      }, q.type === "multi_choice" ? 500 : 0);
    },
    [q, attemptId, answers]
  );

  const finish = async () => {
    if (!attemptId) return;
    setBusy("finish");
    setError(null);
    try {
      window.clearTimeout(saveTimer.current);
      const r = await completeAttempt(attemptId);
      navigate(`/tests/${slug}/result/${r.attempt_id}`, { replace: true });
    } catch (e) {
      setError(flowError(e));
      setBusy(null);
    }
  };

  const leave = async () => {
    if (attemptId && answeredCount === 0) await abandonAttempt(attemptId);
    navigate(`/tests/${slug}`);
  };

  if (loading || busy === "init") return <div className="flex items-center justify-center gap-2 py-24 text-body"><Loader2 className="h-4 w-4 animate-spin" />آماده‌سازی آزمون…</div>;
  if (!test) return <Panel><p className="font-bold text-ink">آزمون یافت نشد.</p></Panel>;
  if (!version || !q) {
    return (
      <Panel>
        <p className="text-base font-bold text-ink">امکان شروع آزمون وجود ندارد</p>
        <p className="mt-2 text-[14px] leading-7 text-body">{error ?? "نسخه‌ی قابل اجرا یافت نشد."}</p>
        <Link to={`/tests/${slug}`} className="mt-4 inline-flex items-center gap-1.5 font-bold text-steel"><ArrowRight className="h-4 w-4" />بازگشت به معرفی آزمون</Link>
      </Panel>
    );
  }

  const selected = answers[q.id] ?? [];
  const progress = Math.round((answeredCount / total) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-[14px] text-body">
        <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 font-bold text-steel hover:text-ink"><ArrowRight className="h-4 w-4" />خروج</button>
        <span>سؤال {fa(index + 1)} از {fa(total)} · {fa(answeredCount)} پاسخ داده‌شده</span>
      </div>
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-cream-alt" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="پیشرفت آزمون">
        <div className="h-full rounded-full bg-steel transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <Panel>
        <p className="mb-1 text-[14px] font-semibold text-body">{test.title}{q.dimension ? ` · ${q.dimension}` : ""}</p>
        <h1 className="text-xl font-semibold leading-relaxed text-ink">{q.prompt}</h1>
        {q.help_text && <p className="mt-2 text-[14px] leading-7 text-body">{q.help_text}</p>}
        {q.type === "multi_choice" && <p className="mt-2 text-[13px] text-body">می‌توانید چند گزینه انتخاب کنید.</p>}

        <div role={q.type === "multi_choice" ? "group" : "radiogroup"} aria-label="گزینه‌ها" className="mt-6 space-y-2.5">
          {q.options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={q.type === "multi_choice" ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => choose(o.id)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-right text-base transition-all duration-150",
                  on ? "border-steel bg-steel/8 font-bold text-ink" : "border-ink/10 bg-white text-ink hover:border-steel/40 hover:bg-cream"
                )}
              >
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", on ? "border-steel bg-steel text-white" : "border-ink/25")} aria-hidden="true">
                  {on && <CheckCircle2 className="h-4 w-4" />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold leading-6 text-[#8f322d]">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4">
          <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink/15 px-5 text-[15px] font-bold text-ink disabled:opacity-40">
            <ArrowRight className="h-4 w-4" />قبلی
          </button>
          <span className="text-[13px] text-body">{busy === "save" ? "در حال ذخیره…" : "پاسخ‌ها به‌صورت خودکار ذخیره می‌شوند"}</span>
          {index < total - 1 ? (
            <button type="button" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} disabled={q.is_required !== false && selected.length === 0} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[15px] font-bold text-white disabled:opacity-40">
              بعدی<ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={() => void finish()} disabled={!canFinish || busy === "finish"} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-coral px-5 text-[15px] font-bold text-ink shadow-soft disabled:opacity-50">
              {busy === "finish" && <Loader2 className="h-4 w-4 animate-spin" />}
              پایان و مشاهده‌ی نتیجه
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** قالب نتیجه: امتیاز، تفسیر از snapshot نسخه، ابعاد */
export function TestResultPage() {
  const { slug = "", attemptId = "" } = useParams();
  const { test, loading } = useTestBySlug(slug);
  const [result, setResult] = useState<TestResult | null>(null);
  const [version, setVersion] = useState<PublishedVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !attemptId) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase!.from("test_results").select("*").eq("attempt_id", attemptId).maybeSingle();
      if (cancelled) return;
      if (err) return setError(flowError(err));
      if (!data) return setError("نتیجه‌ای برای این آزمون در حساب شما یافت نشد.");
      setResult(data as TestResult);
      if (test) setVersion(await loadPublishedVersion(test.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, test]);

  if (loading || (!result && !error)) return <div className="flex items-center justify-center gap-2 py-24 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت نتیجه…</div>;
  if (error || !result) {
    return (
      <Panel>
        <p className="text-base font-bold text-ink">نتیجه در دسترس نیست</p>
        <p className="mt-2 text-[14px] leading-7 text-body">{error}</p>
        <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 font-bold text-steel"><ArrowRight className="h-4 w-4" />داشبورد من</Link>
      </Panel>
    );
  }

  const dims = Object.entries(result.dimension_scores ?? {}).filter(([k]) => k !== "total");
  const interp = result.interpretation ?? {};
  const pct = result.min_score !== null && result.max_score !== null && result.max_score > result.min_score ? Math.round(((result.total_score - result.min_score) / (result.max_score - result.min_score)) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Panel>
        <p className="section-label mb-2">گزارش آزمون</p>
        <h1 className="text-2xl font-semibold text-ink">{test?.title ?? "نتیجه‌ی آزمون"}</h1>
        <p className="mt-1 text-[14px] text-body">{new Date(result.computed_at).toLocaleString("fa-IR", { dateStyle: "long", timeStyle: "short" })}{version ? ` · نسخه‌ی ${version.version_label}` : ""}</p>

        <div className="mt-6 rounded-2xl bg-cream p-5">
          <p className="text-[14px] font-semibold text-body">امتیاز کل</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{scoreLabel(result.total_score, result.min_score, result.max_score)}</p>
          {pct !== null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="img" aria-label={`${fa(pct)} درصد از بازه‌ی ممکن`}>
              <div className="h-full rounded-full bg-steel" style={{ width: `${pct}%` }} />
            </div>
          )}
          {version?.scoring_rules.description && <p className="mt-2 text-[13px] text-body">{String(version.scoring_rules.description)}</p>}
        </div>

        {interp.label ? (
          <div className="mt-5 rounded-2xl border border-steel/15 bg-steel/5 p-5">
            <p className="text-[14px] font-semibold text-steel">تفسیر</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">{interp.label}</h2>
            <p className="mt-2 whitespace-pre-line text-base leading-8 text-body">{interp.description}</p>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-cream px-4 py-3 text-[14px] leading-7 text-body">برای این بازه‌ی امتیاز، متن تفسیری در نسخه‌ی منتشرشده تعریف نشده است؛ امتیاز شما ذخیره شده و قابل مرور است.</p>
        )}

        {dims.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 text-[15px] font-bold text-ink">امتیاز ابعاد</h2>
            <ul className="divide-y divide-ink/5 rounded-2xl border border-ink/8">
              {dims.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between px-4 py-2.5 text-[14px]"><span className="text-body">{k}</span><span className="font-bold text-ink">{Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6"><Disclaimer /></div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Link to="/dashboard" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-base font-bold text-white">داشبورد من</Link>
        <Link to="/tests" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/15 px-6 text-base font-bold text-ink">آزمون‌های دیگر</Link>
      </div>
    </div>
  );
}
