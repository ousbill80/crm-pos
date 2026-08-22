import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NiveauFidelite, SegmentClient, TypeClient } from '@caisse-crm/shared';

// Ciblage campagne / exploitation magasin (§6.6) : segment, fidélité, type,
// consentement marketing, recherche nom/téléphone (`q`).
export class ListClientsQueryDto {
  @IsOptional()
  @IsEnum(SegmentClient)
  segment?: SegmentClient;

  @IsOptional()
  @IsEnum(NiveauFidelite)
  niveauFidelite?: NiveauFidelite;

  @IsOptional()
  @IsEnum(TypeClient)
  typeClient?: TypeClient;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  consentementMarketing?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;
}
