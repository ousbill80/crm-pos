import { IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

// Ouverture de session de caisse (§5.1) : comptage contradictoire — le
// témoin est résolu par login (voir VentesService.resoudreTemoin), sans
// ré-authentification (simplification assumée, cf. plan de la tâche).
export class CreateSessionCaisseDto {
  @IsUUID()
  caisseId: string;

  @IsNumber()
  @Min(0)
  fondInitial: number;

  @IsString()
  @MinLength(1)
  temoinLogin: string;
}
