import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TaxonomyService } from './taxonomy.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Public()
  @Get()
  list() {
    return this.taxonomyService.listCategories();
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.taxonomyService.getCategory(slug);
  }
}
