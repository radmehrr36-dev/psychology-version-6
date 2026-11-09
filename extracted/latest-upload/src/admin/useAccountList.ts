import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

interface SearchResult {
  items: Profile[];
  total: number;
}

export function useAccountList(enabled: boolean) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearchRaw] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [schemaOutdated, setSchemaOutdated] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const setSearch = useCallback((v: string) => { setPage(0); setSearchRaw(v); }, []);
  const setFilter = useCallback((key: string, value: string) => {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      if (!supabase) {
        if (!cancelled) { setError("اتصال به Supabase تنظیم نشده است."); setLoading(false); }
        return;
      }
      const { data, error: err } = await supabase.rpc("admin_search_accounts_hardening", {
        p_search: search.trim(), p_kind: filters.account_kind || "", p_status: filters.account_status || "", p_page: page, p_page_size: 10,
      });
      if (cancelled) return;
      if (err?.code === "PGRST202") {
        // Preserve the existing read-only listing until the reviewed migration is installed.
        let query = supabase.from("profiles").select("id,email,full_name,avatar_url,role,account_status,account_kind,username,phone,phone_verified_at,contact_verified_at,last_seen_at,created_at,updated_at", { count: "exact" });
        if (filters.account_status) query = query.eq("account_status", filters.account_status);
        if (filters.account_kind === "admin") query = query.not("role", "is", null);
        else if (filters.account_kind) query = query.is("role", null).eq("account_kind", filters.account_kind);
        const term = search.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF@+_ -]/g, "").slice(0, 100);
        const digits = term.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
        if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(term)) query = query.eq("id", term);
        else if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,username.ilike.%${term}%,phone.ilike.%${digits}%`);
        const fallback = await query.order("created_at", { ascending: false }).range(page * 10, page * 10 + 9);
        if (cancelled) return;
        setSchemaOutdated(true);
        setRows((fallback.data ?? []) as Profile[]);
        setTotal(fallback.count ?? 0);
        setError(fallback.error ? "دریافت فهرست کاربران ممکن نشد. مجوز و اتصال را بررسی کنید." : null);
        setLoading(false);
        return;
      }
      if (err) {
        setRows([]);
        setTotal(0);
        setError(err.code === "PGRST202" ? "جست‌وجوی کاربران به migration جدید نیاز دارد. مدیر پایگاه داده ابتدا باید ساختار زنده را بررسی و migration را اعمال کند." : "دریافت فهرست کاربران ممکن نشد. مجوز و اتصال را بررسی کنید.");
      } else {
        const result = data as SearchResult;
        setSchemaOutdated(false);
        setRows(result.items ?? []);
        setTotal(Number(result.total ?? 0));
        setError(null);
      }
      setLoading(false);
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled, filters, page, search, revision]);

  return { rows, total, page, setPage, search, setSearch, filters, setFilter, loading, error, schemaOutdated, refresh };
}