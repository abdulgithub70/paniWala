import { Injectable, Logger } from '@nestjs/common';
import { OfferStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  MAX_OFFER_ATTEMPTS, NEARBY_RADIUS_M, OFFER_TIMEOUT_SEC, SEARCH_TIMEOUT_SEC, STALE_LOCATION_SEC,
} from '../common/constants';
import { boundingBox, haversineM } from '../common/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { advisoryLock } from './order-lock';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.SEARCHING, OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED,
];
export const VENDOR_BUSY_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED,
];

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Offers the order to the nearest eligible vendor who has not been asked yet.
   * Safe to call at any time and from several places: the per-order lock serialises calls and the
   * method does nothing if an offer is already live or the order is no longer searching.
   */
  async dispatch(orderId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await advisoryLock(tx, orderId);

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || order.status !== OrderStatus.SEARCHING) return;

        const now = new Date();

        // Offers whose time ran out are closed first.
        await tx.orderOffer.updateMany({
          where: { orderId, status: OfferStatus.PENDING, expiresAt: { lte: now } },
          data: { status: OfferStatus.EXPIRED, respondedAt: now },
        });

        const live = await tx.orderOffer.count({ where: { orderId, status: OfferStatus.PENDING } });
        if (live > 0) return; // someone is still deciding

        const attempts = await tx.orderOffer.count({ where: { orderId } });
        const elapsedSec = (now.getTime() - order.createdAt.getTime()) / 1000;
        if (attempts >= MAX_OFFER_ATTEMPTS || elapsedSec > SEARCH_TIMEOUT_SEC) {
          await this.giveUp(tx, orderId);
          return;
        }

        const tried = await tx.orderOffer.findMany({ where: { orderId }, select: { vendorId: true } });
        const busyWithOffer = await tx.orderOffer.findMany({
          where: { status: OfferStatus.PENDING, expiresAt: { gt: now } },
          select: { vendorId: true },
        });
        const excluded = [...tried, ...busyWithOffer].map((o) => o.vendorId);

        const box = boundingBox(order.latitude, order.longitude, NEARBY_RADIUS_M);
        const fresh = new Date(now.getTime() - STALE_LOCATION_SEC * 1000);

        const candidates = await tx.vendorProfile.findMany({
          where: {
            status: 'APPROVED',
            isOnline: true,
            lastLocationUpdate: { gte: fresh },
            latitude: { gte: box.minLat, lte: box.maxLat },
            longitude: { gte: box.minLng, lte: box.maxLng },
            userId: { notIn: excluded },
            user: { vendorOrders: { none: { status: { in: VENDOR_BUSY_STATUSES } } } },
          },
          select: { userId: true, latitude: true, longitude: true, serviceRadiusM: true },
          take: 50,
        });

        const ranked = candidates
          .map((c) => ({
            userId: c.userId,
            distanceM: haversineM(order.latitude, order.longitude, c.latitude as number, c.longitude as number),
            radius: c.serviceRadiusM,
          }))
          .filter((c) => c.distanceM <= c.radius)
          .sort((a, b) => a.distanceM - b.distanceM);

        // No vendor right now: stay SEARCHING; the sweeper retries until the search window closes.
        if (ranked.length === 0) return;

        const best = ranked[0];
        await tx.orderOffer.create({
          data: {
            orderId,
            vendorId: best.userId,
            distanceM: Math.round(best.distanceM),
            expiresAt: new Date(now.getTime() + OFFER_TIMEOUT_SEC * 1000),
          },
        });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  private async giveUp(tx: Prisma.TransactionClient, orderId: string) {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.SEARCHING },
      data: { status: OrderStatus.NO_VENDOR_AVAILABLE },
    });
    if (res.count === 1) {
      await tx.orderEvent.create({ data: { orderId, status: OrderStatus.NO_VENDOR_AVAILABLE } });
      this.logger.log(`Order ${orderId}: no vendor available`);
    }
    await tx.orderOffer.updateMany({
      where: { orderId, status: OfferStatus.PENDING },
      data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
    });
  }
}
