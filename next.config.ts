import type { NextConfig } from "next";

/**
 * Baseline security headers on every response (pages, API, static files). No full CSP yet (that
 * comes report-only first). Nothing embeds our own pages in a frame (the Calendly and email-preview
 * frames load other origins or srcdoc), so framing is denied outright. The microphone stays allowed
 * for our own origin: AI practice and demo calls use it.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  // HTTPS only, so production only (local http servers would ignore it anyway).
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // A config header replaces the route's own, so the uploaded-photo route (which sets a stricter
      // sandboxing CSP that already includes frame-ancestors) is left out here.
      {
        source: "/:path((?!api/profile/avatar/image).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
      // Agreements signer pages and APIs: private links, never indexed, never leaked in a Referer.
      // Client Projects shared board (/b, /api/board): the same private-link treatment.
      ...["/s/:path*", "/api/sign/:path*", "/b/:path*", "/api/board/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
    ];
  },
  /**
   * Redesign Phase 2: old URLs resolve to the new IA (query strings are preserved).
   * Temporary (307) for now so bookmarks keep working while the IA settles.
   */
  async redirects() {
    const moved: [string, string][] = [
      ['/cockpit', '/dialer'],
      ['/icp-builder', '/lead-finder'],
      ['/email', '/outreach/email'],
      ['/linkedin', '/outreach/linkedin'],
      ['/outreach', '/outreach/email'],
      ['/sparring', '/practice'],
      ['/sparring/:path*', '/practice/:path*'],
      ['/analytics', '/reports'],
      ['/monitoring', '/live-floor'],
      ['/guide', '/help'],
      // Phase 3: management tools moved into Admin and the Platform Console.
      ['/workflows', '/admin/workflows'],
      ['/settings/domains', '/admin/domains'],
      ['/tickets', '/admin/support'],
      ['/assistant', '/platform/ops-intel'],
    ];
    return moved.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
