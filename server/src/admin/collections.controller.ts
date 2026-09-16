import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminCollectionsService } from './collections.service';
import { UpsertCollectionDto } from './dto/upsert-collection.dto';
import { CreateOccasionDto } from './dto/create-occasion.dto';
import { UpdateOccasionDto } from './dto/update-occasion.dto';
import {
  ArchiveCategoryDto,
  CreateCategoryDto,
  MergeCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import {
  CreateAttributeDto,
  CreateAttributeOptionDto,
  SetShelfQuestionDto,
  UpdateAttributeDto,
} from './dto/attribute.dto';
import { AdminCategoriesService } from './categories.service';
import { AdminAttributesService } from './attributes.service';

/** Occasion `Collection` CMS — title/description/occasion + ordered product membership. */
@Controller('admin/collections')
@Roles('admin')
// Collections and occasions are merchandising over the catalogue.
@RequireAdminScope('catalog')
export class AdminCollectionsController {
  constructor(
    private readonly collectionsService: AdminCollectionsService,
    private readonly categoriesService: AdminCategoriesService,
    private readonly attributesService: AdminAttributesService,
  ) {}

  /**
   * The category tree — parents with their subcategories nested.
   *
   * Declared above `:id` for the same declaration-order reason as
   * `occasions` below: Nest matches in order, and the reverse resolves
   * `/admin/collections/categories` to a collection whose id is literally
   * "categories".
   */
  @Get('categories')
  listCategories() {
    return this.categoriesService.tree();
  }

  /**
   * The only route in the product that creates a `Category` (M58) — the
   * admin panel's "+" button. A HomeKrafter *asks* through
   * `POST /seller/taxonomy-suggestions`; they never mint one, because a
   * category is a shared vocabulary the whole catalogue browses by and one
   * anybody can add to stops being one (the M43 occasion rule).
   */
  @Post('categories')
  createCategory(@CurrentUser() admin: RequestUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(admin.userId, dto as never);
  }

  /** Rename, re-parent or re-order. The slug is never re-derived — it is in every shared URL. */
  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(admin.userId, id, dto);
  }

  /**
   * G1 — retire a shelf without deleting it.
   *
   * This is how M58's recipient shelves stop being categories once
   * recipient is a facet: **archived, never dropped**, because their slugs
   * are in URLs people have shared and in everything Google has indexed.
   */
  @Patch('categories/:id/archived')
  archiveCategory(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: ArchiveCategoryDto,
  ) {
    return this.categoriesService.setArchived(admin.userId, id, dto.archived);
  }

  /**
   * G1 — fold one shelf into another, moving its listings across.
   *
   * Production holds both "Home Décor" and "Home Decor" (§3.1). The source
   * keeps resolving and redirects (`mergedIntoId`), and **nothing is
   * re-queued**: an admin tidying up our own duplicate must not take a
   * live catalogue off sale (M44).
   */
  @Post('categories/:id/merge')
  mergeCategory(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: MergeCategoryDto,
  ) {
    return this.categoriesService.merge(admin.userId, id, dto.intoId);
  }

  /**
   * G1 — the attribute templates (docs/GIFTING-REWORK.md §4).
   *
   * The point of these five routes is that **adding a question to a shelf
   * needs no deploy**. Until G1 "what the form asks" was a hardcoded map
   * in the client that had already drifted from the database, so five live
   * craft shelves appeared in no question set at all.
   */
  @Get('attributes')
  listAttributes() {
    return this.attributesService.list();
  }

  @Post('attributes')
  createAttribute(@CurrentUser() admin: RequestUser, @Body() dto: CreateAttributeDto) {
    return this.attributesService.create(admin.userId, dto);
  }

  /** The `key` is deliberately not editable — see the DTO. */
  @Patch('attributes/:id')
  updateAttribute(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.attributesService.update(admin.userId, id, dto);
  }

  @Post('attributes/:id/options')
  addAttributeOption(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateAttributeOptionDto,
  ) {
    return this.attributesService.addOption(admin.userId, id, dto);
  }

  /** Ask a question on a shelf, or (with `requirement: null`) stop asking it. */
  @Patch('categories/:id/questions')
  setShelfQuestion(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetShelfQuestionDto,
  ) {
    return this.attributesService.setShelfQuestion(
      admin.userId,
      id,
      dto.attributeId,
      dto.requirement ?? null,
    );
  }

  @Get()
  list() {
    return this.collectionsService.list();
  }

  /**
   * Declared above `:id` — Nest matches in declaration order, and the
   * reverse would resolve `/admin/collections/occasions` to a collection
   * whose id is literally "occasions".
   */
  @Get('occasions')
  listOccasions() {
    return this.collectionsService.listOccasions();
  }

  /**
   * The only route in the product that creates an `Occasion` (M43), and
   * it is under `/admin` on purpose — see `CreateOccasionDto`. Declared
   * above `POST /` for the same declaration-order reason as the GET.
   */
  @Post('occasions')
  createOccasion(@CurrentUser() admin: RequestUser, @Body() dto: CreateOccasionDto) {
    return this.collectionsService.createOccasion(admin.userId, dto);
  }

  @Patch('occasions/:id')
  updateOccasion(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateOccasionDto,
  ) {
    return this.collectionsService.updateOccasion(admin.userId, id, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.collectionsService.getById(id);
  }

  @Post()
  create(@CurrentUser() admin: RequestUser, @Body() dto: UpsertCollectionDto) {
    return this.collectionsService.create(admin.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: UpsertCollectionDto) {
    return this.collectionsService.update(admin.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.collectionsService.remove(admin.userId, id);
  }
}
