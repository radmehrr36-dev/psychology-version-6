import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Database, Globe2, HardDrive, KeyRound, LayoutDashboard, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { describeError } from "../backend";
import { Card, Skeleton, StatusBadge, formatDate, formatRelative } from "../ui";
import { cn } from "../../utils/cn";
import type { AuditLog, ServiceSetting } from "../../lib/types";

type HealthState = "checking" | "ok" | "slow" | "failed" | "unchecked";

interface Check {
  id: string;
  label: string;
  icon: LucideIcon;
  state: HealthState;
  ms?: number;
  detail?: string;
}

const stateMeta: Record<HealthState, { label: string; className: string }> = {
  checking: { label: "در حال بررسی", className: "bg-[#eef0f6] text-body" },
  ok: { label: "سالم", className: "bg-[#e6f4ee] text-[#2f7556]" },
  slow: { label: "کند", className: "bg-[#fdf1df] text-[#8a5a14]" },
  failed: { label: "خطا", className: "bg-[#fbeceb] text-[#a33a34]" },
  unchecked: { label: "بررسی‌نشده", className: "bg-[#f1f3f7] text-body" },
};

async function timed(run: () => Promise<true | string>): Promise<{ state: HealthState; ms: number; detail?: string }> {
  const t0 = performance.now();
  try {
    const result = await Promise.race([
      run(),
      new Promise<string>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    const ms = Math.round(performance.now() - t0);
    if (result === true) return { state: ms > 1500 ? "slow" : "ok", ms };
    return { state: "failed", ms, detail: result };
  } catch (e) {
    return {
      state: "failed",
      ms: Math.round(performance.now() - t0),
      detail: e instanceof Error && e.message === "timeout" ? "پاسخی دریافت نشد (مهلت ۸ ثانیه)" : "ارتباط برقرار نشد",
    };
  }
}

const baseChecks: Check[] = [
  { id: "db", label: "پایگاه داده (Supabase)", icon: Database, state: "checking" },
  { id: "auth", label: "احراز هویت", icon: KeyRound, state: "checking" },
  { id: "storage", label: "فضای ذخیره‌سازی فایل", icon: HardDrive, state: "checking" },
];

/**
 * وضعیت سرویس‌ها — همه‌ی مقادیر از بررسی واقعی همین لحظه می‌آیند.
 * اگر بررسی ممکن نباشد «بررسی‌نشده» نمایش داده می‌شود، نه «سالم».
 */
export function ServiceHealth({
  services,
  loadErrors,
  dataLoading,
  refreshKey,
}: {
  /** undefined = مجوز مشاهده‌ی سرویس‌های خارجی وجود ندارد */
  services?: ServiceSetting[];
  loadErrors: string[];
  dataLoading: boolean;
  refreshKey: number;
}) {
  const { can } = useAuth();
  const [checks, setChecks] = useState<Check[]>(baseChecks);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [failures, setFailures] = useState<AuditLog[]>([]);
  const runId = useRef(0);
  const canAudit = can("audit", "read");

  const run = useCallback(async () => {
    if (!supabase) return;
    const db = supabase;
    const id = ++runId.current;
    setRunning(true);
    setChecks(baseChecks.map((c) => ({ ...c, state: "checking" })));

    const results = await Promise.all([
      timed(async () => {
        const { error } = await db.from("site_settings").select("key", { head: true, count: "exact" });
        return error ? describeError(error) : true;
      }),
      timed(async () => {
        const { data, error } = await db.auth.getUser();
        return error || !data.user ? "نشست معتبر نیست" : true;
      }),
      timed(async () => {
        const { error } = await db.storage.from("site-media").list("", { limit: 1 });
        return error ? "دسترسی به فضای ذخیره‌سازی ممکن نیست" : true;
      }),
    ]);
    if (runId.current !== id) return;
    setChecks(baseChecks.map((c, i) => ({ ...c, ...results[i] })));
    setCheckedAt(new Date().toISOString());

    if (canAudit) {
      const { data } = await db
        .from("audit_logs")
        .select("id,actor_email,actor_role,action,resource_type,resource_id,result,metadata,created_at,actor_id")
        .eq("result", "failure")
        .order("created_at", { ascending: false })
        .limit(3);
      if (runId.current === id) setFailures((data ?? []) as AuditLog[]);
    }
    setRunning(false);
  }, [canAudit]);

  useEffect(() => {
    void run();
  }, [run, refreshKey]);

  const dataCheck: Check = {
    id: "data",
    label: "بارگذاری داده‌های داشبورد",
    icon: LayoutDashboard,
    state: dataLoading ? "checking" : loadErrors.length > 0 ? "failed" : "ok",
    detail: loadErrors[0],
  };

  let aiCheck: Check;
  if (services === undefined) {
    aiCheck = { id: "ai", label: "سرویس هوش مصنوعی", icon: Sparkles, state: "unchecked", detail: "مجوز مشاهده‌ی سرویس‌ها را ندارید" };
  } else if (services.length === 0) {
    aiCheck = { id: "ai", label: "سرویس هوش مصنوعی", icon: Sparkles, state: "unchecked", detail: "سرویسی ثبت نشده است" };
  } else if (services.some((s) => s.is_enabled && s.last_check_status === "failed")) {
    aiCheck = { id: "ai", label: "سرویس هوش مصنوعی", icon: Sparkles, state: "failed", detail: "آخرین بررسی یک سرویس فعال ناموفق بود" };
  } else if (services.some((s) => s.is_enabled) && services.filter((s) => s.is_enabled).every((s) => s.last_check_status === "ok")) {
    aiCheck = { id: "ai", label: "سرویس هوش مصنوعی", icon: Sparkles, state: "ok", detail: "طبق آخرین بررسی ثبت‌شده" };
  } else {
    aiCheck = { id: "ai", label: "سرویس هوش مصنوعی", icon: Sparkles, state: "unchecked", detail: "هنوز بررسی اتصال انجام نشده یا سرویس فعال نیست" };
  }

  const all = [...checks, dataCheck, aiCheck];
  const recent = [
    ...loadErrors.map((m, i) => ({ key: `load-${i}`, text: m, at: null as string | null })),
    ...failures.map((f) => ({ key: f.id, text: `${f.action} روی ${f.resource_type}`, at: f.created_at as string | null })),
  ];

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <Globe2 className="h-4.5 w-4.5 text-steel" />
          وضعیت سرویس‌ها
        </h2>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-body transition-colors duration-150 hover:bg-mist hover:text-ink disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", running && "animate-spin")} />
          بررسی مجدد
        </button>
      </div>

      <ul className="divide-y divide-adm-line">
        {all.map((c) => {
          const meta = stateMeta[c.state];
          return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f3f8] text-steel">
                <c.icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ink">{c.label}</p>
                {(c.detail || c.ms !== undefined) && (
                  <p className="truncate text-[12.5px] text-body">
                    {c.ms !== undefined && c.state !== "checking" ? `${c.ms.toLocaleString("fa-IR")} میلی‌ثانیه` : ""}
                    {c.ms !== undefined && c.detail ? " · " : ""}
                    {c.detail}
                  </p>
                )}
              </div>
              {c.state === "checking" ? (
                <Skeleton className="h-6 w-20 rounded-full" />
              ) : (
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold", meta.className)}>{meta.label}</span>
              )}
            </li>
          );
        })}
      </ul>

      {services !== undefined && services.length > 0 && (
        <div className="border-t border-adm-line">
          <div className="flex items-center justify-between px-4 pt-3">
            <h3 className="text-[13px] font-bold text-body">سرویس‌های خارجی ثبت‌شده</h3>
            <Link to="/admin/api-settings" className="text-[13px] font-bold text-steel hover:underline">
              مدیریت
            </Link>
          </div>
          <ul className="divide-y divide-adm-line">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-[13.5px] font-bold text-ink">{s.name}</span>
                <StatusBadge status={s.last_check_status ?? "unconfigured"} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {services !== undefined && services.length === 0 && (
        <p className="border-t border-adm-line px-4 py-3 text-[13px] leading-6 text-body">
          سرویسی ثبت نشده است؛ در بخش «سرویس‌ها و API» تنظیمات غیرمحرمانه را اضافه کنید.
        </p>
      )}

      <div className="mt-auto border-t border-adm-line px-4 py-3">
        <h3 className="mb-1.5 text-[13px] font-bold text-body">خطاهای اخیر</h3>
        {recent.length === 0 ? (
          <p className="text-[13px] leading-6 text-body">
            خطای ثبت‌شده‌ای وجود ندارد{canAudit ? " (بر اساس لاگ مدیریتی و بارگذاری همین نشست)" : " (بر اساس بارگذاری همین نشست)"}.
          </p>
        ) : (
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-2 text-[13px] leading-6 text-[#a33a34]">
                <span>{r.text}</span>
                {r.at && <span className="shrink-0 text-body">{formatRelative(r.at)}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12.5px] text-body" title={checkedAt ? formatDate(checkedAt, true) : undefined}>
          آخرین بررسی: {checkedAt ? formatRelative(checkedAt) : "هنوز انجام نشده"}
        </p>
      </div>
    </Card>
  );
}
