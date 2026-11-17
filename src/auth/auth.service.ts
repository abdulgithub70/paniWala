import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { normalizeIndianMobile } from '../common/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from './firebase.service';

// TODO: move to the Setting table when pricing is built (Step 6).
const DEFAULT_PRICE_PER_CAN_PAISE = 2000;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly firebase: FirebaseService,
  ) {}

  // ---------- login paths ----------

  async loginWithFirebase(idToken: string, name?: string, role?: Role) {
    const phone = await this.firebase.verifyPhone(idToken);
    const mobile = normalizeIndianMobile(phone);
    if (!mobile) throw new BadRequestException('Only Indian mobile numbers are supported');
    return this.loginOrRegister(mobile, name, role);
  }

  async loginWithDevOtp(mobileNumber: string, otp: string, name?: string, role?: Role) {
    const enabled = this.config.get('DEV_OTP_ENABLED') === 'true' && this.config.get('NODE_ENV') !== 'production';
    if (!enabled) throw new NotFoundException(); // endpoint does not exist outside dev
    if (otp !== (this.config.get<string>('DEV_OTP_CODE') ?? '123456')) {
      throw new UnauthorizedException('Invalid OTP');
    }
    const mobile = normalizeIndianMobile(mobileNumber);
    if (!mobile) throw new BadRequestException('Invalid mobile number');
    return this.loginOrRegister(mobile, name, role);
  }

  private async loginOrRegister(mobileNumber: string, name?: string, role?: Role) {
    const existing = await this.prisma.user.findUnique({ where: { mobileNumber } });

    if (existing) {
      // The role is fixed at registration. A different requested role is rejected, never applied.
      if (role && role !== existing.role) {
        throw new ConflictException(`This number is already registered as a ${existing.role.toLowerCase()}`);
      }
      return this.buildSession(existing);
    }

    if (!name || !role) {
      throw new NotFoundException({ code: 'REGISTRATION_REQUIRED', message: 'Name and role are required to register' });
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: name.trim(),
          mobileNumber,
          role,
          ...(role === Role.VENDOR
            ? { vendorProfile: { create: { pricePerCanPaise: DEFAULT_PRICE_PER_CAN_PAISE } } }
            : {}),
        },
      });
      return this.buildSession(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Number already registered, please log in again');
      }
      throw e;
    }
  }

  // ---------- tokens ----------

  private async buildSession(user: { id: string; name: string; mobileNumber: string; role: Role }) {
    const tokens = await this.issueTokens(user.id);
    return { ...tokens, user: { id: user.id, name: user.name, mobileNumber: user.mobileNumber, role: user.role } };
  }

  private async issueTokens(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('ACCESS_TOKEN_TTL') ?? '15m',
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  async refresh(rawToken: string) {
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!rec) throw new UnauthorizedException();

    if (rec.revokedAt) {
      // A rotated token was presented again: possible theft. Revoke every session of this user.
      await this.prisma.refreshToken.updateMany({
        where: { userId: rec.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (rec.expiresAt < new Date()) throw new UnauthorizedException();

    // Atomic rotation: only one concurrent request can consume the token.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: rec.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({ where: { id: rec.userId } });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user.id);
  }

  async logout(rawToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
