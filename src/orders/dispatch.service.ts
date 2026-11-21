import { Injectable, Logger } from '@nestjs/common';
import { OfferStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  MAX_OFFER_ATTEMPTS, NEARBY_RADIUS_M, OFFER_TIMEOUT_SEC, SEARCH_TIMEOUT_SEC, STALE_LOCATION_SEC,
} from '../common/constants';
import { boundingBox, haversineM } from '../common/geo.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePrice } from '../pricing/pricing';
import { advisoryLock } from './order-lock';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.SEARCHING, OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED,
];
export const VENDOR_BUSY_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED,
];

type DispatchResult =
  | { kind: 'offer'; vendorId: string; offerId: string; orderId: string; body: string }
  | { kind: 'gave-up'; customerId: string }
  | null;

const rupees = (paise: number) => '₹' + (paise % 100 === 0 ? paise / 100 : (paise / 100).toFixed(2));
const distanceText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  /**
   * Offers the order to the nearest eligible vendor who has not been asked yet.
   * Safe to call at any time and from several places: the per-order lock serialises calls and the
   * method does nothing if an offer is already live or the order is no longer searching.
   * Push notifications go out only after the transaction has committed.
   */
  async dispatch(orderId: string): Promise<void> {
    const result = await this.prisma.$transaction(
      async (tx): Promise<DispatchResult> => {
        await advisoryLock(tx, orderId);

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || order.status !== OrderStatus.SEARCHING) return null;

        const now = new Date();

        // Offers whose time ran out are closed first.
        await tx.orderOffer.updateMany({
          where: { orderId, status: OfferStatus.PENDING, expiresAt: { lte: now } },
          data: { status: OfferStatus.EXPIRED, respondedAt: now },
        });

        const live = await tx.orderOffer.count({ where: { orderId, status: OfferStatus.PENDING } });
        if (live > 0) return null; // someone is still deciding

        const attempts = await tx.orderOffer.count({ where: { orderId } });
        const elapsedSec = (now.getTime() - order.createdAt.getTime()) / 1000;
        if (attempts >= MAX_OFFER_ATTEMPTS || elapsedSec > SEARCH_TIMEOUT_SEC) {
          const gaveUp = await this.giveUp(tx, orderId);
          return gaveUp ? { kind: 'gave-up', customerId: order.customerId } : null;
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
          select: {
            userId: true, latitude: true, longitude: true, serviceRadiusM: true, pricePerCanPaise: true,
          },
          take: 50,
        });

        const ranked = candidates
          .map((c) => ({
            userId: c.userId,
            price: c.pricePerCanPaise,
            distanceM: haversineM(order.latitude, order.longitude, c.latitude as number, c.longitude as number),
            radius: c.serviceRadiusM,
          }))
          .filter((c) => c.distanceM <= c.radius)
          .sort((a, b) => a.distanceM - b.distanceM);

        // No vendor right now: stay SEARCHING; the sweeper retries until the search window closes.
        if (ranked.length === 0) return null;

        const best = ranked[0];
        const offer = await tx.orderOffer.create({
          data: {
            orderId,
            vendorId: best.userId,
            distanceM: Math.round(best.distanceM),
            expiresAt: new Date(now.getTime() + OFFER_TIMEOUT_SEC * 1000),
          },
        });

        const amount = calculatePrice({
          unitPricePaise: best.price, quantity: order.quantity, floor: order.floor,
        }).totalPaise;
        const cans = `${order.quantity} can${order.quantity > 1 ? 's' : ''}`;
        return {
          kind: 'offer',
          vendorId: best.userId,
          offerId: offer.id,
          orderId,
          body: `${cans} · ${distanceText(best.distanceM)} away · ${rupees(amount)} cash`,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    if (!result) return;
    if (result.kind === 'offer') {
      void this.notifications.notifyUser(result.vendorId, {
        title: 'New water order!',
        body: result.body,
        channel: 'offers',
        ttlSec: OFFER_TIMEOUT_SEC,
        data: { type: 'NEW_OFFER', offerId: result.offerId, orderId: result.orderId },
      });
    } else {
      void this.notifications.notifyUser(result.customerId, {
        title: 'No vendor available',
        body: 'All nearby vendors are busy or offline. Please try again in a few minutes.',
        channel: 'orders',
        data: { type: 'ORDER_UPDATE', orderId },
      });
    }
  }

  /** Returns true if this call is the one that moved the order to NO_VENDOR_AVAILABLE. */
  private async giveUp(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
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
    return res.count === 1;
  }
}
