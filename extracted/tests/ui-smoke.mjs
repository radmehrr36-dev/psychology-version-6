import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// UI-only tests mock Supabase; they do not establish real authorization or accounts.
const modulePath = process.env.PLAYWRIGHT_ENTRY;
if (!modulePath) throw new Error("Set PLAYWRIGHT_ENTRY to the installed playwright-core index.mjs");
const { chromium } = await import(pathToFileURL(modulePath).href);
const projectUrl = process.env.VITE_SUPABASE_URL;
if (!projectUrl) throw new Error("VITE_SUPABASE_URL must be set");
const projectHost = new URL(projectUrl).host;
const key = `sb-${projectHost.split(".")[0]}-auth-token`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
let checks = 0;
const check = (label, condition) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); };
const base = "http://127.0.0.1:5173";
const uid = "11111111-1111-4111-8111-111111111111";

async function setup(role, width = 1440, missingRpc = false, initialSession = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fa-IR" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const profile = { id: uid, email: "test@example.test", full_name: "کاربر آزمایشی", avatar_url: null,
    role: role === "admin" ? "super_admin" : null, account_status: "active", account_kind: role === "admin" ? "user" : role,
    username: "tester", phone: "09120000000", phone_verified_at: "2026-01-01T00:00:00Z", contact_verified_at: "2026-01-01T00:00:00Z",
    last_seen_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", email_verified_at: "2026-01-01T00:00:00Z" };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.signature`;
  if (role && initialSession) {
    await page.addInitScript(({ key, token, uid }) => localStorage.setItem(key, JSON.stringify({
      access_token: token, refresh_token: "mock-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600,
      user: { id: uid, email: "test@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
    })), { key, token, uid });
  }
  await page.route(`https://${projectHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
    if (url.pathname.includes("/functions/v1/auth-gateway")) return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: "NOT_FOUND" }) });
    if (url.pathname.endsWith("/rpc/admin_search_accounts_hardening")) {
      if (missingRpc) return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: "PGRST202", message: "not found" }) });
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [profile], total: 1 }) });
    }
    if (url.pathname.endsWith("/profiles")) return route.fulfill({ status: 200, headers: { ...headers, "content-range": "0-0/1" }, body: JSON.stringify(role ? [profile] : []) });
    if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ status: 200, headers, body: JSON.stringify({ id: uid, email: profile.email, app_metadata: {}, user_metadata: {} }) });
    if (url.pathname.includes("/auth/v1/token")) {
      const credentials = route.request().postDataJSON();
      if (role && credentials?.email === "test@example.test" && credentials?.password === "Testing123") return route.fulfill({ status: 200, headers, body: JSON.stringify({ access_token: token, refresh_token: "mock-refresh", token_type: "bearer", expires_in: 3600, user: { id: uid, email: profile.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } }) });
      return route.fulfill({ status: 400, headers, body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }) });
    }
    if (url.pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 200, headers, body: "{}" });
    return route.fulfill({ status: 200, headers, body: url.pathname.includes("/rpc/") ? "null" : "[]" });
  });
  return { page, context, errors };
}

try {
  for (const width of [390, 1440]) {
    const { page, context, errors } = await setup(null, width);
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    check(`landing renders without horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`landing image is served at ${width}px`, await page.locator('img[src="/images/hero-brain.png"]').evaluate((img) => img.complete && img.naturalWidth > 0));
    await page.goto(`${base}/register`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    check(`three registration choices appear at ${width}px`, await page.getByRole("button", { name: /ثبت‌نام به‌عنوان/ }).count() === 3);
    check(`registration does not overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: /ثبت‌نام به‌عنوان کاربر عادی/ }).click();
    await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
    check(`registration validates required fields at ${width}px`, await page.getByRole("alert").count() > 0);
    check(`no browser runtime errors at ${width}px`, errors.length === 0);
    await context.close();
  }

  {
    const { page, context } = await setup(null);
    await page.goto(`${base}/register`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /ثبت‌نام به‌عنوان کاربر عادی/ }).click();
    await page.getByLabel("نام و نام خانوادگی").fill("آزمایش کاربر");
    await page.getByLabel("نام کاربری", { exact: true }).fill("tester_one");
    await page.getByLabel("شماره‌ی موبایل").fill("09120000000");
    await page.getByLabel("ایمیل", { exact: true }).fill("test@example.test");
    await page.locator('input[autocomplete="new-password"]').nth(0).fill("Testing123");
    await page.locator('input[autocomplete="new-password"]').nth(1).fill("Testing123");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });
    check("missing gateway shows a deployment error instead of fake success", await page.getByRole("alert").getByText(/مستقر/).isVisible());
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, false);
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("ایمیل، موبایل یا نام کاربری").fill("test@example.test");
    await page.getByLabel("رمز عبور").fill("Testing123");
    await page.getByRole("button", { name: "ورود", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/account", { timeout: 12000 });
    check("mock email login reaches the account panel", new URL(page.url()).pathname === "/account");
    await page.getByRole("button", { name: "خروج", exact: true }).first().click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 12000 });
    check("mock logout clears session and returns to login", await page.evaluate((storageKey) => !localStorage.getItem(storageKey), key));
    await context.close();
  }
  for (const [role, path, expected] of [
    ["user", "/desk", "/account"], ["user", "/pro", "/account"],
    ["psychologist", "/account", "/pro"], ["support_specialist", "/pro", "/desk"], ["admin", "/desk", "/admin"],
  ]) {
    const { page, context } = await setup(role);
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === expected, { timeout: 12000 });
    check(`mock ${role} cannot open ${path} and is redirected to ${expected}`, new URL(page.url()).pathname === expected);
    await context.close();
  }
  {
    const { page, context } = await setup("user");
    await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByText("دسترسی مدیریتی فعال نیست").waitFor({ timeout: 12000 });
    check("mock ordinary user sees admin access denied", await page.getByText("دسترسی مدیریتی فعال نیست").isVisible());
    await context.close();
  }
  for (const missing of [false, true]) {
    const { page, context } = await setup("admin", 1440, missing);
    await page.goto(`${base}/admin/users`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody").getByText("کاربر آزمایشی").first().waitFor({ timeout: 12000 });
    check(`admin account list renders mock profile (RPC ${missing ? "missing" : "available"})`, await page.locator("tbody").getByText("کاربر آزمایشی").first().isVisible());
    if (missing) check("missing migration exposes read-only notice", await page.getByText(/فهرست فعلی فقط‌خواندنی است/).isVisible());
    await context.close();
  }
  console.log(`\n${checks} UI checks passed with simulated sessions and data.`);
} finally {
  await browser.close();
}