import { useCallback, useState } from "react";
import { Globe, Mail, MessageSquareText, Send } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { Modal } from "./Modal";
import { SupportForm } from "./SupportForm";
import { WaveEdge } from "./WaveEdge";
import { useNavigation, type SocialIcon } from "../lib/navigation";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4V8h4v2.5A5 5 0 0 0 11 8z" />
      <rect width="4" height="12" x="2" y="9" rx="1" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.4L3 21z" />
      <path d="M9 9.5c.2 2.4 2.1 4.3 4.5 4.5l1.2-1.2 2 1-.6 1.9c-4.1.4-8.4-3.9-8-8L10 7l1 2-1.2 1.2" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const socialIcons: Record<SocialIcon, ComponentType<{ className?: string }>> = {
  instagram: InstagramIcon,
  telegram: Send,
  linkedin: LinkedinIcon,
  x: XIcon,
  youtube: YoutubeIcon,
  whatsapp: WhatsappIcon,
  mail: Mail,
  globe: Globe,
};

const legalDocs = {
  privacy: {
    title: "حریم خصوصی",
    body: "آریاسازه حریم خصوصی کاربران را از اولویت‌های اصلی می‌داند. داده‌های آزمون و پیشرفت شما در Supabase و با سیاست‌های Row Level Security نگهداری می‌شوند و بدون اطلاع‌رسانی صریح با شخص ثالث به اشتراک گذاشته نمی‌شوند. اطلاعات حساس مانند رمز عبور و کلیدهای API در پایگاه داده‌ی عمومی ذخیره نمی‌شوند. نسخه‌ی کامل سند حریم خصوصی پیش از انتشار رسمی محصول منتشر خواهد شد.",
  },
  terms: {
    title: "قوانین و مقررات",
    body: "محتوای آریاسازه شامل آزمون‌ها، گزارش‌ها و تمرین‌ها، صرفاً جهت خودشناسی و رشد فردی ارائه می‌شود و جایگزین تشخیص یا درمان تخصصی روان‌شناختی نیست. در صورت نیاز به کمک تخصصی، با متخصص سلامت روان مشورت کنید. انتشار آزمون‌ها مستلزم بازبینی علمی و انتشار نسخه است. بازنشر محتوا بدون اجازه‌ی کتبی ممنوع است.",
  },
};

export function Footer() {
  const { byLocation, footer } = useNavigation();
  const footerNav = byLocation("footer_primary");
  const contentNav = byLocation("footer_content");
  const socials = byLocation("social");
  const [doc, setDoc] = useState<keyof typeof legalDocs | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const close = useCallback(() => setDoc(null), []);

  return (
    <footer id="about" className="relative bg-paper scroll-mt-20">
      <WaveEdge from="#F1F3FA" />
      <div className="relative z-[2] mx-auto max-w-[80rem] px-5 pb-14 pt-24 md:pt-28">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo />
            <p className="mt-5 max-w-sm text-[14px] leading-7 text-body">{footer.about}</p>
            {footer.email && (
              <a href={`mailto:${footer.email}`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-steel transition-colors hover:text-ink">
                <Mail className="h-4 w-4" />
                <span dir="ltr">{footer.email}</span>
              </a>
            )}
            {footer.showSupportButton && (
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="mt-2 flex min-h-11 items-center gap-2 text-[14px] font-bold text-steel transition-colors hover:text-ink"
              >
                <MessageSquareText className="h-4 w-4" />
                ارسال پیام به پشتیبانی
              </button>
            )}
          </div>

          <nav className="md:col-span-3" aria-label="ناوبری فوتر">
            <p className="mb-4 text-[14px] font-extrabold text-ink">بخش‌های سایت</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {footerNav.map((item) => (
                <li key={item.id}>
                  {item.href.startsWith("/") && !item.href.includes("#") ? (
                    <Link to={item.href} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">{item.label}</Link>
                  ) : (
                    <a href={item.href} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">{item.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-2">
            <p className="mb-4 text-[14px] font-extrabold text-ink">محتوا</p>
            <ul className="space-y-2.5">
              {contentNav.map((item) => (
                <li key={item.id}>
                  {item.href.startsWith("/") && !item.href.includes("#") ? (
                    <Link to={item.href} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">{item.label}</Link>
                  ) : (
                    <a href={item.href} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">{item.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <p className="mb-4 text-[14px] font-extrabold text-ink">اطلاعات</p>
            <ul className="space-y-2.5">
              <li><button type="button" onClick={() => setDoc("privacy")} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">حریم خصوصی</button></li>
              <li><button type="button" onClick={() => setDoc("terms")} className="inline-flex min-h-9 items-center text-[14px] font-semibold text-body transition-colors hover:text-ink">قوانین و مقررات</button></li>
              {/* لینک مدیریت عمدتاً از فوتر عمومی حذف شده است؛ مدیران از همان صفحه‌ی ورود معمولی (/login) وارد می‌شوند */}
            </ul>
            <div className="mt-4 flex items-center gap-2.5">
              {socials.map((s) => {
                const Icon = socialIcons[s.icon ?? "globe"];
                return (
                  <a key={s.id} href={s.href} target={s.open_in_new_tab ? "_blank" : undefined} rel="noreferrer" aria-label={s.label} title={s.label} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-steel ring-1 ring-ink/5 transition-all hover:-translate-y-0.5 hover:bg-steel hover:text-white">
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-ink/5 pt-7 text-center sm:flex-row sm:text-right">
          <p className="text-[14px] font-medium text-body">{footer.copyright}</p>
          {footer.disclaimer && <p className="text-[14px] font-medium text-fog">{footer.disclaimer}</p>}
        </div>
      </div>

      <Modal open={doc !== null} onClose={close} title={doc ? legalDocs[doc].title : ""}>
        {doc && (
          <>
            <p className="mb-6 text-[14px] font-medium leading-7 text-body">{legalDocs[doc].body}</p>
            <button type="button" onClick={close} className="min-h-12 w-full rounded-full bg-ink px-5 text-[14px] font-bold text-white transition-colors hover:bg-ink-deep">
              متوجه شدم
            </button>
          </>
        )}
      </Modal>

      <SupportForm open={supportOpen} onClose={() => setSupportOpen(false)} />
    </footer>
  );
}
