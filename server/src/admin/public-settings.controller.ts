import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AdminSettingsService } from './settings.service';

/**
 * `GET /settings/public` — the allowlisted subset of platform settings,
 * readable by anyone (M17).
 *
 * **This is what makes a runtime feature flag safe.** M5 left flags as a
 * build-time constant in `client/lib/features.ts` because flipping a
 * database row would have opened the `/hamper` route immediately while
 * four client components carried on saying "coming soon" until the next
 * deploy — a half-open feature is worse than a closed one. With this
 * endpoint the client's root layout reads the flags once per render and
 * hands them to every reader through one provider, so the route gate and
 * the button copy change together.
 *
 * It lives beside the admin settings service because that service owns
 * the schema, but it is deliberately **not** on the `/admin` controller:
 * it is unauthenticated, and the allowlist
 * (`AdminSettingsService.getPublic`) is what keeps the commission rate
 * off a page anyone can read.
 */
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Public()
  @Get('public')
  // Short, not none: a flag flip should reach visitors within a minute
  // without every page render costing a database round trip.
  @Header('Cache-Control', 'public, max-age=60')
  get() {
    return this.settings.getPublic();
  }
}
