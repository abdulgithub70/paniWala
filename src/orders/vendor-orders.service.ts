import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { OfferStatus, OrderStatus, Prisma } from '@prisma/client';
import { haversineM } from '../common/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePrice } from '../pricing/pricing';
import { DispatchService, VENDOR_BUSY_STATUSES } from './dispatch.service';
import { advisoryLock } from './order-lock';

const IST_OFFSET_MS = 330 * 60 * 1000;
function istStartOfToday(): Date {
  const local = Date.now() + IST_OFFSET_MS;
  const startLocal = Math.floor(local / 86_400_000) * 86_400_000;
  return new Date(startLocal - IST_OFFSET_MS);
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.ACCEPTED]: OrderStatus.ON_THE_WAY,
  [OrderStatus.ON_THE_WAY]: OrderStatus.ARRIVED,
  [OrderStatus.ARRIVED]: OrderStatus.DELIVERED,
};

const vendorOrderInclude = {
  address: {
    select: {
      houseNumber: true, street: true, locality: true, floor: true, flatNumber: true,
      landmark: true, instructions: true,
    },
  },
  customer: { select: { name: true, mobileNumber: true } },
} satisfies Prisma.OrderInclude;

type VendorOrderRow = Prisma.OrderGetPayload<{ include: typeof vendorOrderInclude }>;

@Injectable()
export class VendorOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly dispatch: DispatchService) {}

  /** Preview only: no exact address and no phone number until the vendor accepts. */
  async currentOffer(vendorId: string) {
    const now = new Date();
    const offer = await this.prisma.orderOffer.findFirst({
      where: { vendorId, status: OfferStatus.PENDING, expiresAt: { gt: now } },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true, orderId: true, distanceM: true, expiresAt: true,
        order: { select: { quantity: true, floor: true, address: { select: { locality: true } } } },
      },
    });
    if (!offer) return null;

    const profile = await this.prisma.vendorProfile.findUnique({
      where: { userId: vendorId },
      select: { pricePerCanPaise: true },
    });
    if (!profile) return null;

    const price = calculatePrice({
      unitPricePaise: profile.pricePerCanPaise, quantity: offer.order.quantity, floor: offer.order.floor,
    });
    return {
      offerId: offer.id,
      orderId: offer.orderId,
      quantity: offer.order.quantity,
      floor: offer.order.floor,
      locality: offer.order.address.locality,
      distanceM: offer.distanceM,
      amountPaise: price.totalPaise,
      expiresAt: offer.expiresAt,
      secondsLeft: Math.max(0, Math.round((offer.expiresAt.getTime() - now.getTime()) / 1000)),
    };
  }

  async accept(vendorId: string, offerId: string) {
    const orderId = await this.prisma.$transaction(
      async (tx) => {
        const offer = await tx.orderOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.vendorId !== vendorId) throw new NotFoundException();

        await advisoryLock(tx, offer.orderId);

        const profile = await tx.vendorProfile.findUnique({ where: { userId: vendorId } });
        if (!profile || profile.status !== 'APPROVED' || !profile.isOnline) {
          throw new ForbiddenException('You must be online to accept orders');
        }
        const busy = await tx.order.count({ where: { vendorId, status: { in: VENDOR_BUSY_STATUSES } } });
        if (busy > 0) throw new ConflictException('Finish your current order first');

        const now = new Date();
        const claimed = await tx.orderOffer.updateMany({
          where: { id: offerId, vendorId, status: OfferStatus.PENDING, expiresAt: { gt: now } },
          data: { status: OfferStatus.ACCEPTED, respondedAt: now },
        });
        if (claimed.count !== 1) throw new ConflictException('This request is no longer available');

        const order = await tx.order.findUnique({ where: { id: offer.orderId } });
        if (!order) throw new NotFoundException();

        // The final price is locked now, from the accepting vendor's own price.
        const price = calculatePrice({
          unitPricePaise: profile.pricePerCanPaise, quantity: order.quantity, floor: order.floor,
        });
        const taken = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.SEARCHING, vendorId: null },
          data: {
            vendorId,
            status: OrderStatus.ACCEPTED,
            pricePerCanPaise: price.unitPricePaise,
            totalPaise: price.totalPaise,
          },
        });
        // Throwing rolls back the offer update above as well.
        if (taken.count !== 1) throw new ConflictException('This request is no longer available');

        await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.ACCEPTED, actorId: vendorId } });
        return order.id;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    return this.getOrder(vendorId, orderId);
  }

  async reject(vendorId: string, offerId: string) {
    const offer = await this.prisma.orderOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.vendorId !== vendorId) throw new NotFoundException();

    await this.prisma.orderOffer.updateMany({
      where: { id: offerId, status: OfferStatus.PENDING },
      data: { status: OfferStatus.REJECTED, respondedAt: new Date() },
    });
    await this.dispatch.dispatch(offer.orderId); // next vendor right away
    return { ok: true };
  }

  async activeOrder(vendorId: string) {
    const row = await this.prisma.order.findFirst({
      where: { vendorId, status: { in: VENDOR_BUSY_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: vendorOrderInclude,
    });
    return row ? this.toView(vendorId, row) : null;
  }

  async getOrder(vendorId: string, id: string) {
    const row = await this.prisma.order.findFirst({ where: { id, vendorId }, include: vendorOrderInclude });
    if (!row) throw new NotFoundException();
    return this.toView(vendorId, row);
  }

  async updateStatus(vendorId: string, id: string, next: OrderStatus) {
    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, id);
      const order = await tx.order.findFirst({ where: { id, vendorId } });
      if (!order) throw new NotFoundException();
      if (NEXT_STATUS[order.status] !== next) {
        throw new ConflictException(`Cannot change status from ${order.status} to ${next}`);
      }
      const res = await tx.order.updateMany({ where: { id, vendorId, status: order.status }, data: { status: next } });
      if (res.count !== 1) throw new ConflictException('Order changed, please refresh');
      await tx.orderEvent.create({ data: { orderId: id, status: next, actorId: vendorId } });
    });
    return this.getOrder(vendorId, id);
  }

  async cancel(vendorId: string, id: string, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, id);
      const order = await tx.order.findFirst({ where: { id, vendorId } });
      if (!order) throw new NotFoundException();
      if (!VENDOR_BUSY_STATUSES.includes(order.status)) {
        throw new ConflictException('This order can no longer be cancelled');
      }
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED, cancelledBy: 'VENDOR', cancelReason: reason || null },
      });
      await tx.orderEvent.create({ data: { orderId: id, status: OrderStatus.CANCELLED, actorId: vendorId } });
    });
    return this.getOrder(vendorId, id);
  }

  async history(vendorId: string) {
    const since = istStartOfToday();
    const [orders, today] = await Promise.all([
      this.prisma.order.findMany({
        where: { vendorId, status: { in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] } },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        select: {
          id: true, status: true, quantity: true, floor: true, totalPaise: true, updatedAt: true,
          address: { select: { locality: true } },
        },
      }),
      this.prisma.order.aggregate({
        where: { vendorId, status: OrderStatus.DELIVERED, updatedAt: { gte: since } },
        _sum: { totalPaise: true },
        _count: true,
      }),
    ]);
    return {
      todayDelivered: today._count,
      todayEarningsPaise: today._sum.totalPaise ?? 0,
      orders,
    };
  }

  private async toView(vendorId: string, o: VendorOrderRow) {
    const vp = await this.prisma.vendorProfile.findUnique({
      where: { userId: vendorId },
      select: { latitude: true, longitude: true },
    });
    const distanceM =
      vp?.latitude != null && vp.longitude != null
        ? Math.round(haversineM(vp.latitude, vp.longitude, o.latitude, o.longitude))
        : null;
    return {
      id: o.id,
      status: o.status,
      quantity: o.quantity,
      floor: o.floor,
      pricePerCanPaise: o.pricePerCanPaise,
      totalPaise: o.totalPaise,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      distanceM,
      customer: { name: o.customer.name, mobileNumber: o.customer.mobileNumber },
    };
  }
}
