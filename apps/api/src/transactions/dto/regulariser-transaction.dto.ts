import { IsNumber, IsString, Min, MinLength } from 'class-validator';

// Régularisation d'un LITIGE (§6.4) : Contrôle interne / DAF retiennent un
// montant définitif et un motif obligatoire. Transition unique LITIGE → VALIDEE.
export class RegulariserTransactionDto {
  @IsNumber()
  @Min(0)
  montantRetenu: number;

  @IsString()
  @MinLength(1)
  motif: string;
}
