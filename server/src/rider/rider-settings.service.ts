import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RiderPaySettings } from './rider-pay';

/**
 * The dispatch/pay tuning knobs — `PlatformSetting` rows under the
 * `rider.` prefix, read the same way `AdminSettingsService` reads
 * everything else: missing rows fall back to defaults, so a database
 * that has never had one written behaves exactly like the constants it
 * replaces.
 *
 * **Deliberately not folded into `AdminSettingsService`'s typed
 * `PlatformSettings`.** That interface backs the general `/admin/settings`
 * screen (`UpdateSettingsDto`), and these eight numbers are dispatch
 * internals an operator tunes far more rarely than a commission rate —
 * putting them on the same screen before there is a reason to (a
 * settings UI for them is not in this brief) would be exposing knobs
 * nobody asked to see yet. The underlying mechanism is identical
 * (`PlatformSetting.key -> value`, defaulted, string-encoded), and a
 * `rider.*`-scoped admin surface can read/write these same rows later
 * without a schema change.
 */
export interface RiderDispatchSettings extends RiderPaySettings {
  /** Metres. `rider.arriveRadiusM`, default 300 — how close "Arrived" may be tapped from. */
  arriveRadiusM: number;
  /** Seconds an offer stays live before it expires. `rider.offerTimeoutSec`, default 45. */
  offerTimeoutSec: number;
  /** Minutes a job may sit with no candidate before the admin alert fires once. `rider.unassignedAlertMin`, default 10. */
  unassignedAlertMin: number;
}

const KEY_PREFIX = 'rider.';

export const RIDER_SETTINGS_DEFAULTS: RiderDispatchSettings = {
  basePay: 2500,
  perKm: 600,
  freeKm: 2,
  waitPerMin: 100,
  freeWaitMin: 10,
  arriveRadiusM: 300,
  offerTimeoutSec: 45,
  unassignedAlertMin: 10,
};

function numberOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class RiderSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `rider.companyUpiId` — R3's §2.4 "shows company UPI ID + QR". Not a
   * number, so it stays out of `RiderDispatchSettings`'s numeric map:
   * `null` when unset (the default — nothing has been typed into
   * `/admin/settings` yet), which is what tells the app to hide the pay
   * button and say "Ask support how to deposit" instead of rendering a
   * blank or placeholder VPA nobody should pay.
   */
  async getCompanyUpiId(): Promise<string | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: `${KEY_PREFIX}companyUpiId` } });
    const value = row?.value?.trim();
    return value ? value : null;
  }

  async get(): Promise<RiderDispatchSettings> {
    const rows = await this.prisma.platformSetting.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
    const byKey = new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length), r.value]));

    return {
      basePay: numberOr(byKey.get('basePay'), RIDER_SETTINGS_DEFAULTS.basePay),
      perKm: numberOr(byKey.get('perKm'), RIDER_SETTINGS_DEFAULTS.perKm),
      freeKm: numberOr(byKey.get('freeKm'), RIDER_SETTINGS_DEFAULTS.freeKm),
      waitPerMin: numberOr(byKey.get('waitPerMin'), RIDER_SETTINGS_DEFAULTS.waitPerMin),
      freeWaitMin: numberOr(byKey.get('freeWaitMin'), RIDER_SETTINGS_DEFAULTS.freeWaitMin),
      arriveRadiusM: numberOr(byKey.get('arriveRadiusM'), RIDER_SETTINGS_DEFAULTS.arriveRadiusM),
      offerTimeoutSec: numberOr(byKey.get('offerTimeoutSec'), RIDER_SETTINGS_DEFAULTS.offerTimeoutSec),
      unassignedAlertMin: numberOr(byKey.get('unassignedAlertMin'), RIDER_SETTINGS_DEFAULTS.unassignedAlertMin),
    };
  }
}
