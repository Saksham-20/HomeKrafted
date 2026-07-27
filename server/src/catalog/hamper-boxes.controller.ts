import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TaxonomyService } from './taxonomy.service';

/** `GET /hamper/boxes` — separate controller so the route matches `docs/API.md`'s documented `/hamper/boxes` path rather than nesting under `/collections` or similar. */
@Controller('hamper')
export class HamperBoxesController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Public()
  @Get('boxes')
  list() {
    return this.taxonomyService.listHamperBoxes();
  }
}
