import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminCollectionsService } from './collections.service';
import { UpsertCollectionDto } from './dto/upsert-collection.dto';
import { UpdateOccasionDto } from './dto/update-occasion.dto';

/** Occasion `Collection` CMS — title/description/occasion + ordered product membership. */
@Controller('admin/collections')
@Roles('admin')
export class AdminCollectionsController {
  constructor(private readonly collectionsService: AdminCollectionsService) {}

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
