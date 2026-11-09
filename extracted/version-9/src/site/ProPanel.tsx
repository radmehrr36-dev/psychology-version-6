import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Clock3, Eye, EyeOff, Loader2, Save, Stethoscope, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { isMissingBackend } from "../admin/backend";
import { flowError } from "./testFlow";
import { cn } from "../utils/cn";
import type { PsychologistRow, VerificationStatus } from "../lib/types";

const input =
  "w-full min-h-12 rounded-xl border border-ink/12 bg-white px-4 text-base text-ink placeholder:text-fog focus:border-steel focus:outline-none focus:ring-2 focus:ring-steel/15";
const SPECIALTIES = ["اضطراب و استرس", "افسردگی و خلق", "روابط و خانواده", "کودک و نوجوان", "رشد فردی", "اعتیاد", "تروما", "مشاوره‌ی تحصیلی و شغلی"];

interface Application {
  id: string;
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

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[25.2px] border border-ink/8 bg-white/90 p-6 shadow-soft backdrop-blur", className)}>{children}</div>;
}

const statusMeta: Record<VerificationStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  pending: { label: "در انتظار بررسی", className: "bg-[#fdf1df] text-[#8a5a14]", icon: Clock3 },
  verified: { label: "تأییدشده", className: "bg-[#e6f4ee] text-[#2f7556]", icon: BadgeCheck },
  rejected: { label: "ردشده", className: "bg-[#fbeceb] text-[#a33a34]", icon: XCircle },
  unverified: { label: "تأییدنشده", className: "bg-mist text-body", icon: Clock3 },
};

/** فرم درخواست همکاری متخصص (ایجاد یا ویرایش تا پیش از تأیید) */
export function ProApplyPage() {
  const { session, profile, isPsychologist } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ full_name: profile?.full_name ?? "", title: "", license_number: "", degree: "", specialties: [] as string[], years_experience: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from("psychologist_applications").select("*").eq("user_id", session.user.id).maybeSingle();
    if (error) setMissing(isMissingBackend(error));
    if (data) {
      const a = data as Application;
      setApp(a);
      setForm({ full_name: a.full_name, title: a.title, license_number: a.license_number ?? "", degree: a.degree ?? "", specialties: a.specialties ?? [], years_experience: a.years_experience?.toString() ?? "", bio: a.bio ?? "" });
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !session) return;
    setMsg(null);
    if (form.full_name.trim().length < 2 || form.title.trim().length < 2) return setMsg({ kind: "err", text: "نام و عنوان تخصص الزامی است." });
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      full_name: form.full_name.trim(),
      title: form.title.trim(),
      license_number: form.license_number.trim() || null,
      degree: form.degree.trim() || null,
      specialties: form.specialties,
      years_experience: form.years_experience ? Number(form.years_experience) : null,
      bio: form.bio.trim() || null,
      status: "pending" as const,
      review_note: null,
      reviewed_by: null,
    };
    const { error } = app
      ? await supabase.from("psychologist_applications").update(payload).eq("id", app.id)
      : await supabase.from("psychologist_applications").insert(payload);
    setSaving(false);
    if (error) return setMsg({ kind: "err", text: flowError(error) });
    setMsg({ kind: "ok", text: app ? "درخواست به‌روزرسانی و دوباره برای بررسی ارسال شد." : "درخواست شما ثبت شد و در صف بررسی قرار گرفت." });
    await load();
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-body"><Loader2 className="h-4 w-4 animate-spin" />بررسی وضعیت درخواست…</div>;

  if (missing) {
    return (
      <Panel>
        <p className="font-bold text-ink">ثبت درخواست همکاری هنوز فعال نیست</p>
        <p className="mt-1 text-[14px] leading-7 text-body">این بخش به ساختار جدید پایگاه داده (migration شماره ۷) نیاز دارد.</p>
      </Panel>
    );
  }

  const locked = app?.status === "verified";
  const meta = app ? statusMeta[app.status] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <p className="section-label mb-2">پنل متخصص</p>
        <h1 className="section-title">{app ? "درخواست همکاری شما" : "درخواست همکاری متخصص"}</h1>
        <p className="section-lead mt-2">اطلاعات حرفه‌ای شما فقط برای تیم بررسی آریاسازه قابل مشاهده است. پس از تأیید، پروفایل عمومی می‌سازید.</p>
      </header>

      {app && meta && (
        <Panel className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold", meta.className)}><meta.icon className="h-4 w-4" />{meta.label}</span>
          <span className="text-[14px] text-body">ثبت: {new Date(app.created_at).toLocaleDateString("fa-IR")}{app.reviewed_at ? ` · بررسی: ${new Date(app.reviewed_at).toLocaleDateString("fa-IR")}` : ""}</span>
          {app.review_note && <p className="w-full rounded-xl bg-cream px-4 py-2.5 text-[14px] leading-7 text-body">یادداشت بررسی: {app.review_note}</p>}
          {isPsychologist && locked && <Link to="/pro" className="ms-auto inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-[14px] font-bold text-white">رفتن به پنل متخصص</Link>}
        </Panel>
      )}

      {!locked && (
        <Panel>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">نام و نام خانوادگی</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={input} required /></label>
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">عنوان تخصص</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} placeholder="مثلاً روان‌شناس بالینی" required /></label>
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">شماره‌ی پروانه / نظام</span><input dir="ltr" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} className={cn(input, "text-left")} /></label>
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">مدرک تحصیلی</span><input value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} className={input} placeholder="کارشناسی ارشد روان‌شناسی بالینی" /></label>
            <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">سال‌های تجربه</span><input type="number" min={0} max={70} value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} className={input} /></label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-[14px] font-bold text-ink">حوزه‌های تخصصی</legend>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => {
                  const on = form.specialties.includes(s);
                  return (
                    <button key={s} type="button" aria-pressed={on} onClick={() => setForm({ ...form, specialties: on ? form.specialties.filter((x) => x !== s) : [...form.specialties, s] })} className={cn("min-h-10 rounded-full border px-4 text-[14px] font-bold transition-colors", on ? "border-steel bg-steel/10 text-steel" : "border-ink/12 bg-white text-body hover:text-ink")}>{s}</button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-[14px] font-bold text-ink">معرفی کوتاه (برای پروفایل عمومی)</span><textarea rows={4} maxLength={2000} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={cn(input, "py-3 leading-7")} /></label>
            {msg && <p role={msg.kind === "ok" ? "status" : "alert"} className={cn("sm:col-span-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold leading-6", msg.kind === "ok" ? "bg-[#e9f6f2] text-[#256b5e]" : "bg-[#fbeceb] text-[#8f322d]")}>{msg.text}</p>}
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 border-t border-ink/8 pt-4">
              <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-coral px-6 text-base font-bold text-ink shadow-soft disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {app ? "به‌روزرسانی و ارسال مجدد" : "ارسال درخواست"}
              </button>
              <p className="text-[13px] leading-6 text-body">مدارک تکمیلی پس از بررسی اولیه از شما درخواست می‌شود.</p>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}

/** پنل متخصص تأییدشده: ویرایش پروفایل عمومی خود */
export function ProPanelPage() {
  const { session, profile } = useAuth();
  const [row, setRow] = useState<PsychologistRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ display_name: "", title: "", bio: "", avatar_url: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from("psychologists").select("*").eq("user_id", session.user.id).maybeSingle();
    if (data) {
      const r = data as PsychologistRow;
      setRow(r);
      setForm({ display_name: r.display_name, title: r.title ?? "", bio: r.bio ?? "", avatar_url: r.avatar_url ?? "" });
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!supabase || !row) return;
    if (form.display_name.trim().length < 2) return setMsg({ kind: "err", text: "نام نمایشی الزامی است." });
    setSaving(true);
    const { error } = await supabase.from("psychologists").update({ display_name: form.display_name.trim(), title: form.title.trim() || null, bio: form.bio.trim() || null, avatar_url: form.avatar_url.trim() || null }).eq("id", row.id);
    setSaving(false);
    if (error) return setMsg({ kind: "err", text: flowError(error) });
    setMsg({ kind: "ok", text: "پروفایل عمومی به‌روزرسانی شد." });
    await load();
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-body"><Loader2 className="h-4 w-4 animate-spin" />دریافت پنل…</div>;

  if (!row) {
    return (
      <Panel>
        <Stethoscope className="mb-3 h-6 w-6 text-steel" />
        <p className="text-base font-bold text-ink">پروفایل حرفه‌ای شما هنوز ساخته نشده است</p>
        <p className="mt-1 text-[14px] leading-7 text-body">پس از تأیید درخواست همکاری توسط تیم آریاسازه، پروفایل عمومی شما ایجاد می‌شود و می‌توانید آن را از همین‌جا مدیریت کنید.</p>
        <Link to="/pro/apply" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[14px] font-bold text-white">وضعیت درخواست همکاری</Link>
      </Panel>
    );
  }

  const meta = statusMeta[row.verification_status];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <p className="section-label mb-2">پنل متخصص</p>
        <h1 className="section-title">سلام{profile?.full_name ? `، ${profile.full_name}` : ""}</h1>
      </header>

      <Panel className="flex flex-wrap items-center gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold", meta.className)}><meta.icon className="h-4 w-4" />{meta.label}</span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold", row.is_active ? "bg-[#e6f4ee] text-[#2f7556]" : "bg-mist text-body")}>
          {row.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {row.is_active ? "در سایت نمایش داده می‌شود" : "هنوز در سایت نمایش داده نمی‌شود"}
        </span>
        {!row.is_active && <p className="w-full text-[13px] leading-6 text-body">فعال‌سازی نمایش عمومی فقط توسط مدیر انجام می‌شود.</p>}
      </Panel>

      <Panel>
        <h2 className="mb-4 text-lg font-semibold text-ink">پروفایل عمومی</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">نام نمایشی</span><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={input} /></label>
          <label className="block"><span className="mb-1.5 block text-[14px] font-bold text-ink">عنوان تخصص</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-[14px] font-bold text-ink">آدرس تصویر پروفایل</span><input dir="ltr" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className={cn(input, "text-left")} placeholder="https://…" /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-[14px] font-bold text-ink">معرفی</span><textarea rows={5} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={cn(input, "py-3 leading-7")} /></label>
        </div>
        {row.credentials_summary && <p className="mt-3 text-[13px] text-body">اطلاعات حرفه‌ای تأییدشده: <span className="font-bold text-ink">{row.credentials_summary}</span> (فقط توسط مدیر قابل تغییر است)</p>}
        {msg && <p role={msg.kind === "ok" ? "status" : "alert"} className={cn("mt-4 rounded-xl px-4 py-2.5 text-[14px] font-semibold", msg.kind === "ok" ? "bg-[#e9f6f2] text-[#256b5e]" : "bg-[#fbeceb] text-[#8f322d]")}>{msg.text}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-bold text-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            ذخیره
          </button>
          <Link to="/psychologists" className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 text-[15px] font-bold text-ink">فهرست عمومی متخصصان</Link>
        </div>
      </Panel>

      <Panel className="bg-cream">
        <p className="text-[14px] leading-7 text-body">در این نسخه، پنل متخصص شامل مدیریت پروفایل عمومی و وضعیت تأیید است. نوبت‌دهی، ارتباط با مراجع و ابزارهای بالینی هنوز پیاده‌سازی نشده‌اند و اینجا وعده داده نمی‌شوند.</p>
      </Panel>
    </div>
  );
}
