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

/**
 * The build's version, for "Report a problem" (which build was the person on?): the deploy's commit and the build
 * time, e.g. "c8c9b32-202611241530". Railway passes the commit as RAILWAY_GIT_COMMIT_SHA; locally it is read from git.
 * Fixed at build time, so the browser and the server of one build report the same value.
 */
function buildVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION.slice(0, 60);
  let sha = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || "").trim().slice(0, 7);
  if (!sha) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sha = String(require("node:child_process").execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 })).trim();
    } catch {
      sha = "";
    }
  }
  const at = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${/^[0-9a-f]{7}$/i.test(sha) ? sha : "unknown"}-${at}`;
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion() },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // A config header replaces the route's own, so the uploaded-photo and workspace-logo routes and the Client Projects file
      // downloads (which set a stricter sandboxing CSP that already includes frame-ancestors) are left out here.
      {
        source: "/:path((?!api/profile/avatar/image|api/tenant/logo/image|api/board/[^/]+/file/|api/client-projects/[^/]+/intake/file/|api/client-projects/[^/]+/tasks/[^/]+/attachments|api/tickets/[^/]+/attachments/).*)",
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
