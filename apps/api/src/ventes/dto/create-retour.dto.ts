import { IsInt, IsPositive, IsUUID } from 'class-validator';

// Retour/avoir sur une ligne de vente de la session de caisse en cours
// (extension au-delà du cahier des charges, assumée — voir plan de la
// tâche). Contrôles métier (session en cours, sur-retour) dans
// VentesService.creerRetour.
export class CreateRetourDto {
  @IsUUID()
  ligneVenteId: string;

  @IsInt()
  @IsPositive()
  quantite: number;
}
