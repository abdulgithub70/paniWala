import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import { DeviceTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

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

  /** Called on logout so a logged-out phone stops receiving this account's notifications. */
  @HttpCode(200)
  @Post('device-token/remove')
  async removeDeviceToken(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token, userId: user.id } });
    return { ok: true };
  }

  /** Sends a test notification to the caller's own devices, to verify the push setup. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('test-push')
  testPush(@CurrentUser() user: AuthUser) {
    return this.notifications.notifyUser(user.id, {
      title: 'Test notification',
      body: 'Push notifications are working.',
      channel: 'orders',
      data: { type: 'TEST' },
    });
  }
}
