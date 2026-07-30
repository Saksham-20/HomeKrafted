"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { areaById, nearestArea, TRICITY_AREAS, type Coords, type TricityArea } from "@/lib/geo";

const STORAGE_KEY = "hk_location_v1";

/**
 * Cookie mirror of the stored coordinates.
 *
 * `/shop` and `/snacks` are Server Components — they fetch the catalogue
 * during the server render, where `localStorage` doesn't exist. Without a
 * cookie the buyer's location could never reach the query, so those pages
 * would always render the unfiltered catalogue no matter what area was
 * picked. Same technique `hk_role` already uses for `middleware.ts`.
 *
 * Coordinates only, and area-centroid precision at that — never a precise
 * address. Not httpOnly because the client owns this value; it isn't a
 * security boundary, just a hint the server render can read.
 */
const LOCATION_COOKIE = "hk_loc";
const LOCATION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/**
 * How we came to know where the buyer is. Worth distinguishing because a
 * GPS fix and a hand-picked sector deserve different copy ("Using your
 * location" vs "Delivering to Sector 35").
 */
export type LocationSource = "gps" | "area" | "none";

interface StoredLocation {
  source: LocationSource;
  areaId?: string;
  lat?: number;
  lng?: number;
  /** Set once the user has answered the prompt either way, so we stop asking. */
  asked: boolean;
}

export interface LocationValue {
  /** Buyer coordinates, or undefined when we genuinely don't know. */
  coords?: Coords;
  /** The area we're showing as their location, when there is one. */
  area?: TricityArea;
  source: LocationSource;
  /** True once hydration has run — until then, don't render location-dependent UI. */
  ready: boolean;
  /** Have we already asked this browser? Drives whether the opening prompt shows. */
  asked: boolean;
  /** Browser permission request is in flight. */
  locating: boolean;
  /** Set when the browser refused or failed, for inline copy. */
  error?: string;
  /** Ask the browser for a GPS fix. Resolves either way — never throws at the caller. */
  requestBrowserLocation: () => Promise<boolean>;
  /** Pick a tricity area by hand — the fallback when permission is denied. */
  setArea: (areaId: string) => void;
  /** Dismiss the prompt without choosing. Browsing continues unfiltered. */
  dismiss: () => void;
  /** Forget the stored location (the "change area" affordance). */
  clear: () => void;
  areas: TricityArea[];
}

const LocationContext = createContext<LocationValue | undefined>(undefined);

function readStored(): StoredLocation | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredLocation) : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(value: StoredLocation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled — the session still works, it just
    // won't be remembered on the next visit.
  }
  writeLocationCookie(value);
}

/** Mirrors coordinates into `hk_loc` so the server render can filter too. */
function writeLocationCookie(value: StoredLocation) {
  if (typeof document === "undefined") return;
  if (value.lat === undefined || value.lng === undefined) {
    document.cookie = `${LOCATION_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    return;
  }
  const payload = encodeURIComponent(`${value.lat},${value.lng}`);
  document.cookie = `${LOCATION_COOKIE}=${payload}; Max-Age=${LOCATION_COOKIE_MAX_AGE_S}; path=/; SameSite=Lax`;
}

/**
 * Where the buyer is, and therefore which kitchens can reach them.
 *
 * Two ways in, deliberately: the browser location prompt, and a manual
 * tricity area picker. The picker is not a consolation prize — most people
 * decline a location prompt on a site they've just met, and a buyer who
 * declines must still be able to shop. So **nothing is ever gated on
 * having a location**: with no location we send no coordinates, the API
 * returns the full catalogue, and the UI says so.
 *
 * Persisted to `localStorage` so a returning visitor isn't asked again.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredLocation | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Deferred a tick so this isn't a synchronous setState in an effect
    // body (`react-hooks/set-state-in-effect`) — the same technique
    // `WalletContext` uses for its own hydration.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setStored(readStored() ?? { source: "none", asked: false });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: StoredLocation) => {
    setStored(next);
    writeStored(next);
  }, []);

  const requestBrowserLocation = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't share your location. Pick your area instead.");
      persist({ source: "none", asked: true });
      return false;
    }
    setLocating(true);
    setError(undefined);
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Label the raw fix with the nearest known area so the header can
          // say a place name rather than a pair of decimals.
          const near = nearestArea(coords);
          persist({ source: "gps", lat: coords.lat, lng: coords.lng, areaId: near.id, asked: true });
          setLocating(false);
          resolve(true);
        },
        () => {
          // Denied, unavailable or timed out — all the same to us: fall
          // through to the manual picker rather than dead-ending.
          setError("We couldn't get your location. Pick your area instead.");
          persist({ source: "none", asked: true });
          setLocating(false);
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }, [persist]);

  const setArea = useCallback(
    (areaId: string) => {
      const area = areaById(areaId);
      if (!area) return;
      setError(undefined);
      persist({ source: "area", areaId: area.id, lat: area.lat, lng: area.lng, asked: true });
    },
    [persist],
  );

  const dismiss = useCallback(() => {
    persist({ ...(stored ?? { source: "none" }), source: stored?.source ?? "none", asked: true });
  }, [persist, stored]);

  const clear = useCallback(() => {
    setError(undefined);
    persist({ source: "none", asked: false });
  }, [persist]);

  const value = useMemo<LocationValue>(() => {
    const coords =
      stored?.lat !== undefined && stored?.lng !== undefined
        ? { lat: stored.lat, lng: stored.lng }
        : undefined;
    return {
      coords,
      area: stored?.areaId ? areaById(stored.areaId) : undefined,
      source: stored?.source ?? "none",
      ready,
      asked: stored?.asked ?? false,
      locating,
      error,
      requestBrowserLocation,
      setArea,
      dismiss,
      clear,
      areas: TRICITY_AREAS,
    };
  }, [stored, ready, locating, error, requestBrowserLocation, setArea, dismiss, clear]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}
