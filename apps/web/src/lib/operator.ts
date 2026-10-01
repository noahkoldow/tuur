import type { OperatorInfo } from '@tuur/shared';

/** Server-only environment read; empty values count as missing so the legal texts show the marker. */
const env = (name: string): string | undefined => {
  const v = process.env[`OPERATOR_${name}`] ?? process.env[`NEXT_PUBLIC_OPERATOR_${name}`];
  return v && v.trim() ? v.trim() : undefined;
};

/**
 * Operator (controller) details for imprint, privacy policy and terms on the website. Read from `OPERATOR_*`
 * (checked by scripts/check-release.mjs), with `NEXT_PUBLIC_OPERATOR_*` as fallback; mirrors the app's
 * `EXPO_PUBLIC_OPERATOR_*` config. Only call this in server components (values are read at request time).
 */
export function operatorFromEnv(): OperatorInfo {
  const webBaseUrl = process.env['WEB_BASE_URL'] ?? process.env['NEXT_PUBLIC_WEB_BASE_URL'];
  return {
    name: env('NAME'),
    address: env('ADDRESS'),
    email: env('EMAIL'),
    phone: env('PHONE'),
    register: env('REGISTER'),
    vatId: env('VAT_ID'),
    representative: env('REPRESENTATIVE'),
    privacyEmail: env('PRIVACY_EMAIL'),
    authority: env('SUPERVISORY_AUTHORITY'),
    webBaseUrl: webBaseUrl && webBaseUrl.trim() ? webBaseUrl.trim() : undefined,
  };
}
