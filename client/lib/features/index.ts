/**
 * Feature flags for surfaces that exist in code but aren't live yet.
 * Nothing is deleted, so a held feature can't rot into an unbuildable
 * branch of the tree.
 *
 * **These are runtime values as of M17, not build-time constants.** They
 * come from `GET /settings/public` and an admin flips them on
 * `/admin/settings`. The reason that took a second pass: a database flag
 * on its own would have opened the `/hamper` route the moment it was
 * saved while four client components carried on rendering "coming soon"
 * until the next deploy — a half-open feature is worse than a closed one.
 * What makes it safe is that every reader now resolves the same value:
 *
 * - **Server Components** `await getFeatures()` (`lib/features/server.ts`).
 * - **Client Components** call `useFeatures()`
 *   (`lib/features/FeaturesContext.tsx`), fed once from the root layout.
 *
 * Keep this module free of imports and side effects — both sides load it.
 */

export interface Features {
  /**
   * The hamper builder (`/hamper`, `components/hamper/*`). While off,
   * `/hamper` renders `<HamperComingSoon>` instead of the wizard and
   * every entry point into it (Home hero CTA, product detail's "add to a
   * gift hamper", the empty cart) either points at the coming-soon page
   * or hides its control. The wizard itself is complete (M3) and
   * untouched.
   */
  hamperBuilder: boolean;
}

/**
 * What every reader falls back to.
 *
 * **The closed value, deliberately.** This is what renders when the
 * settings endpoint is unreachable, so a held feature stays held during
 * an outage rather than announcing itself. A flag that fails open is a
 * flag that ships itself at the worst possible moment.
 */
export const DEFAULT_FEATURES: Features = {
  hamperBuilder: false,
};
