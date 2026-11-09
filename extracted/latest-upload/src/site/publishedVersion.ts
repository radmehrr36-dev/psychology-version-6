/**
 * منطق خالص (بدون وابستگی به Supabase) برای نسخه‌ی منتشرشده‌ی آزمون.
 *
 * خروجی `public_test_version(p_test_id)` به این شکل است:
 *   { id, version_label, published_at, scoring_rules, snapshot: { questions, interpretations } }
 * هر سؤال: { id, type, prompt, help_text, dimension, sort_order, is_required, options: [{ id, label, sort_order }] }
 *
 * امتیاز گزینه‌ها و متن تفسیرها عمداً به مرورگر منتقل نمی‌شوند؛ امتیازدهی و تفسیر فقط سمت سرور انجام می‌شود.
 */

export interface SnapshotOption {
  id: string;
  label: string;
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
  scoring_rules: { method?: string; description?: string } & Record<string, unknown>;
  questions: SnapshotQuestion[];
}

/** مرحله‌ای که خطا در آن رخ داده است؛ پیام کاربر را از همین‌جا می‌سازیم تا خطاها با هم اشتباه گرفته نشوند. */
export type TestFlowErrorKind =
  /** خطای خود RPC (شبکه، دسترسی، تابع ناموجود، …) */
  | "rpc"
  /** RPC اجرا شد و نسخه‌ی منتشرشده‌ای نداد (پاسخ null) */
  | "not_published"
  /** پاسخ RPC ساختار معتبر ندارد */
  | "invalid_snapshot"
  /** خطا در ساخت تلاش آزمون (start_test_attempt) */
  | "start";

export class TestFlowError extends Error {
  readonly kind: TestFlowErrorKind;
  readonly code: string | null;

  constructor(kind: TestFlowErrorKind, message: string, code: string | null = null) {
    super(message);
    this.name = "TestFlowError";
    this.kind = kind;
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_TYPES = ["single_choice", "multi_choice", "likert"] as const;

type Dict = Record<string, unknown>;
const isRecord = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const bySort = (a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/** خطای PostgREST/Supabase را به پیام قابل‌فهم و در عین حال واقعی تبدیل می‌کند. */
export function rpcFlowError(stage: "version" | "start", error: unknown): TestFlowError {
  const e = (isRecord(error) ? error : {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof e.code === "string" && e.code ? e.code : null;
  const message = typeof e.message === "string" && e.message ? e.message : error instanceof Error ? error.message : String(error ?? "خطای نامشخص");
  const head = stage === "version" ? "بارگذاری نسخه‌ی آزمون ناموفق بود" : "شروع تلاش آزمون ناموفق بود";
  return new TestFlowError(stage === "version" ? "rpc" : "start", `${head} (کد: ${code ?? "نامشخص"}): ${message}`, code);
}

function invalid(reason: string): TestFlowError {
  return new TestFlowError("invalid_snapshot", `ساختار نسخه‌ی منتشرشده معتبر نیست: ${reason}`);
}

function parseOption(raw: unknown, qNo: number, oNo: number): SnapshotOption {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id || typeof raw.label !== "string") {
    throw invalid(`گزینه‌ی ${oNo} سؤال ${qNo} شناسه یا متن ندارد`);
  }
  return { id: raw.id, label: raw.label, sort_order: typeof raw.sort_order === "number" ? raw.sort_order : undefined };
}

function parseQuestion(raw: unknown, qNo: number): SnapshotQuestion {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) throw invalid(`سؤال ${qNo} شناسه ندارد`);
  if (typeof raw.prompt !== "string" || !raw.prompt.trim()) throw invalid(`متن سؤال ${qNo} خالی است`);
  if (!QUESTION_TYPES.includes(raw.type as (typeof QUESTION_TYPES)[number])) throw invalid(`نوع سؤال ${qNo} پشتیبانی نمی‌شود`);
  if (!Array.isArray(raw.options) || raw.options.length === 0) throw invalid(`سؤال ${qNo} گزینه‌ای ندارد`);
  const options = raw.options.map((o, j) => parseOption(o, qNo, j + 1)).sort(bySort);
  return {
    id: raw.id,
    prompt: raw.prompt,
    help_text: typeof raw.help_text === "string" ? raw.help_text : null,
    type: raw.type as SnapshotQuestion["type"],
    is_required: raw.is_required === false ? false : true,
    dimension: typeof raw.dimension === "string" ? raw.dimension : null,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
    options,
  };
}

/** پاسخ خامِ RPC را (که یک شیء است) به `PublishedVersion` تبدیل و اعتبارسنجی می‌کند. */
export function parsePublishedVersion(raw: unknown): PublishedVersion {
  if (!isRecord(raw)) throw invalid("پاسخ سرور شیء نیست");
  if (typeof raw.id !== "string" || !UUID_RE.test(raw.id)) throw invalid("شناسه‌ی نسخه وجود ندارد");
  if (!isRecord(raw.snapshot)) throw invalid("snapshot نسخه وجود ندارد");
  if (!Array.isArray(raw.snapshot.questions)) throw invalid("فهرست سؤال‌ها وجود ندارد");
  if (raw.snapshot.questions.length === 0) throw new TestFlowError("invalid_snapshot", "این نسخه هیچ سؤالی ندارد.");

  const questions = raw.snapshot.questions.map((q, i) => parseQuestion(q, i + 1)).sort(bySort);
  return {
    id: raw.id,
    version_label: typeof raw.version_label === "string" ? raw.version_label : "",
    scoring_rules: (isRecord(raw.scoring_rules) ? raw.scoring_rules : {}) as PublishedVersion["scoring_rules"],
    questions,
  };
}

/**
 * پاسخ کامل RPC را تفسیر می‌کند:
 *  - null / آرایه‌ی خالی یعنی «نسخه‌ی منتشرشده وجود ندارد» (و نه خطای شبکه یا ساختار)،
 *  - در غیر این صورت ساختار باید معتبر باشد.
 */
export function interpretPublishedPayload(data: unknown): PublishedVersion {
  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || row === undefined) {
    throw new TestFlowError("not_published", "نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد.");
  }
  return parsePublishedVersion(row);
}

/** شناسه‌ی تلاش آزمون باید UUID معتبر باشد؛ در غیر این صورت خطای مرحله‌ی شروع است. */
export function parseAttemptId(data: unknown): string {
  if (typeof data !== "string" || !UUID_RE.test(data)) {
    throw new TestFlowError("start", "شناسه‌ی تلاش آزمون از سرور دریافت نشد.");
  }
  return data;
}
