import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderEnrolmentService } from './rider-enrolment.service';

/**
 * `POST /rider-enrolment` — the one door from "signed-in shopper" to
 * "rider" (D3/R1). Deliberately carries **no `@Roles(...)`** at the
 * class, unlike every other `src/rider/*` controller —
 * `rbac-structure.spec.ts` allowlists this file for exactly that reason.
 *
 * The brief's shape for this route is `@Roles('consumer', 'rider')`, but
 * `RolesGuard` throws its own generic 403 for anyone *outside* that list
 * before the handler ever runs — which would make the seller/admin case
 * below unreachable and turn "This number already has a HomeKrafter/admin
 * account…" into dead code. A seller or admin has to actually reach
 * `RiderEnrolmentService.enrol` for that sentence (and the 409 status the
 * brief specifies, and `test/e2e/rider-onboarding.e2e-spec.ts`'s "seller
 * enrol → 409" case) to be real, so this controller is open to any
 * authenticated role and the service is what decides — consumer flips to
 * rider, an existing rider gets a fresh token pair, and seller/admin are
 * refused with a sentence instead of a bare 403 (the CLAUDE.md rule: "a
 * refusal carries a sentence saying what to do next").
 */
@Controller('rider-enrolment')
export class RiderEnrolmentController {
  constructor(private readonly enrolment: RiderEnrolmentService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  enrol(@CurrentUser() user: RequestUser) {
    return this.enrolment.enrol(user);
  }
}
