"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { ChipRow, Fieldset } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import type { ProductTag } from "@/lib/types";
import styles from "./MerchandisingSection.module.css";

/** The section's anchor and jump-nav label, shared by the admin create and edit screens so the two cannot list different anchors. */
export const MERCHANDISING_SECTION = { id: "listing-merchandising", label: "Merchandising" } as const;

const BADGES: ProductTag[] = ["Bestseller", "New", "Festive", "Curated"];

export interface MerchandisingSectionProps {
  tags: ProductTag[];
  onChange: (tags: ProductTag[]) => void;
  /**
   * The listing's place in the featured list, on the **edit** screen only —
   * a listing that does not exist yet cannot be in it. Read-only here:
   * putting a listing in the list and ordering it is one decision about
   * the whole list, made on the Featured screen, not a field of one
   * listing.
   */
  featured?: { featured: boolean; rank?: number | null };
}

/**
 * The admin-only "Merchandising" section of a listing (owner, 2026-09-19).
 *
 * Bestseller / New / Festive / Curated are badges on a listing's card. A
 * badge is the platform vouching for a listing, so **only an admin sets
 * one** — the HomeKrafter's form no longer shows them, and the server
 * ignores `tags` from a HomeKrafter whatever a client sends
 * (`server/src/seller/listing-tags.ts`).
 *
 * Bound to the same `values.tags` the long form carries, so the write
 * path is the ordinary `PATCH`/`POST /admin/catalog/products` and nothing
 * new is needed to save it.
 *
 * Deliberately **not** in `ListingForm` behind a prop: a flag on the
 * shared form is one wrong call site away from showing a HomeKrafter a
 * control that does nothing, and the form is composed by both portals.
 */
export function MerchandisingSection({ tags, onChange, featured }: MerchandisingSectionProps) {
  function toggle(tag: ProductTag) {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  }

  return (
    <FormSection
      id={MERCHANDISING_SECTION.id}
      title="Merchandising"
      description="Badges on this listing’s card. Only Homekrafted can set them — the HomeKrafter never sees these."
    >
      <Fieldset
        legend="Badges"
        optional
        hint="“New” only shows while the listing is under 30 days old; the others show for as long as they are ticked."
      >
        <ChipRow>
          {BADGES.map((tag) => (
            <Chip key={tag} label={tag} selected={tags.includes(tag)} onClick={() => toggle(tag)} />
          ))}
        </ChipRow>
      </Fieldset>

      {featured ? (
        <p className={styles.featured}>
          <span className={styles.featuredLabel}>Featured</span>{" "}
          {featured.featured
            ? featured.rank != null
              ? `Yes — position ${featured.rank}.`
              : "Yes — not placed yet, so it follows any listing that has been."
            : "No."}{" "}
          <Link href="/admin/catalog/featured" className={styles.link}>
            Manage the featured list
          </Link>
        </p>
      ) : null}
    </FormSection>
  );
}
