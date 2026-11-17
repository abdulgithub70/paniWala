import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { DevAuthDto, FirebaseAuthDto, RefreshDto } from './dto/auth.dto';

@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @HttpCode(200)
  @Post('firebase')
  firebase(@Body() dto: FirebaseAuthDto) {
    return this.auth.loginWithFirebase(dto.idToken, dto.name, dto.role);
  }

  /** Development only. Returns 404 unless DEV_OTP_ENABLED=true and NODE_ENV != production. */
  @HttpCode(200)
  @Post('dev')
  dev(@Body() dto: DevAuthDto) {
    return this.auth.loginWithDevOtp(dto.mobileNumber, dto.otp, dto.name, dto.role);
  }

  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
