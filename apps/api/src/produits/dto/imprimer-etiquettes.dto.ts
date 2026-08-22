import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Impression d'étiquettes code-barres en lot depuis le Catalogue. Le format
// et le contenu affiché sont choisis par l'utilisateur au moment de
// l'impression (pas de valeur par défaut imposée côté serveur) — voir
// apps/api/src/produits/produits.service.ts#preparerEtiquettes.
export class ArticleEtiquetteDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @Min(1)
  @Max(500)
  quantite: number;
}

export class ImprimerEtiquettesDto {
  @ValidateNested({ each: true })
  @Type(() => ArticleEtiquetteDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  articles: ArticleEtiquetteDto[];

  @IsIn(['ROULEAU', 'PLANCHE_A4'])
  format: 'ROULEAU' | 'PLANCHE_A4';

  @IsBoolean()
  afficherNom: boolean;

  @IsBoolean()
  afficherBoutique: boolean;

  @IsBoolean()
  afficherReference: boolean;

  // Requis si afficherBoutique est vrai — validation croisée faite dans le
  // service (produitsService.preparerEtiquettes), pas ici, car
  // class-validator ne gère pas nativement les contraintes inter-champs
  // sans un decorator custom disproportionné pour ce seul cas.
  @IsOptional()
  @IsUUID()
  boutiqueId?: string;
}
