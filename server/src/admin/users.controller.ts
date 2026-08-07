import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminUsersService } from './users.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users.query.dto';
import { SetUserSuspendedDto } from './dto/set-user-suspended.dto';

/** `@Roles('admin')` at the class level — the entire `/admin/*` surface is unreachable by a `consumer` or `seller` token (`403` via `RolesGuard`). Unscoped by design: every method reads/writes across every user, never filtered to the caller's own account. */
@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  list(@Query() query: ListAdminUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }

  @Patch(':id')
  setSuspended(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: SetUserSuspendedDto) {
    return this.usersService.setSuspended(admin.userId, id, dto.suspended);
  }
}
