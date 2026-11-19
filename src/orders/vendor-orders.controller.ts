import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CancelOrderDto, VendorStatusDto } from './dto/order.dto';
import { VendorOrdersService } from './vendor-orders.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendor')
export class VendorOrdersController {
  constructor(private readonly vendorOrders: VendorOrdersService) {}

  @Get('offers/current')
  currentOffer(@CurrentUser() user: AuthUser) {
    return this.vendorOrders.currentOffer(user.id);
  }

  @HttpCode(200)
  @Post('offers/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vendorOrders.accept(user.id, id);
  }

  @HttpCode(200)
  @Post('offers/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vendorOrders.reject(user.id, id);
  }

  // Declared before 'orders/:id' routes so "active" is not read as an id.
  @Get('orders/active')
  active(@CurrentUser() user: AuthUser) {
    return this.vendorOrders.activeOrder(user.id);
  }

  @Get('orders')
  history(@CurrentUser() user: AuthUser) {
    return this.vendorOrders.history(user.id);
  }

  @HttpCode(200)
  @Post('orders/:id/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorStatusDto) {
    return this.vendorOrders.updateStatus(user.id, id, dto.status as OrderStatus);
  }

  @HttpCode(200)
  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.vendorOrders.cancel(user.id, id, dto.reason);
  }
}
