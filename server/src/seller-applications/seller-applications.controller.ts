import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CreateSellerApplicationDto } from './dto/create-seller-application.dto';
import { SellerApplicationsService } from './seller-applications.service';

@Controller('seller-applications')
export class SellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  /**
   * `@Public()` — no account needed to apply, same as
   * `POST /corporate-inquiries`. Rate-limited tighter than the app-wide
   * default (same `{ limit: 5, ttl: 60_000 }` AuthController uses for
   * its most abuse-worth routes) since this is an unauthenticated public
   * form.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  create(@Body() dto: CreateSellerApplicationDto) {
    return this.service.create(dto);
  }
}
