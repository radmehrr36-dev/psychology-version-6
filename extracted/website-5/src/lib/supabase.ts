import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * کلاینت عمومی Supabase. فقط با کلید anon/publishable ساخته می‌شود.
 * هرگز کلید service_role در این فایل یا در متغیرهای VITE_ قرار نگیرد.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const supabaseProjectHost = (() => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
})();

/** پیام خطای قابل‌فهم برای کاربر (بدون افشای جزئیات فنی) */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/JWT|token|session/i.test(raw)) return "نشست شما منقضی شده است. دوباره وارد شوید.";
  if (/row-level security|permission|42501/i.test(raw)) return "شما مجوز انجام این عملیات را ندارید.";
  if (/duplicate key|unique/i.test(raw)) return "این مقدار تکراری است. مقدار دیگری وارد کنید.";
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "ارتباط با سرور برقرار نشد. اتصال اینترنت و وضعیت Supabase را بررسی کنید.";
  if (/violates check constraint/i.test(raw)) return "داده‌های واردشده معتبر نیستند. فیلدهای ضروری را بررسی کنید.";
  if (import.meta.env.DEV && raw) return `خطا: ${raw}`;
  return "انجام عملیات ناموفق بود. لطفاً دوباره تلاش کنید.";
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase پیکربندی نشده است. VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را تنظیم کنید.");
  }
  return supabase;
}
