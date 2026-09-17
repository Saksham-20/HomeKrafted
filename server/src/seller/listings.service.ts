import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductTag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProductForMaker } from '../catalog/mappers/product.mapper';
import { AdminSettingsService } from '../admin/settings.service';
import { initialAdminSubmission, initialSubmission, requeueOnEdit } from '../catalog/moderation';
import { AttributesService } from '../catalog/attributes.service';
import {
  AttributeAnswer,
  hasMaterialAttributeChange,
  NormalisedAnswer,
  validateAttributeValues,
} from '../catalog/attribute-values';
import { dietaryTagsFromFrontend } from '../catalog/dietary-tag.util';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import {
  photoRowsFor,
  photosChangedMaterially,
  resolveListingPhotos,
} from './listing-photos';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Who is writing a listing, and therefore which review rules apply (M44).
 *
 * **`'seller'` is the default and must stay the default.** It puts a new
 * listing in the M22 queue and re-queues a material edit — the gate that
 * makes somebody other than the author look at a listing before buyers
 * do.
 *
 * `'admin'` skips both, for two different reasons. A listing an admin
 * *creates* has already been reviewed, by definition — queueing it would
 * put a listing in a queue for the person who just wrote it. And an admin
 * *edit* must not re-queue: an operator fixing a typo on a live listing
 * would take a kitchen's product off sale to do it, which is exactly the
 * failure `requeueOnEdit` exists to avoid on the seller side.
 *
 * Nothing about this widens who may call the endpoint. Both admin routes
 * live under `/api/v1/admin`, where `RolesGuard` is fail-closed.
 */
export interface ListingWriteOptions {
  actor?: 'seller' | 'admin';
  /** Required when `actor` is `'admin'` — the moderation columns record who. */
  moderatorUserId?: string;
}

/**
 * Maker listing CRUD — every method takes the caller's own `vendorId`
 * (resolved server-side from their JWT's `sellerId` by `SellerService`,
 * never a route/body param) and scopes every read + write to it. A
 * product id that exists but belongs to a different vendor 404s, exactly
 * like a nonexistent one — never leaks existence via a 403.
 */
@Injectable()
export class SellerListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attributes: AttributesService,
    private readonly settings: AdminSettingsService,
  ) {}

  async list(vendorId: string) {
    const products = await this.prisma.product.findMany({
      where: { vendorId },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    // **The maker's own view: base prices** (2026-09-16). This is the
    // portal, so every figure here is the one they typed and the one they
    // are paid; `buyerPrice` rides alongside so the list can show what a
    // shopper sees without the client re-deriving the fee.
    const rate = await this.settings.getCommissionRate();
    return products.map((p) => mapProductForMaker(p, rate));
  }

  /** Ownership-scoped: 404s (not 403) for a real product id belonging to another vendor. */
  async getOne(vendorId: string, productId: string) {
    const [product, rate] = await Promise.all([
      this.assertOwned(vendorId, productId),
      this.settings.getCommissionRate(),
    ]);
    return mapProductForMaker(product, rate);
  }


  /**
   * The complete set of categories a listing sits on, primary first.
   *
   * `ProductCategory` carries the primary too (see the model comment), so
   * this is what every write hands it: de-duplicated, primary in front,
   * and validated as a batch so a bad id is one 404 rather than a
   * half-written listing.
   */
  private async resolveCategoryIds(primaryId: string, extras: string[] | undefined): Promise<string[]> {
    const ids = [primaryId, ...(extras ?? [])].filter((id, i, all) => id && all.indexOf(id) === i);
    if (ids.length > 1) {
      const found = await this.prisma.category.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new NotFoundException('One or more categories not found');
    }
    return ids;
  }

  /**
   * G1 — check a listing's answers against what its shelf asks, and turn
   * them into rows.
   *
   * **The server is the authority** (GIFTING-REWORK §4). Until now "what
   * the form asks" lived only in the client, so nothing could refuse a
   * wrong answer — and the client's own map had drifted from the database.
   * A refusal here is a 400 carrying one sentence per field, written to be
   * shown to the person filling the form, the same shape `/sell`'s
   * `APPLICATION_INVALID` uses.
   */
  private async resolveAttributes(
    categoryId: string,
    submitted: AttributeAnswer[] | undefined,
  ): Promise<{ answers: NormalisedAnswer[]; specs: Awaited<ReturnType<AttributesService['specsFor']>> }> {
    const specs = await this.attributes.specsFor(categoryId);
    // Nothing sent and nothing required: the ordinary case for every
    // client written before G1, and for a shelf with no questions yet.
    const { problems, answers } = validateAttributeValues(specs, submitted ?? []);
    if (problems.length > 0) {
      throw new BadRequestException({
        code: 'LISTING_ATTRIBUTES_INVALID',
        message: problems[0].message,
        problems,
      });
    }
    return { answers, specs };
  }

  /**
   * Replace a listing's attribute rows with the answers given.
   *
   * A full replacement, like the shelf list and the occasion list beside
   * it: a set that only ever grows is one nobody can correct. Runs inside
   * the caller's transaction so a half-written answer set cannot outlive a
   * failed save.
   */
  private async writeAttributes(
    tx: Prisma.TransactionClient,
    productId: string,
    answers: NormalisedAnswer[],
  ) {
    await tx.productAttributeValue.deleteMany({ where: { productId } });
    if (answers.length === 0) return;

    const definitions = await tx.attributeDefinition.findMany({
      where: { key: { in: answers.map((answer) => answer.key) } },
      include: { options: true },
    });
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

    const rows: Prisma.ProductAttributeValueCreateManyInput[] = [];
    for (const answer of answers) {
      const definition = byKey.get(answer.key);
      if (!definition) continue;
      if (answer.optionValues.length > 0) {
        for (const value of answer.optionValues) {
          const option = definition.options.find((candidate) => candidate.value === value);
          if (!option) continue;
          rows.push({ productId, attributeId: definition.id, optionId: option.id });
        }
        continue;
      }
      rows.push({
        productId,
        attributeId: definition.id,
        text: answer.text,
        number: answer.number,
        boolean: answer.boolean,
      });
    }
    if (rows.length > 0) await tx.productAttributeValue.createMany({ data: rows });
  }

  /** The listing's current answers, in the shape the comparison takes. */
  private async currentAnswers(productId: string): Promise<NormalisedAnswer[]> {
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: { attribute: { select: { key: true } }, option: { select: { value: true } } },
    });
    const byKey = new Map<string, NormalisedAnswer>();
    for (const row of rows) {
      const answer = byKey.get(row.attribute.key) ?? {
        key: row.attribute.key,
        optionValues: [],
        text: null,
        number: null,
        boolean: null,
      };
      if (row.option) answer.optionValues.push(row.option.value);
      if (row.text !== null) answer.text = row.text;
      if (row.number !== null) answer.number = Number(row.number);
      if (row.boolean !== null) answer.boolean = row.boolean;
      byKey.set(row.attribute.key, answer);
    }
    return [...byKey.values()];
  }

  async create(vendorId: string, dto: CreateListingDto, options: ListingWriteOptions = {}) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.occasionIds?.length) {
      const found = await this.prisma.occasion.count({ where: { id: { in: dto.occasionIds } } });
      if (found !== dto.occasionIds.length) throw new NotFoundException('One or more occasions not found');
    }

    await this.assertSkusAvailable(dto.weightOptions.map((w) => w.sku));
    this.assertDefaultSkuPresent(dto);

    const categoryIds = await this.resolveCategoryIds(dto.categoryId, dto.categoryIds);

    // G1 — refused before anything is written, so a listing never exists
    // in a state its own shelf calls incomplete.
    const { answers } = await this.resolveAttributes(dto.categoryId, dto.attributes);

    const slug = await this.uniqueSlug(dto.name);

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug,
          vendorId,
          name: dto.name,
          categoryId: dto.categoryId,
          dietary: dietaryTagsFromFrontend(dto.dietary ?? []),
          // `?? null` rather than `?? 0`: an unanswered question is not an
          // answer of "no notice needed" (see the column's own comment).
          prepTimeMins: dto.prepTimeMins ?? null,
          defaultWeightSku: dto.defaultWeightSku,
          tags: (dto.tags ?? []) as ProductTag[],
          isPackaged: dto.isPackaged,
          isHamper: dto.isHamper ?? false,
          // M20 section flags. All three default the way a pre-M20 listing
          // behaved, so an old client that sends none of them is unchanged.
          kind: dto.kind ?? 'food',
          // A gift is always posted (owner, 2026-09-15) — courier carries
          // crafts, never food, and "local" on a craft only hid it from buyers
          // outside the maker's radius. The web forms stop asking; this holds
          // it for every client.
          shippingScope: (dto.kind ?? 'food') === 'craft' ? 'national' : (dto.shippingScope ?? 'local'),
          isSnack: dto.isSnack ?? false,
          cashbackPct: dto.cashbackPct,
          description: dto.description,
          // Craft-specific physical specs — NULL for food listings
          dimensions: dto.dimensions ?? null,
          material: dto.material ?? null,
          careInstructions: dto.careInstructions ?? null,
          ingredients: dto.ingredients ?? null,
          // `[]` on a listing nobody asked, which is not a declaration —
          // see the column comment. The form's "None of these" is a value.
          allergens: dto.allergens ?? [],
          shelfLife: dto.shelfLife ?? null,
          storageInstructions: dto.storageInstructions ?? null,
          disclaimer: dto.disclaimer ?? null,
          // G1. Every one of these defaults to "nobody was asked" rather
          // than to a value: `fulfilment` NULL matches neither Dispatch
          // filter, and `heatSafePacked` false keeps an edible gift off a
          // courier until its maker says they pack it for one.
          fulfilment: dto.fulfilment ?? null,
          isPersonalisable: dto.isPersonalisable ?? false,
          personalisationPrompt: dto.personalisationPrompt ?? null,
          personalisationMaxChars: dto.personalisationMaxChars ?? null,
          personalisationFee: dto.personalisationFee ?? null,
          packedWeightGrams: dto.packedWeightGrams ?? null,
          heatSafePacked: dto.heatSafePacked ?? false,
          netQuantity: dto.netQuantity ?? null,
          netQuantityUnit: dto.netQuantityUnit ?? null,
          genericName: dto.genericName ?? null,
          countryOfOrigin: dto.countryOfOrigin ?? null,
          // M22 — explicit rather than leaning on the column default, because
          // a reader of this method needs to see that a new listing is not
          // live yet. `submittedAt` is what the admin queue orders on.
          //
          // M44: an admin-authored listing goes straight to `active` with
          // that admin recorded in the moderation columns. See
          // `ListingWriteOptions`.
          ...(options.actor === 'admin' && options.moderatorUserId
            ? initialAdminSubmission(options.moderatorUserId)
            : initialSubmission()),
          images: {
            // A list since 2026-09-17 — `ProductImage[]` and the gallery's
            // thumbnail row have existed since M2, but every write path
            // stored exactly one row, so the row never rendered. An empty
            // list still creates no rows, which is what `<ImageSlot>`'s
            // placeholder is for.
            create: photoRowsFor(dto.name, resolveListingPhotos(dto) ?? []),
          },
          weightOptions: { create: dto.weightOptions },
          occasions: { create: (dto.occasionIds ?? []).map((occasionId) => ({ occasionId })) },
          // M58 — the complete set, primary included.
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
        include: PRODUCT_INCLUDE,
      });

      await this.writeAttributes(tx, product.id, answers);
      return product;
    });

    return mapProductForMaker(created, await this.settings.getCommissionRate());
  }

  async update(
    vendorId: string,
    productId: string,
    dto: UpdateListingDto,
    options: ListingWriteOptions = {},
  ) {
    const existing = await this.assertOwned(vendorId, productId);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }
    if (dto.occasionIds?.length) {
      const found = await this.prisma.occasion.count({ where: { id: { in: dto.occasionIds } } });
      if (found !== dto.occasionIds.length) throw new NotFoundException('One or more occasions not found');
    }
    if (dto.weightOptions?.length) {
      await this.assertSkusAvailable(
        dto.weightOptions.map((w) => w.sku),
        productId,
      );
    }
    if (dto.defaultWeightSku && dto.weightOptions?.length) {
      this.assertDefaultSkuPresent({ weightOptions: dto.weightOptions, defaultWeightSku: dto.defaultWeightSku });
    }

    // Compared as sets: order is not meaning here, and a re-ordered list
    // is not an edit anybody made.
    const existingExtras = new Set(
      existing.categories.map((c) => c.categoryId).filter((id) => id !== existing.categoryId),
    );
    const nextExtras = new Set((dto.categoryIds ?? []).filter((id) => id !== (dto.categoryId ?? existing.categoryId)));
    const categorySetChanged =
      dto.categoryIds !== undefined &&
      (existingExtras.size !== nextExtras.size || [...nextExtras].some((id) => !existingExtras.has(id)));

    // G1 — the shelf's own questions, judged against the category the
    // listing ends up on (which may be the one this edit is moving it to).
    const nextCategoryId = dto.categoryId ?? existing.categoryId;
    const attributeChange =
      dto.attributes === undefined
        ? { answers: undefined, material: false }
        : await (async () => {
            const { answers, specs } = await this.resolveAttributes(nextCategoryId, dto.attributes);
            // M22, read through attributes: only an answer the shelf calls
            // material re-queues a live listing. A colour swatch must not
            // take one off sale; the metal a bangle is made of must.
            const material = hasMaterialAttributeChange(
              specs,
              await this.currentAnswers(productId),
              answers,
            );
            return { answers, material };
          })();

    // M44 — an admin edit is a reviewed edit; see `ListingWriteOptions`.
    const existingPhotos = existing.images
      .map((image) => image.src)
      .filter((src): src is string => Boolean(src));
    const nextPhotos = resolveListingPhotos(dto);

    const requeue = options.actor === 'admin' ? {} : requeueOnEdit(
      existing.moderationStatus,
      (dto.name !== undefined && dto.name !== existing.name) ||
        (dto.description !== undefined && dto.description !== existing.description) ||
        (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) ||
        // M58 — the *extra* shelves are material too, and for the reason
        // M22 gives: re-queueing nothing makes approval a one-time
        // formality you pass by listing something innocuous. Getting
        // approved under "Pickles" and then quietly adding
        // "Shop by recipient › For Kids" is exactly that move.
        //
        // Only a set that actually **changed** counts, the same way only a
        // photo that changed does: the form posts the current list back on
        // every save, so `!== undefined` alone would re-queue a live
        // listing for editing its price.
        categorySetChanged ||
        // Only a photo that actually *changed* is material (M37). The form
        // sends the current list back on every save, so `!== undefined`
        // alone re-queued a live listing for editing its price. An empty
        // list and absent both mean "no photo" — same normalisation the
        // write path applies below. `photosChangedMaterially` decides
        // what counts now that there is more than one: the primary, or
        // the set — never a reorder of the ones already approved.
        (nextPhotos !== undefined &&
          photosChangedMaterially(nextPhotos, existingPhotos)) ||
        attributeChange.material,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.weightOptions) {
        await tx.weightOption.deleteMany({ where: { productId } });
        await tx.weightOption.createMany({ data: dto.weightOptions.map((w) => ({ ...w, productId })) });
      }
      if (dto.occasionIds) {
        await tx.productOccasion.deleteMany({ where: { productId } });
        await tx.productOccasion.createMany({ data: dto.occasionIds.map((occasionId) => ({ productId, occasionId })) });
      }
      // M58. Rewritten whenever **either** the primary or the extra list
      // is sent, because the join carries the primary too — changing only
      // `categoryId` and leaving these rows alone is how the two drift
      // apart and a listing disappears from the shelf it now claims.
      if (dto.categoryIds || dto.categoryId) {
        const ids = await this.resolveCategoryIds(dto.categoryId ?? existing.categoryId, dto.categoryIds);
        await tx.productCategory.deleteMany({ where: { productId } });
        await tx.productCategory.createMany({ data: ids.map((categoryId) => ({ productId, categoryId })) });
      }
      if (nextPhotos !== undefined) {
        // Rewritten wholesale rather than diffed: `sortOrder` decides
        // which photo is the card image, so a partial update would have
        // to renumber the survivors anyway, and the rows carry nothing
        // worth preserving (no id is referenced anywhere else).
        await tx.productImage.deleteMany({ where: { productId } });
        const rows = photoRowsFor(dto.name ?? existing.name, nextPhotos);
        if (rows.length > 0) {
          await tx.productImage.createMany({
            data: rows.map((row) => ({ ...row, productId })),
          });
        }
      }

      if (attributeChange.answers !== undefined) {
        await this.writeAttributes(tx, productId, attributeChange.answers);
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          dietary: dto.dietary ? dietaryTagsFromFrontend(dto.dietary) : undefined,
          prepTimeMins: dto.prepTimeMins,
          defaultWeightSku: dto.defaultWeightSku,
          tags: dto.tags as ProductTag[] | undefined,
          isPackaged: dto.isPackaged,
          isHamper: dto.isHamper,
          kind: dto.kind,
          // Same rule on edit, judged on the kind the listing ends up with.
          shippingScope: (dto.kind ?? existing.kind) === 'craft' ? 'national' : dto.shippingScope,
          isSnack: dto.isSnack,
          cashbackPct: dto.cashbackPct,
          description: dto.description,
          // Craft-specific physical specs — undefined means no change
          dimensions: dto.dimensions,
          material: dto.material,
          careInstructions: dto.careInstructions,
          ingredients: dto.ingredients,
          allergens: dto.allergens,
          shelfLife: dto.shelfLife,
          storageInstructions: dto.storageInstructions,
          disclaimer: dto.disclaimer,
          // G1 — `undefined` means "this save did not mention it", which
          // leaves the column alone. That is what lets a client that knows
          // nothing of these fields keep saving a listing without wiping
          // answers somebody else's screen collected.
          fulfilment: dto.fulfilment,
          isPersonalisable: dto.isPersonalisable,
          personalisationPrompt: dto.personalisationPrompt,
          personalisationMaxChars: dto.personalisationMaxChars,
          personalisationFee: dto.personalisationFee,
          packedWeightGrams: dto.packedWeightGrams,
          heatSafePacked: dto.heatSafePacked,
          netQuantity: dto.netQuantity,
          netQuantityUnit: dto.netQuantityUnit,
          genericName: dto.genericName,
          countryOfOrigin: dto.countryOfOrigin,
          ...requeue,
        },
        include: PRODUCT_INCLUDE,
      });
    });

    return mapProductForMaker(updated, await this.settings.getCommissionRate());
  }

  /**
   * Flip a single listing on or off for the day.
   *
   * `isAvailable` is the HomeKrafter's switch; `moderationStatus` is the
   * admin's. Keeping them apart means an admin un-hiding an item can't
   * silently put a dish back on sale that the cook isn't making, and a cook
   * marking themselves sold out can't override a moderation hide.
   */
  async setAvailability(vendorId: string, productId: string, isAvailable: boolean) {
    await this.assertOwned(vendorId, productId);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { isAvailable },
      include: PRODUCT_INCLUDE,
    });
    return mapProductForMaker(updated, await this.settings.getCommissionRate());
  }

  async remove(vendorId: string, productId: string): Promise<void> {
    await this.assertOwned(vendorId, productId);
    try {
      await this.prisma.product.delete({ where: { id: productId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete a listing that has existing orders, cart, wishlist, or hamper references — mark it unavailable instead',
        );
      }
      throw err;
    }
  }

  /** Also used by `SellerOrdersService`/dashboard to compute "this vendor's products" without duplicating the query. */
  async assertOwned(vendorId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    if (!product || product.vendorId !== vendorId) {
      throw new NotFoundException('Listing not found');
    }
    return product;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const exists = await this.prisma.product.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  private async assertSkusAvailable(skus: string[], excludeProductId?: string): Promise<void> {
    const clashes = await this.prisma.weightOption.findMany({ where: { sku: { in: skus } } });
    const foreignClash = clashes.find((w) => w.productId !== excludeProductId);
    if (foreignClash) {
      throw new ConflictException(`SKU "${foreignClash.sku}" is already in use`);
    }
  }

  private assertDefaultSkuPresent(dto: { weightOptions: { sku: string }[]; defaultWeightSku: string }): void {
    if (!dto.weightOptions.some((w) => w.sku === dto.defaultWeightSku)) {
      throw new BadRequestException('defaultWeightSku must match one of the provided weightOptions');
    }
  }
}
