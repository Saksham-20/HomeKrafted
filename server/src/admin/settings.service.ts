import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from './audit-log.service';

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
   * Homekrafted's take rate, as a percentage. **Modelling only today** —
   * `Payout` amounts are gross and settlement happens by hand, so nothing
   * deducts this. It drives the commission line on admin analytics and
   * the estimate on the payout queue, both of which say so.
   */
  commissionPct: number;
  /**
   * Delivery radius given to a new HomeKrafter whose application didn't
   * state one. Read by `AdminSellersService.approveApplication`.
   */
  defaultDeliveryRadiusKm: number;
  /**
   * The hamper builder (`/hamper`). **A feature flag, and the only one**
   * — see `PUBLIC_SETTING_KEYS` for why it is shaped differently from
   * the two numbers above.
   *
   * M5 deliberately left this in `client/lib/features.ts` as a
   * build-time constant, because flipping a database flag would have
   * opened the route immediately while four client components carried on
   * saying "coming soon" until the next deploy — a half-open feature is
   * worse than a closed one. What closes that gap is not the flag moving
   * here, it is `GET /settings/public` plus a provider threading the
   * value from the root layout to those components, so every reader
   * changes at once.
   */
  hamperBuilderEnabled: boolean;
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
export const PUBLIC_SETTING_KEYS = ['hamperBuilderEnabled'] as const;

export type PublicPlatformSettings = Pick<
  PlatformSettings,
  (typeof PUBLIC_SETTING_KEYS)[number]
>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionPct: 10,
  defaultDeliveryRadiusKm: 10,
  // Held. The default is the *closed* value on purpose: if the settings
  // table is empty, or the API is unreachable and the client falls back,
  // the feature stays off. A flag that fails open is a flag that ships
  // itself during an outage.
  hamperBuilderEnabled: false,
};

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /**
   * Missing rows fall back to the defaults rather than erroring, so a
   * database that has never had a setting written behaves exactly like
   * the hardcoded constants it replaced.
   */
  async get(): Promise<PlatformSettings> {
    const rows = await this.prisma.platformSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    return {
      commissionPct: numberOr(byKey.get('commissionPct'), DEFAULT_SETTINGS.commissionPct),
      defaultDeliveryRadiusKm: numberOr(
        byKey.get('defaultDeliveryRadiusKm'),
        DEFAULT_SETTINGS.defaultDeliveryRadiusKm,
      ),
      hamperBuilderEnabled: booleanOr(
        byKey.get('hamperBuilderEnabled'),
        DEFAULT_SETTINGS.hamperBuilderEnabled,
      ),
    };
  }

  /** Only the allowlisted keys — served unauthenticated, so it is built by picking, never by deleting. */
  async getPublic(): Promise<PublicPlatformSettings> {
    const all = await this.get();
    return { hamperBuilderEnabled: all.hamperBuilderEnabled };
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
    if (patch.defaultDeliveryRadiusKm !== undefined) {
      if (patch.defaultDeliveryRadiusKm < 1 || patch.defaultDeliveryRadiusKm > 100) {
        throw new BadRequestException('Default delivery radius must be between 1 and 100 km');
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

/**
 * Strict on the true side: only the literal `'true'` enables a feature.
 * Anything else — a typo, a stray `'yes'`, a hand-edited row — leaves it
 * held, which is the direction that fails safe.
 */
function booleanOr(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === 'true';
}
