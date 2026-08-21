import { IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

// Ouverture de session de caisse (§5.1) : comptage contradictoire — le
// témoin est résolu par login + mot de passe (ré-authentification du
// confirmateur présent).
export class CreateSessionCaisseDto {
  @IsUUID()
  caisseId: string;

  @IsNumber()
  @Min(0)
  fondInitial: number;

  @IsString()
  @MinLength(1)
  temoinLogin: string;

  @IsString()
  @MinLength(1)
  temoinPassword: string;
}
