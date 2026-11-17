import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import { DeviceTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      select: { status: true, isOnline: true, pricePerCanPaise: true },
    });
    return { ...user, vendor };
  }

  /** Stores the FCM token. If the token was on another account (shared phone), it moves to this one. */
  @Put('device-token')
  async deviceToken(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, userId: user.id },
      update: { userId: user.id },
    });
    return { ok: true };
  }
}
