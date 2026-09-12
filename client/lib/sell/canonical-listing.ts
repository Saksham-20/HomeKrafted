import type { ProductModerationStatus } from "@/lib/types";

export type CanonicalListingState =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "live"
  | "paused"
  | "out_of_stock"
  | "archived"
  | "rejected";

export interface CanonicalListingBadge {
  label: string;
  variant: "success" | "warning" | "error" | "neutral";
  description: string;
}

export interface CanonicalResolvableItem {
  id?: string;
  isDraft?: boolean;
  moderationStatus?: ProductModerationStatus | "submitted" | string;
  isAvailable?: boolean;
  stock?: number;
  weightOptions?: Array<{ stock: number }>;
}

/**
 * Resolves the canonical state of a product listing across the marketplace lifecycle.
 *
 * Implements the pre-launch canonical listing truth contract:
 * draft → submitted → changes_requested → approved → live → paused → out_of_stock → archived → rejected
 *
 * An item awaiting review ('submitted') or refused ('rejected'/'changes_requested')
 * must NEVER evaluate to 'live', and will never be presented as purchasable.
 */
export function resolveCanonicalListingState(item: CanonicalResolvableItem): CanonicalListingState {
  if (item.isDraft) {
    return "draft";
  }

  const mod = item.moderationStatus;
  if (mod === "rejected") {
    return "rejected";
  }
  if (mod === "flagged") {
    return "changes_requested";
  }
  if (mod === "hidden") {
    return "archived";
  }
  if (mod === "pending" || mod === "submitted") {
    return "submitted";
  }

  // At this point moderationStatus is 'active' or legacy undefined
  const totalStock =
    item.stock !== undefined
      ? item.stock
      : item.weightOptions && item.weightOptions.length > 0
        ? item.weightOptions.reduce((acc, w) => acc + (w.stock || 0), 0)
        : 1; // Default to in stock if options not loaded

  if (item.isAvailable === false) {
    return "paused";
  }

  if (totalStock <= 0) {
    return "out_of_stock";
  }

  return "live";
}

/**
 * UI presentation badge metadata for each canonical state.
 */
export function getCanonicalStateBadge(state: CanonicalListingState): CanonicalListingBadge {
  switch (state) {
    case "live":
      return {
        label: "Live & on sale",
        variant: "success",
        description: "Visible to shoppers and ready to purchase",
      };
    case "submitted":
      return {
        label: "Waiting for approval",
        variant: "warning",
        description: "Submitted to Homekrafted team; hidden from buyers until reviewed",
      };
    case "changes_requested":
      return {
        label: "Changes requested",
        variant: "warning",
        description: "Admin requested updates before this listing can go live",
      };
    case "paused":
      return {
        label: "Paused by you",
        variant: "neutral",
        description: "Temporarily hidden from buyers by kitchen switch",
      };
    case "out_of_stock":
      return {
        label: "Sold out",
        variant: "error",
        description: "Inventory exhausted; restock to make visible on storefront",
      };
    case "rejected":
      return {
        label: "Not approved",
        variant: "error",
        description: "Declined by marketplace team. Check notes to fix",
      };
    case "archived":
      return {
        label: "Archived",
        variant: "neutral",
        description: "Withdrawn from catalogue",
      };
    case "approved":
      return {
        label: "Approved",
        variant: "success",
        description: "Passed review; awaiting seller activation",
      };
    case "draft":
    default:
      return {
        label: "Draft",
        variant: "neutral",
        description: "Unsubmitted draft",
      };
  }
}

/**
 * Validates whether a state transition is permitted in the listing lifecycle.
 */
export function canTransitionListingState(
  from: CanonicalListingState,
  to: CanonicalListingState,
): boolean {
  if (from === to) return true;

  switch (from) {
    case "draft":
      return to === "submitted";
    case "submitted":
      return to === "approved" || to === "changes_requested" || to === "rejected" || to === "archived";
    case "changes_requested":
      return to === "submitted" || to === "archived";
    case "approved":
      return to === "live" || to === "paused" || to === "archived";
    case "live":
      return to === "paused" || to === "out_of_stock" || to === "archived";
    case "paused":
      return to === "live" || to === "archived";
    case "out_of_stock":
      return to === "live" || to === "paused" || to === "archived";
    case "rejected":
      return to === "submitted" || to === "archived";
    case "archived":
      return to === "draft" || to === "submitted";
    default:
      return false;
  }
}

