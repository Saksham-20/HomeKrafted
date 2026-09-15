"use client";

import { usePublicSettings } from "@/components/settings/usePublicSettings";

/**
 * Whether food can be bought right now — `undefined` until the server has
 * answered, and after a failed read. Callers treat `undefined` as "don't
 * know": they keep the ordinary button and show no banner, because the
 * server refuses a food order on its own either way.
 */
export function useFoodOrdersOpen(): boolean | undefined {
  return usePublicSettings()?.foodOrdersOpen;
}
