import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WaveAdapter } from '../shop/psp/wave.adapter';
import { ROLES_PARAMETRES_SHOP } from './commandes-web-roles.constants';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ModeAffichagePrixShop } from '@caisse-crm/shared';

class PatchParametresShopDto {
  @IsBoolean() @IsOptional() shopActif?: boolean;
  @IsUUID() @IsOptional() entrepotWebDefautId?: string;
  @IsEnum(ModeAffichagePrixShop)
  @IsOptional()
  modeAffichagePrix?: keyof typeof ModeAffichagePrixShop;
  @IsNumber() @IsOptional() tauxTvaDefaut?: number;
  @IsBoolean() @IsOptional() fallbackPrixMagasin?: boolean;
  @IsBoolean() @IsOptional() paiementRetraitActif?: boolean;
  @IsBoolean() @IsOptional() paiementLivraisonActif?: boolean;
  @IsBoolean() @IsOptional() retraitActif?: boolean;
  @IsBoolean() @IsOptional() livraisonActive?: boolean;
  @IsNumber() @Min(0) @Max(100) @IsOptional() waveCommissionPourcent?: number;
  @Matches(/^\+\d{8,15}$/)
  @IsOptional()
  waveBeneficiaireMobile?: string;
  @IsString() @IsOptional() waveBeneficiaireNom?: string;
}

// Micro-paiement réel vers le bénéficiaire configuré (§ plan reversement
// Wave) : l'API Wave n'offre pas de vérification de destinataire gratuite,
// donc ce test dépense un montant réel minimal à chaque appel.
const MONTANT_TEST_PAYOUT_XOF = 100;

@Controller('parametres-shop')
@Roles(...ROLES_PARAMETRES_SHOP)
export class ParametresShopController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waveAdapter: WaveAdapter,
  ) {}

  @Get()
  async get() {
    return this.prisma.parametreShop.findFirstOrThrow();
  }

  @Patch()
  async patch(@Body() dto: PatchParametresShopDto) {
    const current = await this.prisma.parametreShop.findFirstOrThrow();
    return this.prisma.parametreShop.update({
      where: { id: current.id },
      data: dto,
    });
  }

  @Post('wave-payout/tester')
  async testerWavePayout(@CurrentUser() user: AuthenticatedUser) {
    const current = await this.prisma.parametreShop.findFirstOrThrow();
    const mobile = current.waveBeneficiaireMobile?.trim();
    if (!mobile) {
      throw new BadRequestException(
        'Aucun bénéficiaire Wave configuré — renseignez le numéro de téléphone avant de tester.',
      );
    }

    try {
      const result = await this.waveAdapter.payout({
        mobile,
        montantNet: MONTANT_TEST_PAYOUT_XOF,
        idempotencyKey: `wave-payout-test:${Date.now()}`,
        clientReference: `test-${current.id}-${Date.now()}`,
        ...(current.waveBeneficiaireNom
          ? { nom: current.waveBeneficiaireNom }
          : {}),
      });

      if (result.status === 'processing' || result.status === 'succeeded') {
        await this.prisma.parametreShop.update({
          where: { id: current.id },
          data: { waveBeneficiaireTesteAt: new Date() },
        });
      }

      await this.audit.record({
        utilisateurId: user.userId,
        action: 'PAYOUT_WAVE_TEST',
        entite: 'ParametreShop',
        entiteId: current.id,
        details: `Test reversement Wave vers ${mobile} — ${result.status}${result.erreurCode ? ` (${result.erreurCode})` : ''}`,
      });

      return result;
    } catch (error) {
      await this.audit.record({
        utilisateurId: user.userId,
        action: 'PAYOUT_WAVE_TEST',
        entite: 'ParametreShop',
        entiteId: current.id,
        details: `Test reversement Wave vers ${mobile} — échec : ${String(error)}`,
      });
      throw error;
    }
  }
}
