import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Modal } from "./Modal";
import { friendlyError, supabase, supabaseConfigured } from "../lib/supabase";

const CATEGORIES = [
  { value: "general", label: "عمومی" },
  { value: "technical", label: "مشکل فنی" },
  { value: "account", label: "حساب کاربری" },
  { value: "test", label: "آزمون‌ها" },
  { value: "content", label: "محتوا" },
];

export function SupportForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setSubject("");
    setBody("");
    setCategory("general");
    setError(null);
    setSent(false);
  };

  const close = () => {
    onClose();
    window.setTimeout(reset, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("فرم پشتیبانی هنوز به پایگاه داده متصل نیست.");
      return;
    }
    if (subject.trim().length < 3 || body.trim().length < 5) {
      setError("موضوع و متن پیام را کامل وارد کنید.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("ایمیل معتبر وارد کنید تا بتوانیم پاسخ دهیم.");
      return;
    }
    setBusy(true);
    try {
      const { error: insertError } = await supabase.from("support_messages").insert({
        subject: subject.trim(),
        body: body.trim(),
        requester_name: name.trim() || null,
        requester_email: email.trim(),
        category,
        priority: "normal",
        status: "new",
      });
      if (insertError) throw insertError;
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={sent ? "پیام ثبت شد" : "ارسال پیام به پشتیبانی"}>
      {sent ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#2f8d7c]" />
          <p className="mb-2 text-[14px] font-bold text-ink">پیام شما در صف بررسی ثبت شد.</p>
          <p className="mb-5 text-[14px] leading-6 text-body">
            پاسخ از طریق ایمیل ارسال می‌شود؛ کانال ارسال ایمیل در حال حاضر پیکربندی نشده است، بنابراین زمان پاسخ‌دهی
            ممکن است بیشتر شود. پیام شما در پنل پشتیبانی قابل پیگیری است.
          </p>
          <button type="button" onClick={close} className="min-h-11 rounded-full bg-ink px-6 text-[14px] font-bold text-white">
            بستن
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {!supabaseConfigured && (
            <p className="rounded-xl border border-[#e5c98f] bg-[#fdf6e8] p-3 text-[14px] leading-6 text-[#8a641f]">
              فرم پشتیبانی هنوز به پایگاه داده متصل نیست؛ پس از پیکربندی Supabase، پیام‌ها در پنل پشتیبانی ثبت می‌شوند.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-bold text-ink">نام (اختیاری)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full min-h-10 rounded-xl border border-ink/12 bg-white px-3 text-[14px]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-bold text-ink">ایمیل <span className="text-[#b4433d]">*</span></span>
              <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full min-h-10 rounded-xl border border-ink/12 bg-white px-3 text-left text-[14px]" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-bold text-ink">موضوع <span className="text-[#b4433d]">*</span></span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} className="w-full min-h-10 rounded-xl border border-ink/12 bg-white px-3 text-[14px]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-bold text-ink">دسته</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full min-h-10 rounded-xl border border-ink/12 bg-white px-3 text-[14px]">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-bold text-ink">متن پیام <span className="text-[#b4433d]">*</span></span>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={5000} className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-[14px] leading-6" />
          </label>
          <p className="text-[14px] leading-5 text-body">
            اطلاعات شما فقط برای پاسخ‌دهی در بخش پشتیبانی استفاده می‌شود. رمز عبور یا اطلاعات حساس ارسال نکنید.
          </p>
          {error && <p role="alert" className="rounded-xl bg-[#fbeceb] px-3 py-2 text-[14px] font-semibold text-[#8f322d]">{error}</p>}
          <button type="submit" disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-60">
            {busy ? "در حال ثبت…" : <><Send className="h-4 w-4" />ثبت پیام</>}
          </button>
        </form>
      )}
    </Modal>
  );
}
