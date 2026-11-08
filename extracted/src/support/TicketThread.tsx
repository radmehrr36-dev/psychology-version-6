import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, LockKeyhole, Radio, Send, ShieldAlert, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../utils/cn";
import { fetchReplies, rpc, supportError, type ThreadMessage, when } from "./api";

/* ───────── خواندن مکالمه + Realtime (با fallback به polling) ───────── */

export function useThread(ticketId: string | null) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const merge = useCallback((incoming: ThreadMessage[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const reload = useCallback(async () => {
    if (!ticketId) return;
    const res = await fetchReplies(ticketId);
    if (res.error) setError(res.error);
    else {
      setError(null);
      merge(res.data);
    }
  }, [ticketId, merge]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setLive(false);
    if (!ticketId || !supabase) return;
    let cancelled = false;
    setLoading(true);
    void reload().finally(() => !cancelled && setLoading(false));

    const channel = supabase
      .channel(`thread:${ticketId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_replies", filter: `message_id=eq.${ticketId}` }, (payload) => {
        const row = payload.new as ThreadMessage;
        if (row?.id) merge([{ id: row.id, author_kind: row.author_kind, author_name: row.author_name, body: row.body, is_internal: row.is_internal, created_at: row.created_at }]);
      })
      .subscribe((status) => !cancelled && setLive(status === "SUBSCRIBED"));

    return () => {
      cancelled = true;
      void supabase!.removeChannel(channel);
    };
  }, [ticketId, reload, merge]);

  // اگر کانال Realtime برقرار نشد، هر ۸ ثانیه به‌روزرسانی می‌شود
  useEffect(() => {
    if (!ticketId || live) return;
    const id = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(id);
  }, [ticketId, live, reload]);

  return { messages, loading, error, live, reload, merge };
}

/* ───────── حباب پیام ───────── */

export type ThreadMode = "user" | "staff";

function labelFor(m: ThreadMessage, mode: ThreadMode): string {
  if (m.author_kind === "ai") return "دستیار هوشمند (هوش مصنوعی)";
  if (m.author_kind === "system") return "سیستم";
  if (m.author_kind === "staff") return mode === "user" ? "پشتیبان آریاسازه" : m.author_name || "پشتیبان";
  return mode === "user" ? "شما" : m.author_name || "کاربر";
}

export function Bubble({ m, mode }: { m: ThreadMessage; mode: ThreadMode }) {
  const mine = mode === "user" ? m.author_kind === "user" : m.author_kind === "staff";
  const ai = m.author_kind === "ai";
  const system = m.author_kind === "system";
  if (system) {
    return <p className="mx-auto max-w-[90%] rounded-full bg-ink/5 px-4 py-1.5 text-center text-[13px] font-semibold text-body">{m.body}</p>;
  }
  return (
    <div className={cn("flex max-w-[88%] flex-col gap-1 sm:max-w-[78%]", mine ? "self-start" : "self-end")}>
      <span className={cn("flex items-center gap-1.5 text-[12.5px] font-bold", m.is_internal ? "text-[#8a5a14]" : "text-body")}>
        {ai ? <Bot className="h-3.5 w-3.5 text-steel" /> : m.is_internal ? <LockKeyhole className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
        {m.is_internal ? "یادداشت داخلی" : labelFor(m, mode)}
        {ai && <span className="rounded-full bg-steel/10 px-2 py-0.5 text-[11px] text-steel">AI</span>}
      </span>
      <p
        className={cn(
          "whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-7 shadow-chip [overflow-wrap:anywhere]",
          m.is_internal ? "border border-[#ecd29b] bg-[#fdf6e8] text-[#6b4a12]" : ai ? "border border-steel/15 bg-gradient-to-br from-white to-haze text-ink" : mine ? "bg-coral text-white" : "border border-white/80 bg-white text-ink"
        )}
      >
        {m.body}
      </p>
      <span className="text-[11.5px] text-fog">{when(m.created_at)}</span>
    </div>
  );
}

/* ───────── مکالمه‌ی تیکت (کاربر / کارمند) ───────── */

export function TicketThread({
  ticketId,
  first,
  mode,
  canReply = true,
  allowInternal = false,
  onSent,
}: {
  ticketId: string;
  first: { body: string; created_at: string; author_name: string | null };
  mode: ThreadMode;
  canReply?: boolean;
  allowInternal?: boolean;
  onSent?: () => void;
}) {
  const { messages, loading, error, live, reload } = useThread(ticketId);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sendingRef.current) return;
    const body = text.trim();
    if (!body) return;
    if (body.length > 5000) return setSendError("پیام نباید بیش از ۵۰۰۰ کاراکتر باشد.");
    sendingRef.current = true;
    setBusy(true);
    setSendError(null);
    let failure: string | null = null;
    if (mode === "user") {
      failure = (await rpc<string>("support_user_reply", { p_id: ticketId, p_body: body })).error;
    } else if (supabase) {
      const { data: auth } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("support_replies").insert({
        message_id: ticketId,
        author_id: auth.user?.id ?? null,
        body,
        is_internal: internal,
        author_kind: "staff",
        delivery_status: "sent",
      });
      if (insertError) failure = supportError(insertError);
    }
    setBusy(false);
    sendingRef.current = false;
    if (failure) return setSendError(failure);
    setText("");
    setInternal(false);
    await reload();
    onSent?.();
  };

  const firstMsg: ThreadMessage = { id: "first", author_kind: "user", author_name: first.author_name, body: first.body, created_at: first.created_at };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-body" aria-live="polite">
        <Radio className={cn("h-3.5 w-3.5", live ? "text-[#2f8d7c]" : "text-fog")} />
        {live ? "دریافت پیام‌ها به‌صورت زنده" : "به‌روزرسانی خودکار هر چند ثانیه"}
      </div>
      <div className="flex min-h-[18rem] flex-1 flex-col gap-4 overflow-y-auto rounded-3xl border border-white/80 bg-white/50 p-4" role="log" aria-label="مکالمه">
        <Bubble m={firstMsg} mode={mode} />
        {loading && <p className="flex items-center gap-2 text-[14px] text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت پیام‌ها…</p>}
        {error && <p role="alert" className="rounded-2xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold text-[#8f322d]">{error}</p>}
        {messages.map((m) => <Bubble key={m.id} m={m} mode={mode} />)}
        <div ref={endRef} />
      </div>

      {canReply ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit(e); }}
            rows={3}
            maxLength={5000}
            placeholder={mode === "user" ? "پاسخ خود را بنویسید…" : internal ? "یادداشت داخلی (برای کاربر قابل مشاهده نیست)…" : "پاسخ به کاربر…"}
            className="input-field min-h-24 py-3 leading-7"
            aria-label="متن پیام"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {allowInternal ? (
              <label className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-[#4a58a6]" />
                یادداشت داخلی (مخفی از کاربر)
              </label>
            ) : <span className="text-[12.5px] text-fog">Ctrl + Enter برای ارسال</span>}
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary min-h-11 px-5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              ارسال
            </button>
          </div>
          {sendError && <p role="alert" className="rounded-2xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold text-[#8f322d]">{sendError}</p>}
        </form>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-ink/5 px-4 py-3 text-[14px] font-semibold text-body"><ShieldAlert className="h-4 w-4" />امکان پاسخ برای این گفت‌وگو وجود ندارد.</p>
      )}
    </div>
  );
}
