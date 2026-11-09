// معافیت از تأیید شماره‌ی موبایل — فقط برای سه حساب آزمایشی مشخص.
//
// شرط‌های همزمان (همه باید درست باشند؛ در غیر این صورت معافیت نیست):
//  ۱) شناسه‌ی کاربر (UUID تأییدشده از JWT یا ورود با رمز) در secret سرور PHONE_EXEMPT_TEST_ACCOUNT_IDS باشد.
//  ۲) ایمیل حساب در Supabase Auth دقیقاً یکی از سه ایمیل ثابت زیر باشد.
//  ۳) profiles.account_kind با نوع ثبت‌شده برای همان ایمیل یکی باشد.
//  ۴) حساب نقش مدیریتی (profiles.role) نداشته باشد.
// هیچ ورودی‌ای از فرانت‌اند در این تصمیم نقش ندارد. secret خالی یا نامعتبر = هیچ معافیتی (fail closed).

const TEST_ACCOUNTS: Readonly<Record<string, "user" | "support_specialist" | "psychologist">> = Object.freeze({
  "testuser01@example.com": "user",
  "testspecialist01@example.com": "support_specialist",
  "testpsychologist01@example.com": "psychologist",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowedIds(): Set<string> {
  const raw = Deno.env.get("PHONE_EXEMPT_TEST_ACCOUNT_IDS") ?? "";
  const ids = raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  // بیش از سه شناسه یا شناسه‌ی نامعتبر = پیکربندی اشتباه؛ هیچ معافیتی داده نمی‌شود
  if (ids.length > 3 || ids.some((id) => !UUID_RE.test(id))) return new Set();
  return new Set(ids);
}

export function isPhoneExemptTestAccount(
  userId: string | null | undefined,
  authEmail: string | null | undefined,
  profile: { role?: unknown; account_kind?: unknown } | null | undefined,
): boolean {
  if (!userId || !authEmail || !profile) return false;
  if (profile.role) return false;
  if (!allowedIds().has(userId.toLowerCase())) return false;
  const expectedKind = TEST_ACCOUNTS[authEmail.trim().toLowerCase()];
  return Boolean(expectedKind) && profile.account_kind === expectedKind;
}
