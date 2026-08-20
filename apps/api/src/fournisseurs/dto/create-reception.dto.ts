import { IsInt, IsPositive, IsString } from 'class-validator';

export class CreateReceptionDto {
  @IsString()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;
}
