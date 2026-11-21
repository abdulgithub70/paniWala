# Edit these 3 existing files by hand (small changes, your other edits stay intact)

## 1. src/orders/orders.module.ts
Add the import and put NotificationsModule in `imports`:

    import { NotificationsModule } from '../notifications/notifications.module';
    ...
    imports: [AuthModule, NotificationsModule],

## 2. src/orders/orders.service.ts
a) add the import (next to the other imports):

    import { NotificationsService } from '../notifications/notifications.service';

b) replace the constructor line
   `constructor(private readonly prisma: PrismaService, private readonly dispatch: DispatchService) {}`
   with:

    constructor(
      private readonly prisma: PrismaService,
      private readonly dispatch: DispatchService,
      private readonly notifications: NotificationsService,
    ) {}

c) replace the whole `async cancel(customerId, id, reason?)` method with:

    async cancel(customerId: string, id: string, reason?: string) {
      const { assignedVendorId, offerVendorIds } = await this.prisma.$transaction(async (tx) => {
        await advisoryLock(tx, id);
        const order = await tx.order.findFirst({ where: { id, customerId } });
        if (!order) throw new NotFoundException();

        const cancellable: OrderStatus[] = [OrderStatus.SEARCHING, OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY];
        if (!cancellable.includes(order.status)) {
          throw new ConflictException('This order can no longer be cancelled');
        }

        const pending = await tx.orderOffer.findMany({
          where: { orderId: id, status: OfferStatus.PENDING },
          select: { vendorId: true },
        });

        await tx.order.update({
          where: { id },
          data: { status: OrderStatus.CANCELLED, cancelledBy: 'CUSTOMER', cancelReason: reason || null },
        });
        await tx.orderOffer.updateMany({
          where: { orderId: id, status: OfferStatus.PENDING },
          data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
        });
        await tx.orderEvent.create({ data: { orderId: id, status: OrderStatus.CANCELLED, actorId: customerId } });
        return { assignedVendorId: order.vendorId, offerVendorIds: pending.map((p) => p.vendorId) };
      });

      // After commit: tell the vendor who was deciding, or the one who already accepted.
      for (const vendorId of offerVendorIds) {
        void this.notifications.notifyUser(vendorId, {
          title: 'Request cancelled',
          body: 'The customer cancelled this order request.',
          channel: 'orders',
          data: { type: 'OFFER_CANCELLED', orderId: id },
        });
      }
      if (assignedVendorId) {
        void this.notifications.notifyUser(assignedVendorId, {
          title: 'Customer cancelled the order',
          body: 'You do not need to deliver this order.',
          channel: 'orders',
          data: { type: 'ORDER_CANCELLED', orderId: id },
        });
      }
      return this.getOne(customerId, id);
    }

## 3. src/orders/vendor-orders.service.ts
a) add the import:

    import { NotificationsService } from '../notifications/notifications.service';

b) replace the constructor line
   `constructor(private readonly prisma: PrismaService, private readonly dispatch: DispatchService) {}`
   with this constructor plus the helper right below it:

    constructor(
      private readonly prisma: PrismaService,
      private readonly dispatch: DispatchService,
      private readonly notifications: NotificationsService,
    ) {}

    /** Push to the order's customer after the change is committed. Never throws. */
    private notifyCustomer(orderId: string, title: string, body: string) {
      void this.prisma.order
        .findUnique({ where: { id: orderId }, select: { customerId: true } })
        .then((o) =>
          o
            ? this.notifications.notifyUser(o.customerId, {
                title, body, channel: 'orders', data: { type: 'ORDER_UPDATE', orderId },
              })
            : undefined,
        )
        .catch(() => undefined);
    }

c) in `accept(...)`, replace its last line `return this.getOrder(vendorId, orderId);` with:

    const vendorUser = await this.prisma.user.findUnique({ where: { id: vendorId }, select: { name: true } });
    this.notifyCustomer(orderId, 'Vendor accepted your order', `${vendorUser?.name ?? 'Your vendor'} will bring your water.`);
    return this.getOrder(vendorId, orderId);

d) in `updateStatus(...)`, replace its last line `return this.getOrder(vendorId, id);` with:

    const text: Record<string, [string, string]> = {
      ON_THE_WAY: ['Vendor is on the way', 'Your water is on its way.'],
      ARRIVED: ['Vendor has arrived', 'Please collect your water.'],
      DELIVERED: ['Order delivered', 'Thank you! Please pay cash to the vendor.'],
    };
    if (text[next]) this.notifyCustomer(id, text[next][0], text[next][1]);
    return this.getOrder(vendorId, id);

e) in `cancel(...)` (the vendor one), replace its last line `return this.getOrder(vendorId, id);` with:

    this.notifyCustomer(id, 'Vendor cancelled your order', 'Please place your order again.');
    return this.getOrder(vendorId, id);
