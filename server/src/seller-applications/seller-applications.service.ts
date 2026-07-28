import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerApplicationDto } from './dto/create-seller-application.dto';
import { mapSellerApplication } from './seller-applications.mapper';

/**
 * Public seller-onboarding intake (M9, closing the M8.4b-flagged gap) —
 * persists straight into the real admin approval queue
 * (`AdminSellersService.listApplications`/`listPendingApplications`,
 * `server/src/admin/sellers.service.ts`), the same `SellerApplication`
 * table `approveApplication` promotes into a live `Seller` + `Vendor`.
 * No `userId` FK, same as `CorporateInquiry` — an application may
 * predate an account. Starts at the schema's own default status
 * (`"new"`), a real review-queue entry rather than the M11a frontend
 * mock's synthetic `"waitlisted"` framing.
 */
@Injectable()
export class SellerApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSellerApplicationDto) {
    const application = await this.prisma.sellerApplication.create({
      data: {
        businessName: dto.businessName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        category: dto.category,
        city: dto.city,
        description: dto.description,
      },
    });
    return mapSellerApplication(application);
  }
}
