import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { friendlyError, supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  inputClass,
  PageHeader,
  Pagination,
  StatusBadge,
  formatDate,
  useToast,
  type Column,
} from "./ui";
import { useList } from "./hooks";

export type Row = Record<string, unknown> & { id: string };

export type FieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "date" | "datetime-local" | "tags" | "json" | "url";

export interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  rows?: number;
  span?: 1 | 2;
  readOnly?: boolean;
}

export interface CrudConfig {
  table: string;
  title: string;
  description: string;
  permission: string;
  titleKey: string;
  columns: Column<Row>[];
  fields: FieldConfig[];
  defaults?: Record<string, unknown>;
  orderBy?: string;
  ascending?: boolean;
  searchColumn?: string;
  pageSize?: number;
  filters?: Array<{ column: string; label: string; options: Array<{ label: string; value: string }> }>;
  publishable?: boolean;
  requiredFields?: string[];
  help?: string;
}

function toPayload(values: Record<string, unknown>, fields: FieldConfig[]) {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (f.type === "tags") {
      payload[f.key] = String(raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (f.type === "json") {
      const text = String(raw ?? "").trim();
      payload[f.key] = text ? JSON.parse(text) : {};
    } else if (f.type === "number") {
      payload[f.key] = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    } else {
      payload[f.key] = raw === "" ? null : raw;
    }
  }
  return payload;
}

export function CrudPage({ config }: { config: CrudConfig }) {
  const { can, profile } = useAuth();
  const { notify } = useToast();
  const list = useList<Row>({
    table: config.table,
    searchColumn: config.searchColumn ?? null,
    orderBy: config.orderBy ?? "created_at",
    ascending: config.ascending ?? false,
    pageSize: config.pageSize ?? 10,
    enabled: can(config.permission, "read"),
  });

  const [editing, setEditing] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ label: string; value: string }>>([]);

  const hasCategoryField = config.fields.some((f) => f.key === "category_id");

  useEffect(() => {
    if (!hasCategoryField || !supabase) return;
    supabase
      .from("categories")
      .select("id,name,kind")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategoryOptions(data.map((c: { id: string; name: string }) => ({ label: c.name, value: c.id })));
      });
  }, [hasCategoryField]);

  const resolvedFields = useMemo(
    () => config.fields.map((f) => (f.key === "category_id" ? { ...f, options: categoryOptions } : f)),
    [config.fields, categoryOptions]
  );

  if (!can(config.permission, "read")) return <AccessDenied />;

  const openCreate = () => {
    setValues({ ...(config.defaults ?? {}) });
    setEditing({} as Row);
    setFormError(null);
  };

  const openEdit = (row: Row) => {
    const next: Record<string, unknown> = {};
    for (const f of resolvedFields) {
      const v = row[f.key];
      next[f.key] = f.type === "tags" ? (Array.isArray(v) ? v.join(", ") : "") : f.type === "json" ? JSON.stringify(v ?? {}, null, 2) : v ?? "";
    }
    setValues(next);
    setEditing(row);
    setFormError(null);
  };

  const save = async () => {
    if (!supabase) return;
    setFormError(null);
    const missing = resolvedFields.filter((f) => f.required && !String(values[f.key] ?? "").trim()).map((f) => f.label);
    if (missing.length) {
      setFormError(`فیلدهای الزامی: ${missing.join("، ")}`);
      return;
    }
    const slugField = resolvedFields.find((f) => f.key === "slug");
    if (slugField && !/^[a-z0-9-]{2,90}$/.test(String(values.slug ?? ""))) {
      setFormError("slug باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره (۲ تا ۹۰ کاراکتر) باشد.");
      return;
    }
    const id = editing?.id || undefined;
    try {
      setSaving(true);
      const payload = toPayload(values, resolvedFields);
      const isCreate = !id;
      if (isCreate) {
        if (config.publishable) (payload as Record<string, unknown>).status ??= "draft";
        if ("created_by" in (config.defaults ?? {}) || config.fields.some((f) => f.key === "created_by")) {
          payload.created_by = profile?.id ?? null;
        }
      }
      const query = isCreate
        ? supabase.from(config.table).insert(payload).select("id").single()
        : supabase.from(config.table).update(payload).eq("id", id!).select("id").single();
      const { error } = await query;
      if (error) throw error;
      notify(isCreate ? "رکورد با موفقیت ایجاد شد." : "تغییرات ذخیره شد.");
      setEditing(null);
      list.refresh();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: Row, status: string) => {
    if (!supabase || !can(config.permission, "write")) return;
    const payload: Record<string, unknown> = { status };
    if (status === "published" && !row.published_at) payload.published_at = new Date().toISOString();
    const { error } = await supabase.from(config.table).update(payload).eq("id", row.id as string);
    if (error) notify(friendlyError(error), "error");
    else {
      notify(status === "published" ? "محتوا منتشر شد." : "وضعیت به آرشیو تغییر کرد.");
      list.refresh();
    }
  };

  const remove = async () => {
    if (!supabase || !deleting) return;
    try {
      setDeleteBusy(true);
      const { error } = await supabase.from(config.table).delete().eq("id", deleting.id as string);
      if (error) throw error;
      notify("رکورد حذف شد.");
      setDeleting(null);
      list.refresh();
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const statusColumn: Column<Row> | null = config.publishable
    ? { key: "status", header: "وضعیت", render: (row) => <StatusBadge status={String(row.status ?? "draft")} /> }
    : null;

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          can(config.permission, "write") ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              ایجاد جدید
            </Button>
          ) : null
        }
      />

      {config.help && (
        <p className="mb-4 rounded-lg border border-steel/15 bg-steel/5 px-3.5 py-2.5 text-[12px] leading-6 text-body">{config.help}</p>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          {config.searchColumn && (
            <input
              type="search"
              value={list.search}
              onChange={(e) => list.setSearch(e.target.value)}
              placeholder="جست‌وجو…"
              className={`${inputClass} max-w-xs`}
              aria-label="جست‌وجو"
            />
          )}
          {config.filters?.map((f) => (
            <select
              key={f.column}
              value={list.filters[f.column] ?? ""}
              onChange={(e) => list.setFilter(f.column, e.target.value)}
              className={`${inputClass} max-w-[11rem]`}
              aria-label={f.label}
            >
              <option value="">{f.label}: همه</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          <span className="ms-auto text-[11.5px] text-body">{list.total.toLocaleString("fa-IR")} رکورد</span>
        </div>

        <DataTable
          columns={[...config.columns, ...(statusColumn ? [statusColumn] : [])]}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="هنوز محتوایی ثبت نشده است"
          emptyDescription={can(config.permission, "write") ? "با دکمه‌ی «ایجاد جدید» اولین رکورد را اضافه کنید." : "برای مشاهده‌ی محتوا با مدیر هماهنگ کنید."}
          rowActions={(row) => (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10"
                aria-label="ویرایش"
                title="ویرایش"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {config.publishable && can(config.permission, "write") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    changeStatus(row, String(row.status) === "published" ? "archived" : "published")
                  }
                >
                  {String(row.status) === "published" ? "آرشیو" : "انتشار"}
                </Button>
              )}
              {can(config.permission, "delete") && (
                <button
                  type="button"
                  onClick={() => setDeleting(row)}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-[#a33a34] hover:bg-[#fbeceb]"
                  aria-label="حذف"
                  title="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={config.pageSize ?? 10} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setEditing(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editing.id ? `ویرایش ${config.title}` : `ایجاد ${config.title}`}
            className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">
              {editing.id ? "ویرایش رکورد" : "ایجاد رکورد جدید"}
            </h2>
            <p className="mb-5 text-[11.5px] text-body">
              تغییرات در پایگاه داده ثبت و رویداد آن در audit log نگهداری می‌شود.
            </p>

            <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
              {resolvedFields.map((f) => {
                const value = values[f.key];
                const common = {
                  id: `field-${f.key}`,
                  value: value === null || value === undefined ? "" : String(value),
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value })),
                  className: inputClass,
                  disabled: f.readOnly,
                  placeholder: f.placeholder,
                  required: f.required,
                };
                return (
                  <div key={f.key} className={f.span === 2 || f.type === "textarea" || f.type === "json" ? "sm:col-span-2" : ""}>
                    <Field label={f.label} required={f.required} hint={f.hint}>
                      {f.type === "textarea" || f.type === "json" ? (
                        <textarea {...common} rows={f.rows ?? (f.type === "json" ? 5 : 4)} className={`${inputClass} font-sans leading-6`} />
                      ) : f.type === "select" ? (
                        <select {...common}>
                          <option value="">انتخاب کنید…</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "checkbox" ? (
                        <input
                          id={`field-${f.key}`}
                          type="checkbox"
                          checked={Boolean(values[f.key])}
                          onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                          className="h-5 w-5 accent-[#4a58a6]"
                        />
                      ) : (
                        <input {...common} type={f.type ?? "text"} inputMode={f.type === "number" ? "numeric" : undefined} dir={f.type === "url" ? "ltr" : undefined} />
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>

            {formError && <ErrorState message={formError} />}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4">
              {editing.id ? (
                <span className="text-[11px] text-body">شناسه: <code dir="ltr">{String(editing.id).slice(0, 8)}</code></span>
              ) : (
                <span className="text-[11px] text-body">وضعیت پیش‌فرض: پیش‌نویس</span>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                  انصراف
                </Button>
                <Button onClick={save} loading={saving}>
                  {editing.id ? "ذخیره‌ی تغییرات" : "ایجاد"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="حذف رکورد"
        description="این عملیات قابل بازگشت نیست و رویداد آن در audit log ثبت می‌شود. ادامه می‌دهید؟"
        confirmLabel="حذف"
        dangerous
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />

      {list.total > 0 && (
        <p className="mt-3 text-[11px] text-body">
          آخرین به‌روزرسانی: {formatDate(new Date().toISOString(), true)}
        </p>
      )}
    </>
  );
}
