import { IsNumber, Min } from 'class-validator';

// Rapprochement (§6.4) : le Caissier Central / DAF saisit le montant
// effectivement reçu. L'écart avec le montant déclaré sur le bordereau
// détermine automatiquement VALIDEE (écart nul) ou LITIGE (écart non nul).
export class RapprocherTransactionDto {
  @IsNumber()
  @Min(0)
  montantRecu: number;
}
