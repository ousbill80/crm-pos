import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';
import { StatutTransaction, TypeTransaction } from '@caisse-crm/shared';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsIn(Object.values(StatutTransaction))
  statut?: StatutTransaction;

  @IsOptional()
  @IsIn(Object.values(TypeTransaction))
  type?: TypeTransaction;

  @IsOptional()
  @IsUUID()
  caisseId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
