import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NearbyQueryDto } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('vendors')
export class NearbyController {
  constructor(private readonly vendors: VendorsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('nearby')
  nearby(@Query() q: NearbyQueryDto) {
    return this.vendors.nearby(q.lat, q.lng);
  }
}
