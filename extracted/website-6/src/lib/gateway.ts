import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface GatewayFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}

export type GatewayResult<T> = { ok: true; data: T } | GatewayFailure;

const UNREACHABLE_CLOUD =
  "سرویس احراز هویت (Edge Function: auth-gateway) روی پروژهٔ Supabase نصب نشده است. تا استقرار آن، ورود با ایمیل همچنان کار می‌کند. برای ثبت‌نام در محیط توسعه، npm run dev را با SUPABASE_SERVICE_ROLE_KEY اجرا کنید تا کد OTP در ترمینال چاپ شود.";

const UNREACHABLE_GENERIC = "ارتباط با سرویس احراز هویت برقرار نشد. اتصال اینترنت و وضعیت سرویس را بررسی کنید.";

export interface ChallengeInfo {
  challenge: string;
  expiresIn: number;
  resendAfter: number;
}

function parsePayload(raw: unknown): { error?: string; message?: string; fields?: Record<string, string> } {
  if (raw && typeof raw === "object") return raw as { error?: string; message?: string; fields?: Record<string, string> };
  return {};
}

async function parseHttpError(err: FunctionsHttpError): Promise<GatewayFailure> {
  let payload: { error?: string; message?: string; fields?: Record<string, string> } = {};
  try {
    payload = parsePayload(await err.context.json());
  } catch {
    /* بدنه غیر JSON */
  }
  const status = err.context.status;
  if (status === 404) {
    return { ok: false, status, error: "not_deployed", message: UNREACHABLE_CLOUD };
  }
  return {
    ok: false,
    status,
    error: payload.error ?? "error",
    message: payload.message ?? "انجام عملیات ناموفق بود. لطفاً دوباره تلاش کنید.",
    fields: payload.fields,
  };
}

async function postGateway(url: string, body: Record<string, unknown>, token?: string | null): Promise<GatewayResult<unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!res.ok) {
    if (res.status === 404) return { ok: false, status: 404, error: "not_deployed", message: UNREACHABLE_CLOUD };
    return {
      ok: false,
      status: res.status,
      error: typeof payload.error === "string" ? payload.error : "error",
      message: typeof payload.message === "string" ? payload.message : "انجام عملیات ناموفق بود. لطفاً دوباره تلاش کنید.",
      fields: payload.fields as Record<string, string> | undefined,
    };
  }
  return { ok: true, data: payload };
}

/**
 * فراخوانی auth-gateway / سایر Functionها.
 * در development اگر VITE_AUTH_GATEWAY_URL باشد (توسط npm run dev ست می‌شود) اول درگاه محلی امتحان می‌شود.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<GatewayResult<T>> {
  if (!supabase && name !== "auth-gateway") {
    return { ok: false, status: 0, error: "not_configured", message: "اتصال به سرویس حساب کاربری برقرار نیست." };
  }

  const local = import.meta.env.DEV ? (import.meta.env.VITE_AUTH_GATEWAY_URL as string | undefined) : undefined;
  if (name === "auth-gateway" && local) {
    try {
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const result = await postGateway(local.replace(/\/$/, ""), body, data.session?.access_token ?? null);
      return result as GatewayResult<T>;
    } catch {
      // درگاه محلی بالا نیست → تلاش برای Function ابری (معمولاً 404)
    }
  }

  if (!supabase) return { ok: false, status: 0, error: "not_configured", message: "اتصال به سرویس حساب کاربری برقرار نیست." };

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) return (await parseHttpError(error)) as GatewayResult<T>;
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      return { ok: false, status: 0, error: "unreachable", message: UNREACHABLE_CLOUD };
    }
    const msg = error.message || "";
    if (/404|not found|failed to send/i.test(msg)) {
      return { ok: false, status: 404, error: "not_deployed", message: UNREACHABLE_CLOUD };
    }
    return { ok: false, status: 0, error: "unreachable", message: UNREACHABLE_GENERIC };
  }
  return { ok: true, data: data as T };
}
