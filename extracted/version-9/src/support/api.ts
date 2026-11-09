import { friendlyError, supabase } from "../lib/supabase";

export type TicketStatus = "new" | "in_progress" | "answered" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "جدید",
  in_progress: "در حال بررسی",
  answered: "پاسخ داده‌شده",
  closed: "بسته",
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: "پایین", normal: "عادی", high: "بالا", urgent: "فوری" };

export const CATEGORIES = [
  { value: "general", label: "عمومی" },
  { value: "technical", label: "مشکل فنی" },
  { value: "account", label: "حساب کاربری" },
  { value: "test", label: "آزمون‌ها" },
  { value: "billing", label: "پرداخت" },
  { value: "content", label: "محتوا" },
];
export const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export interface TicketSummary {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: Priority;
  channel: "ticket" | "ai";
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
}

export interface TicketDetail {
  id: string;
  subject: string;
  body: string;
  category: string;
  status: TicketStatus;
  priority: Priority;
  channel: "ticket" | "ai";
  created_at: string;
  last_reply_at: string | null;
  assigned: boolean;
}

export interface ThreadMessage {
  id: string;
  author_kind: "user" | "staff" | "ai" | "system";
  author_name: string | null;
  body: string;
  is_internal?: boolean;
  created_at: string;
}

/** پیام خطای قابل‌فهم؛ پیام‌های فارسی خود RPCها مستقیم نمایش داده می‌شوند */
export function supportError(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  if (/Could not find the function|PGRST202|PGRST205|schema cache|does not exist/i.test(msg)) {
    return "ماژول پشتیبانی هنوز در پایگاه داده نصب نشده است؛ migration شماره‌ی 20261109000000 باید اعمال شود.";
  }
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  return friendlyError(e);
}

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (!supabase) return { data: null, error: "اتصال به پایگاه داده برقرار نیست." };
  const { data, error } = await supabase.rpc(name, args);
  return error ? { data: null, error: supportError(error) } : { data: data as T, error: null };
}

export async function fetchReplies(ticketId: string): Promise<{ data: ThreadMessage[]; error: string | null }> {
  if (!supabase) return { data: [], error: "اتصال به پایگاه داده برقرار نیست." };
  const { data, error } = await supabase
    .from("support_replies")
    .select("id,author_kind,author_name,body,is_internal,created_at")
    .eq("message_id", ticketId)
    .order("created_at", { ascending: true });
  return error ? { data: [], error: supportError(error) } : { data: (data ?? []) as ThreadMessage[], error: null };
}

export const fa = (n: number) => n.toLocaleString("fa-IR");
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
