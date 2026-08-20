import { IsIn, IsOptional } from 'class-validator';
import { StatutTransaction } from '@caisse-crm/shared';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsIn(Object.values(StatutTransaction))
  statut?: StatutTransaction;
}
