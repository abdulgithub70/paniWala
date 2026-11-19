import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_CANS_PER_ORDER } from '../../common/constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** The client never sends a price. The server calculates every amount. */
export class CreateOrderDto {
  @IsUUID()
  addressId: string;

  @IsInt() @Min(1) @Max(MAX_CANS_PER_ORDER)
  quantity: number;
}

export class CancelOrderDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  reason?: string;
}

export class VendorStatusDto {
  @IsIn(['ON_THE_WAY', 'ARRIVED', 'DELIVERED'])
  status: 'ON_THE_WAY' | 'ARRIVED' | 'DELIVERED';
}
