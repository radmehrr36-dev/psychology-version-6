import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { friendlyError, supabase } from "../lib/supabase";

interface ListOptions {
  table: string;
  select?: string;
  pageSize?: number;
  searchColumn?: string | null;
  orderBy?: string;
  ascending?: boolean;
  enabled?: boolean;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (p: number) => void;
  search: string;
  setSearch: (s: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  refresh: () => void;
}

/** کوئری فهرست با جست‌وجو، فیلتر و صفحه‌بندی سمت سرور */
export function useList<T>(options: ListOptions): ListResult<T> {
  const { table, select = "*", pageSize = 10, searchColumn = null, orderBy = "created_at", ascending = false, enabled = true } = options;
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearchRaw] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);
  const location = useLocation();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const setSearch = useCallback((s: string) => {
    setSearchRaw(s);
    setPage(0);
  }, []);
  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }, []);

  // جست‌وجوی سراسری هدر: ?q=… را به عنوان عبارت جست‌وجوی فهرست اعمال می‌کند
  useEffect(() => {
    if (!searchColumn) return;
    const q = new URLSearchParams(location.search).get("q");
    if (q !== null) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, searchColumn]);

  useEffect(() => {
    if (!enabled) return;
    if (!supabase) {
      setError("Supabase پیکربندی نشده است.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let query = supabase.from(table).select(select, { count: "exact" });
        if (search && searchColumn) query = query.ilike(searchColumn, `%${search}%`);
        for (const [key, value] of Object.entries(filters)) {
          if (value) query = query.eq(key, value);
        }
        query = query.order(orderBy, { ascending }).range(page * pageSize, page * pageSize + pageSize - 1);
        const { data, count, error: queryError } = await query;
        if (cancelled) return;
        if (queryError) throw queryError;
        setRows((data ?? []) as T[]);
        setTotal(count ?? 0);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [table, select, searchColumn, search, filters, page, pageSize, orderBy, ascending, nonce, enabled]);

  return { rows, total, loading, error, page, setPage, search, setSearch, filters, setFilter, refresh };
}

/** شمارش ساده */
export function useCount(table: string, apply?: (q: ReturnType<NonNullable<typeof supabase>["from"]>) => unknown, deps: unknown[] = []) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase پیکربندی نشده است.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let q = supabase!.from(table).select("id", { count: "exact", head: true }) as unknown;
        if (applyRef.current) q = applyRef.current(q as never);
        const { count: c, error: err } = await (q as Promise<{ count: number | null; error: { message: string } | null }>);
        if (cancelled) return;
        if (err) throw err;
        setCount(c ?? 0);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, nonce, ...deps]);

  return { count, error, loading, refresh: () => setNonce((n) => n + 1) };
}
