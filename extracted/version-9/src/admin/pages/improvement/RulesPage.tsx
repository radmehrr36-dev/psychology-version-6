import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { AccessDenied, Button, Card, DataTable, Field, PageHeader, StatusBadge, inputClass, useToast, type Column } from "../../ui";
import {
  OP_LABEL, callRpc, faNum, impError, isGroup, type ConditionNode, type ConditionOp, type Group, type Leaf, type PathRow, type RuleRow,
} from "../../../improvement/api";
import { useConfirm } from "../../../improvement/useConfirm";

interface TestOption { id: string; title_fa: string }
interface VersionOption { id: string; test_id: string; version_label: string; status: string; snapshot: { questions?: Array<{ dimension?: string | null }> } | null }

const OUTCOME_LABEL: Record<string, { text: string; tone: string }> = {
  suggested: { text: "پیشنهاد می‌شود", tone: "bg-[#e5f4ef] text-[#2f7d6e]" },
  not_matched: { text: "شرط‌ها برقرار نیست", tone: "bg-[#eef1f7] text-[#5b6880]" },
  skipped_after_definite: { text: "رد شد: قاعده‌ی قطعی با اولویت بالاتر برقرار شد", tone: "bg-[#fdf1df] text-[#9a6a24]" },
  path_not_published: { text: "برقرار شد، اما مسیر منتشر نشده و به کاربر پیشنهاد نمی‌شود", tone: "bg-[#fbeceb] text-[#a33a34]" },
  duplicate_path: { text: "مسیر قبلاً با قاعده‌ی پراولویت‌تر پیشنهاد شده است", tone: "bg-[#fdf1df] text-[#9a6a24]" },
  conflict_group: { text: "هم‌گروه با مسیر پیشنهادی دیگر (تداخل) است", tone: "bg-[#fdf1df] text-[#9a6a24]" },
  limit_reached: { text: "سقف ۳ پیشنهاد پر شده است", tone: "bg-[#fdf1df] text-[#9a6a24]" },
  inactive_rule: { text: "برقرار شد، اما قاعده غیرفعال است", tone: "bg-[#eef1f7] text-[#5b6880]" },
};

const newLeaf = (): Leaf => ({ metric: "total", op: "gte", value: 0 });

interface TestDetail { passed: boolean; type: string; label?: string; op?: ConditionOp; expected?: number | null; expected2?: number | null; actual?: number | null; mode?: string; items?: TestDetail[] }
function describe(d: TestDetail): string {
  if (d.type === "group") return `گروه (${d.mode === "any" ? "یکی از" : "همه‌ی"}): ${d.items?.map(describe).join("، ")}`;
  const op = d.op ? OP_LABEL[d.op] : "";
  const exp = d.op === "between" ? `${d.expected} تا ${d.expected2}` : d.op === "exists" || d.op === "not_exists" ? "" : d.expected;
  return `${d.label} ${op} ${exp ?? ""} (مقدار: ${d.actual ?? "ندارد"}) ${d.passed ? "✓" : "✗"}`;
}

function LeafEditor({ leaf, dims, onChange, onRemove }: { leaf: Leaf; dims: string[]; onChange: (l: Leaf) => void; onRemove: () => void }) {
  const needsValue = leaf.op !== "exists" && leaf.op !== "not_exists";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-ink/8">
      <select className={`${inputClass} !min-h-9 max-w-[8.5rem]`} value={leaf.metric} onChange={(e) => onChange({ ...leaf, metric: e.target.value as Leaf["metric"] })} aria-label="معیار">
        <option value="total">نمره‌ی کل</option><option value="dimension">نمره‌ی یک بُعد</option>
      </select>
      {leaf.metric === "dimension" && (
        <>
          <input className={`${inputClass} !min-h-9 max-w-[9rem]`} list="rule-dimensions" value={leaf.dimension ?? ""} placeholder="نام بُعد" onChange={(e) => onChange({ ...leaf, dimension: e.target.value })} aria-label="نام بُعد" />
          <datalist id="rule-dimensions">{dims.map((d) => <option key={d} value={d} />)}</datalist>
        </>
      )}
      <select className={`${inputClass} !min-h-9 max-w-[11rem]`} value={leaf.op} onChange={(e) => onChange({ ...leaf, op: e.target.value as ConditionOp })} aria-label="شرط">
        {(Object.keys(OP_LABEL) as ConditionOp[]).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
      </select>
      {needsValue && <input type="number" step="any" className={`${inputClass} !min-h-9 max-w-[6rem]`} value={leaf.value ?? ""} onChange={(e) => onChange({ ...leaf, value: e.target.value === "" ? undefined : Number(e.target.value) })} aria-label="مقدار" />}
      {leaf.op === "between" && <><span className="text-[12px] text-body">تا</span><input type="number" step="any" className={`${inputClass} !min-h-9 max-w-[6rem]`} value={leaf.value2 ?? ""} onChange={(e) => onChange({ ...leaf, value2: e.target.value === "" ? undefined : Number(e.target.value) })} aria-label="سقف بازه" /></>}
      <button type="button" onClick={onRemove} className="ms-auto text-[#a33a34]" aria-label="حذف شرط"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ConditionEditor({ mode, nodes, dims, onMode, onNodes, nested = false }: { mode: "all" | "any"; nodes: ConditionNode[]; dims: string[]; onMode: (m: "all" | "any") => void; onNodes: (n: ConditionNode[]) => void; nested?: boolean }) {
  const set = (i: number, n: ConditionNode) => onNodes(nodes.map((x, j) => (j === i ? n : x)));
  return (
    <div className={nested ? "rounded-lg border border-dashed border-steel/40 bg-steel/5 p-2" : ""}>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-ink">
        {nested ? "گروه شرط:" : "ترکیب شرط‌ها:"}
        <select className={`${inputClass} !min-h-8 max-w-[14rem] !py-1`} value={mode} onChange={(e) => onMode(e.target.value as "all" | "any")} aria-label="حالت ترکیب">
          <option value="all">همه‌ی شرط‌ها برقرار باشد (AND)</option><option value="any">حداقل یکی برقرار باشد (OR)</option>
        </select>
      </div>
      <div className="space-y-2">
        {nodes.map((n, i) =>
          isGroup(n) ? (
            <div key={i}>
              <ConditionEditor nested mode={n.mode} nodes={n.conditions} dims={dims} onMode={(m) => set(i, { ...n, mode: m })} onNodes={(c) => set(i, { ...n, conditions: c as Leaf[] })} />
              <button type="button" className="mt-1 text-[11.5px] font-bold text-[#a33a34]" onClick={() => onNodes(nodes.filter((_, j) => j !== i))}>حذف گروه</button>
            </div>
          ) : (
            <LeafEditor key={i} leaf={n} dims={dims} onChange={(l) => set(i, l)} onRemove={() => onNodes(nodes.filter((_, j) => j !== i))} />
          )
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => onNodes([...nodes, newLeaf()])}><Plus className="h-3.5 w-3.5" />شرط</Button>
        {!nested && <Button size="sm" variant="secondary" onClick={() => onNodes([...nodes, { mode: "any", conditions: [newLeaf()] } as Group])}><Plus className="h-3.5 w-3.5" />گروه شرط</Button>}
      </div>
    </div>
  );
}

function cleanNodes(nodes: ConditionNode[]): ConditionNode[] {
  return nodes.map((n) => {
    if (isGroup(n)) return { mode: n.mode, conditions: cleanNodes(n.conditions) as Leaf[] };
    const base: Leaf = { metric: n.metric, op: n.op };
    if (n.metric === "dimension") base.dimension = (n.dimension ?? "").trim();
    if (n.op !== "exists" && n.op !== "not_exists") base.value = n.value;
    if (n.op === "between") base.value2 = n.value2;
    return base;
  });
}

interface Draft {
  id: string | null; title: string; test_id: string; version_id: string; mode: "all" | "any"; nodes: ConditionNode[]; path_id: string;
  priority: string; strength: "suggested" | "definite"; is_active: boolean; admin_note: string; user_note: string;
}
const emptyDraft = (): Draft => ({ id: null, title: "", test_id: "", version_id: "", mode: "all", nodes: [newLeaf()], path_id: "", priority: "100", strength: "suggested", is_active: false, admin_note: "", user_note: "" });

export function RulesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { ask, dialog } = useConfirm();
  const canRead = can("paths", "read");
  const canWrite = can("paths", "write");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [tests, setTests] = useState<TestOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [paths, setPaths] = useState<PathRow[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !canRead) return;
    setLoading(true);
    const [r, t, v, p] = await Promise.all([
      supabase.from("improvement_recommendation_rules").select("*").order("priority", { ascending: false }).order("created_at"),
      supabase.from("tests").select("id,title_fa").order("title_fa"),
      supabase.from("test_versions").select("id,test_id,version_label,status,snapshot").not("snapshot", "is", null),
      supabase.from("improvement_paths").select("id,title,status,version").order("title"),
    ]);
    const err = r.error ?? p.error;
    if (err) setError(impError(err));
    else setError(null);
    setRules((r.data ?? []) as RuleRow[]);
    setTests((t.data ?? []) as TestOption[]);
    setVersions((v.data ?? []) as VersionOption[]);
    setPaths((p.data ?? []) as PathRow[]);
    setLoading(false);
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const testName = (id: string) => tests.find((t) => t.id === id)?.title_fa ?? "—";
  const pathOf = (id: string) => paths.find((p) => p.id === id);
  const dimsFor = useCallback(
    (testId: string, versionId: string) => {
      const set = new Set<string>();
      for (const v of versions) if (v.test_id === testId && (!versionId || v.id === versionId)) for (const q of v.snapshot?.questions ?? []) if (q.dimension) set.add(q.dimension);
      return [...set];
    },
    [versions]
  );

  const edit = (r: RuleRow) => { setFormError(null); setDraft({ id: r.id, title: r.title, test_id: r.test_id, version_id: r.version_id ?? "", mode: r.condition_mode, nodes: r.conditions, path_id: r.path_id, priority: String(r.priority), strength: r.strength, is_active: r.is_active, admin_note: r.admin_note ?? "", user_note: r.user_note ?? "" }); };

  const save = async () => {
    if (!supabase || !draft) return;
    setFormError(null);
    if (draft.title.trim().length < 3) return setFormError("عنوان قاعده را وارد کنید.");
    if (!draft.test_id) return setFormError("آزمون را انتخاب کنید.");
    if (!draft.path_id) return setFormError("مسیر خروجی را انتخاب کنید.");
    const payload = {
      title: draft.title.trim(), test_id: draft.test_id, version_id: draft.version_id || null, condition_mode: draft.mode, conditions: cleanNodes(draft.nodes),
      path_id: draft.path_id, priority: Number(draft.priority) || 0, strength: draft.strength, is_active: draft.is_active,
      admin_note: draft.admin_note.trim() || null, user_note: draft.user_note.trim() || null,
    };
    setSaving(true);
    const res = draft.id ? await supabase.from("improvement_recommendation_rules").update(payload).eq("id", draft.id) : await supabase.from("improvement_recommendation_rules").insert(payload);
    setSaving(false);
    if (res.error) return setFormError(impError(res.error));
    notify("قاعده ذخیره شد.");
    setDraft(null);
    void load();
  };

  const toggle = async (r: RuleRow) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("improvement_recommendation_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (err) return notify(impError(err), "error");
    notify(r.is_active ? "قاعده غیرفعال شد." : "قاعده فعال شد.");
    void load();
  };
  const remove = async (r: RuleRow) => {
    if (!supabase || !(await ask({ title: "حذف قاعده", description: `قاعده‌ی «${r.title}» حذف شود؟ پیشنهادهای قبلی کاربران حذف نمی‌شوند.`, confirmLabel: "حذف", dangerous: true }))) return;
    const { error: err } = await supabase.from("improvement_recommendation_rules").delete().eq("id", r.id);
    if (err) return notify(impError(err), "error");
    notify("قاعده حذف شد.");
    void load();
  };

  const columns: Column<RuleRow>[] = [
    { key: "title", header: "قاعده", render: (r) => (<div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{r.title}</p><p className="truncate text-[11px] text-body">{testName(r.test_id)} ← {pathOf(r.path_id)?.title ?? "—"}</p></div>) },
    { key: "prio", header: "اولویت", render: (r) => <span className="text-[12px] text-body">{faNum(r.priority)}{r.strength === "definite" ? " · قطعی" : ""}</span> },
    { key: "path", header: "وضعیت مسیر", render: (r) => <StatusBadge status={pathOf(r.path_id)?.status ?? "draft"} /> },
    { key: "active", header: "قاعده", render: (r) => <StatusBadge status={r.is_active ? "active" : "draft"} className={r.is_active ? "" : ""} /> },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="قواعد پیشنهاد مسیر"
        description="هر قاعده مشخص می‌کند نتیجه‌ی کدام آزمون و با چه نمره‌ای، کدام مسیر را پیشنهاد کند. قاعده‌ی جدید غیرفعال ساخته می‌شود تا ابتدا آزمایش شود."
        breadcrumb={["پنل مدیریت", "بهبود فردی", "قواعد پیشنهاد"]}
        actions={canWrite ? <Button onClick={() => { setFormError(null); setDraft(emptyDraft()); }}><Plus className="h-4 w-4" />قاعده‌ی جدید</Button> : null}
      />
      <Card className="mb-5">
        <DataTable
          columns={columns}
          rows={rules}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="قاعده‌ای تعریف نشده است"
          emptyDescription="بدون قاعده، هیچ مسیری به کاربران پیشنهاد نمی‌شود."
          rowActions={(r) => canWrite ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void toggle(r)} className="rounded-md px-2 text-[11.5px] font-bold text-steel hover:bg-steel/10" aria-label={r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}>{r.is_active ? "غیرفعال کن" : "فعال کن"}</button>
              <button type="button" onClick={() => edit(r)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-steel hover:bg-steel/10" aria-label={`ویرایش ${r.title}`}><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void remove(r)} className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-[#a33a34] hover:bg-[#fbeceb]" aria-label={`حذف ${r.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
        />
      </Card>

      <RuleTester tests={tests} versions={versions} dimsFor={dimsFor} />

      {draft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="قاعده‌ی پیشنهاد" className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{draft.id ? "ویرایش قاعده" : "قاعده‌ی جدید"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="عنوان (برای مدیر)" required><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={150} className={inputClass} /></Field></div>
              <Field label="آزمون" required>
                <select value={draft.test_id} onChange={(e) => setDraft({ ...draft, test_id: e.target.value, version_id: "" })} className={inputClass}>
                  <option value="">انتخاب کنید…</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.title_fa}</option>)}
                </select>
              </Field>
              <Field label="نسخه‌ی آزمون" hint="«همه‌ی نسخه‌ها» قاعده را برای هر نسخه‌ی آزمون اعمال می‌کند.">
                <select value={draft.version_id} onChange={(e) => setDraft({ ...draft, version_id: e.target.value })} className={inputClass} disabled={!draft.test_id}>
                  <option value="">همه‌ی نسخه‌ها</option>{versions.filter((v) => v.test_id === draft.test_id).map((v) => <option key={v.id} value={v.id}>{v.version_label} ({v.status === "published" ? "منتشرشده" : v.status})</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-ink/8 bg-[#f8fafc] p-3">
              <h3 className="mb-2 text-[12.5px] font-extrabold text-ink">شرط‌ها</h3>
              <ConditionEditor mode={draft.mode} nodes={draft.nodes} dims={dimsFor(draft.test_id, draft.version_id)} onMode={(m) => setDraft({ ...draft, mode: m })} onNodes={(n) => setDraft({ ...draft, nodes: n })} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="مسیر پیشنهادی (خروجی)" required hint="فقط مسیر منتشرشده به کاربر پیشنهاد می‌شود.">
                <select value={draft.path_id} onChange={(e) => setDraft({ ...draft, path_id: e.target.value })} className={inputClass}>
                  <option value="">انتخاب کنید…</option>{paths.map((p) => <option key={p.id} value={p.id}>{p.title} — {p.status === "published" ? "منتشرشده" : p.status === "draft" ? "پیش‌نویس" : "آرشیو"}</option>)}
                </select></Field></div>
              <Field label="اولویت" hint="عدد بزرگ‌تر = ابتدا بررسی می‌شود."><input type="number" min={0} max={10000} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} className={inputClass} /></Field>
              <Field label="نوع پیشنهاد" hint="«قطعی» پس از برقراری، قواعد کم‌اولویت‌تر را متوقف می‌کند.">
                <select value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value as Draft["strength"] })} className={inputClass}><option value="suggested">پیشنهادی (می‌تواند همراه دیگر پیشنهادها باشد)</option><option value="definite">قطعی</option></select>
              </Field>
              <div className="sm:col-span-2"><Field label="توضیح قابل نمایش به کاربر (دلیل پیشنهاد)" hint="لحن غیرتشخیصی و محتاطانه باشد."><textarea rows={2} value={draft.user_note} maxLength={600} onChange={(e) => setDraft({ ...draft, user_note: e.target.value })} className={inputClass} /></Field></div>
              <div className="sm:col-span-2"><Field label="توضیح داخلی (فقط مدیران)"><textarea rows={2} value={draft.admin_note} maxLength={1500} onChange={(e) => setDraft({ ...draft, admin_note: e.target.value })} className={inputClass} /></Field></div>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink sm:col-span-2"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />قاعده فعال باشد (پس از آزمایش فعال کنید)</label>
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

function RuleTester({ tests, versions, dimsFor }: { tests: TestOption[]; versions: VersionOption[]; dimsFor: (t: string, v: string) => string[] }) {
  const [testId, setTestId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [total, setTotal] = useState("0");
  const [dims, setDims] = useState<Record<string, string>>({});
  const [inactive, setInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ entries: Array<{ rule_id: string; rule_title: string; priority: number; strength: string; path_title: string; outcome: string; matched: boolean; details: TestDetail[] }>; suggested: Array<{ path_id: string; rank: number }> } | null>(null);
  const dimNames = useMemo(() => dimsFor(testId, versionId), [dimsFor, testId, versionId]);

  const run = async () => {
    setError(null);
    if (!testId) return setError("آزمون را انتخاب کنید.");
    if (total.trim() === "" || Number.isNaN(Number(total))) return setError("نمره‌ی کل باید عدد باشد.");
    const d: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) if (v.trim() !== "" && !Number.isNaN(Number(v))) d[k] = Number(v);
    setBusy(true);
    const res = await callRpc<NonNullable<typeof result>>("admin_test_recommendation_rules", { p_test_id: testId, p_version_id: versionId || null, p_total: Number(total), p_dims: d, p_include_inactive: inactive });
    setBusy(false);
    if (res.error) return setError(res.error);
    setResult(res.data);
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-[14px] font-extrabold text-ink"><FlaskConical className="h-4 w-4 text-steel" />آزمایش قواعد</h2>
      <p className="mb-3 text-[11.5px] leading-6 text-body">نمره‌ها را وارد کنید تا ببینید کدام قواعد برقرار می‌شوند و چرا. این ابزار هیچ نتیجه یا پیشنهادی ذخیره نمی‌کند.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="آزمون"><select value={testId} onChange={(e) => { setTestId(e.target.value); setVersionId(""); setDims({}); setResult(null); }} className={inputClass}><option value="">انتخاب کنید…</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.title_fa}</option>)}</select></Field>
        <Field label="نسخه"><select value={versionId} onChange={(e) => setVersionId(e.target.value)} className={inputClass} disabled={!testId}><option value="">بدون نسخه‌ی مشخص</option>{versions.filter((v) => v.test_id === testId).map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}</select></Field>
        <Field label="نمره‌ی کل"><input type="number" step="any" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} /></Field>
      </div>
      {dimNames.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {dimNames.map((d) => <Field key={d} label={`بُعد «${d}»`}><input type="number" step="any" value={dims[d] ?? ""} onChange={(e) => setDims({ ...dims, [d]: e.target.value })} className={inputClass} /></Field>)}
        </div>
      )}
      <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-ink"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="h-4 w-4 accent-[#4a58a6]" />قواعد غیرفعال هم بررسی شوند (فقط برای آزمایش)</label>
      {error && <p role="alert" className="mt-3 rounded-lg bg-[#fbeceb] px-3 py-2 text-[12.5px] font-semibold text-[#8f322d]">{error}</p>}
      <div className="mt-3"><Button onClick={() => void run()} loading={busy}>اجرای آزمایش</Button></div>
      {result && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className="text-[12.5px] font-bold text-ink">{result.suggested.length ? `${faNum(result.suggested.length)} مسیر به کاربر پیشنهاد می‌شد.` : "هیچ مسیری پیشنهاد نمی‌شد."}</p>
          {result.entries.length === 0 && <p className="rounded-lg bg-[#f8fafc] p-3 text-[12px] text-body">برای این آزمون قاعده‌ی فعالی وجود ندارد.</p>}
          {result.entries.map((e) => {
            const o = OUTCOME_LABEL[e.outcome] ?? { text: e.outcome, tone: "bg-mist text-body" };
            return (
              <div key={e.rule_id} className="rounded-lg border border-ink/8 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-bold text-ink">{e.rule_title} <span className="font-normal text-body">← {e.path_title} · اولویت {faNum(e.priority)}{e.strength === "definite" ? " · قطعی" : ""}</span></p>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${o.tone}`}>{o.text}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-body">{e.details.map((d, i) => <li key={i}>{describe(d)}</li>)}</ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
