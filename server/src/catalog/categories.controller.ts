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

  /**
   * By id, unfiltered (never 404s for an archived or merged category) —
   * for a direct reference like a product's `categoryId`, e.g. the
   * product-page breadcrumb, as opposed to `GET /:slug`'s browse/share
   * link. Two path segments, so it can't collide with `:slug` above
   * whatever a category's slug happens to be.
   */
  @Public()
  @Get('id/:id')
  getById(@Param('id') id: string) {
    return this.taxonomyService.getCategoryById(id);
  }
}
