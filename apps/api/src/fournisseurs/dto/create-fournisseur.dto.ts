import { IsOptional, IsString, MinLength } from 'class-validator';

// Fiche fournisseur simple (§6.5, extension validée avec l'utilisateur) —
// pas de facturation/échéances, réservé à la fiche + réception de stock.
export class CreateFournisseurDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsOptional()
  @IsString()
  contact?: string;
}
