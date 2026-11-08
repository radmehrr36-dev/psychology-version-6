import { useState } from "react";
import { Eye, MessageSquarePlus, ShieldBan, ShieldCheck } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useList } from "../hooks";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  formatDate,
  useToast,
  toFa,
  type Column,
} from "../ui";
import { accountStatusLabels, roleLabels, type AppRole, type Profile } from "../../lib/types";

interface Note {
  id: string;
  note: string;
  author_email: string | null;
  created_at: string;
}

export function UsersPage() {
  const { can, profile: me } = useAuth();
  const { notify } = useToast();
  const canRead = can("users", "read");
  const canWrite = can("users", "write");
  const canNotes = can("support", "read");

  const list = useList<Profile>({
    table: "profiles",
    select: "id,email,full_name,avatar_url,role,account_status,last_seen_at,created_at,updated_at",
    searchColumn: "email",
    orderBy: "created_at",
    pageSize: 10,
    enabled: canRead,
  });

  const [selected, setSelected] = useState<Profile | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Profile | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const openDetails = async (user: Profile) => {
    setSelected(user);
    setNewNote("");
    setNotes([]);
    if (!canNotes || !supabase) return;
    setNotesLoading(true);
    const { data, error } = await supabase
      .from("user_notes")
      .select("id,note,author_email,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotesLoading(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    setNotes((data ?? []) as Note[]);
  };

  const addNote = async () => {
    if (!selected || !supabase) return;
    if (newNote.trim().length < 3) {
      notify("یادداشت باید حداقل ۳ کاراکتر باشد.", "error");
      return;
    }
    setSavingNote(true);
    const { error } = await supabase.rpc("admin_add_user_note", { p_user_id: selected.id, p_note: newNote.trim() });
    setSavingNote(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify("یادداشت داخلی ثبت شد.");
    setNewNote("");
    const { data } = await supabase
      .from("user_notes")
      .select("id,note,author_email,created_at")
      .eq("user_id", selected.id)
      .order("created_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
  };

  const changeStatus = async () => {
    if (!statusTarget || !supabase) return;
    setStatusBusy(true);
    const next = statusTarget.account_status === "suspended" ? "active" : "suspended";
    const { error } = await supabase.rpc("admin_set_account_status", {
      p_user_id: statusTarget.id,
      p_status: next,
      p_reason: null,
    });
    setStatusBusy(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify(next === "suspended" ? "حساب کاربر مسدود شد." : "حساب کاربر فعال شد.");
    setStatusTarget(null);
    list.refresh();
    setSelected((prev) => (prev ? { ...prev, account_status: next } : prev));
  };

  const columns: Column<Profile>[] = [
    {
      key: "user",
      header: "کاربر",
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-ink">{u.full_name || "بدون نام"}</p>
          <p dir="ltr" className="truncate text-left text-[11px] text-body">{u.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "نقش",
      render: (u) => (u.role ? <span className="text-[12px] font-semibold">{roleLabels[u.role as AppRole]}</span> : <span className="text-[11px] text-body">کاربر عادی</span>),
    },
    { key: "status", header: "وضعیت حساب", render: (u) => <StatusBadge status={u.account_status} /> },
    { key: "created", header: "تاریخ ثبت‌نام", render: (u) => <span className="whitespace-nowrap text-[11.5px] text-body">{formatDate(u.created_at)}</span> },
    {
      key: "seen",
      header: "آخرین فعالیت",
      render: (u) => <span className="whitespace-nowrap text-[11.5px] text-body">{formatDate(u.last_seen_at, true)}</span>,
    },
  ];

  if (!canRead) return <AccessDenied />;

  const suspendTargetName = statusTarget?.full_name || statusTarget?.email || "این کاربر";
  const suspending = statusTarget?.account_status !== "suspended";

  return (
    <>
      <PageHeader
        title="کاربران"
        description="فهرست پروفایل‌های ثبت‌شده در Supabase. رمز عبور، توکن نشست و پاسخ‌های خصوصی آزمون در هیچ‌کدام از فیلدها ذخیره یا نمایش داده نمی‌شوند."
      />

      <div className="mb-4 rounded-lg border border-steel/15 bg-steel/5 px-3.5 py-2.5 text-[11.5px] leading-6 text-body">
        وضعیت تأیید ایمیل توسط Supabase Auth مدیریت می‌شود و از طریق کلید anon قابل خواندن نیست؛ بنابراین در این جدول
        نمایش داده نمی‌شود. حذف فوری کاربر غیرفعال است؛ به‌جای آن حساب <strong className="text-ink">مسدود/فعال</strong> می‌شود
        تا الزامات نگهداری داده رعایت شود.
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input
            type="search"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="جست‌وجو با ایمیل…"
            className={`${inputClass} max-w-xs`}
            aria-label="جست‌وجوی کاربر"
            dir="ltr"
          />
          <select
            value={list.filters.account_status ?? ""}
            onChange={(e) => list.setFilter("account_status", e.target.value)}
            className={`${inputClass} max-w-[11rem]`}
            aria-label="فیلتر وضعیت حساب"
          >
            <option value="">وضعیت: همه</option>
            {Object.entries(accountStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="ms-auto text-[11.5px] text-body">{toFa(list.total)} رکورد</span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="کاربری یافت نشد"
          emptyDescription="با تغییر جست‌وجو یا فیلتر وضعیت دوباره تلاش کنید."
          rowActions={(u) => (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void openDetails(u)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10"
                aria-label={`مشاهده‌ی ${u.email ?? "کاربر"}`}
                title="جزئیات"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {canWrite && u.id !== me?.id && u.role !== "super_admin" && (
                <button
                  type="button"
                  onClick={() => setStatusTarget(u)}
                  className={`flex min-h-9 min-w-9 items-center justify-center rounded-md ${u.account_status === "suspended" ? "text-[#2f7d6e] hover:bg-[#e5f4ef]" : "text-[#a33a34] hover:bg-[#fbeceb]"}`}
                  aria-label={u.account_status === "suspended" ? "فعال‌سازی حساب" : "مسدودسازی حساب"}
                  title={u.account_status === "suspended" ? "فعال‌سازی" : "مسدودسازی"}
                >
                  {u.account_status === "suspended" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldBan className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={10} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-label="جزئیات کاربر" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-extrabold text-ink">{selected.full_name || "بدون نام"}</h2>
                <p dir="ltr" className="truncate text-left text-[11.5px] text-body">{selected.email}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>بستن</Button>
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-2 text-[11.5px]">
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">نقش</dt>
                <dd className="mt-0.5 font-bold text-ink">{selected.role ? roleLabels[selected.role as AppRole] : "کاربر عادی"}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">وضعیت حساب</dt>
                <dd className="mt-1"><StatusBadge status={selected.account_status} /></dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">تاریخ ثبت‌نام</dt>
                <dd className="mt-0.5 font-bold text-ink">{formatDate(selected.created_at, true)}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">شناسه</dt>
                <dd dir="ltr" className="mt-0.5 truncate text-left font-mono text-[10.5px] text-ink">{selected.id}</dd>
              </div>
            </dl>

            {canNotes ? (
              <>
                <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
                  <MessageSquarePlus className="h-4 w-4 text-steel" />
                  یادداشت داخلی پشتیبانی
                </h3>
                <div className="mb-3">
                  <Field label="یادداشت جدید" hint="این یادداشت فقط برای کارکنان دارای مجوز پشتیبانی قابل مشاهده است.">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className={inputClass}
                      placeholder="مثلاً: درخواست بازیابی حساب از طریق ایمیل پیگیری شد."
                    />
                  </Field>
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={() => void addNote()} loading={savingNote} disabled={!canWrite && !canNotes}>
                      ثبت یادداشت
                    </Button>
                  </div>
                </div>

                {notesLoading ? (
                  <LoadingState label="دریافت یادداشت‌ها…" />
                ) : notes.length === 0 ? (
                  <EmptyState title="یادداشتی ثبت نشده است" />
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto">
                    {notes.map((n) => (
                      <li key={n.id} className="rounded-lg border border-ink/8 bg-[#f9fbfd] p-2.5">
                        <p className="text-[12px] leading-6 text-ink">{n.note}</p>
                        <p className="mt-1 text-[10px] text-body">
                          {n.author_email ?? "—"} · {formatDate(n.created_at, true)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-[#f8fafc] p-3 text-[11.5px] leading-6 text-body">
                یادداشت‌های داخلی فقط برای نقش‌های دارای مجوز پشتیبانی نمایش داده می‌شوند.
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={suspending ? "مسدودسازی حساب" : "فعال‌سازی حساب"}
        description={
          suspending
            ? `حساب «${suspendTargetName}» مسدود می‌شود و از دسترسی به پنل و داده‌های خود بازمی‌ماند. سوابق داده حذف نمی‌شود. ادامه می‌دهید؟`
            : `حساب «${suspendTargetName}» دوباره فعال می‌شود. ادامه می‌دهید؟`
        }
        confirmLabel={suspending ? "مسدود کن" : "فعال کن"}
        dangerous={suspending}
        busy={statusBusy}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => void changeStatus()}
      />
      {list.error && <div className="sr-only"><ErrorState message={list.error} /></div>}
    </>
  );
}
