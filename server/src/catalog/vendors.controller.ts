import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Public()
  @Get()
  list() {
    return this.vendorsService.list();
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
