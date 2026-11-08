import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ListChecks, Plus, Settings2 } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { describeError } from "../backend";
import { useAuth } from "../../lib/auth";
import { useList } from "../hooks";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  PublishBadge,
  StatusBadge,
  formatDate,
  inputClass,
  toFa,
  useToast,
  type Column,
} from "../ui";
import type { Category, TestRow } from "../../lib/types";

interface Draft {
  title_fa: string;
  slug: string;
  title_en: string;
  short_description: string;
  duration_minutes: string;
  report_type: string;
  category_id: string;
  scientific_lead: string;
  sort_order: string;
  cover_url: string;
  source_reference: string;
  license_info: string;
  review_due_at: string;
}

const emptyDraft: Draft = {
  title_fa: "",
  slug: "",
  title_en: "",
  short_description: "",
  duration_minutes: "",
  report_type: "",
  category_id: "",
  scientific_lead: "",
  sort_order: "0",
  cover_url: "",
  source_reference: "",
  license_info: "",
  review_due_at: "",
};

export function TestsPage() {
  const { can, profile } = useAuth();
  const { notify } = useToast();
  const canRead = can("tests", "read");
  const canWrite = can("tests", "write");

  const list = useList<TestRow>({
    table: "tests",
    select: "*",
    searchColumn: "title_fa",
    orderBy: "sort_order",
    ascending: true,
    pageSize: 10,
    enabled: canRead,
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TestRow | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TestRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("categories").select("id,slug,name,kind,sort_order").eq("kind", "test").order("sort_order").then(({ data }) => {
      setCategories((data ?? []) as Category[]);
    });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (test: TestRow) => {
    setEditing(test);
    setDraft({
      title_fa: test.title_fa,
      slug: test.slug,
      title_en: test.title_en ?? "",
      short_description: test.short_description ?? "",
      duration_minutes: test.duration_minutes?.toString() ?? "",
      report_type: test.report_type ?? "",
      category_id: test.category_id ?? "",
      scientific_lead: test.scientific_lead ?? "",
      sort_order: test.sort_order.toString(),
      cover_url: test.cover_url ?? "",
      source_reference: test.source_reference ?? "",
      license_info: test.license_info ?? "",
      review_due_at: test.review_due_at ? test.review_due_at.slice(0, 10) : "",
    });
    setFormError(null);
    setEditorOpen(true);
  };

  const validate = (): string | null => {
    if (!draft.title_fa.trim()) return "عنوان فارسی الزامی است.";
    if (!/^[a-z0-9-]{2,90}$/.test(draft.slug)) return "slug باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد.";
    if (draft.duration_minutes && (Number(draft.duration_minutes) < 1 || Number(draft.duration_minutes) > 240)) return "زمان آزمون باید بین ۱ تا ۲۴۰ دقیقه باشد.";
    return null;
  };

  const save = async () => {
    if (!supabase) return;
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      title_fa: draft.title_fa.trim(),
      slug: draft.slug.trim(),
      title_en: draft.title_en.trim() || null,
      short_description: draft.short_description.trim() || null,
      duration_minutes: draft.duration_minutes ? Number(draft.duration_minutes) : null,
      report_type: draft.report_type.trim() || null,
      category_id: draft.category_id || null,
      scientific_lead: draft.scientific_lead.trim() || null,
      sort_order: Number(draft.sort_order) || 0,
      cover_url: draft.cover_url.trim() || null,
    } as Record<string, unknown>;

    // فیلدهای کیفیت علمی فقط وقتی ارسال می‌شوند که مقدار دارند (یا قبلاً مقدار داشته‌اند)؛
    // بنابراین قبل از اجرای migration داشبورد، ذخیره‌ی آزمون مثل قبل کار می‌کند.
    const optional: Array<[string, string, string | null | undefined]> = [
      ["source_reference", draft.source_reference.trim(), editing?.source_reference],
      ["license_info", draft.license_info.trim(), editing?.license_info],
      ["review_due_at", draft.review_due_at ? new Date(`${draft.review_due_at}T12:00:00Z`).toISOString() : "", editing?.review_due_at],
    ];
    for (const [key, value, previous] of optional) {
      if (value || previous) payload[key] = value || null;
    }

    try {
      if (editing) {
        const { error } = await supabase.from("tests").update(payload).eq("id", editing.id);
        if (error) throw error;
        notify("اطلاعات آزمون ذخیره شد.");
      } else {
        const { data: created, error } = await supabase
          .from("tests")
          .insert({ ...payload, status: "draft", review_status: "pending", language: "fa", created_by: profile?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        const { error: versionError } = await supabase.from("test_versions").insert({
          test_id: created.id,
          version_label: "v1",
          status: "draft",
          scoring_rules: { method: "sum", dimensions: [] },
          created_by: profile?.id ?? null,
        });
        if (versionError) {
          notify("آزمون ساخته شد اما ایجاد نسخه‌ی اولیه ناموفق بود: " + friendlyError(versionError), "error");
        } else {
          notify("آزمون پیش‌نویس ایجاد شد. اکنون سؤال‌ها را اضافه کنید.");
        }
      }
      setEditorOpen(false);
      list.refresh();
    } catch (e) {
      setFormError(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!supabase || !archiveTarget) return;
    setArchiveBusy(true);
    const { error } = await supabase.from("tests").update({ status: "archived" }).eq("id", archiveTarget.id);
    setArchiveBusy(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify("آزمون آرشیو شد و از سایت عمومی حذف می‌شود.");
    setArchiveTarget(null);
    list.refresh();
  };

  const columns: Column<TestRow>[] = [
    {
      key: "title",
      header: "آزمون",
      render: (t) => (
        <div className="min-w-0">
          <Link to={`/admin/tests/${t.id}`} className="block truncate text-[12.5px] font-bold text-ink hover:text-steel">
            {t.title_fa}
          </Link>
          <p dir="ltr" className="truncate text-left text-[11px] text-body">/{t.slug}</p>
        </div>
      ),
    },
    {
      key: "report",
      header: "گزارش",
      render: (t) => <span className="text-[11.5px] text-body">{t.report_type ?? "—"}</span>,
    },
    {
      key: "cover",
      header: "کاور",
      render: (t) => (
        <div className="h-10 w-14 overflow-hidden rounded-md border border-ink/8 bg-mist">
          {t.cover_url ? <img src={t.cover_url} alt={t.title_fa} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[9px] text-body">بدون تصویر</span>}
        </div>
      ),
    },
    {
      key: "duration",
      header: "زمان",
      render: (t) => <span className="whitespace-nowrap text-[11.5px]">{t.duration_minutes ? `${toFa(t.duration_minutes)} دقیقه` : "—"}</span>,
    },
    { key: "status", header: "انتشار", render: (t) => <PublishBadge status={t.status} /> },
    { key: "review", header: "بازبینی علمی", render: (t) => <StatusBadge status={t.review_status} /> },
    {
      key: "scientific",
      header: "مسئول علمی",
      render: (t) => <span className="text-[11.5px] text-body">{t.scientific_lead ?? "تعیین نشده"}</span>,
    },
    {
      key: "updated",
      header: "آخرین تغییر",
      render: (t) => <span className="whitespace-nowrap text-[11px] text-body">{formatDate(t.updated_at)}</span>,
    },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="آزمون‌های روان‌شناختی"
        description="آزمون‌ها فقط پس از تأیید بازبینی علمی و انتشار نسخه، در سایت عمومی نمایش داده می‌شوند. نسخه‌ی منتشرشده تغییرناپذیر است."
        breadcrumb={["پنل مدیریت", "آزمون‌ها"]}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              آزمون جدید
            </Button>
          ) : null
        }
      />

      <div className="mb-4 rounded-lg border border-steel/15 bg-steel/5 px-3.5 py-2.5 text-[11.5px] leading-6 text-body">
        اعتبار علمی هر آزمون فقط بر اساس اطلاعات «مسئول علمی» ثبت می‌شود. این سامانه ادعای استانداردسازی یا تشخیص
        بالینی ندارد و متن‌های تفسیر باید توسط بازبین روان‌شناسی تأیید شوند.
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input
            type="search"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="جست‌وجوی عنوان آزمون…"
            className={`${inputClass} max-w-xs`}
            aria-label="جست‌وجوی آزمون"
          />
          <select
            value={list.filters.status ?? ""}
            onChange={(e) => list.setFilter("status", e.target.value)}
            className={`${inputClass} max-w-[10rem]`}
            aria-label="فیلتر وضعیت انتشار"
          >
            <option value="">وضعیت: همه</option>
            <option value="draft">پیش‌نویس</option>
            <option value="in_review">در بازبینی</option>
            <option value="published">منتشرشده</option>
            <option value="archived">آرشیو</option>
          </select>
          <select
            value={list.filters.category_id ?? ""}
            onChange={(e) => list.setFilter("category_id", e.target.value)}
            className={`${inputClass} max-w-[11rem]`}
            aria-label="فیلتر دسته‌بندی"
          >
            <option value="">دسته: همه</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className="ms-auto text-[11.5px] text-body">{toFa(list.total)} آزمون</span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="آزمونی ثبت نشده است"
          emptyDescription={canWrite ? "با دکمه‌ی «آزمون جدید» اولین آزمون را بسازید. تا انتشار نسخه، در سایت عمومی نمایش داده نمی‌شود." : "هنوز آزمونی در پایگاه داده وجود ندارد."}
          rowActions={(t) => (
            <div className="flex flex-wrap items-center gap-1">
              <Link
                to={`/admin/tests/${t.id}`}
                className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-bold text-steel hover:bg-steel/10"
              >
                <ListChecks className="h-3.5 w-3.5" />
                سؤال‌ها و نسخه‌ها
              </Link>
              <button
                type="button"
                onClick={() => openEdit(t)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-body hover:bg-mist"
                aria-label="ویرایش اطلاعات آزمون"
                title="ویرایش"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              {canWrite && t.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => setArchiveTarget(t)}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-[#8a641f] hover:bg-[#fdf6e8]"
                  aria-label="آرشیو آزمون"
                  title="آرشیو"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={10} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {editorOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setEditorOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="فرم آزمون" className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{editing ? "ویرایش اطلاعات آزمون" : "ایجاد آزمون جدید"}</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="عنوان فارسی" required>
                <input value={draft.title_fa} onChange={(e) => setDraft({ ...draft, title_fa: e.target.value })} className={inputClass} />
              </Field>
              <Field label="slug (انگلیسی)" required hint="در آدرس عمومی آزمون استفاده می‌شود.">
                <input dir="ltr" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className={`${inputClass} text-left`} placeholder="personality-test" />
              </Field>
              <Field label="عنوان انگلیسی (اختیاری)">
                <input dir="ltr" value={draft.title_en} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })} className={`${inputClass} text-left`} />
              </Field>
              <Field label="دسته‌بندی">
                <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })} className={inputClass}>
                  <option value="">بدون دسته‌بندی</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="توضیح کوتاه (برای کارت عمومی)">
                <textarea value={draft.short_description} onChange={(e) => setDraft({ ...draft, short_description: e.target.value })} rows={3} maxLength={300} className={`${inputClass} leading-6`} />
              </Field>
              <div className="space-y-4">
                <Field label="زمان تقریبی (دقیقه)">
                  <input type="number" min={1} max={240} value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} className={inputClass} />
                </Field>
                <Field label="نوع گزارش">
                  <input value={draft.report_type} onChange={(e) => setDraft({ ...draft, report_type: e.target.value })} className={inputClass} placeholder="مثلاً خلاصه‌ی شخصیتی" />
                </Field>
              </div>
              <Field label="مسئول علمی" hint="فقط اگر تأییدیه‌ی واقعی دارید مقداردهی کنید.">
                <input value={draft.scientific_lead} onChange={(e) => setDraft({ ...draft, scientific_lead: e.target.value })} className={inputClass} />
              </Field>
              <Field label="آدرس کاور آزمون" hint="لینک مستقیم از کتابخانه‌ی رسانه یا هر URL عمومی.">
                <input dir="ltr" value={draft.cover_url} onChange={(e) => setDraft({ ...draft, cover_url: e.target.value })} className={`${inputClass} text-left`} placeholder="https://…" />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-extrabold text-ink">کیفیت علمی (برای کنترل کیفیت در داشبورد)</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="منبع / مرجع علمی" hint="مثلاً نام پرسش‌نامه‌ی مرجع">
                    <input value={draft.source_reference} onChange={(e) => setDraft({ ...draft, source_reference: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="اطلاعات مجوز / حق نشر">
                    <input value={draft.license_info} onChange={(e) => setDraft({ ...draft, license_info: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="موعد بازبینی بعدی">
                    <input type="date" value={draft.review_due_at} onChange={(e) => setDraft({ ...draft, review_due_at: e.target.value })} className={inputClass} />
                  </Field>
                </div>
              </div>
              <Field label="ترتیب نمایش در سایت">
                <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} className={inputClass} />
              </Field>
            </div>

            {formError && <div className="mt-4"><ErrorState message={formError} /></div>}

            <div className="mt-5 flex justify-end gap-2 border-t border-ink/8 pt-4">
              <Button variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving}>{editing ? "ذخیره" : "ایجاد پیش‌نویس"}</Button>
            </div>
            {!editing && (
              <p className="mt-2 text-[11px] text-body">
                پس از ایجاد، یک نسخه‌ی پیش‌نویس <code dir="ltr">v1</code> ساخته می‌شود تا سؤال‌ها را وارد کنید.
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="آرشیو آزمون"
        description={`آزمون «${archiveTarget?.title_fa ?? ""}» از فهرست عمومی حذف می‌شود اما سوابق و نسخه‌های آن حفظ می‌شوند.`}
        confirmLabel="آرشیو کن"
        busy={archiveBusy}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archive()}
      />
    </>
  );
}
