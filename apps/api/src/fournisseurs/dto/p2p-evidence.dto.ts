import { TypeEvidenceP2p } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class UploadP2pEvidenceDto {
  @IsEnum(TypeEvidenceP2p)
  type: TypeEvidenceP2p;

  @IsUUID()
  sourceId: string;
}
