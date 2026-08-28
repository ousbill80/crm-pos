import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AmendCommandeAchatDto {
  @IsUUID()
  clientOperationId: string;

  @IsString()
  @MaxLength(500)
  motif: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  proformaReference?: string;
}

export class DecisionCommandeDto {
  @IsOptional()
  @IsUUID()
  clientOperationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class JalonCommandeDto {
  @IsUUID()
  clientOperationId: string;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ConteneurImportDto {
  @IsString()
  @MaxLength(30)
  numero: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plomb?: string;
}

export class CreateExpeditionDto {
  @IsUUID()
  clientOperationId: string;

  @IsIn(['MARITIME', 'AERIEN'])
  mode: 'MARITIME' | 'AERIEN';

  @IsString()
  @MaxLength(100)
  referenceTransport: string;

  @IsOptional()
  @IsString()
  transporteur?: string;

  @IsOptional()
  @IsString()
  portAeroportDepart?: string;

  @IsOptional()
  @IsString()
  portAeroportArrivee?: string;

  @IsOptional()
  @IsString()
  dateChargement?: string;

  @IsOptional()
  @IsString()
  eta?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConteneurImportDto)
  conteneurs?: ConteneurImportDto[];
}

export class UpdateDossierDouaneDto {
  @IsOptional()
  @IsString()
  numeroDeclaration?: string;

  @IsOptional()
  @IsString()
  regimeDouanier?: string;

  @IsOptional()
  @IsString()
  bureauDouane?: string;

  @IsOptional()
  @IsString()
  dateDeclaration?: string;

  @IsOptional()
  @IsString()
  declarant?: string;
}

export class CreateDocumentImportDto {
  @IsUUID()
  clientOperationId: string;

  @IsIn([
    'CONNAISSEMENT',
    'CERTIFICAT_ORIGINE',
    'DECLARATION_DOUANE',
    'PROFORMA',
    'AUTRE',
  ])
  type:
    | 'CONNAISSEMENT'
    | 'CERTIFICAT_ORIGINE'
    | 'DECLARATION_DOUANE'
    | 'PROFORMA'
    | 'AUTRE';

  @IsString()
  reference: string;

  @IsOptional()
  @IsString()
  dateDocument?: string;

  @IsOptional()
  @IsString()
  emetteur?: string;

  @IsOptional()
  @IsString()
  nomFichier?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  tailleOctets?: number;

  @IsOptional()
  @IsString()
  empreinteSha256?: string;

  @IsOptional()
  @IsString()
  uri?: string;
}

export class CreateCoutImportDto {
  @IsUUID()
  clientOperationId: string;

  @IsIn([
    'DROIT_DOUANE',
    'DUTY',
    'TAXE',
    'TAX',
    'FRET',
    'FREIGHT',
    'ASSURANCE',
    'INSURANCE',
    'SURESTARIE',
    'DEMURRAGE',
    'AUTRE',
  ])
  type:
    | 'DROIT_DOUANE'
    | 'DUTY'
    | 'TAXE'
    | 'TAX'
    | 'FRET'
    | 'FREIGHT'
    | 'ASSURANCE'
    | 'INSURANCE'
    | 'SURESTARIE'
    | 'DEMURRAGE'
    | 'AUTRE';

  @IsString()
  libelle: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsString()
  @MaxLength(3)
  devise: string;

  @IsNumber()
  @IsPositive()
  tauxChangeSnapshot: number;
}

export class ScenarioCoutDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsPositive()
  freight: number;

  @IsString()
  @MaxLength(3)
  currency: string;

  @IsNumber()
  @IsPositive()
  exchangeRate: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  transitDays?: number;
}

export class CompareScenariosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioCoutDto)
  scenarios: ScenarioCoutDto[];
}
