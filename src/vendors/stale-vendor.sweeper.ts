import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AUTO_OFFLINE_SEC } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';

/** Vendors whose app died or lost signal for a long time are put offline so state never lies. */
@Injectable()
export class StaleVendorSweeper {
  private readonly logger = new Logger(StaleVendorSweeper.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    try {
      const cutoff = new Date(Date.now() - AUTO_OFFLINE_SEC * 1000);
      const res = await this.prisma.vendorProfile.updateMany({
        where: {
          isOnline: true,
          OR: [
            { lastLocationUpdate: { lt: cutoff } },
            { lastLocationUpdate: null, updatedAt: { lt: cutoff } },
          ],
        },
        data: { isOnline: false, latitude: null, longitude: null, locationAccuracy: null, lastLocationUpdate: null },
      });
      if (res.count > 0) this.logger.log(`Set ${res.count} stale vendor(s) offline`);
    } catch (e) {
      this.logger.error('Stale vendor sweep failed', e instanceof Error ? e.message : String(e));
    }
  }
}
