import { Check, CircleAlert, Loader2 } from "lucide-react";
import { Modal } from "../components/Modal";
import { sectionOptions, statCardOptions, useAdminPrefs, type PersistStatus, type RangeDays, type SectionId, type StatCardId } from "./prefs";
import { cn } from "../utils/cn";

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-right transition-colors duration-150 hover:bg-mist"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{label}</span>
        {description && <span className="block text-[12.5px] leading-5 text-body">{description}</span>}
      </span>
      <span aria-hidden="true" className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-steel" : "bg-[#cdd2dc]")}>
        <span className={cn("absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", checked && "-translate-x-5")} />
      </span>
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-[#eef0f4] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 rounded-lg px-2 text-[13px] font-bold transition-all duration-150",
            value === o.value ? "bg-white text-steel shadow-sm" : "text-body hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SaveStatus({ status }: { status: PersistStatus }) {
  if (status === "saving")
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-body" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال ذخیره…
      </p>
    );
  if (status === "saved")
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-[#2f7556]" role="status">
        <Check className="h-3.5 w-3.5" /> در حساب شما ذخیره شد
      </p>
    );
  if (status === "missing")
    return (
      <p className="flex items-start gap-1.5 rounded-xl bg-[#fdf6e8] p-3 text-[13px] leading-6 text-[#8a5a14]" role="alert">
        <CircleAlert className="mt-1 h-3.5 w-3.5 shrink-0" />
        ذخیره در حساب نیازمند اجرای migration داشبورد است؛ تا آن زمان تغییرات فقط تا بستن صفحه اعمال می‌شود.
      </p>
    );
  if (status === "error")
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-[#a33a34]" role="alert">
        <CircleAlert className="h-3.5 w-3.5" /> ذخیره‌سازی ناموفق بود؛ دوباره تلاش کنید.
      </p>
    );
  return null;
}

export function PrefsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, update, status } = useAdminPrefs();

  const toggleIn = <T extends string>(list: T[], id: T, visible: boolean): T[] => (visible ? list.filter((x) => x !== id) : [...new Set([...list, id])]);

  return (
    <Modal open={open} onClose={onClose} title="تنظیمات داشبورد من">
      <div className="space-y-5 text-right">
        <p className="text-[13.5px] leading-6 text-body">این تنظیمات در حساب مدیریتی شما ذخیره می‌شود و روی دستگاه‌های دیگر هم اعمال خواهد شد.</p>

        <section aria-labelledby="pref-look">
          <h3 id="pref-look" className="mb-2 text-[14px] font-extrabold text-ink">
            ظاهر
          </h3>
          <div className="space-y-2">
            <Segmented
              label="تراکم رابط کاربری"
              value={prefs.density}
              onChange={(v) => update({ density: v })}
              options={[
                { value: "comfortable", label: "راحت" },
                { value: "compact", label: "فشرده" },
              ]}
            />
            <Toggle checked={prefs.sidebarCollapsed} onChange={(v) => update({ sidebarCollapsed: v })} label="سایدبار جمع‌شده" description="فقط آیکون‌ها در دسکتاپ نمایش داده می‌شود" />
          </div>
        </section>

        <section aria-labelledby="pref-range">
          <h3 id="pref-range" className="mb-2 text-[14px] font-extrabold text-ink">
            بازه‌ی پیش‌فرض آمار
          </h3>
          <Segmented
            label="بازه‌ی پیش‌فرض آمار"
            value={prefs.defaultRange}
            onChange={(v) => update({ defaultRange: v as RangeDays })}
            options={[
              { value: 7, label: "۷ روز" },
              { value: 30, label: "۳۰ روز" },
              { value: 90, label: "۹۰ روز" },
            ]}
          />
        </section>

        <section aria-labelledby="pref-cards">
          <h3 id="pref-cards" className="mb-1 text-[14px] font-extrabold text-ink">
            کارت‌های آماری
          </h3>
          {statCardOptions.map((o) => (
            <Toggle
              key={o.id}
              label={o.label}
              checked={!prefs.hiddenCards.includes(o.id)}
              onChange={(v) => update({ hiddenCards: toggleIn<StatCardId>(prefs.hiddenCards, o.id, v) })}
            />
          ))}
        </section>

        <section aria-labelledby="pref-sections">
          <h3 id="pref-sections" className="mb-1 text-[14px] font-extrabold text-ink">
            بخش‌ها و نمودارها
          </h3>
          {sectionOptions.map((o) => (
            <Toggle
              key={o.id}
              label={o.label}
              checked={!prefs.hiddenSections.includes(o.id)}
              onChange={(v) => update({ hiddenSections: toggleIn<SectionId>(prefs.hiddenSections, o.id, v) })}
            />
          ))}
        </section>

        <section aria-labelledby="pref-notif">
          <h3 id="pref-notif" className="mb-1 text-[14px] font-extrabold text-ink">
            اعلان‌ها
          </h3>
          {(
            [
              ["support", "پیام‌های پشتیبانی جدید"],
              ["psychologists", "روان‌شناسان در انتظار تأیید"],
              ["tests", "آزمون‌های نیازمند بازبینی"],
              ["content", "محتوای در انتظار تأیید"],
            ] as const
          ).map(([key, label]) => (
            <Toggle key={key} label={label} checked={prefs.notifications[key]} onChange={(v) => update({ notifications: { ...prefs.notifications, [key]: v } })} />
          ))}
        </section>

        <div className="flex items-center justify-between gap-3 border-t border-adm-line pt-3">
          <SaveStatus status={status} />
          <button type="button" onClick={onClose} className="ms-auto min-h-11 rounded-xl bg-steel px-5 text-[14px] font-bold text-white transition-colors duration-150 hover:bg-steel-deep">
            بستن
          </button>
        </div>
      </div>
    </Modal>
  );
}
