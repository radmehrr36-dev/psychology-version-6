import { useEffect, useRef, useState } from "react";
import { Bot, Eye, Plus } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useList } from "../hooks";
import {
  AccessDenied,
  Button,
  Card,
  DataTable,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  StatusBadge,
  formatDate,
  inputClass,
  toFa,
  useToast,
  type Column,
} from "../ui";
import { TicketThread } from "../../support/TicketThread";
import type { SupportMessage } from "../../lib/types";

const CATEGORIES = [
  { value: "general", label: "عمومی" },
  { value: "technical", label: "فنی" },
  { value: "account", label: "حساب کاربری" },
  { value: "test", label: "آزمون" },
  { value: "billing", label: "پرداخت" },
  { value: "content", label: "محتوا" },
];

const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

interface Specialist {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function MessagesPage() {
  const { can, session } = useAuth();
  const { notify } = useToast();
  const canRead = can("support", "read");
  const canWrite = can("support", "write");
  const me = session?.user.id ?? null;

  const list = useList<SupportMessage>({
    table: "support_messages",
    select: "*",
    searchColumn: "subject",
    orderBy: "created_at",
    pageSize: 10,
    enabled: canRead,
  });
  const refreshRef = useRef(list.refresh);
  refreshRef.current = list.refresh;

  const [selected, setSelected] = useState<SupportMessage | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [manual, setManual] = useState({ subject: "", body: "", requester_name: "", requester_email: "", category: "general", priority: "normal" });

  // به‌روزرسانی زنده‌ی فهرست با Realtime (پیام/پاسخ جدید) — بدون refresh دستی
  useEffect(() => {
    if (!supabase || !canRead) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshRef.current(), 500);
    };
    const channel = supabase
      .channel(`admin-support:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_replies" }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [canRead]);

  // فهرست متخصصان پشتیبان فعال برای تخصیص (اگر مجوز خواندن کاربران نبود، فقط «واگذاری به من» می‌ماند)
  useEffect(() => {
    if (!supabase || !canRead) return;
    void supabase
      .from("profiles")
      .select("id,full_name,email")
      .eq("account_kind", "support_specialist")
      .eq("account_status", "active")
      .limit(100)
      .then(({ data, error }) => {
        if (!error) setSpecialists((data ?? []) as Specialist[]);
      });
  }, [canRead]);

  const openMessage = (message: SupportMessage) => {
    setSelected(message);
    setNoteDraft(message.internal_note ?? "");
  };

  const updateMessage = async (message: SupportMessage, patch: Partial<SupportMessage>, quiet = false) => {
    if (!supabase) return;
    setBusy("update");
    const { error } = await supabase.from("support_messages").update(patch).eq("id", message.id);
    setBusy(null);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    setSelected((cur) => (cur && cur.id === message.id ? { ...cur, ...patch } : cur));
    if (!quiet) notify("تیکت به‌روزرسانی شد.");
    list.refresh();
  };

  // ورود مدیر/کارمند به گفت‌وگوی AI: کانال به «تیکت انسانی» تبدیل می‌شود و کاربر به مکالمه‌ی انسانی منتقل می‌شود
  const afterStaffReply = async () => {
    if (selected && selected.channel === "ai") await updateMessage(selected, { channel: "ticket", status: "in_progress" }, true);
    else list.refresh();
  };

  const saveInternalNote = async () => {
    if (!supabase || !selected) return;
    setBusy("note");
    const { error } = await supabase.from("support_messages").update({ internal_note: noteDraft || null }).eq("id", selected.id);
    setBusy(null);
    if (error) return notify(friendlyError(error), "error");
    notify("یادداشت داخلی ذخیره شد.");
    setSelected({ ...selected, internal_note: noteDraft || null });
    list.refresh();
  };

  const createManual = async () => {
    if (!supabase) return;
    if (manual.subject.trim().length < 3 || manual.body.trim().length < 5) return notify("موضوع و متن پیام را کامل وارد کنید.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.requester_email.trim())) return notify("ایمیل درخواست‌دهنده معتبر نیست.", "error");
    setBusy("create");
    const { error } = await supabase.from("support_messages").insert({
      subject: manual.subject.trim(),
      body: manual.body.trim(),
      requester_name: manual.requester_name.trim() || null,
      requester_email: manual.requester_email.trim(),
      category: manual.category,
      priority: manual.priority,
      status: "new",
    });
    setBusy(null);
    if (error) return notify(friendlyError(error), "error");
    notify("پیام برای پیگیری ثبت شد.");
    setCreateOpen(false);
    setManual({ subject: "", body: "", requester_name: "", requester_email: "", category: "general", priority: "normal" });
    list.refresh();
  };

  const assigneeName = (id: string | null) => (!id ? "—" : id === me ? "من" : specialists.find((s) => s.id === id)?.full_name || "کارمند دیگر");

  const columns: Column<SupportMessage>[] = [
    {
      key: "subject",
      header: "موضوع",
      render: (m) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[12.5px] font-bold text-ink">
            {m.channel === "ai" && <Bot className="h-3.5 w-3.5 shrink-0 text-steel" aria-label="گفت‌وگوی دستیار هوشمند" />}
            {m.subject}
          </p>
          <p dir="ltr" className="truncate text-left text-[10.5px] text-body">{m.requester_email}</p>
        </div>
      ),
    },
    { key: "category", header: "دسته", render: (m) => <span className="text-[11.5px] text-body">{categoryLabel(m.category)}</span> },
    { key: "status", header: "وضعیت", render: (m) => <StatusBadge status={m.status} /> },
    { key: "priority", header: "اولویت", render: (m) => <StatusBadge status={m.priority} /> },
    { key: "assignee", header: "مسئول", render: (m) => <span className="text-[11.5px] text-body">{assigneeName(m.assigned_to)}</span> },
    { key: "created", header: "ثبت", render: (m) => <span className="whitespace-nowrap text-[11px] text-body">{formatDate(m.created_at)}</span> },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="پیام‌ها و گفت‌وگوهای پشتیبانی"
        description="تیکت‌های کاربران و گفت‌وگوهای دستیار هوشمند؛ پیام‌های جدید بدون refresh در لحظه می‌رسند و پاسخ شما همان لحظه برای کاربر نمایش داده می‌شود."
        breadcrumb={["پنل مدیریت", "پشتیبانی"]}
        actions={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />ثبت پیام دستی</Button> : null}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input type="search" value={list.search} onChange={(e) => list.setSearch(e.target.value)} placeholder="جست‌وجوی موضوع…" className={`${inputClass} max-w-xs`} aria-label="جست‌وجوی پیام" />
          <select value={list.filters.status ?? ""} onChange={(e) => list.setFilter("status", e.target.value)} className={`${inputClass} max-w-[10rem]`} aria-label="فیلتر وضعیت پیام">
            <option value="">وضعیت: همه</option>
            <option value="new">جدید</option>
            <option value="in_progress">در حال بررسی</option>
            <option value="answered">پاسخ داده‌شده</option>
            <option value="closed">بسته</option>
          </select>
          <select value={list.filters.priority ?? ""} onChange={(e) => list.setFilter("priority", e.target.value)} className={`${inputClass} max-w-[9rem]`} aria-label="فیلتر اولویت">
            <option value="">اولویت: همه</option>
            <option value="urgent">فوری</option>
            <option value="high">بالا</option>
            <option value="normal">عادی</option>
            <option value="low">پایین</option>
          </select>
          <select value={list.filters.channel ?? ""} onChange={(e) => list.setFilter("channel", e.target.value)} className={`${inputClass} max-w-[11rem]`} aria-label="فیلتر نوع گفت‌وگو">
            <option value="">نوع: همه</option>
            <option value="ticket">تیکت انسانی</option>
            <option value="ai">گفت‌وگوی دستیار هوشمند</option>
          </select>
          <span className="ms-auto text-[11.5px] text-body">{toFa(list.total)} مورد</span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="پیامی ثبت نشده است"
          emptyDescription="تیکت‌های کاربران و گفت‌وگوهای دستیار هوشمند اینجا نمایش داده می‌شوند."
          rowActions={(m) => (
            <button type="button" onClick={() => openMessage(m)} className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-bold text-steel hover:bg-steel/10">
              <Eye className="h-3.5 w-3.5" />
              گفت‌وگو و پاسخ
            </button>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && <Pagination page={list.page} pageSize={10} total={list.total} onPage={list.setPage} />}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-label="گفت‌وگوی پشتیبانی" className="w-full max-w-3xl rounded-3xl bg-cream p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
                  {selected.channel === "ai" && <Bot className="h-4 w-4 text-steel" />}
                  {selected.subject}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-body">
                  {selected.requester_name || "بدون نام"} · <span dir="ltr">{selected.requester_email}</span> · {formatDate(selected.created_at, true)} · {categoryLabel(selected.category)}
                  {selected.channel === "ai" ? " · گفت‌وگوی دستیار هوشمند (پاسخ شما آن را به تیکت انسانی تبدیل می‌کند)" : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>بستن</Button>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <Field label="وضعیت">
                <select className={inputClass} value={selected.status} disabled={!canWrite || busy === "update"} onChange={(e) => void updateMessage(selected, { status: e.target.value as SupportMessage["status"] })}>
                  <option value="new">جدید</option>
                  <option value="in_progress">در حال بررسی</option>
                  <option value="answered">پاسخ داده‌شده</option>
                  <option value="closed">بسته</option>
                </select>
              </Field>
              <Field label="اولویت">
                <select className={inputClass} value={selected.priority} disabled={!canWrite || busy === "update"} onChange={(e) => void updateMessage(selected, { priority: e.target.value as SupportMessage["priority"] })}>
                  <option value="low">پایین</option>
                  <option value="normal">عادی</option>
                  <option value="high">بالا</option>
                  <option value="urgent">فوری</option>
                </select>
              </Field>
              <Field label="مسئول رسیدگی">
                <select className={inputClass} value={selected.assigned_to ?? ""} disabled={!canWrite || busy === "update"} onChange={(e) => void updateMessage(selected, { assigned_to: e.target.value || null, ...(e.target.value ? { status: "in_progress" as const } : {}) })}>
                  <option value="">بدون مسئول</option>
                  {me && <option value={me}>من</option>}
                  {specialists.filter((s) => s.id !== me).map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email || "متخصص پشتیبان"}</option>)}
                </select>
              </Field>
            </div>

            <div className="flex max-h-[58vh] min-h-[24rem] flex-col rounded-3xl bg-white/60 p-3">
              <TicketThread
                key={selected.id}
                ticketId={selected.id}
                mode="staff"
                allowInternal
                canReply={canWrite}
                first={{ body: selected.body, created_at: selected.created_at, author_name: selected.requester_name }}
                onSent={() => void afterStaffReply()}
              />
            </div>

            {canWrite && (
              <div className="mt-4 space-y-2">
                <Field label="یادداشت داخلی تیکت" hint="فقط کارکنان می‌بینند؛ برای کاربر قابل مشاهده نیست.">
                  <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} className={`${inputClass} leading-6`} />
                </Field>
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void saveInternalNote()} loading={busy === "note"}>ذخیره‌ی یادداشت</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => busy !== "create" && setCreateOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="ثبت پیام دستی" className="w-full max-w-lg rounded-3xl bg-cream p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">ثبت پیام پشتیبانی</h2>
            <p className="mb-4 text-[11.5px] leading-6 text-body">برای درخواست‌های تلفنی یا حضوری که کارمند پشتیبانی ثبت می‌کند.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="موضوع" required><input value={manual.subject} onChange={(e) => setManual({ ...manual, subject: e.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="نام درخواست‌دهنده"><input value={manual.requester_name} onChange={(e) => setManual({ ...manual, requester_name: e.target.value })} className={inputClass} /></Field>
              <Field label="ایمیل" required><input type="email" dir="ltr" value={manual.requester_email} onChange={(e) => setManual({ ...manual, requester_email: e.target.value })} className={`${inputClass} text-left`} /></Field>
              <Field label="دسته">
                <select value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })} className={inputClass}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="اولویت">
                <select value={manual.priority} onChange={(e) => setManual({ ...manual, priority: e.target.value })} className={inputClass}>
                  <option value="low">پایین</option>
                  <option value="normal">عادی</option>
                  <option value="high">بالا</option>
                  <option value="urgent">فوری</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="متن پیام" required><textarea rows={4} value={manual.body} onChange={(e) => setManual({ ...manual, body: e.target.value })} className={`${inputClass} leading-6`} /></Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy === "create"}>انصراف</Button>
              <Button onClick={() => void createManual()} loading={busy === "create"}>ثبت پیام</Button>
            </div>
          </div>
        </div>
      )}
      {list.error && <div className="sr-only"><ErrorState message={list.error} /></div>}
    </>
  );
}
