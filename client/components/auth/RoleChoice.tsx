"use client";

import clsx from "clsx";
import { ShoppingBag, Store } from "lucide-react";
import styles from "./RoleChoice.module.css";

export type AuthRole = "shopper" | "seller";

export interface RoleChoiceProps {
  value: AuthRole;
  onChange: (role: AuthRole) => void;
  className?: string;
}

/**
 * Shared upfront "I'm a shopper / I'm a seller" choice for `/login` and
 * `/signup` (M8.5 — see the plan's "Auth UX + seller dual-mode" section).
 * Deliberately just two options — admin is internal-only, provisioned
 * out-of-band, never offered in this public chooser (`/admin/login`
 * stays a separate, unlinked entry point).
 */
export function RoleChoice({ value, onChange, className }: RoleChoiceProps) {
  return (
    <div className={clsx(styles.choice, className)} role="tablist" aria-label="I am a…">
      <button
        type="button"
        role="tab"
        aria-selected={value === "shopper"}
        className={clsx(styles.option, value === "shopper" && styles.optionActive)}
        onClick={() => onChange("shopper")}
      >
        <ShoppingBag size={19} strokeWidth={1.7} />
        <span>I&rsquo;m a shopper</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "seller"}
        className={clsx(styles.option, value === "seller" && styles.optionActive)}
        onClick={() => onChange("seller")}
      >
        <Store size={19} strokeWidth={1.7} />
        <span>I&rsquo;m a seller</span>
      </button>
    </div>
  );
}
