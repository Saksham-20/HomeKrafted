import { Lock } from "lucide-react";
import styles from "./ModuleUnavailable.module.css";

/**
 * Shown when a HomeKrafter opens a module their account isn't set up for.
 *
 * The portal nav lists every module for every HomeKrafter
 * (`SellerShell`'s `HOMEKRAFTER_NAV`), but `server/src/seller/*` still
 * scopes each module to the acting seller's `Seller.type` — a maker gets
 * `403 FORBIDDEN` on `/seller/menu`, `/seller/bookings` and
 * `/seller/snack-orders`; a laundry partner gets the same on
 * `/seller/listings`, `/seller/reviews` and `/seller/storefront`. Without
 * this, those screens hang on their loading spinner forever, because the
 * rejected fetch never flips `loading` to false.
 *
 * So: a `403` is a *product* state ("not part of your account yet"), not
 * an error to shout about. Every other status still surfaces as a real
 * failure.
 */
export function ModuleUnavailable({ module }: { module: string }) {
  return (
    <div className={styles.card}>
      <span className={styles.icon}>
        <Lock size={18} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h2 className={styles.title}>{module} isn&rsquo;t set up for your account</h2>
      <p className={styles.copy}>
        Your HomeKrafter account doesn&rsquo;t include {module.toLowerCase()} yet. If you&rsquo;d
        like to add it, get in touch and we&rsquo;ll enable it for you.
      </p>
    </div>
  );
}

/** True when an unknown thrown value is an `ApiError`-shaped `403` — the "module not enabled for this account" signal above. */
export function isForbidden(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 403
  );
}
