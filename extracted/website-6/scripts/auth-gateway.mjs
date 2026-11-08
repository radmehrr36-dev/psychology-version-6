/**
 * درگاه احراز هویت محلی (توسعه) — همان قرارداد Edge Function «auth-gateway»
 *
 * اجرا:  node scripts/auth-gateway.mjs
 * یا همراه Vite: npm run dev  (scripts/dev.mjs)
 *
 * نیاز: SUPABASE_URL یا VITE_SUPABASE_URL
 *       SUPABASE_SERVICE_ROLE_KEY  (هرگز با پیشوند VITE_)
 *       APP_ENV=development تا OTP در همین ترمینال چاپ شود
 *
 * در production ابری از supabase/functions/auth-gateway استفاده کنید.
 */
import { createServer } from "node:http";
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const OTP_TTL_SECONDS = 120;
const OTP_RESEND_COOLDOWN = 45;
const OTP_LENGTH = 6;
const KINDS = new Set(["user", "psychologist", "support_specialist"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_LOGIN = "اطلاعات ورود نادرست است.";
const INVALID_CODE = { error: "invalid_code", message: "کد واردشده نادرست یا منقضی شده است." };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const isDev = () => process.env.APP_ENV === "development";
const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const hmac = (key, msg) => createHmac("sha256", key).update(msg).digest("hex");
const safeEq = (a, b) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

function pepper() {
  const p = process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!p) throw new Error("server_not_configured");
  return p;
}

function normalizePhone(raw) {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw)
    .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

function maskPhone(phone) {
  return phone.length >= 7 ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : "***";
}

function generateCode() {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function clients() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!url || !service) {
    const err = new Error("server_not_configured");
    err.code = "server_not_configured";
    throw err;
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonClient = createClient(url, anon || service, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, anonClient };
}

function sendJson(res, status, body) {
  res.writeHead(status, cors);
  res.end(JSON.stringify(body));
}

async function rateHit(admin, bucket, limit, windowSeconds) {
  const { data, error } = await admin.rpc("auth_rate_hit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new Error("rate_limiter_unavailable");
  return data === true;
}

async function issueOtp(admin, userId, destination) {
  if (!(await rateHit(admin, `otp:user:${userId}`, 5, 3600))) return { status: "limited" };
  const { data: last } = await admin.from("auth_otps").select("id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < OTP_RESEND_COOLDOWN * 1000) {
    return { status: "cooldown", id: last.id };
  }
  await admin.from("auth_otps").update({ consumed_at: new Date().toISOString() }).eq("user_id", userId).is("consumed_at", null);

  const id = randomUUID();
  const code = generateCode();
  const { error } = await admin.from("auth_otps").insert({
    id,
    user_id: userId,
    destination,
    code_hash: hmac(pepper(), `${id}:${code}`),
    expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error("otp_store_failed");

  if (!isDev()) {
    await admin.from("auth_otps").delete().eq("id", id);
    const e = new Error("otp_unavailable");
    e.code = "otp_unavailable";
    throw e;
  }
  console.log(`\n[DEV-OTP] registration → ${maskPhone(destination)} | کد: ${code} | اعتبار: ${OTP_TTL_SECONDS} ثانیه\n`);
  return { status: "sent", id };
}

const challengeBody = (id) => ({ ok: true, challenge: id, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN });

async function register(admin, body, ip) {
  if (!(await rateHit(admin, `register:ip:${sha256(ip)}`, 8, 3600))) return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };

  const kind = str(body.kind, 30);
  const fullName = str(body.fullName, 80);
  const email = str(body.email, 254).toLowerCase();
  const phone = normalizePhone(str(body.phone, 30));
  const username = str(body.username, 30).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const fields = {};
  if (!KINDS.has(kind)) fields.kind = "نوع حساب نامعتبر است.";
  if (fullName.length < 2) fields.fullName = "نام و نام خانوادگی را وارد کنید.";
  if (!EMAIL_RE.test(email)) fields.email = "ایمیل معتبر وارد کنید.";
  if (!phone) fields.phone = "شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789).";
  if (!/^[a-z][a-z0-9_.]{2,23}$/.test(username)) fields.username = "نام کاربری ۳ تا ۲۴ کاراکتر انگلیسی (حرف، عدد، _ و .) و با حرف شروع شود.";
  if (password.length < 8 || password.length > 72 || !/[A-Za-z\u0600-\u06FF]/.test(password) || !/[0-9۰-۹]/.test(password)) {
    fields.password = "رمز عبور حداقل ۸ کاراکتر و شامل حرف و عدد باشد.";
  }
  if (Object.keys(fields).length) return { status: 400, body: { error: "validation", fields, message: "اطلاعات واردشده را بررسی کنید." } };

  const { data: usernameTaken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (usernameTaken) return { status: 409, body: { error: "username_taken", fields: { username: "این نام کاربری در دسترس نیست." }, message: "این نام کاربری در دسترس نیست." } };

  const [byEmail, byPhone] = await Promise.all([
    admin.from("profiles").select("id").eq("email", email).maybeSingle(),
    admin.from("profiles").select("id").eq("phone", phone).maybeSingle(),
  ]);
  if (byEmail.data || byPhone.data) return { status: 200, body: challengeBody(randomUUID()) };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, account_kind: kind },
  });
  if (createError || !created.user) {
    if (createError && /already|registered|exists/i.test(createError.message)) return { status: 200, body: challengeBody(randomUUID()) };
    throw new Error("create_user_failed");
  }
  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").update({ username, phone }).eq("id", userId);
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (/duplicate|unique/i.test(profileError.message)) return { status: 200, body: challengeBody(randomUUID()) };
    throw new Error("profile_update_failed");
  }
  try {
    const issued = await issueOtp(admin, userId, phone);
    if (issued.status === "limited") {
      await admin.auth.admin.deleteUser(userId);
      return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
    }
    return { status: 200, body: challengeBody(issued.id) };
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    throw e;
  }
}

async function verify(admin, body, ip) {
  const challenge = str(body.challenge, 60);
  const code = str(body.code, 12).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!(await rateHit(admin, `verify:ip:${sha256(ip)}`, 30, 900))) return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
  if (!UUID_RE.test(challenge) || !/^\d{6}$/.test(code)) return { status: 400, body: INVALID_CODE };
  if (!(await rateHit(admin, `verify:ch:${challenge}`, 10, 900))) return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };

  const { data: row } = await admin.from("auth_otps").select("*").eq("id", challenge).maybeSingle();
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= row.max_attempts) {
    return { status: 400, body: INVALID_CODE };
  }
  if (!safeEq(hmac(pepper(), `${row.id}:${code}`), row.code_hash)) {
    await admin.from("auth_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { status: 400, body: INVALID_CODE };
  }
  const { data: consumed } = await admin.from("auth_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id).is("consumed_at", null).select("user_id").maybeSingle();
  if (!consumed) return { status: 400, body: INVALID_CODE };

  const now = new Date().toISOString();
  await admin.from("profiles").update({ contact_verified_at: now, phone_verified_at: now }).eq("id", consumed.user_id);
  const { error: confirmError } = await admin.auth.admin.updateUserById(consumed.user_id, { email_confirm: true });
  if (confirmError) throw new Error("confirm_failed");
  const { data: profile } = await admin.from("profiles").select("account_kind,account_status").eq("id", consumed.user_id).single();
  return { status: 200, body: { ok: true, accountKind: profile?.account_kind ?? "user", accountStatus: profile?.account_status ?? "active" } };
}

async function resend(admin, body, ip, bearer) {
  if (!(await rateHit(admin, `resend:ip:${sha256(ip)}`, 15, 3600))) return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
  let userId = null;
  const challenge = str(body.challenge, 60);
  if (UUID_RE.test(challenge)) {
    const { data: row } = await admin.from("auth_otps").select("user_id").eq("id", challenge).maybeSingle();
    userId = row?.user_id ?? null;
  } else if (bearer) {
    const { data } = await admin.auth.getUser(bearer);
    userId = data.user?.id ?? null;
  }
  if (!userId) return { status: 200, body: challengeBody(randomUUID()) };
  const { data: profile } = await admin.from("profiles").select("phone,role,contact_verified_at").eq("id", userId).maybeSingle();
  if (!profile || profile.role || profile.contact_verified_at) return { status: 200, body: challengeBody(randomUUID()) };
  if (!profile.phone) return { status: 400, body: { error: "no_phone", message: "برای این حساب شماره‌ی موبایلی ثبت نشده است. با پشتیبانی تماس بگیرید." } };
  const issued = await issueOtp(admin, userId, profile.phone);
  if (issued.status === "limited") return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
  return { status: 200, body: challengeBody(issued.id) };
}

async function login(admin, anonClient, body, ip) {
  const identifier = str(body.identifier, 254);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!identifier || !password) return { status: 400, body: { error: "invalid_credentials", message: GENERIC_LOGIN } };
  if (!(await rateHit(admin, `login:ip:${sha256(ip)}`, 40, 900)) || !(await rateHit(admin, `login:id:${sha256(identifier.toLowerCase())}`, 8, 900))) {
    return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
  }

  let email = null;
  if (identifier.includes("@")) email = identifier.toLowerCase();
  else {
    const phone = normalizePhone(identifier);
    const query = admin.from("profiles").select("email");
    const { data } = phone ? await query.eq("phone", phone).maybeSingle() : await query.eq("username", identifier.toLowerCase()).maybeSingle();
    email = data?.email ?? null;
  }

  const { data: signedIn, error } = await anonClient.auth.signInWithPassword({ email: email ?? "nobody@invalid.example", password });
  const unconfirmed = error && (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message));
  if (unconfirmed && email) {
    const { data: pending } = await admin.from("profiles").select("id,role,phone,contact_verified_at").eq("email", email).maybeSingle();
    if (pending && !pending.role && !pending.contact_verified_at && pending.phone) {
      const issued = await issueOtp(admin, pending.id, pending.phone);
      if (issued.status === "limited") return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
      return { status: 200, body: { ok: false, needsVerification: true, challenge: issued.id, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN } };
    }
  }
  if (error || !signedIn?.session || !email) return { status: 401, body: { error: "invalid_credentials", message: GENERIC_LOGIN } };

  const { data: profile } = await admin.from("profiles").select("role,account_kind,account_status,phone,contact_verified_at").eq("id", signedIn.user.id).single();
  if (profile && !profile.role && !profile.contact_verified_at && profile.phone) {
    const issued = await issueOtp(admin, signedIn.user.id, profile.phone);
    if (issued.status === "limited") return { status: 429, body: { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." } };
    return { status: 200, body: { ok: false, needsVerification: true, challenge: issued.id, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      session: { access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token },
      accountKind: profile?.account_kind ?? "user",
      accountStatus: profile?.account_status ?? "active",
      hasRole: Boolean(profile?.role),
    },
  };
}

export function startAuthGateway({ port = 8788 } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().split(",")[0].trim();
    const auth = (req.headers.authorization || "").toLowerCase().startsWith("bearer ") ? req.headers.authorization.slice(7).trim() : "";

    try {
      const { admin, anonClient } = clients();
      let out;
      switch (body.action) {
        case "register":
          out = await register(admin, body, ip);
          break;
        case "verify":
          out = await verify(admin, body, ip);
          break;
        case "resend":
          out = await resend(admin, body, ip, auth);
          break;
        case "login":
          out = await login(admin, anonClient, body, ip);
          break;
        default:
          out = { status: 400, body: { error: "unknown_action" } };
      }
      sendJson(res, out.status, out.body);
    } catch (e) {
      if (e && e.code === "otp_unavailable") {
        return sendJson(res, 503, { error: "otp_unavailable", message: "ارسال کد تأیید در این محیط پیکربندی نشده است." });
      }
      if (e && (e.code === "server_not_configured" || e.message === "server_not_configured")) {
        return sendJson(res, 503, {
          error: "gateway_not_configured",
          message: "درگاه احراز هویت روی این ماشین پیکربندی نشده است. کلید SUPABASE_SERVICE_ROLE_KEY را در محیط اجرا بگذارید؛ هرگز با پیشوند VITE_ در فرانت‌اند قرار ندهید.",
        });
      }
      console.error("auth-gateway error:", e instanceof Error ? e.message : "unknown");
      sendJson(res, 500, { error: "server_error", message: "خطای داخلی سرور. لطفاً بعداً تلاش کنید." });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const hasKey = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "").trim());
      console.log(`[auth-gateway] http://127.0.0.1:${port}  APP_ENV=${process.env.APP_ENV || "(unset)"}  service_role=${hasKey ? "yes" : "MISSING"}`);
      if (!hasKey) {
        console.log("[auth-gateway] بدون SERVICE_ROLE_KEY ثبت‌نام/OTP کار نمی‌کند. ورود با ایمیل همچنان مستقیم از فرانت‌اند به Supabase Auth می‌رود.");
      } else if (!isDev()) {
        console.log("[auth-gateway] APP_ENV!=development → کد OTP چاپ نمی‌شود و ثبت‌نام رد می‌شود (طبق سیاست بدون پیامک).");
      } else {
        console.log("[auth-gateway] محیط توسعه: کد OTP در همین ترمینال چاپ می‌شود.");
      }
      resolve(server);
    });
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("auth-gateway.mjs");
if (isMain) {
  const port = Number(process.env.AUTH_GATEWAY_PORT || 8788);
  startAuthGateway({ port }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
