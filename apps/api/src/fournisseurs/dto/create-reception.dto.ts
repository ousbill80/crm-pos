import { IsInt, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class CreateReceptionDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  // Prix d'achat unitaire réel — alimente le recalcul du coût moyen pondéré.
  @IsNumber()
  @IsPositive()
  prixAchat: number;

  /** Entrepôt cible. Défaut = PRINCIPAL de la boutique de l'utilisateur, sinon 1er PRINCIPAL réseau. */
  @IsOptional()
  @IsUUID()
  entrepotId?: string;
}
