import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowDown, ArrowLeft, BarChart3, Compass, Fingerprint, Info, ShieldCheck, Sprout, Stethoscope, type LucideIcon } from "lucide-react";
import { defaultHero, type HeroContent } from "../lib/siteData";
import { cn } from "../utils/cn";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const trust = [
  { icon: ShieldCheck, label: "محرمانه" },
  { icon: Stethoscope, label: "همراه با متخصصان" },
  { icon: Info, label: "جایگزین درمان نیست" },
];

/** کارت‌های شیشه‌ای دور تصویر؛ توضیح قابلیت‌های محصول‌اند، نه آمار */
const chips: Array<{ icon: LucideIcon; title: string; sub: string; className: string; delay: string }> = [
  { icon: Fingerprint, title: "شناخت الگوهای رفتاری", sub: "برای فهم مسیر فکری خود", className: "-top-2 right-[6%] sm:right-[14%]", delay: "0s" },
  { icon: BarChart3, title: "تحلیل نتایج آزمون‌ها", sub: "با دقت در یک نگاه", className: "top-[22%] -left-3 sm:-left-8", delay: "1.4s" },
  { icon: Sprout, title: "تمرین‌های روزانه", sub: "چند دقیقه، هر روز", className: "bottom-[8%] right-[2%] sm:right-[4%]", delay: "2.6s" },
  { icon: Compass, title: "نقشه‌ی رشد شخصی", sub: "گام‌به‌گام، مسیر شما", className: "bottom-[2%] -left-2 sm:-left-10", delay: "0.8s" },
];

function Chip({ icon: Icon, title, sub, className, delay }: (typeof chips)[number]) {
  return (
    <div className={cn("chip-glass absolute z-10 flex items-center gap-3 px-3.5 py-2.5 animate-float", className)} style={{ animationDelay: delay }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel/10 text-steel">
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-bold text-ink">{title}</span>
        <span className="block text-[12.5px] text-body">{sub}</span>
      </span>
    </div>
  );
}

function HeroVisual({ content }: { content: HeroContent }) {
  const reduce = useReducedMotion();
  const { mediaType, imageUrl, videoUrl } = content;
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
      className="relative mx-auto aspect-[4/5] w-full max-w-[19rem] sm:max-w-[26rem] lg:max-w-[28rem]"
    >
      <div className="ai-halo absolute inset-[-8%] rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute inset-x-[8%] inset-y-0 rounded-[2.7rem] border border-white/80 bg-gradient-to-b from-white/70 via-haze/60 to-white/30 shadow-card backdrop-blur-sm" aria-hidden="true" />
      {mediaType === "video" && videoUrl ? (
        <video src={videoUrl} autoPlay loop muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback className="fade-edges absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      ) : (
        <img
          src={mediaType === "image" && imageUrl ? imageUrl : "/images/hero-brain.png"}
          alt="مغز شفاف با حلقه‌های نوری؛ نماد شناخت و تعادل ذهن"
          width={832}
          height={1248}
          className="fade-edges absolute inset-0 h-full w-full object-cover object-[50%_46%]"
        />
      )}
      {chips.map((c) => <Chip key={c.title} {...c} />)}
    </motion.div>
  );
}

export function Hero({ content = defaultHero }: { content?: HeroContent }) {
  const external = (href: string) => /^https?:/i.test(href);
  return (
    <section id="top" className="relative overflow-hidden bg-cream">
      <div className="noise pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] bg-[radial-gradient(ellipse_62%_58%_at_28%_22%,rgb(214_221_246/0.75),transparent_70%),radial-gradient(ellipse_40%_40%_at_90%_10%,rgb(231_222_246/0.6),transparent_70%)]" aria-hidden="true" />

      <div className="relative mx-auto max-w-[80rem] px-5 pb-16 pt-28 md:pt-36 lg:pb-28">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-6">
          <motion.div variants={container} initial="hidden" animate="show" className="text-right lg:col-span-6">
            <motion.p variants={item} className="section-label mb-4">
              {content.eyebrow}
            </motion.p>
            <motion.h1 variants={item} className="mb-6 text-[2.35rem] font-semibold leading-[1.35] text-ink sm:text-[2.9rem] lg:text-[3.4rem]">
              {content.titleLine1}
              <br />
              <span className="indigo-gradient-text">{content.titleLine2}</span>
            </motion.h1>
            <motion.p variants={item} className="section-lead mb-9">
              {content.description}
            </motion.p>
            <motion.div variants={item} className="flex flex-wrap items-center gap-3">
              <a href={content.primaryCta.href} className="btn-primary group min-h-14 gap-3 px-8 text-base">
                {content.primaryCta.label}
                <ArrowLeft className="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-1" />
              </a>
              <a href={content.secondaryCta.href} {...(external(content.secondaryCta.href) ? { target: "_blank", rel: "noreferrer" } : {})} className="btn-secondary group min-h-14 gap-3 px-7 text-base">
                {content.secondaryCta.label}
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-steel/25 text-steel transition-transform duration-300 group-hover:-translate-x-0.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </span>
              </a>
            </motion.div>
            <motion.ul variants={item} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              {trust.map((t) => (
                <li key={t.label} className="flex items-center gap-2 text-[15px] font-medium text-body">
                  <t.icon className="h-4.5 w-4.5 text-steel" strokeWidth={1.8} />
                  {t.label}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <div className="order-first lg:order-none lg:col-span-6">
            <HeroVisual content={content} />
          </div>
        </div>
      </div>

      <a href="#dashboard" aria-label="رفتن به بخش بعدی" className="absolute bottom-8 right-5 hidden flex-col items-center gap-2 text-steel transition-colors hover:text-ink lg:flex">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-steel/20 bg-white/70">
          <ArrowDown className="h-4.5 w-4.5" />
        </span>
        <span className="h-10 w-px bg-gradient-to-b from-steel/30 to-transparent" aria-hidden="true" />
      </a>
    </section>
  );
}
