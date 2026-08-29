import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TypeTransaction } from '@caisse-crm/shared';

/** Initiation publique : SORTIE_FONDS depuis caisse MAGASIN uniquement (§6.4). */
export class CreateTransactionDto {
  @IsUUID()
  caisseId: string;

  @IsIn([TypeTransaction.SORTIE_FONDS])
  type: typeof TypeTransaction.SORTIE_FONDS;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsOptional()
  @IsString()
  pieceJointe?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientOperationId?: string;

  /** Lie le bordereau au point du jour d’une session déjà clôturée. */
  @IsOptional()
  @IsUUID()
  sessionCaisseId?: string;
}
