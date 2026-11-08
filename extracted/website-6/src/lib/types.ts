export type AppRole =
  | "super_admin"
  | "admin"
  | "content_manager"
  | "test_manager"
  | "support_agent"
  | "psychology_reviewer";

export type AccountStatus = "active" | "suspended" | "pending";
export type PublishStatus = "draft" | "in_review" | "published" | "archived";
export type ReviewStatus = "not_required" | "pending" | "approved" | "rejected";
export type VersionStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type MessageStatus = "new" | "in_progress" | "answered" | "closed";
export type MessagePriority = "low" | "normal" | "high" | "urgent";
export type QuestionType = "single_choice" | "multi_choice" | "likert";
export type MediaKind = "image" | "document" | "video" | "audio" | "other";

export type AccountKind = "user" | "psychologist" | "support_specialist";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole | null;
  account_status: AccountStatus;
  /** user | psychologist | support_specialist — پس از migration حساب‌ها؛ پیش از آن undefined */
  account_kind?: AccountKind;
  /** پس از migration 20261109000000؛ پیش از آن undefined */
  username?: string | null;
  phone?: string | null;
  phone_verified_at?: string | null;
  /** null = ثبت‌نام‌شده‌ی تأییدنشده (OTP)؛ undefined = migration اعمال نشده */
  contact_verified_at?: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role: AppRole;
  resource: string;
  action: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: AppRole | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  result: "success" | "failure";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  kind: "test" | "article" | "book" | "magazine";
  sort_order: number;
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  seo_title: string | null;
  social_image_url: string | null;
  status: PublishStatus;
  published_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SiteSection {
  id: string;
  key: string;
  name: string;
  config: Record<string, unknown>;
  draft_config: Record<string, unknown>;
  status: PublishStatus;
  sort_order: number;
  published_at: string | null;
  updated_at: string;
}

export interface TestRow {
  id: string;
  slug: string;
  title_fa: string;
  title_en: string | null;
  short_description: string | null;
  description: string | null;
  cover_url: string | null;
  category_id: string | null;
  duration_minutes: number | null;
  report_type: string | null;
  status: PublishStatus;
  review_status: ReviewStatus;
  sort_order: number;
  language: string;
  version: number;
  scientific_lead: string | null;
  is_free: boolean;
  price_irr: number | null;
  /** فیلدهای کیفیت علمی (پس از اجرای migration داشبورد موجودند) */
  source_reference?: string | null;
  license_info?: string | null;
  review_due_at?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestVersion {
  id: string;
  test_id: string;
  version_label: string;
  status: VersionStatus;
  scoring_rules: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  review_note: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestQuestion {
  id: string;
  version_id: string;
  prompt: string;
  help_text: string | null;
  type: QuestionType;
  is_required: boolean;
  dimension: string | null;
  sort_order: number;
}

export interface TestOption {
  id: string;
  question_id: string;
  label: string;
  value: string | null;
  score: number;
  sort_order: number;
}

export interface TestInterpretation {
  id: string;
  version_id: string;
  dimension: string;
  min_score: number;
  max_score: number;
  label: string;
  description: string;
  sort_order: number;
}

export interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  author_name: string | null;
  category_id: string | null;
  magazine_id: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  tags: string[];
  status: PublishStatus;
  review_status: ReviewStatus;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MagazineRow {
  id: string;
  slug: string;
  title: string;
  issue_number: string | null;
  description: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  pdf_url: string | null;
  publisher: string | null;
  status: PublishStatus;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookRow {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  publisher: string | null;
  published_year: number | null;
  isbn: string | null;
  category_id: string | null;
  status: PublishStatus;
  published_at: string | null;
  resource_url: string | null;
  resource_is_public: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaRow {
  id: string;
  bucket: string;
  storage_path: string;
  public_url: string | null;
  title: string | null;
  alt_text: string | null;
  mime_type: string;
  kind: MediaKind;
  size_bytes: number;
  width: number | null;
  height: number | null;
  is_public: boolean;
  uploaded_by: string | null;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  subject: string;
  body: string;
  category: "general" | "technical" | "account" | "test" | "billing" | "content";
  priority: MessagePriority;
  status: MessageStatus;
  requester_name: string | null;
  requester_email: string;
  requester_id: string | null;
  assigned_to: string | null;
  internal_note: string | null;
  /** ticket = تیکت انسانی · ai = گفت‌وگوی دستیار هوشمند (پس از migration 20261109000000) */
  channel?: "ticket" | "ai";
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportReply {
  id: string;
  message_id: string;
  author_email: string | null;
  body: string;
  is_internal: boolean;
  delivery_status: "not_sent" | "queued" | "sent" | "failed";
  created_at: string;
}

export interface PsychologistRow {
  id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  credentials_summary: string | null;
  verification_status: VerificationStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceSetting {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  secret_name: string | null;
  last_check_at: string | null;
  last_check_status: "ok" | "failed" | "unconfigured" | null;
  last_error: string | null;
  monthly_cap_irr: number | null;
  updated_at: string;
}

export interface SiteSetting {
  key: string;
  value: Record<string, unknown>;
  is_public: boolean;
  updated_at: string;
}

export interface AdminInvite {
  id: string;
  email: string;
  role: AppRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_email: string | null;
  expires_at: string;
  created_at: string;
}

export interface PublicTest {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  report_type: string | null;
  categoryName: string | null;
  cover_url: string | null;
  scientific_lead: string | null;
  published_at: string | null;
}

export const roleLabels: Record<AppRole, string> = {
  super_admin: "مدیر ارشد",
  admin: "مدیر",
  content_manager: "مدیر محتوا",
  test_manager: "مدیر آزمون‌ها",
  support_agent: "پشتیبان",
  psychology_reviewer: "بازبین روان‌شناسی",
};

export const statusLabels: Record<PublishStatus, string> = {
  draft: "پیش‌نویس",
  in_review: "در انتظار بازبینی",
  published: "منتشرشده",
  archived: "آرشیو",
};

export const accountStatusLabels: Record<AccountStatus, string> = {
  active: "فعال",
  suspended: "مسدود",
  pending: "در انتظار تأیید",
};

export const accountKindLabels: Record<AccountKind, string> = {
  user: "کاربر عادی",
  psychologist: "روانشناس",
  support_specialist: "متخصص پشتیبان",
};
