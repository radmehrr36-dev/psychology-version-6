import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, HandHelping, Loader2, MessageSquarePlus, Send, ShieldAlert } from "lucide-react";
import { invokeFunction } from "../lib/gateway";
import { Bubble, useThread } from "./TicketThread";
import { rpc, type TicketDetail, type ThreadMessage } from "./api";

interface AiResponse {
  ok: boolean;
  error?: string;
  message?: string;
  ticket_id?: string;
  crisis?: boolean;
}

const WELCOME =
  "سلام! من دستیار هوشمند پشتیبانی آریاسازه‌ام. درباره‌ی استفاده از سایت، آزمون‌ها و گزارش‌ها می‌توانید از من بپرسید. هر زمان خواستید، گفت‌وگو را به پشتیبان انسانی ارجاع دهید.";

export function AiChat({ conversationId, onConversation, onHandoff, onNew }: { conversationId: string | null; onConversation: (id: string) => void; onHandoff: (id: string) => void; onNew: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [local, setLocal] = useState<ThreadMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const { messages, loading, reload } = useThread(conversationId);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    void rpc<boolean>("support_ai_status").then((r) => setEnabled(r.error ? false : Boolean(r.data)));
  }, []);

  useEffect(() => {
    setDetail(null);
    setLocal([]);
    setNotice(null);
    if (!conversationId) return;
    void rpc<TicketDetail[]>("support_ticket_get", { p_id: conversationId }).then((r) => setDetail(r.data?.[0] ?? null));
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, local.length, busy]);

  // ورود کارمند به گفت‌وگو، کانال را به «تیکت انسانی» تبدیل می‌کند؛ کاربر به صفحه‌ی همان تیکت می‌رود
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    void rpc<TicketDetail[]>("support_ticket_get", { p_id: conversationId }).then((r) => {
      if (r.data?.[0]?.channel === "ticket") onHandoff(conversationId);
    });
  }, [conversationId, messages.length, onHandoff]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (sendingRef.current) return;
    const message = text.trim();
    if (!message) return;
    if (!conversationId && message.length < 5) return setNotice("پیام را کمی کامل‌تر بنویسید.");
    sendingRef.current = true;
    setBusy(true);
    setNotice(null);
    setText("");
    setLocal((l) => [...l, { id: `local-${Date.now()}`, author_kind: "user", author_name: null, body: message, created_at: new Date().toISOString() }]);

    const res = await invokeFunction<AiResponse>("support-ai", { message, ticket_id: conversationId });
    sendingRef.current = false;
    setBusy(false);

    if (!res.ok) {
      setLocal([]);
      setText(message);
      return setNotice(res.message);
    }
    const data = res.data;
    if (!data.ok) {
      setLocal([]);
      setText(data.error === "ai_unavailable" ? message : "");
      if (data.ticket_id && data.ticket_id !== conversationId) onConversation(data.ticket_id);
      else await reload();
      return setNotice(data.message ?? "پاسخ‌گویی هوشمند موقتاً ممکن نیست.");
    }
    if (data.ticket_id && data.ticket_id !== conversationId) {
      onConversation(data.ticket_id);
    } else {
      await reload();
      setLocal([]);
    }
  };

  const handoff = async () => {
    if (!conversationId || handingOff) return;
    setHandingOff(true);
    const res = await rpc<null>("support_handoff", { p_id: conversationId });
    setHandingOff(false);
    if (res.error) return setNotice(res.error);
    onHandoff(conversationId);
  };

  const shown: ThreadMessage[] = [...messages, ...local.filter(() => !loading)];
  const first: ThreadMessage | null = detail ? { id: "first", author_kind: "user", author_name: null, body: detail.body, created_at: detail.created_at } : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {enabled === false && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl bg-[#fdf3e0] px-4 py-3 text-[14px] font-semibold leading-7 text-[#8a5a14]" role="status">
          <ShieldAlert className="mt-1 h-4 w-4 shrink-0" />
          دستیار هوشمند فعلاً فعال نیست. می‌توانید از تب «تیکت‌ها» با پشتیبان انسانی گفت‌وگو کنید.
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[14px] font-bold text-ink"><Bot className="h-4 w-4 text-steel" />گفت‌وگو با دستیار هوشمند</p>
        <div className="flex flex-wrap gap-2">
          {conversationId && (
            <button type="button" onClick={() => void handoff()} disabled={handingOff} className="btn-secondary min-h-10 px-4 text-[14px]">
              {handingOff ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHelping className="h-4 w-4" />}
              ارجاع به پشتیبان انسانی
            </button>
          )}
          <button type="button" onClick={onNew} className="btn-secondary min-h-10 px-4 text-[14px]"><MessageSquarePlus className="h-4 w-4" />گفت‌وگوی جدید</button>
        </div>
      </div>

      <div className="flex min-h-[20rem] flex-1 flex-col gap-4 overflow-y-auto rounded-3xl border border-white/80 bg-white/50 p-4" role="log" aria-label="گفت‌وگو با دستیار هوشمند">
        {!conversationId && local.length === 0 && <Bubble m={{ id: "welcome", author_kind: "ai", author_name: null, body: WELCOME, created_at: new Date().toISOString() }} mode="user" />}
        {first && <Bubble m={first} mode="user" />}
        {shown.map((m) => <Bubble key={m.id} m={m} mode="user" />)}
        {busy && <p className="flex items-center gap-2 self-end text-[14px] text-body" role="status"><Loader2 className="h-4 w-4 animate-spin" />دستیار در حال نوشتن…</p>}
        <div ref={endRef} />
      </div>

      {notice && <p role="alert" className="mt-3 rounded-2xl bg-[#fbeceb] px-4 py-2.5 text-[14px] font-semibold leading-7 text-[#8f322d]">{notice}</p>}

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(e); } }}
          rows={2}
          maxLength={2000}
          placeholder="سؤال خود را بنویسید…"
          className="input-field min-h-14 flex-1 py-3 leading-7"
          aria-label="پیام به دستیار هوشمند"
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary h-14 w-14 shrink-0 !px-0" aria-label="ارسال">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>

      <p className="mt-3 text-[12.5px] leading-6 text-fog">
        این دستیار هوش مصنوعی است و تشخیص یا درمان روان‌شناختی ارائه نمی‌دهد. در شرایط اضطراری با اورژانس ۱۱۵ یا اورژانس اجتماعی ۱۲۳ تماس بگیرید.
        گفت‌وگوها ذخیره می‌شوند و فقط در صورت ارجاع، برای تیم پشتیبانی قابل مشاهده‌اند.
      </p>
    </div>
  );
}
