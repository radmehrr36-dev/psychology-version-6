import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { describeError, isMissingBackend } from "../backend";
import { defaultFooter, isSafeHref, sanitizeFooter, type FooterSettings, type NavItem, type NavLocation, type SocialIcon } from "../../lib/navigation";
import { AccessDenied, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, PageHeader, inputClass, useToast } from "../ui";
import { cn } from "../../utils/cn";

const locations: Array<{ id: NavLocation; label: string; hint: string }> = [
  { id: "header", label: "منوی هدر", hint: "لینک‌های بالای سایت؛ لنگرهای صفحه‌ی اصلی مثل /#tests هم مجازند." },
  { id: "footer_primary", label: "فوتر — بخش‌های سایت", hint: "ستون اول فوتر." },
  { id: "footer_content", label: "فوتر — محتوا", hint: "ستون دوم فوتر." },
  { id: "social", label: "شبکه‌های اجتماعی", hint: "با آیکون؛ در فوتر نمایش داده می‌شوند." },
];

const iconOptions: Array<{ value: SocialIcon; label: string }> = [
  { value: "instagram", label: "اینستاگرام" },
  { value: "telegram", label: "تلگرام" },
  { value: "linkedin", label: "لینکدین" },
  { value: "x", label: "ایکس (توییتر)" },
  { value: "youtube", label: "یوتیوب" },
  { value: "whatsapp", label: "واتس‌اپ" },
  { value: "mail", label: "ایمیل" },
  { value: "globe", label: "وب‌سایت" },
];

interface Draft {
  id?: string;
  location: NavLocation;
  label: string;
  href: string;
  icon: SocialIcon | "";
  open_in_new_tab: boolean;
  is_active: boolean;
}

const emptyDraft = (location: NavLocation): Draft => ({ location, label: "", href: location === "social" ? "https://" : "/", icon: location === "social" ? "instagram" : "", open_in_new_tab: location === "social", is_active: true });

export function NavigationPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canRead = can("content", "read");
  const canWrite = can("content", "write");
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<NavLocation | "footer">("header");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NavItem | null>(null);
  const [footer, setFooter] = useState<FooterSettings>(defaultFooter);
  const [footerSaving, setFooterSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [nav, settings] = await Promise.all([
      supabase.from("site_navigation").select("*").order("location").order("sort_order"),
      supabase.from("site_settings").select("value").eq("key", "footer.general").maybeSingle(),
    ]);
    if (nav.error) {
      setMissing(isMissingBackend(nav.error));
      setError(describeError(nav.error));
    } else {
      setItems((nav.data ?? []) as NavItem[]);
      setError(null);
    }
    if (!settings.error && settings.data?.value) setFooter(sanitizeFooter(settings.data.value));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  if (!canRead) return <AccessDenied />;

  const current = tab === "footer" ? [] : items.filter((i) => i.location === tab).sort((a, b) => a.sort_order - b.sort_order);

  const save = async () => {
    if (!supabase || !draft) return;
    setFormError(null);
    if (draft.label.trim().length < 1) return setFormError("عنوان الزامی است.");
    if (!isSafeHref(draft.href)) return setFormError("مقصد باید با / یا # یا https:// یا mailto: شروع شود.");
    setSaving(true);
    const payload = {
      location: draft.location,
      label: draft.label.trim(),
      href: draft.href.trim(),
      icon: draft.location === "social" ? draft.icon || "globe" : null,
      open_in_new_tab: draft.open_in_new_tab,
      is_active: draft.is_active,
      sort_order: draft.id ? items.find((i) => i.id === draft.id)?.sort_order ?? 0 : (items.filter((i) => i.location === draft.location).reduce((m, i) => Math.max(m, i.sort_order), 0) + 1),
    };
    const { error: err } = draft.id ? await supabase.from("site_navigation").update(payload).eq("id", draft.id) : await supabase.from("site_navigation").insert(payload);
    setSaving(false);
    if (err) return setFormError(describeError(err));
    notify(draft.id ? "آیتم منو ذخیره شد." : "آیتم جدید به منو اضافه شد.");
    setDraft(null);
    await load();
  };

  const toggle = async (item: NavItem) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("site_navigation").update({ is_active: !item.is_active }).eq("id", item.id);
    if (err) return notify(describeError(err), "error");
    notify(item.is_active ? "آیتم از سایت پنهان شد." : "آیتم در سایت نمایش داده می‌شود.");
    await load();
  };

  const move = async (item: NavItem, dir: -1 | 1) => {
    if (!supabase) return;
    const list = items.filter((i) => i.location === item.location).sort((a, b) => a.sort_order - b.sort_order);
    const idx = list.findIndex((i) => i.id === item.id);
    const other = list[idx + dir];
    if (!other) return;
    const [a, b] = await Promise.all([
      supabase.from("site_navigation").update({ sort_order: other.sort_order }).eq("id", item.id),
      supabase.from("site_navigation").update({ sort_order: item.sort_order }).eq("id", other.id),
    ]);
    if (a.error || b.error) return notify(describeError(a.error ?? b.error), "error");
    await load();
  };

  const remove = async () => {
    if (!supabase || !deleteTarget) return;
    const { error: err } = await supabase.from("site_navigation").delete().eq("id", deleteTarget.id);
    if (err) return notify(describeError(err), "error");
    notify("آیتم حذف شد.");
    setDeleteTarget(null);
    await load();
  };

  const saveFooter = async () => {
    if (!supabase) return;
    setFooterSaving(true);
    const { error: err } = await supabase.from("site_settings").upsert({ key: "footer.general", value: footer, is_public: true }, { onConflict: "key" });
    setFooterSaving(false);
    if (err) return notify(describeError(err), "error");
    notify("تنظیمات فوتر ذخیره و در سایت اعمال شد.");
  };

  return (
    <>
      <PageHeader
        title="هدر و فوتر"
        description="منوی بالای سایت، ستون‌های فوتر، شبکه‌های اجتماعی و متن‌های فوتر. تغییرات بلافاصله در سایت عمومی اعمال می‌شود؛ آیتم‌های غیرفعال نمایش داده نمی‌شوند."
        breadcrumb={["پنل مدیریت", "هدر و فوتر"]}
      />

      {missing && (
        <div role="alert" className="mb-4 rounded-2xl border border-[#ecd7a8] bg-[#fdf6e8] p-4 text-[13.5px] leading-7 text-[#6f4710]">
          جدول منو هنوز ساخته نشده است. فایل <code dir="ltr" className="rounded-sm bg-white/70 px-1.5">20260105000000_accounts_navigation_test_flow.sql</code> را در SQL Editor اجرا کنید. تا آن زمان سایت از منوی پیش‌فرض استفاده می‌کند.
        </div>
      )}

      <div role="tablist" className="mb-4 flex flex-wrap gap-1 rounded-xl border border-adm-line bg-white p-1">
        {[...locations.map((l) => ({ id: l.id as NavLocation | "footer", label: l.label })), { id: "footer" as const, label: "متن‌های فوتر" }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("min-h-10 rounded-lg px-3 text-[13px] font-bold transition-colors", tab === t.id ? "bg-steel/10 text-steel" : "text-body hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "footer" ? (
        <Card className="p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="متن معرفی فوتر"><textarea rows={3} value={footer.about} onChange={(e) => setFooter({ ...footer, about: e.target.value })} className={`${inputClass} leading-6`} disabled={!canWrite} /></Field>
            </div>
            <Field label="ایمیل تماس"><input dir="ltr" value={footer.email} onChange={(e) => setFooter({ ...footer, email: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} /></Field>
            <Field label="متن کپی‌رایت"><input value={footer.copyright} onChange={(e) => setFooter({ ...footer, copyright: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
            <div className="md:col-span-2">
              <Field label="سلب مسئولیت (خالی = پنهان)"><input value={footer.disclaimer} onChange={(e) => setFooter({ ...footer, disclaimer: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" checked={footer.showSupportButton} onChange={(e) => setFooter({ ...footer, showSupportButton: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" disabled={!canWrite} />نمایش دکمه‌ی «ارسال پیام به پشتیبانی»</label>
            <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" checked={footer.showAdminLink} onChange={(e) => setFooter({ ...footer, showAdminLink: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" disabled={!canWrite} />نمایش لینک «ورود مدیران»</label>
          </div>
          {canWrite && (
            <div className="mt-4 flex items-center gap-2 border-t border-adm-line pt-4">
              <Button onClick={() => void saveFooter()} loading={footerSaving}><Save className="h-4 w-4" />ذخیره و اعمال</Button>
              <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-bold text-steel"><ExternalLink className="h-3.5 w-3.5" />مشاهده‌ی سایت</a>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
            <p className="text-[13px] text-body">{locations.find((l) => l.id === tab)?.hint}</p>
            {canWrite && !missing && (
              <Button size="sm" onClick={() => { setDraft(emptyDraft(tab)); setFormError(null); }}>
                <Plus className="h-3.5 w-3.5" />افزودن آیتم
              </Button>
            )}
          </div>
          {loading ? (
            <LoadingState />
          ) : error && !missing ? (
            <ErrorState message={error} onRetry={load} />
          ) : current.length === 0 ? (
            <EmptyState title="آیتمی در این بخش نیست" description={missing ? "پس از اجرای migration، منوی پیش‌فرض به‌صورت خودکار seed می‌شود." : "با «افزودن آیتم» اولین لینک را بسازید."} />
          ) : (
            <ul className="divide-y divide-adm-line">
              {current.map((item, idx) => (
                <li key={item.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !item.is_active && "opacity-60")}>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-[14px] font-bold text-ink">{item.label}{item.icon ? <span className="ms-2 rounded-full bg-mist px-2 py-0.5 text-[12px] font-semibold text-body">{iconOptions.find((o) => o.value === item.icon)?.label ?? item.icon}</span> : null}</p>
                    <p dir="ltr" className="truncate text-left text-[12.5px] text-body">{item.href}{item.open_in_new_tab ? " ↗" : ""}</p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-bold", item.is_active ? "bg-[#e6f4ee] text-[#2f7556]" : "bg-mist text-body")}>{item.is_active ? "فعال" : "غیرفعال"}</span>
                  {canWrite && (
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => void move(item, -1)} disabled={idx === 0} className="flex h-9 w-9 items-center justify-center rounded-lg text-body hover:bg-mist disabled:opacity-30" aria-label="بالا"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void move(item, 1)} disabled={idx === current.length - 1} className="flex h-9 w-9 items-center justify-center rounded-lg text-body hover:bg-mist disabled:opacity-30" aria-label="پایین"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void toggle(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-body hover:bg-mist" aria-label={item.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"} title={item.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}>{item.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      <button type="button" onClick={() => { setDraft({ id: item.id, location: item.location, label: item.label, href: item.href, icon: item.icon ?? "", open_in_new_tab: item.open_in_new_tab, is_active: item.is_active }); setFormError(null); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-steel hover:bg-steel/10" aria-label="ویرایش"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteTarget(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#a33a34] hover:bg-[#fbeceb]" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {draft && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/30 p-4" onClick={() => !saving && setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="فرم آیتم منو" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[15px] font-extrabold text-ink">{draft.id ? "ویرایش آیتم" : "آیتم جدید"} — {locations.find((l) => l.id === draft.location)?.label}</h2>
            <div className="space-y-3">
              <Field label="عنوان" required><input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={inputClass} /></Field>
              <Field label="مقصد" required hint="مسیر داخلی (/articles)، لنگر (/#tests) یا آدرس کامل (https://…)"><input dir="ltr" value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} className={`${inputClass} text-left`} /></Field>
              {draft.location === "social" && (
                <Field label="آیکون">
                  <select value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value as SocialIcon })} className={inputClass}>
                    {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              )}
              <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" checked={draft.open_in_new_tab} onChange={(e) => setDraft({ ...draft, open_in_new_tab: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />بازشدن در تب جدید</label>
              <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" />فعال (نمایش در سایت)</label>
              {formError && <p role="alert" className="rounded-lg bg-[#fbeceb] px-3 py-2 text-[12.5px] font-semibold text-[#8f322d]">{formError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>انصراف</Button>
              <Button onClick={() => void save()} loading={saving}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={Boolean(deleteTarget)} title="حذف آیتم منو" description={`«${deleteTarget?.label ?? ""}» از منو حذف می‌شود. اگر فقط می‌خواهید موقتاً پنهان شود، از «غیرفعال‌کردن» استفاده کنید.`} confirmLabel="حذف" dangerous onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </>
  );
}
