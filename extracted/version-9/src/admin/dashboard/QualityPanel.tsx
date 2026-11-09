import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, FlaskConical } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { shortError, useRpc } from "../backend";
import { Card, EmptyState, ErrorState, Skeleton, formatDate, toFa } from "../ui";
import { cn } from "../../utils/cn";
import type { QualityRow } from "./types";

type Filter = "all" | "verified" | "needs" | "overdue" | "incomplete";

interface Evaluated {
  row: QualityRow;
  verified: boolean;
  needsReview: boolean;
  overdue: boolean;
  incomplete: boolean;
  missing: string[];
}

function evaluate(row: QualityRow, now: number): Evaluated {
  // تأییدشده فقط وقتی هم وضعیت approved است و هم سابقه‌ی بازبینی ثبت شده؛ در غیر این صورت هرگز «تأییدشده» نمایش داده نمی‌شود
  const hasRecord = Boolean(row.last_review_at);
  const verified = row.review_status === "approved" && hasRecord;
  const needsReview = !verified && row.review_status !== "not_required";
  const overdue = Boolean(row.review_due_at) && new Date(row.review_due_at as string).getTime() < now;
  const missing: string[] = [];
  if (!row.scientific_lead?.trim()) missing.push("مسئول علمی");
  if (!row.source_reference?.trim()) missing.push("منبع");
  if (!row.license_info?.trim()) missing.push("اطلاعات مجوز");
  return { row, verified, needsReview, overdue, incomplete: missing.length > 0, missing };
}

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "همه" },
  { id: "verified", label: "تأیید علمی" },
  { id: "needs", label: "نیازمند بازبینی" },
  { id: "overdue", label: "گذشته از موعد" },
  { id: "incomplete", label: "اطلاعات ناقص" },
];

export function QualityPanel() {
  const { can } = useAuth();
  const enabled = can("tests", "read");
  const state = useRpc<QualityRow[]>("admin_test_quality", {}, enabled);
  const [filter, setFilter] = useState<Filter>("all");

  const evaluated = useMemo(() => {
    const now = Date.now();
    return (state.data ?? []).map((r) => evaluate(r, now));
  }, [state.data]);

  const counts: Record<Filter, number> = {
    all: evaluated.length,
    verified: evaluated.filter((e) => e.verified).length,
    needs: evaluated.filter((e) => e.needsReview).length,
    overdue: evaluated.filter((e) => e.overdue).length,
    incomplete: evaluated.filter((e) => e.incomplete).length,
  };

  const visible = evaluated
    .filter((e) =>
      filter === "all" ? true : filter === "verified" ? e.verified : filter === "needs" ? e.needsReview : filter === "overdue" ? e.overdue : e.incomplete
    )
    .slice(0, 8);

  if (!enabled) return null;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <FlaskConical className="h-4.5 w-4.5 text-steel" />
          کیفیت علمی آزمون‌ها
        </h2>
        <Link to="/admin/tests" className="text-[13px] font-bold text-steel hover:underline">
          مدیریت آزمون‌ها
        </Link>
      </div>

      {state.loading ? (
        <div className="space-y-3 p-4" role="status" aria-label="در حال دریافت">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : state.error ? (
        <ErrorState message={shortError(state) ?? state.error} onRetry={state.reload} />
      ) : evaluated.length === 0 ? (
        <EmptyState title="آزمونی برای بررسی وجود ندارد" description="پس از ساخت آزمون در بخش آزمون‌ها، وضعیت علمی آن اینجا دیده می‌شود." />
      ) : (
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "تأیید علمی", value: counts.verified, tone: "bg-[#e6f4ee] text-[#2f7556]" },
              { label: "نیازمند بازبینی", value: counts.needs, tone: "bg-[#fdf1df] text-[#8a5a14]" },
              { label: "گذشته از موعد", value: counts.overdue, tone: "bg-[#fbeceb] text-[#a33a34]" },
              { label: "اطلاعات ناقص", value: counts.incomplete, tone: "bg-[#eef0fb] text-[#4c5bba]" },
            ].map((m) => (
              <div key={m.label} className={cn("rounded-xl px-3 py-2.5", m.tone)}>
                <p className="text-2xl font-black leading-tight">{toFa(m.value)}</p>
                <p className="text-[12.5px] font-bold">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر وضعیت علمی">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-[13px] font-bold transition-colors duration-150",
                  filter === f.id ? "border-steel bg-steel/10 text-steel" : "border-adm-line bg-white text-body hover:text-ink"
                )}
              >
                {f.label} <span className="opacity-70">({toFa(counts[f.id])})</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl bg-[#f6f7fb] p-4 text-center text-[13px] text-body">موردی با این وضعیت وجود ندارد.</p>
          ) : (
            <ul className="divide-y divide-adm-line rounded-xl border border-adm-line">
              {visible.map((e) => (
                <li key={e.row.test_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="truncate text-[14px] font-bold text-ink">{e.row.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-body">
                      {e.row.version_label ? `نسخه‌ی ${e.row.version_label}` : "بدون نسخه‌ی بازبینی‌شده"}
                      {e.row.reviewer_name ? ` · بازبین: ${e.row.reviewer_name}` : ""}
                    </p>
                    {e.incomplete && <p className="mt-0.5 text-[12.5px] text-[#8a5a14]">ناقص: {e.missing.join("، ")}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ee] px-2 py-0.5 text-[12px] font-bold text-[#2f7556]">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        تأیید علمی
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#fdf1df] px-2 py-0.5 text-[12px] font-bold text-[#8a5a14]">
                        {e.row.review_status === "rejected" ? "ردشده" : "نیازمند بازبینی"}
                      </span>
                    )}
                    {e.overdue && <span className="rounded-full bg-[#fbeceb] px-2 py-0.5 text-[12px] font-bold text-[#a33a34]">گذشته از موعد</span>}
                    <span className="text-[12.5px] text-body">
                      {e.row.last_review_at ? `آخرین بازبینی: ${formatDate(e.row.last_review_at)}` : "بدون سابقه‌ی بازبینی"}
                    </span>
                    <Link
                      to={`/admin/tests/${e.row.test_id}`}
                      className="inline-flex min-h-9 items-center rounded-lg border border-adm-line px-3 text-[13px] font-bold text-steel transition-colors duration-150 hover:border-steel/40 hover:bg-steel/5"
                    >
                      جزئیات
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {counts[filter] > visible.length && (
            <p className="text-[13px] text-body">
              {toFa(visible.length)} مورد از {toFa(counts[filter])} نمایش داده شده است.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
