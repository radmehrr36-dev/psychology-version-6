import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck2,
  GitBranch,
  ListChecks,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PublishBadge,
  StatusBadge,
  formatDate,
  inputClass,
  toFa,
  useToast,
} from "../ui";
import type { QuestionType, TestInterpretation, TestOption, TestQuestion, TestRow, TestVersion } from "../../lib/types";

interface QuestionDraft {
  id?: string;
  prompt: string;
  help_text: string;
  type: QuestionType;
  dimension: string;
  is_required: boolean;
  options: Array<{ label: string; score: string; value: string }>;
}

const emptyQuestion: QuestionDraft = {
  prompt: "",
  help_text: "",
  type: "likert",
  dimension: "",
  is_required: true,
  options: [],
};

const LIKERT_TEMPLATE = [
  { label: "کاملاً مخالفم", score: "1", value: "1" },
  { label: "مخالفم", score: "2", value: "2" },
  { label: "بی‌نظر", score: "3", value: "3" },
  { label: "موافقم", score: "4", value: "4" },
  { label: "کاملاً موافقم", score: "5", value: "5" },
];

const lockedStatuses = new Set(["published", "archived"]);

export function TestEditorPage() {
  const { testId = "" } = useParams();
  const { can } = useAuth();
  const { notify } = useToast();
  const canWrite = can("tests", "write");
  const canReview = can("tests", "review");
  const canPublish = can("tests", "publish");

  const [test, setTest] = useState<TestRow | null>(null);
  const [versions, setVersions] = useState<TestVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [options, setOptions] = useState<TestOption[]>([]);
  const [interpretations, setInterpretations] = useState<TestInterpretation[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionLoading, setVersionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(emptyQuestion);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState("v2");
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [interpDraft, setInterpDraft] = useState({ label: "", min: "", max: "", description: "", dimension: "total" });
  const [scoringMethod, setScoringMethod] = useState("sum");
  const [confirmPublish, setConfirmPublish] = useState(false);

  const loadTest = useCallback(async () => {
    if (!supabase || !testId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: t, error: tErr } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
      if (tErr) throw tErr;
      if (!t) {
        setError("آزمون یافت نشد یا دسترسی به آن مجاز نیست.");
        return;
      }
      setTest(t as TestRow);
      const { data: v, error: vErr } = await supabase
        .from("test_versions")
        .select("*")
        .eq("test_id", testId)
        .order("created_at", { ascending: false });
      if (vErr) throw vErr;
      const list = (v ?? []) as TestVersion[];
      setVersions(list);
      const preferred = list.find((x) => x.status === "published") ?? list.find((x) => x.status === "draft") ?? list[0];
      setActiveVersionId((prev) => (prev && list.some((x) => x.id === prev) ? prev : preferred?.id ?? ""));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    void loadTest();
  }, [loadTest]);

  const activeVersion = useMemo(() => versions.find((v) => v.id === activeVersionId) ?? null, [versions, activeVersionId]);
  const locked = Boolean(activeVersion && lockedStatuses.has(activeVersion.status));

  const loadVersionContent = useCallback(async (versionId: string) => {
    if (!supabase || !versionId) {
      setQuestions([]);
      setOptions([]);
      setInterpretations([]);
      return;
    }
    setVersionLoading(true);
    try {
      const [{ data: qs, error: qErr }, { data: interps }] = await Promise.all([
        supabase.from("test_questions").select("*").eq("version_id", versionId).order("sort_order"),
        supabase.from("test_interpretations").select("*").eq("version_id", versionId).order("sort_order"),
      ]);
      if (qErr) throw qErr;
      const questionRows = (qs ?? []) as TestQuestion[];
      setQuestions(questionRows);
      setInterpretations((interps ?? []) as TestInterpretation[]);
      if (questionRows.length > 0) {
        const { data: opts } = await supabase
          .from("test_question_options")
          .select("*")
          .in("question_id", questionRows.map((q) => q.id))
          .order("sort_order");
        setOptions((opts ?? []) as TestOption[]);
      } else {
        setOptions([]);
      }
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setVersionLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadVersionContent(activeVersionId);
    if (activeVersion?.scoring_rules && typeof activeVersion.scoring_rules.method === "string") {
      setScoringMethod(activeVersion.scoring_rules.method);
    }
  }, [activeVersionId, activeVersion?.scoring_rules, loadVersionContent]);

  if (!can("tests", "read")) return <AccessDenied />;

  if (loading) {
    return (
      <Card>
        <LoadingState label="دریافت آزمون از پایگاه داده…" />
      </Card>
    );
  }
  if (error || !test) {
    return (
      <Card>
        <ErrorState message={error ?? "آزمون یافت نشد."} onRetry={() => void loadTest()} />
        <div className="border-t border-ink/8 p-3 text-center">
          <Link to="/admin/tests" className="text-[12px] font-bold text-steel">بازگشت به فهرست آزمون‌ها</Link>
        </div>
      </Card>
    );
  }

  const openNewQuestion = () => {
    setQuestionDraft({ ...emptyQuestion, options: LIKERT_TEMPLATE.map((o) => ({ ...o })) });
    setQuestionError(null);
    setQuestionOpen(true);
  };

  const openEditQuestion = (q: TestQuestion) => {
    const qOpts = options.filter((o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order);
    setQuestionDraft({
      id: q.id,
      prompt: q.prompt,
      help_text: q.help_text ?? "",
      type: q.type,
      dimension: q.dimension ?? "",
      is_required: q.is_required,
      options: qOpts.map((o) => ({ label: o.label, score: String(o.score), value: o.value ?? "" })),
    });
    setQuestionError(null);
    setQuestionOpen(true);
  };

  const saveQuestion = async () => {
    if (!supabase || !activeVersion) return;
    setQuestionError(null);
    if (!questionDraft.prompt.trim()) {
      setQuestionError("متن سؤال الزامی است.");
      return;
    }
    const cleanOptions = questionDraft.options.filter((o) => o.label.trim());
    if (cleanOptions.length === 0) {
      setQuestionError("برای سؤال حداقل یک گزینه لازم است.");
      return;
    }
    if (cleanOptions.some((o) => Number.isNaN(Number(o.score)))) {
      setQuestionError("امتیاز گزینه‌ها باید عدد باشد.");
      return;
    }
    setSavingQuestion(true);
    try {
      let questionId = questionDraft.id;
      const payload = {
        prompt: questionDraft.prompt.trim(),
        help_text: questionDraft.help_text.trim() || null,
        type: questionDraft.type,
        dimension: questionDraft.dimension.trim() || null,
        is_required: questionDraft.is_required,
        version_id: activeVersion.id,
        sort_order: questionDraft.id ? questions.find((q) => q.id === questionDraft.id)?.sort_order ?? questions.length : questions.length,
      };
      if (questionId) {
        const { error } = await supabase.from("test_questions").update(payload).eq("id", questionId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("test_question_options").delete().eq("question_id", questionId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("test_questions").insert(payload).select("id").single();
        if (error) throw error;
        questionId = data.id;
      }
      const { error: optErr } = await supabase.from("test_question_options").insert(
        cleanOptions.map((o, i) => ({
          question_id: questionId,
          label: o.label.trim(),
          score: Number(o.score) || 0,
          value: o.value.trim() || String(i + 1),
          sort_order: i,
        }))
      );
      if (optErr) throw optErr;
      notify(questionDraft.id ? "سؤال و گزینه‌ها به‌روزرسانی شد." : "سؤال اضافه شد.");
      setQuestionOpen(false);
      await loadVersionContent(activeVersion.id);
      await loadTest();
    } catch (e) {
      setQuestionError(friendlyError(e));
    } finally {
      setSavingQuestion(false);
    }
  };

  const deleteQuestion = async () => {
    if (!supabase || !deleteQuestionId) return;
    setBusyAction("delete-question");
    const { error } = await supabase.from("test_questions").delete().eq("id", deleteQuestionId);
    setBusyAction(null);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify("سؤال حذف شد.");
    setDeleteQuestionId(null);
    await loadVersionContent(activeVersionId);
    await loadTest();
  };

  const moveQuestion = async (question: TestQuestion, direction: -1 | 1) => {
    if (!supabase || locked) return;
    const index = questions.findIndex((q) => q.id === question.id);
    const neighbor = questions[index + direction];
    if (!neighbor) return;
    setBusyAction(`move-${question.id}`);
    const { error: e1 } = await supabase.from("test_questions").update({ sort_order: neighbor.sort_order }).eq("id", question.id);
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from("test_questions").update({ sort_order: question.sort_order }).eq("id", neighbor.id);
    setBusyAction(null);
    if (e1 || e2) {
      notify(friendlyError(e1 ?? e2), "error");
      return;
    }
    await loadVersionContent(activeVersionId);
  };

  const createVersion = async () => {
    if (!supabase || !test) return;
    if (!/^[A-Za-z0-9._-]{1,20}$/.test(versionLabel)) {
      notify("برچسب نسخه باید فقط شامل حروف/عدد/نقطه باشد.", "error");
      return;
    }
    setBusyAction("create-version");
    const { data, error: err } = await supabase
      .from("test_versions")
      .insert({ test_id: test.id, version_label: versionLabel, status: "draft", scoring_rules: { method: scoringMethod } })
      .select("id")
      .single();
    setBusyAction(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("نسخه‌ی پیش‌نویس جدید ساخته شد.");
    setNewVersionOpen(false);
    await loadTest();
    setActiveVersionId(data.id);
  };

  const setVersionStatus = async (status: "in_review") => {
    if (!supabase || !activeVersion) return;
    setBusyAction("status");
    const { error: err } = await supabase.from("test_versions").update({ status }).eq("id", activeVersion.id);
    setBusyAction(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("نسخه برای بازبینی علمی ارسال شد.");
    await loadTest();
  };

  const approveVersion = async () => {
    if (!supabase || !activeVersion) return;
    setBusyAction("approve");
    const { error: err } = await supabase.rpc("approve_test_version", { p_version_id: activeVersion.id });
    setBusyAction(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("نسخه تأیید علمی شد. اکنون قابل انتشار است.");
    await loadTest();
  };

  const publishVersion = async () => {
    if (!supabase || !activeVersion) return;
    setBusyAction("publish");
    const { error: err } = await supabase.rpc("publish_test_version", { p_version_id: activeVersion.id });
    setBusyAction(null);
    setConfirmPublish(false);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("نسخه منتشر شد و آزمون در سایت عمومی قابل مشاهده است.");
    await loadTest();
  };

  const saveScoring = async () => {
    if (!supabase || !activeVersion) return;
    setBusyAction("scoring");
    const { error: err } = await supabase
      .from("test_versions")
      .update({ scoring_rules: { ...activeVersion.scoring_rules, method: scoringMethod } })
      .eq("id", activeVersion.id);
    setBusyAction(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("قواعد امتیازدهی ذخیره شد.");
    await loadTest();
  };

  const addInterpretation = async () => {
    if (!supabase || !activeVersion) return;
    const min = Number(interpDraft.min);
    const max = Number(interpDraft.max);
    if (!interpDraft.label.trim() || !interpDraft.description.trim() || Number.isNaN(min) || Number.isNaN(max) || max < min) {
      notify("برچسب، متن تفسیر و بازه‌ی عددی معتبر لازم است.", "error");
      return;
    }
    setBusyAction("add-interp");
    const { error: err } = await supabase.from("test_interpretations").insert({
      version_id: activeVersion.id,
      dimension: interpDraft.dimension.trim() || "total",
      label: interpDraft.label.trim(),
      description: interpDraft.description.trim(),
      min_score: min,
      max_score: max,
      sort_order: interpretations.length,
    });
    setBusyAction(null);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    notify("بازه‌ی تفسیر اضافه شد.");
    setInterpDraft({ label: "", min: "", max: "", description: "", dimension: "total" });
    await loadVersionContent(activeVersion.id);
  };

  const removeInterpretation = async (id: string) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("test_interpretations").delete().eq("id", id);
    if (err) {
      notify(friendlyError(err), "error");
      return;
    }
    await loadVersionContent(activeVersionId);
  };

  return (
    <>
      <div className="mb-4">
        <Link to="/admin/tests" className="mb-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-steel hover:text-ink">
          <ArrowRight className="h-3.5 w-3.5" />
          بازگشت به آزمون‌ها
        </Link>
        <PageHeader
          title={test.title_fa}
          description={test.short_description ?? "توضیح کوتاهی برای این آزمون ثبت نشده است."}
          breadcrumb={["پنل مدیریت", "آزمون‌ها", test.title_fa]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PublishBadge status={test.status} />
              <StatusBadge status={test.review_status} />
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5" />
                پیش‌نمایش
              </Button>
            </div>
          }
        />
      </div>

      {!activeVersion && (
        <Card>
          <div className="px-5 py-12 text-center">
            <GitBranch className="mx-auto mb-3 h-6 w-6 text-steel" />
            <p className="text-[13px] font-bold text-ink">هنوز نسخه‌ای برای این آزمون ساخته نشده است</p>
            <p className="mt-1 text-[12px] text-body">برای ورود سؤال‌ها، ابتدا یک نسخه‌ی پیش‌نویس بسازید.</p>
            {canWrite && (
              <Button className="mt-4" onClick={() => setNewVersionOpen(true)}>
                <Plus className="h-4 w-4" />
                ساخت نسخه
              </Button>
            )}
          </div>
        </Card>
      )}

      {activeVersion && (
        <div className="grid gap-4 xl:grid-cols-4">
          {/* نسخه‌ها */}
          <div className="space-y-4 xl:col-span-1">
            <Card>
              <div className="flex items-center justify-between border-b border-ink/8 px-3.5 py-2.5">
                <h2 className="text-[12.5px] font-extrabold text-ink">نسخه‌ها</h2>
                {canWrite && (
                  <button type="button" onClick={() => setNewVersionOpen(true)} className="flex min-h-8 items-center gap-1 rounded-sm px-2 text-[11px] font-bold text-steel hover:bg-steel/10">
                    <Plus className="h-3.5 w-3.5" />
                    جدید
                  </button>
                )}
              </div>
              {versions.length === 0 ? (
                <p className="px-3.5 py-4 text-[11.5px] text-body">نسخه‌ای وجود ندارد.</p>
              ) : (
                <ul className="p-2">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setActiveVersionId(v.id)}
                        className={`mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right transition-colors ${v.id === activeVersionId ? "bg-steel/10" : "hover:bg-mist"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold text-ink">{v.version_label}</span>
                          <span className="block text-[10px] text-body">{formatDate(v.created_at)}</span>
                        </span>
                        <StatusBadge status={v.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-ink/8 px-3.5 py-2.5 text-[10.5px] leading-5 text-body">
                نسخه‌ی منتشرشده قفل است؛ برای تغییر، نسخه‌ی جدید بسازید.
              </div>
            </Card>

            <Card className="p-3.5">
              <h3 className="mb-2 text-[12.5px] font-extrabold text-ink">گردش کار نسخه</h3>
              <div className="space-y-2 text-[11.5px] text-body">
                <p>وضعیت فعلی: <StatusBadge status={activeVersion.status} /></p>
                {activeVersion.approved_at && <p>تأیید علمی: {formatDate(activeVersion.approved_at, true)}</p>}
                {activeVersion.published_at && <p>انتشار: {formatDate(activeVersion.published_at, true)}</p>}
                {activeVersion.snapshot ? <p className="text-[#2f7d6e]">این نسخه snapshot تغییرناپذیر دارد.</p> : <p>بدون snapshot تا زمان انتشار</p>}
              </div>
              <div className="mt-3 space-y-2">
                {canWrite && activeVersion.status === "draft" && (
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => void setVersionStatus("in_review")} loading={busyAction === "status"}>
                    ارسال برای بازبینی علمی
                  </Button>
                )}
                {canReview && ["in_review", "draft"].includes(activeVersion.status) && (
                  <Button size="sm" className="w-full" onClick={() => void approveVersion()} loading={busyAction === "approve"}>
                    <FileCheck2 className="h-3.5 w-3.5" />
                    تأیید بازبینی علمی
                  </Button>
                )}
                {canPublish && activeVersion.status === "approved" && (
                  <Button size="sm" className="w-full" onClick={() => setConfirmPublish(true)} loading={busyAction === "publish"}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    انتشار نسخه
                  </Button>
                )}
                {activeVersion.status !== "approved" && canPublish && (
                  <p className="rounded-md bg-[#f8fafc] p-2 text-[10.5px] leading-5 text-body">
                    انتشار فقط پس از تأیید بازبین روان‌شناسی فعال می‌شود.
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* سؤال‌ها و محتوا */}
          <div className="space-y-4 xl:col-span-3">
            {locked && (
              <div className="rounded-lg border border-[#e5c98f] bg-[#fdf6e8] px-3.5 py-2.5 text-[11.5px] leading-6 text-[#8a641f]">
                این نسخه {activeVersion.status === "published" ? "منتشر" : "آرشیو"} شده و محتوای آن تغییرناپذیر است. برای ویرایش، نسخه‌ی جدید بسازید.
              </div>
            )}

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/8 px-4 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                    <ListChecks className="h-4 w-4 text-steel" />
                    سؤال‌ها
                    <span className="text-[11px] font-semibold text-body">({toFa(questions.length)})</span>
                  </h2>
                  <p className="mt-0.5 text-[10.5px] text-body">هر سؤال باید حداقل یک گزینه با امتیاز داشته باشد.</p>
                </div>
                {canWrite && !locked && (
                  <Button size="sm" onClick={openNewQuestion}>
                    <Plus className="h-3.5 w-3.5" />
                    افزودن سؤال
                  </Button>
                )}
              </div>

              {versionLoading ? (
                <LoadingState />
              ) : questions.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] leading-6 text-body">
                  سؤالی ثبت نشده است. نسخه بدون سؤال قابل انتشار نیست.
                </div>
              ) : (
                <ol className="divide-y divide-ink/5">
                  {questions.map((q, idx) => {
                    const qOpts = options.filter((o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order);
                    return (
                      <li key={q.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-bold leading-6 text-ink">
                              <span className="me-1.5 text-body">{toFa(idx + 1)}.</span>
                              {q.prompt}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-body">
                              {q.type === "likert" ? "طیف لیکرت" : q.type === "multi_choice" ? "چندگزینه‌ای" : "تک‌انتخابی"}
                              {q.dimension ? ` · بعد: ${q.dimension}` : ""}
                              {q.is_required ? " · الزامی" : " · اختیاری"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {qOpts.map((o) => (
                                <span key={o.id} className="rounded-sm bg-[#f8fafc] px-1.5 py-0.5 text-[10px] text-body ring-1 ring-ink/5">
                                  {o.label} <span className="text-fog">({toFa(o.score)})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {canWrite && !locked && (
                              <>
                                <button type="button" onClick={() => void moveQuestion(q, -1)} disabled={idx === 0} className="flex h-8 w-8 items-center justify-center rounded-sm text-body hover:bg-mist disabled:opacity-30" aria-label="جابه‌جایی به بالا">
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void moveQuestion(q, 1)} disabled={idx === questions.length - 1} className="flex h-8 w-8 items-center justify-center rounded-sm text-body hover:bg-mist disabled:opacity-30" aria-label="جابه‌جایی به پایین">
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                <Button size="sm" variant="secondary" onClick={() => openEditQuestion(q)}>ویرایش</Button>
                                <button type="button" onClick={() => setDeleteQuestionId(q.id)} className="flex h-8 w-8 items-center justify-center rounded-sm text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف سؤال">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="border-b border-ink/8 px-4 py-3">
                  <h2 className="text-[13px] font-extrabold text-ink">قواعد امتیازدهی</h2>
                  <p className="mt-0.5 text-[10.5px] text-body">در snapshot نسخه‌ی منتشرشده ذخیره می‌شود.</p>
                </div>
                <div className="space-y-3 p-4">
                  <Field label="روش محاسبه‌ی امتیاز">
                    <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value)} className={inputClass} disabled={!canWrite || locked}>
                      <option value="sum">جمع امتیاز گزینه‌ها</option>
                      <option value="average">میانگین امتیازها</option>
                    </select>
                  </Field>
                  {canWrite && !locked && (
                    <Button size="sm" variant="secondary" onClick={() => void saveScoring()} loading={busyAction === "scoring"}>
                      <Save className="h-3.5 w-3.5" />
                      ذخیره‌ی قواعد
                    </Button>
                  )}
                  <p className="text-[10.5px] leading-5 text-body">
                    هرگزینه امتیاز عددی دارد. تفسیرها بر اساس بازه‌های امتیاز تعریف می‌شوند و جایگزین ارزیابی تخصصی
                    نیستند.
                  </p>
                </div>
              </Card>

              <Card>
                <div className="border-b border-ink/8 px-4 py-3">
                  <h2 className="text-[13px] font-extrabold text-ink">بازه‌های تفسیر</h2>
                </div>
                <div className="p-4">
                  {interpretations.length === 0 ? (
                    <p className="mb-3 rounded-lg bg-[#f8fafc] p-3 text-[11.5px] leading-6 text-body">
                      هنوز بازه‌ای تعریف نشده است. متن تفسیر باید توسط بازبین علمی تأیید شود.
                    </p>
                  ) : (
                    <ul className="mb-3 space-y-2">
                      {interpretations.map((i) => (
                        <li key={i.id} className="flex items-start justify-between gap-2 rounded-lg border border-ink/8 p-2.5">
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-bold text-ink">{i.label} <span className="text-body">({toFa(i.min_score)}–{toFa(i.max_score)})</span></p>
                            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-5 text-body">{i.description}</p>
                          </div>
                          {canWrite && !locked && (
                            <button type="button" onClick={() => void removeInterpretation(i.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف بازه">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {canWrite && !locked && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="برچسب" value={interpDraft.label} onChange={(e) => setInterpDraft({ ...interpDraft, label: e.target.value })} className={inputClass} aria-label="برچسب تفسیر" />
                        <input placeholder="بعد (total)" value={interpDraft.dimension} onChange={(e) => setInterpDraft({ ...interpDraft, dimension: e.target.value })} className={inputClass} aria-label="بعد تفسیر" />
                        <input type="number" placeholder="حداقل" value={interpDraft.min} onChange={(e) => setInterpDraft({ ...interpDraft, min: e.target.value })} className={inputClass} aria-label="حداقل امتیاز" />
                        <input type="number" placeholder="حداکثر" value={interpDraft.max} onChange={(e) => setInterpDraft({ ...interpDraft, max: e.target.value })} className={inputClass} aria-label="حداکثر امتیاز" />
                      </div>
                      <textarea placeholder="متن تفسیر" rows={2} value={interpDraft.description} onChange={(e) => setInterpDraft({ ...interpDraft, description: e.target.value })} className={`${inputClass} leading-6`} aria-label="متن تفسیر" />
                      <Button size="sm" variant="secondary" onClick={() => void addInterpretation()} loading={busyAction === "add-interp"}>
                        <Plus className="h-3.5 w-3.5" />
                        افزودن بازه
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* مودال سؤال */}
      {questionOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !savingQuestion && setQuestionOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="فرم سؤال" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{questionDraft.id ? "ویرایش سؤال" : "سؤال جدید"}</h2>
            <div className="grid gap-3">
              <Field label="متن سؤال" required>
                <textarea rows={2} value={questionDraft.prompt} onChange={(e) => setQuestionDraft({ ...questionDraft, prompt: e.target.value })} className={`${inputClass} leading-6`} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="نوع سؤال">
                  <select value={questionDraft.type} onChange={(e) => setQuestionDraft({ ...questionDraft, type: e.target.value as QuestionType })} className={inputClass}>
                    <option value="likert">طیف لیکرت</option>
                    <option value="single_choice">تک‌انتخابی</option>
                    <option value="multi_choice">چندگزینه‌ای</option>
                  </select>
                </Field>
                <Field label="بعد/مؤلفه (اختیاری)" hint="برای امتیازدهی ابعادی">
                  <input value={questionDraft.dimension} onChange={(e) => setQuestionDraft({ ...questionDraft, dimension: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <Field label="راهنمای سؤال (اختیاری)">
                <input value={questionDraft.help_text} onChange={(e) => setQuestionDraft({ ...questionDraft, help_text: e.target.value })} className={inputClass} />
              </Field>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-ink">گزینه‌ها و امتیاز</span>
                  <button type="button" onClick={() => setQuestionDraft({ ...questionDraft, options: LIKERT_TEMPLATE.map((o) => ({ ...o })) })} className="text-[10.5px] font-bold text-steel hover:text-ink">
                    درج قالب لیکرت ۱ تا ۵
                  </button>
                </div>
                <div className="space-y-2">
                  {questionDraft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={opt.label} onChange={(e) => setQuestionDraft({ ...questionDraft, options: questionDraft.options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)) })} className={`${inputClass} flex-1`} placeholder="متن گزینه" aria-label={`گزینه ${i + 1}`} />
                      <input type="number" value={opt.score} onChange={(e) => setQuestionDraft({ ...questionDraft, options: questionDraft.options.map((o, j) => (j === i ? { ...o, score: e.target.value } : o)) })} className={`${inputClass} w-20`} placeholder="امتیاز" aria-label={`امتیاز گزینه ${i + 1}`} />
                      <input value={opt.value} onChange={(e) => setQuestionDraft({ ...questionDraft, options: questionDraft.options.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)) })} className={`${inputClass} w-20`} placeholder="مقدار" aria-label={`مقدار گزینه ${i + 1}`} />
                      <button type="button" onClick={() => setQuestionDraft({ ...questionDraft, options: questionDraft.options.filter((_, j) => j !== i) })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف گزینه">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setQuestionDraft({ ...questionDraft, options: [...questionDraft.options, { label: "", score: "0", value: "" }] })} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-steel hover:text-ink">
                  <Plus className="h-3.5 w-3.5" />
                  افزودن گزینه
                </button>
              </div>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                <input type="checkbox" checked={questionDraft.is_required} onChange={(e) => setQuestionDraft({ ...questionDraft, is_required: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />
                پاسخ به این سؤال الزامی است
              </label>
            </div>
            {questionError && <div className="mt-3"><ErrorState message={questionError} /></div>}
            <div className="mt-4 flex justify-end gap-2 border-t border-ink/8 pt-4">
              <Button variant="secondary" onClick={() => setQuestionOpen(false)} disabled={savingQuestion}>انصراف</Button>
              <Button onClick={() => void saveQuestion()} loading={savingQuestion}>ذخیره‌ی سؤال</Button>
            </div>
          </div>
        </div>
      )}

      {newVersionOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/30 p-4" onClick={() => !busyAction && setNewVersionOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="نسخه جدید" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">ساخت نسخه‌ی جدید</h2>
            <p className="mb-4 text-[11.5px] leading-6 text-body">
              تغییرات آینده روی این نسخه اعمال می‌شود و تفسیر نتایج نسخه‌های قبلی دست‌نخورده می‌ماند.
            </p>
            <Field label="برچسب نسخه" required hint="مثال: v2">
              <input dir="ltr" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} className={`${inputClass} text-left`} />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNewVersionOpen(false)} disabled={Boolean(busyAction)}>انصراف</Button>
              <Button onClick={() => void createVersion()} loading={busyAction === "create-version"}>ساخت نسخه</Button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && test && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => setPreviewOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="پیش‌نمایش آزمون" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-extrabold text-ink">{test.title_fa}</h2>
                <p className="mt-0.5 text-[11px] text-body">پیش‌نمایش نسخه {activeVersion?.version_label} — فقط برای مدیران</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(false)}>بستن</Button>
            </div>
            {questions.length === 0 ? (
              <p className="rounded-lg bg-[#f8fafc] p-4 text-[12px] leading-6 text-body">سؤالی برای این نسخه ثبت نشده است.</p>
            ) : (
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="rounded-lg border border-ink/8 p-3">
                    <p className="mb-2 text-[12.5px] font-bold leading-6 text-ink">{toFa(idx + 1)}. {q.prompt}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.filter((o) => o.question_id === q.id).map((o) => (
                        <span key={o.id} className="rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-body">{o.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 rounded-lg bg-[#fdf6e8] p-3 text-[11px] leading-5 text-[#8a641f]">
              این پیش‌نمایش داده‌ی واقعی کاربران را نشان نمی‌دهد. پاسخ‌های کاربران در این نسخه ذخیره نمی‌شوند.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog open={Boolean(deleteQuestionId)} title="حذف سؤال" description="سؤال و گزینه‌های آن حذف می‌شوند. این عملیات در نسخه‌ی منتشرشده مجاز نیست." confirmLabel="حذف" dangerous busy={busyAction === "delete-question"} onCancel={() => setDeleteQuestionId(null)} onConfirm={() => void deleteQuestion()} />
      <ConfirmDialog open={confirmPublish} title="انتشار نسخه" description="پس از انتشار، این نسخه تغییرناپذیر می‌شود و آزمون در سایت عمومی نمایش داده خواهد شد. ادامه می‌دهید؟" confirmLabel="انتشار" busy={busyAction === "publish"} onCancel={() => setConfirmPublish(false)} onConfirm={() => void publishVersion()} />
    </>
  );
}
