import { IsInt, IsOptional, IsString, Min } from 'class-validator';

// Accrual de points de fidélité (§6.6). Toujours positif : ce n'est pas un
// endpoint de rachat/débit de points (non demandé par le cahier des
// charges) — uniquement le crédit de points acquis.
export class AddPointsDto {
  @IsInt()
  @Min(1)
  points: number;

  @IsOptional()
  @IsString()
  motif?: string;
}
