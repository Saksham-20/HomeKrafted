import { Module } from '@nestjs/common';
import { AdminAuditLogService } from './audit-log.service';

/**
 * `AdminAuditLogService` on its own, so a module can record an admin
 * action without importing the whole of `AdminModule`.
 *
 * **Why this is a separate module.** `AdminModule` imports `WalletModule`
 * and `OrdersModule`, so neither of those can import `AdminModule` back —
 * that is a cycle, and Nest either fails to resolve it or needs
 * `forwardRef`. The practical consequence was a real hole: three
 * admin-only endpoints live *outside* `server/src/admin/**` —
 * `POST /orders/:id/refund`, `POST /wallet/adjust` and
 * `GET /users/:id` — and the two that mutate had no way to reach the
 * audit writer, so they wrote no audit row at all. Their in-module twins
 * (`POST /admin/orders/:type/:id/refund`,
 * `POST /admin/wallet/:userId/adjust`) did. Same privilege, same money,
 * half the accountability, and nothing about either file looked wrong.
 *
 * This module imports nothing but the global `PrismaModule`, so anything
 * may import it without creating a cycle.
 *
 * **It stays in `admin/` on purpose.** The folder describes *who acts*,
 * not which HTTP module the route happens to be declared in — every
 * writer of an `AdminAuditLog` row is an admin, including the ones whose
 * controller lives under `wallet/` or `orders/`. Moving the service to
 * `common/` would rename eleven imports to say something less true.
 */
@Module({
  providers: [AdminAuditLogService],
  exports: [AdminAuditLogService],
})
export class AdminAuditModule {}
