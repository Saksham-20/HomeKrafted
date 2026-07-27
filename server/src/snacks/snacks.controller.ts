import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ListSnacksQueryDto } from './dto/list-snacks.query.dto';
import { SnacksService } from './snacks.service';

@Controller('snacks')
export class SnacksController {
  constructor(private readonly snacksService: SnacksService) {}

  @Public()
  @Get()
  list(@Query() query: ListSnacksQueryDto) {
    return this.snacksService.list(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.snacksService.getBySlug(slug);
  }
}
