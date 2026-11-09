import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { describeError, isMissingBackend } from "../backend";

export type AttentionKind = "support" | "psychologists" | "tests" | "content";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  /** کاربر یا بخش مربوطه */
  subject: string;
  at: string;
  status: string;
  /** مورد بحرانی (اولویت بالا/فوری) */
  critical: boolean;
  /** پیش‌نویس ساده نیازمند اقدام فوری نیست و در اعلان‌ها نمی‌آید */
  needsAction: boolean;
  href: string;
  actionLabel: string;
}

export const attentionLabels: Record<AttentionKind, string> = {
  support: "پیام‌های پشتیبانی",
  psychologists: "روان‌شناسان",
  tests: "آزمون‌ها",
  content: "محتوا",
};

interface AttentionValue {
  items: AttentionItem[];
  /** تعداد واقعی هر دسته (null = بدون مجوز مشاهده) */
  counts: Record<AttentionKind, number | null>;
  /** مجموع موارد نیازمند اقدام (بدون پیش‌نویس‌های ساده) */
  total: number | null;
  loading: boolean;
  errors: Partial<Record<AttentionKind, string>>;
  reload: () => void;
  reads: Set<string>;
  readsAvailable: boolean;
  markRead: (keys: string[]) => Promise<void>;
}

const AttentionContext = createContext<AttentionValue | null>(null);

type EmbeddedTest = { title_fa: string } | Array<{ title_fa: string }> | null;

const contentTables: Array<{ table: "articles" | "pages" | "magazines" | "books"; label: string; href: string }> = [
  { table: "articles", label: "مقاله", href: "/admin/articles" },
  { table: "pages", label: "صفحه", href: "/admin/pages" },
  { table: "magazines", label: "مجله", href: "/admin/magazines" },
  { table: "books", label: "کتاب", href: "/admin/books" },
];

export function AttentionProvider({ children }: { children: ReactNode }) {
  const { can, profile } = useAuth();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [counts, setCounts] = useState<Record<AttentionKind, number | null>>({
    support: null,
    psychologists: null,
    tests: null,
    content: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<AttentionKind, string>>>({});
  const [nonce, setNonce] = useState(0);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [readsAvailable, setReadsAvailable] = useState(true);

  const canSupport = can("support", "read");
  const canPsych = can("psychologists", "read");
  const canTests = can("tests", "read");
  const canContent = can("content", "read");

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const nextItems: AttentionItem[] = [];
      const nextCounts: Record<AttentionKind, number | null> = { support: null, psychologists: null, tests: null, content: null };
      const nextErrors: Partial<Record<AttentionKind, string>> = {};
      let actionable = 0;
      let anyPermission = false;
      const jobs: Array<Promise<void>> = [];

      if (canSupport) {
        anyPermission = true;
        jobs.push(
          (async () => {
            const { data, count, error } = await db
              .from("support_messages")
              .select("id,subject,requester_name,requester_email,priority,status,created_at", { count: "exact" })
              .eq("status", "new")
              .order("created_at", { ascending: false })
              .limit(20);
            if (error) {
              nextErrors.support = describeError(error);
              return;
            }
            nextCounts.support = count ?? data?.length ?? 0;
            actionable += nextCounts.support;
            for (const m of data ?? []) {
              nextItems.push({
                key: `support:${m.id}`,
                kind: "support",
                title: String(m.subject),
                subject: String(m.requester_name || m.requester_email),
                at: String(m.created_at),
                status: "new",
                critical: m.priority === "urgent" || m.priority === "high",
                needsAction: true,
                href: "/admin/messages",
                actionLabel: "پاسخ",
              });
            }
          })()
        );
      }

      if (canPsych) {
        anyPermission = true;
        jobs.push(
          (async () => {
            const { data, count, error } = await db
              .from("psychologists")
              .select("id,display_name,title,created_at", { count: "exact" })
              .eq("verification_status", "pending")
              .order("created_at", { ascending: false })
              .limit(20);
            if (error) {
              nextErrors.psychologists = describeError(error);
              return;
            }
            let apps: Array<{ id: string; full_name: string; title: string; created_at: string }> = [];
            const appRes = await db.from("psychologist_applications").select("id,full_name,title,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(20);
            if (!appRes.error) apps = (appRes.data ?? []) as typeof apps;
            nextCounts.psychologists = (count ?? data?.length ?? 0) + apps.length;
            actionable += nextCounts.psychologists;
            for (const a of apps) {
              nextItems.push({
                key: `psyapp:${a.id}`,
                kind: "psychologists",
                title: `درخواست همکاری ${a.full_name}`,
                subject: a.title,
                at: a.created_at,
                status: "pending",
                critical: false,
                needsAction: true,
                href: "/admin/psychologists",
                actionLabel: "بررسی",
              });
            }
            for (const p of data ?? []) {
              nextItems.push({
                key: `psych:${p.id}`,
                kind: "psychologists",
                title: `تأیید مدارک ${p.display_name}`,
                subject: String(p.title || "متخصص"),
                at: String(p.created_at),
                status: "pending",
                critical: false,
                needsAction: true,
                href: "/admin/psychologists",
                actionLabel: "بررسی",
              });
            }
          })()
        );
      }

      if (canTests) {
        anyPermission = true;
        jobs.push(
          (async () => {
            const { data, count, error } = await db
              .from("test_versions")
              .select("id,version_label,updated_at,test_id,tests(title_fa)", { count: "exact" })
              .eq("status", "in_review")
              .order("updated_at", { ascending: false })
              .limit(20);
            if (error) {
              nextErrors.tests = describeError(error);
              return;
            }
            nextCounts.tests = count ?? data?.length ?? 0;
            actionable += nextCounts.tests;
            for (const v of (data ?? []) as unknown as Array<{
              id: string;
              version_label: string;
              updated_at: string;
              test_id: string;
              tests: EmbeddedTest;
            }>) {
              const embedded = Array.isArray(v.tests) ? v.tests[0] : v.tests;
              nextItems.push({
                key: `test:${v.id}`,
                kind: "tests",
                title: `بازبینی علمی «${embedded?.title_fa ?? "آزمون"}»`,
                subject: `نسخه‌ی ${v.version_label}`,
                at: v.updated_at,
                status: "in_review",
                critical: false,
                needsAction: true,
                href: `/admin/tests/${v.test_id}`,
                actionLabel: "بازبینی",
              });
            }
          })()
        );
      }

      if (canContent) {
        anyPermission = true;
        jobs.push(
          (async () => {
            let all = 0;
            let inReview = 0;
            const results = await Promise.all(
              contentTables.map(async (t) => {
                const [{ data, count, error }, review] = await Promise.all([
                  db
                    .from(t.table)
                    .select("id,title,status,updated_at", { count: "exact" })
                    .in("status", ["draft", "in_review"])
                    .order("updated_at", { ascending: false })
                    .limit(8),
                  db.from(t.table).select("id", { count: "exact", head: true }).eq("status", "in_review"),
                ]);
                return { t, data, count, error, reviewCount: review.count ?? 0 };
              })
            );
            const firstError = results.find((r) => r.error)?.error;
            if (firstError) {
              nextErrors.content = describeError(firstError);
              return;
            }
            for (const r of results) {
              all += r.count ?? r.data?.length ?? 0;
              inReview += r.reviewCount;
              for (const row of r.data ?? []) {
                nextItems.push({
                  key: `content:${r.t.table}:${row.id}`,
                  kind: "content",
                  title: String(row.title),
                  subject: r.t.label,
                  at: String(row.updated_at),
                  status: String(row.status),
                  critical: false,
                  needsAction: row.status === "in_review",
                  href: r.t.href,
                  actionLabel: "ویرایش",
                });
              }
            }
            nextCounts.content = all;
            actionable += inReview;
          })()
        );
      }

      await Promise.all(jobs);
      if (cancelled) return;
      nextItems.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(nextItems);
      setCounts(nextCounts);
      setErrors(nextErrors);
      setTotal(anyPermission ? actionable : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [canSupport, canPsych, canTests, canContent, nonce]);

  // وضعیت خوانده‌شدن اعلان‌ها (ذخیره در حساب مدیر)
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase!
        .from("admin_notification_reads")
        .select("item_key")
        .eq("user_id", profile.id)
        .limit(2000);
      if (cancelled) return;
      if (error) {
        setReadsAvailable(!isMissingBackend(error));
        return;
      }
      setReadsAvailable(true);
      setReads(new Set((data ?? []).map((r: { item_key: string }) => r.item_key)));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const markRead = useCallback(
    async (keys: string[]) => {
      if (!supabase || !profile?.id) return;
      const fresh = keys.filter((k) => !reads.has(k));
      if (fresh.length === 0) return;
      setReads((prev) => new Set([...prev, ...fresh]));
      const { error } = await supabase
        .from("admin_notification_reads")
        .upsert(
          fresh.map((k) => ({ user_id: profile.id, item_key: k })),
          { onConflict: "user_id,item_key", ignoreDuplicates: true }
        );
      if (error) setReadsAvailable(!isMissingBackend(error));
    },
    [profile?.id, reads]
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<AttentionValue>(
    () => ({ items, counts, total, loading, errors, reload, reads, readsAvailable, markRead }),
    [items, counts, total, loading, errors, reload, reads, readsAvailable, markRead]
  );

  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useAttention(): AttentionValue {
  const ctx = useContext(AttentionContext);
  if (!ctx) throw new Error("useAttention must be used inside AttentionProvider");
  return ctx;
}
