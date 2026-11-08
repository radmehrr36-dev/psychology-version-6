import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Newspaper, Stethoscope, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { SectionHeading } from "./SectionHeading";

interface ExpertCard {
  id: string;
  display_name: string;
  title: string | null;
  avatar_url: string | null;
}
interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
}

/** متخصصان تأییدشده و جدیدترین مقالات از دیتابیس؛ اگر داده‌ای نیست، فقط مسیرهای واقعی سایت نمایش داده می‌شود (بدون داده‌ی ساختگی) */
export function ExpertsSection() {
  const [experts, setExperts] = useState<ExpertCard[]>([]);
  const [articles, setArticles] = useState<ArticleCard[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const [e, a] = await Promise.all([
        supabase!.from("psychologists").select("id,display_name,title,avatar_url").eq("is_active", true).eq("verification_status", "verified").limit(4),
        supabase!.from("articles").select("id,slug,title,excerpt").eq("status", "published").order("published_at", { ascending: false }).limit(3),
      ]);
      if (cancelled) return;
      if (!e.error) setExperts((e.data ?? []) as ExpertCard[]);
      if (!a.error) setArticles((a.data ?? []) as ArticleCard[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="experts" className="relative bg-cream-alt/60 py-20 md:py-28">
      <div className="mx-auto max-w-[80rem] px-5">
        <SectionHeading label="همراهی انسانی" title="متخصصان و محتوای روان‌شناسی" description="دانش علمی و همراهی متخصصان، در کنار ابزارهای هوشمند؛ تا مسیر شناخت خود را مطمئن‌تر بروید." />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="card-glass p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 text-xl font-semibold text-ink"><Stethoscope className="h-5 w-5 text-steel" />متخصصان آریاسازه</h3>
              <Link to="/psychologists" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel">همه‌ی متخصصان<ArrowLeft className="h-4 w-4" /></Link>
            </div>
            {experts.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {experts.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3.5 shadow-chip">
                    {x.avatar_url ? <img src={x.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-steel/10 text-steel"><UserRound className="h-5 w-5" /></span>}
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[15px] font-bold text-ink">{x.display_name}</span>
                      <span className="block truncate text-[13px] text-body">{x.title ?? "روان‌شناس"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-steel/25 bg-white/60 p-6 text-[15px] leading-8 text-body">
                متخصصان تأییدشده پس از بررسی مدارک در این بخش معرفی می‌شوند. اگر روان‌شناس هستید، می‌توانید برای همکاری ثبت‌نام کنید.
                <Link to="/register?kind=psychologist" className="btn-secondary mt-4 min-h-11 w-fit px-5 text-[14px]">ثبت‌نام به‌عنوان روانشناس</Link>
              </div>
            )}
          </div>

          <div className="card-glass p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 text-xl font-semibold text-ink"><Newspaper className="h-5 w-5 text-steel" />محتوای روان‌شناسی</h3>
              <Link to="/library" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-steel">کتابخانه<ArrowLeft className="h-4 w-4" /></Link>
            </div>
            {articles.length > 0 ? (
              <ul className="space-y-3">
                {articles.map((a) => (
                  <li key={a.id}>
                    <Link to={`/articles/${a.slug}`} className="block rounded-2xl border border-white/80 bg-white/80 p-4 shadow-chip transition-transform hover:-translate-y-0.5">
                      <span className="block text-[15px] font-bold text-ink">{a.title}</span>
                      {a.excerpt && <span className="mt-1 line-clamp-2 block text-[14px] leading-7 text-body">{a.excerpt}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-steel/25 bg-white/60 p-6 text-[15px] leading-8 text-body">
                مقاله‌ها، مجله‌ها و منابع منتشرشده در کتابخانه‌ی آریاسازه گردآوری می‌شوند.
                <Link to="/library" className="btn-secondary mt-4 min-h-11 w-fit px-5 text-[14px]"><BookOpen className="h-4 w-4" />رفتن به کتابخانه</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
