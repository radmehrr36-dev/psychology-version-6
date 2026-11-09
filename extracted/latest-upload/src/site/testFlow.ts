import { friendlyError, supabase } from "../lib/supabase";
import { isMissingBackend } from "../admin/backend";
import {
  TestFlowError,
  interpretPublishedPayload,
  parseAttemptId,
  rpcFlowError,
  type PublishedVersion,
} from "./publishedVersion";

export type { PublishedVersion, SnapshotOption, SnapshotQuestion } from "./publishedVersion";
export { TestFlowError } from "./publishedVersion";

export interface TestResult {
  attempt_id: string;
  test_id: string;
  version_id: string | null;
  total_score: number;
  min_score: number | null;
  max_score: number | null;
  dimension_scores: Record<string, number>;
  interpretation: { label?: string; description?: string; dimension?: string };
  computed_at: string;
}

export const flowUnavailable = "اجرای آزمون نیازمند ساختار جدید پایگاه داده است (migration شماره ۷). تا اعمال آن، فقط معرفی آزمون در دسترس است.";

export function flowError(e: unknown): string {
  // خطاهای مرحله‌ای (نسخه / شروع) از قبل پیام کامل و واقعی دارند؛ هرگز به پیام عمومی تبدیل نمی‌شوند
  if (e instanceof TestFlowError) return e.message;
  if (isMissingBackend(e)) return flowUnavailable;
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  // پیام‌های فارسی توابع پایگاه داده مستقیماً قابل نمایش‌اند
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  return friendlyError(e);
}

/**
 * نسخه‌ی منتشرشده‌ی یک آزمون از طریق RPC امن `public_test_version` (SECURITY DEFINER).
 * `testId` باید همان `tests.id` باشد، نه شناسه‌ی نسخه یا slug.
 * SELECT مستقیم از `test_versions` عمداً استفاده نمی‌شود: RLS آن برای کاربران عمومی نتیجه‌ی خالی برمی‌گرداند.
 */
export async function loadPublishedVersion(testId: string): Promise<PublishedVersion> {
  if (!supabase) throw new TestFlowError("rpc", "Supabase پیکربندی نشده است.");
  const { data, error } = await supabase.rpc("public_test_version", { p_test_id: testId });
  if (error) {
    console.error("[test-flow] public_test_version failed", { testId, code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw rpcFlowError("version", error);
  }
  return interpretPublishedPayload(data);
}

/** ساخت یا ادامه‌ی تلاش آزمون. `testId` همان `tests.id` است. */
export async function startAttempt(testId: string): Promise<string> {
  if (!supabase) throw new TestFlowError("start", "Supabase پیکربندی نشده است.");
  const { data, error } = await supabase.rpc("start_test_attempt", { p_test_id: testId });
  if (error) {
    console.error("[test-flow] start_test_attempt failed", { testId, code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw rpcFlowError("start", error);
  }
  return parseAttemptId(data);
}

export async function saveAnswer(attemptId: string, questionId: string, optionIds: string[]): Promise<void> {
  const { error } = await supabase!.rpc("save_test_answer", { p_attempt_id: attemptId, p_question_id: questionId, p_option_ids: optionIds });
  if (error) throw error;
}

export async function completeAttempt(attemptId: string): Promise<TestResult> {
  const { data, error } = await supabase!.rpc("complete_test_attempt", { p_attempt_id: attemptId });
  if (error) throw error;
  return data as TestResult;
}

export async function abandonAttempt(attemptId: string): Promise<void> {
  await supabase!.rpc("abandon_test_attempt", { p_attempt_id: attemptId });
}

export async function loadExistingAnswers(attemptId: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabase!.from("test_answers").select("question_id,option_ids").eq("attempt_id", attemptId);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r: { question_id: string; option_ids: string[] }) => [r.question_id, r.option_ids]));
}

export function scoreLabel(score: number, min: number | null, max: number | null): string {
  const s = score.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
  if (min !== null && max !== null) return `${s} از ${max.toLocaleString("fa-IR")} (کمینه ${min.toLocaleString("fa-IR")})`;
  return s;
}
