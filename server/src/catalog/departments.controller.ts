import { Controller, Get, Query } from '@nestjs/common';
import { ProductKind } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { AttributesService } from './attributes.service';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/list-products.query.dto';

/**
 * G1 — what the buyer's browse page needs before it can draw a control
 * (docs/GIFTING-REWORK.md §5.4).
 *
 * Public, like the rest of `catalog/`: browsing is anonymous
 * (`lib/channel.ts`'s Marketplace row).
 */
@Controller('catalog')
export class DepartmentsController {
  constructor(
    private readonly attributes: AttributesService,
    private readonly products: ProductsService,
  ) {}

  /**
   * The department tiles, with a real listing's photograph as each face
   * and the non-empty subcategories under it.
   *
   * Only departments with something live are returned (D2) — with 86
   * gifts, 18 of 26 tiles were dimmed and disabled, which made the dead
   * controls most of the control.
   */
  @Public()
  @Get('departments')
  departments(@Query('kind') kind?: string) {
    return this.attributes.departments(kind === 'food' ? ProductKind.food : ProductKind.craft);
  }

  /**
   * Counts for the current selection, so a filter can say how many gifts
   * each option would leave.
   *
   * It takes **the same query the product list takes**, deliberately: a
   * facet count computed from a different filter than the grid is a number
   * that disagrees with the page under it, and nobody can tell which one is
   * lying. `ProductsService.browseWhere` builds it once for both.
   */
  @Public()
  @Get('facets')
  facets(@Query() query: ListProductsQueryDto) {
    return this.attributes.facets(this.products.browseWhere(query));
  }
}
