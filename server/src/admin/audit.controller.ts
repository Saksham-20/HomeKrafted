import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminAuditLogService } from './audit-log.service';

/** `GET /admin/audit` — every admin mutation across this module, newest first. Optional `?targetType=`/`?actorId=` filters, `?page=`/`?pageSize=` pagination. */
@Controller('admin/audit')
@Roles('admin')
export class AdminAuditController {
  constructor(private readonly auditLog: AdminAuditLogService) {}

  @Get()
  list(
    @Query('targetType') targetType?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditLog.list({
      targetType,
      actorId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
