import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Export comptable du grand livre (§6.3.4, §6.7) : caisse optionnelle
// (réseau entier si absente) + période optionnelle (historique complet si
// absente).
export class ExportComptableQueryDto {
  @IsOptional()
  @IsUUID()
  caisseId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
