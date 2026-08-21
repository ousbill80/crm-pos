import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

  /** Référence de livraison (BL). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  /** Ligne de bon de commande — plafonne la quantité restante. */
  @IsOptional()
  @IsUUID()
  ligneCommandeId?: string;
}
