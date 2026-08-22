import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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

  // Avantage fidélité (§6.6) : remise en % à l'encaissement pour les
  // clients au palier Argent/Or. Désactivé par défaut (0).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  avantageFideliteArgentPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  avantageFideliteOrPct?: number;
}
