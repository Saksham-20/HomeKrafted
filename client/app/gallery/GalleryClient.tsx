"use client";

import { useState, type ReactNode } from "react";
import { Heart, Search } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type {
  Category,
  LaundryDay,
  LaundryService,
  LaundrySlot,
  MealPromo,
  Occasion,
  Product,
  Snack,
  Wallet,
  WalletTransaction,
} from "@/lib/types";

import { AmountPicker } from "@/components/ui/AmountPicker";
import { Button } from "@/components/ui/Button";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { Card } from "@/components/ui/Card";
import { CategoryTile } from "@/components/ui/CategoryTile";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { Chip } from "@/components/ui/Chip";
import { DietDot } from "@/components/ui/DietDot";
import { OccasionTile } from "@/components/ui/OccasionTile";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductCard } from "@/components/ui/ProductCard";
import { PromoBand } from "@/components/ui/PromoBand";
import { QRTile } from "@/components/ui/QRTile";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { SearchField } from "@/components/ui/SearchField";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { SnackCard } from "@/components/ui/SnackCard";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { StepPills } from "@/components/ui/StepPills";
import { StickySummary } from "@/components/ui/StickySummary";
import { StoreBadges } from "@/components/ui/StoreBadges";
import { Tag } from "@/components/ui/Tag";
import { Textarea } from "@/components/ui/Textarea";
import { TransactionRow } from "@/components/ui/TransactionRow";
import { WalletBalanceCard } from "@/components/ui/WalletBalanceCard";

import styles from "./gallery.module.css";

export interface GalleryClientProps {
  products: Product[];
  vendorNameById: Record<string, string>;
  snacks: Snack[];
  laundryServices: LaundryService[];
  categories: Category[];
  occasions: Occasion[];
  wallet: Wallet;
  transactions: WalletTransaction[];
  topupOptions: number[];
  laundryDays: LaundryDay[];
  laundrySlots: LaundrySlot[];
  mealPromo: MealPromo;
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionEyebrow}>{eyebrow}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <span className={styles.groupTitle}>{title}</span>
      <div className={styles.row}>{children}</div>
    </div>
  );
}

function Swatch({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.swatch}>
      <span className={styles.swatchLabel}>{label}</span>
      {children}
    </div>
  );
}

const TOC = [
  { id: "buttons", label: "Buttons" },
  { id: "chips", label: "Chips & badges" },
  { id: "cards", label: "Cards" },
  { id: "panels", label: "Panels" },
  { id: "forms", label: "Forms & pickers" },
  { id: "progress", label: "Progress" },
  { id: "wallet", label: "Wallet" },
  { id: "qr", label: "QR & app install" },
];

export function GalleryClient({
  products,
  vendorNameById,
  snacks,
  laundryServices,
  categories,
  occasions,
  wallet,
  transactions,
  topupOptions,
  laundryDays,
  laundrySlots,
  mealPromo,
}: GalleryClientProps) {
  // Live-state demos — proof the interactive primitives actually work,
  // not just that they render.
  const [wishlisted, setWishlisted] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [cardClicks, setCardClicks] = useState(0);
  const [snackAdded, setSnackAdded] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(laundryServices[0]?.id);
  const [chipSelected, setChipSelected] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [galleryImage, setGalleryImage] = useState("");

  const heroProduct = products[0];
  const plainProduct = products[2];
  const curatedProduct = products[7];

  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <span className={styles.bannerEyebrow}>Homekrafted · Dev only</span>
        <h1 className={styles.bannerTitle}>M1 component gallery</h1>
        <p className={styles.bannerNote}>
          Every primitive in <code>components/ui/</code>, in every state the
          design system defines (default / hover / selected / disabled,
          where each applies), rendered against real mock data for visual
          QA against <code>handoff/prototype/Homekrafted.dc.html</code>.
          This route is not linked from any nav — it exists purely for
          milestone review and can be deleted once every screen milestone
          has exercised these primitives in situ.
        </p>
        <nav className={styles.toc} aria-label="Jump to section">
          {TOC.map((item) => (
            <a key={item.id} href={`#${item.id}`} className={styles.tocLink}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      {/* ---------------------------------------------------------- */}
      <Section id="buttons" eyebrow="01 · Buttons" title="Button & QuantityStepper">
        <Group title="Variants · size md">
          <Swatch label="primary">
            <Button variant="primary">Shop homemade foods</Button>
          </Swatch>
          <Swatch label="secondary">
            <Button variant="secondary">Build a hamper →</Button>
          </Swatch>
          <Swatch label="ghost-gold">
            <Button variant="ghost-gold">+ Add to a gift hamper</Button>
          </Swatch>
          <Swatch label="whatsapp">
            <Button variant="whatsapp">Send list on WhatsApp</Button>
          </Swatch>
        </Group>

        <Group title="Sizes">
          <Swatch label="md">
            <Button size="md">Open wallet →</Button>
          </Swatch>
          <Swatch label="sm">
            <Button size="sm">Open wallet →</Button>
          </Swatch>
        </Group>

        <Group title="Icon variant — round / square">
          <Swatch label="round · md">
            <Button variant="icon" aria-label="Wishlist">
              <Heart size={18} strokeWidth={1.6} />
            </Button>
          </Swatch>
          <Swatch label="round · sm">
            <Button variant="icon" size="sm" aria-label="Wishlist">
              <Heart size={16} strokeWidth={1.6} />
            </Button>
          </Swatch>
          <Swatch label="square · md">
            <Button variant="icon" shape="square" aria-label="Search">
              <Search size={18} strokeWidth={1.7} />
            </Button>
          </Swatch>
        </Group>

        <Group title="States">
          <Swatch label="hover / focus (try me)">
            <Button>Hover or tab to me</Button>
          </Swatch>
          <Swatch label="disabled">
            <Button disabled>Disabled</Button>
          </Swatch>
        </Group>

        <Group title="QuantityStepper">
          <Swatch label="default (interactive)">
            <QuantityStepper defaultValue={1} aria-label="Quantity" />
          </Swatch>
          <Swatch label="disabled">
            <QuantityStepper defaultValue={2} disabled aria-label="Quantity" />
          </Swatch>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section id="chips" eyebrow="02 · Chips & badges" title="Chip, ChannelBadge, Tag, DietDot">
        <Group title="Chip">
          <Swatch label="idle (click to select)">
            <Chip
              label="Vegetarian"
              selected={chipSelected}
              onClick={() => setChipSelected((s) => !s)}
            />
          </Swatch>
          <Swatch label="idle">
            <Chip label="Vegan" />
          </Swatch>
          <Swatch label="removable (selected + x)">
            <Chip label="No preservatives" selected onRemove={() => {}} />
          </Swatch>
          <Swatch label="disabled">
            <Chip label="Sugar-free" disabled />
          </Swatch>
        </Group>

        <Group title="ChannelBadge — label/variant sourced from getChannelBadge(key)">
          <Swatch label="marketplace · pine">
            <ChannelBadge channel="marketplace" />
          </Swatch>
          <Swatch label="snacks · whatsapp">
            <ChannelBadge channel="snacks" />
          </Swatch>
          <Swatch label="full-meals · gold-dark (on dark surface)">
            <div className={styles.darkWrap}>
              <ChannelBadge channel="full-meals" />
            </div>
          </Swatch>
        </Group>

        <Group title="Tag — one style, four values">
          <Swatch label="Bestseller">
            <Tag label="Bestseller" />
          </Swatch>
          <Swatch label="New">
            <Tag label="New" />
          </Swatch>
          <Swatch label="Festive">
            <Tag label="Festive" />
          </Swatch>
          <Swatch label="Curated">
            <Tag label="Curated" />
          </Swatch>
        </Group>

        <Group title="DietDot">
          <Swatch label="veg">
            <DietDot diet="veg" />
          </Swatch>
          <Swatch label="non-veg">
            <DietDot diet="non-veg" />
          </Swatch>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section
        id="cards"
        eyebrow="03 · Cards"
        title="Card, ProductCard, CategoryTile, OccasionTile, SnackCard, ServiceCard"
      >
        <Group title="Card (base)">
          <Swatch label="default">
            <div className={styles.cardSlot}>
              <Card padding="md">Base card — white / border / radius-lg.</Card>
            </div>
          </Swatch>
          <Swatch label="hoverable">
            <div className={styles.cardSlot}>
              <Card padding="md" hoverable tabIndex={0}>
                Hover or tab to me.
              </Card>
            </div>
          </Swatch>
        </Group>

        {heroProduct && (
          <Group title="ProductCard">
            <Swatch label={`interactive · ${cardClicks} card click(s)`}>
              <div className={styles.cardSlot}>
                <ProductCard
                  product={heroProduct}
                  makerName={vendorNameById[heroProduct.vendorId] ?? "Maker"}
                  wishlisted={wishlisted}
                  onToggleWishlist={() => setWishlisted((w) => !w)}
                  added={cardAdded}
                  onAdd={() => setCardAdded((a) => !a)}
                  onCardClick={() => setCardClicks((c) => c + 1)}
                />
              </div>
            </Swatch>
            {plainProduct && (
              <Swatch label="static · no tag">
                <div className={styles.cardSlot}>
                  <ProductCard
                    product={plainProduct}
                    makerName={vendorNameById[plainProduct.vendorId] ?? "Maker"}
                  />
                </div>
              </Swatch>
            )}
            {curatedProduct && (
              <Swatch label="static · Curated tag, added + wishlisted">
                <div className={styles.cardSlot}>
                  <ProductCard
                    product={curatedProduct}
                    makerName={vendorNameById[curatedProduct.vendorId] ?? "Maker"}
                    added
                    wishlisted
                  />
                </div>
              </Swatch>
            )}
          </Group>
        )}

        <Group title="CategoryTile">
          <div className={styles.grid}>
            {categories.slice(0, 6).map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </Group>

        <Group title="OccasionTile">
          <div className={styles.grid}>
            {occasions.slice(0, 6).map((occasion) => (
              <OccasionTile key={occasion.id} occasion={occasion} />
            ))}
          </div>
        </Group>

        <Group title="SnackCard — diet dot, add/added toggle">
          <div className={styles.gridWide}>
            {snacks[0] && (
              <SnackCard
                snack={snacks[0]}
                added={snackAdded}
                onAdd={() => setSnackAdded((a) => !a)}
              />
            )}
            {snacks[1] && <SnackCard snack={snacks[1]} />}
            {snacks[2] && <SnackCard snack={snacks[2]} added />}
          </div>
        </Group>

        <Group title="ServiceCard — single-select demo">
          <div className={styles.gridWide}>
            {laundryServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                selected={service.id === selectedServiceId}
                onSelect={() => setSelectedServiceId(service.id)}
              />
            ))}
          </div>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section id="panels" eyebrow="04 · Panels" title="PromoBand, WalletBalanceCard, StickySummary">
        <Group title="PromoBand — dark / tint">
          <div className={styles.gridBands}>
            <PromoBand
              variant="dark"
              eyebrow="Customisable"
              title={
                <>
                  Build your own
                  <br />
                  gift hamper
                </>
              }
              description="Pick a box, fill it with favourites, add a handwritten message card and gift wrap. We pack it beautifully."
              ctaLabel="Start building →"
            />
            <PromoBand
              variant="tint"
              eyebrow="Homekrafted Wallet"
              title="Earn 5% cashback on every order"
              description="Top up once, pay in a tap, and watch rewards add up across the store and laundry."
              ctaLabel="Open wallet →"
            />
          </div>
        </Group>

        <Group title="WalletBalanceCard">
          <div className={styles.cardSlotWide}>
            <WalletBalanceCard
              balance={wallet.balance}
              pendingCashback={wallet.pendingCashback}
              lifetimeSaved={wallet.lifetimeSaved}
            />
          </div>
        </Group>

        <Group title="StickySummary — line items, emphasis total, cashback line, CTA slot">
          <div className={styles.cardSlotWide}>
            <StickySummary
              title="Booking summary"
              lines={[
                { label: "Wash & Fold (est. 4 kg)", value: formatCurrency(316) },
                { label: "Pickup slot", value: "Sat, 9–11 AM" },
                { label: "Delivery", value: "Free" },
                { label: "Estimated total", value: formatCurrency(316), emphasis: true },
              ]}
              cashbackLabel="Pay with wallet · earn ₹18 cashback"
              footnote="Final price weighed at pickup"
            >
              <Button>Confirm pickup →</Button>
            </StickySummary>
          </div>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section
        id="forms"
        eyebrow="05 · Forms & pickers"
        title="SearchField, SlotPicker, AmountPicker, PriceRange, PhotoUpload, Textarea"
      >
        <Group title="SearchField">
          <div className={styles.cardSlotWide}>
            <SearchField />
          </div>
        </Group>

        <Group title="SlotPicker — day / slot variants + disabled">
          <div className={styles.stack}>
            <span className={styles.helper}>Pickup day</span>
            <SlotPicker
              variant="day"
              columns={4}
              options={laundryDays.map((day) => ({
                id: day.id,
                primary: day.day,
                secondary: day.date,
              }))}
            />
            <span className={styles.helper}>Pickup slot</span>
            <SlotPicker
              variant="slot"
              columns={3}
              options={laundrySlots.map((slot) => ({ id: slot.id, primary: slot.label }))}
            />
            <span className={styles.helper}>Disabled</span>
            <SlotPicker
              variant="slot"
              columns={3}
              disabled
              options={laundrySlots.map((slot) => ({ id: slot.id, primary: slot.label }))}
            />
          </div>
        </Group>

        <Group title="AmountPicker">
          <div className={styles.cardSlotWide}>
            <AmountPicker options={topupOptions} defaultValue={topupOptions[1]} />
          </div>
        </Group>

        <Group title="PriceRange">
          <div className={styles.cardSlotWide}>
            <PriceRange min={120} max={1500} defaultValueMin={250} defaultValueMax={1200} />
          </div>
        </Group>

        <Group title="PhotoUpload — real uploads; needs a signed-in session">
          <div className={styles.cardSlotWide}>
            <PhotoUpload photos={photos} onChange={setPhotos} purpose="laundry" maxPhotos={4} />
          </div>
        </Group>

        <Group title="ImageUpload — drag, click or paste; needs a signed-in session">
          <div className={styles.cardSlotWide}>
            <ImageUpload
              label="Product photo"
              purpose="listing"
              value={galleryImage}
              onChange={setGalleryImage}
            />
          </div>
        </Group>

        <Group title="Textarea">
          <div className={styles.cardSlotWide}>
            <Textarea
              label="Special instructions"
              placeholder="Any handling notes for our delivery partner…"
              hint="Optional"
            />
          </div>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section id="progress" eyebrow="06 · Progress" title="StepPills, CapacityMeter, StatusTimeline">
        <Group title="StepPills — active = pine fill">
          <StepPills
            steps={[
              { n: 1, label: "Box" },
              { n: 2, label: "Fill" },
              { n: 3, label: "Message" },
              { n: 4, label: "Checkout" },
            ]}
            activeIndex={1}
          />
        </Group>

        <Group title="CapacityMeter — gold gradient fill">
          <div className={styles.cardSlotWide}>
            <CapacityMeter title="Signature Box" current={3} max={5} />
          </div>
        </Group>

        <Group title="StatusTimeline">
          <Swatch label="whatsapp · vertical (Snacks WA status)">
            <StatusTimeline
              tone="whatsapp"
              steps={[
                { label: "Order received", done: true },
                { label: "Order accepted", done: false },
                { label: "Out for delivery", done: false },
              ]}
            />
          </Swatch>
          <Swatch label="pine · horizontal (order-status reuse)">
            <StatusTimeline
              tone="pine"
              orientation="horizontal"
              steps={[
                { label: "Placed", done: true },
                { label: "Packed", done: true },
                { label: "Shipped", done: false, current: true },
                { label: "Delivered", done: false },
              ]}
            />
          </Swatch>
        </Group>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section id="wallet" eyebrow="07 · Wallet" title="TransactionRow">
        <div className={styles.cardSlotWide}>
          <Card padding="md">
            {transactions.slice(0, 4).map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </Card>
        </div>
      </Section>

      <hr className={styles.divider} />

      {/* ---------------------------------------------------------- */}
      <Section id="qr" eyebrow="08 · QR & app install" title="QRTile, StoreBadges">
        <Group title="QRTile">
          <QRTile />
        </Group>
        <Group title="StoreBadges — outline (on dark) / solid">
          <Swatch label="outline">
            <div className={styles.darkWrap}>
              <StoreBadges
                variant="outline"
                appStoreHref={mealPromo.appStoreUrl}
                playStoreHref={mealPromo.playStoreUrl}
              />
            </div>
          </Swatch>
          <Swatch label="solid">
            <StoreBadges
              variant="solid"
              appStoreHref={mealPromo.appStoreUrl}
              playStoreHref={mealPromo.playStoreUrl}
            />
          </Swatch>
        </Group>
      </Section>
    </div>
  );
}
