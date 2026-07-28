/**
 * Build-time feature flags for surfaces that exist in code but aren't
 * live yet. Flipping one of these back to `true` is the whole re-launch —
 * nothing is deleted, so a held feature can't rot into an unbuildable
 * branch of the tree.
 *
 * Consumed by both server and client components, so keep this module free
 * of imports and side effects.
 */
export const FEATURES = {
  /**
   * The hamper builder (`/hamper`, `components/hamper/*`). Held pre-launch:
   * `/hamper` renders `<HamperComingSoon>` instead of the wizard, and every
   * entry point into it (Home hero CTA, the home promo band, product
   * detail's "add to a gift hamper", the empty cart) either points at the
   * coming-soon page or hides its control. The wizard itself is complete
   * (M3) and untouched — flip this to `true` to put it back.
   */
  hamperBuilder: false,
} as const;

/** True once the hamper builder is live — see `FEATURES.hamperBuilder`. */
export const isHamperBuilderLive = (): boolean => FEATURES.hamperBuilder;
