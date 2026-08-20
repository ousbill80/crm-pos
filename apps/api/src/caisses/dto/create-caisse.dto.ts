import { IsEnum, IsUUID } from 'class-validator';
import { TypeCaisse } from '@prisma/client';

export class CreateCaisseDto {
  @IsEnum(TypeCaisse)
  type: TypeCaisse;

  /** Obligatoire pour AUXILIAIRE. */
  @IsUUID()
  boutiqueId: string;
}
