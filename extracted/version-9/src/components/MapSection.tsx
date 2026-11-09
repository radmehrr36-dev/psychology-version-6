import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Compass, Play, Repeat, Sparkles, Sun, Target, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { WaveEdge } from "./WaveEdge";

type Source = "test" | "user" | "ai";

const sourceMeta: Record<Source, { label: string; icon: LucideIcon; className: string }> = {
  test: { label: "نتیجه‌ی آزمون", icon: Compass, className: "bg-steel/10 text-steel" },
  user: { label: "گزارش شما", icon: UserRound, className: "bg-mist text-ink" },
  ai: { label: "پیشنهاد هوشمند", icon: Sparkles, className: "bg-lav/12 text-[#6a5fc0]" },
};

interface Domain {
  icon: LucideIcon;
  title: string;
  status: string;
  source: Source;
  pos: string;
  floatDelay: string;
}

const domains: Domain[] = [
  { icon: Compass, title: "الگوهای رفتاری", status: "آزمون شخصیت انجام شد", source: "test", pos: "right-0 top-0", floatDelay: "0s" },
  { icon: Sun, title: "خلق و خو", status: "۵ ثبت روزانه در این هفته", source: "user", pos: "left-0 top-[8%]", floatDelay: "1.2s" },
  { icon: Repeat, title: "عادت‌های روزانه", status: "تمرین تنفس پیشنهاد شد", source: "ai", pos: "right-0 bottom-0", floatDelay: "0.6s" },
  { icon: Target, title: "انگیزه و اهداف", status: "در انتظار انجام آزمون", source: "test", pos: "left-0 bottom-[8%]", floatDelay: "1.8s" },
];

function DomainCard({ domain }: { domain: Domain }) {
  const meta = sourceMeta[domain.source];
  return (
    <div className="panel rounded-[21.6px] p-4 shadow-glass">
      <div className="mb-2.5 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 text-steel ring-1 ring-ink/5">
          <domain.icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <p className="text-[14px] font-bold text-ink">{domain.title}</p>
      </div>
      <p className="mb-2.5 text-[14px] font-medium leading-5 text-body">{domain.status}</p>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] font-bold ${meta.className}`}>
        <meta.icon className="h-3 w-3" />
        {meta.label}
      </span>
    </div>
  );
}

function CoreNode() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(96_140_200/0.24),transparent_65%)] blur-xl" />
        <div className="absolute inset-[6%] rounded-full border border-steel/15">
          <span className="absolute right-1/2 top-0 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-steel/50" />
        </div>
        <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#e3ebf6_45%,#bfcfe6_78%,#a7bcd9)] shadow-[inset_0_-12px_24px_rgb(61_95_146/0.18),0_16px_40px_-14px_rgb(61_95_146/0.35)]" />
        <Compass className="relative h-7 w-7 text-steel/80" strokeWidth={1.6} />
      </div>
      <span className="mt-3 rounded-full bg-white px-4 py-1.5 text-[14px] font-extrabold text-ink shadow-sm ring-1 ring-ink/5">
        خودشناسی
      </span>
    </div>
  );
}

const SAVE_KEY = "ariasazeh:saved:map-card";

export function MapSection() {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setSaved(localStorage.getItem(SAVE_KEY) === "1");
    } catch {
      /* دسترسی به storage ممکن نیست */
    }
  }, []);

  const toggleSave = () => {
    setSaved((v) => {
      const next = !v;
      try {
        localStorage.setItem(SAVE_KEY, next ? "1" : "0");
      } catch {
        /* نادیده بگیر */
      }
      return next;
    });
  };

  return (
    <section id="map" className="relative bg-haze pb-24 pt-24 md:pb-32 md:pt-32 scroll-mt-20">
      <WaveEdge from="#ECEFF8" />

      <div className="relative z-[2] mx-auto max-w-[80rem] px-5">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <SectionHeading
            label="تمرین‌ها و برنامه‌ها"
            title="نقشه‌ی رشد فردی"
            description="نتایج آزمون‌ها، ثبت‌های روزانه‌ی شما و پیشنهادهای هوشمند، در یک نقشه کنار هم می‌نشینند تا بدانید در هر حوزه کجا هستید و قدم بعدی چیست."
            className="lg:col-span-3"
          />

          {/* دیاگرام */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="flex flex-col items-center lg:col-span-5"
          >
            {/* دسکتاپ: گره‌ها با خطوط */}
            <div className="relative hidden h-[400px] w-full max-w-[470px] md:block">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                {[
                  [18, 18],
                  [82, 24],
                  [18, 82],
                  [82, 76],
                ].map(([x, y], i) => (
                  <line key={i} x1="50" y1="46" x2={x} y2={y} stroke="rgb(74 88 166 / 0.18)" strokeWidth="0.45" strokeDasharray="1.5 1.5" />
                ))}
              </svg>
              <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
                <CoreNode />
              </div>
              {domains.map((d, i) => (
                <motion.div
                  key={d.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: "easeOut" }}
                  className={`absolute ${d.pos} w-[46%] max-w-[210px]`}
                  style={{ animationDelay: d.floatDelay }}
                >
                  <DomainCard domain={d} />
                </motion.div>
              ))}
            </div>

            {/* موبایل */}
            <div className="flex w-full flex-col items-center gap-6 md:hidden">
              <CoreNode />
              <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                {domains.map((d) => (
                  <DomainCard key={d.title} domain={d} />
                ))}
              </div>
            </div>

            {/* راهنمای منابع */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {(Object.keys(sourceMeta) as Source[]).map((k) => {
                const m = sourceMeta[k];
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-body">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${m.className}`}>
                      <m.icon className="h-3 w-3" />
                    </span>
                    {m.label}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 rounded-full bg-sun/15 px-3.5 py-1 text-[14px] font-bold text-[#9c6a24]">
              نمونه‌ی مفهومی — نقشه‌ی شما پس از انجام آزمون‌ها ساخته می‌شود
            </p>
          </motion.div>

          {/* کارت الهام‌بخش */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65, delay: 0.1, ease: "easeOut" }}
            className="group relative min-h-[320px] overflow-hidden rounded-[1.8rem] shadow-card lg:col-span-4"
          >
            <img
              src="/images/map-card.jpg"
              alt="کوه‌های آرام در مه صبحگاهی"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent" />
            <button
              type="button"
              onClick={toggleSave}
              aria-pressed={saved}
              aria-label={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره در این مرورگر"}
              title={saved ? "ذخیره شد (در این مرورگر)" : "ذخیره در این مرورگر"}
              className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-white transition-colors duration-300 hover:bg-white"
            >
              {saved ? <BookmarkCheck className="h-4.5 w-4.5 text-steel" /> : <Bookmark className="h-4.5 w-4.5" />}
            </button>
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 p-7">
              <p className="text-center text-xl font-black leading-relaxed text-white">
                شناخت بهتر خود،
                <br />
                آغاز تغییر است.
              </p>
              <a
                href="#assistant"
                aria-label="آشنایی با دستیار هوشمند آریاسازه"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-steel shadow-lg transition-transform duration-300"
              >
                <Play className="h-5 w-5 -translate-x-px" fill="currentColor" />
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
