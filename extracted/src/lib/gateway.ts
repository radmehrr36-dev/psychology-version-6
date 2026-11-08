import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface GatewayFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}

export type GatewayResult<T> = { ok: true; data: T } | GatewayFailure;

const UNREACHABLE =
  "ارتباط با سرویس برقرار نشد. اگر در حال توسعه هستید، مطمئن شوید Edge Function مستقر یا با supabase functions serve اجرا شده است.";

/** فراخوانی Edge Function با پیام‌های خطای فارسی و بدون افشای جزئیات فنی */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<GatewayResult<T>> {
  if (!supabase) return { ok: false, status: 0, error: "not_configured", message: "اتصال به سرویس حساب کاربری برقرار نیست." };
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string; message?: string; fields?: Record<string, string> };
        return {
          ok: false,
          status: error.context.status,
          error: payload.error ?? "error",
          message: payload.message ?? "انجام عملیات ناموفق بود. لطفاً دوباره تلاش کنید.",
          fields: payload.fields,
        };
      } catch {
        return { ok: false, status: error.context.status, error: "error", message: "انجام عملیات ناموفق بود. لطفاً دوباره تلاش کنید." };
      }
    }
    return { ok: false, status: 0, error: "unreachable", message: UNREACHABLE };
  }
  return { ok: true, data: data as T };
}

export interface ChallengeInfo {
  challenge: string;
  /** مدت اعتبار کد (ثانیه) */
  expiresIn: number;
  /** فاصله‌ی مجاز تا درخواست کد جدید (ثانیه) */
  resendAfter: number;
}
