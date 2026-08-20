import { IsInt, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateReceptionDto {
  @IsString()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  // Prix d'achat unitaire réel — alimente le recalcul du coût moyen pondéré
  // (Produit.coutMoyenPondere) et l'historique des prix par fournisseur.
  @IsNumber()
  @IsPositive()
  prixAchat: number;
}
