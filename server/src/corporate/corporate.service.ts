import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCorporateInquiryDto } from './dto/create-corporate-inquiry.dto';
import { mapCorporateInquiry } from './corporate.mapper';

/**
 * `CorporateInquiry` has no `userId` FK (see `schema.prisma`) — a bulk-
 * gifting inquiry may predate an account, same as `SellerApplication`.
 * `create` is `@Public()`. There is no list/admin-review endpoint yet —
 * that's a seam for **M11** (admin panel), not this milestone.
 */
@Injectable()
export class CorporateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCorporateInquiryDto) {
    const inquiry = await this.prisma.corporateInquiry.create({
      data: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        occasion: dto.occasion,
        estimatedQuantity: dto.estimatedQuantity,
        budgetRange: dto.budgetRange,
        message: dto.message,
      },
    });
    return mapCorporateInquiry(inquiry);
  }
}
