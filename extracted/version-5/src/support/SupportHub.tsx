import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, CheckCircle2, Inbox, Loader2, MessageSquare, Plus, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../utils/cn";
import { AiChat } from "./AiChat";
import { TicketThread } from "./TicketThread";
import { CATEGORIES, STATUS_LABEL, categoryLabel, fa, rpc, when, type TicketDetail, type TicketStatus, type TicketSummary } from "./api";

export function StatusPill({ status, className }: { status: TicketStatus; className?: string }) {
  const tone =
    status === "new" ? "bg-[#e9edff] text-[#3b478c]" : status === "in_progress" ? "bg-[#fdf3e0] text-[#8a5a14]" : status === "answered" ? "bg-[#e7f5f0] text-[#256b5e]" : "bg-ink/8 text-body";
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-bold", tone, className)}>{STATUS_LABEL[status]}</span>;
}

function useMyTickets() {
  const [rows, setRows] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await rpc<TicketSummary[]>("support_my_tickets");
    setError(res.error);
    setRows(res.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!supabase) return;
    // پیام جدید روی هر تیکتِ خودِ کاربر (RLS فقط پاسخ‌های مجاز را می‌فرستد) → فهرست تازه می‌شود
    const channel = supabase
      .channel(`my-tickets:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_replies" }, () => void load())
      .subscribe();
    const poll = window.setInterval(() => void load(), 30000);
    return () => {
      window.clearInterval(poll);
      void supabase!.removeChannel(channel);
    };
  }, [load]);
  return { rows, loading, error, reload: load };
}

function NewTicketForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (subject.trim().length < 3) return setError("موضوع را حداقل ۳ کاراکتر بنویسید.");
    if (body.trim().length < 5) return setError("متن پیام را کامل‌تر بنویسید.");
    setBusy(true);
    const res = await rpc<string>("support_create_ticket", { p_subject: subject.trim(), p_body: body.trim(), p_category: category });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? "ثبت تیکت ناموفق بود.");
    onCreated(res.data);
  };

  return (
    <form onSubmit={submit} className="card-glass space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">تیکت جدید برای پشتیبان انسانی</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-ink">موضوع</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="input-field" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-ink">دسته</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-ink">متن پیام</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} className="input-field py-3 leading-7" />
      </label>
      <p className="text-[13px] leading-6 text-fog">رمز عبور یا اطلاعات حساس ارسال نکنید. پاسخ‌ها همین‌جا و بدون نیاز به refresh نمایش داده می‌شوند.</p>
      {error && <p role="alert" className="rounded-2xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold text-[#8f322d]">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        ثبت تیکت
      </button>
    </form>
  );
}

/** صفحه‌ی پشتیبانی کاربر: دستیار هوشمند + تیکت‌ها */
export function SupportHubPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get("tab") === "tickets" ? "tickets" : "ai";
  const convo = params.get("c");
  const { rows, loading, error, reload } = useMyTickets();
  const [composing, setComposing] = useState(false);

  const setTab = (t: "ai" | "tickets") => setParams(t === "ai" ? (convo ? { c: convo } : {}) : { tab: "tickets" });
  const tickets = rows.filter((r) => r.channel === "ticket");
  const chats = rows.filter((r) => r.channel === "ai");

  return (
    <div className="space-y-5">
      <header>
        <p className="section-label mb-1">پشتیبانی</p>
        <h1 className="section-title">کمک می‌خواهید؟</h1>
        <p className="section-lead mt-2">ابتدا از دستیار هوشمند بپرسید؛ اگر نیاز به بررسی انسانی بود، گفت‌وگو را به تیکت تبدیل کنید.</p>
      </header>

      <div role="tablist" aria-label="بخش‌های پشتیبانی" className="inline-flex rounded-full border border-white/80 bg-white/70 p-1 shadow-chip">
        {([["ai", "دستیار هوشمند", Bot], ["tickets", "تیکت‌ها", Inbox]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-bold transition-colors", tab === key ? "bg-coral text-white" : "text-body hover:text-ink")}>
            <Icon className="h-4 w-4" />
            {label}
            {key === "tickets" && tickets.length > 0 && <span className="rounded-full bg-white/25 px-2 text-[12px]">{fa(tickets.length)}</span>}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-2xl bg-[#fdf3e0] px-4 py-3 text-[14px] font-semibold leading-7 text-[#8a5a14]">{error}</p>}

      {tab === "ai" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
          <section className="card-glass flex min-h-[32rem] flex-col p-4 sm:p-6" key={convo ?? "new"}>
            <AiChat
              conversationId={convo}
              onConversation={(id) => { setParams({ c: id }); void reload(); }}
              onHandoff={(id) => navigate(`/support/${id}`)}
              onNew={() => setParams({})}
            />
          </section>
          <aside className="card-glass h-fit p-4" aria-label="تاریخچه‌ی گفت‌وگوها">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink"><MessageSquare className="h-4 w-4 text-steel" />گفت‌وگوهای قبلی</h2>
            {loading ? <p className="text-[14px] text-body">در حال دریافت…</p> : chats.length === 0 ? <p className="text-[14px] leading-7 text-body">هنوز گفت‌وگویی با دستیار نداشته‌اید.</p> : (
              <ul className="space-y-1.5">
                {chats.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setParams({ c: c.id })} className={cn("w-full rounded-2xl px-3 py-2.5 text-right transition-colors", convo === c.id ? "bg-steel/10" : "hover:bg-white/70")}>
                      <span className="block truncate text-[14px] font-bold text-ink">{c.subject}</span>
                      <span className="text-[12.5px] text-fog">{when(c.last_reply_at ?? c.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">تیکت‌های من</h2>
            <button type="button" onClick={() => setComposing((v) => !v)} className="btn-secondary min-h-11 px-5"><Plus className="h-4 w-4" />تیکت جدید</button>
          </div>
          {composing && <NewTicketForm onCreated={(id) => navigate(`/support/${id}`)} />}
          <div className="card-glass overflow-hidden">
            {loading ? (
              <p className="flex items-center gap-2 p-6 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت تیکت‌ها…</p>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center">
                <Inbox className="mx-auto mb-3 h-7 w-7 text-steel" />
                <p className="font-bold text-ink">هنوز تیکتی ثبت نکرده‌اید</p>
                <p className="mt-1 text-[14px] text-body">برای گفت‌وگو با پشتیبان انسانی، «تیکت جدید» را بزنید.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink/6">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link to={`/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-white/70">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold text-ink">{t.subject}</span>
                        <span className="text-[13px] text-fog">{categoryLabel(t.category)} · آخرین فعالیت {when(t.last_reply_at ?? t.created_at)} · {fa(Number(t.reply_count))} پیام</span>
                      </span>
                      <StatusPill status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** مکالمه‌ی یک تیکت (کاربر) */
export function SupportTicketPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    const res = await rpc<TicketDetail[]>("support_ticket_get", { p_id: id });
    setLoading(false);
    if (res.error) return setError(res.error);
    const row = res.data?.[0] ?? null;
    if (!row) return setError("تیکت یافت نشد یا به شما تعلق ندارد.");
    if (row.channel === "ai") return navigate(`/support?c=${row.id}`, { replace: true });
    setTicket(row);
  }, [id, navigate]);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const poll = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(poll);
  }, [load]);

  const close = async () => {
    if (!window.confirm("این تیکت بسته شود؟ با ارسال پیام جدید دوباره باز می‌شود.")) return;
    setClosing(true);
    const res = await rpc<null>("support_close_ticket", { p_id: id });
    setClosing(false);
    if (res.error) setError(res.error);
    else await load();
  };

  if (loading) return <p className="flex items-center gap-2 py-16 text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />در حال دریافت…</p>;
  if (error && !ticket) return (
    <div className="card-glass p-8 text-center">
      <p className="mb-4 font-bold text-ink">{error}</p>
      <Link to="/support?tab=tickets" className="btn-secondary">بازگشت به تیکت‌ها</Link>
    </div>
  );
  if (!ticket) return null;

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <Link to="/support?tab=tickets" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel"><ArrowRight className="h-4 w-4" />همه‌ی تیکت‌ها</Link>
      <header className="card-glass flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink">{ticket.subject}</h1>
          <p className="text-[13px] text-fog">{categoryLabel(ticket.category)} · ثبت: {when(ticket.created_at)}{ticket.assigned ? " · در حال رسیدگی توسط پشتیبان" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={ticket.status} />
          {ticket.status !== "closed" && (
            <button type="button" onClick={() => void close()} disabled={closing} className="btn-secondary min-h-10 px-4 text-[14px]"><CheckCircle2 className="h-4 w-4" />بستن تیکت</button>
          )}
        </div>
      </header>
      {error && <p role="alert" className="rounded-2xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold text-[#8f322d]">{error}</p>}
      <section className="card-glass flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <TicketThread ticketId={ticket.id} mode="user" first={{ body: ticket.body, created_at: ticket.created_at, author_name: null }} onSent={() => void load()} />
      </section>
    </div>
  );
}
