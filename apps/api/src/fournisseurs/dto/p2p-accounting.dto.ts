import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ModePaiementFournisseur,
  RoleLigneComptable,
  TypeCompteTresorerie,
  TypeJournalComptable,
  TypeSourceComptable,
} from '@prisma/client';

export class AccountingOperationDto {
  @IsUUID()
  clientOperationId: string;

  @IsOptional()
  @IsDateString()
  dateComptable?: string;
}

export class SensitiveAccountingOperationDto extends AccountingOperationDto {
  @IsUUID()
  challengeId: string;
}

export class CreateTreasuryAccountDto {
  @IsUUID()
  societeId: string;

  @IsString()
  @Length(2, 30)
  code: string;

  @IsString()
  @Length(2, 120)
  libelle: string;

  @IsEnum(TypeCompteTresorerie)
  type: TypeCompteTresorerie;

  @IsString()
  @Length(3, 3)
  devise: string;

  @IsUUID()
  compteComptableId: string;
}

export class TemplateLineDto {
  @IsEnum(RoleLigneComptable)
  role: RoleLigneComptable;

  @IsUUID()
  compteId: string;

  @IsInt()
  @Min(1)
  ordre: number;
}

export class CreatePostingTemplateDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  journalId: string;

  @IsString()
  @Length(2, 40)
  code: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsEnum(TypeSourceComptable)
  sourceType: TypeSourceComptable;

  @IsDateString()
  valideDu: string;

  @IsOptional()
  @IsDateString()
  valideAu?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lignes: TemplateLineDto[];
}

export class PaymentAllocationDto {
  @IsUUID()
  factureId: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  montantDevise?: number;
}

export class PaymentScheduleLineDto {
  @IsDateString()
  dateEcheance: string;

  @IsNumber()
  @IsPositive()
  montant: number;
}

export class CreatePaymentScheduleDto {
  @IsString()
  @Length(3, 3)
  devise: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleLineDto)
  echeances: PaymentScheduleLineDto[];
}

export class PrepareSupplierPaymentDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  compteTresorerieId: string;

  @IsEnum(ModePaiementFournisseur)
  mode: ModePaiementFournisseur;

  @IsString()
  @Length(3, 3)
  devise: string;

  @IsDateString()
  dateExecutionPrevue: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceInstruction?: string;

  @IsUUID()
  clientOperationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations: PaymentAllocationDto[];
}

export class ExecuteSupplierPaymentDto extends SensitiveAccountingOperationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  tauxChange?: number;
}

export class BankStatementLineDto {
  @IsInt()
  @Min(1)
  numeroLigne: number;

  @IsDateString()
  dateOperation: string;

  @IsOptional()
  @IsDateString()
  dateValeur?: string;

  @IsString()
  @MaxLength(240)
  libelle: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsNumber()
  montant: number;

  @IsString()
  @Length(3, 3)
  devise: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ImportBankStatementDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  compteTresorerieId: string;

  @IsString()
  @MaxLength(180)
  nomFichier: string;

  @IsString()
  @Length(64, 64)
  hashSha256: string;

  @IsString()
  @MaxLength(30)
  format: string;

  @IsUUID()
  clientOperationId: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BankStatementLineDto)
  lignes: BankStatementLineDto[];
}

export class ReconcileBankLineDto {
  @IsUUID()
  mouvementId: string;

  @IsUUID()
  clientOperationId: string;
}

export class AccountingRangeQueryDto {
  @IsDateString()
  du: string;

  @IsDateString()
  au: string;
}

export class AccountingReportQueryDto {
  @IsUUID()
  societeId: string;

  @IsDateString()
  du: string;

  @IsDateString()
  au: string;

  @IsOptional()
  @IsUUID()
  compteId?: string;

  @IsOptional()
  @IsUUID()
  fournisseurId?: string;

  @IsOptional()
  @IsUUID()
  journalId?: string;
}

export class AccountingPeriodQueryDto {
  @IsUUID()
  societeId: string;
}

export class AccountingJournalQueryDto {
  @IsUUID()
  societeId: string;

  @IsOptional()
  @IsUUID()
  exerciceId?: string;
}

export class CreateJournalComptableDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  exerciceId: string;

  @IsString()
  @Length(2, 12)
  code: string;

  @IsString()
  @Length(2, 120)
  libelle: string;

  @IsEnum(TypeJournalComptable)
  type: TypeJournalComptable;
}

export class UpdateJournalComptableDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  libelle?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class CreateCompteComptableDto {
  @IsUUID()
  societeId: string;

  @IsString()
  @Length(1, 8)
  numero: string;

  @IsString()
  @Length(2, 160)
  intitule: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class UpdateCompteComptableDto {
  @IsOptional()
  @IsString()
  @Length(1, 8)
  numero?: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  intitule?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class CreateNatureDepenseDto {
  @IsUUID()
  societeId: string;

  @IsString()
  @Length(2, 30)
  code: string;

  @IsString()
  @Length(2, 160)
  libelle: string;

  @IsUUID()
  compteId: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class UpdateNatureDepenseDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  libelle?: string;

  @IsOptional()
  @IsUUID()
  compteId?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class AccountingQueueQueryDto {
  @IsUUID()
  societeId: string;

  @IsOptional()
  @IsString()
  statut?: 'EN_ATTENTE' | 'POSTEE' | 'ERREUR';
}

export class ManualJournalLineDto {
  @IsUUID()
  compteId: string;

  @IsNumber()
  @Min(0)
  debit: number;

  @IsNumber()
  @Min(0)
  credit: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  libelle?: string;
}

export class ManualJournalDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  clientOperationId: string;

  @IsDateString()
  dateComptable: string;

  /** Référence de la pièce justificative interne (note, PV, décision). Obligatoire SYSCOHADA. */
  @IsString()
  @Length(3, 40)
  referencePiece: string;

  @IsString()
  @Length(2, 180)
  libelle: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  devise?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ManualJournalLineDto)
  lignes: ManualJournalLineDto[];
}

export class CloseExerciceDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  clientOperationId: string;
}

export class OpenExerciceDto {
  @IsUUID()
  societeId: string;

  @IsString()
  @Matches(/^\d{4}$/)
  code: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @IsUUID()
  clientOperationId: string;
}

export class BackfillSalesDto {
  @IsUUID()
  societeId: string;
}

export class TreasuryListQueryDto {
  @IsUUID()
  societeId: string;
}

export class BankImportListQueryDto {
  @IsUUID()
  societeId: string;

  @IsOptional()
  @IsUUID()
  compteTresorerieId?: string;
}

export class BankUnmatchedQueryDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  compteTresorerieId: string;
}

export class OpenAccountingPeriodDto {
  @IsUUID()
  societeId: string;

  @IsString()
  @Length(4, 12)
  code: string;

  @IsDateString()
  dateDebut: string;

  @IsDateString()
  dateFin: string;
}

export class LetteringQueryDto {
  @IsUUID()
  societeId: string;

  @IsIn(['401', '411'])
  compte: '401' | '411';
}

export class LetterLinesDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  clientOperationId: string;

  @IsString()
  @Matches(/^[A-Z0-9]{1,12}$/i)
  code: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  ligneIds: string[];
}

export class StornoEntryDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  clientOperationId: string;

  @IsString()
  @Length(3, 40)
  referencePiece: string;

  @IsOptional()
  @IsDateString()
  dateComptable?: string;

  @IsOptional()
  @IsString()
  @Length(2, 180)
  libelle?: string;
}
