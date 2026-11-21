import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: admin.app.App;

  constructor(config: ConfigService) {
    const b64 = config.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
    if (!b64) {
      this.logger.warn('Firebase is not configured: real phone OTP login and push notifications are disabled.');
      return;
    }
    const credential = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    this.app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(credential) });
  }

  /** FCM client, or undefined when Firebase is not configured. */
  get messaging(): admin.messaging.Messaging | undefined {
    return this.app?.messaging();
  }

  /** Verifies a Firebase ID token and returns the verified phone number (E.164). */
  async verifyPhone(idToken: string): Promise<string> {
    if (!this.app) throw new ServiceUnavailableException('Phone verification is not configured');
    try {
      const decoded = await this.app.auth().verifyIdToken(idToken);
      if (!decoded.phone_number) throw new Error('no phone');
      return decoded.phone_number;
    } catch {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
  }
}
