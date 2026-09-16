import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiderController } from './rider.controller';
import { RiderOnboardingService } from './rider.service';
import { RiderDocumentsController } from './rider-documents.controller';
import { RiderDocumentsService } from './rider-documents.service';
import { RiderEnrolmentController } from './rider-enrolment.controller';
import { RiderEnrolmentService } from './rider-enrolment.service';
import { RiderSettingsService } from './rider-settings.service';
import { RiderDutyController } from './rider-duty.controller';
import { RiderDutyService } from './rider-duty.service';
import { DispatchService } from './dispatch.service';
import { RiderOffersController } from './rider-offers.controller';
import { RiderJobsController } from './rider-jobs.controller';
import { RiderJobsService } from './rider-jobs.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { DeliveryOrderReconcileService } from './delivery-order-reconcile.service';
import { RiderCashController } from './rider-cash.controller';
import { RiderCashService } from './rider-cash.service';

/**
 * R1/R2 — the owner-scoped `/rider/*` API plus `/rider-enrolment`. The
 * inverse of `SellerModule`: every controller here scopes to the
 * caller's own `Rider` row, resolved fresh from the database
 * (`RiderOnboardingService.resolveRider`), never from a client-supplied
 * id. `AdminModule` imports its own `src/admin/riders/*` surface
 * separately — this module owns nothing admin-facing.
 *
 * `DeliveryJobsService` (R2's `createForOrder`) and
 * `DeliveryOrderReconcileService` are **exported**, not only provided:
 * `AdminModule`'s `src/admin/riders/deliveries.*` calls the first for the
 * manual-dispatch route (`POST /admin/deliveries`) and the second for
 * `override-deliver`, the same one-way import shape `SellerModule`
 * exports `SellerListingsService` for `AdminModule` to reuse rather than
 * growing a second writer.
 */
@Module({
  // `AuthModule` for `AuthService.issueSessionForRoleChange` — enrolment
  // mints a fresh token pair the moment `role` changes. R2 adds
  // `UploadsModule` (proof photos, purpose `delivery`), `OrdersModule`
  // (`OrderNotificationsService` — a job's status writes owe the buyer a
  // message, M18) and `NotificationsModule` (the dispatcher's "no
  // candidate" admin alert).
  imports: [AuthModule, UploadsModule, OrdersModule, NotificationsModule],
  controllers: [
    RiderController,
    RiderDocumentsController,
    RiderEnrolmentController,
    RiderDutyController,
    RiderOffersController,
    RiderJobsController,
    // R3 (docs/RIDER-APP.md) — cash & payouts, the rider's own side.
    RiderCashController,
  ],
  providers: [
    RiderOnboardingService,
    RiderDocumentsService,
    RiderEnrolmentService,
    RiderSettingsService,
    RiderDutyService,
    DispatchService,
    RiderJobsService,
    DeliveryJobsService,
    DeliveryOrderReconcileService,
    RiderCashService,
  ],
  exports: [DeliveryJobsService, DeliveryOrderReconcileService],
})
export class RiderModule {}
