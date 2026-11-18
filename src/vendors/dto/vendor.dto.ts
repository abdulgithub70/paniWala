import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MAX_PRICE_PAISE, MIN_PRICE_PAISE } from '../../common/constants';

export class AvailabilityDto {
  @IsBoolean()
  isOnline: boolean;
}

export class LocationDto {
  @IsNumber() @Min(6) @Max(38)
  latitude: number;

  @IsNumber() @Min(68) @Max(98)
  longitude: number;

  /** GPS accuracy radius in metres, if the device reports it. */
  @IsOptional() @IsNumber() @Min(0) @Max(100000)
  accuracy?: number;
}

export class PriceDto {
  @IsInt() @Min(MIN_PRICE_PAISE) @Max(MAX_PRICE_PAISE)
  pricePerCanPaise: number;
}

export class NearbyQueryDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng: number;
}
