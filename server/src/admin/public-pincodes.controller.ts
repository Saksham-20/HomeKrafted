import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { lookupPincode, TRUSTWORTHY_SPREAD_KM } from '../common/pincodes';
import { AdminSettingsService } from './settings.service';

/**
 * `GET /pincodes/:pincode` — what and where a pincode is, and whether we
 * deliver there yet (M36).
 *
 * Two callers, one endpoint, because they ask the same question from
 * opposite ends. The `/sell` form uses it to echo back "Panchkula,
 * Haryana" so an applicant can see they typed the right six digits — the
 * only confirmation available on a form with no address lookup. A buyer's
 * location picker uses `serviced` to know which message to show.
 *
 * **`serviced: false` must never empty the catalogue.** It selects copy,
 * not visibility. CLAUDE.md's standing rule is that location is never a
 * gate: a visitor who cannot see anything has no way to tell "we don't
 * deliver here yet" from "this site is broken", and we cannot tell
 * either, because it looks like low traffic. Say we don't deliver there
 * yet, then show them the catalogue anyway.
 *
 * Public and unauthenticated. It leaks nothing — every value here is
 * India Post's, already published, and the serviced list is a fact about
 * us that we would put on the home page.
 */
@Controller('pincodes')
export class PublicPincodesController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Public()
  @Get(':pincode')
  // The table is baked into the build and the serviced list changes when
  // a city opens, so an hour is generous and still not permanent.
  @Header('Cache-Control', 'public, max-age=3600')
  async get(@Param('pincode') pincode: string) {
    const record = lookupPincode(pincode);
    if (!record) {
      // 404 rather than a `{found: false}` body: "there is no such
      // pincode" is exactly what a 404 means, and it keeps the success
      // shape free of a flag every caller would have to remember.
      throw new NotFoundException(`We don't recognise the pincode ${pincode}`);
    }

    const prefixes = await this.settings.getServicedPincodePrefixes();

    return {
      pincode: pincode.trim(),
      district: record.district,
      state: record.state,
      /**
       * Whether Homekrafted currently delivers here. **Buyer-facing copy
       * only** — nothing about applying or being approved reads this.
       * An empty prefix list means no gate is configured, which reads as
       * serviced everywhere; see `getServicedPincodePrefixes` for why
       * that fails open.
       */
      serviced: prefixes.length === 0 || prefixes.some((p) => pincode.trim().startsWith(p)),
      /**
       * How far apart this pincode's post offices are. Exposed so the
       * admin approval screen can say how much to trust the map pin it
       * is about to plant; a buyer's UI has no use for it and ignores it.
       */
      spreadKm: record.spreadKm,
      approximate: record.spreadKm > TRUSTWORTHY_SPREAD_KM,
    };
  }
}
