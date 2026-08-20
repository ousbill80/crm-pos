import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Série temporelle du CA quotidien (§6.3.4) pour le graphique d'évolution.
export class VentesQuotidiennesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  jours?: number = 30;
}
