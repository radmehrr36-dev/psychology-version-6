import { ImprovementStatsPanel } from "./improvement/ImprovementStats";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  BookOpen,
  CheckCheck,
  FileText,
  Globe2,
  Inbox,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Stethoscope,
  TestTube2,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { MIGRATION_NAME, SHORT_MISSING, describeError, shortError, useRpc } from "../backend";
import { Button, Card, ErrorState, PageHeader, Skeleton, toFa } from "../ui";
import { useAdminPrefs, type RangeDays, type SectionId, type StatCardId } from "../prefs";
import { PrefsDialog } from "../PrefsDialog";
import { StatCard, type StatCardProps } from "../dashboard/StatCard";
import { LineAreaChart } from "../dashboard/charts";
import { AttentionCenter } from "../dashboard/AttentionCenter";
import { QualityPanel } from "../dashboard/QualityPanel";
import { ServiceHealth } from "../dashboard/ServiceHealth";
import { ActivityFeed } from "../dashboard/ActivityFeed";
import { PopularTestsPanel, TestActivityPanel } from "../dashboard/TestPanels";
import { useAttention } from "../dashboard/attention";
import type { GrowthPoint, Overview, TestActivity } from "../dashboard/types";
import type { AuditLog, ServiceSetting } from "../../lib/types";
import { cn } from "../../utils/cn";

interface Stats {
  usersTotal: number | null;
  usersNew: number | null;
  testsPublished: number | null;
  contentPublished: number | null;
  supportOpen: number | null;
}

const emptyStats: Stats = { usersTotal: null, usersNew: null, testsPublished: null, contentPublished: null, supportOpen: null };

/** ردیف دو‌ستونه‌ی Grid؛ اگر هم‌ردیفش پنهان باشد، تمام عرض را می‌گیرد */
function Row({ items }: { items: Array<{ id: string; span: 5 | 7; node: ReactNode } | null> }) {
  const present = items.filter((i): i is { id: string; span: 5 | 7; node: ReactNode } => i !== null);
  if (present.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-[var(--adm-gap)] lg:grid-cols-12">
      {present.map((i) => (
        <div
          key={i.id}
          className={cn("min-w-0", present.length === 1 ? "lg:col-span-12" : i.span === 7 ? "lg:col-span-7" : "lg:col-span-5")}
        >
          {i.node}
        </div>
      ))}
    </div>
  );
}

function GrowthPanel({ days, series, range, loading, error, reload }: {
  days: string[];
  series: GrowthPoint[];
  range: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}) {
  const hasData = series.some((p) => p.signups > 0 || p.active > 0);
  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <Users className="h-4.5 w-4.5 text-steel" />
          رشد کاربران
        </h2>
        <span className="text-[13px] text-body">{toFa(range)} روز اخیر</span>
      </div>
      {loading ? (
        <div className="space-y-3 p-4" role="status" aria-label="در حال دریافت">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-[230px] w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !hasData ? (
        <div className="px-4 py-14 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-body/60" />
          <p className="text-[14px] font-bold text-ink">در این بازه ثبت‌نام یا فعالیتی ثبت نشده است</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-body">
            «کاربران فعال» از روزهایی شمرده می‌شود که کاربر وارد شده است؛ این ثبت از همین اکنون آغاز شده و داده‌ی گذشته را بازسازی نمی‌کند.
          </p>
        </div>
      ) : (
        <div className="p-4">
          <LineAreaChart
            days={days}
            ariaLabel="نمودار ثبت‌نام و کاربران فعال"
            series={[
              { key: "signups", label: "ثبت‌نام جدید", color: "#5b6bd0", values: series.map((p) => p.signups) },
              { key: "active", label: "کاربران فعال", color: "#63a88a", values: series.map((p) => p.active) },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { can, profile } = useAuth();
  const { prefs } = useAdminPrefs();
  const attention = useAttention();
  const [rangeChoice, setRangeChoice] = useState<RangeDays | null>(null);
  const range: RangeDays = rangeChoice ?? prefs.defaultRange;
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [services, setServices] = useState<ServiceSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // بازه‌ی پیش‌فرض از ترجیحات حساب می‌آید (range = انتخاب دستی مدیر ?? ترجیح ذخیره‌شده)

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - range * 86400000).toISOString();
    try {
      const next: Stats = { ...emptyStats };

      const tasks: Array<Promise<void>> = [];

      if (can("users", "read")) {
        tasks.push(
          (async () => {
            const [{ count: total }, { count: recent }] = await Promise.all([
              supabase!.from("profiles").select("id", { count: "exact", head: true }),
              supabase!.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
            ]);
            next.usersTotal = total ?? 0;
            next.usersNew = recent ?? 0;
          })()
        );
      }

      if (can("tests", "read")) {
        tasks.push(
          (async () => {
            const { count } = await supabase!.from("tests").select("id", { count: "exact", head: true }).eq("status", "published");
            next.testsPublished = count ?? 0;
          })()
        );
      }

      if (can("content", "read")) {
        tasks.push(
          (async () => {
            const tables = ["pages", "articles", "magazines", "books"] as const;
            const results = await Promise.all(
              tables.map((t) => supabase!.from(t).select("id", { count: "exact", head: true }).eq("status", "published"))
            );
            next.contentPublished = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
          })()
        );
      }

      if (can("support", "read")) {
        tasks.push(
          (async () => {
            const { count } = await supabase!.from("support_messages").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]);
            next.supportOpen = count ?? 0;
          })()
        );
      }

      if (can("audit", "read")) {
        tasks.push(
          (async () => {
            const { data, error: err } = await supabase!
              .from("audit_logs")
              .select("id,actor_email,actor_role,action,resource_type,resource_id,result,metadata,created_at,actor_id")
              .order("created_at", { ascending: false })
              .limit(8);
            if (err) throw err;
            setActivity((data ?? []) as AuditLog[]);
          })()
        );
      }

      if (can("settings", "api")) {
        tasks.push(
          (async () => {
            const { data } = await supabase!.from("service_settings").select("*").order("name");
            setServices((data ?? []) as ServiceSetting[]);
          })()
        );
      }

      await Promise.all(tasks);
      setStats(next);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [can, range]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  // داده‌های تجمیعی جدید (فقط آمار؛ بدون داده‌ی شخصی)
  const canUsers = can("users", "read");
  const canTests = can("tests", "read");
  const overview = useRpc<Overview>("admin_dashboard_overview", { p_days: range }, true);
  const activeUsers = useRpc<{ dau: number; dau_prev: number; mau: number; mau_prev: number; tracking_since: string | null }>("admin_active_users", {}, canUsers);
  const growth = useRpc<GrowthPoint[]>("admin_growth_series", { p_days: range }, canUsers);
  const testActivity = useRpc<TestActivity>("admin_test_activity", { p_days: range }, canTests);

  const refreshAll = () => {
    setNonce((n) => n + 1);
    overview.reload();
    activeUsers.reload();
    growth.reload();
    testActivity.reload();
    attention.reload();
  };

  const ov = overview.data;
  const growthSeries = growth.data ?? [];
  const signupsSpark = growthSeries.map((p) => p.signups);
  const activeSpark = growthSeries.map((p) => p.active);
  const completedSpark = (testActivity.data?.series ?? []).map((p) => p.completed);

  const cards = useMemo(() => {
    const list: Array<{ id: StatCardId } & StatCardProps> = [];
    const rangeLabel = `${toFa(range)} روز اخیر`;

    if (canUsers) {
      list.push({
        id: "users",
        title: "کاربران ثبت‌نام‌شده",
        value: stats.usersTotal,
        subtitle: stats.usersNew !== null ? `${toFa(stats.usersNew)} کاربر جدید در ${rangeLabel}` : undefined,
        icon: Users,
        to: "/admin/users",
        tone: "bg-steel/10 text-steel",
        loading,
        delta: ov && ov.users_new !== undefined && ov.users_new_prev !== undefined ? { current: ov.users_new, previous: ov.users_new_prev, label: "ثبت‌نام نسبت به بازه‌ی قبل" } : null,
        spark: signupsSpark,
        sparkColor: "#5b6bd0",
      });
      list.push({
        id: "active",
        title: "کاربران فعال",
        value: ov?.users_active ?? null,
        subtitle: rangeLabel,
        icon: UserCheck,
        to: "/admin/users",
        tone: "bg-[#e6f4ee] text-[#2f7556]",
        loading: overview.loading,
        error: shortError(overview),
        delta: ov && ov.users_active !== undefined && ov.users_active_prev !== undefined ? { current: ov.users_active, previous: ov.users_active_prev, label: "کاربران فعال نسبت به بازه‌ی قبل" } : null,
        spark: activeSpark,
        sparkColor: "#63a88a",
      });
      list.push({
        id: "dau",
        title: "فعال روزانه / ماهانه",
        value: activeUsers.data?.dau ?? null,
        subtitle: activeUsers.data
          ? `امروز ${toFa(activeUsers.data.dau)} · ۳۰ روز ${toFa(activeUsers.data.mau)}${activeUsers.data.tracking_since ? ` · ثبت از ${new Date(activeUsers.data.tracking_since).toLocaleDateString("fa-IR")}` : " · ثبت هنوز آغاز نشده"}`
          : undefined,
        icon: UserCheck,
        to: "/admin/users",
        tone: "bg-[#eef0fb] text-[#4c5bba]",
        loading: activeUsers.loading,
        error: shortError(activeUsers),
        delta: activeUsers.data ? { current: activeUsers.data.mau, previous: activeUsers.data.mau_prev, label: "فعال ماهانه نسبت به ۳۰ روز قبل" } : null,
      });
    }

    if (canTests) {
      list.push({
        id: "tests",
        title: "آزمون‌های منتشرشده",
        value: stats.testsPublished,
        subtitle: stats.testsPublished === 0 ? "هنوز آزمونی منتشر نشده است" : "فقط آزمون‌های با بازبینی تأییدشده",
        icon: TestTube2,
        to: "/admin/tests",
        tone: "bg-[#e9f0f8] text-steel",
        loading,
      });
      list.push({
        id: "attempts",
        title: "آزمون‌های تکمیل‌شده",
        value: ov?.attempts_completed ?? null,
        subtitle:
          ov?.attempts_total === 0
            ? "هنوز رخدادی ثبت نشده است"
            : ov?.attempts_started !== undefined
              ? `از ${toFa(ov.attempts_started)} آزمون شروع‌شده در ${rangeLabel}`
              : rangeLabel,
        icon: CheckCheck,
        to: "/admin/tests",
        tone: "bg-[#eef0fb] text-[#4c5bba]",
        loading: overview.loading,
        error: shortError(overview),
        delta:
          ov && ov.attempts_completed !== undefined && ov.attempts_completed_prev !== undefined
            ? { current: ov.attempts_completed, previous: ov.attempts_completed_prev, label: "تکمیل آزمون نسبت به بازه‌ی قبل" }
            : null,
        spark: completedSpark,
        sparkColor: "#4c5bba",
      });
    }

    if (can("content", "read")) {
      list.push({
        id: "content",
        title: "محتوای منتشرشده",
        value: stats.contentPublished,
        subtitle: "صفحه، مقاله، مجله و کتاب",
        icon: FileText,
        to: "/admin/articles",
        tone: "bg-[#f1edfa] text-[#6a5fc0]",
        loading,
      });
    }

    if (can("psychologists", "read")) {
      list.push({
        id: "psychologists",
        title: "روان‌شناسان فعال",
        value: ov?.psychologists_active ?? null,
        subtitle: "تأییدشده و نمایش‌داده‌شده در سایت",
        icon: Stethoscope,
        to: "/admin/psychologists",
        tone: "bg-[#e6f4ee] text-[#2f7556]",
        loading: overview.loading,
        error: shortError(overview),
      });
    }

    if (can("support", "read")) {
      list.push({
        id: "support",
        title: "پیام‌های در انتظار پاسخ",
        value: stats.supportOpen,
        subtitle: stats.supportOpen === 0 ? "همه‌ی پیام‌ها بررسی شده‌اند" : "وضعیت جدید یا در حال بررسی",
        icon: Inbox,
        to: "/admin/messages",
        tone: "bg-[#fdf1df] text-[#8a5a14]",
        loading,
      });
    }

    if (attention.total !== null || attention.loading) {
      list.push({
        id: "attention",
        title: "موارد نیازمند اقدام",
        value: attention.total,
        subtitle: attention.total === 0 ? "مورد معوقه‌ای وجود ندارد" : "پیام، مدارک، بازبینی و محتوا",
        icon: TriangleAlert,
        href: "#needs-attention",
        linkLabel: "نمایش",
        tone: attention.total ? "bg-[#fdf1df] text-[#8a5a14]" : "bg-[#e6f4ee] text-[#2f7556]",
        loading: attention.loading,
      });
    }

    return list.filter((c) => !prefs.hiddenCards.includes(c.id));
  }, [
    can, canUsers, canTests, stats, loading, ov, overview.loading, overview.error, overview.missing, signupsSpark, activeSpark, completedSpark,
    attention.total, attention.loading, prefs.hiddenCards, range, activeUsers.data, activeUsers.loading, activeUsers.error, activeUsers.missing,
  ]);

  const show = (id: SectionId) => !prefs.hiddenSections.includes(id);
  const canAttention = can("support", "read") || can("psychologists", "read") || can("tests", "read") || can("content", "read");

  const loadErrors = [error, shortError(overview), shortError(growth), shortError(testActivity), shortError(activeUsers)]
    .filter((m): m is string => Boolean(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);

  const quickLinks = [
    { to: "/admin/tests", label: "آزمون‌ها", icon: TestTube2, perm: ["tests", "read"] as [string, string] },
    { to: "/admin/pages", label: "بخش‌های سایت", icon: FileText, perm: ["content", "read"] as [string, string] },
    { to: "/admin/media", label: "رسانه‌ها", icon: BookOpen, perm: ["media", "read"] as [string, string] },
    { to: "/admin/messages", label: "پشتیبانی", icon: Inbox, perm: ["support", "read"] as [string, string] },
    { to: "/admin/settings", label: "تنظیمات", icon: Globe2, perm: ["settings", "read"] as [string, string] },
    { to: "/admin/admins", label: "مدیران", icon: Users, perm: ["admins", "read"] as [string, string] },
  ].filter((l) => can(l.perm[0], l.perm[1]));

  const allCardsHidden = cards.length === 0 && prefs.hiddenCards.length > 0;

  return (
    <>
      <PageHeader
        title={`سلام${profile?.full_name ? `، ${profile.full_name}` : ""}`}
        description="خلاصه‌ی وضعیت واقعی پایگاه داده. هیچ عدد نمایشی یا ساختگی در این داشبورد وجود ندارد."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRangeChoice(Number(e.target.value) as RangeDays)}
              className="min-h-11 rounded-xl border border-adm-line bg-white px-3 text-[13px] font-semibold text-ink transition-colors duration-150 hover:border-steel/40 focus:border-steel focus:outline-none focus:ring-2 focus:ring-steel/15"
              aria-label="بازه‌ی زمانی"
            >
              <option value={7}>۷ روز اخیر</option>
              <option value={30}>۳۰ روز اخیر</option>
              <option value={90}>۹۰ روز اخیر</option>
            </select>
            <Button variant="secondary" onClick={refreshAll} className="min-h-11 rounded-xl">
              <RefreshCw className={cn("h-4 w-4", (loading || overview.loading) && "animate-spin")} />
              به‌روزرسانی
            </Button>
            <Button variant="ghost" onClick={() => setPrefsOpen(true)} className="min-h-11 rounded-xl" aria-label="شخصی‌سازی داشبورد">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">شخصی‌سازی</span>
            </Button>
          </div>
        }
      />

      {(overview.missing || growth.missing || testActivity.missing) && (
        <div
          role="alert"
          className="mb-[var(--adm-gap)] flex items-start gap-3 rounded-2xl border border-[#ecd7a8] bg-[#fdf6e8] p-4"
        >
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#8a5a14]" />
          <div className="min-w-0 text-[13.5px] leading-7 text-[#6f4710] [overflow-wrap:anywhere]">
            <p className="font-extrabold">{SHORT_MISSING}</p>
            <p>
              کارت‌ها و نمودارهای جدید (کاربران فعال، آزمون‌های تکمیل‌شده، رشد کاربران، فعالیت و محبوبیت آزمون‌ها، کیفیت علمی)، ذخیره‌ی ترجیحات
              و اعلان‌های خوانده‌شده به ساختار جدید پایگاه داده نیاز دارند. فایل{" "}
              <code dir="ltr" className="rounded-sm bg-white/70 px-1.5 py-0.5 text-[12.5px]">
                {MIGRATION_NAME}
              </code>{" "}
              را در SQL Editor سوپابیس اجرا کنید. تا آن زمان این بخش‌ها خالی می‌مانند و هیچ عدد ساختگی نمایش داده نمی‌شود؛ بقیه‌ی داشبورد عادی کار می‌کند.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-[var(--adm-gap)]">
        {/* کارت‌های آماری */}
        {error ? (
          <Card>
            <ErrorState message={error} onRetry={refreshAll} />
          </Card>
        ) : cards.length === 0 && !loading ? (
          <Card>
            <div className="px-5 py-14 text-center">
              <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-[#8a5a14]" />
              <p className="text-[14px] font-bold text-ink">{allCardsHidden ? "همه‌ی کارت‌های آماری پنهان شده‌اند" : "کارت آماری قابل‌نمایشی وجود ندارد"}</p>
              <p className="mt-1 text-[13px] text-body">
                {allCardsHidden ? "از «شخصی‌سازی» می‌توانید آن‌ها را دوباره نمایش دهید." : "نقش فعلی شما به هیچ‌یک از منابع آماری دسترسی ندارد."}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-[var(--adm-gap)] min-[460px]:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ id, ...props }) => (
              <StatCard key={id} {...props} />
            ))}
          </div>
        )}

        <Row
          items={[
            canAttention && show("attention") ? { id: "attention", span: 7, node: <AttentionCenter /> } : null,
            show("services") ? { id: "services", span: 5, node: <ServiceHealth services={can("settings", "api") ? services : undefined} loadErrors={loadErrors} dataLoading={loading} refreshKey={nonce} /> } : null,
          ]}
        />

        <Row
          items={[
            canUsers && show("growth")
              ? {
                  id: "growth",
                  span: 7,
                  node: <GrowthPanel days={growthSeries.map((p) => p.day)} series={growthSeries} range={range} loading={growth.loading} error={shortError(growth)} reload={growth.reload} />,
                }
              : null,
            canTests && show("tests") ? { id: "tests", span: 5, node: <TestActivityPanel state={testActivity} range={range} /> } : null,
          ]}
        />

        <Row
          items={[
            canTests && show("popular") ? { id: "popular", span: 5, node: <PopularTestsPanel state={testActivity} range={range} /> } : null,
            canTests && show("quality") ? { id: "quality", span: 7, node: <QualityPanel /> } : null,
          ]}
        />

        <Row
          items={[
            can("audit", "read") && show("activity") ? { id: "activity", span: 7, node: <ActivityFeed logs={activity} loading={loading} /> } : null,
            show("quick") && quickLinks.length > 0
              ? {
                  id: "quick",
                  span: 5,
                  node: (
                    <Card className="h-full">
                      <div className="border-b border-adm-line px-4 py-3">
                        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
                          <ActivityIcon className="h-4.5 w-4.5 text-steel" />
                          دسترسی سریع
                        </h2>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                        {quickLinks.map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-adm-line bg-[#f9fafc] text-[13px] font-bold text-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-steel/40 hover:bg-white hover:shadow-[0_6px_16px_-10px_rgb(16_24_40/0.3)]"
                          >
                            <link.icon className="h-[18px] w-[18px] text-steel" />
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </Card>
                  ),
                }
              : null,
          ]}
        />
      </div>

      <ImprovementStatsPanel />

      <PrefsDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </>
  );
}
