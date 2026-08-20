import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBoutiqueDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  adresse: string;

  @IsUUID()
  zoneId: string;
}
