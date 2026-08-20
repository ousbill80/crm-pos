import { IsDateString, IsOptional } from 'class-validator';

// Filtre de période optionnel pour le tableau de bord (§6.3.4) — non
// fourni = comportement inchangé (aucun filtrage, historique complet).
export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
