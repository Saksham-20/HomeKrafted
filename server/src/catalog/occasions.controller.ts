import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TaxonomyService } from './taxonomy.service';

@Controller('occasions')
export class OccasionsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Public()
  @Get()
  list() {
    return this.taxonomyService.listOccasions();
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.taxonomyService.getOccasion(slug);
  }
}
