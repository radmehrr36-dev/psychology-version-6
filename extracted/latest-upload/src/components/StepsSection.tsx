import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { defaultStepsItems, sectionOrderDefs } from "../lib/siteData";
import { WaveEdge } from "./WaveEdge";

interface Props {
  heading?: { label: string; title: string; description: string };
  items?: Array<{ step: number; title: string; subtitle: string }>;
}

/**
 * بازطراحی «چگونه کار می‌کند؟»
 * سه کارت کاربرپسند و خوانا با شماره‌ی بزرگ، خط ثابت، دو خط متن و فلش ادامه‌دهنده.
 */
export function StepsSection({ heading, items = defaultStepsItems }: Props) {
  const normalized = [...items].sort((a, b) => a.step - b.step);

  return (
    <section id="steps" className="relative bg-paper pb-24 pt-24 md:pb-32 md:pt-32 scroll-mt-20">
      <WaveEdge from="#E8ECF8" />
      <div className="relative z-[2] mx-auto max-w-[80rem] px-5">
        <div className="mb-12 max-w-2xl">
          {heading?.label && <p className="section-label mb-3">{heading.label}</p>}
          <h2 className="section-title mb-4">{heading?.title ?? sectionOrderDefs.steps.label}</h2>
          {heading?.description && <p className="section-lead">{heading.description}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {normalized.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.09, ease: "easeOut" }}
              className="relative overflow-hidden rounded-[25.2px] border border-ink/6 bg-[#f1f3fa] p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass"
            >
              {/* شماره‌ی بزرگ، ساده و دکوراتیو */}
              <span aria-hidden="true" className="select-none text-[4.5rem] font-black leading-none text-steel/12 md:text-[5rem]">
                {String(step.step).length === 1 ? `0${step.step}` : step.step}
              </span>
              <h3 className="mt-4 text-[19px] font-extrabold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[15px] leading-8 text-body">{step.subtitle}</p>

              {/* خط پیوسته‌ی نازک */}
              <div className="mt-5 flex items-center gap-2" aria-hidden="true">
                <span className="h-px flex-1 bg-ink/8" />
                {i < normalized.length - 1 ? (
                  <ChevronLeft className="h-4 w-4 text-steel" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-coral" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
