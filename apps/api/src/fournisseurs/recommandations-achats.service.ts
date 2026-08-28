import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleLibelle } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { resolveZoneScopeForSuperviseur } from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { RecommandationsAchatQueryDto } from './dto/planning-achat.dto';
import { calculerRecommandationAchat } from './recommandation-achat.calculator';
import { chargerDonneesRecommandationAchat } from './recommandation-achat.context';

@Injectable()
export class RecommandationsAchatsService {
  constructor(private readonly prisma: PrismaService) {}

  async calculer(query: RecommandationsAchatQueryDto, user: AuthenticatedUser) {
    const entrepot = await this.prisma.entrepot.findUnique({
      where: { id: query.entrepotId },
      include: { boutique: { select: { id: true, nom: true, zoneId: true } } },
    });
    if (!entrepot) throw new NotFoundException('Entrepôt introuvable.');
    await this.assertScope(
      entrepot.boutique.id,
      entrepot.boutique.zoneId,
      user,
    );

    const fenetreJours = query.fenetreJours;
    const depuis = new Date();
    depuis.setUTCDate(depuis.getUTCDate() - fenetreJours);
    const regles = await this.prisma.regleReappro.findMany({
      where: { entrepotId: entrepot.id, produit: { actif: true } },
      include: {
        produit: { select: { id: true, designation: true, reference: true } },
      },
      orderBy: { produit: { designation: 'asc' } },
    });

    const recommandations = await Promise.all(
      regles.map(async (regle) => {
        const donnees = await chargerDonneesRecommandationAchat(this.prisma, {
          produitId: regle.produitId,
          entrepotId: entrepot.id,
          boutiqueId: entrepot.boutiqueId,
          fenetreJours,
        });

        const historiqueFournisseurs = donnees.historiqueFournisseurs.map(
          (historique) => ({
            ...historique,
            recommandation: calculerRecommandationAchat({
              ventesQuantite: donnees.ventesQuantite,
              fenetreJours,
              stockCourant: donnees.stockCourant,
              stockReserve: donnees.stockReserve,
              stockEnTransit: donnees.stockEnTransit,
              stockMin: regle.min,
              stockMax: regle.max,
              delaiFournisseurJours: historique.delaiMoyenJours,
            }),
          }),
        );

        return {
          produit: regle.produit,
          entrepotId: entrepot.id,
          fenetre: { depuis: depuis.toISOString(), jours: fenetreJours },
          donneesReelles: {
            ventesNettesQuantite: donnees.ventesQuantite,
            stockCourant: donnees.stockCourant,
            stockReserve: donnees.stockReserve,
            stockEnTransit: donnees.stockEnTransit,
            stockMin: regle.min,
            stockMax: regle.max,
          },
          historiqueFournisseurs,
          calculable: historiqueFournisseurs.length > 0,
          raisonNonCalculable:
            historiqueFournisseurs.length === 0
              ? 'Aucune réception fournisseur historique : aucun délai ne peut être inventé.'
              : null,
        };
      }),
    );

    return {
      entrepot: {
        id: entrepot.id,
        nom: entrepot.nom,
        boutique: entrepot.boutique,
      },
      recommandations,
    };
  }

  private async assertScope(
    boutiqueId: string,
    zoneId: string,
    user: AuthenticatedUser,
  ) {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (user.boutiqueId !== boutiqueId) {
        throw new ForbiddenException('Entrepôt hors de votre boutique.');
      }
      return;
    }
    if (user.role === RoleLibelle.SUPERVISEUR_ZONE) {
      const ownZone = await resolveZoneScopeForSuperviseur(this.prisma, user);
      if (ownZone !== zoneId) {
        throw new ForbiddenException('Entrepôt hors de votre zone.');
      }
    }
  }
}
