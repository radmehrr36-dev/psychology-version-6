// ابزارهای مشترک Edge Functionها. هیچ مقدار محرمانه‌ای از این فایل لاگ یا برگردانده نمی‌شود.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** فقط وقتی APP_ENV=development تنظیم شده باشد (اجرای محلی با supabase functions serve --env-file) */
export const isDevelopment = () => Deno.env.get("APP_ENV") === "development";

export function externalServiceSecret(name: unknown): string | undefined {
  if (typeof name !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(name)
      || /^(SUPABASE_|SERVICE_ROLE|OTP_|DATABASE_|APP_ENV$)/.test(name)) return undefined;
  return Deno.env.get(name);
}

export function allowedExternalUrl(value: string, envName: string): URL {
  const url = new URL(value);
  const hosts = ["api.openai.com", "api.anthropic.com", "openrouter.ai", "api.groq.com", ...(Deno.env.get(envName) ?? "").split(",")]
    .map((host) => host.trim().toLowerCase()).filter(Boolean);
  const localDevelopment = isDevelopment() && !Deno.env.get("SB_REGION") && !Deno.env.get("DENO_DEPLOYMENT_ID")
    && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localDevelopment && (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase()) || (url.port && url.port !== "443")))
      || url.username || url.password || url.search || url.hash) throw new Error("endpoint_not_allowed");
  return url;
}

export function serviceKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? namedKey("SUPABASE_SECRET_KEYS");
  if (!key) throw new Error("server_not_configured");
  return key;
}

function namedKey(name: string): string | undefined {
  try {
    const value = JSON.parse(Deno.env.get(name) ?? "{}");
    return typeof value.default === "string" ? value.default : undefined;
  } catch {
    return undefined;
  }
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? namedKey("SUPABASE_PUBLISHABLE_KEYS");
  if (!key) throw new Error("server_not_configured");
  return createClient(Deno.env.get("SUPABASE_URL")!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clientIp(req: Request): string {
  const raw = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  return raw.split(",").at(-1)?.trim() || "unknown";
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() || null : null;
}

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** محدودسازی نرخ در دیتابیس؛ در صورت خطا «بسته» عمل می‌کند (درخواست رد می‌شود) */
export async function rateHit(admin: SupabaseClient, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc("auth_rate_hit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new Error("rate_limiter_unavailable");
  return data === true;
}
