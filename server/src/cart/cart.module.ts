import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { SettingsModule } from '../admin/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
