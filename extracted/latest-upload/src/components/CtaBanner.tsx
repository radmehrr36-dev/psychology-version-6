import { motion } from "framer-motion";
import { ArrowLeft, Award, FlaskConical, Lock, Mic, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { WaveEdge } from "./WaveEdge";
import type { CtaContent } from "../lib/siteData";

const featureIcons: Record<string, typeof Lock> = {
  lock: Lock,
  mic: Mic,
  award: Award,
  shield: ShieldCheck,
  flask: FlaskConical,
  user: UserCheck,
  sparkle: Sparkles,
};

export function CtaBanner({ content }: { content: CtaContent }) {
  const hasMedia = (content.mediaType === "image" || content.mediaType === "video") && content.mediaUrl;

  return (
    <section id="assistant" className="relative bg-cream-alt px-5 pb-24 pt-24 md:pb-32 md:pt-32 scroll-mt-20">
      <WaveEdge from="#FFFFFF" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.75, ease: "easeOut" }}
        className="relative z-[2] mx-auto max-w-[80rem] overflow-hidden rounded-[1.8rem] border border-ink/6 bg-gradient-to-br from-white via-pearl to-pearl-deep shadow-card"
      >
        <div className="relative grid items-center gap-10 p-6 md:grid-cols-12 md:gap-10 md:p-12 lg:p-14">
          {/* محتوای متنی سمت راست */}
          <div className="order-2 md:order-1 md:col-span-7">
            {content.eyebrow && <p className="section-label mb-3">{content.eyebrow}</p>}

            <div className="mb-5 flex items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-glass ring-1 ring-ink/5">
                <img src={content.avatarUrl || "/images/avatar-orb.png"} alt="" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-[15px] font-extrabold text-ink">دستیار هوشمند آریاسازه</p>
                <p className="text-[13px] font-medium text-body">راهنمای شما در انتخاب آزمون و تمرین مناسب</p>
              </div>
            </div>

            <h3 className="mb-4 max-w-lg text-2xl font-semibold leading-[1.5] text-ink md:text-[2rem] md:leading-[1.45]">
              {content.title}
            </h3>
            <p className="section-lead mb-7">
              {content.description}
            </p>

            <ul className="mb-8 flex flex-wrap gap-x-5 gap-y-3">
              {content.features.map((f) => {
                const Icon = featureIcons[f.icon] ?? ShieldCheck;
                return (
                  <li key={f.label} className="flex min-h-11 items-center gap-2.5 rounded-full border border-ink/6 bg-white px-4 py-2 text-[13.5px] font-bold text-ink">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-steel/10 text-steel">
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    {f.label}
                  </li>
                );
              })}
            </ul>

            <a href={content.ctaHref} className="group inline-flex min-h-12 items-center gap-2.5 rounded-full bg-coral px-7 text-base font-bold text-ink shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:bg-coral-deep">
              {content.ctaLabel}
              <ArrowLeft className="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-1" />
            </a>
          </div>

          {/* تصویر یا ویدیو سمت چپ */}
          <div className="order-1 md:order-2 md:col-span-5">
            {hasMedia ? (
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[22rem] overflow-hidden rounded-[1.8rem] border border-ink/6 bg-white shadow-glass md:max-w-none">
                {content.mediaType === "video" ? (
                  <video
                    src={content.mediaUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    poster="/images/cta-mountains.jpg"
                    disablePictureInPicture
                    disableRemotePlayback
                    className="h-full w-full object-cover"
                    aria-hidden="true"
                  />
                ) : (
                  <img src={content.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-white/25 to-transparent pointer-events-none" />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-steel shadow-sm backdrop-blur">
                  <span className="ai-core h-2 w-2 rounded-full" aria-hidden="true" />
                  الهام‌بخش مسیر شما
                </span>
              </div>
            ) : (
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[22rem] overflow-hidden rounded-[1.8rem] border border-ink/6 bg-gradient-to-br from-white to-pearl-deep shadow-glass md:max-w-none">
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div className="absolute inset-[14%] rounded-full border border-white/60" />
                  <div className="absolute inset-[24%] rounded-full bg-[radial-gradient(circle_at_34%_28%,#ffffff_0%,#f2f6fa_20%,#dbe7f2_46%,#dbcef2_72%,#f2cbb2_100%)] shadow-[0_28px_60px_-36px_rgb(63_94_120/0.55)]" />
                  <div className="absolute inset-[38%] rounded-full bg-[radial-gradient(circle_at_40%_34%,rgba(255,255,255,0.95),rgba(255,255,255,0)_70%)]" />
                  <div className="ai-core absolute inset-[44%] rounded-full opacity-60 blur-[6px]" />
                </div>
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-steel shadow-sm backdrop-blur">
                  <span className="ai-core h-2 w-2 rounded-full" aria-hidden="true" />
                  مسیر شما
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
