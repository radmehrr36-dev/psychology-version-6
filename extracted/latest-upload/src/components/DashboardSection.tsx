import { Fragment } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, FileText, Play, Repeat, ScanSearch, TrendingUp } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { WaveEdge } from "./WaveEdge";

/* ── حلقه‌ی پیشرفت ── */
function ProgressRing({ value }: { value: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex h-24 w-24 items-center justify-center md:h-28 md:w-28">
      <svg viewBox="0 0 88 88" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgb(74 88 166 / 0.1)" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="#4a58a6"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="text-center">
        <span className="block text-2xl font-black text-ink">{toFa(value)}٪</span>
      </div>
    </div>
  );
}

/* ── نمودار روند هفتگی ── */
const weekly = [2, 3, 1, 4, 3, 5, 4];
const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function WeeklyBars() {
  const max = Math.max(...weekly);
  return (
    <div className="flex h-24 items-end justify-between gap-2">
      {weekly.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-16 w-full items-end">
            <div
              className={`w-full rounded-t-md ${i === weekly.length - 2 ? "bg-steel" : "bg-steel/25"}`}
              style={{ height: `${(v / max) * 100}%` }}
              title={`${toFa(v)} تمرین`}
            />
          </div>
          <span className="text-[14px] font-semibold text-body">{weekdays[i]}</span>
        </div>
      ))}
    </div>
  );
}

function toFa(n: number) {
  return n.toLocaleString("fa-IR", { useGrouping: false });
}

const flow = [
  { icon: ScanSearch, title: "آزمون", desc: "ارزیابی" },
  { icon: FileText, title: "گزارش", desc: "تفسیر" },
  { icon: Repeat, title: "تمرین", desc: "پیشنهاد" },
  { icon: TrendingUp, title: "پیگیری", desc: "روند" },
];

export function DashboardSection() {
  return (
    <section id="dashboard" className="relative bg-paper pb-24 pt-24 md:pb-32 md:pt-32 scroll-mt-20">
      <WaveEdge from="#F6F7FC" />

      <div className="relative z-[2] mx-auto max-w-[80rem] px-5">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <SectionHeading
            label="داشبورد شما"
            title="یک سفر شخصی، در یک نگاه"
            description="آزمون‌ها، گزارش‌ها، تمرین روزانه و روند پیشرفت، همه در یک صفحه‌ی منظم. داشبورد پس از انجام اولین آزمون برای شما شکل می‌گیرد."
            linkLabel="چطور شروع کنم؟"
            href="#steps"
            className="lg:col-span-4"
          />

          {/* پنجره‌ی داشبورد */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="rounded-[1.8rem] border border-ink/6 bg-white p-2 shadow-card lg:col-span-8 lg:p-2.5"
          >
            <div className="overflow-hidden rounded-[1.44rem] bg-white/80">
              {/* نوار بالا */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <i className="h-2 w-2 rounded-full bg-ink/15" />
                    <i className="h-2 w-2 rounded-full bg-ink/15" />
                    <i className="h-2 w-2 rounded-full bg-ink/15" />
                  </span>
                  <span className="text-sm font-bold text-ink">داشبورد شخصی</span>
                </div>
                <span className="rounded-full bg-sun/15 px-3 py-1 text-[14px] font-bold text-[#9c6a24]">
                  داده‌ی نمایشی — نمونه‌ی رابط کاربری
                </span>
              </div>

              <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-5">
                {/* بخش اصلی: تمرین امروز */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-steel to-[#4f73a8] p-5 text-white md:col-span-3">
                  <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <p className="mb-1 text-[14px] font-semibold text-white/75">تمرین امروز</p>
                  <h3 className="mb-1 text-xl font-extrabold">تنفس آگاهانه</h3>
                  <p className="mb-6 text-[14px] font-medium text-white/80">۱۰ دقیقه · سطح مبتدی · پیشنهاد بر اساس آزمون مدیریت استرس</p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-bold text-steel">
                      <Play className="h-3.5 w-3.5 -translate-x-px" fill="currentColor" />
                      شروع تمرین
                    </span>
                    <span className="text-[14px] font-semibold text-white/80">۳ روز پیاپی</span>
                  </div>
                </div>

                {/* شاخص اصلی */}
                <div className="panel flex flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center md:col-span-2">
                  <ProgressRing value={78} />
                  <p className="text-[14px] font-bold text-ink">تکمیل برنامه‌ی این ماه</p>
                  <p className="text-[14px] leading-5 text-body">نسبت تمرین‌های انجام‌شده به برنامه‌ریزی‌شده</p>
                </div>

                {/* آمار واضح */}
                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <div className="panel rounded-2xl p-4">
                    <CheckCircle2 className="mb-2 h-4.5 w-4.5 text-steel" />
                    <p className="text-xl font-black text-ink">۴</p>
                    <p className="text-[14px] font-semibold text-body">آزمون انجام‌شده</p>
                  </div>
                  <div className="panel rounded-2xl p-4">
                    <FileText className="mb-2 h-4.5 w-4.5 text-steel" />
                    <p className="text-xl font-black text-ink">۳</p>
                    <p className="text-[14px] font-semibold text-body">گزارش آماده</p>
                  </div>
                </div>

                {/* روند هفتگی */}
                <div className="panel rounded-2xl p-4 md:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[14px] font-bold text-ink">تمرین‌های هفته‌ی اخیر</p>
                    <span className="text-[14px] font-semibold text-body">۲۲ تمرین</span>
                  </div>
                  <WeeklyBars />
                </div>
              </div>

              {/* جریان محصول */}
              <div className="mx-4 mb-4 flex items-center justify-between gap-2 rounded-2xl bg-mist/70 px-4 py-3 sm:mx-5 sm:mb-5">
                {flow.map((f, i) => (
                  <Fragment key={f.title}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-steel ring-1 ring-ink/5">
                        <f.icon className="h-4 w-4" strokeWidth={1.9} />
                      </span>
                      <span className="hidden sm:block">
                        <span className="block text-[14px] font-bold text-ink">{f.title}</span>
                        <span className="block text-[14px] font-medium text-body">{f.desc}</span>
                      </span>
                      <span className="text-[14px] font-bold text-ink sm:hidden">{f.title}</span>
                    </div>
                    {i < flow.length - 1 && <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-fog" />}
                  </Fragment>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
