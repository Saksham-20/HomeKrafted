"use client";

import { useEffect, useState } from "react";
import { getPublicSettings, type PublicSettings } from "@/lib/api/settings";

let pending: Promise<PublicSettings | undefined> | null = null;

function readOnce(): Promise<PublicSettings | undefined> {
  if (!pending) {
    pending = getPublicSettings().catch(() => {
      // Forget the failure so the next screen asks again.
      pending = null;
      return undefined;
    });
  }
  return pending;
}

/**
 * The public platform settings (food open, delivery fee) — `undefined`
 * until the server has answered, and after a failed read. Read after
 * mount, never during render (the M12 hydration rule), and once per page
 * load however many components ask.
 */
export function usePublicSettings(): PublicSettings | undefined {
  const [settings, setSettings] = useState<PublicSettings | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void readOnce().then((value) => {
      if (!cancelled) setSettings(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}
