import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { NEARBY_RADIUS_M, STALE_LOCATION_SEC } from '../common/constants';
import { boundingBox, haversineM } from '../common/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { LocationDto } from './dto/vendor.dto';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED];

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async setAvailability(userId: string, isOnline: boolean) {
    const profile = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException();

    if (isOnline) {
      if (profile.status !== 'APPROVED') throw new ForbiddenException('Your account is not approved yet');
      await this.prisma.vendorProfile.update({ where: { userId }, data: { isOnline: true } });
      return { isOnline: true };
    }

    const active = await this.prisma.order.count({
      where: { vendorId: userId, status: { in: ACTIVE_ORDER_STATUSES } },
    });
    if (active > 0) throw new ConflictException('Finish your current order before going offline');

    // Going offline also erases the stored position: nothing is tracked while offline.
    await this.prisma.vendorProfile.update({
      where: { userId },
      data: { isOnline: false, latitude: null, longitude: null, locationAccuracy: null, lastLocationUpdate: null },
    });
    return { isOnline: false };
  }

  async updateLocation(userId: string, dto: LocationDto) {
    // Only an approved, online vendor can publish a position. The timestamp is server time, never the client's.
    const res = await this.prisma.vendorProfile.updateMany({
      where: { userId, isOnline: true, status: 'APPROVED' },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationAccuracy: dto.accuracy ?? null,
        lastLocationUpdate: new Date(),
      },
    });
    if (res.count !== 1) throw new ConflictException('You are offline');
    return { ok: true, serverTime: new Date().toISOString() };
  }

  async setPrice(userId: string, pricePerCanPaise: number) {
    const res = await this.prisma.vendorProfile.updateMany({ where: { userId }, data: { pricePerCanPaise } });
    if (res.count !== 1) throw new NotFoundException();
    return { pricePerCanPaise };
  }

  async nearby(lat: number, lng: number) {
    const box = boundingBox(lat, lng, NEARBY_RADIUS_M);
    const freshSince = new Date(Date.now() - STALE_LOCATION_SEC * 1000);

    const rows = await this.prisma.vendorProfile.findMany({
      where: {
        status: 'APPROVED',
        isOnline: true,
        lastLocationUpdate: { gte: freshSince }, // stale positions are never shown as live
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
      take: 100,
      select: { id: true, latitude: true, longitude: true, lastLocationUpdate: true },
    });

    const now = Date.now();
    const vendors = rows
      .map((r) => ({
        id: r.id, // profile id, not the user id; no name or phone is exposed
        latitude: r.latitude as number,
        longitude: r.longitude as number,
        distanceM: Math.round(haversineM(lat, lng, r.latitude as number, r.longitude as number)),
        lastSeenSec: Math.round((now - (r.lastLocationUpdate as Date).getTime()) / 1000),
      }))
      .filter((v) => v.distanceM <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 20);

    return { radiusM: NEARBY_RADIUS_M, vendors };
  }
}
