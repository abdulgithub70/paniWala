import { Body, Controller, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AvailabilityDto, LocationDto, PriceDto } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendor')
export class VendorController {
  constructor(private readonly vendors: VendorsService) {}

  @Put('availability')
  availability(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityDto) {
    return this.vendors.setAvailability(user.id, dto.isOnline);
  }

  // A vendor sends about 4 updates per minute; allow headroom for retries.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('location')
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.vendors.updateLocation(user.id, dto);
  }

  @Put('price')
  price(@CurrentUser() user: AuthUser, @Body() dto: PriceDto) {
    return this.vendors.setPrice(user.id, dto.pricePerCanPaise);
  }
}
