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
}

/**
 * **Feature flags deliberately did not move here.**
 * `client/lib/features.ts` stays a build-time constant. Four of its call
 * sites are client components deciding button copy and whether an "add to
 * hamper" control renders; only `app/hamper/page.tsx` is the real gate.
 * A database flag would flip the server gate immediately and leave those
 * four saying "coming soon" until the next deploy — a half-open feature
 * is worse than a closed one. Making them runtime-correct needs the flag
 * threaded from the root layout through a context, which is a change
 * worth making on its own, not as a side effect of adding a settings
 * screen. Logged in `docs/PRODUCTION-AUDIT.md` as still open.
 */

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionPct: 10,
  defaultDeliveryRadiusKm: 10,
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
    };
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
