import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class AjusterStockDto {
  @IsUUID()
  produitId: string;

  @IsUUID()
  entrepotId: string;

  @IsInt()
  @Min(0)
  quantiteComptee: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reference?: string;
}
