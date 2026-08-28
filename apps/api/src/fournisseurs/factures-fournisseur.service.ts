import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { AchatsStateMachineService } from './achats-state-machine.service';
import { CreateFactureFournisseurDto } from './dto/create-facture-fournisseur.dto';
import { CreateChargeInvoiceDto } from './dto/charge-invoice.dto';
import { CreatePaiementFournisseurDto } from './dto/create-paiement-fournisseur.dto';

const INCLUDE_FACTURE = {
  fournisseur: { select: { id: true, nom: true } },
  createur: { select: { id: true, nom: true, prenom: true } },
  lignes: {
    include: {
      reception: {
        include: {
          produit: { select: { id: true, designation: true, reference: true } },
          commande: { select: { id: true, numero: true } },
        },
      },
      ligneCommande: {
        include: {
          produit: { select: { id: true, designation: true, reference: true } },
          commande: { select: { id: true, numero: true } },
        },
      },
      natureDepense: {
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
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
    const societe = await this.prisma.societe.findFirst();
    if (!societe) {
      throw new BadRequestException('Société introuvable.');
    }

    const facture = await this.prisma.factureFournisseur.create({
      data: {
        numero: this.numero('FF'),
        referenceFournisseur: dto.referenceFournisseur?.trim() || null,
        societeId: societe.id,
        nature: 'MARCHANDISE',
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

  async creerCharge(dto: CreateChargeInvoiceDto, user: AuthenticatedUser) {
    const replay = await this.prisma.factureFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: INCLUDE_FACTURE,
    });
    if (replay) return this.serialiser(replay);
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: dto.fournisseurId },
    });
    if (!fournisseur) {
      throw new NotFoundException(
        `Fournisseur ${dto.fournisseurId} introuvable.`,
      );
    }
    const natures = await this.prisma.natureDepense.findMany({
      where: {
        id: { in: dto.lignes.map((line) => line.natureDepenseId) },
        societeId: dto.societeId,
        actif: true,
      },
    });
    if (
      natures.length !==
      new Set(dto.lignes.map((line) => line.natureDepenseId)).size
    ) {
      throw new BadRequestException(
        'Une nature de dépense est introuvable, inactive ou hors société.',
      );
    }
    const natureById = new Map(natures.map((item) => [item.id, item]));
    const taxIds = dto.lignes
      .map((line) => line.tauxFiscalAchatId)
      .filter((id): id is string => Boolean(id));
    const taxes = taxIds.length
      ? await this.prisma.tauxFiscalAchat.findMany({
          where: { id: { in: [...new Set(taxIds)] }, actif: true },
        })
      : [];
    if (taxes.length !== new Set(taxIds).size) {
      throw new BadRequestException('Un taux fiscal d’achat est introuvable.');
    }
    const taxById = new Map(taxes.map((item) => [item.id, item]));
    let totalHt = new Prisma.Decimal(0);
    let totalTaxes = new Prisma.Decimal(0);
    let totalRetenues = new Prisma.Decimal(0);
    const lignesData = dto.lignes.map((line) => {
      const ht = new Prisma.Decimal(line.prixUnitaireHt).times(line.quantite);
      totalHt = totalHt.plus(ht);
      const tax = line.tauxFiscalAchatId
        ? taxById.get(line.tauxFiscalAchatId)
        : null;
      let montantTaxe = new Prisma.Decimal(0);
      if (tax) {
        montantTaxe = ht.times(tax.taux).dividedBy(100).toDecimalPlaces(2);
        if (tax.type === 'RETENUE')
          totalRetenues = totalRetenues.plus(montantTaxe);
        else totalTaxes = totalTaxes.plus(montantTaxe);
      }
      return {
        natureDepenseId: line.natureDepenseId,
        libelle:
          line.libelle?.trim() ||
          natureById.get(line.natureDepenseId)?.libelle ||
          null,
        quantite: line.quantite,
        prixUnitaire: new Prisma.Decimal(line.prixUnitaireHt),
        montantHt: ht,
        tauxFiscalAchatId: line.tauxFiscalAchatId ?? null,
        montantTaxe: montantTaxe.gt(0) ? montantTaxe : null,
        typeTaxeSnapshot: tax?.type ?? null,
        tauxTaxeSnapshot: tax?.taux ?? null,
        codeTaxeSnapshot: tax?.code ?? null,
      };
    });
    const totalTtc = totalHt.plus(totalTaxes);
    const netAPayer = totalTtc.minus(totalRetenues);
    const facture = await this.prisma.factureFournisseur.create({
      data: {
        numero: this.numero('CH'),
        referenceFournisseur: dto.referenceFournisseur?.trim() || null,
        societeId: dto.societeId,
        nature: 'CHARGE',
        fournisseurId: dto.fournisseurId,
        statutRapprochement: 'RAPPROCHEE',
        dateDocument: this.parseDate(dto.dateDocument) ?? new Date(),
        dateEcheance: this.parseDate(dto.dateEcheance),
        notes: dto.notes?.trim() || null,
        montant: netAPayer,
        totalHt,
        totalTaxes,
        totalRetenues,
        totalTtc,
        netAPayer,
        clientOperationId: dto.clientOperationId,
        createurId: user.userId,
        lignes: { create: lignesData },
      },
      include: INCLUDE_FACTURE,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_CHARGE_CREATED',
      entite: 'FactureFournisseur',
      entiteId: facture.id,
      details: JSON.stringify({
        numero: facture.numero,
        nature: 'CHARGE',
        netAPayer: netAPayer.toFixed(2),
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

  comptabiliser(id: string, user: AuthenticatedUser): Promise<never> {
    void id;
    void user;
    return Promise.reject(
      new ForbiddenException(
        'Comptabilisation hors grand livre interdite : utiliser le circuit P2P (écriture équilibrée + challenge).',
      ),
    );
  }

  payer(
    id: string,
    dto: CreatePaiementFournisseurDto,
    user: AuthenticatedUser,
  ): Promise<never> {
    void id;
    void dto;
    void user;
    return Promise.reject(
      new ForbiddenException(
        'Paiement direct interdit : préparer, faire approuver puis exécuter une proposition depuis un compte de trésorerie.',
      ),
    );
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
    const montantRef = f.netAPayer ?? f.totalTtc ?? f.montant;
    const reste = new Prisma.Decimal(montantRef).minus(paye);
    return {
      id: f.id,
      numero: f.numero,
      referenceFournisseur: f.referenceFournisseur,
      societeId: f.societeId,
      nature: f.nature,
      fournisseurId: f.fournisseurId,
      fournisseur: f.fournisseur,
      statut: f.statut,
      statutRapprochement: f.statutRapprochement,
      typeDocument: f.typeDocument,
      clientOperationId: f.clientOperationId,
      dateFacture: f.dateFacture.toISOString(),
      dateDocument: f.dateDocument?.toISOString() ?? null,
      dateEcheance: f.dateEcheance?.toISOString() ?? null,
      notes: f.notes,
      devise: f.devise,
      montant: f.montant.toFixed(2),
      totalHt: f.totalHt?.toFixed(2) ?? null,
      totalTaxes: f.totalTaxes?.toFixed(2) ?? null,
      totalRetenues: f.totalRetenues?.toFixed(2) ?? null,
      totalTtc: f.totalTtc?.toFixed(2) ?? null,
      netAPayer: f.netAPayer?.toFixed(2) ?? null,
      montantPaye: paye.toFixed(2),
      resteAPayer: reste.toFixed(2),
      createur: f.createur,
      lignes: f.lignes.map((l) => {
        const produit =
          l.reception?.produit ?? l.ligneCommande?.produit ?? null;
        const commande =
          l.reception?.commande ?? l.ligneCommande?.commande ?? null;
        const montantLigne = (
          l.montantHt ?? l.prixUnitaire.mul(l.quantite)
        ).toFixed(2);
        return {
          id: l.id,
          receptionId: l.receptionId,
          ligneCommandeId: l.ligneCommandeId,
          ligneQualiteId: l.ligneQualiteId,
          natureDepense: l.natureDepense ?? null,
          libelle: l.libelle,
          produit,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire.toFixed(2),
          montant: montantLigne,
          dateReception: l.reception?.dateReception.toISOString() ?? null,
          reference: l.reception?.reference ?? null,
          commande,
        };
      }),
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
