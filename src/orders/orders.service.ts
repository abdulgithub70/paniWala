import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferStatus, OrderStatus, Prisma } from '@prisma/client';
import { DEFAULT_PRICE_PAISE } from '../common/constants';
import { etaMinutesRange, haversineM } from '../common/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePrice } from '../pricing/pricing';
import { ACTIVE_ORDER_STATUSES, DispatchService } from './dispatch.service';
import { CreateOrderDto } from './dto/order.dto';
import { advisoryLock } from './order-lock';

const customerInclude = {
  address: {
    select: {
      houseNumber: true, street: true, locality: true, floor: true, flatNumber: true,
      landmark: true, instructions: true,
    },
  },
  vendor: {
    select: {
      name: true,
      mobileNumber: true,
      vendorProfile: { select: { latitude: true, longitude: true, lastLocationUpdate: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type CustomerOrderRow = Prisma.OrderGetPayload<{ include: typeof customerInclude }>;

const LIVE_WITH_VENDOR: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.ARRIVED];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly dispatch: DispatchService) {}

  private async ownAddress(customerId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({ where: { id: addressId, customerId, deletedAt: null } });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  /** Estimate only: the real price is each vendor's own, locked when that vendor accepts. */
  async quote(customerId: string, dto: CreateOrderDto) {
    const address = await this.ownAddress(customerId, dto.addressId);
    const p = calculatePrice({ unitPricePaise: DEFAULT_PRICE_PAISE, quantity: dto.quantity, floor: address.floor });
    return {
      ...p,
      isEstimate: true,
      note: 'Final price is confirmed when a vendor accepts your order',
    };
  }

  async create(customerId: string, dto: CreateOrderDto) {
    const address = await this.ownAddress(customerId, dto.addressId);
    const estimate = calculatePrice({
      unitPricePaise: DEFAULT_PRICE_PAISE, quantity: dto.quantity, floor: address.floor,
    });

    const order = await this.prisma.$transaction(async (tx) => {
      // One active order per customer, enforced under a lock so two taps cannot create two orders.
      await advisoryLock(tx, `cust:${customerId}`);
      const active = await tx.order.findFirst({
        where: { customerId, status: { in: ACTIVE_ORDER_STATUSES } },
        select: { id: true },
      });
      if (active) throw new ConflictException('You already have an order in progress');

      return tx.order.create({
        data: {
          customerId,
          addressId: address.id,
          quantity: dto.quantity,
          floor: address.floor,
          latitude: address.latitude,
          longitude: address.longitude,
          estimatePaise: estimate.totalPaise,
          events: { create: { status: OrderStatus.SEARCHING, actorId: customerId } },
        },
        select: { id: true },
      });
    });

    await this.dispatch.dispatch(order.id); // first offer goes out immediately
    return this.getOne(customerId, order.id);
  }

  async getActive(customerId: string) {
    const row = await this.prisma.order.findFirst({
      where: { customerId, status: { in: ACTIVE_ORDER_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: customerInclude,
    });
    return row ? this.toView(row) : null;
  }

  async getOne(customerId: string, id: string) {
    const row = await this.prisma.order.findFirst({ where: { id, customerId }, include: customerInclude });
    if (!row) throw new NotFoundException();
    return this.toView(row);
  }

  async list(customerId: string) {
    const rows = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: customerInclude,
    });
    return rows.map((r) => this.toView(r));
  }

  async cancel(customerId: string, id: string, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, id);
      const order = await tx.order.findFirst({ where: { id, customerId } });
      if (!order) throw new NotFoundException();

      const cancellable: OrderStatus[] = [OrderStatus.SEARCHING, OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY];
      if (!cancellable.includes(order.status)) {
        throw new ConflictException('This order can no longer be cancelled');
      }

      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED, cancelledBy: 'CUSTOMER', cancelReason: reason || null },
      });
      await tx.orderOffer.updateMany({
        where: { orderId: id, status: OfferStatus.PENDING },
        data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
      });
      await tx.orderEvent.create({ data: { orderId: id, status: OrderStatus.CANCELLED, actorId: customerId } });
    });
    return this.getOne(customerId, id);
  }

  /** What the customer may see. Vendor phone and position are revealed only after acceptance. */
  private toView(o: CustomerOrderRow) {
    const live = LIVE_WITH_VENDOR.includes(o.status);
    let vendor: Record<string, unknown> | null = null;

    if (o.vendor && (live || o.status === OrderStatus.DELIVERED)) {
      const vp = o.vendor.vendorProfile;
      const lat = vp?.latitude;
      const lng = vp?.longitude;
      const seen = vp?.lastLocationUpdate;
      const hasLoc = live && lat != null && lng != null && seen != null;
      const distanceM = hasLoc ? Math.round(haversineM(o.latitude, o.longitude, lat, lng)) : null;
      vendor = {
        name: o.vendor.name,
        mobileNumber: live ? o.vendor.mobileNumber : null,
        latitude: hasLoc ? lat : null,
        longitude: hasLoc ? lng : null,
        locationAgeSec: hasLoc ? Math.round((Date.now() - seen.getTime()) / 1000) : null,
        distanceM,
        etaMin: distanceM != null && o.status !== OrderStatus.ARRIVED ? etaMinutesRange(distanceM) : null,
      };
    }

    return {
      id: o.id,
      status: o.status,
      quantity: o.quantity,
      floor: o.floor,
      estimatePaise: o.estimatePaise,
      pricePerCanPaise: o.pricePerCanPaise,
      totalPaise: o.totalPaise,
      isPriceFinal: o.totalPaise != null,
      paymentMethod: o.paymentMethod,
      cancelledBy: o.cancelledBy,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      vendor,
    };
  }
}
