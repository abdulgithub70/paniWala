import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchService } from './dispatch.service';

/**
 * Timeouts live in the database (offer.expiresAt), not in setTimeout, so a server restart
 * never loses them. Every few seconds we move every searching order forward.
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
      const orders = await this.prisma.order.findMany({
        where: { status: OrderStatus.SEARCHING },
        select: { id: true },
        take: 100,
      });
      for (const o of orders) {
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
