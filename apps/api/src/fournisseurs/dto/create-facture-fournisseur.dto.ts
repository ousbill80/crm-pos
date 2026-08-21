import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateFactureFournisseurDto {
  @IsUUID()
  fournisseurId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceFournisseur?: string;

  @IsOptional()
  @IsString()
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  receptionIds: string[];
}
