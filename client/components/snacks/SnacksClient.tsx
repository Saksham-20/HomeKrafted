"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { SnackCard } from "@/components/ui/SnackCard";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { StickySummary, type StickySummaryLine } from "@/components/ui/StickySummary";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { Button } from "@/components/ui/Button";
import { buildWhatsAppLink, HOMEKRAFTED_WHATSAPP_NUMBER } from "@/lib/messaging";
import { buildSnackListMessage } from "@/lib/snacks/message";
import { PreOrderPicker, type PreOrderSelection } from "@/components/ui/PreOrderPicker";
import { describeSlot, firstAvailableSlot } from "@/lib/schedule";
import { CHANNEL_RULES } from "@/lib/channel";
import { formatCurrency } from "@/lib/format";
import type { Snack, SnackListItem } from "@/lib/types";
import type { SnackCategoryFilter } from "@/lib/api";
import styles from "./SnacksClient.module.css";

export interface SnacksClientProps {
  snacks: Snack[];
  categories: SnackCategoryFilter[];
}

/** WhatsApp order-status steps a customer sees in chat — illustrative, matches the prototype's fixed `waSteps` demo (received done, the rest pending). Not tied to real send state; a real status feed is an M9 (WhatsApp Cloud API) concern. */
const WA_STEPS = [
  { label: "Order received", done: true },
  { label: "Order accepted", done: false },
  { label: "Out for delivery", done: false },
];

/**
 * Snacks browse + local "snack list" (client half of M5) — category
 * filter chips + grid ported from the prototype's `isSnacks` block,
 * plus the sticky aside: a self-built `SnackList` (NOT the marketplace
 * `useCart`) that becomes a WhatsApp message via `buildSnackListMessage`
 * + `buildWhatsAppLink`. Snacks has no on-site cart/checkout
 * (`lib/channel.ts` — `hasCartOnWeb`/`hasCheckoutOnWeb` are both false
 * for this channel) — this component never imports `useCart` and the
 * only "checkout" is opening a prefilled `wa.me` link.
 */
export function SnacksClient({ snacks, categories }: SnacksClientProps) {
  const [activeCategory, setActiveCategory] = useState<SnackCategoryFilter["value"]>("all");
  const [selected, setSelected] = useState<Record<string, number>>({});

  const filteredSnacks = useMemo(
    () =>
      activeCategory === "all"
        ? snacks
        : snacks.filter((snack) => snack.category === activeCategory),
    [snacks, activeCategory],
  );

  const listItems: SnackListItem[] = useMemo(() => {
    return Object.entries(selected)
      .map(([snackId, quantity]) => {
        const snack = snacks.find((s) => s.id === snackId);
        if (!snack) return null;
        return { snackId, name: snack.name, quantity, price: snack.price };
      })
      .filter((item): item is SnackListItem => item !== null);
  }, [selected, snacks]);

  const estimateTotal = listItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const hasItems = listItems.length > 0;

  // Pre-order slot. Defaults to the soonest bookable window so someone who
  // just wants food now doesn't have to touch the picker at all.
  const [preOrder, setPreOrder] = useState<PreOrderSelection | undefined>(() => firstAvailableSlot());

  function withoutKey(record: Record<string, number>, key: string): Record<string, number> {
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
  }

  function toggleSnack(snack: Snack) {
    setSelected((prev) =>
      prev[snack.id] ? withoutKey(prev, snack.id) : { ...prev, [snack.id]: 1 },
    );
  }

  function setQuantity(snackId: string, quantity: number) {
    setSelected((prev) =>
      quantity < 1 ? withoutKey(prev, snackId) : { ...prev, [snackId]: quantity },
    );
  }

  function removeItem(snackId: string) {
    setSelected((prev) => withoutKey(prev, snackId));
  }

  function handleSend() {
    if (!hasItems) return;
    const message = buildSnackListMessage(
      listItems,
      estimateTotal,
      preOrder ? describeSlot(preOrder.dayId, preOrder.windowId) : undefined,
    );
    const link = buildWhatsAppLink(HOMEKRAFTED_WHATSAPP_NUMBER, message);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  const lines: StickySummaryLine[] = hasItems
    ? [
        ...listItems.map((item) => ({
          label: (
            <span className={styles.itemRow}>
              <span className={styles.itemName}>{item.name}</span>
              <QuantityStepper
                value={item.quantity}
                min={1}
                max={20}
                aria-label={`Quantity for ${item.name}`}
                onChange={(quantity) => setQuantity(item.snackId, quantity)}
                className={styles.stepper}
              />
            </span>
          ),
          value: (
            <span className={styles.itemValue}>
              {formatCurrency(item.price * item.quantity)}
              <button
                type="button"
                className={styles.remove}
                onClick={() => removeItem(item.snackId)}
                aria-label={`Remove ${item.name} from your snack list`}
              >
                ✕
              </button>
            </span>
          ),
        })),
        { label: "Estimate", value: formatCurrency(estimateTotal), emphasis: true },
      ]
    : [{ label: "No snacks added yet — tap “+ Add” on a snack", value: "" }];

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.chipRow}>
          {categories.map((category) => (
            <Chip
              key={category.value}
              label={category.label}
              selected={activeCategory === category.value}
              onClick={() => setActiveCategory(category.value)}
            />
          ))}
        </div>
        <div className={styles.grid}>
          {filteredSnacks.map((snack) => (
            <SnackCard
              key={snack.id}
              snack={snack}
              added={Boolean(selected[snack.id])}
              onAdd={() => toggleSnack(snack)}
            />
          ))}
        </div>
      </div>

      <aside className={styles.aside}>
        <StickySummary
          title="Your snack list"
          stickyOnMobile
          lines={lines}
          footnote="Final price confirmed in chat"
        >
          {/* Pre-order. `snacks.hasPreOrderOnWeb` is true while
              `hasCartOnWeb`/`hasCheckoutOnWeb` stay false — scheduling is
              not a transaction, and the chosen slot travels in the WhatsApp
              message rather than into an order record here. */}
          {hasItems && CHANNEL_RULES.snacks.hasPreOrderOnWeb && (
            <PreOrderPicker value={preOrder} onChange={setPreOrder} title="When do you want it?" />
          )}
          <Button variant="whatsapp" onClick={handleSend} disabled={!hasItems}>
            Send list on WhatsApp
          </Button>
        </StickySummary>

        <div className={styles.waCard}>
          <span className={styles.waEyebrow}>Order updates on WhatsApp</span>
          <StatusTimeline tone="whatsapp" steps={WA_STEPS} className={styles.timeline} />
          <p className={styles.waNote}>
            Full meals &amp; live rider tracking are on the Homekrafted app.
          </p>
        </div>
      </aside>
    </div>
  );
}
