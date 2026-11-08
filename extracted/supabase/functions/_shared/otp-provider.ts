// لایه‌ی انتزاعی ارسال OTP. برای افزودن پیامک واقعی فقط یک provider جدید ثبت کنید؛
// منطق ثبت‌نام/تأیید (auth-gateway) تغییری نمی‌کند.
import { isDevelopment } from "./common.ts";

export interface OtpMessage {
  destination: string; // شماره‌ی موبایل نرمال‌شده (09xxxxxxxxx)
  code: string;
  purpose: "registration";
  ttlSeconds: number;
}

export interface OtpProvider {
  readonly name: string;
  send(message: OtpMessage): Promise<void>;
}

export class OtpProviderError extends Error {
  constructor(message = "provider_not_configured") {
    super(message);
    this.name = "OtpProviderError";
  }
}

const mask = (phone: string) => (phone.length >= 7 ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : "***");

/** فقط توسعه: کد را در ترمینال همین Edge Function (خروجی supabase functions serve) چاپ می‌کند */
class ConsoleDevProvider implements OtpProvider {
  readonly name = "console-dev";
  async send(m: OtpMessage): Promise<void> {
    console.log(`\n[DEV-OTP] ${m.purpose} → ${mask(m.destination)} | کد: ${m.code} | اعتبار: ${m.ttlSeconds} ثانیه\n`);
  }
}

/**
 * انتخاب provider با متغیر OTP_PROVIDER.
 *  - console (پیش‌فرض): فقط اگر APP_ENV=development؛ در production «بسته» عمل می‌کند و هیچ کدی چاپ نمی‌شود.
 *  - برای پیامک واقعی (مثلاً کاوه‌نگار / sms.ir) یک کلاس OtpProvider بنویسید و اینجا ثبت کنید.
 */
export function resolveOtpProvider(): OtpProvider {
  const wanted = (Deno.env.get("OTP_PROVIDER") ?? "console").toLowerCase();
  if (wanted === "console") {
    if (!isDevelopment()) throw new OtpProviderError();
    return new ConsoleDevProvider();
  }
  throw new OtpProviderError();
}
