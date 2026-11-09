import { friendlyError, supabase } from "../lib/supabase";
import { isMissingBackend } from "../admin/backend";

export interface SnapshotOption {
  id: string;
  label: string;
  score: number;
  sort_order?: number;
}
export interface SnapshotQuestion {
  id: string;
  prompt: string;
  help_text?: string | null;
  type: "single_choice" | "multi_choice" | "likert";
  is_required?: boolean;
  dimension?: string | null;
  sort_order?: number;
  options: SnapshotOption[];
}
export interface PublishedVersion {
  id: string;
  version_label: string;
  scoring_rules: { method?: string; description?: string; min_score?: number; max_score?: number } & Record<string, unknown>;
  questions: SnapshotQuestion[];
  interpretations: Array<{ label: string; description: string; dimension?: string; min_score: number; max_score: number }>;
}
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
  if (isMissingBackend(e)) return flowUnavailable;
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  // پیام‌های فارسی توابع پایگاه داده مستقیماً قابل نمایش‌اند
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  return friendlyError(e);
}

/** نسخه‌ی منتشرشده‌ی یک آزمون از snapshot تغییرناپذیر */
export async function loadPublishedVersion(testId: string): Promise<PublishedVersion | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("test_versions")
    .select("id,version_label,scoring_rules,snapshot,published_at")
    .eq("test_id", testId)
    .eq("status", "published")
    .not("snapshot", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const snap = (data.snapshot ?? {}) as { questions?: unknown; interpretations?: unknown };
  const questions = (Array.isArray(snap.questions) ? snap.questions : [])
    .map((q) => q as SnapshotQuestion)
    .map((q) => ({ ...q, options: [...(q.options ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) }))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    id: data.id,
    version_label: data.version_label,
    scoring_rules: (data.scoring_rules ?? {}) as PublishedVersion["scoring_rules"],
    questions,
    interpretations: Array.isArray(snap.interpretations) ? (snap.interpretations as PublishedVersion["interpretations"]) : [],
  };
}

export async function startAttempt(testId: string): Promise<string> {
  const { data, error } = await supabase!.rpc("start_test_attempt", { p_test_id: testId });
  if (error) throw error;
  return data as string;
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
