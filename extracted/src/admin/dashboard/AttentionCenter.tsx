import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, CheckCircle2, Clock3, FileText, MessageSquare, RefreshCw, Stethoscope, TriangleAlert, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { Card, EmptyState, Skeleton, StatusBadge, formatDate, formatRelative, toFa } from "../ui";
import { attentionLabels, useAttention, type AttentionKind } from "./attention";
import { cn } from "../../utils/cn";

const kindIcon: Record<AttentionKind, LucideIcon> = {
  support: MessageSquare,
  psychologists: Stethoscope,
  tests: Bot,
  content: FileText,
};

const emptyText: Record<AttentionKind, string> = {
  support: "پیام جدیدی در انتظار پاسخ نیست.",
  psychologists: "درخواست تأیید مدارکی در انتظار بررسی نیست.",
  tests: "نسخه‌ای برای بازبینی علمی ارسال نشده است.",
  content: "محتوای پیش‌نویس یا در انتظار بازبینی وجود ندارد.",
};

export function AttentionCenter() {
  const { can } = useAuth();
  const { items, counts, errors, loading, reload } = useAttention();

  const tabs = useMemo(
    () =>
      (["support", "psychologists", "tests", "content"] as AttentionKind[]).filter((k) => {
        const perm: Record<AttentionKind, [string, string]> = {
          support: ["support", "read"],
          psychologists: ["psychologists", "read"],
          tests: ["tests", "read"],
          content: ["content", "read"],
        };
        return can(perm[k][0], perm[k][1]);
      }),
    [can]
  );

  const [active, setActive] = useState<AttentionKind | null>(null);
  // پیش‌فرض: اولین دسته‌ای که مورد دارد؛ در غیر این صورت اولین دسته
  useEffect(() => {
    if (active && tabs.includes(active)) return;
    const firstWithItems = tabs.find((k) => (counts[k] ?? 0) > 0);
    setActive(firstWithItems ?? tabs[0] ?? null);
  }, [tabs, counts, active]);

  if (tabs.length === 0) return null;
  const current = active && tabs.includes(active) ? active : tabs[0];
  const rows = items.filter((i) => i.kind === current);

  return (
    <Card id="needs-attention" className="flex h-full flex-col scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <TriangleAlert className="h-4.5 w-4.5 text-[#c27a1a]" />
          نیازمند بررسی
        </h2>
        <button
          type="button"
          onClick={reload}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-body transition-colors duration-150 hover:bg-mist hover:text-ink"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          به‌روزرسانی
        </button>
      </div>

      <div role="tablist" aria-label="دسته‌بندی موارد نیازمند بررسی" className="flex gap-1 overflow-x-auto border-b border-adm-line px-3 pt-2">
        {tabs.map((k) => {
          const Icon = kindIcon[k];
          const selected = k === current;
          const count = counts[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(k)}
              className={cn(
                "relative flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 text-[13px] font-bold transition-colors duration-150",
                selected ? "text-steel" : "text-body hover:text-ink"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {attentionLabels[k]}
              {count !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[12px] font-extrabold leading-none",
                    selected ? "bg-steel/12 text-steel" : "bg-[#eef0f4] text-body"
                  )}
                >
                  {toFa(count)}
                </span>
              )}
              {selected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-steel" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-[14rem] flex-1">
        {loading ? (
          <ul className="divide-y divide-adm-line" role="status" aria-label="در حال دریافت">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : errors[current] ? (
          <div className="px-4 py-10 text-center text-[13px] leading-6 text-[#8a5a14] [overflow-wrap:anywhere]" role="alert">
            {errors[current]}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="همه‌چیز بررسی شده است" description={emptyText[current]} />
        ) : (
          <ul className="divide-y divide-adm-line">
            {rows.map((item) => {
              const Icon = kindIcon[item.kind];
              return (
                <li
                  key={item.key}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[#f8f9fc]",
                    item.critical && "bg-[#fdf6f3] shadow-[inset_-3px_0_0_#e0877a]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      item.critical ? "bg-[#fbe4e0] text-[#a33a34]" : "bg-steel/10 text-steel"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-[14px] font-bold text-ink">{item.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-body">
                      <span className="truncate">{item.subject}</span>
                      <span className="flex items-center gap-1" title={formatDate(item.at, true)}>
                        <Clock3 className="h-3 w-3" />
                        {formatRelative(item.at)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.critical && <span className="rounded-full bg-[#fbe4e0] px-2 py-0.5 text-[12px] font-bold text-[#a33a34]">بحرانی</span>}
                    <StatusBadge status={item.status} />
                    <Link
                      to={item.href}
                      className="inline-flex min-h-9 items-center rounded-lg border border-adm-line bg-white px-3 text-[13px] font-bold text-steel transition-colors duration-150 hover:border-steel/40 hover:bg-steel/5"
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && !errors[current] && counts[current] !== null && (counts[current] ?? 0) > rows.length && (
        <p className="flex items-center gap-1.5 border-t border-adm-line px-4 py-2.5 text-[13px] text-body">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {toFa(rows.length)} مورد از {toFa(counts[current] ?? 0)} نمایش داده شده است؛ برای بقیه به بخش مربوطه بروید.
        </p>
      )}
    </Card>
  );
}
