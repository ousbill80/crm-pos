import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ModePaiement } from '@caisse-crm/shared';

class LigneVenteInputDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  // Montant de remise sur la ligne (jamais un pourcentage — évite toute
  // ambiguïté d'arrondi). Plafonné côté serveur à 20% du montant de la
  // ligne, voir VentesService.encaisserVente.
  @IsOptional()
  @IsNumber()
  @Min(0)
  remise?: number;
}

// Encaissement d'une vente (§6.3.2). montantTotal n'est jamais fourni par le
// client : toujours recalculé côté serveur à partir de Produit.prixUnitaire
// (intégrité financière — voir VentesService.encaisserVente).
export class CreateVenteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneVenteInputDto)
  lignes: LigneVenteInputDto[];

  @IsIn(Object.values(ModePaiement))
  modePaiement: ModePaiement;

  // Rattachement client optionnel — la vente anonyme doit rester possible (§6.6)
  @IsOptional()
  @IsUUID()
  clientId?: string;

  // Idempotence hors-ligne (§6.7) : UUID généré côté caisse.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientOperationId?: string;
}
