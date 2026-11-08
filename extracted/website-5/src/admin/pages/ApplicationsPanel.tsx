import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ClipboardList, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { describeError, isMissingBackend } from "../backend";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusBadge, formatDate, inputClass, useToast } from "../ui";
import type { VerificationStatus } from "../../lib/types";

interface AppRow {
  id: string;
  user_id: string;
  full_name: string;
  title: string;
  license_number: string | null;
  degree: string | null;
  specialties: string[];
  years_experience: number | null;
  bio: string | null;
  status: VerificationStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** درخواست‌های همکاری متخصصان — بررسی و تأیید/رد از طریق تابع امن سرور */
export function ApplicationsPanel() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canWrite = can("psychologists", "write");
  const [rows, setRows] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [decision, setDecision] = useState<{ row: AppRow; verdict: "verified" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("psychologist_applications").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data, error: err } = await q;
    if (err) {
      setMissing(isMissingBackend(err));
      setError(describeError(err));
    } else {
      setRows((data ?? []) as AppRow[]);
      setError(null);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!supabase || !decision) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("review_psychologist_application", { p_application_id: decision.row.id, p_decision: decision.verdict, p_note: note.trim() || null });
    setBusy(false);
    if (err) return notify(describeError(err), "error");
    notify(decision.verdict === "verified" ? "درخواست تأیید شد؛ پروفایل عمومی (غیرفعال) ساخته شد. برای نمایش در سایت آن را فعال کنید." : "درخواست رد شد و متخصص می‌تواند اطلاعات را اصلاح و دوباره ارسال کند.");
    setDecision(null);
    setNote("");
    await load();
  };

  if (missing) {
    return (
      <Card className="mb-4 p-4 text-[13px] leading-6 text-[#6f4710]">
        <p className="font-bold">درخواست‌های همکاری متخصصان پس از اجرای migration شماره ۷ (<code dir="ltr">20260105000000_accounts_navigation_test_flow.sql</code>) فعال می‌شود.</p>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-extrabold text-ink">
          <ClipboardList className="h-4 w-4 text-steel" />
          درخواست‌های همکاری متخصصان
        </h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as "pending" | "all")} className={`${inputClass} min-h-9 w-auto`} aria-label="فیلتر درخواست‌ها">
            <option value="pending">در انتظار بررسی</option>
            <option value="all">همه</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState title={filter === "pending" ? "درخواستی در انتظار بررسی نیست" : "درخواستی ثبت نشده است"} />
      ) : (
        <ul className="divide-y divide-adm-line">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[14px] font-bold text-ink">{r.full_name} <span className="font-semibold text-body">· {r.title}</span></p>
                  <p className="mt-0.5 text-[12.5px] text-body">
                    {r.degree ? `${r.degree} · ` : ""}{r.license_number ? `پروانه: ${r.license_number} · ` : ""}{r.years_experience !== null ? `${r.years_experience.toLocaleString("fa-IR")} سال تجربه · ` : ""}ثبت: {formatDate(r.created_at)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
                <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="min-h-9 rounded-lg px-2 text-[12.5px] font-bold text-steel hover:bg-steel/10">{expanded === r.id ? "بستن" : "جزئیات"}</button>
                {canWrite && r.status === "pending" && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => { setDecision({ row: r, verdict: "verified" }); setNote(""); }}><BadgeCheck className="h-3.5 w-3.5" />تأیید</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setDecision({ row: r, verdict: "rejected" }); setNote(""); }}><XCircle className="h-3.5 w-3.5" />رد</Button>
                  </div>
                )}
              </div>
              {expanded === r.id && (
                <div className="mt-3 rounded-xl bg-[#f8f9fb] p-3 text-[13px] leading-6 text-body">
                  {r.specialties?.length > 0 && <p>حوزه‌ها: <span className="text-ink">{r.specialties.join("، ")}</span></p>}
                  {r.bio && <p className="mt-1 whitespace-pre-line">معرفی: <span className="text-ink">{r.bio}</span></p>}
                  {r.review_note && <p className="mt-1">یادداشت بررسی: <span className="text-ink">{r.review_note}</span></p>}
                  {r.reviewed_at && <p className="mt-1">بررسی: {formatDate(r.reviewed_at, true)}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decision && (
        <ConfirmDialog
          open
          title={decision.verdict === "verified" ? "تأیید درخواست همکاری" : "رد درخواست همکاری"}
          description={decision.verdict === "verified" ? `با تأیید «${decision.row.full_name}»، پروفایل عمومی غیرفعال ساخته و حساب او به نوع متخصص تبدیل می‌شود. نمایش در سایت را بعداً از فهرست متخصصان فعال کنید.` : `درخواست «${decision.row.full_name}» رد می‌شود؛ او می‌تواند اطلاعات را اصلاح و دوباره ارسال کند.`}
          confirmLabel={decision.verdict === "verified" ? "تأیید" : "رد درخواست"}
          dangerous={decision.verdict === "rejected"}
          busy={busy}
          onCancel={() => setDecision(null)}
          onConfirm={() => void submit()}
        />
      )}
      {decision && (
        <div className="fixed bottom-6 left-1/2 z-[85] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-adm-line bg-white p-3 shadow-xl">
          <label className="block text-[12.5px] font-bold text-ink">یادداشت برای متخصص (اختیاری)</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1 leading-6`} placeholder="مثلاً: لطفاً تصویر پروانه را از طریق پشتیبانی ارسال کنید." />
        </div>
      )}
    </Card>
  );
}
