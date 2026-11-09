import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Isolated in-memory Postgres only. Never touches the configured Supabase project.
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const exec = async (sql) => db.exec(sql);
let passed = 0;
const check = (label, value) => { assert.ok(value, `FAILED: ${label}`); passed++; console.log(`PASS ${label}`); };
const denied = async (label, fn, pattern) => {
  let message = null;
  try { await fn(); } catch (e) { message = String(e.message ?? e); }
  check(label, message !== null && (!pattern || pattern.test(message)));
};
const as = async (id, fn, role = "authenticated") => {
  await exec(`set role ${role}; select set_config('request.jwt.claim.sub','${id ?? ""}',false)`);
  try { return await fn(); } finally { await exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
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
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && !f.includes("storage")).sort();
for (const file of files) {
  await exec((await readFile(new URL(file, dir), "utf8")).replace(/create extension[^;]*;/gi, ""));
}
check(`all ${files.length} migrations (including improvement paths) apply on an empty database`, files.includes("20261111000000_improvement_paths.sql"));
await exec(await readFile(new URL("20261111000000_improvement_paths.sql", dir), "utf8"));
check("improvement migration is idempotent (second run succeeds)", true);
await exec(`grant select,update on public.profiles to authenticated;
  grant select,insert,update,delete on public.test_attempts,public.test_answers,public.test_results to authenticated;
  grant select on public.role_permissions to authenticated;`);

// ── users ──
async function makeUser(email, kind, username, phone, active = true) {
  const [{ id }] = await q("insert into auth.users(email,raw_user_meta_data) values ($1,$2) returning id", [email, { full_name: username }]);
  await q("update public.profiles set account_kind=$2, username=$3, phone=$4 where id=$1", [id, kind, username, phone]);
  if (active) await q("update public.profiles set account_status='active', contact_verified_at=now(), phone_verified_at=now() where id=$1", [id]);
  return id;
}
const admin = await makeUser("admin@example.test", "user", "admin_one", "09120000001");
await q("update public.profiles set role='super_admin' where id=$1", [admin]);
const userA = await makeUser("a@example.test", "user", "user_a", "09120000002");
const userB = await makeUser("b@example.test", "user", "user_b", "09120000003");
const pendingUser = await makeUser("c@example.test", "user", "user_c", "09120000004", false);

// ── a published test with a real snapshot (4 questions, 2 dimensions) ──
const [{ id: testId }] = await q(`insert into public.tests (slug,title_fa,status,review_status,published_at) values ('stress-check','سنجش استرس','published','approved',now()) returning id`);
const [{ id: otherTestId }] = await q(`insert into public.tests (slug,title_fa,status,review_status,published_at) values ('other-test','آزمون دیگر','published','approved',now()) returning id`);
const mkQuestion = (dimension, order) => ({
  id: randomUUID(), type: "likert", is_required: true, dimension, sort_order: order, prompt: `سؤال ${order}`,
  options: [0, 1, 2, 3, 4, 5].map((s) => ({ id: randomUUID(), label: String(s), score: s, sort_order: s })),
});
const qs = [mkQuestion("anx", 1), mkQuestion("anx", 2), mkQuestion("mood", 3), mkQuestion("mood", 4)];
const [{ id: versionId }] = await q(
  `insert into public.test_versions (test_id,version_label,status,scoring_rules,snapshot,published_at) values ($1,'v1','published','{"method":"sum"}'::jsonb,$2,now()) returning id`,
  [testId, { questions: qs, interpretations: [] }]
);
const [{ id: otherVersionId }] = await q(`insert into public.test_versions (test_id,version_label,status,scoring_rules,snapshot,published_at) values ($1,'v1','published','{"method":"sum"}'::jsonb,$2,now()) returning id`, [otherTestId, { questions: [], interpretations: [] }]);

async function takeTest(user, scoreEach) {
  return as(user, async () => {
    const [{ start_test_attempt: attempt }] = await q("select public.start_test_attempt($1)", [testId]);
    for (const question of qs) {
      const option = question.options.find((o) => o.score === scoreEach[question.dimension]);
      await q("select public.save_test_answer($1,$2,$3::uuid[])", [attempt, question.id, [option.id]]);
    }
    const [res] = await q("select * from public.complete_test_attempt($1)", [attempt]);
    return { attempt, res };
  });
}

// ═══ 1) staff-only management ═══
await denied("ordinary user cannot create an exercise (RLS)", () => as(userA, () => q(
  `insert into public.improvement_exercises (title,instructions,exercise_type) values ('تمرین غیرمجاز','دستورالعمل کافی برای تمرین','reflection')`)));
await denied("ordinary user cannot create a path", () => as(userA, () => q(`insert into public.improvement_paths (title,duration_days) values ('مسیر غیرمجاز',3)`)));
await denied("ordinary user cannot create a rule", () => as(userA, () => q(
  `insert into public.improvement_recommendation_rules (title,test_id,conditions,path_id) values ('x',$1,'[]',gen_random_uuid())`, [testId])));
check("ordinary user sees no staff-managed rows", (await as(userA, () => q("select (select count(*) from public.improvement_paths)::int + (select count(*) from public.improvement_exercises)::int as n")))[0].n === 0);

const ex = {};
await as(admin, async () => {
  const mk = async (key, title, type, content, required) => {
    const [{ id, status }] = await q(
      `insert into public.improvement_exercises (title,goal,instructions,exercise_type,content,response_required,duration_minutes,status,category)
       values ($1,'هدف تمرین','این دستورالعمل کامل تمرین برای اجرای روزانه است',$2,$3,$4,5,'published','calm') returning id,status`,
      [title, type, content, required]);
    ex[key] = id;
    return status;
  };
  const forced = await mk("write", "نوشتن افکار", "reflection", { prompt: "امروز چه چیزی ذهنت را درگیر کرد؟" }, true);
  check("exercise created by staff is forced to draft (publish is a separate step)", forced === "draft");
  await mk("list", "چک‌لیست آرام‌سازی", "checklist", { items: ["نفس عمیق", "نوشیدن آب", "قدم‌زدن کوتاه"] }, false);
  await mk("rate", "ثبت حال امروز", "rating", { min: 1, max: 5, low_label: "بد", high_label: "عالی" }, true);
  await mk("extra", "تمرین اضافه", "reflection", {}, false);
  await q("update public.improvement_exercises set status='published'");
});
check("exercises can be published afterwards", (await q("select count(*)::int n from public.improvement_exercises where status='published'"))[0].n === 4);
await denied("checklist without items is rejected", () => as(admin, () => q(`insert into public.improvement_exercises (title,instructions,exercise_type,content) values ('چک‌لیست خالی','دستورالعمل کافی برای تمرین','checklist','{"items":[]}')`)), /چک‌لیست/);
await denied("rating scale wider than 10 options is rejected", () => as(admin, () => q(`insert into public.improvement_exercises (title,instructions,exercise_type,content) values ('مقیاس بزرگ','دستورالعمل کافی برای تمرین','rating','{"min":1,"max":20}')`)), /امتیازدهی/);

// ═══ 2) paths: draft → validation → publish → read-only ═══
const paths = {};
await as(admin, async () => {
  const mk = async (key, title, days, group, order) => {
    const [{ id, status, version }] = await q(`insert into public.improvement_paths (title,goal,description,duration_days,exclusive_group,sort_order,status,version) values ($1,'هدف مسیر','توضیح مسیر',$2,$3,$4,'published',9) returning id,status,version`, [title, days, group, order]);
    paths[key] = id;
    return { status, version };
  };
  const forced = await mk("calm", "آرام‌سازی سه‌روزه", 3, "stress", 1);
  check("path insert by staff is forced to draft with version 0 (client cannot pre-publish)", forced.status === "draft" && forced.version === 0);
  await mk("calm2", "مسیر جایگزین استرس", 3, "stress", 2);
  await mk("sleep", "خواب بهتر", 2, null, 3);
  await mk("empty", "مسیر خالی", 2, null, 4);
  await mk("hidden", "مسیر پیش‌نویس", 2, null, 5);
});
const addStep = (path, day, title) => as(admin, async () => (await q("insert into public.improvement_path_steps (path_id,day_number,title) values ($1,$2,$3) returning id", [path, day, title]))[0].id);
const addAct = (step, exercise, required = true, order = 0) => as(admin, () => q("insert into public.improvement_path_activities (step_id,exercise_id,is_required,sort_order,suggested_time) values ($1,$2,$3,$4,'صبح')", [step, exercise, required, order]));

await denied("step day beyond path duration is rejected", () => addStep(paths.calm, 9, "روز نهم"), /مدت مسیر/);
const s1 = await addStep(paths.calm, 1, "روز اول: آگاهی");
const s2 = await addStep(paths.calm, 2, "روز دوم: آرام‌سازی");
await addAct(s1, ex.write, true, 1);
await addAct(s1, ex.rate, false, 2);
await addAct(s2, ex.list, true, 1);
for (const key of ["calm2", "sleep"]) {
  const s = await addStep(paths[key], 1, "روز اول");
  await addAct(s, ex.extra, true);
}
await addStep(paths.empty, 1, "مرحله‌ی خالی");
await denied("direct UPDATE to status=published is refused (must use publish RPC)", () => as(admin, () => q("update public.improvement_paths set status='published' where id=$1", [paths.calm])), /انتشار/);
await denied("path with a step lacking activities cannot be published", () => as(admin, () => q("select public.set_improvement_path_status($1,'published')", [paths.empty])), /بدون فعالیت|مرحله/);
await denied("ordinary user cannot publish a path", () => as(userA, () => q("select public.set_improvement_path_status($1,'published')", [paths.calm])));
for (const key of ["calm", "calm2", "sleep"]) await as(admin, () => q("select public.set_improvement_path_status($1,'published')", [paths[key]]));
let v = (await q("select status,version from public.improvement_paths where id=$1", [paths.calm]))[0];
check("publishing sets status and bumps version to 1", v.status === "published" && v.version === 1);
await denied("published path content is read-only", () => as(admin, () => q("update public.improvement_paths set title='تغییر' where id=$1", [paths.calm])), /منتشرشده/);
await denied("published path steps cannot be edited", () => as(admin, () => q("update public.improvement_path_steps set title='تغییر' where id=$1", [s1])), /منتشرشده/);
await denied("published path activities cannot be removed", () => as(admin, () => q("delete from public.improvement_path_activities where step_id=$1", [s1])), /منتشرشده/);
await denied("exercise used by a published path cannot be unpublished", () => as(admin, () => q("update public.improvement_exercises set status='draft' where id=$1", [ex.write])), /مسیر منتشرشده/);
check("draft path is invisible to ordinary users", (await as(userA, () => q("select public.my_path_recommendations()")))[0].my_path_recommendations.length === 0);

// ═══ 3) rule validation ═══
const rule = (over = {}) => ({ title: "قاعده", test: testId, version: null, mode: "all", conditions: [{ metric: "total", op: "gte", value: 10 }], path: paths.calm, priority: 100, strength: "suggested", active: true, ...over });
const addRule = (r) => as(admin, async () => (await q(
  `insert into public.improvement_recommendation_rules (title,test_id,version_id,condition_mode,conditions,path_id,priority,strength,is_active,user_note,admin_note)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'یادداشت داخلی مدیر') returning id`,
  [r.title, r.test, r.version, r.mode, JSON.stringify(r.conditions), r.path, r.priority, r.strength, r.active, r.note ?? null]))[0].id);
await denied("rule with unknown operator is rejected", () => addRule(rule({ conditions: [{ metric: "total", op: "like", value: 1 }] })), /عملگر/);
await denied("rule with inverted between range is rejected", () => addRule(rule({ conditions: [{ metric: "total", op: "between", value: 9, value2: 3 }] })), /بازه/);
await denied("rule with non-numeric value is rejected", () => addRule(rule({ conditions: [{ metric: "total", op: "gt", value: "abc" }] })), /عدد/);
await denied("rule with empty conditions is rejected", () => addRule(rule({ conditions: [] })), /شرط/);
await denied("rule nesting deeper than one group is rejected", () => addRule(rule({ conditions: [{ mode: "all", conditions: [{ mode: "any", conditions: [{ metric: "total", op: "gt", value: 1 }] }] }] })), /تو در تو/);
await denied("rule bound to another test's version is rejected", () => addRule(rule({ version: otherVersionId })), /متعلق/);

// ═══ 4) priority, conflicts, definite, limits (via the admin tester — nothing stored) ═══
const rIds = {};
rIds.low = await addRule(rule({ title: "کم‌اولویت", priority: 50, path: paths.calm2, conditions: [{ metric: "total", op: "gte", value: 5 }] }));
rIds.main = await addRule(rule({ title: "اصلی: نمره‌ی کل و بُعد اضطراب", priority: 100, path: paths.calm, note: "نمره‌ی اضطراب شما در بازه‌ی بالاتری بود.",
  conditions: [{ metric: "total", op: "gte", value: 10 }, { metric: "dimension", dimension: "anx", op: "between", value: 4, value2: 8 }] }));
rIds.sleep = await addRule(rule({ title: "خواب (OR با گروه)", priority: 80, path: paths.sleep, mode: "any",
  conditions: [{ metric: "dimension", dimension: "mood", op: "lt", value: 2 }, { mode: "all", conditions: [{ metric: "total", op: "gte", value: 10 }, { metric: "dimension", dimension: "mood", op: "exists" }] }] }));
rIds.hiddenPath = await addRule(rule({ title: "مسیر پیش‌نویس", priority: 300, path: paths.hidden, conditions: [{ metric: "total", op: "gte", value: 0 }] }));
rIds.inactive = await addRule(rule({ title: "غیرفعال", priority: 400, active: false, path: paths.sleep, conditions: [{ metric: "total", op: "gte", value: 0 }] }));
const tryRules = (total, dims, inactive = false) => as(admin, async () => (await q("select public.admin_test_recommendation_rules($1,$2,$3,$4,$5) r", [testId, null, total, dims, inactive]))[0].r);
const outcomeOf = (res, id) => res.entries.find((e) => e.rule_id === id)?.outcome;

const before = (await q("select (select count(*) from public.improvement_recommendations)::int a, (select count(*) from public.test_results)::int b"))[0];
let t = await tryRules(12, { anx: 6, mood: 6 });
check("tester: priority order puts the higher-priority rule first", t.entries[0].rule_title === "اصلی: نمره‌ی کل و بُعد اضطراب" || t.entries.findIndex((e) => e.rule_id === rIds.main) < t.entries.findIndex((e) => e.rule_id === rIds.low));
check("tester: AND rule matches only when all conditions hold", outcomeOf(t, rIds.main) === "suggested");
check("tester: OR rule with nested AND group matches", outcomeOf(t, rIds.sleep) === "suggested");
check("tester: rule pointing at a draft path is explained, never suggested", outcomeOf(t, rIds.hiddenPath) === "path_not_published");
check("tester: same exclusive_group path is suppressed (conflict)", outcomeOf(t, rIds.low) === "conflict_group");
check("tester: inactive rule is not evaluated by default", outcomeOf(t, rIds.inactive) === undefined);
check("tester: each rule reports per-condition details with actual values", t.entries.find((e) => e.rule_id === rIds.main).details.some((d) => d.dimension === "anx" && Number(d.actual) === 6 && d.passed === true));
t = await tryRules(12, { anx: 6, mood: 6 }, true);
check("tester: inactive rule shown only on request and still never applied", outcomeOf(t, rIds.inactive) === "inactive_rule");
t = await tryRules(12, { anx: 9, mood: 6 });
check("tester: bound is inclusive/exclusive exactly (anx 9 is outside 4..8)", outcomeOf(t, rIds.main) === "not_matched" && outcomeOf(t, rIds.low) === "suggested");
t = await tryRules(3, {});
check("tester: low score matches nothing — no random suggestion", t.suggested.length === 0);
check("tester: missing dimension fails numeric conditions instead of erroring", outcomeOf(t, rIds.main) === "not_matched");
const after = (await q("select (select count(*) from public.improvement_recommendations)::int a, (select count(*) from public.test_results)::int b"))[0];
check("tester stores nothing (no results, no recommendations)", before.a === after.a && before.b === after.b);
await denied("ordinary user cannot use the rule tester", () => as(userA, () => q("select public.admin_test_recommendation_rules($1,null,1,'{}',false)", [testId])));
// definite stops lower priority
const definite = await addRule(rule({ title: "قطعی", priority: 900, strength: "definite", path: paths.sleep, conditions: [{ metric: "total", op: "gte", value: 11 }] }));
t = await tryRules(12, { anx: 6, mood: 6 });
check("definite rule wins and stops lower-priority rules", outcomeOf(t, definite) === "suggested" && outcomeOf(t, rIds.main) === "skipped_after_definite" && t.suggested.length === 1);
await as(admin, () => q("update public.improvement_recommendation_rules set is_active=false where id=$1", [definite]));
check("deactivating the definite rule restores normal behaviour", (await tryRules(12, { anx: 6, mood: 6 })).suggested.length === 2);
// explainable duplicate-path handling
const dup = await addRule(rule({ title: "تکراری برای همان مسیر", priority: 10, path: paths.calm, conditions: [{ metric: "total", op: "gte", value: 0 }] }));
check("duplicate target path is reported, not repeated", outcomeOf(await tryRules(12, { anx: 6, mood: 6 }), dup) === "duplicate_path");
await as(admin, () => q("delete from public.improvement_recommendation_rules where id=$1", [dup]));

// ═══ 5) real flow: stored result → server-side recommendation ═══
const { attempt: attemptA, res: resA } = await takeTest(userA, { anx: 3, mood: 3 });
check("real result stored by the existing completion RPC (total = 12)", Number(resA.total_score) === 12);
const recs = await as(userA, async () => (await q("select public.result_path_recommendations($1) r", [attemptA]))[0].r);
check("result triggers recommendation from stored scores (2 published paths, ranked)", recs.length === 2 && recs[0].rank === 1 && recs[0].title === "آرام‌سازی سه‌روزه");
check("recommendation carries the admin's user-facing reason", recs[0].reason === "نمره‌ی اضطراب شما در بازه‌ی بالاتری بود.");
check("draft/inactive paths were never recommended", !recs.some((r) => r.path_id === paths.hidden));
check("the result itself is unchanged by recommendations", (await q("select total_score from public.test_results where attempt_id=$1", [attemptA]))[0].total_score == 12);
const stored = await q("select explanation from public.improvement_recommendations where attempt_id=$1 order by rank", [attemptA]);
check("explanation (matched conditions) is persisted with the recommendation", Array.isArray(stored[0].explanation) && stored[0].explanation.length === 2);
await denied("another user cannot request recommendations for my result", () => as(userB, () => q("select public.result_path_recommendations($1)", [attemptA])), /یافت نشد/);
check("another user sees none of my recommendations (RLS)", (await as(userB, () => q("select count(*)::int n from public.improvement_recommendations")))[0].n === 0);
await denied("a user cannot insert a recommendation directly", () => as(userA, () => q("insert into public.improvement_recommendations (user_id,attempt_id,path_id) values ($1,$2,$3)", [userA, attemptA, paths.calm])));

// recommendation engine failure must never block a test result
await exec("alter table public.improvement_recommendation_rules disable trigger trg_improvement_rule_guard");
const [{ id: badRule }] = await q(`insert into public.improvement_recommendation_rules (title,test_id,condition_mode,conditions,path_id,is_active,priority) values ('خراب',$1,'all','[{"metric":"total","op":"gt","value":"abc"}]',$2,true,999) returning id`, [testId, paths.calm]);
const { res: resB } = await takeTest(userB, { anx: 3, mood: 3 });
check("a broken rule cannot prevent the test result from being saved", Number(resB.total_score) === 12);
await q("delete from public.improvement_recommendation_rules where id=$1", [badRule]);
await exec("alter table public.improvement_recommendation_rules enable trigger trg_improvement_rule_guard");
const attemptB = resB.attempt_id;
const recsB = await as(userB, async () => (await q("select public.result_path_recommendations($1) r", [attemptB]))[0].r);
check("recommendations are regenerated on demand for that user after the failure", recsB.length === 2);

// ═══ 6) plan creation: snapshot, uniqueness, isolation ═══
const planA = await as(userA, async () => (await q("select public.start_improvement_plan($1,$2) id", [paths.calm, attemptA]))[0].id);
const planInfo = (await q("select * from public.user_improvement_plans where id=$1", [planA]))[0];
check("plan links to the real path id, version and source result", planInfo.path_id === paths.calm && planInfo.path_version === 1 && planInfo.source_attempt_id === attemptA && planInfo.status === "active");
check("plan snapshot copied all steps and activities", (await q("select count(*)::int n from public.user_plan_steps where plan_id=$1", [planA]))[0].n === 2 && (await q("select count(*)::int n from public.user_plan_activities where plan_id=$1", [planA]))[0].n === 3);
check("starting marks the recommendation as started", (await q("select status from public.improvement_recommendations where attempt_id=$1 and path_id=$2", [attemptA, paths.calm]))[0].status === "started");
await denied("same path cannot be started twice", () => as(userA, () => q("select public.start_improvement_plan($1,$2)", [paths.calm, attemptA])), /ادامه دهید/);
await denied("only one active plan per user (second path refused)", () => as(userA, () => q("select public.start_improvement_plan($1,null)", [paths.sleep])), /فعال/);
await denied("draft path cannot be started", () => as(userA, () => q("select public.start_improvement_plan($1,null)", [paths.hidden])), /در دسترس/);
await denied("pending (unverified) account cannot use improvement features", () => as(pendingUser, () => q("select public.my_improvement_overview()")), /تأییدشده/);
await denied("anonymous caller cannot execute plan RPCs", () => as(null, () => q("select public.my_improvement_overview()"), "anon"), /permission denied/);
check("user B cannot see user A's plan, steps or activities", (await as(userB, async () => (await q("select (select count(*) from public.user_improvement_plans)::int + (select count(*) from public.user_plan_steps)::int + (select count(*) from public.user_plan_activities)::int n"))[0].n)) === 0);
const planB = await as(userB, async () => (await q("select public.start_improvement_plan($1,$2) id", [paths.calm, attemptB]))[0].id);
check("two users can run the same path independently", planB !== planA);
await denied("user cannot write to plan tables directly", () => as(userA, () => q("update public.user_plan_activities set status='completed' where plan_id=$1", [planA])));
await denied("user cannot forge a plan row", () => as(userA, () => q("insert into public.user_improvement_plans (user_id,path_version,path_title,planned_end_date) values ($1,1,'x',now())", [userA])));

// ═══ 7) executing activities ═══
const acts = async (plan) => q(`select a.id, a.title, a.exercise_type, a.is_required, a.status, s.day_number from public.user_plan_activities a join public.user_plan_steps s on s.id=a.plan_step_id where a.plan_id=$1 order by s.day_number, a.sort_order`, [plan]);
let A = await acts(planA);
const write = A.find((a) => a.exercise_type === "reflection"), rate = A.find((a) => a.exercise_type === "rating"), list = A.find((a) => a.exercise_type === "checklist");
const doComplete = (user, id, response, note = null) => as(user, async () => (await q("select public.complete_plan_activity($1,$2,$3) m", [id, JSON.stringify(response), note]))[0].m);
let ov = await as(userA, async () => (await q("select public.my_improvement_overview() o"))[0].o);
check("overview starts at 0% with today's day-1 activities", ov.active_plan.metrics.percent === 0 && ov.active_plan.today.length === 2 && ov.active_plan.metrics.day_index === 1);
await as(userA, () => q("select public.begin_plan_activity($1)", [write.id]));
check("beginning an activity marks it in progress with a timestamp", (await q("select status,started_at is not null s from public.user_plan_activities where id=$1", [write.id]))[0].status === "in_progress");
await denied("required reflection cannot be completed without a real answer", () => doComplete(userA, write.id, { text: "کوتاه" }), /حداقل/);
await denied("rating outside the configured scale is rejected", () => doComplete(userA, rate.id, { rating: 9 }), /بین/);
await denied("non-integer rating is rejected", () => doComplete(userA, rate.id, { rating: 3.5 }), /امتیاز/);
await denied("partial checklist cannot complete the activity", () => doComplete(userA, list.id, { checked: [0, 1] }), /همه/);
await denied("out-of-range checklist index is rejected", () => doComplete(userA, list.id, { checked: [0, 1, 7] }), /نامعتبر/);
await denied("another user cannot complete my activity", () => doComplete(userB, write.id, { text: "پاسخ جعلی از کاربر دیگر برای فعالیت" }), /یافت نشد/);
let m = await doComplete(userA, write.id, { text: "امروز درباره‌ی کار و فشار زمان بیشتر فکر کردم." }, "یادداشت شخصی");
check("valid completion stores progress computed on the server (1 of 3)", m.completed === 1 && m.percent === 33);
const doneAt = (await q("select completed_at from public.user_plan_activities where id=$1", [write.id]))[0].completed_at;
m = await doComplete(userA, write.id, { text: "تلاش برای بازنویسی پاسخ تکمیل‌شده" });
check("repeating a completion is idempotent (no double count, answer untouched)", m.completed === 1 && String((await q("select completed_at from public.user_plan_activities where id=$1", [write.id]))[0].completed_at) === String(doneAt)
  && (await q("select response->>'text' t from public.user_plan_activities where id=$1", [write.id]))[0].t.startsWith("امروز"));
check("saved response is readable again by its owner after reload", (await as(userA, () => q("select response->>'text' t, user_note n from public.user_plan_activities where id=$1", [write.id])))[0].n === "یادداشت شخصی");
check("other users and staff cannot read the saved response (RLS)", (await as(userB, () => q("select count(*)::int n from public.user_plan_activities where id=$1", [write.id])))[0].n === 0
  && (await as(admin, () => q("select count(*)::int n from public.user_plan_activities where id=$1", [write.id])))[0].n === 0);
await denied("required activity cannot be skipped", () => as(userA, () => q("select public.skip_plan_activity($1)", [write.id])), /الزامی|رد/);
await as(userA, () => q("select public.skip_plan_activity($1)", [rate.id]));
check("optional activity can be skipped and leaves the denominator", (await as(userA, async () => (await q("select public.my_improvement_overview() o"))[0].o)).active_plan.metrics.percent === 50);
// pause / resume rules
await as(userA, () => q("select public.set_improvement_plan_status($1,'paused')", [planA]));
await denied("paused plan cannot record new progress", () => doComplete(userA, list.id, { checked: [0, 1, 2] }), /فعال نیست/);
check("paused plan stops being the active one", (await as(userA, async () => (await q("select public.my_improvement_overview() o"))[0].o)).active_plan === null);
await as(userA, () => q("select public.set_improvement_plan_status($1,'active')", [planA]));
await denied("completed/invalid status transitions are refused", () => as(userA, () => q("select public.set_improvement_plan_status($1,'completed')", [planA])), /مجاز/);
await denied("another user cannot change my plan status", () => as(userB, () => q("select public.set_improvement_plan_status($1,'cancelled')", [planA])), /یافت نشد/);
// overdue + adherence: push start 2 days back (as service role) then check server-side day index
await q("update public.user_improvement_plans set started_at = now() - interval '2 days' where id=$1", [planA]);
ov = await as(userA, async () => (await q("select public.my_improvement_overview() o"))[0].o);
check("day index, today's list and adherence derive from real dates", ov.active_plan.metrics.day_index === 3 && ov.active_plan.metrics.adherence === 50);
check("overdue activities are reported (day-2 checklist)", ov.active_plan.overdue_count === 1 && ov.active_plan.overdue[0].id === list.id);

// ═══ 8) versioning must not alter running plans ═══
const snapBefore = (await q("select title, instructions, exercise_version from public.user_plan_activities where id=$1", [write.id]))[0];
await as(admin, async () => {
  await q("select public.set_improvement_path_status($1,'draft')", [paths.calm]);
  await q("update public.improvement_path_steps set title='عنوان جدید مرحله' where id=$1", [s1]);
  await q("update public.improvement_exercises set instructions='دستورالعمل کاملاً بازنویسی‌شده‌ی جدید', title='عنوان تازه' where id=$1", [ex.write]);
  await q("select public.set_improvement_path_status($1,'published')", [paths.calm]);
});
check("re-publishing bumps the path version to 2", (await q("select version from public.improvement_paths where id=$1", [paths.calm]))[0].version === 2);
check("editing an exercise bumps its own version", (await q("select version from public.improvement_exercises where id=$1", [ex.write]))[0].version === 2);
const snapAfter = (await q("select title, instructions, exercise_version from public.user_plan_activities where id=$1", [write.id]))[0];
check("running user plan keeps its original snapshot after admin edits", snapBefore.title === snapAfter.title && snapBefore.instructions === snapAfter.instructions && snapAfter.exercise_version === 1
  && (await q("select path_version, (select title from public.user_plan_steps where plan_id=$1 order by day_number limit 1) st from public.user_improvement_plans where id=$1", [planA]))[0].st === "روز اول: آگاهی");
await denied("an exercise used in an active user plan cannot be deleted", () => as(admin, () => q("delete from public.improvement_exercises where id=$1", [ex.write])), /برنامه‌ی فعال|مسیر/);
await denied("a path with open user plans cannot be deleted", () => as(admin, () => q("delete from public.improvement_paths where id=$1", [paths.calm])), /برنامه‌ی باز|آرشیو/);

// ═══ 9) completion + history ═══
await doComplete(userA, list.id, { checked: [0, 1, 2] });
const finished = (await q("select status, completed_at is not null c from public.user_improvement_plans where id=$1", [planA]))[0];
check("plan completes automatically when every required activity is done", finished.status === "completed" && finished.c);
ov = await as(userA, async () => (await q("select public.my_improvement_overview() o"))[0].o);
check("history lists the completed plan with 100% and no active plan", ov.active_plan === null && ov.plans.some((p) => p.id === planA && p.status === "completed" && p.metrics.percent === 100));
await denied("completed plan cannot be reopened", () => as(userA, () => q("select public.set_improvement_plan_status($1,'active')", [planA])), /مجاز/);
const afterDone = await as(userA, async () => (await q("select public.start_improvement_plan($1,null) id", [paths.sleep]))[0].id);
check("after completion the user can start another path", Boolean(afterDone));
await as(userA, () => q("select public.set_improvement_plan_status($1,'cancelled')", [afterDone]));

// ═══ 10) admin statistics from real data, no private content ═══
const stats = await as(admin, async () => (await q("select public.admin_improvement_overview(30) s"))[0].s);
check("admin stats count real plans (3 started, 1 completed, 1 cancelled, 1 active)", stats.plans.started_total === 3 && stats.plans.completed === 1 && stats.plans.cancelled === 1 && stats.plans.active === 1);
check("admin stats expose plan completion rate and activity counts (2 done of 6 non-skipped = 33%)", stats.plans.completion_rate === 33 && stats.activities.completed === 2 && stats.activities.completion_rate === 33);
check("admin stats list popular paths", stats.popular_paths[0].plans >= 2);
check("admin stats include drop-off by step for cancelled/paused plans", Array.isArray(stats.dropoff) && stats.dropoff.length >= 1);
check("admin stats never contain user answers or notes", !JSON.stringify(stats).includes("امروز درباره") && !JSON.stringify(stats).includes("یادداشت شخصی"));
await denied("ordinary user cannot read admin stats", () => as(userA, () => q("select public.admin_improvement_overview(30)")));
check("audit log records path publishing and rule changes", (await q("select count(*)::int n from public.audit_logs where resource_type in ('improvement_paths','improvement_recommendation_rules')"))[0].n > 5);
check("permission seed exists for management roles", (await q("select count(*)::int n from public.role_permissions where resource='paths'"))[0].n >= 8);

console.log(`\n${passed} improvement-system checks passed on isolated Postgres. No live data was touched.`);
