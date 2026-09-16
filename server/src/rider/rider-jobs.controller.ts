import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderJobsService } from './rider-jobs.service';
import { ArrivedDto } from './dto/arrived.dto';
import { DeliverJobDto } from './dto/deliver-job.dto';
import { FailJobDto } from './dto/fail-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs.query.dto';

/** Same ceiling as every other multipart route in this codebase (`UploadsController`, `RiderDocumentsController`). */
const MULTIPART_HARD_LIMIT_BYTES = 15 * 1024 * 1024;

const FILE_INTERCEPTOR = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 },
});

/** `/rider/jobs/*` — §2.3's delivery journey. */
@Controller('rider/jobs')
@Roles('rider')
export class RiderJobsController {
  constructor(private readonly jobs: RiderJobsService) {}

  @Get('active')
  active(@CurrentUser() user: RequestUser) {
    return this.jobs.active(user);
  }

  @Get()
  history(@CurrentUser() user: RequestUser, @Query() query: ListJobsQueryDto) {
    return this.jobs.history(user, query.page ?? 1, query.pageSize ?? 20);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/arrived-pickup')
  arrivedPickup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ArrivedDto) {
    return this.jobs.arrivedPickup(user, id, dto);
  }

  @Post(':id/pickup-photo')
  @UseInterceptors(FILE_INTERCEPTOR)
  pickupPhoto(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.jobs.pickupPhoto(user, id, file);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/picked-up')
  pickedUp(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobs.pickedUp(user, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/arrived-drop')
  arrivedDrop(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ArrivedDto) {
    return this.jobs.arrivedDrop(user, id, dto);
  }

  @Post(':id/drop-photo')
  @UseInterceptors(FILE_INTERCEPTOR)
  dropPhoto(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.jobs.dropPhoto(user, id, file);
  }

  /**
   * Not in `docs/RIDER-APP.md` §4's literal route list — that section
   * names `pickup-photo`/`drop-photo` but the same section's cross-
   * cutting rule requires a `failed_attempt` proof to exist before
   * `POST .../fail` succeeds, and nothing else in the brief opens a way
   * to upload one. Same shape as the other two proof routes.
   */
  @Post(':id/failed-photo')
  @UseInterceptors(FILE_INTERCEPTOR)
  failedPhoto(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.jobs.failedPhoto(user, id, file);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/deliver')
  deliver(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DeliverJobDto) {
    return this.jobs.deliver(user, id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/fail')
  fail(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: FailJobDto) {
    return this.jobs.fail(user, id, dto);
  }
}
