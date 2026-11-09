import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Isolated database only: never connects to the configured Supabase project.
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const exec = async (sql) => db.exec(sql);
let passed = 0;
const check = (label, value) => { assert.ok(value, label); passed++; console.log(`PASS ${label}`); };
const denied = async (label, fn) => {
  let failed = false;
  try { await fn(); } catch { failed = true; }
  check(label, failed);
};
const asUser = async (id, fn) => {
  await exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
  try { return await fn(); }
  finally { await exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
};

await exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
  create schema storage;
  create table storage.buckets (id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(),bucket_id text,name text,owner uuid);
  create publication supabase_realtime;
  grant usage on schema auth, public to anon, authenticated, service_role;
`);

const dir = new URL("../supabase/migrations/", import.meta.url);
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql") && !f.includes("storage")).sort()) {
  const sql = (await readFile(new URL(file, dir), "utf8")).replace(/create extension[^;]*;/gi, "");
  await exec(sql);
  console.log(`PASS isolated migration ${file}`);
}
await exec(`grant select,update on public.profiles to authenticated;
  grant select,insert,update,delete on public.test_attempts,public.test_answers,public.test_results,public.support_messages,public.support_replies,public.psychologist_applications to authenticated;
  grant select on public.role_permissions to authenticated;`);

async function createUser(email, kind, username, phone) {
  const [{ id }] = await q("insert into auth.users(email,raw_user_meta_data) values ($1,$2) returning id", [email, { full_name: username }]);
  try {
    await q("update public.profiles set account_kind=$2,account_status='pending',username=$3,phone=$4,contact_verified_at=null,phone_verified_at=null where id=$1", [id, kind, username, phone]);
  } catch (error) {
    await q("delete from auth.users where id=$1", [id]);
    throw error;
  }
  return id;
}
const user = await createUser("user@example.test", "user", "User_One", "+98 912 000 0001");
const psych = await createUser("psych@example.test", "psychologist", "psych_one", "۰۹۱۲۰۰۰۰۰۰۲");
const support = await createUser("support@example.test", "support_specialist", "support_one", "00989120000003");
const admin = await createUser("admin@example.test", "user", "admin_one", "09120000004");
await q("update auth.users set email_confirmed_at=now() where id=$1", [admin]);
await q("update public.profiles set role='super_admin',account_status='active' where id=$1", [admin]);

const profiles = await q("select account_kind,role,phone,username from public.profiles where id=any($1::uuid[]) order by phone", [[user, psych, support]]);
check("all three public account kinds persisted without a management role", profiles.length === 3 && profiles.every((p) => !p.role) && new Set(profiles.map((p) => p.account_kind)).size === 3);
check("Persian and international phone formats normalize identically", profiles[0].phone === "09120000001" && profiles[1].phone === "09120000002" && profiles[2].phone === "09120000003");
check("username is normalized to lowercase", profiles[0].username === "user_one");
await denied("equivalent phone number cannot be registered twice", () => createUser("duplicate@example.test", "user", "duplicate", "+989120000001"));
await denied("case-insensitive duplicate username is rejected", () => createUser("duplicate2@example.test", "user", "USER_ONE", "09120000009"));
await denied("invalid phone rejected by database", () => q("update public.profiles set phone=$2 where id=$1", [psych, "123"]));

const hash = "a".repeat(64), wrong = "b".repeat(64);
const id1 = "10000000-0000-4000-8000-000000000001";
check("real challenge issued", (await q("select public.auth_issue_registration_otp($1,$2,$3,$4) ok", [user, id1, "09120000001", hash]))[0].ok);
check("resend cooldown enforced", !(await q("select public.auth_issue_registration_otp($1,$2,$3,$4) ok", [user, "10000000-0000-4000-8000-000000000002", "09120000001", hash]))[0].ok);
check("wrong OTP rejected", !(await q("select public.auth_consume_registration_otp($1,$2) ok", [id1, wrong]))[0].ok);
check("OTP attempt counter incremented", (await q("select attempts from public.auth_otps where id=$1", [id1]))[0].attempts === 1);
check("correct OTP accepted once", (await q("select public.auth_consume_registration_otp($1,$2) ok", [id1, hash]))[0].ok);
check("consumed OTP rejected", !(await q("select public.auth_consume_registration_otp($1,$2) ok", [id1, hash]))[0].ok);
let state = (await q("select p.account_status,p.contact_verified_at,u.email_confirmed_at from public.profiles p join auth.users u on u.id=p.id where p.id=$1", [user]))[0];
check("phone OTP never verifies email or activates unconfirmed email", state.account_status === "pending" && state.contact_verified_at && !state.email_confirmed_at);
await q("update auth.users set email_confirmed_at=now() where id=$1", [user]);
check("email and phone together activate ordinary user", (await q("select account_status from public.profiles where id=$1", [user]))[0].account_status === "active");

await q("update auth.users set email_confirmed_at=now() where id=$1", [psych]);
check("email alone does not activate psychologist", (await q("select account_status from public.profiles where id=$1", [psych]))[0].account_status === "pending");
const id2 = "20000000-0000-4000-8000-000000000002";
await q("select public.auth_issue_registration_otp($1,$2,$3,$4)", [psych, id2, "09120000002", hash]);
await q("select public.auth_consume_registration_otp($1,$2)", [id2, hash]);
check("verified psychologist becomes active", (await q("select account_status from public.profiles where id=$1", [psych]))[0].account_status === "active");

const id3 = "30000000-0000-4000-8000-000000000003";
await q("select public.auth_issue_registration_otp($1,$2,$3,$4)", [support, id3, "09120000003", hash]);
await q("select public.auth_consume_registration_otp($1,$2)", [id3, hash]);
await q("update auth.users set email_confirmed_at=now() where id=$1", [support]);
check("support specialist remains pending for administrator review", (await q("select account_status from public.profiles where id=$1", [support]))[0].account_status === "pending");

const expUser = await createUser("expiry@example.test", "user", "expiry_user", "09120000005");
const expId = "40000000-0000-4000-8000-000000000004";
await q("select public.auth_issue_registration_otp($1,$2,$3,$4)", [expUser, expId, "09120000005", hash]);
await q("update public.auth_otps set expires_at=now()-interval '1 second',created_at=now()-interval '1 minute' where id=$1", [expId]);
check("expired OTP rejected", !(await q("select public.auth_consume_registration_otp($1,$2) ok", [expId, hash]))[0].ok);
const retryId = "50000000-0000-4000-8000-000000000005";
check("new OTP may be issued after cooldown", (await q("select public.auth_issue_registration_otp($1,$2,$3,$4) ok", [expUser, retryId, "09120000005", hash]))[0].ok);
for (let i = 0; i < 5; i++) await q("select public.auth_consume_registration_otp($1,$2)", [retryId, wrong]);
check("correct OTP rejected after five wrong attempts", !(await q("select public.auth_consume_registration_otp($1,$2) ok", [retryId, hash]))[0].ok);
check("superseded OTP cannot be used", !(await q("select public.auth_consume_registration_otp($1,$2) ok", [expId, hash]))[0].ok);

await asUser(user, async () => {
  await denied("user cannot read OTP table", () => q("select * from public.auth_otps"));
  await denied("user cannot call OTP verifier", () => q("select public.auth_consume_registration_otp($1,$2)", [id1, hash]));
  await denied("user cannot change own role", () => q("update public.profiles set role='super_admin' where id=$1", [user]));
  await denied("user cannot change own kind", () => q("update public.profiles set account_kind='support_specialist' where id=$1", [user]));
  await denied("user cannot call admin search", () => q("select public.admin_search_accounts_hardening()"));
  await denied("user cannot manage another account", () => q("select public.admin_change_account_hardening($1,'user',null)", [psych]));
  await denied("user cannot call unguarded original test RPC", () => q("select public.start_test_attempt_before_auth_hardening($1)", [id1]));
});

let ticket;
await asUser(user, async () => {
  ticket = (await q("select public.support_create_ticket('پیام آزمایشی','پیام آزمایشی کاربر','general') id"))[0].id;
  check("user can see own ticket via guarded RPC", (await q("select * from public.support_my_tickets()"))[0].id === ticket);
});
await asUser(psych, async () => {
  check("other user cannot see ticket via RPC", (await q("select * from public.support_ticket_get($1)", [ticket])).length === 0);
  await denied("other user cannot reply to ticket", () => q("select public.support_user_reply($1,'متن')", [ticket]));
});
await asUser(admin, async () => {
  const matches = (await q("select public.admin_search_accounts_hardening('user_one','user','active',0,10) result"))[0].result;
  check("admin searches real profile by username", matches.total === 1 && matches.items[0].id === user);
  const phoneMatches = (await q("select public.admin_search_accounts_hardening('۹۱۲۰۰۰۰۰۰۱','','',0,10) result"))[0].result;
  check("admin searches Persian phone digits", phoneMatches.items.some((p) => p.id === user));
  const idMatches = (await q("select public.admin_search_accounts_hardening($1,'','',0,10) result", [user]))[0].result;
  check("admin searches by identifier", idMatches.total === 1);
  await q("select public.admin_change_account_hardening($1,null,'active')", [support]);
  check("admin can activate verified support specialist", (await q("select account_status from public.profiles where id=$1", [support]))[0].account_status === "active");
  await denied("admin cannot activate unverified account", () => q("select public.admin_change_account_hardening($1,null,'active')", [expUser]));
  await q("select public.admin_change_account_hardening($1,'psychologist',null)", [user]);
  check("admin can change account kind", (await q("select account_kind from public.profiles where id=$1", [user]))[0].account_kind === "psychologist");
  await q("select public.admin_change_account_hardening($1,null,'suspended')", [user]);
  await denied("administrator cannot change own role", () => q("select public.admin_change_admin_role_hardening($1,null)", [admin]));
});
await asUser(user, async () => {
  await denied("suspended account cannot access support RPC", () => q("select * from public.support_my_tickets()"));
  await denied("suspended account cannot use test RPC", () => q("select public.start_test_attempt($1)", [id1]));
  check("suspended account cannot update profile", (await q("update public.profiles set full_name='blocked' where id=$1 returning id", [user])).length === 0);
});
check("sensitive account changes leave audit entries", (await q("select count(*)::int n from public.audit_logs where action in ('account_kind_change','account_status_change')"))[0].n >= 3);
check("rate limiter allows first request", (await q("select public.auth_rate_hit('test:bucket',1,60) ok"))[0].ok);
check("rate limiter blocks subsequent request", !(await q("select public.auth_rate_hit('test:bucket',1,60) ok"))[0].ok);

console.log(`\n${passed} security checks passed on isolated Postgres. No live data was touched.`);
await db.close();