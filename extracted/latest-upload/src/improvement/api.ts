import { friendlyError, supabase } from "../lib/supabase";
import { isMissingBackend } from "../admin/backend";

export const MIGRATION_HINT =
  "ساختار «بهبود فردی» در پایگاه داده نصب نشده است؛ فایل supabase/migrations/20261111000000_improvement_paths.sql را اعمال کنید.";

export type PublishState = "draft" | "published" | "archived";
export type ExerciseType = "reflection" | "checklist" | "rating";

export const PUBLISH_LABEL: Record<PublishState, string> = { draft: "پیش‌نویس", published: "منتشرشده", archived: "آرشیو" };
export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = { reflection: "تمرین نوشتاری", checklist: "چک‌لیست", rating: "خودارزیابی (امتیاز)" };
export const PLAN_STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار شروع",
  active: "فعال",
  paused: "متوقف‌شده",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
};
export const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  not_started: "انجام‌نشده",
  in_progress: "در حال انجام",
  completed: "تکمیل‌شده",
  skipped: "ردشده",
};

export interface Exercise {
  id: string;
  title: string;
  description: string | null;
  goal: string | null;
  category: string;
  instructions: string;
  duration_minutes: number | null;
  exercise_type: ExerciseType;
  content: { items?: string[]; min?: number; max?: number; low_label?: string; high_label?: string; prompt?: string };
  response_required: boolean;
  status: PublishState;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PathRow {
  id: string;
  title: string;
  description: string | null;
  goal: string | null;
  topic: string;
  user_description: string | null;
  duration_days: number;
  status: PublishState;
  version: number;
  sort_order: number;
  exclusive_group: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepRow {
  id: string;
  path_id: string;
  day_number: number;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface ActivityRow {
  id: string;
  step_id: string;
  exercise_id: string;
  sort_order: number;
  is_required: boolean;
  suggested_time: string | null;
}

export type ConditionOp = "eq" | "gt" | "gte" | "lt" | "lte" | "between" | "exists" | "not_exists";
export const OP_LABEL: Record<ConditionOp, string> = {
  eq: "برابر با",
  gt: "بزرگ‌تر از",
  gte: "بزرگ‌تر یا مساوی",
  lt: "کوچک‌تر از",
  lte: "کوچک‌تر یا مساوی",
  between: "در بازه‌ی",
  exists: "نتیجه وجود دارد",
  not_exists: "نتیجه وجود ندارد",
};
export interface Leaf {
  metric: "total" | "dimension";
  dimension?: string;
  op: ConditionOp;
  value?: number;
  value2?: number;
}
export interface Group {
  mode: "all" | "any";
  conditions: Leaf[];
}
export type ConditionNode = Leaf | Group;
export const isGroup = (n: ConditionNode): n is Group => "conditions" in n;

export interface RuleRow {
  id: string;
  title: string;
  test_id: string;
  version_id: string | null;
  condition_mode: "all" | "any";
  conditions: ConditionNode[];
  path_id: string;
  priority: number;
  strength: "suggested" | "definite";
  is_active: boolean;
  admin_note: string | null;
  user_note: string | null;
  updated_at: string;
}

export interface PlanMetrics {
  total: number;
  completed: number;
  skipped: number;
  required_total: number;
  required_completed: number;
  percent: number;
  due_total: number;
  due_completed: number;
  adherence: number | null;
  day_index: number;
  planned_days: number;
}
export interface PlanSummary {
  id: string;
  path_id: string | null;
  title: string;
  status: string;
  started_at: string;
  planned_end_date: string;
  completed_at: string | null;
  metrics: PlanMetrics;
}
export interface PlanActivityBrief {
  id: string;
  title: string;
  status: string;
  duration_minutes?: number | null;
  exercise_type?: ExerciseType;
  is_required: boolean;
  suggested_time?: string | null;
  day_number?: number;
}
export interface Overview {
  active_plan:
    | (PlanSummary & { goal: string | null; today: PlanActivityBrief[]; overdue: PlanActivityBrief[]; overdue_count: number })
    | null;
  plans: PlanSummary[];
}
export interface Recommendation {
  id: string;
  attempt_id: string;
  test_id?: string;
  path_id: string;
  title: string;
  description: string | null;
  goal: string | null;
  duration_days: number;
  reason: string | null;
  strength: string;
  rank?: number;
  status: "suggested" | "started";
  plan_id: string | null;
}

/** پیام قابل‌فهم؛ پیام‌های فارسی خود پایگاه داده (مثل «مسیر منتشرشده قابل ویرایش نیست») مستقیم نمایش داده می‌شوند */
export function impError(e: unknown): string {
  if (isMissingBackend(e)) return MIGRATION_HINT;
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  if (/duplicate key|unique/i.test(msg)) return "این مقدار تکراری است.";
  if (/row-level security|permission denied/i.test(msg)) return "شما مجوز انجام این عملیات را ندارید.";
  return friendlyError(e);
}

export async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (!supabase) return { data: null, error: "اتصال به پایگاه داده برقرار نیست." };
  const { data, error } = await supabase.rpc(name, args);
  return error ? { data: null, error: impError(error) } : { data: data as T, error: null };
}

export const faNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits });
export const dateFa = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }) : "—";
