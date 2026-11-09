import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Exercises the real Edge Function against a local mock of Supabase HTTP APIs.
// The database and Auth service here are simulated; this is not a production test.
const users = new Map(), profiles = new Map(), challenges = new Map();
const requests = [];
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const requestBody = async (req) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
};
const findFilter = (search, key) => search.get(key)?.replace(/^eq\./, "") ?? null;
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  requests.push(`${req.method} ${url.pathname}`);
  const body = await requestBody(req);
  try {
    if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
      if ([...users.values()].some((u) => u.email === body.email)) return send(res, 422, { msg: "User already registered", code: "email_exists" });
      const id = randomUUID();
      users.set(id, { id, email: body.email, password: body.password, emailConfirmed: false });
      profiles.set(id, { id, email: body.email, role: null, account_kind: "user", account_status: "pending", phone: null, username: null, contact_verified_at: null });
      return send(res, 200, { id, email: body.email, aud: "authenticated", role: "authenticated", created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") {
      const id = url.pathname.split("/").at(-1); users.delete(id); profiles.delete(id); return send(res, 200, {});
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/") && req.method === "GET") {
      const user = users.get(url.pathname.split("/").at(-1));
      return user ? send(res, 200, { id: user.id, email: user.email }) : send(res, 404, { message: "not found" });
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const raw = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
      let sub = null;
      try { sub = JSON.parse(Buffer.from(raw.split(".")[1] ?? "", "base64url").toString()).sub; } catch { /* invalid token */ }
      const user = sub && users.get(sub);
      return user ? send(res, 200, { id: user.id, email: user.email, aud: "authenticated", app_metadata: {}, user_metadata: {} }) : send(res, 401, { message: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/resend") return send(res, 200, {});
    if (url.pathname === "/auth/v1/logout") return send(res, 200, {});
    if (url.pathname === "/auth/v1/token") {
      const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password && u.emailConfirmed);
      if (!user) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.signature`;
      return send(res, 200, { access_token: token, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user: { id: user.id, email: user.email, app_metadata: {}, user_metadata: {} } });
    }
    if (url.pathname === "/rest/v1/profiles") {
      const id = findFilter(url.searchParams, "id");
      if (req.method === "PATCH") {
        const p = profiles.get(id);
        if (!p) return send(res, 406, { code: "PGRST116", message: "not found" });
        if ([...profiles.values()].some((other) => other.id !== id && ((body.phone && body.phone === other.phone) || (body.username && body.username === other.username))))
          return send(res, 409, { code: "23505", message: "duplicate key" });
        Object.assign(p, body);
        return send(res, 200, { id });
      }
      const key = ["id", "phone", "username", "email"].find((k) => findFilter(url.searchParams, k));
      const value = key && findFilter(url.searchParams, key);
      const data = [...profiles.values()].filter((p) => !key || p[key] === value);
      return send(res, 200, req.headers.accept?.includes("application/vnd.pgrst.object") ? data[0] ?? null : data);
    }
    if (url.pathname === "/rest/v1/rpc/auth_rate_hit") return send(res, 200, true);
    if (url.pathname === "/rest/v1/rpc/auth_issue_registration_otp") {
      const p = profiles.get(body.p_user_id);
      if (!p || p.phone !== body.p_destination || p.contact_verified_at) return send(res, 200, false);
      for (const c of challenges.values()) if (c.userId === p.id) c.consumed = true;
      challenges.set(body.p_id, { userId: p.id, hash: body.p_hash, attempts: 0, expires: Date.now() + 120000, consumed: false });
      return send(res, 200, true);
    }
    if (url.pathname === "/rest/v1/rpc/auth_consume_registration_otp") {
      const c = challenges.get(body.p_id);
      if (!c || c.consumed || c.expires < Date.now() || c.attempts >= 5) return send(res, 200, false);
      if (c.hash !== body.p_hash) { c.attempts++; return send(res, 200, false); }
      c.consumed = true;
      const p = profiles.get(c.userId); p.contact_verified_at = new Date().toISOString();
      if (users.get(c.userId).emailConfirmed && p.account_kind !== "support_specialist") p.account_status = "active";
      return send(res, 200, true);
    }
    if (url.pathname === "/rest/v1/auth_otps" && req.method === "PATCH") return send(res, 204);
    return send(res, 404, { error: "mock_unhandled" });
  } catch {
    return send(res, 500, { error: "mock_error" });
  }
});

const seeded = {
  testUser: { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "testuser01@example.com", kind: "user" },
  testSpecialist: { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "testspecialist01@example.com", kind: "support_specialist" },
  wrongKind: { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "testpsychologist01@example.com", kind: "user" },
  ordinary: { id: "aaaaaaaa-0000-4000-8000-000000000004", email: "phoneless@example.test", kind: "user" },
  notListed: { id: "aaaaaaaa-0000-4000-8000-000000000005", email: "testpsychologist01@example.com", kind: "psychologist" },
};
for (const a of Object.values(seeded)) {
  users.set(a.id, { id: a.id, email: a.email, password: "Testing123", emailConfirmed: true });
  profiles.set(a.id, { id: a.id, email: a.email, role: null, account_kind: a.kind, account_status: "active", phone: null, username: null, contact_verified_at: null });
}
// notListed uses a real test e-mail but its UUID is deliberately NOT in the allowlist
const seededCount = profiles.size;
const exemptIds = [seeded.testUser.id, seeded.testSpecialist.id, seeded.wrongKind.id].join(",");
const tokenFor = (id) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;

await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const address = mock.address();
const deno = process.env.DENO_BIN ?? "deno";
let proc, output = "", passed = 0;
const wait = async (condition, timeout = 30000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (condition()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("Edge Function did not become ready");
};
const check = (label, value) => { assert.ok(value, label); passed++; console.log(`PASS ${label}`); };
const start = async (environment, exempt = exemptIds) => {
  output = "";
  proc = spawn(deno, ["run", "--allow-env", "--allow-net", "--no-lock", "--node-modules-dir=none", "supabase/functions/auth-gateway/index.ts"], {
    env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_ANON_KEY: "local-anon", SUPABASE_SERVICE_ROLE_KEY: "local-service-only", OTP_PEPPER: "local-test-pepper", APP_ENV: environment, OTP_PROVIDER: "console", PHONE_EXEMPT_TEST_ACCOUNT_IDS: exempt },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (data) => { output += data.toString(); });
  proc.stderr.on("data", (data) => { output += data.toString(); });
  await wait(() => output.includes("Listening on") || proc.exitCode !== null);
  if (proc.exitCode !== null) throw new Error("Edge process exited before listening");
};
const stop = async () => {
  if (!proc || proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  await new Promise((resolve) => proc.once("exit", resolve));
};
const call = async (data, token) => {
  const res = await fetch("http://127.0.0.1:8000/", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
  return { status: res.status, body: await res.json() };
};
const otpCodes = () => [...output.matchAll(/کد:\s*(\d{6})/g)].map((match) => match[1]);
const register = async (kind, n) => call({ action: "register", kind, fullName: "Test User", email: `person${n}@example.test`, phone: `0912000000${n}`, username: `person_${n}`, password: "Testing123" });

try {
  await start("development");
  for (const [index, kind] of ["user", "psychologist", "support_specialist"].entries()) {
    const result = await register(kind, index + 1);
    check(`registration ${kind} creates a real mock Auth user and challenge`, result.status === 200 && profiles.size === seededCount + index + 1 && challenges.has(result.body.challenge));
    check(`registration ${kind} does not return OTP or password`, !JSON.stringify(result.body).includes("Testing123") && !Object.hasOwn(result.body, "code"));
  }
  await wait(() => otpCodes().length === 3);
  check("development OTP appears in backend output", otpCodes().length === 3);
  const [firstChallenge, secondChallenge, thirdChallenge] = [...challenges.keys()];
  const codes = otpCodes();
  const wrongCode = codes[0] === "000000" ? "111111" : "000000";
  check("incorrect OTP rejected", (await call({ action: "verify", challenge: firstChallenge, code: wrongCode })).status === 400);
  check("correct OTP accepted", (await call({ action: "verify", challenge: firstChallenge, code: codes[0] })).status === 200);
  check("OTP replay rejected", (await call({ action: "verify", challenge: firstChallenge, code: codes[0] })).status === 400);
  challenges.get(secondChallenge).expires = Date.now() - 1;
  check("expired OTP rejected", (await call({ action: "verify", challenge: secondChallenge, code: codes[1] })).status === 400);
  check("support OTP accepted", (await call({ action: "verify", challenge: thirdChallenge, code: codes[2] })).status === 200);
  const person1 = [...users.values()].find((u) => u.email === "person1@example.test");
  check("phone verification never marks email verified", !person1.emailConfirmed);
  const before = users.size;
  const conflict = await call({ action: "register", kind: "user", fullName: "Duplicate", email: "another@example.test", phone: "+989120000001", username: "another_user", password: "Testing123" });
  if (conflict.status !== 409 || users.size !== before) console.log("Duplicate test diagnostic:", conflict.status, conflict.body.error, "accounts before/after", before, users.size, requests.slice(-8));
  check("duplicate normalized phone returns conflict and rolls back account", conflict.status === 409 && users.size === before);
  const conflict2 = await call({ action: "register", kind: "user", fullName: "Duplicate", email: "other@example.test", phone: "09120000009", username: "PERSON_1", password: "Testing123" });
  check("duplicate case-insensitive username returns conflict", conflict2.status === 409 && users.size === before);
  person1.emailConfirmed = true; profiles.get(person1.id).account_status = "active";
  const byName = await call({ action: "login", identifier: "person_1", password: "Testing123" });
  const byPhone = await call({ action: "login", identifier: "+989120000001", password: "Testing123" });
  check("username and normalized phone login return a session", byName.status === 200 && byPhone.status === 200 && Boolean(byName.body.session?.access_token));
  check("invalid login response does not identify the account", (await call({ action: "login", identifier: "person_1", password: "wrong" })).status === 401);
  profiles.get(person1.id).account_status = "suspended";
  const suspended = await call({ action: "login", identifier: "person_1", password: "Testing123" });
  check("suspended account is not returned a session", suspended.status === 403 && !suspended.body.session);
  const status = async (id) => (await call({ action: "session_status" }, tokenFor(id))).body.phoneVerificationRequired;
  check("allowlisted test user (correct e-mail + kind) is exempt from phone verification", (await status(seeded.testUser.id)) === false);
  check("allowlisted support-specialist test account is exempt", (await status(seeded.testSpecialist.id)) === false);
  check("allowlisted UUID with mismatched account_kind is NOT exempt", (await status(seeded.wrongKind.id)) === true);
  check("ordinary phoneless account still requires verification", (await status(seeded.ordinary.id)) === true);
  check("test e-mail whose UUID is not allowlisted is NOT exempt", (await status(seeded.notListed.id)) === true);
  check("session_status without a token is rejected", (await call({ action: "session_status" })).status === 401);
  check("session_status with forged/unknown subject is rejected", (await call({ action: "session_status" }, tokenFor("aaaaaaaa-0000-4000-8000-0000000000ff"))).status === 401);
  check("client-supplied exemption flag is ignored", (await call({ action: "session_status", is_test_user: true, phoneVerificationRequired: false }, tokenFor(seeded.ordinary.id))).body.phoneVerificationRequired === true);
  const exemptLogin = await call({ action: "login", identifier: "testuser01@example.com", password: "Testing123" });
  check("exempt test account logs in through gateway with correct password", exemptLogin.status === 200 && Boolean(exemptLogin.body.session?.access_token));
  check("exempt test account still needs the correct password", (await call({ action: "login", identifier: "testuser01@example.com", password: "Wrong1234" })).status === 401);
  check("ordinary phoneless account is still refused a session", (await call({ action: "login", identifier: "phoneless@example.test", password: "Testing123" })).status === 403);
  const otpCountBefore = otpCodes().length;
  const exemptResend = await call({ action: "resend" }, tokenFor(seeded.testUser.id));
  check("exempt test account never enters the SMS/OTP path", exemptResend.body.error === "verification_not_required" && otpCodes().length === otpCountBefore);
  check("ordinary phoneless account keeps the original no_phone response", (await call({ action: "resend" }, tokenFor(seeded.ordinary.id))).body.error === "no_phone");
  await stop();
  await start("development", [seeded.testUser.id, seeded.testSpecialist.id, seeded.wrongKind.id, seeded.notListed.id].join(","));
  check("misconfigured allowlist (more than three IDs) grants no exemption", (await status(seeded.testUser.id)) === true);
  await stop();
  await start("development", "not-a-uuid");
  check("invalid allowlist value grants no exemption", (await status(seeded.testUser.id)) === true);
  await stop();
  await start("production", "");
  check("missing allowlist secret grants no exemption", (await status(seeded.testUser.id)) === true);
  const count = users.size;
  const prod = await register("user", 8);
  check("production without SMS provider fails closed before account creation", prod.status === 503 && users.size === count);
  check("production does not log OTP", !output.includes("[DEV-OTP]"));
  console.log(`\n${passed} checks passed with a mocked local backend, not live Supabase.`);
} finally {
  await stop();
  await new Promise((resolve) => mock.close(resolve));
}