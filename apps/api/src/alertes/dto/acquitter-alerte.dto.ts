import { IsIn, IsString, MinLength } from 'class-validator';
import type { TypeAlerte } from '../alertes.service';

const TYPES_ALERTE: TypeAlerte[] = [
  'ECART_CAISSE',
  'VERSEMENT_EN_RETARD',
  'ACCES_REFUSE',
  'STOCK_BAS',
  'SEUIL_CAISSE_DEPASSE',
  'LITIGE_EN_RETARD',
  'POINT_JOUR_NON_VERSE',
  'RECEPTION_DAF_EN_ATTENTE',
  'ECART_STOCK',
];

export class AcquitterAlerteDto {
  @IsIn(TYPES_ALERTE)
  type: TypeAlerte;

  @IsString()
  @MinLength(1)
  entiteId: string;
}
