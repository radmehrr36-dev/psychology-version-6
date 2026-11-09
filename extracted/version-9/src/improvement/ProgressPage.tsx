import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSiteData } from "../lib/siteData";
import { callRpc, dateFa, faNum, impError, type Overview } from "./api";
import { ProgressBar, StatusChip } from "./UserImprovement";

interface ResultRow {
  attempt_id: string;
  test_id: string;
  version_id: string | null;
  total_score: number;
  min_score: number | null;
  max_score: number | null;
  dimension_scores: Record<string, number>;
  computed_at: string;
}
interface VersionRow { id: string; version_label: string }

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${34 - ((v - min) / span) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="h-14 w-full text-steel" preserveAspectRatio="none" role="img" aria-label="روند نمره‌ها در طول زمان">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => <circle key={i} cx={(i / (values.length - 1)) * 100} cy={34 - ((v - min) / span) * 28} r="2" fill="currentColor" />)}
    </svg>
  );
}

const fmt = (n: number) => faNum(n, 2);

export function ProgressPage() {
  const { tests } = useSiteData();
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const [r, ov] = await Promise.all([
        supabase!.from("test_results").select("attempt_id,test_id,version_id,total_score,min_score,max_score,dimension_scores,computed_at").order("computed_at", { ascending: true }).limit(500),
        callRpc<Overview>("my_improvement_overview"),
      ]);
      if (r.error) return setError(impError(r.error));
      const rows = (r.data ?? []) as ResultRow[];
      setResults(rows);
      if (ov.data) setOverview(ov.data);
      const ids = [...new Set(rows.map((x) => x.version_id).filter((x): x is string => Boolean(x)))];
      if (ids.length) {
        const v = await supabase!.from("test_versions").select("id,version_label").in("id", ids);
        setVersions((v.data ?? []) as VersionRow[]);
      }
    })();
  }, []);

  // فقط نتایجی با یک آزمون و یک نسخه (و روش نمره‌گذاری یکسان) قابل مقایسه‌اند
  const groups = useMemo(() => {
    const map = new Map<string, ResultRow[]>();
    for (const r of results ?? []) {
      const key = `${r.test_id}::${r.version_id ?? "none"}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, test_id: rows[0].test_id, version_id: rows[0].version_id, rows }));
  }, [results]);

  const titleOf = (id: string) => tests.find((t) => t.id === id)?.title ?? "آزمون";
  const versionLabel = (id: string | null) => (id ? versions.find((v) => v.id === id)?.version_label ?? "نسخه‌ی قبلی" : "—");
  const versionsPerTest = (testId: string) => new Set(groups.filter((g) => g.test_id === testId).map((g) => g.version_id)).size;

  const plans = overview?.plans ?? [];
  const totals = plans.reduce((a, p) => ({ done: a.done + p.metrics.completed, plans: a.plans + 1, completed: a.completed + (p.status === "completed" ? 1 : 0) }), { done: 0, plans: 0, completed: 0 });
  const withAdherence = plans.filter((p) => p.metrics.adherence !== null && (p.status === "active" || p.status === "completed"));
  const avgAdherence = withAdherence.length ? Math.round(withAdherence.reduce((a, p) => a + (p.metrics.adherence ?? 0), 0) / withAdherence.length) : null;

  if (error) return <div className="card-glass p-6 text-[14px] font-semibold text-[#8f322d]" role="alert">{error}</div>;
  if (!results) return <div className="flex items-center gap-2 py-12 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />دریافت گزارش پیشرفت…</div>;

  return (
    <div className="space-y-5">
      <header>
        <p className="section-label mb-1">گزارش پیشرفت</p>
        <h1 className="section-title">روند من</h1>
        <p className="section-lead mt-2">این گزارش فقط از نتایج آزمون‌ها و فعالیت‌هایی ساخته می‌شود که خودتان ثبت کرده‌اید. تغییر نمره به‌تنهایی نشانه‌ی بهبود یا بدتر شدن سلامت روان نیست و تشخیص یا درمان محسوب نمی‌شود.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="خلاصه‌ی فعالیت‌ها">
        {[
          ["آزمون‌های ثبت‌شده", faNum(results.length)],
          ["برنامه‌های شروع‌شده", faNum(totals.plans)],
          ["برنامه‌های تکمیل‌شده", faNum(totals.completed)],
          ["فعالیت‌های انجام‌شده", faNum(totals.done)],
        ].map(([l, v]) => <div key={l} className="card-glass p-5"><p className="text-[13.5px] font-semibold text-body">{l}</p><p className="mt-1 text-2xl font-semibold text-ink">{v}</p></div>)}
      </section>
      {avgAdherence !== null && <p className="card-glass p-5 text-[15px] text-body">میانگین پایبندی به برنامه‌های شما تا امروز: <strong className="text-ink">{faNum(avgAdherence)}٪</strong></p>}

      <section className="card-glass p-6" aria-labelledby="cmp-title">
        <h2 id="cmp-title" className="mb-1 text-lg font-semibold text-ink">مقایسه‌ی نتایج آزمون‌های مشابه</h2>
        <p className="mb-4 text-[13.5px] leading-7 text-body">فقط نتایجی با هم مقایسه می‌شوند که آزمون و نسخه‌ی یکسان داشته باشند. نتایج نسخه‌های مختلف یک آزمون، جداگانه نمایش داده می‌شوند.</p>
        {groups.length === 0 ? (
          <div className="rounded-2xl bg-cream px-5 py-8 text-center"><p className="font-bold text-ink">هنوز آزمونی را کامل نکرده‌اید</p><Link to="/tests" className="btn-primary mt-3 min-h-11 px-5 text-[14px]">مشاهده‌ی آزمون‌ها</Link></div>
        ) : (
          <div className="space-y-4">{groups.map((g) => {
            const first = g.rows[0], last = g.rows[g.rows.length - 1];
            const delta = last.total_score - first.total_score;
            const dimKeys = Object.keys(last.dimension_scores ?? {}).filter((k) => k !== "total" && first.dimension_scores?.[k] !== undefined);
            return (
              <div key={g.key} className="rounded-2xl border border-ink/8 bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-ink">{titleOf(g.test_id)} <span className="text-[13px] font-normal text-body">· نسخه‌ی {versionLabel(g.version_id)}</span></h3>
                  <span className="text-[13px] text-body">{faNum(g.rows.length)} نتیجه</span>
                </div>
                {versionsPerTest(g.test_id) > 1 && <p className="mt-1 text-[12.5px] text-[#8a5a14]">این آزمون در چند نسخه انجام شده؛ مقایسه فقط بین نتایج همین نسخه است.</p>}
                {g.rows.length < 2 ? (
                  <p className="mt-2 text-[14px] text-body">برای مقایسه، حداقل دو نتیجه از همین نسخه لازم است. آخرین نمره: <strong className="text-ink">{fmt(last.total_score)}</strong> ({dateFa(last.computed_at)}).</p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-body">
                      <span>اولین نمره: <strong className="text-ink">{fmt(first.total_score)}</strong> ({dateFa(first.computed_at)})</span>
                      <span>آخرین نمره: <strong className="text-ink">{fmt(last.total_score)}</strong> ({dateFa(last.computed_at)})</span>
                      <span className="inline-flex items-center gap-1 font-bold text-ink">{delta > 0 ? <TrendingUp className="h-4 w-4" /> : delta < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}تغییر نمره: {delta > 0 ? "+" : ""}{fmt(delta)}</span>
                    </div>
                    <Sparkline values={g.rows.map((r) => Number(r.total_score))} />
                    {dimKeys.length > 0 && (
                      <ul className="mt-2 grid gap-1 text-[13.5px] sm:grid-cols-2">{dimKeys.map((k) => { const d = Number(last.dimension_scores[k]) - Number(first.dimension_scores[k]); return <li key={k} className="flex justify-between rounded-xl bg-cream px-3 py-1.5"><span className="text-body">{k}</span><span className="font-bold text-ink">{fmt(Number(first.dimension_scores[k]))} ← {fmt(Number(last.dimension_scores[k]))} ({d > 0 ? "+" : ""}{fmt(d)})</span></li>; })}</ul>
                    )}
                    <p className="mt-2 text-[12.5px] leading-6 text-fog">افزایش یا کاهش نمره بسته به نوع آزمون معنای متفاوتی دارد؛ برای تفسیر دقیق به گزارش هر آزمون مراجعه کنید.</p>
                  </>
                )}
              </div>
            );
          })}</div>
        )}
      </section>

      <section className="card-glass p-6" aria-labelledby="plans-title">
        <h2 id="plans-title" className="mb-3 text-lg font-semibold text-ink">پیشرفت مسیرهای بهبود</h2>
        {plans.length === 0 ? <p className="rounded-2xl bg-cream px-4 py-3 text-[14px] text-body">هنوز مسیری شروع نکرده‌اید.</p> : (
          <ul className="space-y-3">{plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-ink/8 bg-white/70 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Link to={`/account/plans/${p.id}`} className="font-bold text-ink hover:text-steel">{p.title}</Link><StatusChip status={p.status} kind="plan" /></div>
              <ProgressBar value={p.metrics.percent} label={`پیشرفت ${p.title}`} />
              <p className="mt-2 text-[13.5px] text-body">{faNum(p.metrics.percent)}٪ تکمیل · {faNum(p.metrics.completed)} فعالیت انجام‌شده{p.metrics.adherence !== null && p.status !== "cancelled" ? ` · پایبندی ${faNum(p.metrics.adherence)}٪` : ""} · شروع: {dateFa(p.started_at)}</p>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
