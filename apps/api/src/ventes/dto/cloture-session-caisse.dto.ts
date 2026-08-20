import { IsNumber, IsString, Min, MinLength } from 'class-validator';

// Clôture de session (§5.1) : comptage contradictoire de fermeture. Génère
// automatiquement le bordereau de versement (§6.4) pour le total ESPECES de
// la session — voir VentesService.cloturerSession.
export class ClotureSessionCaisseDto {
  @IsNumber()
  @Min(0)
  fondCompteCloture: number;

  @IsString()
  @MinLength(1)
  temoinLogin: string;
}
