import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAdminScope } from '../../common/decorators/admin-scope.decorator';
import { RequestUser } from '../../common/types/jwt-payload.type';
import { AdminRiderZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

/** `/admin/riders/zones` — D5's circles. Part of the `riders` scope, not `catalog` or `settings`, because it is fleet configuration, not merchandising. */
@Controller('admin/riders/zones')
@Roles('admin')
@RequireAdminScope('riders')
export class AdminRiderZonesController {
  constructor(private readonly zones: AdminRiderZonesService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Post()
  create(@CurrentUser() admin: RequestUser, @Body() dto: CreateZoneDto) {
    return this.zones.create(admin.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(admin.userId, id, dto);
  }
}
