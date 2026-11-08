import { useCallback, useEffect, useState } from "react";
import { friendlyError, supabase } from "../lib/supabase";

export const MIGRATION_NAME = "20260104000000_dashboard_control_center.sql";
export const MISSING_MESSAGE = `ساختار پایگاه داده‌ی این بخش هنوز اعمال نشده است. فایل «${MIGRATION_NAME}» را در SQL Editor سوپابیس اجرا کنید.`;

function parts(err: unknown): { code?: string; message: string } {
  if (err && typeof err === "object") {
    const o = err as { code?: unknown; message?: unknown };
    return {
      code: typeof o.code === "string" ? o.code : undefined,
      message: typeof o.message === "string" ? o.message : "",
    };
  }
  return { message: typeof err === "string" ? err : "" };
}

/** تشخیص اینکه جدول/تابع موردنیاز هنوز در پایگاه داده ساخته نشده است */
export function isMissingBackend(err: unknown): boolean {
  const { code, message } = parts(err);
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42P01" ||
    code === "42883" ||
    code === "42703" ||
    /schema cache|does not exist|Could not find the/i.test(message)
  );
}

export function describeError(err: unknown): string {
  if (isMissingBackend(err)) return MISSING_MESSAGE;
  const { message } = parts(err);
  return friendlyError(new Error(message || "unknown"));
}

export const SHORT_MISSING = "نیازمند اجرای migration داشبورد";

/** پیام کوتاه برای کارت‌ها و پنل‌ها (متن کامل فقط یک‌بار در بنر بالای داشبورد می‌آید) */
export function shortError(state: { missing: boolean; error: string | null }): string | null {
  return state.missing ? SHORT_MISSING : state.error;
}

export interface RemoteState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** true وقتی migration مربوطه هنوز اعمال نشده است */
  missing: boolean;
  reload: () => void;
}

/** فراخوانی تابع RPC با وضعیت loading/error/missing */
export function useRpc<T>(fn: string, args: Record<string, unknown>, enabled = true): RemoteState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify(args);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError("Supabase پیکربندی نشده است.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMissing(false);
    (async () => {
      const { data: d, error: e } = await supabase!.rpc(fn, JSON.parse(key) as Record<string, unknown>);
      if (cancelled) return;
      if (e) {
        setMissing(isMissingBackend(e));
        setError(describeError(e));
        setData(null);
      } else {
        setData(d as T);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fn, key, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, missing, reload };
}
