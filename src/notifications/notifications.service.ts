import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../auth/firebase.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  /** Android notification channel created in the app: "offers" (loud, heads-up) or "orders". */
  channel: 'offers' | 'orders';
  data?: Record<string, string>;
  /** Drop the message if it cannot be delivered within this time (an expired offer is useless). */
  ttlSec?: number;
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService, private readonly firebase: FirebaseService) {}

  /**
   * Sends a push to every device of a user. Never throws: a failed notification must never break an order.
   * Returns counts so the test endpoint can show what happened.
   */
  async notifyUser(userId: string, msg: PushMessage): Promise<{ firebase: boolean; devices: number; sent: number }> {
    try {
      const messaging = this.firebase.messaging;
      if (!messaging) return { firebase: false, devices: 0, sent: 0 };

      const rows = await this.prisma.deviceToken.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { token: true },
      });
      const tokens = rows.map((r) => r.token);
      if (tokens.length === 0) return { firebase: true, devices: 0, sent: 0 };

      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
        android: {
          priority: 'high', // wakes a sleeping phone, needed for new-order offers
          ttl: (msg.ttlSec ?? 3600) * 1000,
          notification: { channelId: msg.channel, sound: 'default' },
        },
      });

      // Tokens of uninstalled apps are removed so they are not tried again.
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(tokens[i]);
      });
      if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });

      return { firebase: true, devices: tokens.length, sent: res.successCount };
    } catch (e) {
      this.logger.error(`push to ${userId} failed`, e instanceof Error ? e.message : String(e));
      return { firebase: true, devices: 0, sent: 0 };
    }
  }
}
