// تست منطق نسخه‌ی منتشرشده‌ی آزمون (بدون شبکه).
// ماژول src/site/publishedVersion.ts را با esbuild می‌سازد و رفتار parser را با پاسخ RPC واقعی بررسی می‌کند:
//  - پاسخ معتبر → سؤال‌ها و گزینه‌ها مرتب و کامل
//  - null → «نسخه منتشرشده نیست» (و نه خطای ساختار یا RPC)
//  - خطای RPC → پیام واقعی با کد، نه پیام عمومی
//  - ساختار نامعتبر / بدون سؤال / بدون گزینه → خطای جداگانه
//  - امتیاز و تفسیرها در خروجی نیستند
import { build } from "esbuild";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "test-flow-"));
const out = join(dir, "publishedVersion.mjs");
await build({
  entryPoints: ["src/site/publishedVersion.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
});
const m = await import(pathToFileURL(out).href);
await rm(dir, { recursive: true, force: true });

let passed = 0;
const check = (label, cond) => {
  assert.ok(cond, `FAILED: ${label}`);
  passed++;
  console.log(`PASS ${label}`);
};
const throwsKind = (fn, kind) => {
  try {
    fn();
  } catch (e) {
    return e instanceof m.TestFlowError && e.kind === kind ? e : null;
  }
  return null;
};

const VERSION_ID = "b1a1c5a7-d5e3-480f-84d5-986acbc207a8";
const Q1 = "cfbf1793-cd46-41e7-8224-6fabb8e121d3";
const Q2 = "11111111-2222-4333-8444-555555555555";
// ساختار دقیقاً مطابق خروجی زندهٔ public_test_version (کلیدها و نوع‌ها)
const liveShaped = {
  id: VERSION_ID,
  snapshot: {
    questions: [
      {
        id: Q2, type: "likert", prompt: "سؤال دوم", options: [{ id: "o3", label: "بله", sort_order: 2 }, { id: "o2", label: "نه", sort_order: 1 }],
        dimension: "شناخت هیجان", help_text: null, sort_order: 2, is_required: true,
      },
      {
        id: Q1, type: "likert", prompt: "سؤال اول", options: [{ id: "o1", label: "تقریباً هرگز", sort_order: 1 }],
        dimension: "شناخت هیجان", help_text: "راهنما", sort_order: 1, is_required: true,
      },
    ],
    interpretations: [{ label: "بالا", min_score: 40, max_score: 50, description: "متن تفسیر" }],
  },
  published_at: "2026-11-09T10:43:33.553654+00:00",
  scoring_rules: { description: "مجموع امتیاز ۱۰ سؤال" },
  version_label: "نسخه آزمایشی ۱",
};

// ۱) پاسخ معتبر
const v = m.interpretPublishedPayload(liveShaped);
check("valid RPC payload yields the version id (not the test id)", v.id === VERSION_ID);
check("version label is taken from top-level version_label", v.version_label === "نسخه آزمایشی ۱");
check("questions are sorted by sort_order", v.questions.map((q) => q.id).join() === [Q1, Q2].join());
check("options are sorted by sort_order", v.questions[1].options.map((o) => o.id).join() === "o2,o3");
check("question fields (prompt, type, dimension, help_text, required) are preserved", v.questions[0].prompt === "سؤال اول" && v.questions[0].type === "likert" && v.questions[0].dimension === "شناخت هیجان" && v.questions[0].help_text === "راهنما" && v.questions[0].is_required === true);
check("scoring description is kept for display", v.scoring_rules.description === "مجموع امتیاز ۱۰ سؤال");
check("interpretations (score thresholds) are never sent to the browser", !("interpretations" in v));
check("option scores are never present", v.questions.every((q) => q.options.every((o) => !("score" in o))));

// ۲) RPC یک آرایه‌ی یک‌عضوی برمی‌گرداند
check("single-row array payload is accepted", interpretPublishedOk([liveShaped]));

// ۳) null یعنی واقعاً منتشرنشده (نه خطای ساختار)
const nullErr = throwsKind(() => m.interpretPublishedPayload(null), "not_published");
check("null payload is reported as not_published", nullErr !== null && nullErr.message === "نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد.");
check("empty array payload is reported as not_published", throwsKind(() => m.interpretPublishedPayload([]), "not_published") !== null);

// ۴) خطای RPC هرگز به «منتشرنشده» تبدیل نمی‌شود
const rpc = m.rpcFlowError("version", { code: "42501", message: "permission denied for function public_test_version" });
check("RPC error keeps its kind (rpc), not not_published", rpc.kind === "rpc");
check("RPC error keeps the real code and message", rpc.code === "42501" && rpc.message.includes("permission denied for function public_test_version"));
check("RPC error message is in Persian and mentions the failing stage", /بارگذاری نسخه‌ی آزمون ناموفق بود/.test(rpc.message));
const startErr = m.rpcFlowError("start", { code: "P0001", message: "نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد" });
check("start_test_attempt error is a start error, distinct from version error", startErr.kind === "start" && /شروع تلاش آزمون ناموفق بود/.test(startErr.message) && startErr.message.includes("P0001"));
check("network error without code still produces a real message", m.rpcFlowError("version", new Error("Failed to fetch")).message.includes("Failed to fetch"));

// ۵) ساختار نامعتبر
check("non-object payload is invalid_snapshot", throwsKind(() => m.interpretPublishedPayload("oops"), "invalid_snapshot") !== null);
check("missing id is invalid_snapshot", throwsKind(() => m.interpretPublishedPayload({ ...liveShaped, id: "not-uuid" }), "invalid_snapshot") !== null);
check("missing snapshot is invalid_snapshot", throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID }), "invalid_snapshot") !== null);
check("snapshot without questions array is invalid_snapshot", throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID, snapshot: {} }), "invalid_snapshot") !== null);
const noQ = throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID, snapshot: { questions: [] } }), "invalid_snapshot");
check("version with zero questions is a distinct invalid error", noQ !== null && /هیچ سؤالی ندارد/.test(noQ.message));
const noOpt = throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID, snapshot: { questions: [{ id: Q1, type: "likert", prompt: "x", options: [] }] } }), "invalid_snapshot");
check("question without options is invalid (not silently accepted)", noOpt !== null && /گزینه‌ای ندارد/.test(noOpt.message));
check("unknown question type is rejected", throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID, snapshot: { questions: [{ id: Q1, type: "essay", prompt: "x", options: [{ id: "o", label: "l" }] }] } }), "invalid_snapshot") !== null);
check("option without label is rejected", throwsKind(() => m.interpretPublishedPayload({ id: VERSION_ID, snapshot: { questions: [{ id: Q1, type: "likert", prompt: "x", options: [{ id: "o" }] }] } }), "invalid_snapshot") !== null);

// ۶) شناسه‌ی تلاش
check("valid attempt id is returned", m.parseAttemptId("0c9a1f2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b") === "0c9a1f2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b");
check("non-uuid attempt id is a start error", throwsKind(() => m.parseAttemptId("null"), "start") !== null);

console.log(`\n${passed} version-parser checks passed (pure logic, no network).`);

function interpretPublishedOk(payload) {
  try {
    return m.interpretPublishedPayload(payload).id === VERSION_ID;
  } catch {
    return false;
  }
}
