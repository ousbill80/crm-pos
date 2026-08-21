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

// Initiation d'une TransactionCaisse (§6.4) : uniquement le versement d'une
// vente ou une demande de sortie de fonds depuis une caisse boutique
// (caisse auxiliaire). Le bordereau de versement est émis dans le même
// geste (montant déclaré = montant de la transaction).
export class CreateTransactionDto {
  @IsUUID()
  caisseId: string;

  @IsIn(Object.values(TypeTransaction))
  type: TypeTransaction;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsOptional()
  @IsString()
  pieceJointe?: string;

  // Idempotence hors-ligne (§6.7) : UUID généré côté client.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientOperationId?: string;
}
