"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_FEATURES, type Features } from "@/lib/features";

/**
 * Feature flags for Client Components (M17).
 *
 * Read **once** by the root layout (a Server Component) and passed down,
 * rather than fetched here. Two reasons, and both are the point of the
 * whole change:
 *
 * 1. **Every reader flips together.** A hook that fetched on mount would
 *    render the held state first and the live one a moment later, which
 *    is the flicker version of the same half-open problem this replaced.
 * 2. The value is already in the server render, so the markup the visitor
 *    first sees is correct — no hydration mismatch, and no request from
 *    the browser at all.
 *
 * The context is plain data, so there is no state and nothing to
 * invalidate: a flag flip reaches visitors on the next render, bounded by
 * `getFeatures`'s 60-second cache.
 */
const FeaturesContext = createContext<Features>(DEFAULT_FEATURES);

export function FeaturesProvider({
  features,
  children,
}: {
  features: Features;
  children: ReactNode;
}) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

/**
 * Falls back to `DEFAULT_FEATURES` (everything held) outside a provider,
 * rather than throwing. A missing provider should not be able to take a
 * page down, and the safe reading of "I don't know" is "not live".
 */
export function useFeatures(): Features {
  return useContext(FeaturesContext);
}
