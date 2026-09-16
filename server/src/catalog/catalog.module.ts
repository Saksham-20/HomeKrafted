import { Module } from '@nestjs/common';
import { MealsModule } from '../meals/meals.module';
import { SettingsModule } from '../admin/settings.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { CategoriesController } from './categories.controller';
import { DepartmentsController } from './departments.controller';
import { AttributesService } from './attributes.service';
import { OccasionsController } from './occasions.controller';
import { CollectionsController } from './collections.controller';
import { HamperBoxesController } from './hamper-boxes.controller';
import { TaxonomyService } from './taxonomy.service';
import { VendorProfileService } from './vendor-profile.service';
import { VendorAvailabilityService } from './vendor-availability.service';

/**
 * Public read-side of the Gifting Marketplace catalog (M8.1): products,
 * vendors/storefronts, categories, occasions, collections. Every route is
 * `@Public()` per `lib/channel.ts`'s Marketplace row ("Browse web: yes") —
 * nothing here is owner-scoped. `ProductsService` is exported since
 * `ReviewsModule`'s target-existence check reuses it indirectly via
 * `PrismaService` instead (kept decoupled — see `ReviewsService`).
 */
@Module({
  // M37 — `MealsModule` for the blackout cascade: a kitchen's day off has
  // to reach the meal deliveries already sold for that date. This is the
  // import direction that forced settings out of AdminModule (see
  // `admin/settings.module.ts`).
  // `SettingsModule` for the commission rate (2026-09-16). Stored
  // catalogue prices are the maker's base, so every buyer-facing read
  // here has to mark them up — the rate is not optional context, it is
  // part of answering "what does this cost".
  imports: [MealsModule, SettingsModule],
  controllers: [
    ProductsController,
    VendorsController,
    CategoriesController,
    DepartmentsController,
    OccasionsController,
    CollectionsController,
    HamperBoxesController,
  ],
  providers: [
    ProductsService,
    VendorsService,
    TaxonomyService,
    AttributesService,
    VendorProfileService,
    VendorAvailabilityService,
  ],
  // `VendorProfileService` is exported for `SellerModule` (the profile
  // editor) and `AdminModule` (verification), which both need the same
  // completion/trust computation the storefront renders — one definition
  // of "how complete is this profile", not three.
  // `AttributesService` is exported for `SellerModule` (the listing form
  // reads the same question set the server validates against) and
  // `AdminModule` (the attribute templates screen) — one definition of
  // "what does this shelf ask", never three.
  exports: [
    ProductsService,
    VendorsService,
    VendorProfileService,
    VendorAvailabilityService,
    AttributesService,
  ],
})
export class CatalogModule {}
