import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
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
import type { PsychologistRow, VerificationStatus } from "../../lib/types";
import { ApplicationsPanel } from "./ApplicationsPanel";

interface PsychDraft {
  display_name: string;
  title: string;
  bio: string;
  credentials_summary: string;
  avatar_url: string;
  verification_status: VerificationStatus;
  is_active: boolean;
}

interface PrivateDoc {
  id: string;
  storage_path: string;
  kind: string;
  status: VerificationStatus;
  created_at: string;
}

const emptyDraft: PsychDraft = {
  display_name: "",
  title: "",
  bio: "",
  credentials_summary: "",
  avatar_url: "",
  verification_status: "pending",
  is_active: false,
};

const PRIVATE_BUCKET = "private-documents";
const ALLOWED_DOCS = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOC = 10 * 1024 * 1024;

export function PsychologistsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canRead = can("psychologists", "read");
  const canWrite = can("psychologists", "write");
  const canDocs = can("psychologists", "manage_documents");

  const list = useList<PsychologistRow>({
    table: "psychologists",
    select: "*",
    searchColumn: "display_name",
    orderBy: "created_at",
    pageSize: 10,
    enabled: canRead,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PsychologistRow | null>(null);
  const [draft, setDraft] = useState<PsychDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [docsTarget, setDocsTarget] = useState<PsychologistRow | null>(null);
  const [docs, setDocs] = useState<PrivateDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docKind, setDocKind] = useState("license");
  const [uploading, setUploading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<PrivateDoc | null>(null);

  const loadDocs = useCallback(async (psychologistId: string) => {
    if (!supabase || !canDocs) return;
    setDocsLoading(true);
    const { data, error } = await supabase
      .from("psychologist_documents")
      .select("id,storage_path,kind,status,created_at")
      .eq("psychologist_id", psychologistId)
      .order("created_at", { ascending: false });
    setDocsLoading(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    setDocs((data ?? []) as PrivateDoc[]);
  }, [canDocs, notify]);

  useEffect(() => {
    if (docsTarget) void loadDocs(docsTarget.id);
  }, [docsTarget, loadDocs]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (p: PsychologistRow) => {
    setEditing(p);
    setDraft({
      display_name: p.display_name,
      title: p.title ?? "",
      bio: p.bio ?? "",
      credentials_summary: p.credentials_summary ?? "",
      avatar_url: p.avatar_url ?? "",
      verification_status: p.verification_status,
      is_active: p.is_active,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    if (!supabase) return;
    if (!draft.display_name.trim()) {
      setFormError("نام نمایشی الزامی است.");
      return;
    }
    if (draft.is_active && draft.verification_status !== "verified") {
      setFormError("متخصص تأییدنشده نمی‌تواند در سایت عمومی فعال شود. ابتدا وضعیت مدارک را تأیید کنید.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      display_name: draft.display_name.trim(),
      title: draft.title.trim() || null,
      bio: draft.bio.trim() || null,
      credentials_summary: draft.credentials_summary.trim() || null,
      avatar_url: draft.avatar_url.trim() || null,
      verification_status: draft.verification_status,
      is_active: draft.is_active,
    };
    try {
      const query = editing
        ? supabase.from("psychologists").update(payload).eq("id", editing.id)
        : supabase.from("psychologists").insert(payload);
      const { error } = await query;
      if (error) throw error;
      notify(editing ? "پروفایل متخصص به‌روزرسانی شد." : "پروفایل متخصص ایجاد شد.");
      setFormOpen(false);
      list.refresh();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadDoc = async () => {
    if (!supabase || !docsTarget || !docFile) {
      notify("انتخاب فایل الزامی است.", "error");
      return;
    }
    if (!ALLOWED_DOCS.includes(docFile.type) || docFile.size > MAX_DOC) {
      notify("فقط PDF یا تصویر تا ۱۰ مگابایت مجاز است.", "error");
      return;
    }
    setUploading(true);
    try {
      const ext = docFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `psychologists/${docsTarget.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, docFile, { upsert: false, contentType: docFile.type });
      if (upErr) throw upErr;
      const { error: rowErr } = await supabase.from("psychologist_documents").insert({
        psychologist_id: docsTarget.id,
        bucket: PRIVATE_BUCKET,
        storage_path: path,
        kind: docKind,
        status: "pending",
      });
      if (rowErr) {
        await supabase.storage.from(PRIVATE_BUCKET).remove([path]);
        throw rowErr;
      }
      notify("سند در bucket خصوصی آپلود شد. دسترسی فقط با مجوز مدیریت مدارک است.");
      setDocFile(null);
      await loadDocs(docsTarget.id);
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (doc: PrivateDoc) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      notify(friendlyError(error), "error");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const setDocStatus = async (doc: PrivateDoc, status: VerificationStatus) => {
    if (!supabase) return;
    const { error } = await supabase.from("psychologist_documents").update({ status }).eq("id", doc.id);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify("وضعیت سند به‌روزرسانی شد.");
    if (docsTarget) await loadDocs(docsTarget.id);
  };

  const deleteDoc = async () => {
    if (!supabase || !docToDelete) return;
    const { error: stErr } = await supabase.storage.from(PRIVATE_BUCKET).remove([docToDelete.storage_path]);
    if (stErr) {
      notify(friendlyError(stErr), "error");
      return;
    }
    const { error } = await supabase.from("psychologist_documents").delete().eq("id", docToDelete.id);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    notify("سند خصوصی حذف شد.");
    setDocToDelete(null);
    if (docsTarget) await loadDocs(docsTarget.id);
  };

  const columns: Column<PsychologistRow>[] = [
    {
      key: "name",
      header: "متخصص",
      render: (p) => (
        <div className="flex items-center gap-2.5">
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-[11px] font-bold text-steel">{p.display_name.slice(0, 1)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold text-ink">{p.display_name}</p>
            <p className="truncate text-[10.5px] text-body">{p.title ?? "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "verification", header: "وضعیت مدارک", render: (p) => <StatusBadge status={p.verification_status} /> },
    { key: "active", header: "نمایش عمومی", render: (p) => <StatusBadge status={p.is_active ? "active" : "draft"} /> },
    { key: "updated", header: "آخرین تغییر", render: (p) => <span className="text-[11px] text-body">{formatDate(p.updated_at)}</span> },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="متخصصان"
        description="مدیریت پروفایل عمومی و وضعیت تأیید مدارک. تنها متخصصان فعال و تأییدشده در سایت عمومی نمایش داده می‌شوند. این بخش سیستم رزرو یا ویزیت آنلاین ندارد."
        actions={canWrite ? <Button onClick={openCreate}><Plus className="h-4 w-4" />متخصص جدید</Button> : null}
      />

      <ApplicationsPanel />

      <div className="mb-4 rounded-lg border border-steel/15 bg-steel/5 px-3.5 py-2.5 text-[11.5px] leading-6 text-body">
        مدارک هویتی در bucket خصوصی ذخیره می‌شوند و هیچ دسترسی عمومی ندارند. مشاهده‌ی آن‌ها فقط با مجوز
        <code dir="ltr" className="mx-1">psychologists.manage_documents</code> و از طریق لینک امضاشده‌ی کوتاه‌مدت ممکن است.
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input type="search" value={list.search} onChange={(e) => list.setSearch(e.target.value)} placeholder="جست‌وجوی نام متخصص…" className={`${inputClass} max-w-xs`} aria-label="جست‌وجوی متخصص" />
          <span className="ms-auto text-[11.5px] text-body">{toFa(list.total)} متخصص</span>
        </div>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          emptyTitle="متخصصی ثبت نشده است"
          emptyDescription="پروفایل متخصصان را پس از دریافت و بررسی مدارک ایجاد کنید."
          rowActions={(p) => (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => openEdit(p)} className="flex h-9 w-9 items-center justify-center rounded-sm text-steel hover:bg-steel/10" aria-label="ویرایش پروفایل"><Pencil className="h-3.5 w-3.5" /></button>
              <button
                type="button"
                onClick={() => {
                  setDocsTarget(p);
                  setDocs([]);
                  setDocFile(null);
                }}
                disabled={!canDocs}
                className="flex h-9 w-9 items-center justify-center rounded-sm text-body hover:bg-mist disabled:opacity-40"
                aria-label="مدارک خصوصی"
                title={canDocs ? "مدیریت مدارک خصوصی" : "بدون مجوز مدیریت مدارک"}
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={10} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => !saving && setFormOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="فرم متخصص" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{editing ? "ویرایش متخصص" : "متخصص جدید"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام نمایشی" required><input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} className={inputClass} /></Field>
              <Field label="عنوان تخصص"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} placeholder="روان‌شناس بالینی" /></Field>
              <div className="sm:col-span-2"><Field label="توضیحات عمومی" hint="اطلاعات هویتی یا خصوصی را اینجا وارد نکنید."><textarea rows={3} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className={`${inputClass} leading-6`} /></Field></div>
              <div className="sm:col-span-2"><Field label="خلاصه‌ی اطلاعات حرفه‌ای تأییدشده" hint="فقط موارد دارای مدرک را وارد کنید."><input value={draft.credentials_summary} onChange={(e) => setDraft({ ...draft, credentials_summary: e.target.value })} className={inputClass} /></Field></div>
              <Field label="آدرس تصویر پروفایل"><input dir="ltr" value={draft.avatar_url} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })} className={`${inputClass} text-left`} /></Field>
              <Field label="وضعیت بررسی مدارک">
                <select value={draft.verification_status} onChange={(e) => setDraft({ ...draft, verification_status: e.target.value as VerificationStatus })} className={inputClass}>
                  <option value="unverified">تأییدنشده</option>
                  <option value="pending">در انتظار بررسی</option>
                  <option value="verified">تأییدشده</option>
                  <option value="rejected">ردشده</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-ink sm:col-span-2">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />
                نمایش در سایت عمومی (فقط در صورت تأیید مدارک)
              </label>
            </div>
            {formError && <div className="mt-3"><ErrorState message={formError} /></div>}
            <div className="mt-4 flex justify-end gap-2 border-t border-ink/8 pt-4">
              <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}

      {docsTarget && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-8" onClick={() => setDocsTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label="مدارک خصوصی" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-extrabold text-ink">مدارک خصوصی — {docsTarget.display_name}</h2>
                <p className="mt-0.5 text-[11px] text-body">فقط PDF/تصویر تا ۱۰ مگابایت · bucket خصوصی</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setDocsTarget(null)}>بستن</Button>
            </div>

            {canDocs ? (
              <>
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Field label="فایل مدرک">
                      <input type="file" accept={ALLOWED_DOCS.join(",")} onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} className="block w-full text-[12px] file:me-2 file:min-h-9 file:rounded-md file:border-0 file:bg-mist file:px-3 file:text-[12px] file:font-bold file:text-ink" />
                    </Field>
                  </div>
                  <Field label="نوع مدرک">
                    <select value={docKind} onChange={(e) => setDocKind(e.target.value)} className={inputClass}>
                      <option value="license">پروانه</option>
                      <option value="degree">مدرک تحصیلی</option>
                      <option value="identity">هویتی</option>
                      <option value="other">سایر</option>
                    </select>
                  </Field>
                </div>
                <Button size="sm" onClick={() => void uploadDoc()} loading={uploading} disabled={!docFile}>
                  <Upload className="h-3.5 w-3.5" />
                  آپلود سند خصوصی
                </Button>

                <div className="mt-4">
                  {docsLoading ? (
                    <LoadingState label="دریافت مدارک…" />
                  ) : docs.length === 0 ? (
                    <p className="rounded-lg bg-[#f8fafc] p-3 text-[11.5px] text-body">مدرکی ثبت نشده است.</p>
                  ) : (
                    <ul className="space-y-2">
                      {docs.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/8 p-2.5">
                          <div>
                            <p className="text-[11.5px] font-bold text-ink">{d.kind} <StatusBadge status={d.status} /></p>
                            <p className="mt-0.5 text-[10px] text-body">{formatDate(d.created_at, true)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button size="sm" variant="secondary" onClick={() => void openDoc(d)}><Eye className="h-3 w-3" />مشاهده</Button>
                            <Button size="sm" variant="ghost" onClick={() => void setDocStatus(d, "verified")}>تأیید</Button>
                            <Button size="sm" variant="ghost" onClick={() => void setDocStatus(d, "rejected")}>رد</Button>
                            <button type="button" onClick={() => setDocToDelete(d)} className="flex h-8 w-8 items-center justify-center rounded-sm text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف سند"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-[#fdf6e8] p-3 text-[11.5px] leading-6 text-[#8a641f]">
                نقش شما مجوز <code dir="ltr">psychologists.manage_documents</code> را ندارد؛ مشاهده یا آپلود مدارک خصوصی مجاز نیست.
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(docToDelete)}
        title="حذف سند خصوصی"
        description="فایل از Storage خصوصی و رکورد آن حذف می‌شود. این عملیات در audit log ثبت خواهد شد."
        confirmLabel="حذف"
        dangerous
        onCancel={() => setDocToDelete(null)}
        onConfirm={() => void deleteDoc()}
      />
    </>
  );
}
