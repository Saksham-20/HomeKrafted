"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Eye, EyeOff, Pencil, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { StatusPill } from "./StatusPill";
import { formatCurrency } from "@/lib/format";
import {
  MODERATION_ACTIONS_NEEDING_REASON,
  type AdminProductSummary,
  type ProductModerationAction,
} from "@/lib/api";
import styles from "./ProductModerationRow.module.css";

export interface ProductModerationRowProps {
  product: AdminProductSummary;
  onAction: (productId: string, action: ProductModerationAction, reason?: string) => void;
}

/** Matches `ModerateProductDto`'s `@MinLength(10)` — enforced here too so the admin is told before the round trip, not after. */
const MIN_REASON = 10;

const REASON_PROMPT: Partial<Record<ProductModerationAction, string>> = {
  reject: "Why can’t this go live? The HomeKrafter sees this word for word.",
  hide: "Why is this coming down? The HomeKrafter sees this word for word.",
  flag: "What’s the concern? The HomeKrafter sees this word for word.",
};

/**
 * `/admin/catalog` row — thumbnail, name/vendor/category, price, status
 * pill, feature star, and the moderation actions.
 *
 * **M22 changed what a refusal costs.** Rejecting, taking down or flagging
 * now opens an inline reason box and will not submit without one, because
 * the reason is sent to the HomeKrafter verbatim and is the only thing
 * that tells them what to change. Before this, an admin could hide a
 * listing in one click and its owner was never told, nor why.
 *
 * The box is **inline rather than a modal** on purpose: a dialog owes
 * focus-in, a tab trap and focus restore (`CLAUDE.md`, M16), and none of
 * that buys anything for a single textarea that belongs next to the row it
 * is about.
 */
export function ProductModerationRow({ product, onAction }: ProductModerationRowProps) {
  const status = product.moderationStatus ?? "active";
  const weight = product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  const image = product.images[0];
  const reasonFieldId = useId();
  const previewId = useId();

  const [pendingAction, setPendingAction] = useState<ProductModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * The buyer-facing card, on the screen where somebody decides whether a
   * listing goes live.
   *
   * The row is a 48px thumbnail, a name and a price — enough to *find* a
   * listing and not enough to *judge* one. The question an admin is
   * actually answering is "would this look right in the grid", and every
   * defect that matters to it is invisible here: a photograph cropped
   * square that loses its subject, a name that truncates halfway, an MRP
   * struck through against nothing, a maker line naming the wrong
   * kitchen.
   *
   * `<ProductCard>` itself, not a copy of it: a mock-up of the card would
   * drift from the real one and start approving listings against a
   * rendering buyers never see.
   */
  const [preview, setPreview] = useState(false);

  function start(action: ProductModerationAction) {
    if (MODERATION_ACTIONS_NEEDING_REASON.includes(action)) {
      setPendingAction(action);
      setReason("");
      setError(null);
      return;
    }
    onAction(product.id, action);
  }

  function confirm() {
    if (!pendingAction) return;
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) {
      setError(`Give them something they can act on — at least ${MIN_REASON} characters.`);
      return;
    }
    onAction(product.id, pendingAction, trimmed);
    setPendingAction(null);
    setReason("");
    setError(null);
  }

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.main}>
        <div className={styles.thumb}>
          <ImageSlot ratio="1/1" label={image?.placeholder ?? product.name} src={image?.src} compact />
        </div>
        <div className={styles.body}>
          <span className={styles.name}>
            {product.name}
            {product.featured && (
              <Star size={13} strokeWidth={1.8} className={styles.featuredStar} aria-label="Featured on home" />
            )}
          </span>
          <span className={styles.meta}>
            {product.vendorName} · {product.categoryName}
          </span>
          {/* The standing decision, shown where the next admin to look at
              this row will read it — otherwise only the audit log knows. */}
          {product.moderationNote && (
            <span className={styles.note}>Reason on file: {product.moderationNote}</span>
          )}
        </div>
        <span className={styles.price}>{weight ? formatCurrency(weight.price) : "—"}</span>
        <StatusPill status={status} className={styles.statusPill} />
        <div className={styles.actions}>
          {status !== "active" && (
            <Button variant="secondary" size="sm" onClick={() => start("approve")}>
              Approve
            </Button>
          )}
          {status === "pending" && (
            <Button variant="secondary" size="sm" onClick={() => start("reject")}>
              Reject
            </Button>
          )}
          {status !== "hidden" && status !== "pending" && (
            <Button variant="secondary" size="sm" onClick={() => start("hide")}>
              Take down
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPreview((open) => !open)}
            aria-expanded={preview}
            aria-controls={previewId}
          >
            {preview ? (
              <EyeOff size={14} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Eye size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
            {preview ? "Hide card" : "Preview card"}
          </Button>
          {status !== "flagged" && status !== "pending" && (
            <Button variant="secondary" size="sm" onClick={() => start("flag")}>
              Flag
            </Button>
          )}
          <Button
            variant={product.featured ? "secondary" : "ghost-gold"}
            size="sm"
            onClick={() => start(product.featured ? "unfeature" : "feature")}
          >
            {product.featured ? "Unfeature" : "Feature"}
          </Button>
          <Link
            href={`/admin/catalog/${product.id}`}
            className={clsx(styles.iconLink)}
            aria-label={`Edit ${product.name}`}
          >
            <Pencil size={15} strokeWidth={1.7} />
          </Link>
        </div>
      </div>

      {preview && (
        <div className={styles.previewBox} id={previewId}>
          <span className={styles.previewLabel}>As a buyer sees it</span>
          {/*
            `inert`, because the card draws a wishlist heart and an add
            button whichever handlers it is given, and a control that does
            nothing when pressed is worse than no control. It also takes
            the whole preview out of the tab order, so keyboard focus goes
            from the row's actions straight to the next row rather than
            through a rendering.
          */}
          <div className={styles.previewCard} inert>
            {/*
              No `href`, no `onAdd`, no wishlist. This is a rendering to
              look at, not a card to shop from — and `ProductCard`'s own
              contract is that a card with no destination is not clickable
              (M28), so withholding `href` is the supported way to say so
              rather than a hack.

              It renders the listing exactly as the grid will, including a
              `pending` one that no buyer can reach yet. That is the point:
              the decision being made is whether it *should* be reachable.
            */}
            <ProductCard product={product} makerName={product.vendorName} />
          </div>
        </div>
      )}

      {pendingAction && (
        <div className={styles.reasonBox}>
          <label className={styles.reasonLabel} htmlFor={`${reasonFieldId}-reason`}>
            {REASON_PROMPT[pendingAction]}
          </label>
          <textarea
            id={`${reasonFieldId}-reason`}
            className={styles.reasonInput}
            value={reason}
            rows={2}
            autoFocus
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. The photo shows a branded wrapper — please use your own packaging."
            aria-describedby={error ? `${reasonFieldId}-error` : undefined}
          />
          {error && (
            <p className={styles.reasonError} id={`${reasonFieldId}-error`} role="alert">
              {error}
            </p>
          )}
          <div className={styles.reasonActions}>
            <Button size="sm" onClick={confirm}>
              Send and {pendingAction}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
