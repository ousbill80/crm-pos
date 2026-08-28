import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculerLigneCommandeWeb,
  resoudrePrixProduitShop,
  ShopBaseService,
} from './shop-base.service';
import { signerPanierId, verifierPanierToken } from './shop-panier.token';
import type { PanierLigneDto } from './dto/shop-checkout.dto';
import { resoudreEntrepotWebId } from './entrepot-web.resolver';

@Injectable()
export class ShopPanierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopBase: ShopBaseService,
    private readonly config: ConfigService,
  ) {}

  private panierSecret(): string {
    return (
      this.config.get<string>('SHOP_PANIER_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'dev-shop-panier-secret'
    );
  }

  async creerPanier(): Promise<{ panierId: string; token: string }> {
    const params = await this.shopBase.assertShopActif();
    if (!params.entrepotWebDefautId) {
      throw new BadRequestException('Entrepôt web par défaut non configuré.');
    }
    const panierId = randomUUID();
    await this.prisma.commandeWeb.create({
      data: {
        id: panierId,
        clientOperationId: randomUUID(),
        statut: 'PANIER',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        entrepotId: params.entrepotWebDefautId,
      },
    });
    return { panierId, token: signerPanierId(panierId, this.panierSecret()) };
  }

  async resolvePanier(token: string | undefined) {
    const panierId = verifierPanierToken(token, this.panierSecret());
    if (!panierId) {
      throw new BadRequestException('Panier invalide ou expiré.');
    }
    const panier = await this.prisma.commandeWeb.findUnique({
      where: { id: panierId },
      include: { lignes: true },
    });
    if (!panier || panier.statut !== 'PANIER') {
      throw new NotFoundException('Panier introuvable.');
    }
    return panier;
  }

  async getPanier(token: string | undefined) {
    const panier = await this.resolvePanier(token);
    const params = await this.shopBase.getParametresShop();
    return this.formatPanier(panier, params);
  }

  async updateLignes(token: string | undefined, lignes: PanierLigneDto[]) {
    const panier = await this.resolvePanier(token);
    const params = await this.shopBase.assertShopActif();
    const paramsPrix = this.shopBase.toParametresPrix(params);

    if (!lignes.length) {
      await this.prisma.ligneCommandeWeb.deleteMany({
        where: { commandeWebId: panier.id },
      });
      return this.getPanier(token);
    }

    const produitIds = [...new Set(lignes.map((l) => l.produitId))];
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: produitIds }, actif: true, visibleWeb: true },
    });
    if (produits.length !== produitIds.length) {
      throw new BadRequestException('Un ou plusieurs produits sont invalides.');
    }

    const lignesData: Prisma.LigneCommandeWebCreateManyInput[] = [];
    let montantArticlesHt = 0;
    let montantTva = 0;
    let montantArticlesTtc = 0;

    for (const ligne of lignes) {
      if (ligne.quantite < 1) {
        throw new BadRequestException('Quantité invalide.');
      }
      const produit = produits.find((p) => p.id === ligne.produitId)!;
      const prix = resoudrePrixProduitShop(
        {
          prixWeb: produit.prixWeb ? Number(produit.prixWeb) : null,
          prixUnitaire: Number(produit.prixUnitaire),
          visibleWeb: produit.visibleWeb,
          tauxTva: produit.tauxTva ? Number(produit.tauxTva) : null,
          designation: produit.designation,
        },
        paramsPrix,
      );
      if (!prix) {
        throw new BadRequestException(
          `Produit "${produit.designation}" non disponible sur le web.`,
        );
      }
      const calc = calculerLigneCommandeWeb(ligne.quantite, prix);
      montantArticlesHt += calc.prixUnitaireHt * ligne.quantite;
      montantTva += calc.montantTvaLigne;
      montantArticlesTtc += calc.montantLigneTtc;
      lignesData.push({
        commandeWebId: panier.id,
        produitId: produit.id,
        quantite: ligne.quantite,
        prixUnitaireHt: calc.prixUnitaireHt,
        tauxTva: calc.tauxTva,
        montantTvaLigne: calc.montantTvaLigne,
        prixUnitaireTtc: calc.prixUnitaireTtc,
        designationSnapshot: produit.designation,
        referenceSnapshot: produit.reference,
      });
    }

    await this.prisma.$transaction([
      this.prisma.ligneCommandeWeb.deleteMany({
        where: { commandeWebId: panier.id },
      }),
      this.prisma.ligneCommandeWeb.createMany({ data: lignesData }),
      this.prisma.commandeWeb.update({
        where: { id: panier.id },
        data: {
          montantArticlesHt,
          montantTva,
          montantArticlesTtc,
          montantTotal: montantArticlesTtc,
          entrepotId: resoudreEntrepotWebId('LIVRAISON', {
            parametreShop: params,
          }),
        },
      }),
    ]);

    return this.getPanier(token);
  }

  private formatPanier(
    panier: {
      id: string;
      montantArticlesHt: Prisma.Decimal;
      montantTva: Prisma.Decimal;
      montantArticlesTtc: Prisma.Decimal;
      montantTotal: Prisma.Decimal;
      lignes: Array<{
        produitId: string;
        quantite: number;
        prixUnitaireHt: Prisma.Decimal;
        prixUnitaireTtc: Prisma.Decimal;
        designationSnapshot: string;
        referenceSnapshot: string | null;
      }>;
    },
    params: { modeAffichagePrix: string; dureeReservationPanierMin: number },
  ) {
    return {
      id: panier.id,
      lignes: panier.lignes.map((l) => ({
        produitId: l.produitId,
        quantite: l.quantite,
        designation: l.designationSnapshot,
        reference: l.referenceSnapshot,
        prixUnitaireHt: Number(l.prixUnitaireHt),
        prixUnitaireTtc: Number(l.prixUnitaireTtc),
      })),
      montantArticlesHt: Number(panier.montantArticlesHt),
      montantTva: Number(panier.montantTva),
      montantArticlesTtc: Number(panier.montantArticlesTtc),
      montantTotal: Number(panier.montantTotal),
      modeAffichage: params.modeAffichagePrix,
      ttlMinutes: params.dureeReservationPanierMin,
    };
  }
}
