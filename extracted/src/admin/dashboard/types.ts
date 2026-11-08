/** خروجی توابع تجمیعی پایگاه داده (فقط آمار؛ بدون داده‌ی شخصی یا پاسخ‌های آزمون) */
export interface Overview {
  users_total?: number;
  users_new?: number;
  users_new_prev?: number;
  users_active?: number;
  users_active_prev?: number;
  attempts_started?: number;
  attempts_started_prev?: number;
  attempts_completed?: number;
  attempts_completed_prev?: number;
  attempts_total?: number;
  psychologists_active?: number;
}

export interface GrowthPoint {
  day: string;
  signups: number;
  active: number;
}

export interface TestActivity {
  series: Array<{ day: string; started: number; completed: number }>;
  popular: Array<{ test_id: string; title: string; attempts: number; completed: number }>;
  abandonment: Array<{ test_id: string; title: string; started: number; completed: number }>;
  total_started: number;
}

export interface QualityRow {
  test_id: string;
  slug: string;
  title: string;
  status: string;
  review_status: "not_required" | "pending" | "approved" | "rejected";
  scientific_lead: string | null;
  source_reference: string | null;
  license_info: string | null;
  review_due_at: string | null;
  last_review_at: string | null;
  version_label: string | null;
  reviewer_name: string | null;
}
