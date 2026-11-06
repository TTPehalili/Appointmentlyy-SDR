import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
