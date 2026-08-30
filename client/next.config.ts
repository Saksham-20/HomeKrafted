import type { NextConfig } from "next";

/**
 * `/uploads/*` is served by **nginx straight from disk** in production
 * (`docs/DEPLOY.md`) — same origin as the app, which is what lets
 * `next/image` optimise HomeKrafter photos without a `remotePatterns`
 * allowlist.
 *
 * In local development nothing serves that path on :3000: uploads land
 * wherever `server/` writes them and are served by the API. Without this
 * rewrite an uploaded photo 404s in dev and renders in production, which
 * is the worst way round for a bug to behave. Proxying in dev only keeps
 * the URL a photo is stored under identical in both.
 */
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
  /\/api\/v1\/?$/,
  "",
);

const nextConfig: NextConfig = {
  images: {
    // AVIF first, WebP as the fallback. A product photo straight off a
    // HomeKrafter's phone is the heaviest thing this site ships, and the
    // point of M16's H7 is that a 4 MB kitchen photo stops being sent
    // whole to a 360px screen.
    formats: ["image/avif", "image/webp"],
    // Uploads and bundled assets are both same-origin paths, so nothing
    // needs allowlisting. Adding an entry here later means deciding which
    // hosts we trust to serve images into our own pages — don't widen it
    // to `**` to make a CDN work.
    remotePatterns: [],
  },

  /**
   * Reel footage lives under `public/videos/` (M52). Next serves `public/`
   * with `Cache-Control: public, max-age=0` — every visit revalidates a
   * multi-megabyte MP4 — so the rail's previews are given a week. Not
   * `immutable`: the filenames are not content-hashed, so a re-shot clip
   * under the same name has to be able to replace itself, and a week is
   * the ceiling on how stale it can be. Byte-range requests pass through
   * untouched; this only adds the cache header.
   */
  async headers() {
    return [
      {
        source: "/videos/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },

  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }];
  },
};

export default nextConfig;
