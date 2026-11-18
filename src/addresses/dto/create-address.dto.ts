import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAddressDto {
  @Transform(trim) @IsString() @Length(1, 40)
  houseNumber: string;

  @Transform(trim) @IsString() @Length(1, 80)
  street: string;

  @Transform(trim) @IsString() @Length(1, 80)
  locality: string;

  /** 0 = ground floor */
  @IsInt() @Min(0) @Max(30)
  floor: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  flatNumber?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  landmark?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  instructions?: string;

  // Rough India bounding box: rejects junk or (0,0) coordinates.
  @IsNumber() @Min(6) @Max(38)
  latitude: number;

  @IsNumber() @Min(68) @Max(98)
  longitude: number;
}
