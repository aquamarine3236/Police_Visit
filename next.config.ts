import type { NextConfig } from "next";

// ─── HTTP security headers (§12.9) ──────────────────────────────────────────
// Applied to every route. The Content-Security-Policy whitelists Supabase REST
// + realtime WebSocket endpoints and Google Fonts so authentication, realtime
// subscriptions and web fonts continue to work. 'unsafe-inline'/'unsafe-eval'
// are required by the Next.js runtime and are intentionally retained.

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]
  .join('; ')
  .concat(';');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  // Keep document-generation libraries out of the webpack bundle. pdfmake (via
  // its `linebreak` dependency) reads a binary `data.trie` asset with
  // `fs.readFileSync` at import time; webpack bundles the JS into
  // `vendor-chunks` but does NOT copy that asset, so the runtime read fails
  // with `ENOENT ... data.trie`. Marking these as server externals makes
  // Next.js `require()` them directly from `node_modules`, where the asset sits
  // next to the code. `docx`/`exceljs` are included for the same robustness.
  serverExternalPackages: ['pdfmake', 'docx', 'exceljs'],
  // The PDF route reads the bundled Tinos TTF files from `public/fonts` at
  // runtime via `fs` (pdfmake). Next.js cannot statically detect these dynamic
  // reads, so on serverless targets (Vercel) the files would be missing from
  // the traced function bundle. Explicitly include them for the PDF route.
  outputFileTracingIncludes: {
    '/api/v1/admin/registrations/[id]/pdf': ['./public/fonts/*.ttf'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
