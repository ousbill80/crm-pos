import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class TransfererStockDto {
  @IsUUID()
  produitId: string;

  @IsUUID()
  entrepotSourceId: string;

  @IsUUID()
  entrepotDestId: string;

  @IsInt()
  @IsPositive()
  quantite: number;
}
