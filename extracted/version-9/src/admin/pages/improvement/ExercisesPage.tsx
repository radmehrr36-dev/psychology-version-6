import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { AccessDenied, Button, Card, DataTable, Field, PageHeader, StatusBadge, inputClass, useToast, type Column } from "../../ui";
import { EXERCISE_TYPE_LABEL, PUBLISH_LABEL, faNum, impError, type Exercise, type ExerciseType, type PublishState } from "../../../improvement/api";
import { useConfirm } from "../../../improvement/useConfirm";

interface Draft {
  id: string | null;
  title: string;
  category: string;
  description: string;
  goal: string;
  instructions: string;
  duration: string;
  type: ExerciseType;
  required: boolean;
  status: PublishState;
  prompt: string;
  items: string;
  min: string;
  max: string;
  low: string;
  high: string;
}

const emptyDraft: Draft = {
  id: null, title: "", category: "general", description: "", goal: "", instructions: "", duration: "5", type: "reflection", required: false,
  status: "draft", prompt: "", items: "", min: "1", max: "5", low: "", high: "",
};

function toDraft(e: Exercise): Draft {
  return {
    id: e.id, title: e.title, category: e.category, description: e.description ?? "", goal: e.goal ?? "", instructions: e.instructions,
    duration: e.duration_minutes ? String(e.duration_minutes) : "", type: e.exercise_type, required: e.response_required, status: e.status,
    prompt: e.content.prompt ?? "", items: (e.content.items ?? []).join("\n"), min: String(e.content.min ?? 1), max: String(e.content.max ?? 5),
    low: e.content.low_label ?? "", high: e.content.high_label ?? "",
  };
}

function toPayload(d: Draft) {
  const content =
    d.type === "checklist"
      ? { items: d.items.split("\n").map((s) => s.trim()).filter(Boolean) }
      : d.type === "rating"
        ? { min: Number(d.min), max: Number(d.max), low_label: d.low.trim(), high_label: d.high.trim(), prompt: d.prompt.trim() }
        : { prompt: d.prompt.trim() };
  return {
    title: d.title.trim(),
    category: d.category.trim() || "general",
    description: d.description.trim() || null,
    goal: d.goal.trim() || null,
    instructions: d.instructions.trim(),
    duration_minutes: d.duration ? Number(d.duration) : null,
    exercise_type: d.type,
    response_required: d.type === "rating" ? true : d.required,
    content,
    ...(d.id ? { status: d.status } : {}),
  };
}

export function ExercisesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { ask, dialog } = useConfirm();
  const canRead = can("paths", "read");
  const canWrite = can("paths", "write");
  const [rows, setRows] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ status: "", type: "", q: "" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !canRead) return;
    setLoading(true);
    const { data, error: err } = await supabase.from("improvement_exercises").select("*").order("created_at", { ascending: false }).limit(500);
    if (err) setError(impError(err));
    else {
      setError(null);
      setRows((data ?? []) as Exercise[]);
    }
    setLoading(false);
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!supabase || !draft) return;
    setFormError(null);
    if (draft.title.trim().length < 3) return setFormError("عنوان تمرین حداقل ۳ کاراکتر است.");
    if (draft.instructions.trim().length < 10) return setFormError("دستورالعمل انجام را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).");
    if (draft.type === "checklist" && !draft.items.trim()) return setFormError("برای چک‌لیست حداقل یک مورد وارد کنید (هر مورد در یک خط).");
    setSaving(true);
    const payload = toPayload(draft);
    const res = draft.id ? await supabase.from("improvement_exercises").update(payload).eq("id", draft.id) : await supabase.from("improvement_exercises").insert(payload);
    setSaving(false);
    if (res.error) return setFormError(impError(res.error));
    notify(draft.id ? "تمرین به‌روزرسانی شد." : "تمرین ساخته شد (پیش‌نویس). برای استفاده در مسیر، آن را منتشر کنید.");
    setDraft(null);
    void load();
  };

  const remove = async (e: Exercise) => {
    if (!supabase) return;
    if (!(await ask({ title: "حذف تمرین", description: `تمرین «${e.title}» حذف شود؟ اگر در مسیر یا برنامه‌ی فعال کاربران استفاده شده باشد، حذف نمی‌شود و باید آرشیو شود.`, confirmLabel: "حذف", dangerous: true }))) return;
    const { error: err } = await supabase.from("improvement_exercises").delete().eq("id", e.id);
    if (err) return notify(impError(err), "error");
    notify("تمرین حذف شد.");
    void load();
  };

  const visible = rows.filter(
    (r) => (!filter.status || r.status === filter.status) && (!filter.type || r.exercise_type === filter.type) && (!filter.q || r.title.includes(filter.q.trim()) || r.category.includes(filter.q.trim()))
  );

  const columns: Column<Exercise>[] = [
    { key: "title", header: "تمرین", render: (r) => (<div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{r.title}</p><p className="truncate text-[11px] text-body">{r.category} · نسخه‌ی {faNum(r.version)}</p></div>) },
    { key: "type", header: "نوع", render: (r) => <span className="text-[12px] text-body">{EXERCISE_TYPE_LABEL[r.exercise_type]}</span> },
    { key: "dur", header: "زمان", render: (r) => <span className="text-[12px] text-body">{r.duration_minutes ? `${faNum(r.duration_minutes)} دقیقه` : "—"}</span> },
    { key: "resp", header: "پاسخ", render: (r) => <span className="text-[12px] text-body">{r.response_required ? "الزامی" : "اختیاری"}</span> },
    { key: "status", header: "وضعیت", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="بانک تمرین‌ها"
        description="تمرین‌های قابل‌اجرا (نوشتاری، چک‌لیست، خودارزیابی). هر تغییر محتوا نسخه‌ی تمرین را زیاد می‌کند؛ برنامه‌های در حال اجرای کاربران از نسخه‌ی زمان شروع استفاده می‌کنند."
        breadcrumb={["پنل مدیریت", "بهبود فردی", "تمرین‌ها"]}
        actions={canWrite ? <Button onClick={() => { setFormError(null); setDraft({ ...emptyDraft }); }}><Plus className="h-4 w-4" />تمرین جدید</Button> : null}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="جست‌وجوی عنوان یا دسته…" className={`${inputClass} max-w-xs`} aria-label="جست‌وجو" />
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className={`${inputClass} max-w-[10rem]`} aria-label="فیلتر وضعیت">
            <option value="">وضعیت: همه</option>
            {Object.entries(PUBLISH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className={`${inputClass} max-w-[12rem]`} aria-label="فیلتر نوع">
            <option value="">نوع: همه</option>
            {Object.entries(EXERCISE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="ms-auto text-[11.5px] text-body">{faNum(visible.length)} تمرین</span>
        </div>
        <DataTable
          columns={columns}
          rows={visible}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="تمرینی ثبت نشده است"
          emptyDescription="برای شروع، یک تمرین بسازید و آن را منتشر کنید؛ سپس در مسیرها از آن استفاده کنید."
          rowActions={(r) => canWrite ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setFormError(null); setDraft(toDraft(r)); }} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10" aria-label={`ویرایش ${r.title}`}><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void remove(r)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-[#a33a34] hover:bg-[#fbeceb]" aria-label={`حذف ${r.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
        />
      </Card>

      {draft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="ویرایش تمرین" className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{draft.id ? "ویرایش تمرین" : "تمرین جدید"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="عنوان" required><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={150} className={inputClass} /></Field></div>
              <Field label="دسته‌بندی"><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} maxLength={60} className={inputClass} list="exercise-categories" /><datalist id="exercise-categories">{[...new Set(rows.map((r) => r.category))].map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="زمان تقریبی (دقیقه)"><input type="number" min={1} max={240} value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className={inputClass} /></Field>
              <div className="sm:col-span-2"><Field label="هدف تمرین"><input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} maxLength={500} className={inputClass} /></Field></div>
              <div className="sm:col-span-2"><Field label="توضیح کوتاه"><textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={1000} className={inputClass} /></Field></div>
              <div className="sm:col-span-2"><Field label="دستورالعمل انجام" required hint="کاربر دقیقاً همین متن را هنگام اجرا می‌بیند."><textarea rows={4} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} maxLength={5000} className={`${inputClass} leading-6`} /></Field></div>
              <Field label="نوع تمرین">
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ExerciseType })} className={inputClass} disabled={Boolean(draft.id)}>
                  {Object.entries(EXERCISE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              {draft.id && (
                <Field label="وضعیت انتشار">
                  <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PublishState })} className={inputClass}>
                    {Object.entries(PUBLISH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              )}
              {draft.type === "reflection" && (
                <>
                  <div className="sm:col-span-2"><Field label="سؤال یا راهنمای نوشتن" hint="در بالای کادر پاسخ نمایش داده می‌شود."><input value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} maxLength={500} className={inputClass} /></Field></div>
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink sm:col-span-2"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />ثبت پاسخ نوشتاری برای تکمیل الزامی است (حداقل ۱۰ کاراکتر)</label>
                </>
              )}
              {draft.type === "checklist" && (
                <div className="sm:col-span-2"><Field label="موارد چک‌لیست" required hint="هر مورد در یک خط (حداکثر ۲۰ مورد). تمرین زمانی تکمیل می‌شود که همه‌ی موارد انجام شده باشند."><textarea rows={5} value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} className={`${inputClass} leading-6`} /></Field></div>
              )}
              {draft.type === "rating" && (
                <>
                  <div className="sm:col-span-2"><Field label="پرسش خودارزیابی"><input value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} maxLength={300} className={inputClass} /></Field></div>
                  <Field label="کمترین امتیاز"><input type="number" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} className={inputClass} /></Field>
                  <Field label="بیشترین امتیاز"><input type="number" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} className={inputClass} /></Field>
                  <Field label="برچسب کمترین"><input value={draft.low} onChange={(e) => setDraft({ ...draft, low: e.target.value })} maxLength={60} className={inputClass} /></Field>
                  <Field label="برچسب بیشترین"><input value={draft.high} onChange={(e) => setDraft({ ...draft, high: e.target.value })} maxLength={60} className={inputClass} /></Field>
                </>
              )}
            </div>
            {formError && <p role="alert" className="mt-3 rounded-lg bg-[#fbeceb] px-3 py-2 text-[12.5px] font-semibold text-[#8f322d]">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </>
  );
}
