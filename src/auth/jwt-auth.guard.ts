import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Verifies the access token, then loads the user from the DATABASE.
 * The role is never read from the token or the request, so it cannot be forged.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();

    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, mobileNumber: true, role: true,
        vendorProfile: { select: { status: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    if (user.vendorProfile?.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');

    req.user = { id: user.id, name: user.name, mobileNumber: user.mobileNumber, role: user.role };
    return true;
  }
}
