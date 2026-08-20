import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProduitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  designation?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixUnitaire?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
