import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Inbox, Loader2, UserCheck, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { cn } from "../utils/cn";
import { StatusPill } from "./SupportHub";
import { TicketThread } from "./TicketThread";
import { PRIORITY_LABEL, STATUS_LABEL, categoryLabel, fa, supportError, when, type Priority, type TicketStatus } from "./api";

interface DeskTicket {
  id: string;
  subject: string;
  body: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  requester_name: string | null;
  requester_email: string;
  assigned_to: string | null;
  created_at: string;
  last_reply_at: string | null;
}

type Filter = "open" | "unassigned" | "mine" | "closed";

/** پنل متخصص پشتیبان: صف تیکت‌های انسانی، مکالمه‌ی زنده و تغییر وضعیت (دسترسی با RLS سمت سرور) */
export function SupportDeskPage() {
  const { session, profile } = useAuth();
  const me = session?.user.id ?? null;
  const [rows, setRows] = useState<DeskTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("support_messages")
      .select("id,subject,body,category,priority,status,requester_name,requester_email,assigned_to,created_at,last_reply_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) setError(supportError(err));
    else {
      setError(null);
      setRows((data ?? []) as DeskTicket[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    if (!supabase) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
    };
    const channel = supabase
      .channel(`desk:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_replies" }, refresh)
      .subscribe();
    const poll = window.setInterval(() => void load(), 30000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      void supabase!.removeChannel(channel);
    };
  }, [load]);

  const stats = useMemo(
    () => ({
      open: rows.filter((r) => r.status !== "closed").length,
      unassigned: rows.filter((r) => r.status !== "closed" && !r.assigned_to).length,
      mine: rows.filter((r) => r.status !== "closed" && r.assigned_to === me).length,
      closed: rows.filter((r) => r.status === "closed").length,
    }),
    [rows, me]
  );

  const visible = rows.filter((r) =>
    filter === "open" ? r.status !== "closed" : filter === "unassigned" ? r.status !== "closed" && !r.assigned_to : filter === "mine" ? r.assigned_to === me && r.status !== "closed" : r.status === "closed"
  );
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const patch = async (values: Partial<Pick<DeskTicket, "status" | "assigned_to" | "priority">>) => {
    if (!supabase || !selected) return;
    setBusy(true);
    const { error: err } = await supabase.from("support_messages").update(values).eq("id", selected.id);
    setBusy(false);
    if (err) setError(supportError(err));
    else await load();
  };

  const cards: Array<[Filter, string, number, typeof Inbox]> = [
    ["open", "تیکت‌های باز", stats.open, Inbox],
    ["unassigned", "بدون مسئول", stats.unassigned, Clock],
    ["mine", "واگذارشده به من", stats.mine, UserCheck],
    ["closed", "بسته‌شده", stats.closed, CheckCircle2],
  ];

  return (
    <div className="space-y-5">
      <header>
        <p className="section-label mb-1">پنل متخصص پشتیبان</p>
        <h1 className="section-title">سلام{profile?.full_name ? `، ${profile.full_name}` : ""}</h1>
        <p className="section-lead mt-2">تیکت‌های کاربران را ببینید، رسیدگی را برعهده بگیرید و در گفت‌وگوی زنده پاسخ دهید.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([key, label, value, Icon]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={cn("card-glass p-4 text-right transition-all", filter === key ? "ring-2 ring-[#7a5ea8]/60" : "hover:-translate-y-0.5")}>
            <Icon className="mb-2 h-5 w-5 text-[#7a5ea8]" strokeWidth={1.8} />
            <p className="text-[13px] font-semibold text-body">{label}</p>
            <p className="text-2xl font-semibold text-ink">{loading ? "…" : fa(value)}</p>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-2xl bg-[#fdf3e0] px-4 py-3 text-[14px] font-semibold leading-7 text-[#8a5a14]">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <section className="card-glass max-h-[42rem] overflow-y-auto p-2" aria-label="صف تیکت‌ها">
          {loading ? <p className="flex items-center gap-2 p-5 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت تیکت‌ها…</p> : visible.length === 0 ? (
            <p className="p-8 text-center text-[14px] leading-7 text-body">تیکتی در این دسته نیست.</p>
          ) : (
            <ul className="space-y-1">
              {visible.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelectedId(t.id)} className={cn("w-full rounded-2xl px-3.5 py-3 text-right transition-colors", selectedId === t.id ? "bg-[#7a5ea8]/10" : "hover:bg-white/70")}>
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[14.5px] font-bold text-ink">{t.subject}</span>
                      <StatusPill status={t.status} className="shrink-0" />
                    </span>
                    <span className="block truncate text-[12.5px] text-fog">{t.requester_name || t.requester_email} · {categoryLabel(t.category)}{t.priority === "urgent" || t.priority === "high" ? ` · ${PRIORITY_LABEL[t.priority]}` : ""}</span>
                    <span className="text-[12px] text-fog">{when(t.last_reply_at ?? t.created_at)}{t.assigned_to ? (t.assigned_to === me ? " · با شما" : " · واگذارشده") : " · بدون مسئول"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-glass flex min-h-[28rem] flex-col p-4 sm:p-6" aria-label="مکالمه">
          {!selected ? (
            <div className="m-auto text-center text-body">
              <Inbox className="mx-auto mb-3 h-7 w-7 text-[#7a5ea8]" />
              یک تیکت را از فهرست انتخاب کنید.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-ink">{selected.subject}</h2>
                  <p className="text-[13px] text-fog">{selected.requester_name || "بدون نام"} · <span dir="ltr">{selected.requester_email}</span></p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.assigned_to !== me && (
                    <button type="button" disabled={busy} onClick={() => void patch({ assigned_to: me, status: "in_progress" })} className="btn-secondary min-h-10 px-4 text-[14px]"><UserPlus className="h-4 w-4" />برعهده‌گرفتن</button>
                  )}
                  <select aria-label="وضعیت تیکت" value={selected.status} disabled={busy} onChange={(e) => void patch({ status: e.target.value as TicketStatus })} className="input-field min-h-10 w-auto py-1 text-[14px]">
                    {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              <TicketThread key={selected.id} ticketId={selected.id} mode="staff" allowInternal first={{ body: selected.body, created_at: selected.created_at, author_name: selected.requester_name }} onSent={() => void load()} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
