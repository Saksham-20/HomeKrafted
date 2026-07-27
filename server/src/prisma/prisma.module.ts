import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * `@Global()` so every feature module can inject `PrismaService` without
 * re-importing this module everywhere — the DB client is app-wide
 * infrastructure, same tier as config.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
