// تست مسیر واقعی شروع آزمون روی Supabase زنده (مرورگر واقعی، بدون mock داده).
//
// اجرا:
//   set -a; source .env.local; set +a
//   PLAYWRIGHT_ENTRY=/path/to/playwright-core/index.mjs \
//   TEST_BASE_URL=http://127.0.0.1:5173 \
//   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \   # حساب کاربر عادی (اختیاری؛ بدون آن فقط بخش عمومی اجرا می‌شود)
//   node tests/live-test-start.mjs
//
// بخش عمومی: صفحه‌ی هر دو آزمون باید نسخه و تعداد سؤال را نشان دهد و شناسه‌ی ارسالی به RPC باید tests.id باشد.
// بخش کاربر: ورود → شروع آزمون → دیدن سؤال اول → ثبت پاسخ → رفتن به سؤال بعد (برای هر دو آزمون).
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const entry = process.env.PLAYWRIGHT_ENTRY;
if (!entry) throw new Error("PLAYWRIGHT_ENTRY باید به index.mjs کتابخانه‌ی playwright-core اشاره کند.");
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const sbUrl = process.env.VITE_SUPABASE_URL;
const sbKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!sbUrl || !sbKey) throw new Error("VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY باید تنظیم شوند (source .env.local).");
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const SLUGS = ["khodagahi-rozmare", "tanzim-heyjan-roozmare"];
const { chromium } = await import(pathToFileURL(entry).href);

// شناسه‌ی واقعی tests.id برای هر slug (از همان REST عمومی که سایت استفاده می‌کند)
const rows = await (await fetch(`${sbUrl}/rest/v1/tests?select=id,slug&status=eq.published&review_status=eq.approved`, {
  headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
})).json();
const testIdBySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
for (const s of SLUGS) assert.ok(testIdBySlug[s], `آزمون ${s} در دیتابیس منتشرشده نیست`);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
const pass = (label) => { results.push({ label, ok: true }); console.log(`PASS ${label}`); };

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });
  const page = await context.newPage();
  const rpcCalls = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/") || r.url().includes("/rest/v1/test_versions")) {
      rpcCalls.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ""), body: r.postData() ?? "" });
    }
  });
  page.on("pageerror", (e) => { throw new Error(`خطای زمان اجرای صفحه: ${e.message}`); });
  return { context, page, rpcCalls };
}

// ── بخش عمومی (بدون ورود) ──
{
  const { context, page, rpcCalls } = await newPage();
  for (const slug of SLUGS) {
    rpcCalls.length = 0;
    await page.goto(`${base}/tests/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("aside", { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector("aside")?.innerText.includes("دریافت"), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const aside = await page.locator("aside").innerText();
    assert.ok(!/یافت نشد/.test(aside), `${slug}: پیام خطای نسخه نمایش داده شد: ${aside}`);
    assert.ok(/نسخه\n/.test(aside) || /نسخه/.test(aside), `${slug}: برچسب نسخه نمایش داده نشد`);
    const count = aside.match(/تعداد سؤال\s*\n?\s*([۰-۹0-9]+)/);
    assert.ok(count, `${slug}: تعداد سؤال نمایش داده نشد`);
    pass(`${slug}: detail page shows published version and question count (${count[1]})`);
    const rpc = rpcCalls.find((c) => c.url.includes("/rpc/public_test_version"));
    assert.ok(rpc, `${slug}: RPC public_test_version فراخوانی نشد`);
    assert.equal(JSON.parse(rpc.body).p_test_id, testIdBySlug[slug], `${slug}: p_test_id باید tests.id باشد`);
    pass(`${slug}: public_test_version receives tests.id (not version id or slug)`);
    assert.ok(!rpcCalls.some((c) => c.url.includes("/rest/v1/test_versions")), `${slug}: هنوز SELECT مستقیم روی test_versions انجام می‌شود`);
    pass(`${slug}: no direct SELECT on test_versions from the browser`);
  }
  await context.close();
}

// ── بخش کاربر عادی ──
if (!email || !password) {
  console.log("\nTEST_USER_EMAIL / TEST_USER_PASSWORD تنظیم نشده‌اند؛ بخش کاربر عادی اجرا نشد.");
} else {
  const { context, page, rpcCalls } = await newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("ایمیل، موبایل یا نام کاربری").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/account", { timeout: 30000 });
  pass("ordinary user signs in and reaches /account");

  for (const slug of SLUGS) {
    await page.goto(`${base}/tests/${slug}`, { waitUntil: "domcontentloaded" });
    const startLink = page.getByRole("link", { name: /شروع آزمون/ });
    await startLink.waitFor({ timeout: 30000 });
    rpcCalls.length = 0;
    await startLink.click();
    await page.waitForURL((u) => u.pathname === `/tests/${slug}/take`, { timeout: 30000 });
    const question = page.locator("h1");
    await question.waitFor({ timeout: 30000 });
    const firstPrompt = (await question.innerText()).trim();
    assert.ok(firstPrompt.length > 0, `${slug}: متن سؤال اول خالی است`);
    assert.ok(!(await page.getByRole("alert").count()), `${slug}: پیام خطا پس از شروع نمایش داده شد`);
    const progress = await page.getByText(/سؤال .+ از .+ ·/).first().innerText();
    assert.ok(/سؤال\s*[۱1]\s*از/.test(progress), `${slug}: شماره‌ی سؤال اول درست نیست: ${progress}`);
    pass(`${slug}: start shows first question: "${firstPrompt.slice(0, 40)}…"`);

    const options = page.getByRole("radio");
    await options.first().waitFor({ timeout: 15000 });
    const optionCount = await options.count();
    assert.ok(optionCount >= 2, `${slug}: گزینه‌های سؤال اول کامل نیستند (${optionCount})`);
    pass(`${slug}: first question shows ${optionCount} options`);

    const saved = page.waitForResponse((r) => r.url().includes("/rpc/save_test_answer"), { timeout: 15000 });
    await options.first().click();
    const saveRes = await saved;
    assert.equal(saveRes.status(), 200, `${slug}: ثبت پاسخ ناموفق بود (HTTP ${saveRes.status()})`);
    pass(`${slug}: answer saved to server (save_test_answer 200)`);

    const next = page.getByRole("button", { name: /بعدی/ });
    await next.waitFor();
    await next.click();
    await page.waitForFunction((prev) => document.querySelector("h1")?.innerText.trim() !== prev, firstPrompt, { timeout: 15000 });
    const progress2 = await page.getByText(/سؤال .+ از .+ ·/).first().innerText();
    assert.ok(/سؤال\s*[۲2]\s*از/.test(progress2), `${slug}: پس از «بعدی» به سؤال ۲ نرفت: ${progress2}`);
    pass(`${slug}: next moves to question 2`);

    const startCall = rpcCalls.find((c) => c.url.includes("/rpc/start_test_attempt"));
    assert.ok(startCall, `${slug}: start_test_attempt فراخوانی نشد`);
    assert.equal(JSON.parse(startCall.body).p_test_id, testIdBySlug[slug], `${slug}: start_test_attempt باید tests.id دریافت کند`);
    pass(`${slug}: start_test_attempt receives tests.id`);
  }
  await context.close();
}

await browser.close();
console.log(`\n${results.length} live checks passed.`);
