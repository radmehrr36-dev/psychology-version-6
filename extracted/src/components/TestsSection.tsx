import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Clock3, FileText, Fingerprint, ShieldCheck, UsersRound, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Modal } from "./Modal";
import { WaveEdge } from "./WaveEdge";
import type { PublicTest } from "../lib/types";

interface IntroTest {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  duration: string;
  report: string;
  badge?: string;
}

const introTests: IntroTest[] = [
  { id: "s1", icon: Fingerprint, title: "سنجش شخصیت", desc: "آشنایی با ویژگی‌های شخصیتی و سبک‌های رفتاری خود", duration: "۱۰ دقیقه", report: "خلاصه‌ی شخصیتی", badge: "معرفی" },
  { id: "s2", icon: Brain, title: "شناخت و بازتاب", desc: "شیوه‌ی تمرکز، توجه و پردازش اطلاعات", duration: "۲۰ دقیقه", report: "تحلیل تمرکز", badge: "معرفی" },
  { id: "s3", icon: Wind, title: "مدیریت استرس", desc: "منابع استرس و سبک‌های مقابله‌ی شما", duration: "۸ دقیقه", report: "راهبردهای آرامش", badge: "معرفی" },
  { id: "s4", icon: UsersRound, title: "سبک ارتباطی", desc: "نحوه‌ی تعامل شما در موقعیت‌های مختلف", duration: "۱۵ دقیقه", report: "نقشه‌ی ارتباطی", badge: "معرفی" },
];

export function TestsSection({
  items = [],
  source = "fallback",
  heading,
}: {
  items?: PublicTest[];
  source?: "db" | "empty" | "fallback";
  heading?: { label: string; title: string; description: string };
}) {
  const [activeIntro, setActiveIntro] = useState<IntroTest | null>(null);
  const [activePublic, setActivePublic] = useState<PublicTest | null>(null);
  const showDb = source === "db" && items.length > 0;

  return (
    <section id="tests" className="relative bg-cream-alt pb-24 pt-24 md:pb-32 md:pt-32 scroll-mt-20">
      <WaveEdge from="#FFFFFF" />
      <div className="relative z-[2] mx-auto max-w-[80rem] px-5">
        <div className="mb-12 lg:flex lg:items-end lg:justify-between">
          <SectionHeading
            label={heading?.label ?? "آزمون‌های ما"}
            title={heading?.title ?? "کتابخانه‌ی آزمون‌ها"}
            description={heading?.description ?? "آزمون‌های کوتاه و کاربردی برای شناخت بهتر شخصیت، عادت‌ها، هیجان‌ها و سبک ارتباطی شما."}
            className="max-w-lg"
          />
          <p className="mt-4 text-[14px] font-semibold text-body lg:pb-1">
            {showDb ? `${items.length.toLocaleString("fa-IR")} آزمون منتشرشده` : "آزمون‌ها پس از تأیید علمی منتشر می‌شوند"}
          </p>
        </div>

        {source === "empty" ? (
          <div className="rounded-[1.8rem] border border-ink/8 bg-white p-8 text-center">
            <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-steel" />
            <p className="text-[14px] font-bold text-ink">هنوز آزمونی منتشر نشده است</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-body">
              آزمون‌ها در پنل مدیریت ساخته می‌شوند و فقط پس از بازبینی علمی و انتشار، در این بخش نمایش داده می‌شوند.
              هیچ داده‌ی نمایشی به‌جای آزمون واقعی ارائه نمی‌شود.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {showDb
              ? items.map((test, i) => (
                  <motion.article
                    key={test.id}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
                    className="group flex flex-col overflow-hidden rounded-[1.6rem] border border-ink/8 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass"
                  >
                    {test.cover_url && (
                      <div className="h-36 w-full overflow-hidden">
                        <img src={test.cover_url} alt={test.categoryName ?? test.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steel/10 text-steel transition-colors group-hover:bg-steel group-hover:text-white">
                        <FileText className="h-6 w-6" strokeWidth={1.7} />
                      </span>
                      {test.categoryName && (
                        <span className="rounded-full bg-mist px-3 py-1 text-[14px] font-bold text-steel">{test.categoryName}</span>
                      )}
                    </div>
                    <h3 className="mb-2 text-[16px] font-extrabold text-ink">{test.title}</h3>
                    <p className="mb-5 text-[14px] font-medium leading-6 text-body">{test.description ?? "توضیح کوتاه این آزمون ثبت نشده است."}</p>
                    <dl className="mb-5 space-y-2 border-t border-ink/5 pt-4 text-[14px]">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-fog" />
                        <dt className="font-semibold text-body">زمان:</dt>
                        <dd className="font-bold text-ink">{test.duration_minutes ? `${test.duration_minutes.toLocaleString("fa-IR")} دقیقه` : "نامشخص"}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-fog" />
                        <dt className="font-semibold text-body">گزارش:</dt>
                        <dd className="font-bold text-ink">{test.report_type ?? "گزارش شخصی"}</dd>
                      </div>
                    </dl>
                    <Link
                      to={`/tests/${test.slug}`}
                      className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-steel/20 bg-white px-5 text-[14px] font-bold text-steel transition-all hover:border-steel hover:bg-steel hover:text-white"
                    >
                      مشاهده و شروع آزمون
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Link>
                    </div>
                  </motion.article>
                ))
              : introTests.map((test, i) => (
                  <motion.article
                    key={test.id}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
                    className="group flex flex-col overflow-hidden rounded-[1.6rem] border border-ink/8 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass"
                  >
                    <div className="flex flex-1 flex-col p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steel/10 text-steel transition-colors group-hover:bg-steel group-hover:text-white">
                        <test.icon className="h-6 w-6" strokeWidth={1.7} />
                      </span>
                      <span className="rounded-full bg-mist px-3 py-1 text-[14px] font-bold text-steel">{test.badge}</span>
                    </div>
                    <h3 className="mb-2 text-[16px] font-extrabold text-ink">{test.title}</h3>
                    <p className="mb-5 text-[14px] font-medium leading-6 text-body">{test.desc}</p>
                    <dl className="mb-5 space-y-2 border-t border-ink/5 pt-4 text-[14px]">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-fog" />
                        <dt className="font-semibold text-body">زمان تقریبی:</dt>
                        <dd className="font-bold text-ink">{test.duration}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-fog" />
                        <dt className="font-semibold text-body">نوع گزارش:</dt>
                        <dd className="font-bold text-ink">{test.report}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => setActiveIntro(test)}
                      className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-steel/20 bg-white px-5 text-[14px] font-bold text-steel transition-all hover:border-steel hover:bg-steel hover:text-white"
                    >
                      معرفی آزمون
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    </div>
                  </motion.article>
                ))}
          </div>
        )}

        {source === "fallback" && (
          <p className="mt-8 rounded-xl border border-[#e5c98f] bg-[#fdf6e8] px-4 py-3 text-[14px] leading-6 text-[#8a641f]">
            اتصال به پایگاه داده برقرار نیست؛ کارت‌های بالا صرفاً معرفی حوزه‌های آزمون هستند و نتیجه یا آزمون واقعی
            محسوب نمی‌شوند. با اتصال Supabase، فقط آزمون‌های منتشرشده و تأییدشده نمایش داده می‌شوند.
          </p>
        )}
      </div>

      <Modal
        open={Boolean(activePublic)}
        onClose={() => setActivePublic(null)}
        title={activePublic ? `آزمون ${activePublic.title}` : ""}
      >
        {activePublic && (
          <>
            <p className="mb-4 text-[14px] leading-7 text-body">
              {activePublic.description ?? "توضیح کاملی برای این آزمون ثبت نشده است."}
            </p>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-[14px]">
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-ink/5">
                <dt className="text-body">زمان تقریبی</dt>
                <dd className="mt-0.5 font-bold text-ink">{activePublic.duration_minutes ? `${activePublic.duration_minutes.toLocaleString("fa-IR")} دقیقه` : "نامشخص"}</dd>
              </div>
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-ink/5">
                <dt className="text-body">نوع گزارش</dt>
                <dd className="mt-0.5 font-bold text-ink">{activePublic.report_type ?? "گزارش شخصی"}</dd>
              </div>
            </dl>
            {activePublic.scientific_lead && (
              <p className="mb-4 text-[14px] text-body">مسئول علمی: <span className="font-bold text-ink">{activePublic.scientific_lead}</span></p>
            )}
            <p className="mb-5 rounded-xl bg-sun/10 p-3 text-[14px] leading-6 text-[#8a641f]">
              نتایج این آزمون‌ها جنبه‌ی خودشناسی دارد و جایگزین ارزیابی تخصصی نیست.
            </p>
            <Link to={`/tests/${activePublic.slug}`} onClick={() => setActivePublic(null)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-bold text-white">
              مشاهده و شروع آزمون
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(activeIntro)}
        onClose={() => setActiveIntro(null)}
        title={activeIntro ? `معرفی ${activeIntro.title}` : ""}
      >
        {activeIntro && (
          <>
            <p className="mb-4 text-[14px] leading-7 text-body">{activeIntro.desc}</p>
            <p className="mb-5 rounded-xl bg-sun/10 p-3 text-[14px] leading-6 text-[#8a641f]">
              این کارت بخشی از معرفی کلی آریاسازه است؛ نسخه‌ی آزمون هنوز در پایگاه داده منتشر نشده و اجرای آن فعال نیست.
            </p>
            <a href="#steps" onClick={() => setActiveIntro(null)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-bold text-white">
              آشنایی با مسیر آریاسازه
              <ArrowLeft className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </Modal>
    </section>
  );
}
