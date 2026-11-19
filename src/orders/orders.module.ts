import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DispatchService } from './dispatch.service';
import { DispatchSweeper } from './dispatch.sweeper';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorOrdersService } from './vendor-orders.service';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController, VendorOrdersController],
  providers: [OrdersService, VendorOrdersService, DispatchService, DispatchSweeper],
})
export class OrdersModule {}
