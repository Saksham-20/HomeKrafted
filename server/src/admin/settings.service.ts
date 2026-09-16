import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from './audit-log.service';
import { parseTimeLabel } from '../meals/meal-brackets';
import { DEFAULT_MENU_LOCK_TIME } from '../meals/menu-lock';
import { CommissionRate } from '../common/pricing/commission';

/**
 * The settings this platform actually has (M16, M5).
 *
 * **Every key here is read by something.** A settings screen full of
 * knobs that change nothing is worse than no settings screen at all: it
 * tells an admin their change took effect. If a future key has no reader,
 * it does not belong in this list.
 */
export interface PlatformSettings {
  /**
   * Homekrafted's take rate, as a percentage. Deducted from payouts
   * **only while `commissionEnabled` is on** (M37); while off it drives
   * the modelled commission line on admin analytics and the estimates a
   * HomeKrafter sees on their payout screen and listing form — all of
   * which say which mode they are in.
   */
  commissionPct: number;
  /**
   * Whether payouts actually deduct `commissionPct` (M37). **Defaults to
   * off, and flipping it is a business decision, not a code change** —
   * the engine exists so the numbers are visible and honest everywhere
   * before anybody commits to a rate. While off, every payout row stores
   * gross with an applied rate of 0, and every surface says the figures
   * are estimates.
   */
  commissionEnabled: boolean;
  /**
   * GST the platform charges on its own commission fee (2026-09-02) —
   * Homekrafted is the supplier of that service, so the tax rides on the
   * fee and **never** on the HomeKrafter's earnings. Read by
   * `computePayoutSplit` through `SellerPayoutsService`; applied only
   * while `commissionEnabled` is on, because without a fee there is
   * nothing to tax. Default 18 — the standard rate on marketplace
   * commission; changing it is a tax decision, audited like every write
   * here.
   */
  commissionGstPct: number;
  /**
   * Delivery radius given to a new HomeKrafter whose application didn't
   * state one. Read by `AdminSellersService.approveApplication`.
   */
  defaultDeliveryRadiusKm: number;
  /**
   * Where Homekrafted currently *sells*, as comma-separated pincode
   * prefixes — `"160,1401,1403,1341,1346"` is the Chandigarh tricity.
   *
   * **This is the launch gate, and it is buyer-facing only (M36.)**
   * Supply is national from M36: any valid Indian pincode can apply and
   * be approved, because the alternative is telling a home cook in
   * Faridabad to wait for a city launch that has no date. Demand is not
   * national, because delivery is not. This setting is the seam between
   * those two facts.
   *
   * Three rules.
   *
   * **It must never gate an application, an approval, or a HomeKrafter's
   * own portal.** The moment it does, this is the 21-area waitlist again
   * wearing a different name, and the whole point of M36 is gone.
   *
   * **Prefixes, not a list of pincodes.** The tricity is 68 pincodes and
   * a city is often hundreds; a prefix list stays legible to the admin
   * who has to edit it, and `160` genuinely means "Chandigarh".
   *
   * **Empty means no gate, not no service.** See
   * `getServicedPincodePrefixes` — a misconfiguration must show the
   * catalogue, never hide it.
   */
  servicedPincodePrefixes: string;
  /**
   * When a delivery date's menu (and a buyer's skip of it) closes: this
   * time IST **the evening before** (M37). Read by
   * `meals/menu-lock.ts`'s callers — the seller day-menu editor, buyer
   * skip/pause, and the admin override screen. `"20:00"` means a Tuesday
   * delivery locks Monday 8pm.
   */
  menuLockTime: string;
  /**
   * Whether food can be bought (2026-09-15). **Open unless explicitly
   * `'false'`** — the reverse of `commissionEnabled`'s strict `'true'` — so
   * a database that has never heard of the key, and every test fixture,
   * keeps selling food exactly as before. Closing it is a decision made on
   * `/admin/settings`, and it is audited like every other setting there.
   * See `common/food-orders.ts` for what it gates.
   */
  foodOrdersOpen: boolean;
  /**
   * Flat delivery fee per order, ₹ (2026-09-15 — was a hardcoded ₹49).
   * Defaults to **0** on the owner's instruction: delivery is free while
   * live payments are being tested. Charged by the cart and the order
   * from the same number (`common/pricing/pricing.util.ts`).
   */
  deliveryFee: number;
  /** Orders at or above this subtotal deliver free, ₹. 0 = no free-delivery offer. */
  freeDeliveryThreshold: number;
}

/**
 * The subset that is safe to serve unauthenticated, via
 * `GET /settings/public`.
 *
 * **An allowlist, never a denylist.** The commission rate is a
 * commercial term and `defaultDeliveryRadiusKm` is operational trivia;
 * neither belongs on a page anyone can read. A new setting is private
 * until it is named here, which is the direction that fails safe when
 * someone adds one and forgets this file.
 */
export const PUBLIC_SETTING_KEYS = ['foodOrdersOpen', 'deliveryFee', 'freeDeliveryThreshold'] as const satisfies readonly (keyof PlatformSettings)[];

export type PublicPlatformSettings = Pick<
  PlatformSettings,
  (typeof PUBLIC_SETTING_KEYS)[number]
>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionPct: 10,
  commissionEnabled: false,
  commissionGstPct: 18,
  defaultDeliveryRadiusKm: 10,
  /** The Chandigarh tricity: Chandigarh, Mohali, Kharar, Zirakpur, Panchkula, Ambala. */
  servicedPincodePrefixes: '160,1401,1403,1341,1346',
  menuLockTime: DEFAULT_MENU_LOCK_TIME,
  foodOrdersOpen: true,
  deliveryFee: 0,
  freeDeliveryThreshold: 999,
};

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /**
   * The settings, cached in process for `SETTINGS_TTL_MS`.
   *
   * These used to be one `findMany` per call, and the markup commission
   * model (2026-09-16) put a call on **every catalogue read** — the rate
   * is needed to price a card, so `/products`, `/vendors/:slug/products`
   * and every cart preview grew a settings round-trip they did not have.
   * A table of eight rows read on the hot path is a waste worth removing.
   *
   * Invalidated exactly, in `update()`, so an admin changing the rate
   * sees it on their very next read rather than up to a second later —
   * the TTL is the belt, the invalidation is the braces. The API runs
   * `instances: 1` under pm2 (`ecosystem.config.cjs`), so today the
   * invalidation is complete; the TTL is what keeps the staleness bounded
   * and small if that ever becomes a cluster.
   *
   * **Nothing here may be cached for longer than a person would wait
   * before deciding the switch is broken.** A settings screen that saves
   * and then reads back the old value is indistinguishable from one that
   * did not save.
   */
  private cached: { value: PlatformSettings; readAt: number } | null = null;

  private static readonly SETTINGS_TTL_MS = 5_000;

  async get(): Promise<PlatformSettings> {
    const hit = this.cached;
    if (hit && Date.now() - hit.readAt < AdminSettingsService.SETTINGS_TTL_MS) {
      return hit.value;
    }
    const value = await this.read();
    this.cached = { value, readAt: Date.now() };
    return value;
  }

  /**
   * Drops the cache without touching the database — for anything that
   * changes `PlatformSetting` rows **without** going through `update()`,
   * which is the only other thing that invalidates it. The e2e harness's
   * `resetDatabase` is the one caller: a raw `TRUNCATE` between tests
   * leaves this cache holding whatever the previous test last read, so a
   * test asserting the defaults could see up to `SETTINGS_TTL_MS` of a
   * neighbour's settings — a flake that reads as unrelated and is timing-
   * dependent on how fast the suite happens to run.
   */
  invalidateCache(): void {
    this.cached = null;
  }

  /**
   * The commission rate in force, in the shape `common/pricing/
   * commission.ts` takes.
   *
   * Every surface that prices something for a buyer goes through this
   * rather than reaching into `PlatformSettings` and assembling the three
   * fields itself — assembling them by hand is how one call site ends up
   * passing the configured `pct` with `enabled` hardcoded true, which
   * charges a fee the admin switched off.
   */
  async getCommissionRate(): Promise<CommissionRate> {
    const { commissionPct, commissionGstPct, commissionEnabled } = await this.get();
    return { pct: commissionPct, gstPct: commissionGstPct, enabled: commissionEnabled };
  }

  /**
   * Missing rows fall back to the defaults rather than erroring, so a
   * database that has never had a setting written behaves exactly like
   * the hardcoded constants it replaced.
   */
  private async read(): Promise<PlatformSettings> {
    const rows = await this.prisma.platformSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    return {
      commissionPct: numberOr(byKey.get('commissionPct'), DEFAULT_SETTINGS.commissionPct),
      // Strict equality with the stored string: anything that is not the
      // literal 'true' — a stale row, a typo, a half-written value —
      // reads as off, which is the direction that fails safe for money.
      commissionEnabled: byKey.get('commissionEnabled') === 'true',
      commissionGstPct: numberOr(byKey.get('commissionGstPct'), DEFAULT_SETTINGS.commissionGstPct),
      defaultDeliveryRadiusKm: numberOr(
        byKey.get('defaultDeliveryRadiusKm'),
        DEFAULT_SETTINGS.defaultDeliveryRadiusKm,
      ),
      servicedPincodePrefixes:
        byKey.get('servicedPincodePrefixes') ?? DEFAULT_SETTINGS.servicedPincodePrefixes,
      menuLockTime: byKey.get('menuLockTime') ?? DEFAULT_SETTINGS.menuLockTime,
      foodOrdersOpen: byKey.get('foodOrdersOpen') !== 'false',
      deliveryFee: numberOr(byKey.get('deliveryFee'), DEFAULT_SETTINGS.deliveryFee),
      freeDeliveryThreshold: numberOr(byKey.get('freeDeliveryThreshold'), DEFAULT_SETTINGS.freeDeliveryThreshold),
    };
  }

  /**
   * The launch gate, parsed — or an empty list meaning "no gate".
   *
   * **An empty list opens the catalogue; it does not close it.** A
   * misconfigured, blank or deleted setting must show a buyer everything
   * rather than nothing, for the same reason `Location is never a gate`
   * (CLAUDE.md): a visitor who cannot see anything has no way to tell a
   * deliberate "we don't deliver here yet" from a site that is broken,
   * and the failure is invisible to us because it looks like low
   * traffic. Failing open is also the direction that matches the rest of
   * this product — declining the location prompt returns the full
   * catalogue, it does not return nothing.
   */
  async getServicedPincodePrefixes(): Promise<string[]> {
    const { servicedPincodePrefixes } = await this.get();
    return servicedPincodePrefixes
      .split(',')
      .map((p) => p.trim())
      .filter((p) => /^\d{1,6}$/.test(p));
  }

  /**
   * Only the allowlisted keys — served unauthenticated, so it is built by
   * picking, never by deleting.
   *
   * **Empty since M18**, when the hamper-builder flag left with the
   * builder it gated. The endpoint and the allowlist stay: they are the
   * seam a public setting goes through, and re-deriving "which of these
   * is safe to serve anonymously" under time pressure is exactly how a
   * commission rate ends up on a public URL. `settings.e2e-spec.ts`
   * asserts the private keys are absent, which holds at zero keys and
   * keeps holding when the next one is added.
   */
  async getPublic(): Promise<PublicPlatformSettings> {
    const { foodOrdersOpen, deliveryFee, freeDeliveryThreshold } = await this.get();
    return { foodOrdersOpen, deliveryFee, freeDeliveryThreshold };
  }

  async update(adminUserId: string, patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const before = await this.get();

    if (patch.commissionPct !== undefined) {
      // A take rate over 100% would pay a HomeKrafter to sell nothing, and
      // a negative one is a rebate. Neither is a setting, both are typos.
      if (patch.commissionPct < 0 || patch.commissionPct > 100) {
        throw new BadRequestException('Commission must be between 0 and 100 percent');
      }
    }
    if (patch.commissionGstPct !== undefined) {
      // Same reasoning as the take rate: outside 0–100 is a typo, not a
      // tax decision.
      if (patch.commissionGstPct < 0 || patch.commissionGstPct > 100) {
        throw new BadRequestException('GST on commission must be between 0 and 100 percent');
      }
    }
    if (patch.defaultDeliveryRadiusKm !== undefined) {
      if (patch.defaultDeliveryRadiusKm < 1 || patch.defaultDeliveryRadiusKm > 100) {
        throw new BadRequestException('Default delivery radius must be between 1 and 100 km');
      }
    }
    if (patch.deliveryFee !== undefined) {
      if (!Number.isFinite(patch.deliveryFee) || patch.deliveryFee < 0 || patch.deliveryFee > 1000) {
        throw new BadRequestException('Delivery fee must be between ₹0 and ₹1,000');
      }
    }
    if (patch.freeDeliveryThreshold !== undefined) {
      if (
        !Number.isFinite(patch.freeDeliveryThreshold) ||
        patch.freeDeliveryThreshold < 0 ||
        patch.freeDeliveryThreshold > 100000
      ) {
        throw new BadRequestException('Free delivery threshold must be between ₹0 and ₹1,00,000 (0 turns the offer off)');
      }
    }
    if (patch.servicedPincodePrefixes !== undefined) {
      // Checked on the way in, because the parser on the way out silently
      // drops anything malformed. Dropping a typo'd prefix would quietly
      // stop serving a city the admin believes they just opened — the
      // failure would look like "nobody in Jaipur is ordering".
      const entries = patch.servicedPincodePrefixes
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const bad = entries.filter((p) => !/^\d{1,6}$/.test(p));
      if (bad.length > 0) {
        throw new BadRequestException(
          `Serviced areas must be pincode prefixes of 1–6 digits, comma separated. Not valid: ${bad.join(', ')}`,
        );
      }
      patch = { ...patch, servicedPincodePrefixes: entries.join(',') };
    }
    if (patch.menuLockTime !== undefined) {
      if (parseTimeLabel(patch.menuLockTime) === null) {
        throw new BadRequestException('Menu lock must be a 24-hour time like 20:00');
      }
    }

    const writes = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: String(value), updatedBy: adminUserId },
          update: { value: String(value), updatedBy: adminUserId },
        }),
      );
    if (writes.length === 0) return before;

    await this.prisma.$transaction(writes);
    // Exact invalidation, not a wait for the TTL: an admin who saves the
    // commission rate and is handed back the old one has been told the
    // write failed.
    this.cached = null;
    const after = await this.get();

    // Before/after, because "who dropped the commission to 2%" is the
    // question that gets asked, and the answer has to survive the next
    // person changing it back.
    await this.auditLog.log({
      actorId: adminUserId,
      action: 'platform_settings.update',
      targetType: 'PlatformSetting',
      targetId: Object.keys(patch).join(','),
      metadata: { before: { ...before }, after: { ...after } },
    });

    return after;
  }
}

function numberOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

