/** Result of the public `invitePreview` function (no personal data). */
export interface InvitePreview {
  valid: boolean;
  tourTitle?: string;
  placeName?: string;
}

/**
 * Base URL of the HTTP functions. `FUNCTIONS_BASE_URL` (server env, required for releases) wins; otherwise the
 * emulator or the default Cloud Functions URL of the project/region is used.
 */
function functionsBaseUrl(): string {
  const explicit = process.env['FUNCTIONS_BASE_URL'];
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '');
  const projectId = process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] || 'tuur-prod';
  const region = process.env['NEXT_PUBLIC_FUNCTIONS_REGION'] || 'europe-west1';
  if (process.env['NEXT_PUBLIC_USE_EMULATORS'] === 'true') {
    const host = process.env['NEXT_PUBLIC_EMULATOR_HOST'] || '127.0.0.1';
    return `http://${host}:5001/${projectId}/${region}`;
  }
  return `https://${region}-${projectId}.cloudfunctions.net`;
}

/**
 * Server-side lookup for the invite landing page. Malformed tokens are rejected without a request (same bounds as
 * the server). If the backend cannot be reached the page falls back to the generic "get the app" copy: the app
 * validates the invite again when it is redeemed.
 */
export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  if (token.length < 16 || token.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(token)) return { valid: false };
  try {
    const res = await fetch(`${functionsBaseUrl()}/invitePreview?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { valid: true };
    const body = (await res.json()) as Partial<InvitePreview>;
    return {
      valid: body.valid === true,
      ...(typeof body.tourTitle === 'string' && body.tourTitle ? { tourTitle: body.tourTitle } : {}),
      ...(typeof body.placeName === 'string' && body.placeName ? { placeName: body.placeName } : {}),
    };
  } catch {
    return { valid: true };
  }
}
