import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class OuvrirInventaireDto {
  @IsUUID()
  entrepotId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  motif?: string;
}
