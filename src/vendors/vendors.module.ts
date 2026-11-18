import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NearbyController } from './nearby.controller';
import { StaleVendorSweeper } from './stale-vendor.sweeper';
import { VendorController } from './vendor.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule],
  controllers: [VendorController, NearbyController],
  providers: [VendorsService, StaleVendorSweeper],
})
export class VendorsModule {}
