import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { AccessDenied, Card, ErrorState, LoadingState, PageHeader, inputClass } from "../../ui";
import { callRpc, faNum } from "../../../improvement/api";

interface Overview {
  period_days: number;
  paths: { total: number; published: number; draft: number; archived: number };
  exercises: { total: number; published: number };
  rules: { total: number; active: number };
  plans: { started_total: number; started_period: number; active: number; completed: number; paused: number; cancelled: number; completion_rate: number | null };
  activities: { assigned: number; completed: number; completed_period: number; completion_rate: number | null };
  popular_paths: Array<{ path_id: string; title: string; plans: number; completed: number }>;
  popular_exercises: Array<{ exercise_id: string; title: string; completed: number; assigned: number }>;
  dropoff: Array<{ path_title: string; day_number: number; step_title: string; count: number }>;
}

function useOverview(days: number, enabled: boolean) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const res = await callRpc<Overview>("admin_improvement_overview", { p_days: days });
    setError(res.error);
    setData(res.data);
    setLoading(false);
  }, [days, enabled]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12.5px] font-semibold text-body">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-body">{hint}</p>}
    </Card>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${faNum(n)}٪`);

function Body({ d }: { d: Overview }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="مسیرهای فعال (منتشرشده)" value={faNum(d.paths.published)} hint={`از ${faNum(d.paths.total)} مسیر؛ ${faNum(d.paths.draft)} پیش‌نویس`} />
        <Metric label="شروع برنامه‌ها" value={faNum(d.plans.started_total)} hint={`${faNum(d.plans.started_period)} مورد در ${faNum(d.period_days)} روز اخیر`} />
        <Metric label="برنامه‌های تکمیل‌شده" value={faNum(d.plans.completed)} hint={`نرخ تکمیل مسیرها: ${pct(d.plans.completion_rate)}`} />
        <Metric label="متوقف / لغوشده" value={`${faNum(d.plans.paused)} / ${faNum(d.plans.cancelled)}`} hint={`${faNum(d.plans.active)} برنامه‌ی فعال`} />
        <Metric label="فعالیت‌های انجام‌شده" value={faNum(d.activities.completed)} hint={`${faNum(d.activities.completed_period)} مورد در ${faNum(d.period_days)} روز اخیر`} />
        <Metric label="نرخ تکمیل تمرین‌ها" value={pct(d.activities.completion_rate)} hint={`از ${faNum(d.activities.assigned)} فعالیت تخصیص‌یافته (ردشده‌ها حذف می‌شوند)`} />
        <Metric label="تمرین‌های منتشرشده" value={faNum(d.exercises.published)} hint={`از ${faNum(d.exercises.total)} تمرین`} />
        <Metric label="قواعد فعال پیشنهاد" value={faNum(d.rules.active)} hint={`از ${faNum(d.rules.total)} قاعده`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="mb-2 text-[14px] font-extrabold text-ink">محبوب‌ترین مسیرها</h2>
          {d.popular_paths.length === 0 ? <p className="text-[12px] text-body">هنوز برنامه‌ای شروع نشده است.</p> : (
            <ol className="space-y-1.5 text-[12.5px]">{d.popular_paths.map((p) => <li key={p.path_id} className="flex justify-between gap-2"><span className="truncate font-bold text-ink">{p.title}</span><span className="shrink-0 text-body">{faNum(p.plans)} شروع · {faNum(p.completed)} تکمیل</span></li>)}</ol>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-[14px] font-extrabold text-ink">محبوب‌ترین تمرین‌ها</h2>
          {d.popular_exercises.length === 0 ? <p className="text-[12px] text-body">هنوز تمرینی انجام نشده است.</p> : (
            <ol className="space-y-1.5 text-[12.5px]">{d.popular_exercises.map((p) => <li key={p.exercise_id} className="flex justify-between gap-2"><span className="truncate font-bold text-ink">{p.title}</span><span className="shrink-0 text-body">{faNum(p.completed)} انجام از {faNum(p.assigned)}</span></li>)}</ol>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-1 text-[14px] font-extrabold text-ink">ریزش در مراحل</h2>
          <p className="mb-2 text-[11.5px] leading-5 text-body">برنامه‌های متوقف یا لغوشده، بر اساس اولین مرحله‌ای که الزامی‌هایش ناتمام مانده است.</p>
          {d.dropoff.length === 0 ? <p className="text-[12px] text-body">داده‌ای برای ریزش ثبت نشده است.</p> : (
            <ol className="space-y-1.5 text-[12.5px]">{d.dropoff.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate"><span className="font-bold text-ink">{p.path_title}</span> · روز {faNum(p.day_number)}: {p.step_title}</span><span className="shrink-0 font-bold text-ink">{faNum(p.count)}</span></li>)}</ol>
          )}
        </Card>
      </div>
      <p className="text-[11.5px] leading-6 text-body">این آمار تجمیعی از برنامه‌های واقعی کاربران است. پاسخ‌ها و یادداشت‌های شخصی تمرین‌ها برای مدیران قابل مشاهده نیستند.</p>
    </div>
  );
}

export function ImprovementStatsPage() {
  const { can } = useAuth();
  const canRead = can("paths", "read");
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useOverview(days, canRead);
  if (!canRead) return <AccessDenied />;
  return (
    <>
      <PageHeader
        title="آمار بهبود فردی"
        description="نمای تجمیعی از مسیرها، برنامه‌ها و تمرین‌های کاربران، محاسبه‌شده از داده‌ی واقعی دیتابیس."
        breadcrumb={["پنل مدیریت", "بهبود فردی", "آمار"]}
        actions={
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} max-w-[10rem]`} aria-label="بازه‌ی زمانی">
            <option value={7}>۷ روز اخیر</option><option value={30}>۳۰ روز اخیر</option><option value={90}>۹۰ روز اخیر</option>
          </select>
        }
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data ? <Body d={data} /> : null}
    </>
  );
}

/** نسخه‌ی فشرده برای داشبورد اصلی مدیر؛ در نبود migration یا مجوز، چیزی نمایش نمی‌دهد */
export function ImprovementStatsPanel() {
  const { can } = useAuth();
  const canRead = can("paths", "read");
  const { data, loading, error } = useOverview(30, canRead);
  if (!canRead) return null;
  return (
    <Card className="mt-5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">بهبود فردی</h2>
        <Link to="/admin/improvement/stats" className="text-[12px] font-bold text-steel">آمار کامل</Link>
      </div>
      {loading ? <LoadingState /> : error ? <p className="text-[12px] leading-6 text-[#8a5a14]">{error}</p> : data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="مسیرهای فعال" value={faNum(data.paths.published)} />
          <Metric label="شروع برنامه (۳۰ روز)" value={faNum(data.plans.started_period)} />
          <Metric label="نرخ تکمیل مسیرها" value={pct(data.plans.completion_rate)} />
          <Metric label="نرخ تکمیل تمرین‌ها" value={pct(data.activities.completion_rate)} />
        </div>
      ) : null}
    </Card>
  );
}
