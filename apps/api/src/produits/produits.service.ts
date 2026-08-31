import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Produit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
import { BonsStockService } from '../stocks/bons-stock.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { toCsv } from '../common/csv.util';
import { CreateProduitDto } from './dto/create-produit.dto';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateProduitDto } from './dto/update-produit.dto';
import { ListProduitsQueryDto } from './dto/list-produits-query.dto';
import { ImprimerEtiquettesDto } from './dto/imprimer-etiquettes.dto';
import type { DonneesEtiquettesPdf } from '../impressions/etiquettes.pdf';
import {
  ApercuImportProduitsDto,
  AppliquerImportProduitsDto,
  MappingImportProduitsDto,
} from './dto/import-produits.dto';
import { tableDepuisFichier } from './produits-import.fichier';
import {
  CHAMPS_IMPORT,
  MAX_LIGNES_IMPORT,
  estLigneImportVide,
  parserLigneCatalogue,
  proposerMapping,
  type MappingImport,
} from './produits-import.mapper';
import {
  enrichirProduit,
  money,
  quantitePourSortirAlerte,
  statutStockOf,
  type ProduitEnrichi,
} from './produits.helpers';
import { slugifyProduitDesignation } from './produit-slug.util';

const FENETRE_ANALYSE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ETIQUETTES_PAR_LOT = 1000;
const MAX_TENTATIVES_CODE_INTERNE = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// Catalogue produit du POS (§6.3.2). Aucun périmètre boutique : le
// catalogue est réseau entier (paramétrage d'administration système, comme
// zones/boutiques — voir access-scope.constants.ts).
@Injectable()
export class ProduitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stockService: StockService,
    private readonly bonsStock: BonsStockService,
  ) {}

  async create(
    dto: CreateProduitDto,
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi> {
    const stockInitial = dto.stock ?? 0;
    const visibleWeb = dto.visibleWeb === true;
    if (visibleWeb && !dto.imageUrl?.trim()) {
      throw new BadRequestException(
        'Une photo de couverture est obligatoire pour publier sur le site web.',
      );
    }
    const prixWeb =
      dto.prixWeb != null
        ? dto.prixWeb
        : visibleWeb
          ? dto.prixUnitaire
          : null;
    let slug: string | null = null;
    if (visibleWeb) {
      slug = await this.resoudreSlugUnique(
        dto.slug?.trim() || slugifyProduitDesignation(dto.designation),
      );
      if (!slug) {
        throw new BadRequestException(
          'Impossible de générer un slug URL pour la boutique en ligne.',
        );
      }
    }

    let produit: Produit;
    try {
      produit = await this.prisma.produit.create({
        data: {
          designation: dto.designation,
          reference: dto.reference,
          categorie: dto.categorie,
          description: dto.description,
          typeProduit: dto.typeProduit ?? 'ARTICLE',
          prixUnitaire: dto.prixUnitaire,
          stock: 0,
          seuilReappro: dto.seuilReappro,
          codeBarres: dto.codeBarres,
          uniteMesure: dto.uniteMesure ?? 'UN',
          methodeCout: dto.methodeCout ?? 'CMP',
          strategieSortie: dto.strategieSortie ?? 'FIFO',
          attributs: dto.attributs,
          visibleWeb,
          slug,
          prixWeb,
          imageUrl: dto.imageUrl ?? null,
          imagesUrls: dto.imagesUrls ?? null,
          tauxTva: dto.tauxTva ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          dto.reference
            ? `La référence « ${dto.reference} » est déjà attribuée à un autre produit.`
            : 'Ce slug URL est déjà utilisé par un autre produit.',
        );
      }
      throw error;
    }

    if (stockInitial > 0) {
      const entrepot = await this.resoudreEntrepotStockInitial();
      if (!entrepot) {
        throw new NotFoundException(
          'Aucun entrepôt PRINCIPAL : créez une boutique/entrepôt avant de stocker.',
        );
      }
      await this.stockService.appliquerMouvement({
        produitId: produit.id,
        entrepotId: entrepot.id,
        type: 'AJUSTEMENT',
        delta: stockInitial,
        utilisateurId: user.userId,
        reference: 'STOCK_INITIAL',
      });
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_CREATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify({
        designation: produit.designation,
        reference: produit.reference,
        visibleWeb: produit.visibleWeb,
        slug: produit.slug,
      }),
    });

    return this.findOne(produit.id, user);
  }

  /** Slug unique pour la boutique (suffixe -2, -3… si collision). */
  private async resoudreSlugUnique(
    base: string,
    excludeId?: string,
  ): Promise<string | null> {
    const trimmed = base.trim().slice(0, 80);
    if (!trimmed) return null;
    let candidate = trimmed;
    let n = 2;
    while (
      await this.prisma.produit.findFirst({
        where: {
          slug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      })
    ) {
      const suffix = `-${n}`;
      candidate = `${trimmed.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
      n += 1;
      if (n > 200) return null;
    }
    return candidate;
  }

  /** Entrepôt hub web en priorité, sinon entrepôt PRINCIPAL réseau. */
  private async resoudreEntrepotStockInitial() {
    const params = await this.prisma.parametreShop.findFirst({
      where: { shopActif: true },
      select: { entrepotWebDefautId: true },
    });
    if (params?.entrepotWebDefautId) {
      const hub = await this.prisma.entrepot.findFirst({
        where: {
          id: params.entrepotWebDefautId,
          actif: true,
          usage: 'STOCK',
        },
      });
      if (hub) return hub;
    }
    return (
      (await this.prisma.entrepot.findFirst({
        where: {
          type: 'PRINCIPAL',
          actif: true,
          reseau: false,
          usage: 'STOCK',
        },
        orderBy: { nom: 'asc' },
      })) ??
      (await this.prisma.entrepot.findFirst({
        where: { type: 'PRINCIPAL', actif: true, usage: 'STOCK' },
        orderBy: { nom: 'asc' },
      }))
    );
  }

  async findAll(
    query: ListProduitsQueryDto = {},
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi[]> {
    const where: Prisma.ProduitWhereInput = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { designation: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { codeBarres: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.categorie) {
      where.categorie = query.categorie;
    }
    if (query.actif !== undefined) {
      where.actif = query.actif;
    }

    const produits = await this.prisma.produit.findMany({
      where,
      orderBy: { designation: 'asc' },
    });

    const enrichis = await this.appliquerStockPerimetre(
      produits.map(enrichirProduit),
      user,
    );
    let result = enrichis;
    if (query.statutStock) {
      result = result.filter((p) => p.statutStock === query.statutStock);
    }
    if (query.margeNegative) {
      result = result.filter((p) =>
        new Prisma.Decimal(p.margeUnitaire).lessThan(0),
      );
    }
    return result;
  }

  async exportCsv(
    query: ListProduitsQueryDto = {},
    user: AuthenticatedUser,
  ): Promise<string> {
    const produits = await this.findAll(query, user);
    return toCsv(
      produits.map((p) => ({
        reference: p.reference,
        designation: p.designation,
        categorie: p.categorie,
        actif: p.actif,
        prixUnitaire: money(new Prisma.Decimal(p.prixUnitaire)),
        coutMoyenPondere: money(new Prisma.Decimal(p.coutMoyenPondere)),
        margeUnitaire: p.margeUnitaire,
        tauxMarge: p.tauxMarge,
        stock: p.stock,
        seuilReappro: p.seuilReappro,
        statutStock: p.statutStock,
        valeurStock: p.valeurStock,
      })),
      [
        { key: 'reference', header: 'Référence' },
        { key: 'designation', header: 'Désignation' },
        { key: 'categorie', header: 'Catégorie' },
        { key: 'actif', header: 'Actif' },
        { key: 'prixUnitaire', header: 'Prix unitaire' },
        { key: 'coutMoyenPondere', header: 'CMP' },
        { key: 'margeUnitaire', header: 'Marge unitaire' },
        { key: 'tauxMarge', header: 'Taux de marge (%)' },
        { key: 'stock', header: 'Stock réseau' },
        { key: 'seuilReappro', header: 'Seuil réappro' },
        { key: 'statutStock', header: 'Statut stock' },
        { key: 'valeurStock', header: 'Valeur stock (CMP)' },
      ],
    );
  }

  async classement(user: AuthenticatedUser) {
    const depuis = new Date(Date.now() - FENETRE_ANALYSE_MS);
    const [produits, lignes, retours] = await Promise.all([
      this.prisma.produit.findMany({ where: { actif: true } }),
      this.prisma.ligneVente.findMany({
        where: { vente: { dateVente: { gte: depuis } } },
        select: {
          produitId: true,
          quantite: true,
          prixUnitaire: true,
          remise: true,
        },
      }),
      this.prisma.retourVente.findMany({
        where: { dateHeure: { gte: depuis } },
        select: {
          quantite: true,
          montantRembourse: true,
          ligneVente: { select: { produitId: true } },
        },
      }),
    ]);

    const stats = new Map<
      string,
      { quantite: number; chiffreAffaires: Prisma.Decimal }
    >();
    const bump = (produitId: string) => {
      const current = stats.get(produitId) ?? {
        quantite: 0,
        chiffreAffaires: new Prisma.Decimal(0),
      };
      stats.set(produitId, current);
      return current;
    };
    for (const ligne of lignes) {
      const entry = bump(ligne.produitId);
      entry.quantite += ligne.quantite;
      entry.chiffreAffaires = entry.chiffreAffaires.plus(
        new Prisma.Decimal(ligne.prixUnitaire)
          .times(ligne.quantite)
          .minus(ligne.remise),
      );
    }
    for (const retour of retours) {
      const entry = bump(retour.ligneVente.produitId);
      entry.quantite -= retour.quantite;
      entry.chiffreAffaires = entry.chiffreAffaires.minus(
        retour.montantRembourse,
      );
    }

    const enrichis = await this.appliquerStockPerimetre(
      produits.map(enrichirProduit),
      user,
    );
    const parId = new Map(enrichis.map((p) => [p.id, p]));
    const meilleuresVentes = [...stats.entries()]
      .filter(([, s]) => s.quantite > 0)
      .sort((a, b) => b[1].quantite - a[1].quantite)
      .slice(0, 5)
      .flatMap(([id, s]) => {
        const produit = parId.get(id);
        if (!produit) return [];
        return [
          {
            produit,
            quantiteVendue: s.quantite,
            chiffreAffaires: money(s.chiffreAffaires),
          },
        ];
      });

    const dormants = enrichis
      .filter((p) => p.stock > 0 && (stats.get(p.id)?.quantite ?? 0) <= 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 8)
      .map((p) => ({
        produit: p,
        stock: p.stock,
        valeurStock: p.valeurStock,
      }));

    return {
      fenetreJours: 30,
      meilleuresVentes,
      dormants,
    };
  }

  async findVentes(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const boutiqueId = this.boutiqueIdPerimetre(user);
    const lignes = await this.prisma.ligneVente.findMany({
      where: {
        produitId: id,
        ...(boutiqueId ? { vente: { caisse: { boutiqueId } } } : {}),
      },
      include: {
        vente: {
          select: {
            id: true,
            dateVente: true,
            modePaiement: true,
            montantTotal: true,
            paiements: { select: { modePaiement: true, montant: true } },
            caisse: {
              select: { boutique: { select: { nom: true } } },
            },
          },
        },
      },
      orderBy: { vente: { dateVente: 'desc' } },
      take: 50,
    });

    return lignes.map((ligne) => {
      const montant = new Prisma.Decimal(ligne.prixUnitaire)
        .times(ligne.quantite)
        .minus(ligne.remise);
      return {
        ligneId: ligne.id,
        venteId: ligne.vente.id,
        dateVente: ligne.vente.dateVente,
        boutique: ligne.vente.caisse.boutique?.nom ?? null,
        modePaiement:
          ligne.vente.paiements.length > 0
            ? ligne.vente.paiements
                .map((p) => `${p.modePaiement} ${p.montant.toFixed(2)}`)
                .join(' + ')
            : ligne.vente.modePaiement,
        quantite: ligne.quantite,
        prixUnitaire: money(new Prisma.Decimal(ligne.prixUnitaire)),
        remise: money(new Prisma.Decimal(ligne.remise)),
        montant: money(montant),
      };
    });
  }

  async synthese(user: AuthenticatedUser) {
    const produits = await this.appliquerStockPerimetre(
      (await this.prisma.produit.findMany()).map(enrichirProduit),
      user,
    );
    const actifs = produits.filter((p) => p.actif);

    let ruptures = 0;
    let sousSeuil = 0;
    let sansSeuil = 0;
    let margesNegatives = 0;
    let valeurStock = new Prisma.Decimal(0);

    for (const produit of actifs) {
      const statut = statutStockOf(produit);
      if (statut === 'RUPTURE') ruptures += 1;
      if (statut === 'SOUS_SEUIL') sousSeuil += 1;
      if (produit.seuilReappro === null) sansSeuil += 1;
      const prix = new Prisma.Decimal(produit.prixUnitaire);
      const cmp = new Prisma.Decimal(produit.coutMoyenPondere);
      if (prix.lessThan(cmp)) margesNegatives += 1;
      valeurStock = valeurStock.plus(cmp.times(produit.stock));
    }

    return {
      nombreProduits: produits.length,
      actifs: actifs.length,
      inactifs: produits.length - actifs.length,
      ruptures,
      sousSeuil,
      sansSeuil,
      margesNegatives,
      valeurStock: money(valeurStock),
    };
  }

  async categories(): Promise<string[]> {
    const rows = await this.prisma.produit.findMany({
      where: { categorie: { not: null } },
      distinct: ['categorie'],
      select: { categorie: true },
      orderBy: { categorie: 'asc' },
    });
    return rows
      .map((r) => r.categorie)
      .filter((c): c is string => c !== null && c.length > 0);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ProduitEnrichi> {
    const produit = await this.prisma.produit.findUnique({ where: { id } });
    if (!produit) {
      throw new NotFoundException(`Produit ${id} introuvable.`);
    }
    const [enrichi] = await this.appliquerStockPerimetre(
      [enrichirProduit(produit)],
      user,
    );
    return enrichi;
  }

  async analyse(id: string, user: AuthenticatedUser) {
    const produit = await this.findOne(id, user);
    const depuis = new Date(Date.now() - FENETRE_ANALYSE_MS);
    const entrepotIds = await this.entrepotIdsPerimetre(user);
    const boutiqueId = this.boutiqueIdPerimetre(user);

    const [quants, lignes, retours] = await Promise.all([
      this.prisma.stockQuant.findMany({
        where: {
          produitId: id,
          ...(entrepotIds ? { entrepotId: { in: entrepotIds } } : {}),
        },
        include: {
          entrepot: {
            select: {
              id: true,
              nom: true,
              code: true,
              usage: true,
              virtuel: true,
              boutique: { select: { nom: true } },
            },
          },
        },
        orderBy: { entrepot: { nom: 'asc' } },
      }),
      this.prisma.ligneVente.findMany({
        where: {
          produitId: id,
          vente: {
            dateVente: { gte: depuis },
            ...(boutiqueId ? { caisse: { boutiqueId } } : {}),
          },
        },
        select: {
          quantite: true,
          prixUnitaire: true,
          remise: true,
          coutUnitaire: true,
        },
      }),
      this.prisma.retourVente.findMany({
        where: {
          dateHeure: { gte: depuis },
          ligneVente: {
            produitId: id,
            ...(boutiqueId ? { vente: { caisse: { boutiqueId } } } : {}),
          },
        },
        select: {
          quantite: true,
          montantRembourse: true,
          ligneVente: { select: { coutUnitaire: true } },
        },
      }),
    ]);

    let quantiteVendue = 0;
    let caBrut = new Prisma.Decimal(0);
    let cmvBrut = new Prisma.Decimal(0);
    for (const ligne of lignes) {
      quantiteVendue += ligne.quantite;
      caBrut = caBrut.plus(
        new Prisma.Decimal(ligne.prixUnitaire)
          .times(ligne.quantite)
          .minus(ligne.remise),
      );
      if (ligne.coutUnitaire !== null) {
        cmvBrut = cmvBrut.plus(
          new Prisma.Decimal(ligne.coutUnitaire).times(ligne.quantite),
        );
      }
    }

    let quantiteRetournee = 0;
    let retoursMontant = new Prisma.Decimal(0);
    let retoursCout = new Prisma.Decimal(0);
    for (const retour of retours) {
      quantiteRetournee += retour.quantite;
      retoursMontant = retoursMontant.plus(retour.montantRembourse);
      if (retour.ligneVente.coutUnitaire !== null) {
        retoursCout = retoursCout.plus(
          new Prisma.Decimal(retour.ligneVente.coutUnitaire).times(
            retour.quantite,
          ),
        );
      }
    }

    const quantiteNette = quantiteVendue - quantiteRetournee;
    const caNet = caBrut.minus(retoursMontant);
    const cmvNet = cmvBrut.minus(retoursCout);
    const margeBrute = caNet.minus(cmvNet);
    const rythmeJournalier = quantiteNette > 0 ? quantiteNette / 30 : 0;
    const joursCouverture =
      rythmeJournalier > 0
        ? Number((produit.stock / rythmeJournalier).toFixed(1))
        : null;

    const quantiteSuggeree = produit.actif
      ? quantitePourSortirAlerte(produit)
      : 0;

    const stockPrevu = await this.bonsStock.stockPrevu(id);

    return {
      produit,
      stockPrevu,
      repartitionStock: quants.map((q) => ({
        entrepotId: q.entrepot.id,
        nom: q.entrepot.nom,
        code: q.entrepot.code,
        usage: q.entrepot.usage,
        virtuel: q.entrepot.virtuel,
        boutique: q.entrepot.boutique?.nom ?? null,
        quantite: q.quantite,
        valeur: money(
          new Prisma.Decimal(produit.coutMoyenPondere).times(q.quantite),
        ),
        statut: statutStockOf({
          stock: q.quantite,
          seuilReappro: produit.seuilReappro,
        }),
      })),
      performance30j: {
        quantiteVendue: quantiteNette,
        chiffreAffaires: money(caNet),
        coutDesVentes: money(cmvNet),
        margeBrute: money(margeBrute),
        joursCouverture,
      },
      suggestionReappro: {
        necessaire: quantiteSuggeree > 0,
        quantiteSuggeree,
        motif:
          quantiteSuggeree > 0
            ? `Écart pour sortir de l'alerte STOCK_BAS (seuil ${produit.seuilReappro}).`
            : produit.actif
              ? 'Stock au-dessus du seuil, ou aucun seuil défini.'
              : 'Produit inactif — hors circuit d’alerte et de vente.',
      },
    };
  }

  async update(
    id: string,
    dto: UpdateProduitDto,
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi> {
    const existing = await this.findOne(id, user);

    let slug = dto.slug;
    if (dto.visibleWeb === true) {
      const base =
        (typeof dto.slug === 'string' && dto.slug.trim()) ||
        existing.slug?.trim() ||
        slugifyProduitDesignation(dto.designation ?? existing.designation);
      slug = await this.resoudreSlugUnique(base, id);
      if (!slug) {
        throw new BadRequestException(
          'Impossible de générer un slug URL pour la boutique en ligne.',
        );
      }
    }

    let produit: Produit;
    try {
      produit = await this.prisma.produit.update({
        where: { id },
        data: {
          designation: dto.designation,
          reference: dto.reference,
          categorie: dto.categorie,
          description: dto.description,
          typeProduit: dto.typeProduit,
          prixUnitaire: dto.prixUnitaire,
          seuilReappro: dto.seuilReappro,
          actif: dto.actif,
          codeBarres: dto.codeBarres,
          uniteMesure: dto.uniteMesure,
          methodeCout: dto.methodeCout,
          strategieSortie: dto.strategieSortie,
          imageUrl: dto.imageUrl,
          imagesUrls: dto.imagesUrls,
          prixWeb: dto.prixWeb,
          visibleWeb: dto.visibleWeb,
          slug: dto.visibleWeb === false ? dto.slug : slug,
          tauxTva: dto.tauxTva,
          attributs: dto.attributs,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          dto.reference
            ? `La référence « ${dto.reference} » est déjà attribuée à un autre produit.`
            : 'Ce slug URL est déjà utilisé par un autre produit.',
        );
      }
      throw error;
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_UPDATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify({
        ...dto,
        imageUrl:
          dto.imageUrl === undefined
            ? undefined
            : dto.imageUrl
              ? 'photo-mise-a-jour'
              : null,
        imagesUrls:
          dto.imagesUrls === undefined
            ? undefined
            : dto.imagesUrls
              ? 'galerie-mise-a-jour'
              : null,
      }),
    });

    return this.findOne(id, user);
  }

  /** Famille variantes e-commerce (parent + enfants). */
  async getFamilleWeb(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const rootId = await this.resoudreFamilleRootId(id);
    const membres = await this.prisma.produit.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { designation: 'asc' }],
    });
    return {
      rootId,
      membres: membres.map((m) => ({
        id: m.id,
        designation: m.designation,
        reference: m.reference,
        slug: m.slug,
        prixWeb: m.prixWeb != null ? money(m.prixWeb) : null,
        prixUnitaire: money(m.prixUnitaire),
        visibleWeb: m.visibleWeb,
        attributs: m.attributs,
        imageUrl: m.imageUrl,
        imagesUrls: m.imagesUrls,
        parentId: m.parentId,
        actif: m.actif,
      })),
    };
  }

  /** Crée une variante rattachée à la famille du produit courant. */
  async createVariante(
    id: string,
    dto: CreateVarianteDto,
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi> {
    await this.findOne(id, user);
    const rootId = await this.resoudreFamilleRootId(id);
    const root = await this.prisma.produit.findUniqueOrThrow({
      where: { id: rootId },
    });

    const visibleWeb = dto.visibleWeb !== false;
    const prixUnitaire =
      dto.prixUnitaire ?? Number(root.prixUnitaire);
    const prixWeb = dto.prixWeb ?? prixUnitaire;
    const slug = await this.resoudreSlugUnique(
      dto.slug?.trim() || slugifyProduitDesignation(dto.designation),
    );
    if (!slug) {
      throw new BadRequestException(
        'Impossible de générer un slug URL pour la variante.',
      );
    }

    const stockInitial = dto.stock ?? 0;
    let produit: Produit;
    try {
      produit = await this.prisma.produit.create({
        data: {
          designation: dto.designation,
          reference: dto.reference,
          categorie: root.categorie,
          description: root.description,
          typeProduit: root.typeProduit,
          prixUnitaire,
          stock: 0,
          parentId: rootId,
          attributs: dto.attributs,
          visibleWeb,
          slug,
          prixWeb,
          imageUrl: dto.imageUrl ?? null,
          imagesUrls: dto.imagesUrls ?? null,
          tauxTva: root.tauxTva,
          methodeCout: root.methodeCout,
          strategieSortie: root.strategieSortie,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          dto.reference
            ? `La référence « ${dto.reference} » est déjà attribuée.`
            : 'Ce slug URL est déjà utilisé.',
        );
      }
      throw error;
    }

    if (stockInitial > 0 && root.typeProduit === 'ARTICLE') {
      const entrepot = await this.resoudreEntrepotStockInitial();
      if (!entrepot) {
        throw new NotFoundException(
          'Aucun entrepôt configuré pour le stock initial.',
        );
      }
      await this.stockService.appliquerMouvement({
        produitId: produit.id,
        entrepotId: entrepot.id,
        type: 'AJUSTEMENT',
        delta: stockInitial,
        utilisateurId: user.userId,
        reference: 'STOCK_INITIAL',
      });
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_VARIANTE_CREATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify({
        parentRootId: rootId,
        designation: produit.designation,
        slug: produit.slug,
      }),
    });

    return this.findOne(produit.id, user);
  }

  private async resoudreFamilleRootId(produitId: string): Promise<string> {
    const p = await this.prisma.produit.findUnique({
      where: { id: produitId },
      select: { id: true, parentId: true },
    });
    if (!p) {
      throw new NotFoundException('Produit introuvable.');
    }
    return p.parentId ?? p.id;
  }

  // Code interne Code128, distinct des EAN fournisseurs (13 chiffres) — ne
  // touche jamais un codeBarres déjà saisi manuellement (§ impression
  // d'étiquettes en lot).
  private genererCodeInterne(): string {
    const suffixe = Math.floor(Math.random() * 1_000_000_000)
      .toString()
      .padStart(9, '0');
    return `INT${suffixe}`;
  }

  private async genererCodeBarresManquant(
    produit: Produit,
    user: AuthenticatedUser,
  ): Promise<Produit> {
    if (produit.codeBarres) {
      return produit;
    }
    for (
      let tentative = 0;
      tentative < MAX_TENTATIVES_CODE_INTERNE;
      tentative += 1
    ) {
      const codeBarres = this.genererCodeInterne();
      try {
        const misAJour = await this.prisma.produit.update({
          where: { id: produit.id },
          data: { codeBarres, codeBarresGenere: true },
        });
        await this.audit.record({
          utilisateurId: user.userId,
          action: 'PRODUIT_CODE_BARRES_GENERE',
          entite: 'Produit',
          entiteId: produit.id,
          details: JSON.stringify({ codeBarres }),
        });
        return misAJour;
      } catch (error) {
        if (
          isUniqueViolation(error) &&
          tentative < MAX_TENTATIVES_CODE_INTERNE - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    // Inatteignable (la boucle retourne ou lève systématiquement) — TypeScript
    // exige néanmoins un chemin de sortie explicite.
    throw new Error(
      'Génération de code-barres interne impossible après plusieurs tentatives.',
    );
  }

  // Prépare les données d'un lot d'étiquettes (§ impression code-barres) :
  // résout les produits, génère les codes-barres manquants, applique le
  // plafond volumétrique et journalise l'action globale en plus des audits
  // individuels de génération de code.
  async preparerEtiquettes(
    dto: ImprimerEtiquettesDto,
    user: AuthenticatedUser,
  ): Promise<DonneesEtiquettesPdf> {
    if (dto.afficherBoutique && !dto.boutiqueId) {
      throw new BadRequestException(
        'boutiqueId est requis lorsque afficherBoutique est activé.',
      );
    }

    const totalEtiquettes = dto.articles.reduce(
      (somme, article) => somme + article.quantite,
      0,
    );
    if (totalEtiquettes > MAX_ETIQUETTES_PAR_LOT) {
      throw new BadRequestException(
        `Le lot demande ${totalEtiquettes} étiquettes, au-delà du plafond de ${MAX_ETIQUETTES_PAR_LOT} par impression. Scindez le lot en plusieurs impressions.`,
      );
    }

    const produitIds = dto.articles.map((a) => a.produitId);
    const produitsTrouves = await this.prisma.produit.findMany({
      where: { id: { in: produitIds } },
    });
    const produitParId = new Map(produitsTrouves.map((p) => [p.id, p]));
    const manquants = produitIds.filter((id) => !produitParId.has(id));
    if (manquants.length > 0) {
      throw new NotFoundException(
        `Produit(s) introuvable(s) : ${manquants.join(', ')}.`,
      );
    }

    let boutiqueNom: string | null = null;
    if (dto.afficherBoutique && dto.boutiqueId) {
      const boutique = await this.prisma.boutique.findUnique({
        where: { id: dto.boutiqueId },
      });
      if (!boutique) {
        throw new NotFoundException(`Boutique ${dto.boutiqueId} introuvable.`);
      }
      boutiqueNom = boutique.nom;
    }

    const articles: DonneesEtiquettesPdf['articles'] = [];
    for (const ligne of dto.articles) {
      let produit = produitParId.get(ligne.produitId);
      if (!produit) continue;
      if (!produit.codeBarres) {
        produit = await this.genererCodeBarresManquant(produit, user);
      }
      articles.push({
        produitId: produit.id,
        designation: produit.designation,
        reference: produit.reference,
        codeBarres: produit.codeBarres as string,
        prixUnitaire: money(new Prisma.Decimal(produit.prixUnitaire)),
        quantite: ligne.quantite,
      });
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'ETIQUETTES_IMPRESSION_LOT',
      entite: 'Produit',
      entiteId: articles[0].produitId,
      details: JSON.stringify({
        produitIds: articles.map((a) => a.produitId),
        quantites: articles.map((a) => a.quantite),
        format: dto.format,
        totalEtiquettes,
      }),
    });

    return {
      format: dto.format,
      afficherNom: dto.afficherNom,
      afficherBoutique: dto.afficherBoutique,
      afficherReference: dto.afficherReference,
      boutiqueNom,
      articles,
    };
  }

  async findMouvements(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const entrepotIds = await this.entrepotIdsPerimetre(user);
    return this.prisma.mouvementStock.findMany({
      where: {
        produitId: id,
        ...(entrepotIds ? { entrepotId: { in: entrepotIds } } : {}),
      },
      include: {
        entrepot: {
          select: {
            nom: true,
            code: true,
            boutique: { select: { nom: true } },
          },
        },
        utilisateur: { select: { prenom: true, nom: true } },
      },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }

  modeleImportCsv(): string {
    return toCsv(
      [
        {
          reference: 'CBL-USB-C',
          designation: 'Câble USB-C 1 m',
          categorie: 'Câbles',
          prixUnitaire: '2500',
          seuilReappro: '5',
          codeBarres: '3660000000001',
          actif: 'oui',
          stock: '0',
        },
      ],
      [
        { key: 'reference', header: 'Référence' },
        { key: 'designation', header: 'Désignation' },
        { key: 'categorie', header: 'Catégorie' },
        { key: 'prixUnitaire', header: 'Prix unitaire' },
        { key: 'seuilReappro', header: 'Seuil réappro' },
        { key: 'codeBarres', header: 'Code-barres' },
        { key: 'actif', header: 'Actif' },
        { key: 'stock', header: 'Stock initial' },
      ],
    );
  }

  async apercuImport(dto: ApercuImportProduitsDto) {
    const prep = await this.preparerImport(dto, dto.mode ?? 'UPSERT');
    const mapped = new Set(
      Object.values(prep.mapping).filter((v): v is string => Boolean(v)),
    );
    const colonnesIgnorees = prep.enTetes.filter((h) => !mapped.has(h));
    return {
      source: prep.source,
      enTetes: prep.enTetes,
      mapping: prep.mapping,
      colonnesIgnorees,
      totalLignes: prep.lignes.length,
      aCreer: prep.decisions.filter((d) => d.action === 'CREATE').length,
      aMettreAJour: prep.decisions.filter((d) => d.action === 'UPDATE').length,
      aIgnorer: prep.decisions.filter((d) => d.action === 'SKIP').length,
      enErreur: prep.decisions.filter((d) => d.action === 'ERROR').length,
      avertissementsGlobaux: prep.avertissementsGlobaux,
      apercu: prep.decisions.slice(0, 200).map((d) => ({
        index: d.parsed.index,
        action: d.action,
        designation: d.parsed.designation ?? d.existant?.designation ?? null,
        reference: d.parsed.reference ?? d.existant?.reference ?? null,
        prixUnitaire: d.parsed.prixUnitaire ?? null,
        erreurs: d.parsed.erreurs,
        avertissements: d.parsed.avertissements,
      })),
    };
  }

  async appliquerImport(
    dto: AppliquerImportProduitsDto,
    user: AuthenticatedUser,
  ) {
    const mode = dto.mode ?? 'UPSERT';
    const importerStockInitial = dto.importerStockInitial === true;
    const prep = await this.preparerImport(dto, mode);
    const bloquantes = prep.decisions.filter((d) => d.action === 'ERROR');
    if (bloquantes.length > 0 && dto.ignorerLignesEnErreur !== true) {
      throw new BadRequestException({
        message: `${bloquantes.length} ligne(s) en erreur — corrigez le mapping, ou importez uniquement les lignes valides.`,
        apercu: await this.apercuImport(dto),
      });
    }

    let crees = 0;
    let misAJour = 0;
    let ignores = 0;
    const ids: string[] = [];

    for (const d of prep.decisions) {
      if (d.action === 'SKIP' || d.action === 'ERROR') {
        ignores += 1;
        continue;
      }
      if (d.action === 'CREATE') {
        const created = await this.create(
          {
            designation: d.parsed.designation!,
            prixUnitaire: d.parsed.prixUnitaire!,
            stock: importerStockInitial ? (d.parsed.stock ?? 0) : 0,
            ...(d.parsed.reference ? { reference: d.parsed.reference } : {}),
            ...(d.parsed.codeBarres ? { codeBarres: d.parsed.codeBarres } : {}),
            ...(d.parsed.categorie ? { categorie: d.parsed.categorie } : {}),
            ...(d.parsed.description
              ? { description: d.parsed.description }
              : {}),
            ...(d.parsed.seuilReappro !== undefined
              ? { seuilReappro: d.parsed.seuilReappro ?? undefined }
              : {}),
            ...(d.parsed.uniteMesure
              ? { uniteMesure: d.parsed.uniteMesure }
              : {}),
            ...(d.parsed.methodeCout
              ? { methodeCout: d.parsed.methodeCout }
              : {}),
            ...(d.parsed.strategieSortie
              ? { strategieSortie: d.parsed.strategieSortie }
              : {}),
            ...(d.parsed.attributs ? { attributs: d.parsed.attributs } : {}),
          },
          user,
        );
        if (d.parsed.actif === false) {
          await this.update(created.id, { actif: false }, user);
        }
        crees += 1;
        ids.push(created.id);
        continue;
      }
      if (d.action === 'UPDATE' && d.existant) {
        const patch: UpdateProduitDto = {};
        if (d.parsed.designation) patch.designation = d.parsed.designation;
        if (d.parsed.reference !== undefined)
          patch.reference = d.parsed.reference;
        if (d.parsed.codeBarres !== undefined)
          patch.codeBarres = d.parsed.codeBarres;
        if (d.parsed.categorie !== undefined)
          patch.categorie = d.parsed.categorie;
        if (d.parsed.description !== undefined)
          patch.description = d.parsed.description;
        if (d.parsed.prixUnitaire !== undefined)
          patch.prixUnitaire = d.parsed.prixUnitaire;
        if (d.parsed.seuilReappro !== undefined)
          patch.seuilReappro = d.parsed.seuilReappro;
        if (d.parsed.actif !== undefined) patch.actif = d.parsed.actif;
        if (d.parsed.uniteMesure) patch.uniteMesure = d.parsed.uniteMesure;
        if (d.parsed.methodeCout) patch.methodeCout = d.parsed.methodeCout;
        if (d.parsed.strategieSortie)
          patch.strategieSortie = d.parsed.strategieSortie;
        await this.update(d.existant.id, patch, user);
        misAJour += 1;
        ids.push(d.existant.id);
      }
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_IMPORT',
      entite: 'Produit',
      entiteId: ids[0] ?? 'catalogue',
      details: JSON.stringify({
        source: prep.source,
        mode,
        importerStockInitial,
        ignorerLignesEnErreur: dto.ignorerLignesEnErreur === true,
        crees,
        misAJour,
        ignores,
        total: prep.lignes.length,
      }),
    });

    return { crees, misAJour, ignores, ids };
  }

  private async preparerImport(
    dto: ApercuImportProduitsDto,
    mode: 'UPSERT' | 'CREATE_ONLY' = 'UPSERT',
  ) {
    const table = await tableDepuisFichier(dto);
    if (table.enTetes.length === 0) {
      throw new BadRequestException(
        'Le fichier n’a pas d’en-tête de colonnes.',
      );
    }
    if (table.lignes.length > MAX_LIGNES_IMPORT) {
      throw new BadRequestException(
        `Import limité à ${MAX_LIGNES_IMPORT} lignes (fichier : ${table.lignes.length}).`,
      );
    }

    const auto = proposerMapping(table.enTetes);
    const mapping = fusionnerMapping(auto, dto.mapping);
    if (!mapping.designation && !mapping.reference && !mapping.codeBarres) {
      throw new BadRequestException(
        'Impossible d’identifier les colonnes : au moins Désignation, Référence ou Code-barres.',
      );
    }

    const parsed = table.lignes.map((ligne, i) =>
      parserLigneCatalogue(table.enTetes, ligne, mapping, i + 2),
    );

    const refs = parsed
      .map((p) => p.reference)
      .filter((v): v is string => Boolean(v));
    const codes = parsed
      .map((p) => p.codeBarres)
      .filter((v): v is string => Boolean(v));
    const existants = await this.prisma.produit.findMany({
      where: {
        OR: [
          ...(refs.length ? [{ reference: { in: refs } }] : []),
          ...(codes.length ? [{ codeBarres: { in: codes } }] : []),
        ],
      },
    });
    const byRef = new Map(
      existants
        .filter((p) => p.reference)
        .map((p) => [p.reference as string, p]),
    );
    const byCode = new Map(
      existants
        .filter((p) => p.codeBarres)
        .map((p) => [p.codeBarres as string, p]),
    );

    const seenRef = new Set<string>();
    const seenCode = new Set<string>();
    const avertissementsGlobaux = [
      'CMP, marge et valeur stock sont calculés — ils ne sont jamais importés.',
      'Le stock d’une fiche existante n’est jamais modifié (grand livre append-only).',
    ];
    if (mapping.stock) {
      avertissementsGlobaux.push(
        'Colonne stock : appliquée uniquement aux nouveaux produits, si vous cochez « stock initial ».',
      );
    }

    const decisions = parsed.map((p) => {
      if (estLigneImportVide(p)) {
        return { parsed: p, existant: null, action: 'SKIP' as const };
      }

      const existant =
        (p.reference ? byRef.get(p.reference) : undefined) ??
        (p.codeBarres ? byCode.get(p.codeBarres) : undefined);

      if (p.reference) {
        if (seenRef.has(p.reference)) {
          p.erreurs.push(
            `Référence « ${p.reference} » en double dans le fichier.`,
          );
        }
        seenRef.add(p.reference);
      }
      if (p.codeBarres) {
        if (seenCode.has(p.codeBarres)) {
          p.erreurs.push(
            `Code-barres « ${p.codeBarres} » en double dans le fichier.`,
          );
        }
        seenCode.add(p.codeBarres);
      }

      if (existant) {
        if (mode === 'CREATE_ONLY') {
          p.avertissements.push(
            'Déjà au catalogue — ignoré (mode création seulement).',
          );
          return { parsed: p, existant, action: 'SKIP' as const };
        }
        if (p.erreurs.length > 0) {
          return { parsed: p, existant, action: 'ERROR' as const };
        }
        return { parsed: p, existant, action: 'UPDATE' as const };
      }

      if (!p.designation)
        p.erreurs.push('Désignation obligatoire pour créer une fiche.');
      if (p.prixUnitaire === undefined) {
        p.erreurs.push('Prix unitaire obligatoire pour créer une fiche.');
      }
      if (p.erreurs.length > 0) {
        return { parsed: p, existant: null, action: 'ERROR' as const };
      }
      return { parsed: p, existant: null, action: 'CREATE' as const };
    });

    return {
      source: table.source,
      enTetes: table.enTetes,
      mapping,
      lignes: table.lignes,
      decisions,
      avertissementsGlobaux,
    };
  }

  private boutiqueIdPerimetre(user: AuthenticatedUser): string | undefined {
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      return requireOwnBoutiqueId(user);
    }
    return undefined;
  }

  private async entrepotIdsPerimetre(
    user: AuthenticatedUser,
  ): Promise<string[] | undefined> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return undefined;
    }
    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      const entrepots = await this.prisma.entrepot.findMany({
        where: { actif: true, boutique: { zoneId } },
        select: { id: true },
      });
      return entrepots.map((e) => e.id);
    }
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      const entrepots = await this.prisma.entrepot.findMany({
        where: { actif: true, boutiqueId },
        select: { id: true },
      });
      return entrepots.map((e) => e.id);
    }
    return undefined;
  }

  private async appliquerStockPerimetre(
    produits: ProduitEnrichi[],
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi[]> {
    const entrepotIds = await this.entrepotIdsPerimetre(user);
    if (entrepotIds === undefined) {
      return produits;
    }
    if (entrepotIds.length === 0 || produits.length === 0) {
      return produits.map((p) => enrichirProduit({ ...p, stock: 0 }));
    }
    const quants = await this.prisma.stockQuant.groupBy({
      by: ['produitId'],
      where: {
        entrepotId: { in: entrepotIds },
        produitId: { in: produits.map((p) => p.id) },
      },
      _sum: { quantite: true },
    });
    const parProduit = new Map(
      quants.map((q) => [q.produitId, q._sum.quantite ?? 0]),
    );
    return produits.map((p) =>
      enrichirProduit({ ...p, stock: parProduit.get(p.id) ?? 0 }),
    );
  }
}

function fusionnerMapping(
  auto: MappingImport,
  override?: MappingImportProduitsDto,
): MappingImport {
  if (!override) return auto;
  const out: MappingImport = { ...auto };
  for (const champ of CHAMPS_IMPORT) {
    if (Object.prototype.hasOwnProperty.call(override, champ)) {
      const v = override[champ];
      out[champ] = v === '' || v === undefined ? null : v;
    }
  }
  return out;
}
