import { useCallback, useRef, useState } from "react";
import { Copy, ImagePlus, Loader2, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useList } from "../hooks";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  PageHeader,
  Pagination,
  formatBytes,
  formatDate,
  inputClass,
  toFa,
  useToast,
  type Column,
} from "../ui";
import type { MediaRow } from "../../lib/types";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;
const BUCKET = "site-media";

const USAGE_TABLES: Array<{ table: string; column: string; label: string }> = [
  { table: "pages", column: "social_image_url", label: "صفحه" },
  { table: "articles", column: "cover_url", label: "مقاله" },
  { table: "magazines", column: "cover_url", label: "مجله" },
  { table: "books", column: "cover_url", label: "کتاب" },
  { table: "tests", column: "cover_url", label: "آزمون" },
];

function kindOf(mime: string): MediaRow["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "document";
  return "other";
}

export function MediaPage() {
  const { can, profile } = useAuth();
  const { notify } = useToast();
  const canRead = can("media", "read");
  const canWrite = can("media", "write");
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useList<MediaRow>({
    table: "media",
    select: "*",
    searchColumn: "title",
    orderBy: "created_at",
    pageSize: 12,
    enabled: canRead,
  });

  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<MediaRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [usageBlock, setUsageBlock] = useState<string[]>([]);

  const pickFile = (f: File | null, onError?: (msg: string) => void) => {
    if (!f) return;
    const fail = (msg: string) => (onError ? onError(msg) : setUploadError(msg));
    if (!ALLOWED.includes(f.type)) {
      fail("فقط تصویر (JPEG/PNG/WebP/AVIF) یا PDF مجاز است. فایل‌های اجرایی و SVG پذیرفته نمی‌شوند.");
      return;
    }
    if (f.size > MAX_SIZE) {
      fail("حجم فایل باید کمتر از ۵ مگابایت باشد.");
      return;
    }
    if (onError) onError("");
    else setUploadError(null);
    return f;
  };

  const upload = async () => {
    if (!supabase || !file) {
      setUploadError("انتخاب فایل الزامی است.");
      return;
    }
    if (!title.trim()) {
      setUploadError("عنوان رسانه را وارد کنید.");
      return;
    }
    if (file.type.startsWith("image/") && !altText.trim()) {
      setUploadError("برای تصویر، متن جایگزین (alt) الزامی است.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? (file.type === "application/pdf" ? "pdf" : "bin");
      const path = `uploads/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      let width: number | null = null;
      let height: number | null = null;
      if (file.type.startsWith("image/")) {
        try {
          const bitmap = await createImageBitmap(file);
          width = bitmap.width;
          height = bitmap.height;
          bitmap.close();
        } catch {
          /* ابعاد اختیاری است */
        }
      }

      const { error: rowErr } = await supabase.from("media").insert({
        bucket: BUCKET,
        storage_path: path,
        public_url: pub.publicUrl,
        title: title.trim(),
        alt_text: altText.trim() || null,
        mime_type: file.type,
        kind: kindOf(file.type),
        size_bytes: file.size,
        width,
        height,
        is_public: true,
        uploaded_by: profile?.id ?? null,
      });
      if (rowErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw rowErr;
      }
      notify("فایل در bucket عمومی آپلود و در کتابخانه ثبت شد.");
      setTitle("");
      setAltText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      list.refresh();
    } catch (e) {
      setUploadError(friendlyError(e));
    } finally {
      setUploading(false);
    }
  };

  const saveMeta = async () => {
    if (!supabase || !editTarget) return;
    setSavingMeta(true);
    try {
      let next = { title: editTitle.trim(), alt_text: editAlt.trim() || null };
      if (replacement) {
        if (!ALLOWED.includes(replacement.type) || replacement.size > MAX_SIZE) {
          throw new Error("فایل جایگزین باید مجاز و کمتر از ۵ مگابایت باشد.");
        }
        const { error: upErr } = await supabase.storage.from(editTarget.bucket).upload(editTarget.storage_path, replacement, {
          upsert: true,
          contentType: replacement.type,
        });
        if (upErr) throw upErr;
        next = {
          ...next,
          mime_type: replacement.type,
          kind: kindOf(replacement.type),
          size_bytes: replacement.size,
          ...(editTarget.bucket === BUCKET
            ? { public_url: supabase.storage.from(BUCKET).getPublicUrl(editTarget.storage_path).data.publicUrl }
            : {}),
        } as typeof next;
      }
      const { error } = await supabase.from("media").update({
        ...next,
        ...(replacement
          ? { mime_type: replacement.type, kind: kindOf(replacement.type), size_bytes: replacement.size }
          : {}),
      }).eq("id", editTarget.id);
      if (error) throw error;
      notify(replacement ? "فایل جایگزین شد و ارجاع‌های موجود حفظ شدند." : "اطلاعات رسانه ذخیره شد.");
      setEditTarget(null);
      setReplacement(null);
      list.refresh();
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setSavingMeta(false);
    }
  };

  const findUsage = useCallback(async (media: MediaRow): Promise<string[]> => {
    if (!supabase || !media.public_url) return [];
    const found: string[] = [];
    await Promise.all(
      USAGE_TABLES.map(async (u) => {
        const { count } = await supabase!
          .from(u.table)
          .select("id", { count: "exact", head: true })
          .eq(u.column, media.public_url!);
        if ((count ?? 0) > 0) found.push(`${u.label} (${toFa(count ?? 0)})`);
      })
    );
    return found;
  }, []);

  const requestDelete = async (media: MediaRow) => {
    setUsageBlock([]);
    setDeleteTarget(media);
    const usage = await findUsage(media);
    setUsageBlock(usage);
  };

  const confirmDelete = async () => {
    if (!supabase || !deleteTarget) return;
    if (usageBlock.length > 0) return;
    setDeleteBusy(true);
    try {
      const { error: storageError } = await supabase.storage.from(deleteTarget.bucket).remove([deleteTarget.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("media").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      notify("فایل و رکورد رسانه حذف شد.");
      setDeleteTarget(null);
      list.refresh();
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: Column<MediaRow>[] = [
    {
      key: "preview",
      header: "پیش‌نمایش",
      render: (m) => (
        <div className="h-12 w-16 overflow-hidden rounded-md border border-ink/8 bg-mist">
          {m.kind === "image" && m.public_url ? (
            <img src={m.public_url} alt={m.alt_text ?? m.title ?? ""} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-[9px] font-bold text-body">PDF</div>
          )}
        </div>
      ),
    },
    {
      key: "title",
      header: "عنوان / مسیر",
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-ink">{m.title || "بدون عنوان"}</p>
          <p dir="ltr" className="truncate text-left text-[10px] text-body">{m.storage_path}</p>
        </div>
      ),
    },
    { key: "alt", header: "متن جایگزین", render: (m) => <span className="text-[11.5px] text-body">{m.alt_text || <span className="text-[#8a641f]">ثبت نشده</span>}</span> },
    { key: "meta", header: "مشخصات", render: (m) => <span className="whitespace-nowrap text-[11px] text-body">{formatBytes(m.size_bytes)}{m.width ? ` · ${m.width}×${m.height}` : ""}</span> },
    { key: "date", header: "آپلود", render: (m) => <span className="whitespace-nowrap text-[11px] text-body">{formatDate(m.created_at)}</span> },
    { key: "bucket", header: "دسترسی", render: (m) => <span className="text-[11px] font-semibold">{m.bucket === "site-media" ? "عمومی" : "خصوصی"}</span> },
  ];

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="کتابخانه‌ی رسانه"
        description="فایل‌های عمومی در bucket «site-media» و اسناد خصوصی در bucket «private-documents» نگهداری می‌شوند. آپلود PDF و تصویر مجاز است؛ فایل اجرایی و SVG پذیرفته نمی‌شود."
        breadcrumb={["پنل مدیریت", "رسانه‌ها"]}
      />

      {canWrite && (
        <Card className="mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-ink">
            <ImagePlus className="h-4 w-4 text-steel" />
            آپلود رسانه‌ی عمومی
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="عنوان" required>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="مثلاً کاور مقاله‌ی ذهن‌آگاهی" />
            </Field>
            <Field label="متن جایگزین (alt)" hint="برای تصاویر الزامی است.">
              <input value={altText} onChange={(e) => setAltText(e.target.value)} className={inputClass} />
            </Field>
            <Field label="فایل" hint="حداکثر ۵ مگابایت — JPEG/PNG/WebP/AVIF/PDF">
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED.join(",")}
                onChange={(e) => setFile(pickFile(e.target.files?.[0] ?? null) ?? null)}
                className="block w-full text-[12px] file:me-2 file:min-h-9 file:rounded-md file:border-0 file:bg-mist file:px-3 file:text-[12px] file:font-bold file:text-ink"
                aria-label="انتخاب فایل"
              />
            </Field>
          </div>
          {uploadError && <p role="alert" className="mt-2 rounded-md bg-[#fbeceb] px-3 py-2 text-[11.5px] font-semibold text-[#8f322d]">{uploadError}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => void upload()} loading={uploading} disabled={!file}>
              <Upload className="h-4 w-4" />
              آپلود
            </Button>
            <span className="text-[11px] text-body">فایل پس از آپلود با URL عمومی در Supabase Storage قابل استفاده است.</span>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/8 p-3">
          <input
            type="search"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="جست‌وجوی عنوان…"
            className={`${inputClass} max-w-xs`}
            aria-label="جست‌وجوی رسانه"
          />
          <select
            value={list.filters.kind ?? ""}
            onChange={(e) => list.setFilter("kind", e.target.value)}
            className={`${inputClass} max-w-[10rem]`}
            aria-label="فیلتر نوع فایل"
          >
            <option value="">نوع: همه</option>
            <option value="image">تصویر</option>
            <option value="document">سند</option>
            <option value="other">سایر</option>
          </select>
          <Button variant="ghost" size="sm" onClick={list.refresh} className="ms-auto">
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
          emptyTitle="رسانه‌ای آپلود نشده است"
          emptyDescription="اولین تصویر یا سند را آپلود کنید تا بتوانید در محتوا از آن استفاده کنید."
          rowActions={(m) => (
            <div className="flex flex-wrap items-center gap-1">
              {m.public_url && (
                <>
                  <a href={m.public_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center rounded-sm px-2 text-[11px] font-bold text-steel hover:bg-steel/10">
                    مشاهده
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(m.public_url!);
                        notify("آدرس عمومی کپی شد.");
                      } catch {
                        notify("کپی آدرس ممکن نشد.", "error");
                      }
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-sm text-body hover:bg-mist"
                    aria-label="کپی آدرس"
                    title="کپی آدرس عمومی"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {canWrite && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTarget(m);
                      setEditTitle(m.title ?? "");
                      setEditAlt(m.alt_text ?? "");
                      setReplacement(null);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-sm text-steel hover:bg-steel/10"
                    aria-label="ویرایش رسانه"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void requestDelete(m)} className="flex h-9 w-9 items-center justify-center rounded-sm text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف رسانه">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        />
        {!list.loading && !list.error && list.total > 0 && (
          <Pagination page={list.page} pageSize={12} total={list.total} onPage={list.setPage} />
        )}
      </Card>

      {editTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/30 p-4" onClick={() => !savingMeta && setEditTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label="ویرایش رسانه" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-[15px] font-extrabold text-ink">ویرایش رسانه</h2>
            {editTarget.public_url && editTarget.kind === "image" && (
              <img src={editTarget.public_url} alt={editTarget.alt_text ?? ""} className="mb-3 h-36 w-full rounded-lg object-cover" />
            )}
            <div className="space-y-3">
              <Field label="عنوان">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} />
              </Field>
              <Field label="متن جایگزین">
                <input value={editAlt} onChange={(e) => setEditAlt(e.target.value)} className={inputClass} />
              </Field>
              <Field label="جایگزینی فایل" hint="فایل جدید در همان مسیر قرار می‌گیرد تا ارجاع‌های موجود حفظ شوند.">
                <input
                  type="file"
                  accept={ALLOWED.join(",")}
                  onChange={(e) => {
                    const f = pickFile(e.target.files?.[0] ?? null, (m) => notify(m || "", "error"));
                    setReplacement(f ?? null);
                  }}
                  className="block w-full text-[12px] file:me-2 file:min-h-9 file:rounded-md file:border-0 file:bg-mist file:px-3 file:text-[12px] file:font-bold file:text-ink"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditTarget(null)} disabled={savingMeta}>انصراف</Button>
              <Button onClick={() => void saveMeta()} loading={savingMeta}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={usageBlock.length > 0 ? "این فایل در محتوا استفاده شده است" : "حذف رسانه"}
        description={
          usageBlock.length > 0
            ? `حذف انجام نشد زیرا این تصویر در ${usageBlock.join("، ")} استفاده شده است. ابتدا آن محتوا را به تصویر دیگری تغییر دهید.`
            : "فایل از Storage و کتابخانه حذف می‌شود. این عملیات قابل بازگشت نیست و در audit log ثبت خواهد شد."
        }
        confirmLabel={usageBlock.length > 0 ? "متوجه شدم" : "حذف"}
        dangerous={usageBlock.length === 0}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => (usageBlock.length > 0 ? setDeleteTarget(null) : void confirmDelete())}
      />

      {uploading && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-body shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          آپلود به Storage…
        </div>
      )}
    </>
  );
}
