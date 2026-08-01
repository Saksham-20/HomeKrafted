import { Body, Controller, Get, Header, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminSettingsService } from './settings.service';
import { AdminExportsService, type ExportKind } from './exports.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * Platform settings + CSV exports (M16, M5). Both admin-only; every
 * settings write is audited with its before/after state.
 */
@Controller('admin')
@Roles('admin')
export class AdminSettingsController {
  constructor(
    private readonly settingsService: AdminSettingsService,
    private readonly exportsService: AdminExportsService,
  ) {}

  @Get('settings')
  get() {
    return this.settingsService.get();
  }

  @Patch('settings')
  update(@CurrentUser() admin: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(admin.userId, dto);
  }

  /**
   * `GET /admin/exports/:kind.csv` — `orders`, `sellers` or `payouts`.
   *
   * Returned as a real file download rather than JSON the client turns
   * into a Blob: an accountant asking for "last quarter's orders" should
   * be able to be sent a URL, and building the CSV server-side is what
   * keeps the escaping (and the formula-injection guard) in one place.
   */
  @Get('exports/:kind')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('kind') kind: string,
    @Res() res: Response,
    @Query('days') days?: string,
  ) {
    const normalised = kind.replace(/\.csv$/, '') as ExportKind;
    const windowDays = days ? Number(days) : undefined;
    const { filename, csv } = await this.exportsService.build(
      normalised,
      Number.isFinite(windowDays) ? windowDays : undefined,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // A BOM, so Excel on Windows reads the UTF-8 in a HomeKrafter's name
    // rather than mangling it into Latin-1.
    // U+FEFF as an escape rather than a literal — a raw BOM in source is
    // invisible and trips `no-irregular-whitespace`.
    res.send(`\uFEFF${csv}`);
  }
}
