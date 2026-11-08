import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { isMissingBackend } from "./backend";

export type StatCardId = "users" | "active" | "dau" | "tests" | "attempts" | "content" | "psychologists" | "support" | "attention";
export type SectionId = "growth" | "tests" | "popular" | "attention" | "quality" | "services" | "activity" | "quick";
export type RangeDays = 7 | 30 | 90;

export const statCardOptions: Array<{ id: StatCardId; label: string }> = [
  { id: "users", label: "کاربران ثبت‌نام‌شده" },
  { id: "active", label: "کاربران فعال" },
  { id: "dau", label: "فعال روزانه / ماهانه" },
  { id: "tests", label: "آزمون‌های منتشرشده" },
  { id: "attempts", label: "آزمون‌های تکمیل‌شده" },
  { id: "content", label: "محتوای منتشرشده" },
  { id: "psychologists", label: "روان‌شناسان فعال" },
  { id: "support", label: "پیام‌های در انتظار پاسخ" },
  { id: "attention", label: "موارد نیازمند اقدام" },
];

export const sectionOptions: Array<{ id: SectionId; label: string }> = [
  { id: "attention", label: "نیازمند بررسی" },
  { id: "services", label: "وضعیت سرویس‌ها" },
  { id: "growth", label: "نمودار رشد کاربران" },
  { id: "tests", label: "نمودار فعالیت آزمون‌ها" },
  { id: "popular", label: "محبوب‌ترین آزمون‌ها" },
  { id: "quality", label: "کیفیت علمی آزمون‌ها" },
  { id: "activity", label: "فعالیت‌های اخیر مدیران" },
  { id: "quick", label: "دسترسی سریع" },
];

export interface AdminPrefs {
  density: "comfortable" | "compact";
  sidebarCollapsed: boolean;
  defaultRange: RangeDays;
  hiddenCards: StatCardId[];
  hiddenSections: SectionId[];
  notifications: { support: boolean; psychologists: boolean; tests: boolean; content: boolean };
}

export const defaultPrefs: AdminPrefs = {
  density: "comfortable",
  sidebarCollapsed: false,
  defaultRange: 30,
  hiddenCards: [],
  hiddenSections: [],
  notifications: { support: true, psychologists: true, tests: true, content: true },
};

const CARD_IDS = statCardOptions.map((o) => o.id);
const SECTION_IDS = sectionOptions.map((o) => o.id);

/** ورودی ناشناخته (JSON پایگاه داده) را به ترجیحات معتبر تبدیل می‌کند */
export function sanitizePrefs(raw: unknown): AdminPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (r.notifications && typeof r.notifications === "object" ? r.notifications : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const range = r.defaultRange === 7 || r.defaultRange === 30 || r.defaultRange === 90 ? r.defaultRange : defaultPrefs.defaultRange;
  return {
    density: r.density === "compact" ? "compact" : "comfortable",
    sidebarCollapsed: bool(r.sidebarCollapsed, false),
    defaultRange: range,
    hiddenCards: Array.isArray(r.hiddenCards) ? (r.hiddenCards.filter((x) => CARD_IDS.includes(x as StatCardId)) as StatCardId[]) : [],
    hiddenSections: Array.isArray(r.hiddenSections) ? (r.hiddenSections.filter((x) => SECTION_IDS.includes(x as SectionId)) as SectionId[]) : [],
    notifications: {
      support: bool(n.support, true),
      psychologists: bool(n.psychologists, true),
      tests: bool(n.tests, true),
      content: bool(n.content, true),
    },
  };
}

/** loading: در حال دریافت · saving: در حال ذخیره · saved: در حساب مدیر ذخیره شد · missing: migration اعمال نشده · error: خطا */
export type PersistStatus = "loading" | "saving" | "saved" | "missing" | "error";

interface PrefsValue {
  prefs: AdminPrefs;
  loaded: boolean;
  status: PersistStatus;
  update: (patch: Partial<AdminPrefs>) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function AdminPrefsProvider({ children }: { children: ReactNode }) {
  const { profile, hasAnyRole } = useAuth();
  const userId = hasAnyRole ? profile?.id ?? null : null;
  const [prefs, setPrefs] = useState<AdminPrefs>(defaultPrefs);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<PersistStatus>("loading");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<AdminPrefs>(defaultPrefs);

  useEffect(() => {
    if (!userId || !supabase) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase!
        .from("admin_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setStatus(isMissingBackend(error) ? "missing" : "error");
      } else {
        const next = sanitizePrefs(data?.preferences);
        latest.current = next;
        setPrefs(next);
        setStatus("saved");
      }
      setLoaded(true);
    })();
    // ثبت آخرین بازدید برای آمار «کاربران فعال» (بی‌صدا؛ اگر migration اعمال نشده باشد نادیده گرفته می‌شود)
    void supabase.rpc("touch_last_seen").then(
      () => undefined,
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (next: AdminPrefs) => {
      if (!supabase || !userId) return;
      window.clearTimeout(timer.current);
      setStatus("saving");
      timer.current = window.setTimeout(async () => {
        const { error } = await supabase!
          .from("admin_preferences")
          .upsert({ user_id: userId, preferences: next }, { onConflict: "user_id" });
        setStatus(error ? (isMissingBackend(error) ? "missing" : "error") : "saved");
      }, 500);
    },
    [userId]
  );

  const update = useCallback(
    (patch: Partial<AdminPrefs>) => {
      const next = sanitizePrefs({ ...latest.current, ...patch });
      latest.current = next;
      setPrefs(next);
      persist(next);
    },
    [persist]
  );

  const value = useMemo<PrefsValue>(() => ({ prefs, loaded, status, update }), [prefs, loaded, status, update]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function useAdminPrefs(): PrefsValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("useAdminPrefs must be used inside AdminPrefsProvider");
  return ctx;
}
