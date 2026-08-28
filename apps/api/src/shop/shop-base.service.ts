import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ParametreShop } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculerLigneCommandeWeb,
  resoudrePrixProduitShop,
  type ParametresPrixShop,
} from './prix-shop.calculator';
import { ModeAffichagePrixShop } from '@caisse-crm/shared';

@Injectable()
export class ShopBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async getParametresShop(): Promise<ParametreShop> {
    const params = await this.prisma.parametreShop.findFirst({
      where: { shopActif: true },
    });
    if (!params) {
      throw new NotFoundException(
        'Boutique en ligne non configurée ou inactive.',
      );
    }
    return params;
  }

  toParametresPrix(params: ParametreShop): ParametresPrixShop {
    return {
      modeAffichagePrix:
        params.modeAffichagePrix === 'TTC'
          ? ModeAffichagePrixShop.TTC
          : ModeAffichagePrixShop.HT,
      tauxTvaDefaut: Number(params.tauxTvaDefaut),
      fallbackPrixMagasin: params.fallbackPrixMagasin,
    };
  }

  async assertShopActif(): Promise<ParametreShop> {
    const params = await this.getParametresShop();
    if (!params.shopActif) {
      throw new BadRequestException('La boutique en ligne est désactivée.');
    }
    return params;
  }
}

export function mapProduitCatalogue(
  produit: {
    id: string;
    designation: string;
    reference: string | null;
    categorie: string | null;
    description: string | null;
    imageUrl: string | null;
    slug: string | null;
    prixWeb: { toString(): string } | null;
    prixUnitaire: { toString(): string };
    visibleWeb: boolean;
    tauxTva: { toString(): string } | null;
    typeProduit?: string;
    attributs?: string | null;
    parentId?: string | null;
  },
  paramsPrix: ParametresPrixShop,
  stockDisponible?: number,
) {
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
  if (!prix) return null;
  return {
    id: produit.id,
    designation: produit.designation,
    reference: produit.reference,
    categorie: produit.categorie,
    description: produit.description,
    imageUrl: produit.imageUrl,
    slug: produit.slug,
    prixAffiche: prix.prixAffiche,
    prixUnitaireHt: prix.prixUnitaireHt,
    prixUnitaireTtc: prix.prixUnitaireTtc,
    modeAffichage: prix.modeAffichage,
    stockDisponible: stockDisponible ?? null,
    typeProduit: produit.typeProduit ?? 'ARTICLE',
    attributs: produit.attributs ?? null,
    parentId: produit.parentId ?? null,
  };
}

export { calculerLigneCommandeWeb, resoudrePrixProduitShop };
