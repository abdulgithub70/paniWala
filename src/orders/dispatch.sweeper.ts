import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OfferStatus, OrderStatus } from '@prisma/client';
import { SEARCH_TIMEOUT_SEC, STALE_LOCATION_SEC } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchService } from './dispatch.service';

/**
 * Timeouts live in the database (offer.expiresAt), not in setTimeout, so a server restart never
 * loses them. Every few seconds each searching order that has no live offer is moved forward.
 * Orders can now wait many minutes, so this sweep is kept cheap: orders that already have a live offer
 * are skipped, and while no vendor at all is online, waiting orders cost no transactions.
 */
@Injectable()
export class DispatchSweeper {
  private readonly logger = new Logger(DispatchSweeper.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly dispatch: DispatchService) {}

  @Interval(5000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const orders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.SEARCHING,
          offers: { none: { status: OfferStatus.PENDING, expiresAt: { gt: now } } },
        },
        select: { id: true, createdAt: true },
        take: 100,
      });
      if (orders.length === 0) return;

      const fresh = new Date(now.getTime() - STALE_LOCATION_SEC * 1000);
      const vendorsOnline = await this.prisma.vendorProfile.count({
        where: { status: 'APPROVED', isOnline: true, lastLocationUpdate: { gte: fresh } },
      });

      for (const o of orders) {
        const timedOut = (now.getTime() - o.createdAt.getTime()) / 1000 > SEARCH_TIMEOUT_SEC;
        if (vendorsOnline === 0 && !timedOut) continue; // nobody to offer to yet; timed-out orders still get closed
        try {
          await this.dispatch.dispatch(o.id);
        } catch (e) {
          this.logger.error(`dispatch failed for ${o.id}`, e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      this.logger.error('dispatch sweep failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
    }
  }
}
