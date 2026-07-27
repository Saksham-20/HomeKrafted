import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TaxonomyService } from './taxonomy.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Public()
  @Get()
  list() {
    return this.taxonomyService.listCollections();
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.taxonomyService.getCollection(slug);
  }
}
