import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tuur/ui', '@tuur/shared'],
  reactStrictMode: true,
  async headers() {
    // The portals handle sign-in and payments: no framing, no MIME sniffing, strict referrers, locked-down features.
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          // Next.js inlines small bootstrap scripts; Firebase Auth talks to Google endpoints
          "script-src 'self' 'unsafe-inline' https://apis.google.com" +
            (process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "worker-src 'self' blob:",
          "child-src 'self' blob: https://*.firebaseapp.com https://accounts.google.com",
          "connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://api.maptiler.com https://tiles.openfreemap.org http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
          "media-src 'self' blob:",
        ].join('; '),
      },
    ];
    return [
      { source: '/:path*', headers: security },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default config;
