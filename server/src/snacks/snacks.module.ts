import { Module } from '@nestjs/common';
import { SnacksController } from './snacks.controller';
import { SnacksService } from './snacks.service';

@Module({
  controllers: [SnacksController],
  providers: [SnacksService],
})
export class SnacksModule {}
