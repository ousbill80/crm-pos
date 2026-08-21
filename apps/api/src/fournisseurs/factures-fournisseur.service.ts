import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StatutFactureFournisseur } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { AchatsStateMachineService } from './achats-state-machine.service';
import { CreateFactureFournisseurDto } from './dto/create-facture-fournisseur.dto';
import { CreatePaiementFournisseurDto } from './dto/create-paiement-fournisseur.dto';

const INCLUDE_FACTURE = {
  fournisseur: { select: { id: true, nom: true } },
  createur: { select: { id: true, nom: true, prenom: true } },
  lignes: {
    include: {
      reception: {
        include: {
          produit: { select: { id: true, designation: true, reference: true } },
        },
      },
    },
  },
  paiements: {
    include: { utilisateur: { select: { id: true, nom: true, prenom: true } } },
    orderBy: { datePaiement: 'asc' as const },
  },
} as const;

type FactureChargee = Prisma.FactureFournisseurGetPayload<{
  include: typeof INCLUDE_FACTURE;
}>;

@Injectable()
export class FacturesFournisseurService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly machine: AchatsStateMachineService,
  ) {}

  async creer(dto: CreateFactureFournisseurDto, user: AuthenticatedUser) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: dto.fournisseurId },
    });
    if (!fournisseur) {
      throw new NotFoundException(
        `Fournisseur ${dto.fournisseurId} introuvable.`,
      );
    }

    const receptions = await this.prisma.receptionStock.findMany({
      where: { id: { in: dto.receptionIds } },
      include: {
        ligneFacture: { include: { facture: { select: { statut: true } } } },
      },
    });
    if (receptions.length !== dto.receptionIds.length) {
      throw new BadRequestException(
        'Une réception de la facture est introuvable.',
      );
    }
    for (const r of receptions) {
      if (r.fournisseurId !== dto.fournisseurId) {
        throw new BadRequestException(
          'Toutes les réceptions d’une facture doivent appartenir au même fournisseur.',
        );
      }
      if (r.ligneFacture && r.ligneFacture.facture.statut !== 'ANNULEE') {
        throw new BadRequestException(
          `La réception ${r.id} est déjà facturée : une réception ne se facture qu’une fois.`,
        );
      }
    }

    const montant = receptions.reduce(
      (s, r) => s.plus(r.prixAchat.mul(r.quantite)),
      new Prisma.Decimal(0),
    );
    const dateEcheance = this.parseDate(dto.dateEcheance);

    const facture = await this.prisma.factureFournisseur.create({
      data: {
        numero: this.numero('FF'),
        referenceFournisseur: dto.referenceFournisseur?.trim() || null,
        fournisseurId: dto.fournisseurId,
        notes: dto.notes?.trim() || null,
        dateEcheance,
        montant,
        createurId: user.userId,
        lignes: {
          create: receptions.map((r) => ({
            receptionId: r.id,
            quantite: r.quantite,
            prixUnitaire: r.prixAchat,
          })),
        },
      },
      include: INCLUDE_FACTURE,
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_FOURNISSEUR_CREATED',
      entite: 'FactureFournisseur',
      entiteId: facture.id,
      details: JSON.stringify({
        numero: facture.numero,
        fournisseurId: dto.fournisseurId,
        receptions: dto.receptionIds.length,
        montant: montant.toFixed(2),
      }),
    });
    return this.serialiser(facture);
  }

  async lister() {
    const factures = await this.prisma.factureFournisseur.findMany({
      include: INCLUDE_FACTURE,
      orderBy: { dateFacture: 'desc' },
    });
    return factures.map((f) => this.serialiser(f));
  }

  async detail(id: string) {
    return this.serialiser(await this.charger(id));
  }

  async receptionsAFacturer(fournisseurId?: string) {
    const receptions = await this.prisma.receptionStock.findMany({
      where: {
        ligneFacture: { is: null },
        ...(fournisseurId ? { fournisseurId } : {}),
      },
      include: {
        produit: { select: { id: true, designation: true, reference: true } },
        fournisseur: { select: { id: true, nom: true } },
        commande: { select: { id: true, numero: true } },
      },
      orderBy: { dateReception: 'desc' },
    });
    return receptions.map((r) => ({
      id: r.id,
      fournisseurId: r.fournisseurId,
      fournisseur: r.fournisseur,
      produit: r.produit,
      quantite: r.quantite,
      prixAchat: r.prixAchat.toFixed(2),
      montant: r.prixAchat.mul(r.quantite).toFixed(2),
      dateReception: r.dateReception.toISOString(),
      commande: r.commande,
    }));
  }

  async comptabiliser(id: string, user: AuthenticatedUser) {
    const facture = await this.charger(id);
    this.machine.assertFacture(
      facture.statut,
      StatutFactureFournisseur.COMPTABILISEE,
    );
    if (facture.lignes.length === 0) {
      throw new BadRequestException(
        'Facture sans ligne : impossible de comptabiliser.',
      );
    }
    const updated = await this.prisma.factureFournisseur.update({
      where: { id },
      data: { statut: StatutFactureFournisseur.COMPTABILISEE },
      include: INCLUDE_FACTURE,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_FOURNISSEUR_COMPTABILISEE',
      entite: 'FactureFournisseur',
      entiteId: id,
      details: JSON.stringify({ numero: updated.numero }),
    });
    return this.serialiser(updated);
  }

  async annuler(id: string, user: AuthenticatedUser) {
    const facture = await this.charger(id);
    this.machine.assertFacture(
      facture.statut,
      StatutFactureFournisseur.ANNULEE,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.ligneFactureFournisseur.deleteMany({ where: { factureId: id } });
      return tx.factureFournisseur.update({
        where: { id },
        data: { statut: StatutFactureFournisseur.ANNULEE },
        include: INCLUDE_FACTURE,
      });
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_FOURNISSEUR_ANNULEE',
      entite: 'FactureFournisseur',
      entiteId: id,
    });
    return this.serialiser(updated);
  }

  async payer(
    id: string,
    dto: CreatePaiementFournisseurDto,
    user: AuthenticatedUser,
  ) {
    const facture = await this.charger(id);
    const dejaPaye = facture.paiements.reduce(
      (s, p) => s.plus(p.montant),
      new Prisma.Decimal(0),
    );
    const montant = new Prisma.Decimal(dto.montant);
    const reste = new Prisma.Decimal(facture.montant).minus(dejaPaye);
    if (montant.gt(reste)) {
      throw new BadRequestException(
        `Montant supérieur au reste à payer (${reste.toFixed(2)} FCFA).`,
      );
    }

    const payeApres = dejaPaye.plus(montant);
    const cible = payeApres.eq(facture.montant)
      ? StatutFactureFournisseur.PAYEE
      : StatutFactureFournisseur.PARTIELLEMENT_PAYEE;
    this.machine.assertFacture(facture.statut, cible);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.paiementFournisseur.create({
        data: {
          factureId: id,
          montant: dto.montant,
          mode: dto.mode,
          reference: dto.reference?.trim() || null,
          utilisateurId: user.userId,
        },
      });
      return tx.factureFournisseur.update({
        where: { id },
        data: { statut: cible },
        include: INCLUDE_FACTURE,
      });
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PAIEMENT_FOURNISSEUR_CREATED',
      entite: 'PaiementFournisseur',
      entiteId: updated.id,
      details: JSON.stringify({
        factureId: id,
        montant: montant.toFixed(2),
        mode: dto.mode,
        statut: cible,
      }),
    });
    return this.serialiser(updated);
  }

  private async charger(id: string): Promise<FactureChargee> {
    const facture = await this.prisma.factureFournisseur.findUnique({
      where: { id },
      include: INCLUDE_FACTURE,
    });
    if (!facture) {
      throw new NotFoundException(`Facture ${id} introuvable.`);
    }
    return facture;
  }

  private parseDate(value?: string): Date | null {
    if (!value?.trim()) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Date d’échéance invalide.');
    }
    return d;
  }

  private numero(prefix: string) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  }

  private serialiser(f: FactureChargee) {
    const paye = f.paiements.reduce(
      (s, p) => s.plus(p.montant),
      new Prisma.Decimal(0),
    );
    const reste = new Prisma.Decimal(f.montant).minus(paye);
    return {
      id: f.id,
      numero: f.numero,
      referenceFournisseur: f.referenceFournisseur,
      fournisseurId: f.fournisseurId,
      fournisseur: f.fournisseur,
      statut: f.statut,
      dateFacture: f.dateFacture.toISOString(),
      dateEcheance: f.dateEcheance?.toISOString() ?? null,
      notes: f.notes,
      montant: f.montant.toFixed(2),
      montantPaye: paye.toFixed(2),
      resteAPayer: reste.toFixed(2),
      createur: f.createur,
      lignes: f.lignes.map((l) => ({
        id: l.id,
        receptionId: l.receptionId,
        produit: l.reception.produit,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire.toFixed(2),
        montant: l.prixUnitaire.mul(l.quantite).toFixed(2),
      })),
      paiements: f.paiements.map((p) => ({
        id: p.id,
        montant: p.montant.toFixed(2),
        mode: p.mode,
        reference: p.reference,
        datePaiement: p.datePaiement.toISOString(),
        utilisateur: p.utilisateur,
      })),
    };
  }
}
