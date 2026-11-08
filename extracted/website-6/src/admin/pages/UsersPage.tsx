import { useCallback, useEffect, useState } from "react";
import { Eye, MessageSquarePlus, ShieldBan, ShieldCheck } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
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
import {
  accountKindLabels,
  accountStatusLabels,
  roleLabels,
  type AccountKind,
  type AccountStatus,
  type AppRole,
  type Profile,
} from "../../lib/types";

interface Note {
  id: string;
  note: string;
  author_email: string | null;
  created_at: string;
}

const PAGE_SIZE = 10;
const SELECT =
  "id,email,full_name,avatar_url,role,account_status,account_kind,username,phone,phone_verified_at,contact_verified_at,last_seen_at,created_at,updated_at";

function sanitizeTerm(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function kindLabel(k: Profile["account_kind"]) {
  return k && k in accountKindLabels ? accountKindLabels[k] : "کاربر عادی";
}

export function UsersPage() {
  const { can, profile: me } = useAuth();
  const { notify } = useToast();
  const canRead = can("users", "read");
  const canWrite = can("users", "write");
  const canAdmins = can("admins", "write");
  const canNotes = can("support", "read");

  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [nonce, setNonce] = useState(0);

  const [selected, setSelected] = useState<Profile | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Profile | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [kindDraft, setKindDraft] = useState<AccountKind>("user");
  const [kindBusy, setKindBusy] = useState(false);
  const [kindConfirm, setKindConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!canRead || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from("profiles").select(SELECT, { count: "exact" });
      const term = sanitizeTerm(search);
      if (term) {
        const like = `%${term}%`;
        const filters = [`full_name.ilike.${like}`, `email.ilike.${like}`, `username.ilike.${like}`, `phone.ilike.${like}`];
        if (/^[0-9a-f-]{8,36}$/i.test(term)) filters.push(`id.eq.${term}`);
        query = query.or(filters.join(","));
      }
      if (statusFilter) query = query.eq("account_status", statusFilter);
      if (kindFilter) query = query.eq("account_kind", kindFilter);
      const from = page * PAGE_SIZE;
      const { data, count, error: queryError } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (queryError) throw queryError;
      setRows((data ?? []) as Profile[]);
      setTotal(count ?? 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [canRead, search, statusFilter, kindFilter, page, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetails = async (user: Profile) => {
    setSelected(user);
    setKindDraft((user.account_kind as AccountKind) || "user");
    setNewNote("");
    setNotes([]);
    if (!canNotes || !supabase) return;
    setNotesLoading(true);
    const { data, error: notesError } = await supabase.from("user_notes").select("id,note,author_email,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    setNotesLoading(false);
    if (notesError) {
      notify(friendlyError(notesError), "error");
      return;
    }
    setNotes((data ?? []) as Note[]);
  };

  const addNote = async () => {
    if (!selected || !supabase) return;
    if (newNote.trim().length < 3) return notify("یادداشت باید حداقل ۳ کاراکتر باشد.", "error");
    setSavingNote(true);
    const { error: rpcError } = await supabase.rpc("admin_add_user_note", { p_user_id: selected.id, p_note: newNote.trim() });
    setSavingNote(false);
    if (rpcError) return notify(friendlyError(rpcError), "error");
    notify("یادداشت داخلی ثبت شد.");
    setNewNote("");
    const { data } = await supabase.from("user_notes").select("id,note,author_email,created_at").eq("user_id", selected.id).order("created_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
  };

  const changeStatus = async () => {
    if (!statusTarget || !supabase) return;
    setStatusBusy(true);
    const next: AccountStatus = statusTarget.account_status === "suspended" ? "active" : "suspended";
    const { error: rpcError } = await supabase.rpc("admin_set_account_status", { p_user_id: statusTarget.id, p_status: next, p_reason: null });
    setStatusBusy(false);
    if (rpcError) return notify(friendlyError(rpcError), "error");
    notify(next === "suspended" ? "حساب کاربر مسدود شد." : "حساب کاربر فعال شد.");
    setStatusTarget(null);
    setNonce((n) => n + 1);
    setSelected((prev) => (prev && prev.id === statusTarget.id ? { ...prev, account_status: next } : prev));
  };

  const changeKind = async () => {
    if (!selected || !supabase) return;
    setKindBusy(true);
    const { error: rpcError } = await supabase.rpc("admin_set_account_kind", { p_user_id: selected.id, p_kind: kindDraft });
    setKindBusy(false);
    setKindConfirm(false);
    if (rpcError) return notify(friendlyError(rpcError), "error");
    notify("نوع حساب به‌روزرسانی شد.");
    setSelected({ ...selected, account_kind: kindDraft });
    setNonce((n) => n + 1);
  };

  const columns: Column<Profile>[] = [
    {
      key: "user",
      header: "کاربر",
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-ink">{u.full_name || "بدون نام"}</p>
          <p dir="ltr" className="truncate text-left text-[11px] text-body">{u.username ? `@${u.username}` : u.email ?? "—"}</p>
        </div>
      ),
    },
    { key: "kind", header: "نوع حساب", render: (u) => <span className="text-[12px] font-semibold">{kindLabel(u.account_kind)}</span> },
    {
      key: "role",
      header: "نقش مدیریتی",
      render: (u) => (u.role ? <span className="text-[12px] font-semibold">{roleLabels[u.role as AppRole]}</span> : <span className="text-[11px] text-body">—</span>),
    },
    { key: "status", header: "وضعیت", render: (u) => <StatusBadge status={u.account_status} /> },
    {
      key: "verified",
      header: "تأیید",
      render: (u) => (
        <span className="text-[11.5px] text-body">{u.contact_verified_at ? "تأییدشده" : u.contact_verified_at === null ? "در انتظار OTP" : "—"}</span>
      ),
    },
    { key: "created", header: "ثبت‌نام", render: (u) => <span className="whitespace-nowrap text-[11.5px] text-body">{formatDate(u.created_at)}</span> },
  ];

  if (!canRead) return <AccessDenied />;

  const suspendTargetName = statusTarget?.full_name || statusTarget?.email || "این کاربر";
  const suspending = statusTarget?.account_status !== "suspended";

  return (
    <>
      <PageHeader
        title="کاربران"
        description="فهرست پروفایل‌های واقعی ثبت‌شده در Supabase. رمز عبور و توکن نشست هرگز نمایش داده نمی‌شوند. تغییر نقش مدیریتی از صفحه‌ی «مدیران و دسترسی‌ها» انجام می‌شود."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="جست‌وجوی نام، نام کاربری، موبایل، ایمیل یا شناسه…"
            className={`${inputClass} max-w-sm`}
            aria-label="جست‌وجوی کاربر"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className={`${inputClass} max-w-[11rem]`}
            aria-label="فیلتر وضعیت حساب"
          >
            <option value="">وضعیت: همه</option>
            {Object.entries(accountStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value);
              setPage(0);
            }}
            className={`${inputClass} max-w-[12rem]`}
            aria-label="فیلتر نوع حساب"
          >
            <option value="">نوع حساب: همه</option>
            {Object.entries(accountKindLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="ms-auto text-[11.5px] text-body">{toFa(total)} رکورد</span>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={() => setNonce((n) => n + 1)}
          emptyTitle="کاربری یافت نشد"
          emptyDescription="با تغییر جست‌وجو یا فیلتر دوباره تلاش کنید."
          rowActions={(u) => (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void openDetails(u)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10" aria-label={`مشاهده‌ی ${u.email ?? "کاربر"}`} title="جزئیات">
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
        {!loading && !error && total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
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
                <dt className="text-body">نوع حساب</dt>
                <dd className="mt-0.5 font-bold text-ink">{kindLabel(selected.account_kind)}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">نقش مدیریتی</dt>
                <dd className="mt-0.5 font-bold text-ink">{selected.role ? roleLabels[selected.role as AppRole] : "—"}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">وضعیت حساب</dt>
                <dd className="mt-1"><StatusBadge status={selected.account_status} /></dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">تأیید تماس</dt>
                <dd className="mt-0.5 font-bold text-ink">{selected.contact_verified_at ? formatDate(selected.contact_verified_at, true) : selected.contact_verified_at === null ? "در انتظار OTP" : "نامشخص"}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">نام کاربری</dt>
                <dd dir="ltr" className="mt-0.5 truncate text-left font-bold text-ink">{selected.username || "—"}</dd>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-2.5">
                <dt className="text-body">موبایل</dt>
                <dd dir="ltr" className="mt-0.5 truncate text-left font-bold text-ink">{selected.phone || "—"}</dd>
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

            {canAdmins && selected.id !== me?.id && (
              <div className="mb-4 rounded-lg border border-ink/8 p-3">
                <Field label="تغییر نوع حساب" hint="این عملیات سمت سرور بررسی مجوز می‌شود و در رویدادهای مدیریتی ثبت می‌گردد. نقش مدیریتی از این مسیر اعطا نمی‌شود.">
                  <div className="flex flex-wrap items-center gap-2">
                    <select className={inputClass} value={kindDraft} onChange={(e) => setKindDraft(e.target.value as AccountKind)} disabled={kindBusy}>
                      {Object.entries(accountKindLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <Button size="sm" disabled={kindDraft === (selected.account_kind || "user")} onClick={() => setKindConfirm(true)}>اعمال</Button>
                  </div>
                </Field>
              </div>
            )}

            {canNotes ? (
              <>
                <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
                  <MessageSquarePlus className="h-4 w-4 text-steel" />
                  یادداشت داخلی پشتیبانی
                </h3>
                <div className="mb-3">
                  <Field label="یادداشت جدید" hint="این یادداشت فقط برای کارکنان دارای مجوز پشتیبانی قابل مشاهده است.">
                    <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3} maxLength={2000} className={inputClass} placeholder="مثلاً: درخواست بازیابی حساب از طریق ایمیل پیگیری شد." />
                  </Field>
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={() => void addNote()} loading={savingNote}>ثبت یادداشت</Button>
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
                        <p className="mt-1 text-[10px] text-body">{n.author_email ?? "—"} · {formatDate(n.created_at, true)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-[#f8fafc] p-3 text-[11.5px] leading-6 text-body">یادداشت‌های داخلی فقط برای نقش‌های دارای مجوز پشتیبانی نمایش داده می‌شوند.</p>
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
      <ConfirmDialog
        open={kindConfirm}
        title="تغییر نوع حساب"
        description={`نوع حساب «${selected?.full_name || selected?.email || "این کاربر"}» به «${accountKindLabels[kindDraft]}» تغییر می‌کند. نقش مدیریتی اعطا نمی‌شود. ادامه می‌دهید؟`}
        confirmLabel="تغییر بده"
        busy={kindBusy}
        onCancel={() => setKindConfirm(false)}
        onConfirm={() => void changeKind()}
      />
      {error && <div className="sr-only"><ErrorState message={error} /></div>}
    </>
  );
}
