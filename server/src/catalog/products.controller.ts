import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { ProductsService } from './products.service';

/** Browse is anonymous per `lib/channel.ts`'s Marketplace row ("Browse web: yes") — every route here is `@Public()`. */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  list(@Query() query: ListProductsQueryDto) {
    return this.productsService.list(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.productsService.getBySlug(slug);
  }
}
