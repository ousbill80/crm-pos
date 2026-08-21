import { IsInt, IsUUID, Min } from 'class-validator';

export class CompterLigneInventaireDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @Min(0)
  quantiteComptee: number;
}
