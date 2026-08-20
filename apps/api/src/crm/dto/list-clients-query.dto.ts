import { IsEnum, IsOptional } from 'class-validator';
import { SegmentClient, NiveauFidelite } from '@caisse-crm/shared';

// Primitive backend pour un ciblage de "campagne ciblée" (§6.6) : filtrer
// les clients par segment et/ou palier de fidélité. La gestion complète de
// campagnes (création, planification, envoi) est hors périmètre de cette
// itération backend — voir le rapport de fin de tâche.
export class ListClientsQueryDto {
  @IsOptional()
  @IsEnum(SegmentClient)
  segment?: SegmentClient;

  @IsOptional()
  @IsEnum(NiveauFidelite)
  niveauFidelite?: NiveauFidelite;
}
