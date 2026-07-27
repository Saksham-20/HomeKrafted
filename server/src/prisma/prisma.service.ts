import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The one `PrismaClient` instance for the app, wired into Nest's lifecycle
 * so connections open/close cleanly with the app. Inject `PrismaService`
 * anywhere a `PrismaClient` is needed — never instantiate `PrismaClient`
 * directly elsewhere.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres via Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
