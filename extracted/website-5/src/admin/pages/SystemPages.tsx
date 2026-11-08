import { useCallback, useEffect, useState } from "react";
import { Activity, Globe2, KeyRound, Pencil, Plus, RefreshCw, Settings, ShieldAlert, Trash2 } from "lucide-react";
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
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  formatDate,
  inputClass,
  toFa,
  useToast,
  type Column,
} from "../ui";
import type { AuditLog, Category, ServiceSetting, SiteSetting } from "../../lib/types";

/* ─────────────────────────── سرویس‌ها و API ─────────────────────────── */
interface ServiceDraft {
  name: string;
  provider: string;
  model: string;
  secret_name: string;
  config: string;
  monthly_cap_irr: string;
  is_enabled: boolean;
}

const emptyService: ServiceDraft = {
  name: "",
  provider: "",
  model: "",
  secret_name: "",
  config: "{}",
  monthly_cap_irr: "",
  is_enabled: false,
};

export function ApiSettingsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canRead = can("settings", "api");
  const [rows, setRows] = useState<ServiceSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceSetting | null>(null);
  const [draft, setDraft] = useState<ServiceDraft>(emptyService);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, { configured: boolean; masked: string | null }>>({});
  const [deleteTarget, setDeleteTarget] = useState<ServiceSetting | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("service_settings").select("*").order("name");
    setLoading(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    setRows((data ?? []) as ServiceSetting[]);
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const invoke = async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error("Supabase پیکربندی نشده است.");
    const { data, error: err } = await supabase.functions.invoke("admin", { body });
    if (err) {
      let message = err.message;
      try {
        const ctx = (err as { context?: Response }).context;
        if (ctx) {
          const parsed = await ctx.json();
          if (typeof parsed?.error === "string") message = parsed.error;
        }
      } catch {
        /* ignore */
      }
      if (/Failed to send a request|not found|404/i.test(message)) {
        throw new Error("Edge Function «admin» مستقر نشده است؛ با دستور «supabase functions deploy admin» فعال کنید.");
      }
      throw new Error(message);
    }
    return data as { configured?: boolean; masked?: string | null; status?: string } | null;
  };

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyService);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: ServiceSetting) => {
    setEditing(s);
    setDraft({
      name: s.name,
      provider: s.provider,
      model: s.model ?? "",
      secret_name: s.secret_name ?? "",
      config: JSON.stringify(s.config ?? {}, null, 2),
      monthly_cap_irr: s.monthly_cap_irr?.toString() ?? "",
      is_enabled: s.is_enabled,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    if (!supabase) return;
    if (!draft.name.trim() || !draft.provider.trim()) {
      setFormError("نام سرویس و ارائه‌دهنده الزامی است.");
      return;
    }
    if (draft.secret_name && !/^[A-Z0-9_]{3,64}$/.test(draft.secret_name)) {
      setFormError("نام متغیر محرمانه باید فقط شامل حروف بزرگ، عدد و زیرخط باشد (مثال: OPENAI_API_KEY).");
      return;
    }
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(draft.config || "{}") as Record<string, unknown>;
    } catch {
      setFormError("تنظیمات باید JSON معتبر باشد.");
      return;
    }
    if (JSON.stringify(config).match(/api[_-]?key|secret|token|password/i)) {
      setFormError("کلید یا توکن محرمانه را در config ذخیره نکنید؛ فقط نام متغیر محیطی را وارد کنید.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      name: draft.name.trim(),
      provider: draft.provider.trim(),
      model: draft.model.trim() || null,
      secret_name: draft.secret_name.trim() || null,
      config,
      is_enabled: draft.is_enabled,
      monthly_cap_irr: draft.monthly_cap_irr ? Number(draft.monthly_cap_irr) : null,
    };
    try {
      const query = editing
        ? supabase.from("service_settings").update(payload).eq("id", editing.id)
        : supabase.from("service_settings").insert(payload);
      const { error: err } = await query;
      if (err) throw err;
      notify(editing ? "تنظیمات سرویس ذخیره شد." : "سرویس ثبت شد.");
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (s: ServiceSetting) => {
    if (!supabase) return;
    setBusyId(s.id);
    const { error: err } = await supabase.from("service_settings").update({ is_enabled: !s.is_enabled }).eq("id", s.id);
    setBusyId(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify(!s.is_enabled ? "سرویس فعال شد." : "سرویس غیرفعال شد.");
    await load();
  };

  const checkSecret = async (s: ServiceSetting) => {
    if (!s.secret_name) {
      notify("برای این سرویس نام متغیر محرمانه ثبت نشده است.", "error");
      return;
    }
    setBusyId(s.id);
    try {
      const res = await invoke({ action: "secret_status", payload: { secret_name: s.secret_name } });
      setSecrets((prev) => ({ ...prev, [s.id]: { configured: Boolean(res?.configured), masked: res?.masked ?? null } }));
      notify(res?.configured ? "کلید در secrets سرور موجود است." : "کلیدی با این نام در secrets سرور پیدا نشد.", res?.configured ? "success" : "error");
    } catch (e) {
      notify(e instanceof Error ? e.message : "بررسی کلید ناموفق بود.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const checkConnection = async (s: ServiceSetting) => {
    setBusyId(s.id);
    try {
      const res = await invoke({ action: "service_check", payload: { service_id: s.id } });
      notify(
        res?.status === "ok"
          ? "اتصال سرویس موفق بود."
          : res?.status === "unconfigured"
            ? "سرویس پیکربندی نشده است (کلید یا آدرس بررسی سلامت موجود نیست)."
            : "اتصال سرویس ناموفق بود؛ جزئیات در ستون وضعیت ثبت شد.",
        res?.status === "ok" ? "success" : "error"
      );
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "بررسی اتصال ناموفق بود.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!supabase || !deleteTarget) return;
    setDeleteBusy(true);
    const { error: err } = await supabase.from("service_settings").delete().eq("id", deleteTarget.id);
    setDeleteBusy(false);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("سرویس حذف شد.");
    setDeleteTarget(null);
    await load();
  };

  const columns: Column<ServiceSetting>[] = [
    {
      key: "name",
      header: "سرویس",
      render: (s) => (
        <div>
          <p className="text-[12.5px] font-bold text-ink">{s.name}</p>
          <p dir="ltr" className="text-left text-[10.5px] text-body">{s.provider}{s.model ? ` · ${s.model}` : ""}</p>
        </div>
      ),
    },
    { key: "enabled", header: "فعال", render: (s) => <StatusBadge status={s.is_enabled ? "active" : "draft"} /> },
    {
      key: "secret",
      header: "کلید محرمانه",
      render: (s) => (
        <div className="text-[11px]">
          <p dir="ltr" className="font-mono text-left text-[10.5px] text-body">{s.secret_name ?? "—"}</p>
          {secrets[s.id] ? (
            <p className={secrets[s.id].configured ? "text-[#2f7d6e]" : "text-[#a33a34]"}>
              {secrets[s.id].configured ? `موجود در سرور (${secrets[s.id].masked ?? ""})` : "در secrets سرور موجود نیست"}
            </p>
          ) : (
            <p className="text-fog">وضعیت کلید بررسی نشده است</p>
          )}
        </div>
      ),
    },
    {
      key: "last",
      header: "آخرین بررسی",
      render: (s) => (
        <div className="text-[11px]">
          <StatusBadge status={s.last_check_status ?? "unconfigured"} />
          <p className="mt-1 text-[10px] text-body">{s.last_check_at ? formatDate(s.last_check_at, true) : "هرگز بررسی نشده"}</p>
          {s.last_error && <p className="mt-0.5 max-w-[14rem] truncate text-[10px] text-[#a33a34]" title={s.last_error}>{s.last_error}</p>}
        </div>
      ),
    },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="سرویس‌ها و API"
        description="تنظیمات غیرمحرمانه‌ی سرویس‌های خارجی. کلیدهای API فقط در secrets سمت سرور نگهداری می‌شوند و در مرورگر نمایش داده نمی‌شوند."
        actions={
          can("settings", "api") ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              سرویس جدید
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-steel/15 bg-steel/5 px-3.5 py-2.5 text-[11.5px] leading-6 text-body">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-steel" />
        روش امن: <code dir="ltr" className="mx-1">supabase secrets set MY_API_KEY=...</code> و سپس ثبت فقط «نام متغیر» در این صفحه.
        دکمه‌ی بررسی اتصال فقط زمانی نتیجه‌ی موفق نشان می‌دهد که درخواست واقعی سمت سرور موفق شود؛ در غیر این صورت وضعیت
        «پیکربندی نشده» یا «ناموفق» ثبت می‌شود.
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
          <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
            <Globe2 className="h-4 w-4 text-steel" />
            سرویس‌های ثبت‌شده
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />به‌روزرسانی</Button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={load}
          emptyTitle="سرویسی ثبت نشده است"
          emptyDescription="برای اتصال دستیار هوشمند، نام سرویس و نام متغیر محرمانه‌ی آن را ثبت کنید. تا پیکربندی کلید در سرور، وضعیت «پیکربندی نشده» است."
          rowActions={(s) => (
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => void toggleEnabled(s)} loading={busyId === s.id}>{s.is_enabled ? "غیرفعال" : "فعال"}</Button>
              <Button size="sm" variant="ghost" onClick={() => void checkSecret(s)}>بررسی کلید</Button>
              <Button size="sm" variant="ghost" onClick={() => void checkConnection(s)}>بررسی اتصال</Button>
              <button type="button" onClick={() => openEdit(s)} className="flex h-9 w-9 items-center justify-center rounded text-steel hover:bg-steel/10" aria-label="ویرایش سرویس"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setDeleteTarget(s)} className="flex h-9 w-9 items-center justify-center rounded text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف سرویس"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        />
        <p className="border-t border-ink/8 px-4 py-2.5 text-[11px] leading-5 text-body">
          سقف مصرف فقط در صورت پشتیبانی واقعی سرویس معنا دارد و در این نسخه صرفاً عدد پیکربندی است؛ هیچ مصرف ساختگی
          نمایش داده نمی‌شود.
        </p>
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setFormOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="فرم سرویس" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{editing ? "ویرایش سرویس" : "سرویس جدید"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام سرویس" required><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} placeholder="دستیار هوشمند" /></Field>
              <Field label="ارائه‌دهنده" required><input dir="ltr" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} className={`${inputClass} text-left`} placeholder="openai" /></Field>
              <Field label="مدل"><input dir="ltr" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className={`${inputClass} text-left`} /></Field>
              <Field label="نام متغیر کلید در secrets" hint="فقط نام؛ مقدار کلید هرگز در دیتابیس ذخیره نمی‌شود."><input dir="ltr" value={draft.secret_name} onChange={(e) => setDraft({ ...draft, secret_name: e.target.value.toUpperCase() })} className={`${inputClass} text-left`} placeholder="OPENAI_API_KEY" /></Field>
              <Field label="سقف مصرف (ریال، اختیاری)"><input type="number" min={0} value={draft.monthly_cap_irr} onChange={(e) => setDraft({ ...draft, monthly_cap_irr: e.target.value })} className={inputClass} /></Field>
              <label className="mt-6 flex items-center gap-2 text-[12px] font-semibold text-ink"><input type="checkbox" checked={draft.is_enabled} onChange={(e) => setDraft({ ...draft, is_enabled: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />سرویس فعال باشد</label>
              <div className="sm:col-span-2">
                <Field label="تنظیمات غیرمحرمانه (JSON)" hint="مثال: health_url برای بررسی اتصال. کلید/توکن وارد نکنید.">
                  <textarea dir="ltr" rows={5} value={draft.config} onChange={(e) => setDraft({ ...draft, config: e.target.value })} className={`${inputClass} font-mono text-[11.5px] leading-6`} />
                </Field>
              </div>
            </div>
            {formError && <div className="mt-3"><ErrorState message={formError} /></div>}
            <div className="mt-4 flex justify-end gap-2 border-t border-ink/8 pt-4">
              <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={Boolean(deleteTarget)} title="حذف سرویس" description={`سرویس «${deleteTarget?.name ?? ""}» حذف می‌شود. کلیدهای secrets روی سرور دست‌نخورده می‌مانند و باید جداگانه حذف شوند.`} confirmLabel="حذف" dangerous busy={deleteBusy} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </>
  );
}

/* ─────────────────────────── Audit Logs ─────────────────────────── */
export function AuditLogsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const list = useList<AuditLog>({
    table: "audit_logs",
    select: "*",
    searchColumn: "actor_email",
    orderBy: "created_at",
    pageSize: 15,
    enabled: can("audit", "read"),
  });
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const columns: Column<AuditLog>[] = [
    { key: "time", header: "زمان", render: (l) => <span className="whitespace-nowrap text-[11.5px] text-body">{formatDate(l.created_at, true)}</span> },
    { key: "actor", header: "عامل", render: (l) => <span dir="ltr" className="block max-w-[12rem] truncate text-left text-[11px] text-ink">{l.actor_email ?? "—"}</span> },
    { key: "action", header: "عملیات", render: (l) => <span dir="ltr" className="font-mono text-[11px] text-ink">{l.action}</span> },
    { key: "resource", header: "منبع", render: (l) => <span dir="ltr" className="text-[11px] text-body">{l.resource_type}{l.resource_id ? `/${l.resource_id.slice(0, 8)}` : ""}</span> },
    { key: "result", header: "نتیجه", render: (l) => <StatusBadge status={l.result === "success" ? "active" : "failed"} /> },
  ];

  if (!can("audit", "read")) return <AccessDenied />;

  return (
    <>
      <PageHeader title="رویدادهای مدیریتی" description="این لاگ فقط خواندنی است و در سمت سرور توسط triggerهای پایگاه داده نوشته می‌شود. رمز، توکن، کلید API و پاسخ‌های خصوصی در آن ثبت نمی‌شود." />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input type="search" dir="ltr" value={list.search} onChange={(e) => list.setSearch(e.target.value)} placeholder="جست‌وجوی ایمیل عامل…" className={`${inputClass} max-w-xs text-left`} aria-label="جست‌وجوی رویداد" />
          <select value={list.filters.resource_type ?? ""} onChange={(e) => list.setFilter("resource_type", e.target.value)} className={`${inputClass} max-w-[11rem]`} aria-label="فیلتر منبع">
            <option value="">منبع: همه</option>
            {["tests", "test_versions", "pages", "site_sections", "articles", "magazines", "books", "media", "profiles", "service_settings", "role_permissions", "psychologist_documents"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={list.filters.result ?? ""} onChange={(e) => list.setFilter("result", e.target.value)} className={`${inputClass} max-w-[9rem]`} aria-label="فیلتر نتیجه">
            <option value="">نتیجه: همه</option>
            <option value="success">موفق</option>
            <option value="failure">ناموفق</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => { list.refresh(); notify("فهرست رویدادها به‌روزرسانی شد."); }} className="ms-auto">
            <RefreshCw className="h-3.5 w-3.5" />
            به‌روزرسانی
          </Button>
        </div>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="رویدادی ثبت نشده است"
          emptyDescription="پس از انجام عملیات مدیریتی (ایجاد، انتشار، تغییر نقش و…) رویدادها اینجا نمایش داده می‌شوند."
          rowActions={(l) => (
            <button type="button" onClick={() => setDetail(l)} className="min-h-9 rounded-md px-2 text-[11.5px] font-bold text-steel hover:bg-steel/10">جزئیات</button>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={15} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {detail && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/30 p-4" onClick={() => setDetail(null)}>
          <div role="dialog" aria-modal="true" aria-label="جزئیات رویداد" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-[15px] font-extrabold text-ink">جزئیات رویداد</h2>
            <dl className="mb-3 space-y-1.5 text-[11.5px]">
              <div className="flex justify-between gap-2"><dt className="text-body">زمان</dt><dd className="text-ink">{formatDate(detail.created_at, true)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-body">عامل</dt><dd dir="ltr" className="max-w-[60%] truncate text-ink">{detail.actor_email ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-body">نقش</dt><dd className="text-ink">{detail.actor_role ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-body">عملیات</dt><dd dir="ltr" className="font-mono text-ink">{detail.action}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-body">منبع</dt><dd dir="ltr" className="max-w-[60%] truncate text-ink">{detail.resource_type}/{detail.resource_id ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-body">نتیجه</dt><dd><StatusBadge status={detail.result === "success" ? "active" : "failed"} /></dd></div>
            </dl>
            <p className="mb-1 text-[11.5px] font-bold text-ink">فراداده‌ی غیرحساس</p>
            <pre dir="ltr" className="max-h-48 overflow-auto rounded-lg bg-[#232c44] p-3 text-[10.5px] leading-5 text-[#e6edf8]">{JSON.stringify(detail.metadata ?? {}, null, 2)}</pre>
            <div className="mt-4 flex justify-end"><Button size="sm" variant="secondary" onClick={() => setDetail(null)}>بستن</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── تنظیمات سایت ─────────────────────────── */
export function SiteSettingsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canWrite = can("settings", "write");
  const list = useList<SiteSetting>({
    table: "site_settings",
    select: "*",
    searchColumn: "key",
    orderBy: "key",
    ascending: true,
    pageSize: 20,
    enabled: can("settings", "read"),
  });

  const [tab, setTab] = useState<"settings" | "categories">("settings");
  const [editing, setEditing] = useState<SiteSetting | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("{\n  \"title\": \"\"\n}");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState({ slug: "", name: "", kind: "article", sort_order: "0" });
  const [catSaving, setCatSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    if (!supabase) return;
    setCatLoading(true);
    const { data, error: err } = await supabase.from("categories").select("id,slug,name,kind,sort_order").order("kind").order("sort_order");
    setCatLoading(false);
    if (err) {
      setCatError(friendlyError(err));
      return;
    }
    setCatError(null);
    setCategories((data ?? []) as Category[]);
  }, []);

  useEffect(() => {
    if (tab === "categories") void loadCategories();
  }, [tab, loadCategories]);

  const openEdit = (s: SiteSetting) => {
    setEditing(s);
    setKey(s.key);
    setValue(JSON.stringify(s.value ?? {}, null, 2));
    setIsPublic(s.is_public);
    setFormError(null);
    setCreateOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setKey("");
    setValue("{\n  \"title\": \"\"\n}");
    setIsPublic(false);
    setFormError(null);
    setCreateOpen(true);
  };

  const save = async () => {
    if (!supabase) return;
    if (!/^[a-z0-9_.-]{2,64}$/.test(key)) {
      setFormError("کلید تنظیمات باید با حروف کوچک، عدد، نقطه یا خط تیره باشد.");
      return;
    }
    if (isPublic && /secret|token|key(?!_name)|password|credential/i.test(value)) {
      setFormError("به‌نظر می‌رسد مقدار حساسی در تنظیمات عمومی قرار گرفته است. آن را حذف کنید.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(value) as Record<string, unknown>;
    } catch {
      setFormError("مقدار تنظیمات باید JSON معتبر باشد.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const { error: err } = await supabase.from("site_settings").update({ value: parsed, is_public: isPublic }).eq("key", editing.key);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("site_settings").insert({ key, value: parsed, is_public: isPublic });
        if (err) throw err;
      }
      notify("تنظیمات ذخیره شد.");
      setCreateOpen(false);
      setEditing(null);
      list.refresh();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (!supabase) return;
    if (!/^[a-z0-9-]{2,60}$/.test(catDraft.slug) || !catDraft.name.trim()) {
      notify("نام و slug معتبر لازم است.", "error");
      return;
    }
    setCatSaving(true);
    const { error: err } = await supabase.from("categories").insert({
      slug: catDraft.slug,
      name: catDraft.name.trim(),
      kind: catDraft.kind,
      sort_order: Number(catDraft.sort_order) || 0,
    });
    setCatSaving(false);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("دسته‌بندی اضافه شد.");
    setCatDraft({ slug: "", name: "", kind: "article", sort_order: "0" });
    await loadCategories();
  };

  const removeCategory = async (c: Category) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", c.id);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("دسته‌بندی حذف شد. محتوای مرتبط بدون دسته خواهد بود.");
    await loadCategories();
  };

  const settingRows = list.rows.map((s) => ({ ...s, id: s.key }));
  const settingColumns: Column<SiteSetting & { id: string }>[] = [
    { key: "key", header: "کلید", render: (s) => <code dir="ltr" className="text-[11.5px] font-semibold text-ink">{s.key}</code> },
    { key: "access", header: "دسترسی", render: (s) => <StatusBadge status={s.is_public ? "active" : "archived"} /> },
    { key: "updated", header: "آخرین تغییر", render: (s) => <span className="text-[11px] text-body">{formatDate(s.updated_at, true)}</span> },
  ];

  if (!can("settings", "read")) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="تنظیمات سایت"
        description="تنظیمات عمومی (SEO، اطلاعات تماس) و دسته‌بندی‌ها. تنظیمات عمومی از طریق کلید anon قابل خواندن هستند؛ داده‌ی حساس را عمومی نکنید."
        actions={canWrite && tab === "settings" ? <Button onClick={openCreate}><Plus className="h-4 w-4" />تنظیم جدید</Button> : null}
      />

      <div className="mb-4 flex gap-1.5 rounded-lg border border-ink/8 bg-white p-1">
        <button type="button" onClick={() => setTab("settings")} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-bold ${tab === "settings" ? "bg-steel/10 text-ink" : "text-body hover:text-ink"}`}>
          <Settings className="h-3.5 w-3.5" />
          تنظیمات کلید/مقدار
        </button>
        <button type="button" onClick={() => setTab("categories")} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-bold ${tab === "categories" ? "bg-steel/10 text-ink" : "text-body hover:text-ink"}`}>
          <KeyRound className="h-3.5 w-3.5" />
          دسته‌بندی‌ها
        </button>
      </div>

      {tab === "settings" ? (
        <Card>
          <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
            <h2 className="text-[13px] font-extrabold text-ink">تنظیمات ثبت‌شده</h2>
            <Button variant="ghost" size="sm" onClick={list.refresh}><RefreshCw className="h-3.5 w-3.5" />به‌روزرسانی</Button>
          </div>
          <DataTable
            columns={settingColumns}
            rows={settingRows}
            loading={list.loading}
            error={list.error}
            onRetry={list.refresh}
            emptyTitle="تنظیمی ثبت نشده است"
            emptyDescription="مثلاً seo.default یا contact.general را اضافه کنید."
            rowActions={(s) => (
              <button type="button" onClick={() => openEdit(s)} className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-bold text-steel hover:bg-steel/10">
                <Pencil className="h-3.5 w-3.5" />
                ویرایش
              </button>
            )}
          />
          {!list.loading && !list.error && list.total > 0 && <Pagination page={list.page} pageSize={20} total={list.total} onPage={list.setPage} />}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {canWrite && (
            <Card className="p-4">
              <h2 className="mb-3 text-[13px] font-extrabold text-ink">دسته‌بندی جدید</h2>
              <div className="space-y-3">
                <Field label="نام" required><input value={catDraft.name} onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })} className={inputClass} /></Field>
                <Field label="slug" required><input dir="ltr" value={catDraft.slug} onChange={(e) => setCatDraft({ ...catDraft, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className={`${inputClass} text-left`} placeholder="self-growth" /></Field>
                <Field label="نوع">
                  <select value={catDraft.kind} onChange={(e) => setCatDraft({ ...catDraft, kind: e.target.value })} className={inputClass}>
                    <option value="article">مقاله</option>
                    <option value="test">آزمون</option>
                    <option value="book">کتاب</option>
                    <option value="magazine">مجله</option>
                  </select>
                </Field>
                <Field label="ترتیب"><input type="number" value={catDraft.sort_order} onChange={(e) => setCatDraft({ ...catDraft, sort_order: e.target.value })} className={inputClass} /></Field>
                <Button onClick={() => void addCategory()} loading={catSaving} className="w-full">افزودن</Button>
              </div>
            </Card>
          )}

          <Card className={canWrite ? "lg:col-span-2" : "lg:col-span-3"}>
            <div className="border-b border-ink/8 px-4 py-3"><h2 className="text-[13px] font-extrabold text-ink">دسته‌بندی‌ها</h2></div>
            {catLoading ? (
              <LoadingState />
            ) : catError ? (
              <ErrorState message={catError} onRetry={loadCategories} />
            ) : categories.length === 0 ? (
              <EmptyState title="دسته‌بندی‌ای ثبت نشده است" />
            ) : (
              <ul className="divide-y divide-ink/5">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div>
                      <p className="text-[12px] font-bold text-ink">{c.name}</p>
                      <p dir="ltr" className="text-left text-[10.5px] text-body">/{c.slug} · {{ test: "آزمون", article: "مقاله", book: "کتاب", magazine: "مجله" }[c.kind]}</p>
                    </div>
                    {canWrite && (
                      <button type="button" onClick={() => void removeCategory(c)} className="flex h-9 w-9 items-center justify-center rounded text-[#a33a34] hover:bg-[#fbeceb]" aria-label={`حذف ${c.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-ink/8 px-4 py-2.5 text-[10.5px] text-body">{toFa(categories.length)} دسته‌بندی</p>
          </Card>
        </div>
      )}

      {(createOpen || editing) && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && (setCreateOpen(false), setEditing(null))}>
          <div role="dialog" aria-modal="true" aria-label="فرم تنظیمات" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-extrabold text-ink"><Activity className="h-4 w-4 text-steel" />{editing ? "ویرایش تنظیمات" : "تنظیم جدید"}</h2>
            <p className="mb-4 text-[11.5px] text-body">مقادیر عمومی در سایت قابل خواندن هستند؛ کلید و توکن حساس ذخیره نکنید.</p>
            <div className="space-y-3">
              <Field label="کلید" required hint="حروف کوچک انگلیسی، عدد، نقطه یا خط تیره">
                <input dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} text-left`} disabled={Boolean(editing)} placeholder="seo.default" />
              </Field>
              <Field label="مقدار (JSON)" required>
                <textarea dir="ltr" rows={8} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} font-mono text-[11.5px] leading-6`} />
              </Field>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-[#4a58a6]" />
                این تنظیمات برای سایت عمومی قابل خواندن باشد
              </label>
            </div>
            {formError && <div className="mt-3"><ErrorState message={formError} /></div>}
            <div className="mt-4 flex justify-end gap-2 border-t border-ink/8 pt-4">
              <Button variant="secondary" onClick={() => { setCreateOpen(false); setEditing(null); }} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving} disabled={!canWrite}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
