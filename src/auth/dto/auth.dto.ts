import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class FirebaseAuthDto {
  @IsString() @IsNotEmpty()
  idToken: string;

  /** Required only on first login (registration). */
  @IsOptional() @IsString() @Length(2, 60)
  name?: string;

  @IsOptional() @IsEnum(Role)
  role?: Role;
}

export class DevAuthDto {
  @IsString() @IsNotEmpty()
  mobileNumber: string;

  @IsString() @IsNotEmpty()
  otp: string;

  @IsOptional() @IsString() @Length(2, 60)
  name?: string;

  @IsOptional() @IsEnum(Role)
  role?: Role;
}

export class RefreshDto {
  @IsString() @IsNotEmpty()
  refreshToken: string;
}

export class DeviceTokenDto {
  @IsString() @Length(20, 4096)
  token: string;
}
