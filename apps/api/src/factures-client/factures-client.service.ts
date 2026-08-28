import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
import { SalesGlService } from '../accounting-gl/sales-gl.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  CreateFactureClientDto,
  EncaissementFactureClientDto,
  LigneFactureClientDto,
  ListFactureClientQueryDto,
  TransitionFactureClientDto,
  UpdateFactureClientDto,
} from './dto/facture-client.dto';
import {
  ROLES_FACTURE_CLIENT_ECRITURE,
  ROLES_FACTURE_CLIENT_ENCAISSEMENT,
  ROLES_FACTURE_CLIENT_LECTURE,
  TAUX_TVA_DEFAUT_FACTURE,
  transitionFactureClientAutorisee,
  transitionsFactureClientAutorisees,
  type StatutFactureClient,
} from './facture-client-rules.constants';

const includeFacture = {
  client: {
    select: {
      id: true,
      nom: true,
      prenom: true,
      contact: true,
      adresse: true,
      typeClient: true,
    },
  },
  boutique: { select: { id: true, nom: true } },
  devis: { select: { id: true, numero: true, statut: true, venteId: true } },
  lignes: { include: { produit: { select: { id: true, designation: true } } } },
  paiements: { orderBy: { datePaiement: 'asc' as const } },
} satisfies Prisma.FactureClientInclude;

type FactureChargee = Prisma.FactureClientGetPayload<{
  include: typeof includeFacture;
}>;

@Injectable()
export class FacturesClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly salesGl: SalesGlService,
  ) {}

  private assertLecture(user: AuthenticatedUser) {
    if (!ROLES_FACTURE_CLIENT_LECTURE.includes(user.role)) {
      throw new ForbiddenException(
        'Non habilité à consulter les factures client.',
      );
    }
  }

  private assertEcriture(user: AuthenticatedUser) {
    if (!ROLES_FACTURE_CLIENT_ECRITURE.includes(user.role)) {
      throw new ForbiddenException(
        'Non habilité à modifier les factures client.',
      );
    }
  }

  private assertEncaissement(user: AuthenticatedUser) {
    if (!ROLES_FACTURE_CLIENT_ENCAISSEMENT.includes(user.role)) {
      throw new ForbiddenException(
        'Non habilité à encaisser une facture client.',
      );
    }
  }

  private async tauxTvaDefaut(): Promise<number> {
    const params = await this.prisma.parametreShop.findFirst();
    if (!params) return TAUX_TVA_DEFAUT_FACTURE;
    return Number(params.tauxTvaDefaut);
  }

  private montantLigne(
    ligne: LigneFactureClientDto,
    taux: number,
  ): {
    tauxTva: Prisma.Decimal;
    montantHt: Prisma.Decimal;
    montantTva: Prisma.Decimal;
    montantTtc: Prisma.Decimal;
  } {
    const ht = new Prisma.Decimal(ligne.prixUnitaire)
      .times(ligne.quantite)
      .minus(ligne.remise ?? 0)
      .toDecimalPlaces(2);
    if (ht.lt(0)) {
      throw new BadRequestException(
        `Remise supérieure au montant HT sur « ${ligne.designation} ».`,
      );
    }
    const tauxTva = new Prisma.Decimal(taux).toDecimalPlaces(2);
    const montantTva = ht.times(tauxTva).dividedBy(100).toDecimalPlaces(2);
    return {
      tauxTva,
      montantHt: ht,
      montantTva,
      montantTtc: ht.plus(montantTva),
    };
  }

  private totaux(
    lignes: Array<{
      montantHt: Prisma.Decimal;
      montantTva: Prisma.Decimal;
      montantTtc: Prisma.Decimal;
    }>,
  ) {
    return lignes.reduce(
      (acc, l) => ({
        montantHt: acc.montantHt.plus(l.montantHt),
        montantTva: acc.montantTva.plus(l.montantTva),
        montantTtc: acc.montantTtc.plus(l.montantTtc),
      }),
      {
        montantHt: new Prisma.Decimal(0),
        montantTva: new Prisma.Decimal(0),
        montantTtc: new Prisma.Decimal(0),
      },
    );
  }

  private async hydraterLignes(lignes: LigneFactureClientDto[]) {
    const defaut = await this.tauxTvaDefaut();
    // tauxTva du DTO est un number optionnel ; une fois hydraté il devient
    // le Decimal SYSCOHADA écrit en base — Omit évite l'intersection impossible.
    const out: Array<
      Omit<LigneFactureClientDto, 'tauxTva'> & {
        tauxTva: Prisma.Decimal;
        montantHt: Prisma.Decimal;
        montantTva: Prisma.Decimal;
        montantTtc: Prisma.Decimal;
      }
    > = [];
    for (const ligne of lignes) {
      let taux = ligne.tauxTva ?? defaut;
      if (ligne.produitId) {
        const produit = await this.prisma.produit.findUnique({
          where: { id: ligne.produitId },
        });
        if (!produit) {
          throw new NotFoundException(
            `Produit ${ligne.produitId} introuvable.`,
          );
        }
        if (ligne.tauxTva === undefined && produit.tauxTva != null) {
          taux = Number(produit.tauxTva);
        }
      }
      out.push({
        produitId: ligne.produitId,
        designation: ligne.designation,
        quantite: ligne.quantite,
        prixUnitaire: ligne.prixUnitaire,
        remise: ligne.remise,
        ...this.montantLigne(ligne, taux),
      });
    }
    return out;
  }

  private async genererNumero(): Promise<string> {
    const jour = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.factureClient.count({
      where: { numero: { startsWith: `FAC-${jour}` } },
    });
    return `FAC-${jour}-${String(count + 1).padStart(4, '0')}`;
  }

  private presenter(facture: FactureChargee) {
    const montantPaye = facture.paiements.reduce(
      (acc, p) => acc.plus(p.montant),
      new Prisma.Decimal(0),
    );
    return {
      ...facture,
      montantPaye: montantPaye.toFixed(2),
      solde: new Prisma.Decimal(facture.montantTtc)
        .minus(montantPaye)
        .toFixed(2),
      transitions: transitionsFactureClientAutorisees(facture.statut),
    };
  }

  async findAll(
    user: AuthenticatedUser,
    query: ListFactureClientQueryDto = {},
  ) {
    this.assertLecture(user);
    const where: Prisma.FactureClientWhereInput = {};
    if (query.statut) where.statut = query.statut;
    if (query.clientId) where.clientId = query.clientId;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { numero: { contains: q, mode: 'insensitive' } },
        {
          client: {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { contact: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    const rows = await this.prisma.factureClient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: includeFacture,
    });
    return rows.map((f) => this.presenter(f));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.assertLecture(user);
    const facture = await this.prisma.factureClient.findUnique({
      where: { id },
      include: includeFacture,
    });
    if (!facture) throw new NotFoundException('Facture client introuvable.');
    return this.presenter(facture);
  }

  async getFacturePdfData(id: string, user: AuthenticatedUser) {
    const facture = await this.findOne(id, user);
    const societe = await this.prisma.societe.findFirst({
      select: {
        raisonSociale: true,
        adresse: true,
        telephone: true,
        email: true,
      },
    });
    return {
      numero: facture.numero,
      statut: facture.statut,
      dateFacture: facture.dateFacture,
      dateEcheance: facture.dateEcheance,
      montantHt: facture.montantHt.toString(),
      montantTva: facture.montantTva.toString(),
      montantTtc: facture.montantTtc.toString(),
      montantPaye: facture.montantPaye,
      solde: facture.solde,
      notes: facture.notes,
      createdAt: facture.createdAt,
      client: facture.client,
      boutique: facture.boutique,
      devis: facture.devis,
      lignes: facture.lignes.map((l) => ({
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire.toString(),
        remise: l.remise.toString(),
        tauxTva: l.tauxTva.toString(),
        montantHt: l.montantHt.toString(),
        montantTva: l.montantTva.toString(),
        montantTtc: l.montantTtc.toString(),
      })),
      paiements: facture.paiements.map((p) => ({
        montant: p.montant.toString(),
        mode: p.mode,
        datePaiement: p.datePaiement,
        reference: p.reference,
      })),
      societe,
      imprimeAt: new Date(),
    };
  }

  async create(dto: CreateFactureClientDto, user: AuthenticatedUser) {
    this.assertEcriture(user);
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) throw new NotFoundException('Client introuvable.');

    if (dto.devisId) {
      await this.assertDevisPourFacture(dto.devisId, dto.clientId);
    }

    const lignes = await this.hydraterLignes(dto.lignes);
    const totaux = this.totaux(lignes);
    const numero = await this.genererNumero();
    const boutiqueId = dto.boutiqueId ?? user.boutiqueId ?? undefined;

    const facture = await this.prisma.factureClient.create({
      data: {
        numero,
        clientId: dto.clientId,
        boutiqueId,
        devisId: dto.devisId,
        dateFacture: dto.dateFacture ? new Date(dto.dateFacture) : undefined,
        dateEcheance: dto.dateEcheance ? new Date(dto.dateEcheance) : undefined,
        notes: dto.notes,
        ...totaux,
        createdById: user.userId,
        lignes: {
          create: lignes.map((l) => ({
            produitId: l.produitId,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            remise: l.remise ?? 0,
            tauxTva: l.tauxTva,
            montantHt: l.montantHt,
            montantTva: l.montantTva,
            montantTtc: l.montantTtc,
          })),
        },
      },
      include: includeFacture,
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_CLIENT_CREEE',
      entite: 'FactureClient',
      entiteId: facture.id,
      details: `${facture.numero} · ${totaux.montantTtc.toFixed(2)} FCFA TTC`,
    });

    return this.presenter(facture);
  }

  async update(
    id: string,
    dto: UpdateFactureClientDto,
    user: AuthenticatedUser,
  ) {
    this.assertEcriture(user);
    const existant = await this.prisma.factureClient.findUnique({
      where: { id },
    });
    if (!existant) throw new NotFoundException('Facture client introuvable.');
    if (existant.statut !== 'BROUILLON') {
      throw new BadRequestException(
        'Seule une facture en brouillon peut être modifiée.',
      );
    }

    const lignes = dto.lignes ? await this.hydraterLignes(dto.lignes) : null;
    const totaux = lignes
      ? this.totaux(lignes)
      : {
          montantHt: existant.montantHt,
          montantTva: existant.montantTva,
          montantTtc: existant.montantTtc,
        };

    const facture = await this.prisma.$transaction(async (tx) => {
      if (lignes) {
        await tx.ligneFactureClient.deleteMany({ where: { factureId: id } });
        await tx.ligneFactureClient.createMany({
          data: lignes.map((l) => ({
            factureId: id,
            produitId: l.produitId,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            remise: l.remise ?? 0,
            tauxTva: l.tauxTva,
            montantHt: l.montantHt,
            montantTva: l.montantTva,
            montantTtc: l.montantTtc,
          })),
        });
      }
      return tx.factureClient.update({
        where: { id },
        data: {
          notes: dto.notes ?? existant.notes,
          dateEcheance: dto.dateEcheance
            ? new Date(dto.dateEcheance)
            : existant.dateEcheance,
          ...totaux,
        },
        include: includeFacture,
      });
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_CLIENT_MODIFIEE',
      entite: 'FactureClient',
      entiteId: id,
      details: facture.numero,
    });

    return this.presenter(facture);
  }

  async transition(
    id: string,
    dto: TransitionFactureClientDto,
    user: AuthenticatedUser,
  ) {
    this.assertEcriture(user);
    const existant = await this.prisma.factureClient.findUnique({
      where: { id },
      include: {
        lignes: { include: { produit: true } },
        devis: true,
      },
    });
    if (!existant) throw new NotFoundException('Facture client introuvable.');

    const from = existant.statut;
    const to = dto.statut as StatutFactureClient;
    if (!transitionFactureClientAutorisee(from, to)) {
      throw new BadRequestException(`Transition ${from} → ${to} interdite.`);
    }

    if (to === 'ANNULEE') {
      const facture = await this.prisma.factureClient.update({
        where: { id },
        data: { statut: 'ANNULEE', devisId: null },
        include: includeFacture,
      });
      await this.audit.record({
        utilisateurId: user.userId,
        action: 'FACTURE_CLIENT_TRANSITION',
        entite: 'FactureClient',
        entiteId: id,
        details: `${facture.numero} · ${from} → ANNULEE`,
      });
      return this.presenter(facture);
    }

    const facture = await this.emettre(existant, user);
    await this.salesGl.tryPostFactureClient(facture.id, user.userId);
    return this.findOne(facture.id, user);
  }

  async encaisser(
    id: string,
    dto: EncaissementFactureClientDto,
    user: AuthenticatedUser,
  ) {
    this.assertEncaissement(user);
    const existant = await this.prisma.factureClient.findUnique({
      where: { id },
      include: { paiements: true },
    });
    if (!existant) throw new NotFoundException('Facture client introuvable.');
    if (existant.statut !== 'EMISE') {
      throw new BadRequestException(
        'Seul une facture émise peut recevoir un encaissement.',
      );
    }
    const deja = existant.paiements.reduce(
      (acc, p) => acc.plus(p.montant),
      new Prisma.Decimal(0),
    );
    const montant = new Prisma.Decimal(dto.montant).toDecimalPlaces(2);
    if (deja.plus(montant).gt(existant.montantTtc)) {
      throw new BadRequestException(
        `Encaissement supérieur au solde (${existant.montantTtc.minus(deja).toFixed(2)} FCFA).`,
      );
    }

    const paiement = await this.prisma.paiementFactureClient.create({
      data: {
        factureId: id,
        montant,
        mode: dto.mode,
        reference: dto.reference,
        createdById: user.userId,
      },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_CLIENT_ENCAISSEE',
      entite: 'FactureClient',
      entiteId: id,
      details: `${montant.toFixed(2)} FCFA · ${dto.mode}`,
    });

    await this.salesGl.tryPostEncaissementFactureClient(
      paiement.id,
      user.userId,
    );
    return this.findOne(id, user);
  }

  private async assertDevisPourFacture(devisId: string, clientId: string) {
    const devis = await this.prisma.devisClient.findUnique({
      where: { id: devisId },
      include: { factureClient: true },
    });
    if (!devis) throw new NotFoundException('Devis introuvable.');
    if (devis.clientId !== clientId) {
      throw new BadRequestException('Le devis n’appartient pas à ce client.');
    }
    if (devis.venteId) {
      throw new BadRequestException(
        'Ce devis est déjà lié à un ticket POS — facture interdite (double 411).',
      );
    }
    if (devis.statut !== 'ACCEPTE' && devis.statut !== 'TRANSFORME') {
      throw new BadRequestException(
        'Seul un devis accepté peut être transformé en facture.',
      );
    }
    if (devis.factureClient && devis.factureClient.statut !== 'ANNULEE') {
      throw new BadRequestException(
        `Une facture ${devis.factureClient.numero} existe déjà pour ce devis.`,
      );
    }
    if (devis.statut === 'TRANSFORME' && devis.venteId) {
      throw new BadRequestException('Devis déjà transformé en ticket POS.');
    }
  }

  private async emettre(
    existant: Prisma.FactureClientGetPayload<{
      include: { lignes: { include: { produit: true } }; devis: true };
    }>,
    user: AuthenticatedUser,
  ) {
    if (existant.lignes.length === 0) {
      throw new BadRequestException(
        'Impossible d’émettre une facture sans ligne.',
      );
    }

    const articles = existant.lignes.filter(
      (l) => l.produit && l.produit.typeProduit !== 'PRESTATION',
    );
    if (articles.length > 0 && !existant.boutiqueId) {
      throw new BadRequestException(
        'Une boutique est obligatoire pour facturer des marchandises (sortie de stock).',
      );
    }

    const facture = await this.prisma.$transaction(async (tx) => {
      if (articles.length > 0 && existant.boutiqueId) {
        const entrepotId = await this.stock.trouverEntrepotPrincipalBoutique(
          existant.boutiqueId,
        );
        for (const ligne of articles) {
          const produit = ligne.produit!;
          const dispo = await this.stock.getDisponible(
            produit.id,
            entrepotId,
            undefined,
            tx,
          );
          if (dispo < ligne.quantite) {
            throw new BadRequestException({
              code: 'STOCK_INSUFFISANT',
              message: `Stock insuffisant pour « ${produit.designation} » (disponible : ${dispo}, demandé : ${ligne.quantite}).`,
            });
          }
          await this.stock.appliquerMouvement(
            {
              produitId: produit.id,
              entrepotId,
              type: 'VENTE',
              delta: -ligne.quantite,
              utilisateurId: user.userId,
              reference: existant.numero,
            },
            tx,
          );
          await tx.ligneFactureClient.update({
            where: { id: ligne.id },
            data: { coutUnitaire: produit.coutMoyenPondere },
          });
        }
      }

      for (const ligne of existant.lignes) {
        if (articles.some((a) => a.id === ligne.id)) continue;
        if (ligne.produit) {
          await tx.ligneFactureClient.update({
            where: { id: ligne.id },
            data: { coutUnitaire: ligne.produit.coutMoyenPondere },
          });
        }
      }

      if (existant.devisId) {
        const devis = await tx.devisClient.findUnique({
          where: { id: existant.devisId },
        });
        if (!devis) throw new NotFoundException('Devis introuvable.');
        if (devis.venteId) {
          throw new BadRequestException(
            'Ce devis est déjà lié à un ticket POS — émission interdite.',
          );
        }
        if (devis.statut === 'ACCEPTE') {
          await tx.devisClient.update({
            where: { id: devis.id },
            data: { statut: 'TRANSFORME' },
          });
        }
      }

      return tx.factureClient.update({
        where: { id: existant.id },
        data: {
          statut: 'EMISE',
          emiseAt: new Date(),
          emiseParId: user.userId,
        },
        include: includeFacture,
      });
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FACTURE_CLIENT_TRANSITION',
      entite: 'FactureClient',
      entiteId: existant.id,
      details: `${facture.numero} · BROUILLON → EMISE`,
    });

    return facture;
  }
}
