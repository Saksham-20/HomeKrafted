"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import { SPECIALTY_LABELS, type Seller } from "@/lib/types";
import { SellerVerificationPanel } from "./SellerVerificationPanel";
import { SellerSignInDetails } from "./SellerSignInDetails";
import styles from "./ApplicationRow.module.css";

export interface SellerRowProps {
  seller: Seller;
  onToggleStatus: (sellerId: string, nextStatus: "approved" | "suspended") => void;
}

/**
 * `/admin/sellers` row — displayName, specialties, status, rating (if
 * any), suspend/reactivate, and (M16) the verification decision behind a
 * disclosure. Collapsed by default: verification is a deliberate act on
 * one kitchen, not something to skim past on every row, and the panel
 * only fetches that seller's profile once it is opened.
 */
export function SellerRow({ seller, onToggleStatus }: SellerRowProps) {
  const suspended = seller.status === "suspended";
  const [verifying, setVerifying] = useState(false);
  const [signIn, setSignIn] = useState(false);
  // Two ways of not having arrived yet, and they need different work
  // (M32). `awaiting` — details were issued and nobody has used them, so
  // somebody owes a phone call. `no_credentials` — no password exists at
  // all, so there is nothing to read out: every HomeKrafter approved
  // before M32 sits here, and until an admin issues details they cannot
  // sign in by any route the panel offers.
  const awaiting = seller.signIn?.status === "awaiting";
  const noCredentials = seller.signIn?.status === "no_credentials";
  const pending = awaiting || noCredentials;
  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{seller.displayName}</span>
        <span className={styles.meta}>
          {seller.specialties.map((sp) => SPECIALTY_LABELS[sp]).join(" · ") || "HomeKrafter"} ·
          Since {formatDate(seller.createdAt)}
          {seller.rating ? ` · ★ ${seller.rating.toFixed(1)} (${seller.reviewCount ?? 0})` : ""}
        </span>
      </div>
      <span className={styles.badges}>
        {awaiting && <span className={styles.awaitingPill}>Not signed in yet</span>}
        {noCredentials && <span className={styles.awaitingPill}>No sign-in yet</span>}
        <StatusPill status={seller.status} />
      </span>
      <span className={styles.actions}>
        <Button
          variant="ghost-gold"
          size="sm"
          onClick={() => setVerifying((open) => !open)}
          aria-expanded={verifying}
        >
          {verifying ? "Close" : "Verify"}
        </Button>
        {/* Only while they have not arrived. Once a HomeKrafter has
            signed in and chosen their own password the control disappears
            from the row entirely: an admin has no business minting a
            credential for an account whose owner is already using it, and
            a button that is almost never the right thing to press is one
            somebody eventually presses. A genuinely locked-out kitchen
            goes through "Resend invite", which sends a link to them
            rather than handing a password to whoever is at the screen.
            The endpoint also refuses a suspended account. */}
        {!suspended && pending && (
          <Button
            variant="ghost-gold"
            size="sm"
            onClick={() => setSignIn((open) => !open)}
            aria-expanded={signIn}
          >
            {signIn ? "Close" : "Sign-in details"}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleStatus(seller.id, suspended ? "approved" : "suspended")}
        >
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </span>
      {verifying && <SellerVerificationPanel sellerId={seller.id} />}
      {signIn && !suspended && pending && seller.signIn && (
        <SellerSignInDetails sellerId={seller.id} signIn={seller.signIn} />
      )}
    </Card>
  );
}
