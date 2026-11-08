// Edge Function: ثبت‌نام عمومی + OTP آزمایشی + ورود با ایمیل/موبایل/نام کاربری
// Deploy:  supabase functions deploy auth-gateway --no-verify-jwt
// Local:   supabase functions serve --env-file supabase/functions/.env   (کد OTP در همین ترمینال چاپ می‌شود)
//
// اصول امنیتی:
//  • نوع حساب فقط از میان user | psychologist | support_specialist پذیرفته می‌شود؛ مدیر از این مسیر ساخته نمی‌شود.
//  • جستجوی username/phone فقط اینجا (service_role) انجام می‌شود؛ ایمیل هرگز به مرورگر برنمی‌گردد.
//  • پاسخ ثبت‌نام/ورود برای ایمیل/موبایل تکراری یا ناموجود یکسان است (ضد account-enumeration).
//  • کد OTP فقط به‌صورت HMAC ذخیره می‌شود، انقضا دارد، یک‌بارمصرف است و تلاش‌ها محدود است.
import { adminClient, anonClient, bearer, clientIp, corsHeaders, hmacHex, json, rateHit, sha256Hex, timingSafeEqual } from "../_shared/common.ts";
import { OtpProviderError, resolveOtpProvider } from "../_shared/otp-provider.ts";

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
  const p = Deno.env.get("OTP_PEPPER") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  if (!p) throw new Error("server_not_configured");
  return p;
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
  crypto.getRandomValues(buf);
  return String(buf[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
}

const challengeResponse = (challenge: string) => json(200, { ok: true, challenge, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN });
const limited = () => json(429, { error: "rate_limited", message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." });

type IssueResult = { status: "sent" | "cooldown"; id: string } | { status: "limited" };

async function issueOtp(admin: Admin, userId: string, destination: string): Promise<IssueResult> {
  if (!(await rateHit(admin, `otp:user:${userId}`, 5, 3600))) return { status: "limited" };
  const { data: last } = await admin
    .from("auth_otps").select("id,created_at").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at as string).getTime() < OTP_RESEND_COOLDOWN * 1000) {
    return { status: "cooldown", id: last.id as string };
  }
  await admin.from("auth_otps").update({ consumed_at: new Date().toISOString() }).eq("user_id", userId).is("consumed_at", null);

  const id = crypto.randomUUID();
  const code = generateCode();
  const { error } = await admin.from("auth_otps").insert({
    id,
    user_id: userId,
    destination,
    code_hash: await hmacHex(pepper(), `${id}:${code}`),
    expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error("otp_store_failed");
  try {
    await resolveOtpProvider().send({ destination, code, purpose: "registration", ttlSeconds: OTP_TTL_SECONDS });
  } catch (e) {
    await admin.from("auth_otps").delete().eq("id", id); // کدی که ارسال نشده نباید معتبر بماند
    throw e;
  }
  return { status: "sent", id };
}

async function register(req: Request, body: Body): Promise<Response> {
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
  if (fullName.length < 2) fields.fullName = "نام و نام خانوادگی را وارد کنید.";
  if (!EMAIL_RE.test(email)) fields.email = "ایمیل معتبر وارد کنید.";
  if (!phone) fields.phone = "شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789).";
  if (!/^[a-z][a-z0-9_.]{2,23}$/.test(username)) fields.username = "نام کاربری ۳ تا ۲۴ کاراکتر انگلیسی (حرف، عدد، _ و .) و با حرف شروع شود.";
  if (password.length < 8 || password.length > 72 || !/[A-Za-z\u0600-\u06FF]/.test(password) || !/[0-9۰-۹]/.test(password)) {
    fields.password = "رمز عبور حداقل ۸ کاراکتر و شامل حرف و عدد باشد.";
  }
  if (Object.keys(fields).length) return json(400, { error: "validation", fields, message: "اطلاعات واردشده را بررسی کنید." });

  const { data: usernameTaken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (usernameTaken) return json(409, { error: "username_taken", fields: { username: "این نام کاربری در دسترس نیست." }, message: "این نام کاربری در دسترس نیست." });

  // ایمیل/موبایل تکراری: پاسخی کاملاً مشابه موفقیت (بدون ساخت حساب و بدون افشای وجود حساب)
  const [byEmail, byPhone] = await Promise.all([
    admin.from("profiles").select("id").eq("email", email).maybeSingle(),
    admin.from("profiles").select("id").eq("phone", phone!).maybeSingle(),
  ]);
  if (byEmail.data || byPhone.data) return challengeResponse(crypto.randomUUID());

  // ایمیل تا تأیید OTP «تأییدنشده» می‌ماند؛ با فعال‌بودن Confirm email در Supabase، تا آن زمان نشستی صادر نمی‌شود
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, account_kind: kind },
  });
  if (createError || !created.user) {
    if (createError && /already|registered|exists/i.test(createError.message)) return challengeResponse(crypto.randomUUID());
    throw new Error("create_user_failed");
  }
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").update({ username, phone }).eq("id", userId);
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (/duplicate|unique/i.test(profileError.message)) return challengeResponse(crypto.randomUUID());
    throw new Error("profile_update_failed");
  }

  try {
    const issued = await issueOtp(admin, userId, phone!);
    if (issued.status === "limited") {
      await admin.auth.admin.deleteUser(userId);
      return limited();
    }
    return challengeResponse(issued.id);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId); // حساب ناقص/تأییدنشده باقی نمی‌ماند
    throw e;
  }
}

async function verify(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const challenge = str(body.challenge, 60);
  const code = str(body.code, 12).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const ipHash = await sha256Hex(clientIp(req));
  if (!(await rateHit(admin, `verify:ip:${ipHash}`, 30, 900))) return limited();
  if (!UUID_RE.test(challenge) || !/^\d{6}$/.test(code)) return json(400, INVALID_CODE);
  if (!(await rateHit(admin, `verify:ch:${challenge}`, 10, 900))) return limited();

  const { data: row } = await admin.from("auth_otps").select("*").eq("id", challenge).maybeSingle();
  if (!row || row.consumed_at || new Date(row.expires_at as string).getTime() < Date.now() || (row.attempts as number) >= (row.max_attempts as number)) {
    return json(400, INVALID_CODE);
  }
  const expected = await hmacHex(pepper(), `${row.id}:${code}`);
  if (!timingSafeEqual(expected, row.code_hash as string)) {
    await admin.from("auth_otps").update({ attempts: (row.attempts as number) + 1 }).eq("id", row.id);
    return json(400, INVALID_CODE);
  }
  // مصرف اتمیک: فقط یک درخواست موفق می‌شود
  const { data: consumed } = await admin
    .from("auth_otps").update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id).is("consumed_at", null).select("user_id").maybeSingle();
  if (!consumed) return json(400, INVALID_CODE);

  const now = new Date().toISOString();
  await admin.from("profiles").update({ contact_verified_at: now, phone_verified_at: now }).eq("id", consumed.user_id);
  const { error: confirmError } = await admin.auth.admin.updateUserById(consumed.user_id as string, { email_confirm: true });
  if (confirmError) throw new Error("confirm_failed");
  const { data: profile } = await admin.from("profiles").select("account_kind,account_status").eq("id", consumed.user_id).single();
  return json(200, { ok: true, accountKind: profile?.account_kind ?? "user", accountStatus: profile?.account_status ?? "active" });
}

async function resend(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const ipHash = await sha256Hex(clientIp(req));
  if (!(await rateHit(admin, `resend:ip:${ipHash}`, 15, 3600))) return limited();

  let userId: string | null = null;
  const token = bearer(req);
  const challenge = str(body.challenge, 60);
  if (UUID_RE.test(challenge)) {
    const { data: row } = await admin.from("auth_otps").select("user_id").eq("id", challenge).maybeSingle();
    userId = (row?.user_id as string | undefined) ?? null;
  } else if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data.user?.id ?? null;
  }
  // ناشناخته → همان پاسخ ظاهراً موفق (ضد enumeration)
  if (!userId) return challengeResponse(crypto.randomUUID());

  const { data: profile } = await admin.from("profiles").select("phone,role,contact_verified_at").eq("id", userId).maybeSingle();
  if (!profile || profile.role || profile.contact_verified_at) return challengeResponse(crypto.randomUUID());
  if (!profile.phone) return json(400, { error: "no_phone", message: "برای این حساب شماره‌ی موبایلی ثبت نشده است. با پشتیبانی تماس بگیرید." });

  const issued = await issueOtp(admin, userId, profile.phone as string);
  if (issued.status === "limited") return limited();
  return challengeResponse(issued.id);
}

async function login(req: Request, body: Body): Promise<Response> {
  const admin = adminClient();
  const identifier = str(body.identifier, 254);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!identifier || !password) return json(400, { error: "invalid_credentials", message: GENERIC_LOGIN_ERROR });

  const ipHash = await sha256Hex(clientIp(req));
  const idHash = await sha256Hex(identifier.toLowerCase());
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
  const { data: signedIn, error } = await anonClient().auth.signInWithPassword({ email: email ?? "nobody@invalid.example", password });
  // GoTrue ابتدا رمز را بررسی می‌کند؛ email_not_confirmed یعنی رمز درست بوده و فقط تأیید OTP مانده
  if (error && email && (error as { code?: string }).code === "email_not_confirmed" || (error && /email not confirmed/i.test(error.message))) {
    const { data: pending } = await admin.from("profiles").select("id,role,phone,contact_verified_at").eq("email", email).maybeSingle();
    if (pending && !pending.role && !pending.contact_verified_at && pending.phone) {
      const issued = await issueOtp(admin, pending.id as string, pending.phone as string);
      if (issued.status === "limited") return limited();
      return json(200, { ok: false, needsVerification: true, challenge: issued.id, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN });
    }
  }
  if (error || !signedIn.session || !email) return json(401, { error: "invalid_credentials", message: GENERIC_LOGIN_ERROR });

  const { data: profile } = await admin
    .from("profiles").select("role,account_kind,account_status,phone,contact_verified_at")
    .eq("id", signedIn.user.id).single();

  // ثبت‌نام‌شده‌ی تأییدنشده: نشست صادر نمی‌شود؛ OTP جدید
  if (profile && !profile.role && !profile.contact_verified_at && profile.phone) {
    const issued = await issueOtp(admin, signedIn.user.id, profile.phone as string);
    if (issued.status === "limited") return limited();
    return json(200, { ok: false, needsVerification: true, challenge: issued.id, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN });
  }

  return json(200, {
    ok: true,
    session: { access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token },
    accountKind: profile?.account_kind ?? "user",
    accountStatus: profile?.account_status ?? "active",
    hasRole: Boolean(profile?.role),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  try {
    switch (body.action) {
      case "register": return await register(req, body);
      case "verify": return await verify(req, body);
      case "resend": return await resend(req, body);
      case "login": return await login(req, body);
      default: return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    if (e instanceof OtpProviderError) {
      return json(503, { error: "otp_unavailable", message: "ارسال کد تأیید در این محیط پیکربندی نشده است." });
    }
    console.error("auth-gateway error:", e instanceof Error ? e.message : "unknown"); // هرگز body/کد/رمز لاگ نمی‌شود
    return json(500, { error: "server_error", message: "خطای داخلی سرور. لطفاً بعداً تلاش کنید." });
  }
});
