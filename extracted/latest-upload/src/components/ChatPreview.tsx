import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Send } from "lucide-react";
import { WaveEdge } from "./WaveEdge";

/* ── متن‌های گفتگو (قابل تغییر) ── */
export const chatMessages = {
  user1: "این روزها خیلی خسته‌ام و نمی‌دونم از کجا شروع کنم.",
  assistant1:
    "خستگی‌ای که می‌گی مهمه و اینکه بخوای از جایی شروع کنی، قدم خوبیه. بذار با یک سؤال ساده شروع کنیم: این خستگی بیشتر به‌نظر ذهنی می‌رسه یا بدنی؟",
  user1_reply: "فکر کنم ذهنیه؛ شب‌ها هم نمی‌تونم راحت بخوابم.",
  listening: "در حال گوش دادن",
};

const AI_LABEL = "✦ دستیار هوشمند";

function useTyped(text: string, active: boolean) {
  const reduce = useReducedMotion();
  const [out, setOut] = useState(reduce ? text : "");

  useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    if (!active) return;
    setOut("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [text, active, reduce]);

  return out;
}

export function ChatPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const typed = useTyped(chatMessages.assistant1, inView);
  const done = typed.length === chatMessages.assistant1.length;

  return (
    <section id="chat-preview" className="relative bg-haze pb-20 pt-24 md:pb-28 md:pt-32">
      <WaveEdge from="#F6F7FC" />

      <div className="relative z-[2] mx-auto max-w-[80rem] px-5">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-steel/15 bg-white/70 px-4 py-1.5 text-[14px] font-semibold text-steel">
            نمونه‌ی گفتگو
          </span>
          <h2 className="section-title mb-3">با هم، قدم به قدم</h2>
          <p className="section-lead mx-auto">
            دستیار آریاسازه گوش می‌ده، سؤال ساده می‌پرسد و مسیر را با خودتان پیدا می‌کند — بدون قضاوت و بدون شلوغی.
          </p>
        </div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mx-auto mt-10 max-w-2xl rounded-[25.2px] border border-white/80 bg-white/70 p-4 shadow-card backdrop-blur-xl sm:p-5"
        >
          {/* سربرگ پنجره */}
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-ink/5 pb-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-ink/5">
                <span className="ai-core h-4 w-4 rounded-full" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-bold text-ink">دستیار آریاسازه</p>
                <p className="text-[14px] text-body">همیشه در دسترس</p>
              </div>
            </div>
            <span className="ai-gradient-text text-[14px] font-bold">{AI_LABEL}</span>
          </div>

          {/* پیام‌ها */}
          <div className="space-y-3.5">
            {/* کاربر */}
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-[21.6px] rounded-tl-md bg-steel px-4 py-3 text-base leading-8 text-white">
                {chatMessages.user1}
              </p>
            </div>

            {/* دستیار با تایپ ملایم */}
            <div className="flex justify-start">
              <div className="max-w-[88%]">
                <span className="mb-1.5 inline-flex items-center gap-1.5 text-[14px] font-bold">
                  <span className="ai-gradient-text">{AI_LABEL}</span>
                </span>
                <p className="rounded-[21.6px] rounded-tr-md border border-ink/5 bg-white px-4 py-3 text-base leading-8 text-ink shadow-glass">
                  {typed}
                  {!done && (
                    <span
                      className="ms-1 inline-block h-4 w-[2px] translate-y-0.5 bg-steel/70"
                      aria-hidden="true"
                    />
                  )}
                </p>
              </div>
            </div>

            {/* پاسخ کاربر — فقط پس از پایان تایپ ظاهر می‌شود */}
            {done && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex justify-end"
              >
                <p className="max-w-[85%] rounded-[21.6px] rounded-tl-md bg-steel px-4 py-3 text-base leading-8 text-white">
                  {chatMessages.user1_reply}
                </p>
              </motion.div>
            )}

            {/* نشانگر «در حال گوش دادن» */}
            <div className="flex items-center gap-2.5 pt-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-ink/5">
                <span className="ai-core h-3 w-3 rounded-full" aria-hidden="true" />
              </span>
              <span className="text-[14px] font-medium text-body">{chatMessages.listening}</span>
              <span className="flex items-end gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-steel/60 animate-blink"
                    style={{ animationDelay: `${i * 0.22}s` }}
                  />
                ))}
              </span>
            </div>
          </div>

          {/* نوار ورودی (نمایشی) */}
          <div className="mt-4 flex items-center gap-3 rounded-full border border-ink/8 bg-white/80 px-4 py-2.5">
            <span className="flex-1 text-base text-fog" aria-disabled="true">
              پیام خود را بنویسید…
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-alt text-body" aria-hidden="true">
              <Send className="h-4 w-4 -translate-x-px" />
            </span>
          </div>
          <p className="mt-2.5 text-center text-[14px] text-body">
            نمایش نمونه‌ی گفتگو — تعامل در این نسخه فعال نیست.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
