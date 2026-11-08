import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { DashboardSection } from "./components/DashboardSection";
import { MapSection } from "./components/MapSection";
import { TestsSection } from "./components/TestsSection";
import { StepsSection } from "./components/StepsSection";
import { CtaBanner } from "./components/CtaBanner";
import { ExpertsSection } from "./components/ExpertsSection";
import { GallerySection } from "./components/GallerySection";
import { Footer } from "./components/Footer";
import { AuthProvider } from "./lib/auth";
import {
  SiteDataProvider,
  defaultSectionOrder,
  defaultTestimonials,
  useSiteData,
  type SectionOrderItem,
} from "./lib/siteData";
import {
  PublicArticleView,
  PublicArticlesPage,
  PublicBookView,
  PublicBooksPage,
  PublicLibraryPage,
  PublicMagazineView,
  PublicMagazinesPage,
  PublicPageView,
  PublicPsychologistsPage,
} from "./site/PublicContent";
import { NavigationProvider } from "./lib/navigation";
import { ForgotPasswordPage, LoginPage, RegisterPage, RequireAuth, ResetPasswordPage, VerifyPage } from "./site/AuthPages";
import { TestDetailPage, TestResultPage, TestTakePage, TestsIndexPage } from "./site/TestPages";
import { AccountPage, UserDashboardPage } from "./site/UserDashboard";
import { ProApplyPage, ProPanelPage } from "./site/ProPanel";
import { AdminApp } from "./admin/AdminApp";
import { PanelShell, type PanelVariant } from "./panels/PanelShell";
import { SupportHubPage, SupportTicketPage } from "./support/SupportHub";
import { SupportDeskPage } from "./support/SupportDesk";
import type { AccountKind } from "./lib/types";

/** ترتیب سکشن‌ها مطابق طراحی مرجع جدید */
const REFERENCE_ORDER: SectionOrderItem["key"][] = ["hero", "dashboard", "tests", "map", "steps", "cta", "experts", "gallery", "testimonials"];
/** ترتیب seed قدیمی (بدون سفارشی‌سازی مدیر) → به ترتیب مرجع ارتقا می‌یابد؛ ترتیب سفارشی مدیر دست‌نخورده می‌ماند */
const LEGACY_SIGNATURE = "hero,testimonials,cta,tests,steps,gallery,map";

function resolveOrder(order: SectionOrderItem[]): SectionOrderItem[] {
  const base = order.length ? order : defaultSectionOrder;
  const enabled = new Map(base.map((s) => [s.key, s.enabled]));
  if (base.map((s) => s.key).join(",") === LEGACY_SIGNATURE) {
    return REFERENCE_ORDER.map((key) => ({ key, enabled: enabled.get(key) ?? true }));
  }
  const out = [...base];
  if (!enabled.has("dashboard")) out.splice(Math.max(0, out.findIndex((s) => s.key === "hero")) + 1, 0, { key: "dashboard", enabled: true });
  if (!enabled.has("experts")) {
    const at = out.findIndex((s) => s.key === "gallery");
    out.splice(at < 0 ? out.length : at, 0, { key: "experts", enabled: true });
  }
  return out;
}

function PublicHome() {
  const { hero, cta, tests, testsSource, testsHeading, stepsHeading, testimonials, gallery, sectionOrder } = useSiteData();

  const sections = resolveOrder(sectionOrder)
    .filter((s) => s.enabled)
    .map((s) => {
      switch (s.key) {
        case "hero":
          return <Hero key="hero" content={hero} />;
        case "dashboard":
          return <DashboardSection key="dashboard" />;
        case "cta":
          return <CtaBanner key="cta" content={cta} />;
        case "tests":
          return <TestsSection key="tests" items={tests} source={testsSource} heading={testsHeading} />;
        case "map":
          return <MapSection key="map" />;
        case "steps":
          return <StepsSection key="steps" heading={stepsHeading} />;
        case "experts":
          return <ExpertsSection key="experts" />;
        case "testimonials":
          // نمونه‌های پیش‌فرض (placeholder) نمایش داده نمی‌شوند؛ فقط محتوایی که مدیر ثبت کرده
          return testimonials === defaultTestimonials ? null : (
            <GallerySection key="testimonials" items={testimonials} title="شناخت بهتر خود" description="داستان‌های ساده و شخصی از رشد و تعادل." />
          );
        case "gallery":
          return <GallerySection key="gallery" items={gallery} title="بهتر شناخت خود، آغاز تغییر است" description="این بخش کاملاً از پنل مدیریت قابل حذف، ویرایش و افزودن است." />;
        default:
          return null;
      }
    });

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-clip bg-cream font-sans text-ink">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute right-[-10%] top-[30%] h-[30rem] w-[30rem] rounded-full bg-steel/[0.07] blur-3xl" />
          <div className="absolute bottom-[10%] left-[-10%] h-[26rem] w-[26rem] rounded-full bg-lav/[0.08] blur-3xl" />
        </div>
        <Header />
        <main>{sections}</main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      <Header />
      <main className={`mx-auto px-5 pb-24 pt-28 md:pt-32 ${wide ? "max-w-[80rem]" : "max-w-4xl"}`}>{children}</main>
      <Footer />
    </div>
  );
}

/** قالب صفحات حساب (ورود/ثبت‌نام/OTP/بازیابی): آرام و بدون فوتر سنگین */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream via-haze/60 to-cream-alt font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-32 md:pt-40">{children}</main>
    </div>
  );
}

/** قالب پنل‌ها (کاربر / روانشناس / متخصص پشتیبان) با محافظ ورود و نوع حساب */
function Panel({ children, variant = "auto", kinds }: { children: ReactNode; variant?: PanelVariant | "auto"; kinds?: AccountKind[] }) {
  return (
    <RequireAuth kinds={kinds}>
      <PanelShell variant={variant}>{children}</PanelShell>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SiteDataProvider>
        <NavigationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<PublicHome />} />

              {/* حساب‌ها */}
              <Route path="/login" element={<AuthShell><LoginPage /></AuthShell>} />
              <Route path="/register" element={<AuthShell><RegisterPage /></AuthShell>} />
              <Route path="/verify" element={<AuthShell><VerifyPage /></AuthShell>} />
              <Route path="/forgot-password" element={<AuthShell><ForgotPasswordPage /></AuthShell>} />
              <Route path="/reset-password" element={<AuthShell><ResetPasswordPage /></AuthShell>} />

              {/* پنل‌ها */}
              <Route path="/account" element={<Panel><UserDashboardPage /></Panel>} />
              <Route path="/account/profile" element={<Panel><AccountPage /></Panel>} />
              <Route path="/dashboard" element={<Navigate to="/account" replace />} />
              <Route path="/pro" element={<Panel><ProPanelPage /></Panel>} />
              <Route path="/pro/apply" element={<Panel><ProApplyPage /></Panel>} />
              <Route path="/desk" element={<Panel variant="desk" kinds={["support_specialist"]}><SupportDeskPage /></Panel>} />

              {/* پشتیبانی: دستیار هوشمند + تیکت‌های دوطرفه */}
              <Route path="/support" element={<Panel><SupportHubPage /></Panel>} />
              <Route path="/support/:id" element={<Panel><SupportTicketPage /></Panel>} />

              {/* آزمون‌ها: فهرست → جزئیات → اجرا → نتیجه (قالب مشترک) */}
              <Route path="/tests" element={<PublicShell wide><TestsIndexPage /></PublicShell>} />
              <Route path="/tests/:slug" element={<PublicShell wide><TestDetailPage /></PublicShell>} />
              <Route path="/tests/:slug/take" element={<PublicShell><RequireAuth><TestTakePage /></RequireAuth></PublicShell>} />
              <Route path="/tests/:slug/result/:attemptId" element={<PublicShell><RequireAuth><TestResultPage /></RequireAuth></PublicShell>} />

              {/* کتابخانه و جزئیات */}
              <Route path="/library" element={<PublicShell wide><PublicLibraryPage /></PublicShell>} />
              <Route path="/books/:slug" element={<PublicShell><PublicBookView /></PublicShell>} />
              <Route path="/magazines/:slug" element={<PublicShell><PublicMagazineView /></PublicShell>} />
              <Route path="/articles" element={<PublicShell><PublicArticlesPage /></PublicShell>} />
              <Route path="/articles/:slug" element={<PublicShell><PublicArticleView /></PublicShell>} />
              <Route path="/magazines" element={<PublicShell><PublicMagazinesPage /></PublicShell>} />
              <Route path="/books" element={<PublicShell><PublicBooksPage /></PublicShell>} />
              <Route path="/psychologists" element={<PublicShell><PublicPsychologistsPage /></PublicShell>} />
              <Route path="/p/:slug" element={<PublicShell><PublicPageView /></PublicShell>} />

              {/* مدیریت: مسیر در ناوبری عمومی نیست و دسترسی با نقش سمت سرور (RLS/RPC) کنترل می‌شود */}
              <Route path="/admin/*" element={<AdminApp />} />
              <Route
                path="*"
                element={
                  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-5 text-center">
                    <p className="text-sm font-bold text-body">صفحه یافت نشد</p>
                    <a href="/" className="btn-primary min-h-11 text-[13px]">بازگشت به خانه</a>
                  </div>
                }
              />
            </Routes>
          </BrowserRouter>
        </NavigationProvider>
      </SiteDataProvider>
    </AuthProvider>
  );
}
