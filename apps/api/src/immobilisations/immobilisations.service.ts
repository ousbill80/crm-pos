import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { GlLedgerWriter } from '../accounting-gl/gl-ledger.writer';
import { P2pAccountingCalculator } from '../fournisseurs/p2p-accounting.calculator';
import { monthlyDepreciation } from './immobilisation.calculator';
import {
  CreateImmobilisationDto,
  GenererDotationsDto,
  SortirImmobilisationDto,
} from './dto/immobilisation.dto';

@Injectable()
export class ImmobilisationsService {
  private readonly ledger: GlLedgerWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: P2pAccountingCalculator,
  ) {
    this.ledger = new GlLedgerWriter(calculator);
  }

  list(societeId: string) {
    return this.prisma.immobilisation.findMany({
      where: { societeId },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        dotations: {
          include: {
            periode: { select: { id: true, code: true } },
            ecriture: { select: { id: true, numero: true } },
          },
          orderBy: { dateCreation: 'asc' },
        },
      },
      orderBy: [{ statut: 'asc' }, { dateMiseEnService: 'desc' }],
    });
  }

  async create(dto: CreateImmobilisationDto, user: AuthenticatedUser) {
    const residuelle = new Prisma.Decimal(dto.valeurResiduelle ?? 0);
    const brute = new Prisma.Decimal(dto.valeurBrute);
    if (residuelle.gte(brute)) {
      throw new BadRequestException(
        'La valeur résiduelle doit être strictement inférieure à la valeur brute.',
      );
    }
    const compte = await this.prisma.compteComptable.findFirst({
      where: { id: dto.compteId, societeId: dto.societeId, actif: true },
    });
    if (!compte) {
      throw new BadRequestException(
        'Compte d’immobilisation introuvable pour cette société.',
      );
    }
    const numero = compte.numero.replace(/\D/g, '');
    if (!numero.startsWith('2') || numero.startsWith('28')) {
      throw new BadRequestException(
        'La fiche doit être rattachée à un compte d’immobilisation (classe 2 hors 28).',
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const immo = await tx.immobilisation.create({
        data: {
          societeId: dto.societeId,
          compteId: dto.compteId,
          libelle: dto.libelle.trim(),
          dateMiseEnService: new Date(dto.dateMiseEnService),
          valeurBrute: brute.toDecimalPlaces(2),
          dureeMois: dto.dureeMois,
          valeurResiduelle: residuelle.toDecimalPlaces(2),
          auteurId: user.userId,
        },
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
        },
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'IMMOBILISATION_CREEE',
          entite: 'IMMOBILISATION',
          entiteId: immo.id,
          details: JSON.stringify({
            libelle: immo.libelle,
            valeurBrute: immo.valeurBrute.toFixed(2),
            dureeMois: immo.dureeMois,
            compte: compte.numero,
          }),
        },
      });
      return immo;
    });
    return created;
  }

  async sortir(
    id: string,
    dto: SortirImmobilisationDto,
    user: AuthenticatedUser,
  ) {
    const immo = await this.prisma.immobilisation.findUnique({
      where: { id },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable.');
    if (immo.statut !== 'EN_SERVICE') {
      throw new BadRequestException('Cette fiche n’est plus en service.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.immobilisation.update({
        where: { id },
        data: {
          statut: 'SORTI',
          dateSortie: new Date(),
          motifSortie: dto.motif?.trim() || null,
        },
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'IMMOBILISATION_SORTIE',
          entite: 'IMMOBILISATION',
          entiteId: id,
          details: JSON.stringify({ motif: updated.motifSortie }),
        },
      });
      return updated;
    });
  }

  async genererMois(dto: GenererDotationsDto, user: AuthenticatedUser) {
    const periode = await this.prisma.periodeComptable.findFirst({
      where: { id: dto.periodeId, societeId: dto.societeId },
      include: { exercice: true },
    });
    if (!periode) {
      throw new BadRequestException('Période introuvable pour cette société.');
    }
    if (periode.cloture || periode.exercice.cloture) {
      throw new BadRequestException(
        'Impossible de doter une période ou un exercice clos.',
      );
    }
    const immos = await this.prisma.immobilisation.findMany({
      where: {
        societeId: dto.societeId,
        statut: 'EN_SERVICE',
        dateMiseEnService: { lte: periode.dateFin },
      },
      include: { dotations: true },
    });
    const results: Array<{
      immobilisationId: string;
      libelle: string;
      montant: string;
      ecritureId: string;
      numero: string;
      creee: boolean;
    }> = [];
    for (const immo of immos) {
      const existing = immo.dotations.find((d) => d.periodeId === periode.id);
      if (existing) {
        const piece = await this.prisma.ecritureComptable.findUnique({
          where: { id: existing.ecritureId },
          select: { id: true, numero: true },
        });
        results.push({
          immobilisationId: immo.id,
          libelle: immo.libelle,
          montant: existing.montant.toFixed(2),
          ecritureId: existing.ecritureId,
          numero: piece?.numero ?? '',
          creee: false,
        });
        continue;
      }
      const montant = monthlyDepreciation({
        valeurBrute: immo.valeurBrute,
        valeurResiduelle: immo.valeurResiduelle,
        dureeMois: immo.dureeMois,
        cumulDejaDote: immo.dotations.reduce(
          (sum, d) => sum.plus(d.montant),
          new Prisma.Decimal(0),
        ),
        nombreDotationsDeja: immo.dotations.length,
      });
      if (!montant || montant.lte(0)) continue;
      const sourceId = `${immo.id}:${periode.id}`;
      const posted = await this.prisma.$transaction(
        async (tx) => {
          const replay = await tx.ecritureComptable.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: 'AMORTISSEMENT_IMMO',
                sourceId,
              },
            },
          });
          if (replay) {
            return { entry: replay, creee: false };
          }
          const context = await this.ledger.context(
            tx,
            dto.societeId,
            'AMORTISSEMENT_IMMO',
            periode.dateFin,
          );
          const lines = this.calculator.depreciation(montant);
          const entry = await this.ledger.createEntry(tx, {
            context,
            sourceType: 'AMORTISSEMENT_IMMO',
            sourceId,
            label: `Dotation ${periode.code} — ${immo.libelle}`,
            date: periode.dateFin,
            currency: 'XOF',
            operationId: `immo-${sourceId}`,
            authorId: user.userId,
            lines,
          });
          await tx.dotationImmobilisation.create({
            data: {
              immobilisationId: immo.id,
              periodeId: periode.id,
              montant,
              ecritureId: entry.id,
            },
          });
          await tx.journalAudit.create({
            data: {
              utilisateurId: user.userId,
              action: 'DOTATION_IMMO_POSTEE',
              entite: 'IMMOBILISATION',
              entiteId: immo.id,
              details: JSON.stringify({
                periodeId: periode.id,
                montant: montant.toFixed(2),
                ecritureId: entry.id,
              }),
            },
          });
          return { entry, creee: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      results.push({
        immobilisationId: immo.id,
        libelle: immo.libelle,
        montant: montant.toFixed(2),
        ecritureId: posted.entry.id,
        numero: posted.entry.numero,
        creee: posted.creee,
      });
    }
    return {
      periode: { id: periode.id, code: periode.code },
      dotations: results,
    };
  }
}
