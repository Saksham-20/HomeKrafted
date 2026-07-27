import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CorporateService } from './corporate.service';
import { CreateCorporateInquiryDto } from './dto/create-corporate-inquiry.dto';

@Controller('corporate-inquiries')
export class CorporateController {
  constructor(private readonly corporateService: CorporateService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateCorporateInquiryDto) {
    return this.corporateService.create(dto);
  }
}
