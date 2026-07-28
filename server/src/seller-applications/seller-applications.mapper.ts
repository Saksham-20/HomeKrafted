import { SellerApplication } from '@prisma/client';

/** Same shape `admin/sellers.service.ts`'s private `mapApplication` produces — kept in sync deliberately (both read the one `SellerApplication` table; a shared mapper wasn't worth the extra cross-module import for one small object literal). */
export function mapSellerApplication(app: SellerApplication) {
  return {
    id: app.id,
    businessName: app.businessName,
    contactName: app.contactName,
    email: app.email,
    phone: app.phone,
    category: app.category,
    city: app.city,
    description: app.description,
    status: app.status,
    createdAt: app.createdAt.toISOString(),
  };
}
