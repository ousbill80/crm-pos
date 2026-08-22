import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCrmParametresDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilFideliteArgent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilFideliteOr?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilSegmentRegulier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilSegmentVip?: number;
}
