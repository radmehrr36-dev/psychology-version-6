import { Link } from "react-router-dom";
import { Activity, BarChart3, Info, TriangleAlert } from "lucide-react";
import { shortError, type RemoteState } from "../backend";
import { Card, EmptyState, ErrorState, Skeleton, toFa } from "../ui";
import { LineAreaChart } from "./charts";
import type { TestActivity } from "./types";

function PanelHeader({ icon: Icon, title, hint }: { icon: typeof Activity; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
        <Icon className="h-4.5 w-4.5 text-steel" />
        {title}
      </h2>
      {hint && <span className="text-[13px] text-body">{hint}</span>}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="در حال دریافت">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

const noDataNote =
  "ثبت رخدادهای آزمون پس از فعال‌شدن اجرای آزمون برای کاربران آغاز می‌شود؛ تا آن زمان این بخش به‌طور واقعی خالی است.";

/** نمودار فعالیت آزمون‌ها: شروع‌شده، تکمیل‌شده، نرخ تکمیل و آزمون‌های پرریزش */
export function TestActivityPanel({ state, range }: { state: RemoteState<TestActivity>; range: number }) {
  const data = state.data;
  const started = data?.series.reduce((a, p) => a + p.started, 0) ?? 0;
  const completed = data?.series.reduce((a, p) => a + p.completed, 0) ?? 0;
  const rate = started > 0 ? Math.round((completed / started) * 100) : null;
  const abandoned = Math.max(started - completed, 0);
  const dropRate = started > 0 ? Math.round((abandoned / started) * 100) : null;

  return (
    <Card className="flex h-full flex-col">
      <PanelHeader icon={Activity} title="فعالیت آزمون‌ها" hint={`${toFa(range)} روز اخیر`} />
      {state.loading ? (
        <ChartSkeleton />
      ) : state.error ? (
        <ErrorState message={shortError(state) ?? state.error} onRetry={state.reload} />
      ) : !data || data.total_started === 0 ? (
        <EmptyState title="هنوز فعالیتی ثبت نشده است" description={noDataNote} />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "شروع‌شده", value: toFa(started) },
              { label: "تکمیل‌شده", value: toFa(completed) },
              { label: "رهاشده / ناتمام", value: toFa(abandoned) },
              { label: "نرخ تکمیل · رها", value: rate === null ? "—" : `${toFa(rate)}٪ · ${toFa(dropRate ?? 0)}٪` },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-[#f6f7fb] px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-body">{m.label}</p>
                <p className="mt-0.5 text-lg font-black text-ink">{m.value}</p>
              </div>
            ))}
          </div>

          <LineAreaChart
            days={data.series.map((p) => p.day)}
            ariaLabel="نمودار آزمون‌های شروع‌شده و تکمیل‌شده"
            series={[
              { key: "started", label: "شروع‌شده", color: "#5b6bd0", values: data.series.map((p) => p.started) },
              { key: "completed", label: "تکمیل‌شده", color: "#63a88a", values: data.series.map((p) => p.completed) },
            ]}
          />

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-ink">
              <TriangleAlert className="h-4 w-4 text-[#c27a1a]" />
              آزمون‌هایی که کاربران در آن رها می‌کنند
            </h3>
            {data.abandonment.length === 0 ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-[#f6f7fb] p-3 text-[13px] leading-6 text-body">
                <Info className="mt-1 h-3.5 w-3.5 shrink-0" />
                برای تشخیص ریزش، هر آزمون دست‌کم به ۳ شروع در این بازه نیاز دارد.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.abandonment.map((a) => {
                  const dropRate = Math.round((1 - a.completed / a.started) * 100);
                  return (
                    <li key={a.test_id} className="rounded-xl border border-adm-line px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/admin/tests/${a.test_id}`} className="min-w-0 truncate text-[13.5px] font-bold text-ink hover:text-steel">
                          {a.title}
                        </Link>
                        <span className="shrink-0 text-[13px] font-extrabold text-[#a33a34]">{toFa(dropRate)}٪ ریزش</span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-body">
                        {toFa(a.completed)} تکمیل از {toFa(a.started)} شروع
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** محبوب‌ترین آزمون‌ها بر اساس تعداد شروع در بازه */
export function PopularTestsPanel({ state, range }: { state: RemoteState<TestActivity>; range: number }) {
  const data = state.data;
  const total = data?.total_started ?? 0;
  return (
    <Card className="flex h-full flex-col">
      <PanelHeader icon={BarChart3} title="محبوب‌ترین آزمون‌ها" hint={`${toFa(range)} روز اخیر`} />
      {state.loading ? (
        <div className="space-y-4 p-4" role="status" aria-label="در حال دریافت">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : state.error ? (
        <ErrorState message={shortError(state) ?? state.error} onRetry={state.reload} />
      ) : !data || data.popular.length === 0 ? (
        <EmptyState title="هنوز آزمونی انجام نشده است" description={noDataNote} />
      ) : (
        <ol className="space-y-4 p-4">
          {data.popular.map((p, i) => {
            const share = total > 0 ? Math.round((p.attempts / total) * 100) : 0;
            return (
              <li key={p.test_id}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Link to={`/admin/tests/${p.test_id}`} className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-ink hover:text-steel">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-steel/10 text-[12px] font-extrabold text-steel">
                      {toFa(i + 1)}
                    </span>
                    <span className="truncate">{p.title}</span>
                  </Link>
                  <span className="shrink-0 text-[13px] font-semibold text-body">
                    {toFa(p.attempts)} بار · {toFa(share)}٪
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eef0f6]" role="img" aria-label={`سهم ${toFa(share)} درصد از کل`}>
                  <div className="h-full rounded-full bg-steel transition-[width] duration-500" style={{ width: `${Math.max(share, 2)}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
