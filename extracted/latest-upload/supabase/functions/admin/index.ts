// Supabase Edge Function: عملیات حساس مدیریتی
// Deploy: supabase functions deploy admin --no-verify-jwt=false
// Secrets: supabase secrets set SERVICE_ROLE_KEY=... OPENAI_API_KEY=... (در محیط سرور)
//
// این تابع با JWT فراخواننده هویت را تأیید می‌کند و مجوز را در سمت سرور بررسی می‌کند.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { allowedExternalUrl, externalServiceSecret, serviceKey } from "../_shared/common.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clean = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["super_admin", "admin", "content_manager", "test_manager", "support_agent", "psychology_reviewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return clean(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  let serverKey: string;
  try { serverKey = serviceKey(); } catch { return clean(500, { error: "server_not_configured" }); }

  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return clean(401, { error: "unauthenticated" });

  const admin = createClient(supabaseUrl, serverKey, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("id,email,role,account_status").eq("id", userData.user.id).single();
  if (!profile || profile.account_status !== "active" || !profile.role) return clean(403, { error: "forbidden" });

  const { data: grants, error: grantsError } = await admin.from("role_permissions").select("resource,action").eq("role", profile.role);
  if (grantsError) return clean(503, { error: "permissions_unavailable" });
  const can = (resource: string, action: string) => profile.role === "super_admin" ||
    (grants ?? []).some((g) => (g.resource === resource || g.resource === "*") && (g.action === action || g.action === "*"));

  const audit = async (action: string, resource: string, id: string | null, meta: Record<string, unknown> = {}) => {
    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      actor_email: profile.email,
      actor_role: profile.role,
      action,
      resource_type: resource,
      resource_id: id,
      result: "success",
      metadata: meta,
    });
  };

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return clean(400, { error: "invalid_json" });
  }
  const { action, payload = {} } = body;

  try {
    switch (action) {
      case "invite_admin": {
        if (!can("admins", "write")) return clean(403, { error: "forbidden" });
        const email = String(payload.email ?? "").trim().toLowerCase();
        const role = String(payload.role ?? "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return clean(400, { error: "invalid_email" });
        if (!ROLES.includes(role)) return clean(400, { error: "invalid_role" });
        if (role === "super_admin" && profile.role !== "super_admin") return clean(403, { error: "forbidden_role" });

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
        if (inviteError) return clean(400, { error: "invite_failed", detail: inviteError.message });

        const userId = invited.user?.id;
        if (!userId) return clean(500, { error: "invite_failed" });

        const { error: profileError } = await admin
          .from("profiles")
          .upsert({ id: userId, email, role, account_status: "active", full_name: email.split("@")[0] }, { onConflict: "id" });
        if (profileError) return clean(500, { error: "profile_update_failed" });

        await admin.from("admin_invites").insert({
          email, role, status: "pending", invited_by: profile.id, invited_by_email: profile.email,
        });
        await audit("invite", "admins", userId, { role });
        return clean(200, { ok: true, user_id: userId });
      }

      case "set_admin_role": {
        if (!can("admins", "write")) return clean(403, { error: "forbidden" });
        const userId = String(payload.user_id ?? "");
        const role = payload.role === null ? null : String(payload.role);
        if (!userId) return clean(400, { error: "missing_user" });
        if (role !== null && !ROLES.includes(role)) return clean(400, { error: "invalid_role" });
        if (role === "super_admin" && profile.role !== "super_admin") return clean(403, { error: "forbidden_role" });

        const { error } = await caller.rpc("admin_change_admin_role_hardening", { p_user_id: userId, p_role: role });
        if (error) return clean(403, { error: "role_change_denied" });
        return clean(200, { ok: true });
      }

      case "set_account_status": {
        if (!can("users", "write")) return clean(403, { error: "forbidden" });
        const userId = String(payload.user_id ?? "");
        const status = String(payload.status ?? "");
        if (!["active", "suspended", "pending"].includes(status)) return clean(400, { error: "invalid_status" });
        const { error } = await caller.rpc("admin_change_account_hardening", { p_user_id: userId, p_status: status, p_kind: null });
        if (error) return clean(403, { error: "status_change_denied" });
        return clean(200, { ok: true });
      }

      case "service_check": {
        if (!can("settings", "api")) return clean(403, { error: "forbidden" });
        const serviceId = String(payload.service_id ?? "");
        const { data: service } = await admin.from("service_settings").select("*").eq("id", serviceId).single();
        if (!service) return clean(404, { error: "not_found" });

        const secret = externalServiceSecret(service.secret_name);
        if (!secret) {
          await admin.from("service_settings").update({
            last_check_at: new Date().toISOString(), last_check_status: "unconfigured",
            last_error: "کلید سرویس در secrets سرور ثبت نشده است",
          }).eq("id", serviceId);
          await audit("service_check", "service_settings", serviceId, { result: "unconfigured" });
          return clean(200, { status: "unconfigured" });
        }

        const healthUrl = typeof service.config?.health_url === "string" ? service.config.health_url : null;
        if (!healthUrl) {
          await admin.from("service_settings").update({
            last_check_at: new Date().toISOString(), last_check_status: "unconfigured",
            last_error: "آدرس بررسی سلامت در تنظیمات سرویس مشخص نشده است",
          }).eq("id", serviceId);
          return clean(200, { status: "unconfigured" });
        }

        let ok = false;
        let detail = "";
        try {
          const safeUrl = allowedExternalUrl(healthUrl, "SERVICE_HEALTH_ALLOWED_HOSTS");
          const res = await fetch(safeUrl, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000), redirect: "error" });
          ok = res.ok;
          detail = ok ? "" : `HTTP ${res.status}`;
        } catch {
          detail = "اتصال ممکن نیست یا دامنه در فهرست مجاز سرور نیست";
        }
        await admin.from("service_settings").update({
          last_check_at: new Date().toISOString(),
          last_check_status: ok ? "ok" : "failed",
          last_error: ok ? null : detail.slice(0, 300),
        }).eq("id", serviceId);
        await audit("service_check", "service_settings", serviceId, { result: ok ? "ok" : "failed" });
        return clean(200, { status: ok ? "ok" : "failed" });
      }

      case "secret_status": {
        if (!can("settings", "api")) return clean(403, { error: "forbidden" });
        const name = String(payload.secret_name ?? "");
        if (!/^[A-Z0-9_]{3,64}$/.test(name)) return clean(400, { error: "invalid_secret_name" });
        const value = externalServiceSecret(name);
        return clean(200, {
          configured: Boolean(value),
          masked: value ? "••••••••" : null,
        });
      }

      case "send_support_reply": {
        if (!can("support", "write")) return clean(403, { error: "forbidden" });
        // ارسال ایمیل پیاده‌سازی نشده است؛ وضعیت ارسال را صادقانه ثبت می‌کنیم.
        const messageId = String(payload.message_id ?? "");
        const replyBody = String(payload.body ?? "").slice(0, 5000);
        if (!messageId || replyBody.length < 1) return clean(400, { error: "invalid_reply" });
        const { data: reply, error } = await admin.from("support_replies").insert({
          message_id: messageId, author_id: profile.id, author_email: profile.email,
          body: replyBody, is_internal: Boolean(payload.is_internal), delivery_status: "not_sent",
        }).select().single();
        if (error) return clean(500, { error: "insert_failed" });
        await admin.from("support_messages").update({
          status: "answered", last_reply_at: new Date().toISOString(),
        }).eq("id", messageId);
        await audit("reply", "support_messages", messageId, { internal: Boolean(payload.is_internal) });
        return clean(200, { ok: true, reply, delivery: "not_sent", note: "کانال ایمیل پیکربندی نشده است" });
      }

      default:
        return clean(400, { error: "unknown_action" });
    }
  } catch (e) {
    console.error("admin function error", e instanceof Error ? e.message : "unknown");
    return clean(500, { error: "internal_error" });
  }
});
