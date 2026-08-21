import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Produit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
import type { AuthenticatedUser } from '../auth/types';
import { toCsv } from '../common/csv.util';
import { CreateProduitDto } from './dto/create-produit.dto';
import { UpdateProduitDto } from './dto/update-produit.dto';
import { ListProduitsQueryDto } from './dto/list-produits-query.dto';
import {
  enrichirProduit,
  money,
  quantitePourSortirAlerte,
  statutStockOf,
  type ProduitEnrichi,
} from './produits.helpers';

const FENETRE_ANALYSE_MS = 30 * 24 * 60 * 60 * 1000;

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
  ) {}

  async create(
    dto: CreateProduitDto,
    user: AuthenticatedUser,
  ): Promise<ProduitEnrichi> {
    const stockInitial = dto.stock ?? 0;
    let produit: Produit;
    try {
      produit = await this.prisma.produit.create({
        data: {
          designation: dto.designation,
          reference: dto.reference,
          categorie: dto.categorie,
          description: dto.description,
          prixUnitaire: dto.prixUnitaire,
          stock: 0,
          seuilReappro: dto.seuilReappro,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `La référence « ${dto.reference} » est déjà attribuée à un autre produit.`,
        );
      }
      throw error;
    }

    if (stockInitial > 0) {
      const entrepot = await this.prisma.entrepot.findFirst({
        where: { type: 'PRINCIPAL', actif: true },
        orderBy: { nom: 'asc' },
      });
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
      }),
    });

    return this.findOne(produit.id);
  }

  async findAll(query: ListProduitsQueryDto = {}): Promise<ProduitEnrichi[]> {
    const where: Prisma.ProduitWhereInput = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { designation: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
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

    let enrichis = produits.map(enrichirProduit);
    if (query.statutStock) {
      enrichis = enrichis.filter((p) => p.statutStock === query.statutStock);
    }
    if (query.margeNegative) {
      enrichis = enrichis.filter((p) =>
        new Prisma.Decimal(p.margeUnitaire).lessThan(0),
      );
    }
    return enrichis;
  }

  async exportCsv(query: ListProduitsQueryDto = {}): Promise<string> {
    const produits = await this.findAll(query);
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

  async classement() {
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

    const parId = new Map(produits.map((p) => [p.id, enrichirProduit(p)]));
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

    const dormants = produits
      .filter((p) => p.stock > 0 && (stats.get(p.id)?.quantite ?? 0) <= 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 8)
      .map((p) => ({
        produit: enrichirProduit(p),
        stock: p.stock,
        valeurStock: enrichirProduit(p).valeurStock,
      }));

    return {
      fenetreJours: 30,
      meilleuresVentes,
      dormants,
    };
  }

  async findVentes(id: string) {
    await this.findOne(id);
    const lignes = await this.prisma.ligneVente.findMany({
      where: { produitId: id },
      include: {
        vente: {
          select: {
            id: true,
            dateVente: true,
            modePaiement: true,
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
        modePaiement: ligne.vente.modePaiement,
        quantite: ligne.quantite,
        prixUnitaire: money(new Prisma.Decimal(ligne.prixUnitaire)),
        remise: money(new Prisma.Decimal(ligne.remise)),
        montant: money(montant),
      };
    });
  }

  async synthese() {
    const produits = await this.prisma.produit.findMany();
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

  async findOne(id: string): Promise<ProduitEnrichi> {
    const produit = await this.prisma.produit.findUnique({ where: { id } });
    if (!produit) {
      throw new NotFoundException(`Produit ${id} introuvable.`);
    }
    return enrichirProduit(produit);
  }

  async analyse(id: string) {
    const produit = await this.findOne(id);
    const depuis = new Date(Date.now() - FENETRE_ANALYSE_MS);

    const [quants, lignes, retours] = await Promise.all([
      this.prisma.stockQuant.findMany({
        where: { produitId: id },
        include: {
          entrepot: { select: { id: true, nom: true, code: true } },
        },
        orderBy: { entrepot: { nom: 'asc' } },
      }),
      this.prisma.ligneVente.findMany({
        where: {
          produitId: id,
          vente: { dateVente: { gte: depuis } },
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
          ligneVente: { produitId: id },
          dateHeure: { gte: depuis },
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

    return {
      produit,
      repartitionStock: quants.map((q) => ({
        entrepotId: q.entrepot.id,
        nom: q.entrepot.nom,
        code: q.entrepot.code,
        quantite: q.quantite,
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
    await this.findOne(id);

    let produit: Produit;
    try {
      produit = await this.prisma.produit.update({
        where: { id },
        data: {
          designation: dto.designation,
          reference: dto.reference,
          categorie: dto.categorie,
          description: dto.description,
          prixUnitaire: dto.prixUnitaire,
          seuilReappro: dto.seuilReappro,
          actif: dto.actif,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `La référence « ${dto.reference} » est déjà attribuée à un autre produit.`,
        );
      }
      throw error;
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_UPDATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify(dto),
    });

    return enrichirProduit(produit);
  }

  async findMouvements(id: string) {
    await this.findOne(id);
    return this.prisma.mouvementStock.findMany({
      where: { produitId: id },
      include: {
        entrepot: { select: { nom: true, code: true } },
      },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }
}
