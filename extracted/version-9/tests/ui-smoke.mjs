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

async function setup(role, width = 1440, missingRpc = false, initialSession = true, opts = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fa-IR" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const profile = { id: uid, email: "test@example.test", full_name: "کاربر آزمایشی", avatar_url: null,
    role: role === "admin" ? "super_admin" : null, account_status: "active", account_kind: role === "admin" ? "user" : role,
    username: "tester", phone: "09120000000", phone_verified_at: "2026-01-01T00:00:00Z", contact_verified_at: "2026-01-01T00:00:00Z",
    last_seen_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", email_verified_at: "2026-01-01T00:00:00Z", ...(opts.profile ?? {}) };
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
    if (url.pathname.includes("/functions/v1/auth-gateway")) {
      const action = route.request().method() === "POST" ? route.request().postDataJSON()?.action : null;
      if (action === "session_status" && opts.sessionStatus !== undefined) return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true, phoneVerificationRequired: opts.sessionStatus }) });
      if (action === "resend" && opts.resend) return route.fulfill({ status: 400, headers, body: JSON.stringify(opts.resend) });
      return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: "NOT_FOUND" }) });
    }
    if (opts.rpc && url.pathname.includes("/rpc/")) {
      const name = url.pathname.split("/rpc/")[1];
      if (name in opts.rpc) {
        const out = opts.rpc[name];
        if (out && out.__error) return route.fulfill({ status: out.status ?? 400, headers, body: JSON.stringify({ code: "P0001", message: out.__error }) });
        return route.fulfill({ status: 200, headers, body: JSON.stringify(out) });
      }
    }
    if (opts.tables && url.pathname.includes("/rest/v1/")) {
      const table = url.pathname.split("/rest/v1/")[1];
      if (table in opts.tables) {
        let rows = opts.tables[table];
        for (const [col, val] of url.searchParams) if (typeof val === "string" && val.startsWith("eq.")) rows = rows.filter((r) => String(r[col]) === val.slice(3));
        return route.fulfill({ status: 200, headers: { ...headers, "content-range": `0-0/${rows.length}` }, body: JSON.stringify(rows) });
      }
    }
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
  // حساب بدون شماره: تصمیم معافیت فقط از پاسخ سرور (session_status) می‌آید
  const phoneless = { phone: null, username: null, phone_verified_at: null, contact_verified_at: null };
  for (const [role, path, expected] of [["user", "/account", "/account"], ["support_specialist", "/desk", "/desk"], ["psychologist", "/pro", "/pro"]]) {
    const { page, context } = await setup(role, 1440, false, true, { profile: phoneless, sessionStatus: false });
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    check(`server-exempt phoneless ${role} reaches ${expected} without /verify`, new URL(page.url()).pathname === expected);
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, true, { profile: phoneless, sessionStatus: true, resend: { error: "no_phone", message: "برای این حساب شماره‌ی موبایلی ثبت نشده است." } });
    await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/verify", { timeout: 12000 });
    check("non-exempt phoneless user is still sent to /verify", new URL(page.url()).pathname === "/verify");
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, true, { profile: phoneless });
    await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/verify", { timeout: 12000 });
    check("unreachable/old gateway fails closed (phoneless user sent to /verify)", new URL(page.url()).pathname === "/verify");
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, false, { profile: phoneless, sessionStatus: false });
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("ایمیل، موبایل یا نام کاربری").fill("test@example.test");
    await page.getByLabel("رمز عبور").fill("Testing123");
    await page.getByRole("button", { name: "ورود", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/account", { timeout: 12000 });
    check("server-exempt phoneless account logs in and lands on its dashboard", new URL(page.url()).pathname === "/account");
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

  // ═══ بهبود فردی ═══
  const metrics = (over = {}) => ({ total: 4, completed: 1, skipped: 0, required_total: 3, required_completed: 1, percent: 25, due_total: 2, due_completed: 1, adherence: 50, day_index: 1, planned_days: 3, ...over });
  const activePlan = { id: "p1", path_id: "pa1", title: "آرام‌سازی سه‌روزه", goal: "کاهش تنش روزانه", status: "active", started_at: "2026-11-08T08:00:00Z", planned_end_date: "2026-11-10", completed_at: null, metrics: metrics(),
    today: [{ id: "a1", title: "نوشتن افکار", status: "not_started", duration_minutes: 5, exercise_type: "reflection", is_required: true }], overdue: [], overdue_count: 0 };
  const rec = { id: "r1", attempt_id: "22222222-2222-4222-8222-222222222222", path_id: "pa2", title: "خواب بهتر", description: "برنامه‌ی کوتاه", goal: "بهبود عادت‌های خواب", duration_days: 5, reason: "بر اساس نمره‌ی بعد خلق شما", strength: "suggested", status: "suggested", plan_id: null };
  for (const width of [390, 1440]) {
    const { page, context, errors } = await setup("user", width, false, true, { sessionStatus: false, rpc: { my_improvement_overview: { active_plan: activePlan, plans: [activePlan] }, my_path_recommendations: [rec] } });
    await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
    await page.getByText("مسیر فعال", { exact: true }).waitFor({ timeout: 12000 });
    check(`dashboard shows the real active plan title and progress at ${width}px`, await page.getByText("آرام‌سازی سه‌روزه").first().isVisible() && await page.getByText("۲۵٪ تکمیل").first().isVisible());
    check(`dashboard lists today's activity and a suggested path at ${width}px`, await page.getByText("نوشتن افکار").isVisible() && await page.getByText("خواب بهتر").isVisible() && await page.getByText(/دلیل پیشنهاد/).isVisible());
    check(`improvement dashboard does not overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 1440) {
      const radii = await page.evaluate(() => {
        const px = (sel) => { const el = document.querySelector(sel); return el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) : null; };
        return { card: px(".card-glass"), r2xl: px(".rounded-2xl") };
      });
      check("site radius is 90% of before: card-glass 25.2px (was 28px)", Math.abs(radii.card - 25.2) < 0.05);
      check("site radius is 90% of before: rounded-2xl 14.4px (was 16px)", Math.abs(radii.r2xl - 14.4) < 0.05);
    }
    check(`no runtime errors on the improvement dashboard at ${width}px`, errors.length === 0);
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, true, { sessionStatus: false, rpc: { my_improvement_overview: { active_plan: null, plans: [] }, my_path_recommendations: [] } });
    await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
    await page.getByText("مسیر فعالی ندارید").waitFor({ timeout: 12000 });
    check("no active plan shows an honest empty state (no fake percentage)", !(await page.getByText(/٪ تکمیل/).count()));
    await context.close();
  }
  {
    const detail = { id: "pa2", title: "خواب بهتر", description: "توضیح", goal: "هدف", duration_days: 5, version: 1, steps: [{ id: "s1", day_number: 1, title: "شروع", description: null, activities: [{ title: "چک‌لیست خواب", goal: null, duration_minutes: 5, exercise_type: "checklist", is_required: true, suggested_time: "شب" }] }] };
    const { page, context } = await setup("user", 1440, false, true, { sessionStatus: false, rpc: { get_improvement_path_detail: detail, start_improvement_plan: "p9", my_improvement_overview: { active_plan: null, plans: [{ ...activePlan, id: "p9", title: "خواب بهتر", status: "active" }] } } });
    await page.goto(`${base}/account/paths/pa2?attempt=22222222-2222-4222-8222-222222222222`, { waitUntil: "domcontentloaded" });
    await page.getByText("چک‌لیست خواب").waitFor({ timeout: 12000 });
    check("path detail shows its steps and activities from the server", await page.getByText("روز ۱: شروع").isVisible());
    await page.getByRole("button", { name: /شروع این مسیر/ }).click();
    await page.waitForURL((u) => u.pathname === "/account/plans/p9", { timeout: 12000 });
    check("starting a path creates a plan and opens it", new URL(page.url()).pathname === "/account/plans/p9");
    await context.close();
  }
  {
    const { page, context } = await setup("user", 1440, false, true, { sessionStatus: false, rpc: { start_improvement_plan: { __error: "ابتدا مسیر فعال فعلی را متوقف یا تکمیل کنید", status: 400 }, get_improvement_path_detail: { id: "pa2", title: "خواب بهتر", description: null, goal: null, duration_days: 5, version: 1, steps: [] } } });
    await page.goto(`${base}/account/paths/pa2`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /شروع این مسیر/ }).click();
    await page.getByRole("alert").waitFor({ timeout: 12000 });
    check("server refusal (one active plan only) is shown to the user", await page.getByRole("alert").getByText(/مسیر فعال فعلی/).isVisible());
    await context.close();
  }
  {
    const act = { id: "a1", plan_id: "p1", title: "نوشتن افکار", goal: "آگاهی", instructions: "هر آنچه ذهنت را درگیر کرده بنویس و بخوان.", duration_minutes: 5, exercise_type: "reflection", content: { prompt: "امروز چه شد؟" }, response_required: true, is_required: true, status: "in_progress", response: null, user_note: null, completed_at: null };
    const { page, context } = await setup("user", 1440, false, true, { sessionStatus: false, tables: { user_plan_activities: [act], user_improvement_plans: [{ status: "active" }] }, rpc: { begin_plan_activity: null, complete_plan_activity: metrics({ completed: 2, percent: 50 }) } });
    await page.goto(`${base}/account/plans/p1/activities/a1`, { waitUntil: "domcontentloaded" });
    await page.getByText("امروز چه شد؟").waitFor({ timeout: 12000 });
    const submit = page.getByRole("button", { name: /ثبت و تکمیل تمرین/ });
    check("required reflection cannot be submitted empty (button disabled)", await submit.isDisabled());
    await page.locator("textarea").first().fill("امروز درباره‌ی فشار کار فکر کردم و کمی آرام شدم.");
    check("button enables only after a real answer", await submit.isEnabled());
    await submit.click();
    await page.getByText(/پیشرفت برنامه: ۵۰٪/).waitFor({ timeout: 12000 });
    check("completion shows server-computed progress", await page.getByText(/پیشرفت برنامه: ۵۰٪/).isVisible());
    await context.close();
  }
  {
    const done = { id: "a1", plan_id: "p1", title: "نوشتن افکار", goal: null, instructions: "دستورالعمل کامل تمرین برای نمایش.", duration_minutes: 5, exercise_type: "reflection", content: {}, response_required: true, is_required: true, status: "completed", response: { text: "پاسخ ذخیره‌شده‌ی قبلی من" }, user_note: "یادداشت قبلی", completed_at: "2026-11-08T09:00:00Z" };
    const { page, context } = await setup("user", 1440, false, true, { sessionStatus: false, tables: { user_plan_activities: [done], user_improvement_plans: [{ status: "active" }] } });
    await page.goto(`${base}/account/plans/p1/activities/a1`, { waitUntil: "domcontentloaded" });
    await page.getByText("این تمرین تکمیل شده است").waitFor({ timeout: 12000 });
    check("reopening a completed activity shows the saved answer read-only", await page.locator("textarea").first().inputValue() === "پاسخ ذخیره‌شده‌ی قبلی من" && await page.locator("textarea").first().isDisabled());
    await context.close();
  }
  {
    const row = (id, v, score, at) => ({ attempt_id: id, test_id: "t1", version_id: v, total_score: score, min_score: 0, max_score: 40, dimension_scores: { anx: score / 2 }, computed_at: at });
    const { page, context } = await setup("user", 390, false, true, { sessionStatus: false,
      tables: { test_results: [row("x1", "v1", 20, "2026-10-01T10:00:00Z"), row("x2", "v1", 14, "2026-11-01T10:00:00Z"), row("x3", "v2", 9, "2026-11-05T10:00:00Z")], test_versions: [{ id: "v1", version_label: "۱" }, { id: "v2", version_label: "۲" }] },
      rpc: { my_improvement_overview: { active_plan: null, plans: [{ ...activePlan, status: "completed" }] } } });
    await page.goto(`${base}/account/progress`, { waitUntil: "domcontentloaded" });
    await page.getByText("مقایسه‌ی نتایج آزمون‌های مشابه").waitFor({ timeout: 12000 });
    check("same-version results are compared with a computed change (-6)", await page.getByText(/تغییر نمره:.{0,3}۶/).isVisible());
    check("results from another version are never mixed into the comparison", await page.getByText(/برای مقایسه، حداقل دو نتیجه از همین نسخه لازم است/).isVisible());
    check("progress report warns that the test has several versions", await page.getByText(/در چند نسخه انجام شده/).first().isVisible());
    check("progress report does not overflow at 390px", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await context.close();
  }
  {
    const pathRow = (id, title, status) => ({ id, title, description: null, goal: null, topic: "calm", user_description: null, duration_days: 3, status, version: status === "published" ? 1 : 0, sort_order: 0, exclusive_group: null, published_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" });
    const { page, context } = await setup("admin", 1440, false, true, { tables: {
      improvement_paths: [pathRow("pa1", "آرام‌سازی سه‌روزه", "published"), pathRow("pa2", "مسیر پیش‌نویس", "draft")],
      improvement_exercises: [{ id: "e1", title: "نوشتن افکار", description: null, goal: null, category: "calm", instructions: "دستورالعمل کامل تمرین", duration_minutes: 5, exercise_type: "reflection", content: {}, response_required: true, status: "published", version: 2, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }],
      tests: [{ id: "t1", title_fa: "سنجش استرس" }],
      improvement_recommendation_rules: [{ id: "ru1", title: "استرس بالا", test_id: "t1", version_id: null, condition_mode: "all", conditions: [{ metric: "total", op: "gte", value: 10 }], path_id: "pa1", priority: 100, strength: "suggested", is_active: true, admin_note: null, user_note: null, updated_at: "2026-11-01T00:00:00Z" }] },
      rpc: { admin_test_recommendation_rules: { entries: [{ rule_id: "ru1", rule_title: "استرس بالا", priority: 100, strength: "suggested", is_active: true, path_id: "pa1", path_title: "آرام‌سازی سه‌روزه", path_status: "published", matched: true, outcome: "suggested", details: [{ type: "condition", label: "نمره‌ی کل", metric: "total", op: "gte", expected: 10, actual: 12, passed: true }] }], suggested: [{ path_id: "pa1", rank: 1 }] },
        admin_improvement_overview: { period_days: 30, paths: { total: 2, published: 1, draft: 1, archived: 0 }, exercises: { total: 1, published: 1 }, rules: { total: 1, active: 1 }, plans: { started_total: 3, started_period: 2, active: 1, completed: 1, paused: 0, cancelled: 1, completion_rate: 33 }, activities: { assigned: 6, completed: 2, completed_period: 2, completion_rate: 33 }, popular_paths: [{ path_id: "pa1", title: "آرام‌سازی سه‌روزه", plans: 3, completed: 1 }], popular_exercises: [], dropoff: [] } } });
    await page.goto(`${base}/admin/improvement/paths`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody").getByText("آرام‌سازی سه‌روزه").first().waitFor({ timeout: 12000 });
    check("admin path list renders real rows with statuses", await page.locator("tbody").getByText("مسیر پیش‌نویس").first().isVisible());
    await page.getByRole("button", { name: "ویرایش آرام‌سازی سه‌روزه" }).first().click();
    await page.getByText(/این مسیر منتشرشده و فقط‌خواندنی است/).waitFor({ timeout: 12000 });
    check("published path opens read-only with an explanation", await page.getByRole("button", { name: /بازگشت به پیش‌نویس برای ویرایش/ }).isVisible());
    await page.goto(`${base}/admin/improvement/exercises`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody").getByText("نوشتن افکار").first().waitFor({ timeout: 12000 });
    check("admin exercise bank lists exercises with version", await page.getByText(/نسخه‌ی ۲/).first().isVisible());
    await page.goto(`${base}/admin/improvement/rules`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody").getByText("استرس بالا").first().waitFor({ timeout: 12000 });
    await page.locator("select:has(option:text(\"سنجش استرس\"))").first().selectOption("t1");
    await page.getByRole("button", { name: "اجرای آزمایش" }).click();
    await page.getByText("پیشنهاد می‌شود", { exact: true }).waitFor({ timeout: 12000 });
    check("rule tester explains matched conditions with actual values", await page.getByText(/نمره‌ی کل بزرگ‌تر یا مساوی 10 \(مقدار: 12\)/).isVisible());
    await page.getByRole("button", { name: /قاعده‌ی جدید/ }).click();
    check("rule builder offers AND/OR and nested groups", await page.getByRole("button", { name: /گروه شرط/ }).isVisible() && await page.getByLabel("حالت ترکیب").first().isVisible());
    await page.goto(`${base}/admin/improvement/stats`, { waitUntil: "domcontentloaded" });
    await page.getByText("محبوب‌ترین مسیرها").waitFor({ timeout: 12000 });
    check("admin stats page shows real aggregate numbers", await page.getByText("۳۳٪").first().isVisible());
    await context.close();
  }
  {
    const { page, context } = await setup("user");
    await page.goto(`${base}/admin/improvement/rules`, { waitUntil: "domcontentloaded" });
    await page.getByText("دسترسی مدیریتی فعال نیست").waitFor({ timeout: 12000 });
    check("ordinary user cannot reach improvement management pages", await page.getByText("دسترسی مدیریتی فعال نیست").isVisible());
    await context.close();
  }
  {
    const { page, context } = await setup("psychologist");
    await page.goto(`${base}/account/progress`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/pro", { timeout: 12000 });
    check("psychologist panel is untouched: improvement pages redirect it to /pro", new URL(page.url()).pathname === "/pro");
    await context.close();
  }
  console.log(`\n${checks} UI checks passed with simulated sessions and data.`);
} finally {
  await browser.close();
}