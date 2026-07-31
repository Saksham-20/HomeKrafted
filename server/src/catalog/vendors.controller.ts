import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Public()
  @Get()
  list(@Query('q') q?: string) {
    return this.vendorsService.list(q);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.vendorsService.getBySlug(slug);
  }

  @Public()
  @Get(':slug/products')
  productsBySlug(@Param('slug') slug: string) {
    return this.vendorsService.productsBySlug(slug);
  }
}
