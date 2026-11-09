import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { AccessDenied, Button, Card, DataTable, Field, LoadingState, PageHeader, StatusBadge, inputClass, useToast, type Column } from "../../ui";
import {
  EXERCISE_TYPE_LABEL, callRpc, faNum, impError, type ActivityRow, type Exercise, type PathRow, type PublishState, type StepRow,
} from "../../../improvement/api";
import { useConfirm } from "../../../improvement/useConfirm";

type ExerciseOption = Pick<Exercise, "id" | "title" | "status" | "exercise_type" | "duration_minutes">;

interface PathForm {
  title: string;
  topic: string;
  goal: string;
  description: string;
  user_description: string;
  duration_days: string;
  sort_order: string;
  exclusive_group: string;
}
const emptyForm: PathForm = { title: "", topic: "general", goal: "", description: "", user_description: "", duration_days: "7", sort_order: "0", exclusive_group: "" };

function PathEditor({ id, onClose, onCreated, canWrite, canPublish }: { id: string | "new"; onClose: () => void; onCreated: (id: string) => void; canWrite: boolean; canPublish: boolean }) {
  const { notify } = useToast();
  const { ask, dialog } = useConfirm();
  const [path, setPath] = useState<PathRow | null>(null);
  const [form, setForm] = useState<PathForm>(emptyForm);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [acts, setActs] = useState<ActivityRow[]>([]);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [loading, setLoading] = useState(id !== "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStep, setNewStep] = useState({ day: "1", title: "" });

  const load = useCallback(async () => {
    if (!supabase) return;
    const ex = await supabase.from("improvement_exercises").select("id,title,status,exercise_type,duration_minutes").order("title");
    if (!ex.error) setExercises((ex.data ?? []) as ExerciseOption[]);
    if (id === "new") return;
    const p = await supabase.from("improvement_paths").select("*").eq("id", id).maybeSingle();
    if (p.error || !p.data) {
      setError(p.error ? impError(p.error) : "مسیر یافت نشد.");
      setLoading(false);
      return;
    }
    const row = p.data as PathRow;
    setPath(row);
    setForm({
      title: row.title, topic: row.topic, goal: row.goal ?? "", description: row.description ?? "", user_description: row.user_description ?? "",
      duration_days: String(row.duration_days), sort_order: String(row.sort_order), exclusive_group: row.exclusive_group ?? "",
    });
    const s = await supabase.from("improvement_path_steps").select("*").eq("path_id", id).order("day_number").order("sort_order");
    const stepRows = (s.data ?? []) as StepRow[];
    setSteps(stepRows);
    if (stepRows.length) {
      const a = await supabase.from("improvement_path_activities").select("*").in("step_id", stepRows.map((x) => x.id)).order("sort_order");
      setActs((a.data ?? []) as ActivityRow[]);
    } else setActs([]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = path?.status === "published";
  const editable = canWrite && !locked;

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok?: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(impError(err));
      return false;
    }
    if (ok) notify(ok);
    await load();
    return true;
  };

  const savePath = async () => {
    if (!supabase) return;
    if (form.title.trim().length < 3) return setError("عنوان مسیر حداقل ۳ کاراکتر است.");
    const payload = {
      title: form.title.trim(), topic: form.topic.trim() || "general", goal: form.goal.trim() || null, description: form.description.trim() || null,
      user_description: form.user_description.trim() || null, duration_days: Number(form.duration_days) || 7, sort_order: Number(form.sort_order) || 0,
      exclusive_group: form.exclusive_group.trim() || null,
    };
    if (id === "new") {
      setBusy(true);
      const { data, error: err } = await supabase.from("improvement_paths").insert(payload).select("id").single();
      setBusy(false);
      if (err) return setError(impError(err));
      notify("مسیر ساخته شد (پیش‌نویس). اکنون مراحل و فعالیت‌ها را اضافه کنید.");
      onCreated((data as { id: string }).id);
      return;
    }
    await run(() => supabase!.from("improvement_paths").update(payload).eq("id", id), "اطلاعات مسیر ذخیره شد.");
  };

  const setStatus = async (status: PublishState) => {
    if (!path) return;
    const text = {
      published: ["انتشار مسیر", "پس از انتشار، مسیر برای قواعد پیشنهاد و کاربران فعال می‌شود و تا بازگشت به پیش‌نویس قابل ویرایش نیست. ادامه می‌دهید؟", "انتشار"],
      draft: ["بازگشت به پیش‌نویس", "مسیر دیگر پیشنهاد داده نمی‌شود و می‌توانید آن را ویرایش کنید. برنامه‌های در حال اجرای کاربران تغییر نمی‌کنند. ادامه می‌دهید؟", "بازگشت به پیش‌نویس"],
      archived: ["آرشیو مسیر", "مسیر دیگر پیشنهاد داده نمی‌شود. برنامه‌های در حال اجرای کاربران ادامه می‌یابد. ادامه می‌دهید؟", "آرشیو"],
    }[status];
    if (!(await ask({ title: text[0], description: text[1], confirmLabel: text[2], dangerous: status === "archived" }))) return;
    await run(async () => {
      const r = await callRpc("set_improvement_path_status", { p_path_id: path.id, p_status: status });
      return { error: r.error ? { message: r.error } : null };
    }, status === "published" ? "مسیر منتشر شد." : status === "draft" ? "مسیر به پیش‌نویس بازگشت." : "مسیر آرشیو شد.");
  };

  const addStep = async () => {
    if (!supabase || !path) return;
    if (newStep.title.trim().length < 2) return setError("عنوان مرحله را وارد کنید.");
    const ok = await run(() => supabase!.from("improvement_path_steps").insert({ path_id: path.id, day_number: Number(newStep.day) || 1, title: newStep.title.trim(), sort_order: steps.length }));
    if (ok) setNewStep({ day: String(Math.min(path.duration_days, (Number(newStep.day) || 1) + 1)), title: "" });
  };
  const patchStep = (step: StepRow, values: Partial<StepRow>) => run(() => supabase!.from("improvement_path_steps").update(values).eq("id", step.id));
  const removeStep = async (step: StepRow) => {
    if (!(await ask({ title: "حذف مرحله", description: `مرحله‌ی «${step.title}» و فعالیت‌های آن حذف شود؟`, confirmLabel: "حذف", dangerous: true }))) return;
    await run(() => supabase!.from("improvement_path_steps").delete().eq("id", step.id), "مرحله حذف شد.");
  };
  const addActivity = (step: StepRow, exerciseId: string) => {
    if (!exerciseId) return;
    const count = acts.filter((a) => a.step_id === step.id).length;
    return run(() => supabase!.from("improvement_path_activities").insert({ step_id: step.id, exercise_id: exerciseId, sort_order: count, is_required: true }));
  };
  const patchActivity = (a: ActivityRow, values: Partial<ActivityRow>) => run(() => supabase!.from("improvement_path_activities").update(values).eq("id", a.id));
  const removeActivity = (a: ActivityRow) => run(() => supabase!.from("improvement_path_activities").delete().eq("id", a.id));
  const moveActivity = async (list: ActivityRow[], index: number, dir: -1 | 1) => {
    const other = list[index + dir];
    if (!other) return;
    await run(async () => {
      const r1 = await supabase!.from("improvement_path_activities").update({ sort_order: other.sort_order }).eq("id", list[index].id);
      if (r1.error) return r1;
      return supabase!.from("improvement_path_activities").update({ sort_order: list[index].sort_order }).eq("id", other.id);
    });
  };

  if (loading) return <LoadingState />;
  const exTitle = (eid: string) => exercises.find((e) => e.id === eid);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-steel"><ArrowRight className="h-4 w-4" />بازگشت به فهرست مسیرها</button>
        {path && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={path.status} />
            <span className="text-[11.5px] text-body">نسخه‌ی {faNum(path.version)}</span>
            {canPublish && path.status !== "published" && <Button size="sm" loading={busy} onClick={() => void setStatus("published")}>انتشار</Button>}
            {canPublish && path.status === "published" && <Button size="sm" variant="secondary" loading={busy} onClick={() => void setStatus("draft")}>بازگشت به پیش‌نویس برای ویرایش</Button>}
            {canPublish && path.status !== "archived" && <Button size="sm" variant="secondary" loading={busy} onClick={() => void setStatus("archived")}>آرشیو</Button>}
          </div>
        )}
      </div>

      {locked && <p className="mb-4 flex items-start gap-2 rounded-lg border border-[#e5c98f] bg-[#fdf6e8] px-3.5 py-2.5 text-[12px] leading-6 text-[#8a641f]"><Lock className="mt-0.5 h-4 w-4 shrink-0" />این مسیر منتشرشده و فقط‌خواندنی است. برای ویرایش، آن را به پیش‌نویس برگردانید و دوباره منتشر کنید؛ نسخه‌ی مسیر یک واحد زیاد می‌شود و برنامه‌های در حال اجرای کاربران همان‌طور که شروع شده‌اند باقی می‌مانند.</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#fbeceb] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#8f322d]">{error}</p>}

      <Card className="mb-5 p-4">
        <h2 className="mb-3 text-[14px] font-extrabold text-ink">اطلاعات مسیر</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="عنوان" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!editable} maxLength={150} className={inputClass} /></Field></div>
          <Field label="حوزه‌ی بهبود"><input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} disabled={!editable} maxLength={60} className={inputClass} /></Field>
          <Field label="مدت مسیر (روز)" required><input type="number" min={1} max={365} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} disabled={!editable} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="هدف کلی مسیر"><input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} disabled={!editable} maxLength={600} className={inputClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="توضیح داخلی"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!editable} maxLength={2000} className={inputClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="توضیح قابل نمایش به کاربر" hint="اگر خالی باشد، «توضیح داخلی» نمایش داده می‌شود."><textarea rows={3} value={form.user_description} onChange={(e) => setForm({ ...form, user_description: e.target.value })} disabled={!editable} maxLength={1500} className={inputClass} /></Field></div>
          <Field label="ترتیب نمایش"><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} disabled={!editable} className={inputClass} /></Field>
          <Field label="گروه انحصاری" hint="از مسیرهای هم‌گروه فقط پراولویت‌ترین پیشنهاد می‌شود (برای مسیرهای مشابه یا متناقض)."><input value={form.exclusive_group} onChange={(e) => setForm({ ...form, exclusive_group: e.target.value })} disabled={!editable} maxLength={60} className={inputClass} /></Field>
        </div>
        {editable && <div className="mt-3 flex justify-end"><Button onClick={() => void savePath()} loading={busy}>{id === "new" ? "ایجاد مسیر" : "ذخیره"}</Button></div>}
      </Card>

      {path && (
        <Card className="p-4">
          <h2 className="mb-1 text-[14px] font-extrabold text-ink">مراحل و فعالیت‌ها</h2>
          <p className="mb-3 text-[11.5px] leading-6 text-body">هر مرحله یک روز از برنامه است. فقط تمرین‌های منتشرشده قابل افزودن‌اند و برای انتشار مسیر، هر مرحله باید فعالیت داشته باشد.</p>
          {steps.length === 0 && <p className="mb-3 rounded-lg bg-[#f8fafc] p-3 text-[12px] text-body">هنوز مرحله‌ای ثبت نشده است.</p>}
          <ul className="space-y-3">
            {steps.map((step) => {
              const list = acts.filter((a) => a.step_id === step.id).sort((a, b) => a.sort_order - b.sort_order);
              return (
                <li key={step.id} className="rounded-xl border border-ink/8 p-3">
                  <div className="mb-2 grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
                    <input type="number" min={1} max={path.duration_days} defaultValue={step.day_number} disabled={!editable} onBlur={(e) => Number(e.target.value) !== step.day_number && void patchStep(step, { day_number: Number(e.target.value) || 1 })} className={inputClass} aria-label="روز" />
                    <input defaultValue={step.title} disabled={!editable} maxLength={150} onBlur={(e) => e.target.value.trim() && e.target.value !== step.title && void patchStep(step, { title: e.target.value.trim() })} className={inputClass} aria-label="عنوان مرحله" />
                    {editable && <Button size="sm" variant="ghost" onClick={() => void removeStep(step)} aria-label="حذف مرحله"><Trash2 className="h-3.5 w-3.5 text-[#a33a34]" /></Button>}
                  </div>
                  <textarea defaultValue={step.description ?? ""} disabled={!editable} rows={2} maxLength={1500} placeholder="توضیح مرحله (اختیاری)" onBlur={(e) => e.target.value !== (step.description ?? "") && void patchStep(step, { description: e.target.value.trim() || null })} className={`${inputClass} mb-2`} aria-label="توضیح مرحله" />
                  <ul className="space-y-1.5">
                    {list.map((a, i) => {
                      const e = exTitle(a.exercise_id);
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f8fafc] px-3 py-2 text-[12px]">
                          <span className="min-w-0 flex-1 font-bold text-ink">{e?.title ?? "تمرین حذف‌شده"} <span className="font-normal text-body">· {e ? EXERCISE_TYPE_LABEL[e.exercise_type] : ""}{e?.duration_minutes ? ` · ${faNum(e.duration_minutes)} دقیقه` : ""}{e && e.status !== "published" ? " · منتشر نشده" : ""}</span></span>
                          <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.is_required} disabled={!editable} onChange={(ev) => void patchActivity(a, { is_required: ev.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />الزامی</label>
                          <input defaultValue={a.suggested_time ?? ""} disabled={!editable} maxLength={40} placeholder="زمان پیشنهادی" onBlur={(ev) => ev.target.value !== (a.suggested_time ?? "") && void patchActivity(a, { suggested_time: ev.target.value.trim() || null })} className={`${inputClass} !min-h-8 max-w-[9rem] !py-1`} aria-label="زمان پیشنهادی" />
                          {editable && (
                            <>
                              <button type="button" disabled={i === 0} onClick={() => void moveActivity(list, i, -1)} className="px-1.5 text-body disabled:opacity-30" aria-label="بالا">↑</button>
                              <button type="button" disabled={i === list.length - 1} onClick={() => void moveActivity(list, i, 1)} className="px-1.5 text-body disabled:opacity-30" aria-label="پایین">↓</button>
                              <button type="button" onClick={() => void removeActivity(a)} className="text-[#a33a34]" aria-label="حذف فعالیت"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {editable && (
                    <select className={`${inputClass} mt-2`} value="" onChange={(e) => void addActivity(step, e.target.value)} aria-label="افزودن تمرین به مرحله">
                      <option value="">+ افزودن تمرین به این مرحله…</option>
                      {exercises.filter((e) => e.status === "published").map((e) => <option key={e.id} value={e.id}>{e.title} ({EXERCISE_TYPE_LABEL[e.exercise_type]})</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
              <input type="number" min={1} max={path.duration_days} value={newStep.day} onChange={(e) => setNewStep({ ...newStep, day: e.target.value })} className={inputClass} aria-label="روز مرحله‌ی جدید" />
              <input value={newStep.title} onChange={(e) => setNewStep({ ...newStep, title: e.target.value })} placeholder="عنوان مرحله‌ی جدید" maxLength={150} className={inputClass} />
              <Button onClick={() => void addStep()} loading={busy}><Plus className="h-4 w-4" />افزودن مرحله</Button>
            </div>
          )}
        </Card>
      )}
      {dialog}
    </>
  );
}

export function PathsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { ask, dialog } = useConfirm();
  const canRead = can("paths", "read");
  const canWrite = can("paths", "write");
  const canPublish = can("paths", "publish");
  const [rows, setRows] = useState<PathRow[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !canRead) return;
    setLoading(true);
    const { data, error: err } = await supabase.from("improvement_paths").select("*").order("sort_order").order("created_at", { ascending: false });
    if (err) setError(impError(err));
    else {
      setError(null);
      setRows((data ?? []) as PathRow[]);
    }
    setLoading(false);
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load, editing]);

  const remove = async (r: PathRow) => {
    if (!supabase) return;
    if (!(await ask({ title: "حذف مسیر", description: `مسیر «${r.title}» با مراحل و قواعد وابسته حذف شود؟ اگر کاربری برنامه‌ی بازی از آن دارد، حذف نمی‌شود و باید آرشیو کنید.`, confirmLabel: "حذف", dangerous: true }))) return;
    const { error: err } = await supabase.from("improvement_paths").delete().eq("id", r.id);
    if (err) return notify(impError(err), "error");
    notify("مسیر حذف شد.");
    void load();
  };

  const columns: Column<PathRow>[] = [
    { key: "title", header: "مسیر", render: (r) => (<div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{r.title}</p><p className="truncate text-[11px] text-body">{r.topic}{r.exclusive_group ? ` · گروه ${r.exclusive_group}` : ""}</p></div>) },
    { key: "days", header: "مدت", render: (r) => <span className="text-[12px] text-body">{faNum(r.duration_days)} روز</span> },
    { key: "ver", header: "نسخه", render: (r) => <span className="text-[12px] text-body">{r.version ? faNum(r.version) : "—"}</span> },
    { key: "status", header: "وضعیت", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!canRead) return <AccessDenied />;
  if (editing) return <PathEditor id={editing} canWrite={canWrite} canPublish={canPublish} onClose={() => setEditing(null)} onCreated={(id) => setEditing(id)} />;

  const visible = rows.filter((r) => !status || r.status === status);
  return (
    <>
      <PageHeader
        title="مسیرهای بهبود"
        description="مسیرهای ساختاریافته‌ی چندمرحله‌ای. فقط مسیرهای منتشرشده توسط قواعد به کاربران پیشنهاد می‌شوند."
        breadcrumb={["پنل مدیریت", "بهبود فردی", "مسیرها"]}
        actions={canWrite ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />مسیر جدید</Button> : null}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} max-w-[10rem]`} aria-label="فیلتر وضعیت">
            <option value="">وضعیت: همه</option>
            <option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option><option value="archived">آرشیو</option>
          </select>
          <span className="ms-auto text-[11.5px] text-body">{faNum(visible.length)} مسیر</span>
        </div>
        <DataTable
          columns={columns}
          rows={visible}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="مسیری ثبت نشده است"
          emptyDescription="ابتدا چند تمرین بسازید و منتشر کنید، سپس مسیر بسازید."
          rowActions={(r) => (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setEditing(r.id)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10" aria-label={`ویرایش ${r.title}`}><Pencil className="h-3.5 w-3.5" /></button>
              {canWrite && <button type="button" onClick={() => void remove(r)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-[#a33a34] hover:bg-[#fbeceb]" aria-label={`حذف ${r.title}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          )}
        />
      </Card>
      {dialog}
    </>
  );
}
