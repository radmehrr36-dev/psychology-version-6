#!/usr/bin/env node
/**
 * آریاسازه — Bootstrap اولین مدیر (فقط با service_role، خارج از مرورگر)
 *
 * استفاده:
 *   SUPABASE_URL="https://xxxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   ADMIN_EMAIL="you@example.com" \
 *   ADMIN_PASSWORD="یک-رمز-قوی" \
 *   node scripts/bootstrap-admin.mjs
 *
 * یا برای ارسال دعوت به‌جای تعیین رمز:
 *   ... ADMIN_EMAIL="you@example.com" node scripts/bootstrap-admin.mjs --invite
 *
 * هشدار: کلید service_role هرگز نباید در فایل .env با پیشوند VITE_ یا در باندل
 * فرانت‌اند قرار بگیرد. این اسکریپت فقط روی ماشین اپراتور اجرا می‌شود.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const invite = process.argv.includes("--invite");

if (!url || !serviceKey || !email) {
  console.error("متغیرهای SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY و ADMIN_EMAIL الزامی هستند.");
  process.exit(1);
}
if (!invite && !password) {
  console.error("برای ساخت مستقیم کاربر، ADMIN_PASSWORD لازم است یا از سوییچ --invite استفاده کنید.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { count, error: countError } = await db
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "super_admin");
if (countError) {
  console.error("بررسی مدیران فعلی ناموفق بود:", countError.message);
  process.exit(1);
}
if ((count ?? 0) > 0 && !process.argv.includes("--force")) {
  console.error(`در حال حاضر ${count} مدیر ارشد وجود دارد. برای افزودن مدیر دیگر از پنل یا --force استفاده کنید.`);
  process.exit(1);
}

let userId;
if (invite) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email);
  if (error) {
    console.error("ارسال دعوت ناموفق بود:", error.message);
    process.exit(1);
  }
  userId = data.user?.id;
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error("ایجاد کاربر ناموفق بود:", error.message);
    process.exit(1);
  }
  userId = data.user?.id;
}

if (!userId) {
  console.error("شناسه کاربر بازگردانده نشد.");
  process.exit(1);
}

const { error: profileError } = await db
  .from("profiles")
  .upsert({ id: userId, email, full_name: "مدیر ارشد", role: "super_admin", account_status: "active" }, { onConflict: "id" });
if (profileError) {
  console.error("به‌روزرسانی پروفایل ناموفق بود:", profileError.message);
  process.exit(1);
}

await db.from("audit_logs").insert({
  action: "bootstrap",
  resource_type: "profiles",
  resource_id: userId,
  result: "success",
  actor_email: "bootstrap-script",
  metadata: { method: invite ? "invite" : "password" },
});

console.log(`✅ مدیر ارشد با ایمیل ${email} آماده شد.`);
console.log(invite ? "کاربر باید از طریق ایمیل دعوت، رمز عبور تعیین کند." : "اکنون می‌توانید از /admin/login وارد شوید.");
