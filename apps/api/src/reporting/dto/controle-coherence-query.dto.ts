import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Rapprochement 3 voies (§5.2) : boutique optionnelle (réseau entier si
// absente) + période optionnelle (historique complet si absente).
export class ControleCoherenceQueryDto {
  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
