import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import { AuditService } from '../audit/audit.service';
import { ShopPanierService } from './shop-panier.service';
import { ShopBaseService } from './shop-base.service';
import { resoudreEntrepotWebId } from './entrepot-web.resolver';
import {
  statutApresCheckout,
  transitionCommandeWebAutorisee,
} from './commande-web-state-machine';
import type { CheckoutShopDto } from './dto/shop-checkout.dto';
import type { DisponibiliteStockShopDto } from './dto/shop-stock.dto';
import {
  ModeFulfillmentCommandeWeb,
  ModeReglementCommandeWeb,
  ProviderPspShop,
  StatutCommandeWeb,
} from '@caisse-crm/shared';
import { ShopOrderLifecycleService } from './shop-order-lifecycle.service';

@Injectable()
export class ShopCheckoutService {
  private readonly logger = new Logger(ShopCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopPanier: ShopPanierService,
    private readonly shopBase: ShopBaseService,
    private readonly stockService: StockService,
    private readonly audit: AuditService,
    private readonly lifecycle: ShopOrderLifecycleService,
  ) {}

  async checkout(
    panierToken: string | undefined,
    dto: CheckoutShopDto,
    compteClientId?: string,
  ) {
    const panier = await this.shopPanier.resolvePanier(panierToken);
    if (!panier.lignes.length) {
      throw new BadRequestException('Panier vide.');
    }

    const existing = await this.prisma.commandeWeb.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (existing && existing.id !== panier.id) {
      throw new ConflictException('Commande déjà enregistrée (idempotence).');
    }

    const params = await this.shopBase.assertShopActif();
    this.validerModeReglement(dto, params);

    let clientId: string | null = null;
    let emailInvite = dto.emailInvite ?? null;
    let telephoneInvite = dto.telephoneInvite ?? null;

    if (compteClientId) {
      const compte = await this.prisma.compteClient.findUnique({
        where: { id: compteClientId },
        include: { client: true },
      });
      if (!compte || !compte.actif) {
        throw new BadRequestException('Compte client invalide.');
      }
      clientId = compte.clientId;
      emailInvite = emailInvite || compte.email;
      telephoneInvite = telephoneInvite || compte.client.contact || null;
    }

    if (!emailInvite || !emailInvite.includes('@')) {
      throw new BadRequestException('E-mail de contact requis.');
    }

    let boutiqueRetrait: Awaited<
      ReturnType<typeof this.prisma.boutique.findFirst>
    > = null;
    if (dto.modeFulfillment === ModeFulfillmentCommandeWeb.RETRAIT_BOUTIQUE) {
      if (!params.retraitActif) {
        throw new BadRequestException('Click & collect désactivé.');
      }
      boutiqueRetrait = await this.prisma.boutique.findFirst({
        where: {
          id: dto.boutiqueRetraitId,
          actif: true,
          retraitWebActif: true,
        },
      });
      if (!boutiqueRetrait) {
        throw new BadRequestException('Boutique de retrait invalide.');
      }
    }

    let fraisLivraison = 0;
    let zoneLivraisonId: string | undefined;
    if (dto.modeFulfillment === ModeFulfillmentCommandeWeb.LIVRAISON) {
      if (!params.livraisonActive) {
        throw new BadRequestException('Livraison désactivée.');
      }
      const zone = await this.prisma.zoneLivraison.findFirst({
        where: { id: dto.zoneLivraisonId, actif: true },
      });
      if (!zone) {
        throw new BadRequestException('Zone de livraison invalide.');
      }
      fraisLivraison = Number(zone.tarifForfait);
      zoneLivraisonId = zone.id;
    }

    const entrepotId = resoudreEntrepotWebId(dto.modeFulfillment, {
      parametreShop: params,
      boutiqueRetrait,
    });

    for (const ligne of panier.lignes) {
      const produit = await this.prisma.produit.findUnique({
        where: { id: ligne.produitId },
      });
      if (produit?.typeProduit === 'ARTICLE') {
        const dispo = await this.stockService.getDisponible(
          ligne.produitId,
          entrepotId,
        );
        if (dispo < ligne.quantite) {
          throw new BadRequestException(
            `Stock insuffisant pour "${ligne.designationSnapshot}" (disponible: ${dispo}).`,
          );
        }
      }
    }

    const montantTotal = Number(panier.montantArticlesTtc) + fraisLivraison;
    const nouveauStatut = statutApresCheckout(dto.modeReglement);
    const ctx = {
      modeReglement: dto.modeReglement,
      modeFulfillment: dto.modeFulfillment,
    };
    if (
      !transitionCommandeWebAutorisee(
        StatutCommandeWeb.PANIER,
        nouveauStatut,
        ctx,
      )
    ) {
      throw new BadRequestException('Transition de commande non autorisée.');
    }

    const expireAt = new Date(
      Date.now() + params.dureeReservationPanierMin * 60 * 1000,
    );
    const suiviToken = randomUUID();

    const commande = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.commandeWeb.update({
        where: { id: panier.id },
        data: {
          clientOperationId: dto.clientOperationId,
          statut: nouveauStatut,
          modeFulfillment: dto.modeFulfillment,
          modeReglement: dto.modeReglement,
          providerPsp: dto.providerPsp ?? null,
          boutiqueRetraitId: dto.boutiqueRetraitId ?? null,
          entrepotId,
          zoneLivraisonId: zoneLivraisonId ?? null,
          adresseLivraisonJson: (dto.adresseLivraison ?? undefined) as
            import('@prisma/client').Prisma.InputJsonValue | undefined,
          emailInvite,
          telephoneInvite,
          noteClient: dto.noteClient ?? null,
          fraisLivraison,
          montantTotal,
          expireAt,
          suiviToken,
          ...(compteClientId
            ? { compteClientId, clientId: clientId ?? undefined }
            : {}),
        },
        include: { lignes: true },
      });

      await tx.reservationWeb.deleteMany({
        where: { commandeWebId: panier.id },
      });
      for (const ligne of panier.lignes) {
        await tx.reservationWeb.create({
          data: {
            holdId: randomUUID(),
            commandeWebId: panier.id,
            produitId: ligne.produitId,
            entrepotId,
            quantite: ligne.quantite,
            expireAt,
          },
        });
      }

      if (
        compteClientId &&
        dto.modeFulfillment === ModeFulfillmentCommandeWeb.LIVRAISON &&
        dto.adresseLivraison
      ) {
        const addr = dto.adresseLivraison;
        const ligne1 =
          typeof addr.ligne1 === 'string' ? addr.ligne1.trim() : '';
        const ville =
          typeof addr.ville === 'string' ? addr.ville.trim() : 'Abidjan';
        if (ligne1) {
          try {
            const deja = await tx.adresseClient.findFirst({
              where: { compteClientId, ligne1, ville },
            });
            if (!deja) {
              await tx.adresseClient.create({
                data: {
                  compteClientId,
                  clientId: clientId ?? undefined,
                  libelle: 'Livraison',
                  ligne1,
                  ville,
                  pays: 'CI',
                  telephone: telephoneInvite,
                  lat:
                    typeof addr.lat === 'number' && Number.isFinite(addr.lat)
                      ? addr.lat
                      : undefined,
                  lng:
                    typeof addr.lng === 'number' && Number.isFinite(addr.lng)
                      ? addr.lng
                      : undefined,
                },
              });
            }
          } catch {
            // Carnet d’adresses : jamais bloquer une commande payante.
          }
        }
      }

      return updated;
    });

    await this.audit.record({
      utilisateurId: await this.auditUserId(),
      action: 'CHECKOUT_WEB',
      entite: 'CommandeWeb',
      entiteId: commande.id,
      details: `Statut ${nouveauStatut} — ${dto.modeFulfillment} / ${dto.modeReglement}`,
    });

    try {
      await this.lifecycle.apresCheckout(commande.id);
    } catch (err) {
      this.logger.error(
        `apresCheckout ${commande.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return {
      id: commande.id,
      clientOperationId: commande.clientOperationId,
      statut: commande.statut,
      modeFulfillment: commande.modeFulfillment,
      modeReglement: commande.modeReglement,
      montantTotal: Number(commande.montantTotal),
      suiviToken: commande.suiviToken,
      expireAt: commande.expireAt,
    };
  }

  async disponibiliteLignes(dto: DisponibiliteStockShopDto) {
    const params = await this.shopBase.assertShopActif();
    let boutiqueRetrait: Awaited<
      ReturnType<typeof this.prisma.boutique.findFirst>
    > = null;

    if (dto.modeFulfillment === ModeFulfillmentCommandeWeb.RETRAIT_BOUTIQUE) {
      if (!dto.boutiqueRetraitId) {
        throw new BadRequestException('Boutique de retrait requise.');
      }
      boutiqueRetrait = await this.prisma.boutique.findFirst({
        where: {
          id: dto.boutiqueRetraitId,
          actif: true,
          retraitWebActif: true,
        },
      });
      if (!boutiqueRetrait) {
        throw new BadRequestException('Boutique de retrait invalide.');
      }
    }

    const entrepotId = resoudreEntrepotWebId(dto.modeFulfillment, {
      parametreShop: params,
      boutiqueRetrait,
    });

    const produits = await this.prisma.produit.findMany({
      where: { id: { in: dto.produitIds } },
      select: { id: true, typeProduit: true },
    });
    const typeById = new Map(produits.map((p) => [p.id, p.typeProduit]));

    const lignes = await Promise.all(
      dto.produitIds.map(async (produitId) => {
        if (typeById.get(produitId) !== 'ARTICLE') {
          return { produitId, disponible: null as number | null };
        }
        return {
          produitId,
          disponible: await this.stockService.getDisponible(
            produitId,
            entrepotId,
          ),
        };
      }),
    );

    return {
      entrepotId,
      boutiqueRetraitId: boutiqueRetrait?.id ?? null,
      lignes,
    };
  }

  async getModesReglement() {
    const params = await this.shopBase.assertShopActif();
    return {
      paiementRetraitActif: params.paiementRetraitActif,
      paiementLivraisonActif: params.paiementLivraisonActif,
      retraitActif: params.retraitActif,
      livraisonActive: params.livraisonActive,
    };
  }

  async getStatut(commandeIdOrRef: string) {
    const commande = await this.prisma.commandeWeb.findFirst({
      where: {
        OR: [{ id: commandeIdOrRef }, { clientOperationId: commandeIdOrRef }],
      },
    });
    if (!commande) {
      throw new BadRequestException('Commande introuvable.');
    }
    return {
      id: commande.id,
      reference: commande.id.slice(0, 8).toUpperCase(),
      clientOperationId: commande.clientOperationId,
      statut: commande.statut,
      modeFulfillment: commande.modeFulfillment,
      modeReglement: commande.modeReglement,
      payeeAt: commande.payeeAt,
      montantTotal: Number(commande.montantTotal),
      suiviToken: commande.suiviToken,
    };
  }

  async getSuivi(token: string) {
    const commande = await this.prisma.commandeWeb.findUnique({
      where: { suiviToken: token },
      include: {
        lignes: {
          include: {
            produit: {
              select: {
                imageUrl: true,
                slug: true,
                parent: { select: { imageUrl: true, slug: true } },
              },
            },
          },
        },
        boutiqueRetrait: { select: { nom: true, adresse: true } },
        zoneLivraison: { select: { libelle: true, tarifForfait: true } },
      },
    });
    if (!commande) {
      throw new BadRequestException('Suivi introuvable.');
    }

    const adresse =
      commande.adresseLivraisonJson &&
      typeof commande.adresseLivraisonJson === 'object' &&
      !Array.isArray(commande.adresseLivraisonJson)
        ? (commande.adresseLivraisonJson as Record<string, unknown>)
        : null;

    return {
      id: commande.id,
      reference: commande.id.slice(0, 8).toUpperCase(),
      statut: commande.statut,
      modeFulfillment: commande.modeFulfillment,
      modeReglement: commande.modeReglement,
      providerPsp: commande.providerPsp,
      montantArticlesTtc: Number(commande.montantArticlesTtc),
      fraisLivraison: Number(commande.fraisLivraison),
      montantTotal: Number(commande.montantTotal),
      noteClient: commande.noteClient,
      numeroSuivi: commande.numeroSuivi,
      email: commande.emailInvite,
      telephone: commande.telephoneInvite,
      boutiqueRetrait: commande.boutiqueRetrait
        ? {
            nom: commande.boutiqueRetrait.nom,
            adresse: commande.boutiqueRetrait.adresse,
          }
        : null,
      zoneLivraison: commande.zoneLivraison
        ? {
            libelle: commande.zoneLivraison.libelle,
            tarif: Number(commande.zoneLivraison.tarifForfait),
          }
        : null,
      adresseLivraison: adresse
        ? {
            ligne1: typeof adresse.ligne1 === 'string' ? adresse.ligne1 : null,
            ville: typeof adresse.ville === 'string' ? adresse.ville : null,
            telephone:
              typeof adresse.telephone === 'string' ? adresse.telephone : null,
          }
        : null,
      lignes: commande.lignes.map((l) => ({
        designation: l.designationSnapshot,
        reference: l.referenceSnapshot,
        quantite: l.quantite,
        prixUnitaireTtc: Number(l.prixUnitaireTtc),
        montantLigne: Number(l.prixUnitaireTtc) * l.quantite,
        imageUrl: l.produit.imageUrl || l.produit.parent?.imageUrl || null,
        slug: l.produit.slug ?? l.produit.parent?.slug ?? null,
      })),
      createdAt: commande.createdAt,
      payeeAt: commande.payeeAt,
      updatedAt: commande.updatedAt,
    };
  }

  private auditUserIdCache: string | null = null;

  private async auditUserId(): Promise<string> {
    if (this.auditUserIdCache) return this.auditUserIdCache;
    const si = await this.prisma.utilisateur.findFirst({
      where: { role: { libelle: 'RESPONSABLE_SI' }, actif: true },
      select: { id: true },
    });
    if (!si) {
      throw new BadRequestException(
        'Utilisateur audit shop (RESPONSABLE_SI) introuvable.',
      );
    }
    this.auditUserIdCache = si.id;
    return si.id;
  }

  private validerModeReglement(
    dto: CheckoutShopDto,
    params: {
      paiementRetraitActif: boolean;
      paiementLivraisonActif: boolean;
    },
  ) {
    if (dto.modeReglement === ModeReglementCommandeWeb.PAIEMENT_RETRAIT) {
      if (!params.paiementRetraitActif) {
        throw new BadRequestException('Paiement au retrait désactivé.');
      }
      if (dto.modeFulfillment !== ModeFulfillmentCommandeWeb.RETRAIT_BOUTIQUE) {
        throw new BadRequestException(
          'Paiement au retrait réservé au click & collect.',
        );
      }
    }
    if (dto.modeReglement === ModeReglementCommandeWeb.PAIEMENT_LIVRAISON) {
      if (!params.paiementLivraisonActif) {
        throw new BadRequestException('Paiement à la livraison désactivé.');
      }
      if (dto.modeFulfillment !== ModeFulfillmentCommandeWeb.LIVRAISON) {
        throw new BadRequestException(
          'Paiement à la livraison réservé au mode livraison.',
        );
      }
    }
    if (
      dto.modeReglement === ModeReglementCommandeWeb.PREPAYE_PSP &&
      !dto.providerPsp
    ) {
      dto.providerPsp = ProviderPspShop.PAYSTACK;
    }
  }
}
