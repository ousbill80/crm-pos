import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ModePaiement } from '@caisse-crm/shared';

class LigneVenteInputDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;
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
}
