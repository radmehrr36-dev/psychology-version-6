// Edge Function: ثبت‌نام عمومی + OTP آزمایشی + ورود با ایمیل/موبایل/نام کاربری
// Deploy:  supabase functions deploy auth-gateway --no-verify-jwt
// Local:   supabase functions serve --env-file supabase/functions/.env   (کد OTP در همین ترمینال چاپ می‌شود)
//
// اصول امنیتی:
//  • نوع حساب فقط از میان user | psychologist | support_specialist پذیرفته می‌شود؛ مدیر از این مسیر ساخته نمی‌شود.
//  • جستجوی username/phone فقط اینجا (service_role) انجام می‌شود؛ ایمیل هرگز به مرورگر برنمی‌گردد.
//  • پاسخ ثبت‌نام/ورود برای ایمیل/موبایل تکراری یا ناموجود یکسان است (ضد account-enumeration).
//  • کد OTP فقط به‌صورت HMAC ذخیره می‌شود، انقضا دارد، یک‌بارمصرف است و تلاش‌ها محدود است.
import { adminClient, anonClient, bearer, clientIp, corsHeaders, hmacHex, json, rateHit, serviceKey, sha256Hex } from "../_shared/common.ts";
import { OtpProviderError, resolveOtpProvider } from "../_shared/otp-provider.ts";
import { isPhoneExemptTestAccount } from "../_shared/test-accounts.ts";

const OTP_TTL_SECONDS = 120;
const OTP_RESEND_COOLDOWN = 45;
const OTP_LENGTH = 6;
const KINDS = ["user", "psychologist", "support_specialist"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_LOGIN_ERROR = "اطلاعات ورود نادرست است.";
const INVALID_CODE = { error: "invalid_code", message: "کد واردشده نادرست یا منقضی شده است." };

type Admin = ReturnType<typeof adminClient>;
type Body = Record<string, unknown>;

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function pepper(): string {
  return Deno.env.get("OTP_PEPPER") ?? serviceKey();
}

/** شماره‌ی موبایل ایران → 09xxxxxxxxx (ارقام فارسی/عربی و +98 پشتیبانی می‌شود) */
function normalizePhone(raw: string): string | null {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = raw
    .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

function generateCode(): string {
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= 4_294_000_000);
  return String(buf[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
}

const challengeResponse = (challenge: string, emailConfirmationSent?: boolean) => json(200, { ok: true, challenge, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN, emailConfirmationSent });
const limited = () => json(429, { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." });
const duplicate = () => json(409, { error: "registration_conflict", message: "ثبت‌نام با این اطلاعات ممکن نیست. اطلاعات دیگری وارد کنید یا به حساب قبلی وارد شوید." });

type IssueResult = { status: "sent"; id: string } | { status: "limited" };

async function issueOtp(admin: Admin, userId: string, destination: string): Promise<IssueResult> {
  const provider = resolveOtpProvider();
  if (!(await rateHit(admin, `otp:user:${userId}`, 5, 3600))) return { status: "limited" };
  const id = crypto.randomUUID();
  const code = generateCode();
  const { data, error } = await admin.rpc("auth_issue_registration_otp", {
    p_user_id: userId, p_id: id, p_destination: destination,
    p_hash: await hmacHex(pepper(), `${id}:${code}`),
  });
  if (error) throw new Error("auth_schema_unavailable");
  if (data !== true) return { status: "limited" };
  try {
    await provider.send({ destination, code, purpose: "registration", ttlSeconds: OTP_TTL_SECONDS });
  } catch (e) {
    await admin.from("auth_otps").update({ consumed_at: new Date().toISOString() }).eq("id", id);
    throw e;
  }
  return { status: "sent", id };
}

async function register(req: Request, body: Body): Promise<Response> {
  // Never create an account if a delivery method is unavailable.
  resolveOtpProvider();
  const admin = adminClient();
  const ipHash = await sha256Hex(clientIp(req));
  if (!(await rateHit(admin, `register:ip:${ipHash}`, 8, 3600))) return limited();

  const kind = str(body.kind, 30);
  const fullName = str(body.fullName, 80);
  const email = str(body.email, 254).toLowerCase();
  const phone = normalizePhone(str(body.phone, 30));
  const username = str(body.username, 30).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  const fields: Record<string, string> = {};
  if (!KINDS.includes(kind)) fields.kind = "نوع حساب نامعتبر است.";
  if (fullName.length < 2 || (typeof body.fullName === "string" && body.fullName.trim().length > 80)) fields.fullName = "نام و نام خانوادگی معتبر (حداکثر ۸۰ کاراکتر) وارد کنید.";
  if (!EMAIL_RE.test(email) || (typeof body.email === "string" && body.email.trim().length > 254)) fields.email = "ایمیل معتبر وارد کنید.";
  if (!phone || (typeof body.phone === "string" && body.phone.trim().length > 30)) fields.phone = "شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789).";
  if (!/^[a-z][a-z0-9_.]{2,23}$/.test(username)) fields.username = "نام کاربری ۳ تا ۲۴ کاراکتر انگلیسی (حرف، عدد، _ و .) و با حرف شروع شود.";
  if (password.length < 8 || new TextEncoder().encode(password).length > 72 || !/\p{L}/u.test(password) || !/[0-9۰-۹٠-٩]/.test(password)) {
    fields.password = "رمز عبور حداقل ۸ کاراکتر و شامل حرف و عدد باشد و از ۷۲ بایت بیشتر نشود.";
  }
  if (Object.keys(fields).length) return json(400, { error: "validation", fields, message: "اطلاعات واردشده را بررسی کنید." });

  // ایمیل تا تأیید OTP «تأییدنشده» می‌ماند؛ با فعال‌بودن Confirm email در Supabase، تا آن زمان نشستی صادر نمی‌شود
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    if (createError && /already|registered|exists|duplicate/i.test(createError.message)) return duplicate();
    throw new Error("create_user_failed");
  }
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").update({ username, phone, account_kind: kind, account_status: "pending", contact_verified_at: null, phone_verified_at: null }).eq("id", userId).select("id").single();
  if (profileError) {
    const rollback = await admin.auth.admin.deleteUser(userId);
    if (rollback.error) throw new Error("registration_cleanup_failed");
    if (profileError.code === "23505" || /duplicate|unique/i.test(profileError.message)) return duplicate();
    throw new Error("profile_update_failed");
  }

  try {
    const issued = await issueOtp(admin, userId, phone!);
    if (issued.status === "limited") {
      await admin.auth.admin.deleteUser(userId);
      return limited();
    }
    // Supabase verifies email separately. A phone OTP must never confirm an email.
    const emailClient = anonClient();
    const { error: emailError } = await emailClient.auth.resend({ type: "signup", email });
    if (!emailError) return challengeResponse(issued.id, true);
    // Admin-created users do not always have an initial signup email to resend.
    const fallback = await emailClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    return challengeResponse(issued.id, !fallback.error);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    throw e;
  }
}

async function verify(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const challenge = str(body.challenge, 60);
  const code = str(body.code, 12).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const ipHash = await sha256Hex(clientIp(req));
  if (!(await rateHit(admin, `verify:ip:${ipHash}`, 30, 900))) return limited();
  if (!UUID_RE.test(challenge) || !/^\d{6}$/.test(code)) return json(400, INVALID_CODE);
  if (!(await rateHit(admin, `verify:ch:${challenge}`, 10, 900))) return limited();

  const { data, error } = await admin.rpc("auth_consume_registration_otp", { p_id: challenge, p_hash: await hmacHex(pepper(), `${challenge}:${code}`) });
  if (error) throw new Error("auth_schema_unavailable");
  if (data !== true) return json(400, INVALID_CODE);
  return json(200, { ok: true });
}

async function resend(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const ipHash = await sha256Hex(clientIp(req));
  if (!(await rateHit(admin, `resend:ip:${ipHash}`, 15, 3600))) return limited();

  let userId: string | null = null;
  let authEmail: string | null = null;
  const token = bearer(req);
  const challenge = str(body.challenge, 60);
  if (UUID_RE.test(challenge)) {
    const { data: row } = await admin.from("auth_otps").select("user_id").eq("id", challenge).eq("purpose", "registration").is("consumed_at", null).maybeSingle();
    userId = (row?.user_id as string | undefined) ?? null;
  } else if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data.user?.id ?? null;
    authEmail = data.user?.email ?? null;
  }
  if (!userId) return json(400, { error: "invalid_challenge", message: "درخواست تأیید معتبر نیست. دوباره ثبت‌نام کنید." });

  const { data: profile } = await admin.from("profiles").select("phone,role,account_kind,contact_verified_at").eq("id", userId).maybeSingle();
  if (!profile || profile.role || profile.contact_verified_at) return json(400, { error: "invalid_challenge", message: "درخواست تأیید معتبر نیست." });
  if (isPhoneExemptTestAccount(userId, authEmail, profile)) {
    return json(400, { error: "verification_not_required", message: "این حساب به تأیید شماره‌ی موبایل نیاز ندارد." });
  }
  if (!profile.phone) return json(400, { error: "no_phone", message: "برای این حساب شماره‌ی موبایلی ثبت نشده است. با پشتیبانی تماس بگیرید." });

  const issued = await issueOtp(admin, userId, profile.phone as string);
  if (issued.status === "limited") return limited();
  return challengeResponse(issued.id);
}

async function login(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const identifier = str(body.identifier, 254);
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password || password.length > 1024) return json(400, { error: "invalid_credentials", message: GENERIC_LOGIN_ERROR });

  const ipHash = await sha256Hex(clientIp(req));
  const normalizedIdentifier = identifier.includes("@") ? identifier.toLowerCase() : (normalizePhone(identifier) ?? identifier.toLowerCase());
  const idHash = await sha256Hex(normalizedIdentifier);
  if (!(await rateHit(admin, `login:ip:${ipHash}`, 40, 900)) || !(await rateHit(admin, `login:id:${idHash}`, 8, 900))) return limited();

  let email: string | null = null;
  if (identifier.includes("@")) {
    email = identifier.toLowerCase();
  } else {
    const phone = normalizePhone(identifier);
    const query = admin.from("profiles").select("email");
    const { data } = phone ? await query.eq("phone", phone).maybeSingle() : await query.eq("username", identifier.toLowerCase()).maybeSingle();
    email = (data?.email as string | null | undefined) ?? null;
  }

  // برای شناسه‌ی ناموجود هم یک تلاش ورود انجام می‌شود تا زمان پاسخ تقریباً یکسان بماند
  const auth = anonClient();
  const { data: signedIn, error } = await auth.auth.signInWithPassword({ email: email ?? "nobody@invalid.example", password });
  if (error || !signedIn.session || !email) return json(401, { error: "invalid_credentials", message: GENERIC_LOGIN_ERROR });

  const { data: profile } = await admin
    .from("profiles").select("role,account_kind,account_status,phone,contact_verified_at")
    .eq("id", signedIn.user.id).single();

  const phoneExempt = isPhoneExemptTestAccount(signedIn.user.id, signedIn.user.email, profile);
  if (!profile || profile.account_status !== "active" || (!profile.role && !profile.contact_verified_at && !phoneExempt)) {
    await auth.auth.signOut({ scope: "local" });
    return json(403, { error: "account_unavailable", message: "حساب فعال یا تأییدشده نیست. برای پیگیری با پشتیبانی تماس بگیرید." });
  }

  return json(200, {
    ok: true,
    session: { access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token },
    accountKind: profile?.account_kind ?? "user",
    accountStatus: profile.account_status,
    hasRole: Boolean(profile?.role),
  });
}

/** آیا نشست فعلی هنوز به تأیید شماره نیاز دارد؟ فقط بر اساس JWT تأییدشده و داده‌ی سرور */
async function sessionStatus(req: Request): Promise<Response> {
  const token = bearer(req);
  if (!token) return json(401, { error: "unauthenticated", message: "ابتدا وارد شوید." });
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "unauthenticated", message: "نشست معتبر نیست؛ دوباره وارد شوید." });
  if (!(await rateHit(admin, `status:user:${data.user.id}`, 60, 900))) return limited();
  const { data: profile } = await admin.from("profiles").select("role,account_kind,contact_verified_at").eq("id", data.user.id).maybeSingle();
  if (!profile) return json(404, { error: "profile_missing", message: "پروفایل حساب یافت نشد." });
  const required = !profile.role && !profile.contact_verified_at && !isPhoneExemptTestAccount(data.user.id, data.user.email, profile);
  return json(200, { ok: true, phoneVerificationRequired: required });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: Body;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 8192) return json(413, { error: "request_too_large", message: "درخواست بیش از حد بزرگ است." });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json" });
  } catch {
    return json(400, { error: "invalid_json" });
  }
  try {
    switch (body.action) {
      case "register": return await register(req, body);
      case "verify": return await verify(req, body);
      case "resend": return await resend(req, body);
      case "login": return await login(req, body);
      case "session_status": return await sessionStatus(req);
      default: return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    if (e instanceof OtpProviderError) {
      return json(503, { error: "otp_unavailable", message: "ارسال کد تأیید در این محیط پیکربندی نشده است." });
    }
    if (e instanceof Error && (e.message === "auth_schema_unavailable" || e.message === "rate_limiter_unavailable")) {
      return json(503, { error: "schema_unavailable", message: "زیرساخت احراز هویت سرور کامل نیست. مدیر سایت باید ساختار پایگاه داده را بررسی کند." });
    }
    console.error("auth-gateway: operation failed");
    return json(500, { error: "server_error", message: "خطای داخلی سرور. لطفاً بعداً تلاش کنید." });
  }
});
