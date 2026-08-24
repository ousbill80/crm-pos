import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_LIGNES_IMPORT } from '../produits-import.mapper';

export class MappingImportProduitsDto {
  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsString()
  reference?: string | null;

  @IsOptional()
  @IsString()
  codeBarres?: string | null;

  @IsOptional()
  @IsString()
  categorie?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  typeProduit?: string | null;

  @IsOptional()
  @IsString()
  prixUnitaire?: string | null;

  @IsOptional()
  @IsString()
  seuilReappro?: string | null;

  @IsOptional()
  @IsString()
  actif?: string | null;

  @IsOptional()
  @IsString()
  stock?: string | null;

  @IsOptional()
  @IsString()
  uniteMesure?: string | null;

  @IsOptional()
  @IsString()
  methodeCout?: string | null;

  @IsOptional()
  @IsString()
  strategieSortie?: string | null;

  @IsOptional()
  @IsString()
  attributs?: string | null;
}

export class ApercuImportProduitsDto {
  @IsOptional()
  @IsString()
  csv?: string;

  @IsOptional()
  @IsString()
  fichierBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nomFichier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomFeuille?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enTetes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIGNES_IMPORT)
  lignes?: string[][];

  @IsOptional()
  @ValidateNested()
  @Type(() => MappingImportProduitsDto)
  mapping?: MappingImportProduitsDto;

  @IsOptional()
  @IsIn(['UPSERT', 'CREATE_ONLY'])
  mode?: 'UPSERT' | 'CREATE_ONLY';
}

export class AppliquerImportProduitsDto extends ApercuImportProduitsDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  importerStockInitial?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  ignorerLignesEnErreur?: boolean;
}
