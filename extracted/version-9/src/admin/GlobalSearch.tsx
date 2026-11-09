import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, FileText, Search, Stethoscope, Users, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { describeError } from "./backend";
import { Skeleton, Tooltip } from "./ui";
import { useDismiss } from "./useDismiss";
import { cn } from "../utils/cn";

interface Hit {
  id: string;
  label: string;
  sub?: string;
  to: string;
}
interface Group {
  key: string;
  title: string;
  icon: LucideIcon;
  hits: Hit[];
}

const order = ["users", "tests", "content", "psychologists"];

async function runSearch(term: string, can: (r: string, a: string) => boolean): Promise<{ groups: Group[]; error: string | null }> {
  const db = supabase!;
  const like = `%${term}%`;
  const groups: Group[] = [];
  let firstError: string | null = null;
  const fail = (e: unknown) => {
    firstError ??= describeError(e);
  };
  const jobs: Array<Promise<void>> = [];

  if (can("users", "read")) {
    jobs.push(
      (async () => {
        const { data, error } = await db
          .from("profiles")
          .select("id,email,full_name")
          .or(`email.ilike.${like},full_name.ilike.${like}`)
          .limit(5);
        if (error) return fail(error);
        if (data?.length)
          groups.push({
            key: "users",
            title: "کاربران",
            icon: Users,
            hits: data.map((u) => ({
              id: u.id as string,
              label: (u.full_name as string) || (u.email as string) || "بدون نام",
              sub: (u.email as string | null) ?? undefined,
              to: `/admin/users?q=${encodeURIComponent((u.email as string | null) ?? "")}`,
            })),
          });
      })()
    );
  }

  if (can("tests", "read")) {
    jobs.push(
      (async () => {
        const { data, error } = await db.from("tests").select("id,title_fa,slug").ilike("title_fa", like).limit(5);
        if (error) return fail(error);
        if (data?.length)
          groups.push({
            key: "tests",
            title: "آزمون‌ها",
            icon: Bot,
            hits: data.map((t) => ({ id: t.id as string, label: t.title_fa as string, sub: t.slug as string, to: `/admin/tests/${t.id}` })),
          });
      })()
    );
  }

  if (can("content", "read")) {
    jobs.push(
      (async () => {
        const sources: Array<{ table: "articles" | "magazines" | "books" | "pages"; label: string; route: string }> = [
          { table: "articles", label: "مقاله", route: "/admin/articles" },
          { table: "magazines", label: "مجله", route: "/admin/magazines" },
          { table: "books", label: "کتاب", route: "/admin/books" },
          { table: "pages", label: "صفحه", route: "/admin/pages" },
        ];
        const results = await Promise.all(sources.map((s) => db.from(s.table).select("id,title").ilike("title", like).limit(3)));
        const hits: Hit[] = [];
        results.forEach((r, i) => {
          if (r.error) return fail(r.error);
          for (const row of r.data ?? [])
            hits.push({
              id: `${sources[i].table}:${row.id}`,
              label: row.title as string,
              sub: sources[i].label,
              to: sources[i].table === "pages" ? sources[i].route : `${sources[i].route}?q=${encodeURIComponent(row.title as string)}`,
            });
        });
        if (hits.length) groups.push({ key: "content", title: "محتوا", icon: FileText, hits });
      })()
    );
  }

  if (can("psychologists", "read")) {
    jobs.push(
      (async () => {
        const { data, error } = await db.from("psychologists").select("id,display_name,title").ilike("display_name", like).limit(5);
        if (error) return fail(error);
        if (data?.length)
          groups.push({
            key: "psychologists",
            title: "روان‌شناسان",
            icon: Stethoscope,
            hits: data.map((p) => ({
              id: p.id as string,
              label: p.display_name as string,
              sub: (p.title as string | null) ?? undefined,
              to: `/admin/psychologists?q=${encodeURIComponent(p.display_name as string)}`,
            })),
          });
      })()
    );
  }

  await Promise.all(jobs);
  groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { groups, error: firstError };
}

export function GlobalSearch() {
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // کاراکترهایی که در فیلتر PostgREST معنا دارند حذف می‌شوند
  const term = q.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  const ready = term.length >= 2;

  const close = useCallback(() => {
    setOpen(false);
    setMobileOpen(false);
  }, []);
  useDismiss(wrapRef, open || mobileOpen, close);

  useEffect(() => {
    if (!ready || !supabase) {
      setGroups([]);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await runSearch(term, can);
        if (reqId.current !== id) return;
        setGroups(result.groups);
        setError(result.error);
      } catch (e) {
        if (reqId.current === id) setError(describeError(e));
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term, ready, can]);

  // میان‌بر: «/» یا Ctrl/⌘+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) {
          inputRef.current?.focus();
          setOpen(true);
        } else {
          setMobileOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus();
  }, [mobileOpen]);

  const results = (
    <div className="max-h-[min(70vh,28rem)] overflow-y-auto" role="listbox" aria-label="نتایج جستجو">
      {!ready ? (
        <p className="px-4 py-6 text-center text-[13px] text-body">حداقل ۲ حرف بنویسید تا در کاربران، آزمون‌ها، محتوا و روان‌شناسان جستجو شود.</p>
      ) : loading ? (
        <div className="space-y-3 p-4" role="status" aria-label="در حال جستجو">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error && groups.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] leading-6 text-[#8a5a14]" role="alert">
          {error}
        </p>
      ) : groups.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-body">نتیجه‌ای برای «{term}» پیدا نشد.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="border-b border-adm-line last:border-0">
            <p className="flex items-center gap-1.5 bg-[#f8f9fb] px-4 py-1.5 text-[12.5px] font-bold text-body">
              <g.icon className="h-3.5 w-3.5" />
              {g.title}
            </p>
            <ul>
              {g.hits.map((h) => (
                <li key={h.id}>
                  <Link
                    to={h.to}
                    onClick={close}
                    role="option"
                    aria-selected={false}
                    className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 transition-colors duration-150 hover:bg-steel/5 focus-visible:bg-steel/5"
                  >
                    <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{h.label}</span>
                    {h.sub && <span className="shrink-0 truncate text-[12.5px] text-body">{h.sub}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative">
      {/* دسکتاپ و تبلت */}
      <div className="hidden md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="جستجو در پنل…"
            aria-label="جستجوی مدیریتی"
            className="h-10 w-52 rounded-xl border border-adm-line bg-[#f6f7f9] pr-9 pl-9 text-[13.5px] text-ink placeholder:text-body/80 transition-all duration-200 focus:w-72 focus:border-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-steel/15 lg:w-64 lg:focus:w-80"
          />
          <kbd className="pointer-events-none absolute left-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-adm-line bg-white px-1.5 text-[11px] font-semibold text-body lg:block" aria-hidden="true">
            /
          </kbd>
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 min-w-[22rem] overflow-hidden rounded-2xl border border-adm-line bg-white shadow-[0_16px_40px_-16px_rgb(16_24_40/0.3)]">
            {results}
          </div>
        )}
      </div>

      {/* موبایل */}
      <div className="md:hidden">
        <Tooltip label="جستجو">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="جستجوی مدیریتی"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors duration-150 hover:bg-mist"
          >
            <Search className="h-5 w-5" />
          </button>
        </Tooltip>
        {mobileOpen && (
          <div className={cn("fixed inset-x-0 top-0 z-[60] border-b border-adm-line bg-white p-3 shadow-lg")} role="dialog" aria-label="جستجوی مدیریتی">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
              <input
                ref={mobileInputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو در کاربران، آزمون‌ها، محتوا…"
                aria-label="جستجوی مدیریتی"
                className="h-11 w-full rounded-xl border border-adm-line bg-[#f6f7f9] pr-9 pl-11 text-[14px] text-ink focus:border-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-steel/15"
              />
              <button
                type="button"
                onClick={close}
                aria-label="بستن جستجو"
                className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-body hover:bg-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 overflow-hidden rounded-xl border border-adm-line">{results}</div>
          </div>
        )}
      </div>
    </div>
  );
}
