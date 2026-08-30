import type { NextConfig } from "next";

/**
 * `/uploads/*` is served by **nginx straight from disk** in production
 * (`docs/DEPLOY.md`) — same origin as the app, which is what lets
 * `next/image` optimise HomeKrafter photos without a `remotePatterns`
 * allowlist.
 *
 * Nothing serves that path on the Next process itself, in any
 * environment: in dev uploads are served by the API, in production by
 * nginx in front of both. The rewrite below is what makes the path
 * answer on :3000 anyway — and it has to answer there, because the image
 * optimiser fetches a relative `src` from **its own server**, not from
 * the public origin. Until 2026-08-30 the rewrite was dev-only and
 * uploads were rendered `unoptimized` to dodge the resulting 400 (see
 * `ImageSlot`); now it applies in production too, pointed at the public
 * origin, so nginx serves the file to the optimiser exactly as it would
 * to a browser. Public requests never reach it — nginx matches
 * `/uploads/` before proxying to Next.
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
    // Two qualities, not one. The landing page's two hero photographs are
    // grainy kitchen shots that AVIF spends ~290 KB each on at q75; at
    // q50 they read the same under the scrim for about half the bytes.
    // Everything else stays on the default 75 — a product photo is the
    // thing being judged, and the hero is not.
    qualities: [50, 75],
    // A week, up from Next's four-hour default. Neither bundled art nor
    // an upload changes under its name in the ordinary course (an upload
    // is UUID-named; a bundled photo is replaced by a deploy), and at
    // four hours every returning visitor re-fetched every optimised
    // image and the 1-vCPU box re-encoded any it had evicted. Same
    // ceiling as `/videos/`, for the same reason: not `immutable`.
    minimumCacheTTL: 604800,
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
    return [{ source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }];
  },
};

export default nextConfig;
