import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Prisma,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import {
  ROLES_LECTURE_CAISSES,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import { CaisseBalanceService } from '../caisses/caisse-balance.service';
import { PrismaService } from '../prisma/prisma.service';

// Alertes automatiques — §6.7 :
// écart de caisse, versement non transmis sous 24 h, accès non autorisé,
// seuil de caisse dépassé (§5.1 — ex. 500 000 FCFA, versement anticipé),
// litige non régularisé sous 24 à 48 h (§5.1).

export type TypeAlerte =
  | 'ECART_CAISSE'
  | 'VERSEMENT_EN_RETARD'
  | 'ACCES_REFUSE'
  | 'STOCK_BAS'
  | 'SEUIL_CAISSE_DEPASSE'
  | 'LITIGE_EN_RETARD';

export interface AlerteDto {
  type: TypeAlerte;
  severite: 'WARNING' | 'CRITICAL';
  message: string;
  dateHeure: string;
  entite: string;
  entiteId: string;
  details?: Record<string, unknown>;
}

const DELAI_VERSEMENT_HEURES_DEFAUT = 24;
const DELAI_REGULARISATION_LITIGE_HEURES_DEFAUT = 48;

@Injectable()
export class AlertesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caisseBalanceService: CaisseBalanceService,
  ) {}

  async lister(user: AuthenticatedUser): Promise<AlerteDto[]> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter les alertes trésorerie.`,
      );
    }

    const caisseFilter = await this.resolveCaisseFilter(user);
    const acces = ROLES_RESEAU_TRESORERIE.includes(user.role)
      ? await this.alertesAccesRefusesReseau()
      : [];
    return this.collecter(caisseFilter, acces);
  }

  // Usage interne uniquement (scheduler de notifications, §6.7) : vue
  // réseau entier, sans vérification RBAC — ce n'est pas une réponse à une
  // requête utilisateur.
  async listerReseau(): Promise<AlerteDto[]> {
    const acces = await this.alertesAccesRefusesReseau();
    return this.collecter(undefined, acces);
  }

  private async collecter(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
    acces: AlerteDto[],
  ): Promise<AlerteDto[]> {
    const societe = await this.prisma.societe.findFirst({
      select: {
        delaiVersementHeures: true,
        seuilVersementAnticipe: true,
        delaiRegularisationLitigeHeures: true,
      },
    });
    const delaiVersementHeures =
      societe?.delaiVersementHeures ?? DELAI_VERSEMENT_HEURES_DEFAUT;
    const delaiRegularisationLitigeHeures =
      societe?.delaiRegularisationLitigeHeures ??
      DELAI_REGULARISATION_LITIGE_HEURES_DEFAUT;

    const [ecarts, retards, stocksBas, seuilsCaisse, litigesRetard] =
      await Promise.all([
        this.alertesEcarts(caisseFilter),
        this.alertesRetards(caisseFilter, delaiVersementHeures),
        this.alertesStockBas(),
        this.alertesSeuilCaisse(
          caisseFilter,
          societe?.seuilVersementAnticipe ?? null,
        ),
        this.alertesLitigesEnRetard(
          caisseFilter,
          delaiRegularisationLitigeHeures,
        ),
      ]);

    return [
      ...ecarts,
      ...retards,
      ...acces,
      ...stocksBas,
      ...seuilsCaisse,
      ...litigesRetard,
    ].sort(
      (a, b) =>
        new Date(b.dateHeure).getTime() - new Date(a.dateHeure).getTime(),
    );
  }

  private async resolveCaisseFilter(
    user: AuthenticatedUser,
  ): Promise<Prisma.CaisseWhereInput | undefined> {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return undefined;
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return { boutique: { zoneId } };
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return { boutiqueId };
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" sans périmètre alertes défini.`,
    );
  }

  private async alertesEcarts(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
  ): Promise<AlerteDto[]> {
    const litiges = await this.prisma.transactionCaisse.findMany({
      where: {
        type: TypeTransaction.SORTIE_FONDS,
        statut: StatutTransaction.LITIGE,
        ...(caisseFilter ? { caisse: caisseFilter } : {}),
      },
      include: {
        caisse: { include: { boutique: { select: { nom: true } } } },
        bordereau: {
          include: {
            reception: { select: { ecart: true, montantRecu: true } },
          },
        },
      },
      orderBy: { dateHeure: 'desc' },
      take: 100,
    });

    return litiges.map((t) => {
      const boutique = t.caisse.boutique?.nom ?? 'inconnue';
      const ecart = t.bordereau?.reception?.ecart;
      return {
        type: 'ECART_CAISSE' as const,
        severite: 'CRITICAL' as const,
        message: `Écart de caisse constaté (${boutique}) — transaction en litige`,
        dateHeure: t.dateHeure.toISOString(),
        entite: 'TransactionCaisse',
        entiteId: t.id,
        details: {
          montant: t.montant.toFixed(2),
          ecart: ecart?.toFixed(2) ?? null,
          montantRecu: t.bordereau?.reception?.montantRecu?.toFixed(2) ?? null,
          boutiqueId: t.caisse.boutiqueId,
        },
      };
    });
  }

  private async alertesRetards(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
    delaiVersementHeures: number,
  ): Promise<AlerteDto[]> {
    const seuil = new Date(Date.now() - delaiVersementHeures * 60 * 60 * 1000);
    const retards = await this.prisma.transactionCaisse.findMany({
      where: {
        type: TypeTransaction.SORTIE_FONDS,
        statut: {
          in: [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
        },
        dateHeure: { lt: seuil },
        ...(caisseFilter ? { caisse: caisseFilter } : {}),
      },
      include: {
        caisse: { include: { boutique: { select: { nom: true } } } },
      },
      orderBy: { dateHeure: 'asc' },
      take: 100,
    });

    return retards.map((t) => {
      const boutique = t.caisse.boutique?.nom ?? 'inconnue';
      const ageH = Math.floor(
        (Date.now() - t.dateHeure.getTime()) / (60 * 60 * 1000),
      );
      return {
        type: 'VERSEMENT_EN_RETARD' as const,
        severite: 'WARNING' as const,
        message: `Versement non transmis dans le délai (${delaiVersementHeures} h) — ${boutique}, statut ${t.statut}, âgé de ${ageH} h`,
        dateHeure: t.dateHeure.toISOString(),
        entite: 'TransactionCaisse',
        entiteId: t.id,
        details: {
          montant: t.montant.toFixed(2),
          statut: t.statut,
          ageHeures: ageH,
          boutiqueId: t.caisse.boutiqueId,
        },
      };
    });
  }

  private async alertesAccesRefusesReseau(): Promise<AlerteDto[]> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.journalAudit.findMany({
      where: {
        action: 'ACCES_REFUSE',
        dateHeure: { gte: since },
      },
      include: {
        utilisateur: {
          select: { login: true, role: { select: { libelle: true } } },
        },
      },
      orderBy: { dateHeure: 'desc' },
      take: 100,
    });

    return rows.map((r) => {
      let parsed: Record<string, unknown> | undefined;
      if (r.details) {
        try {
          parsed = JSON.parse(r.details) as Record<string, unknown>;
        } catch {
          parsed = { raw: r.details };
        }
      }
      return {
        type: 'ACCES_REFUSE' as const,
        severite: 'WARNING' as const,
        message: `Tentative d'accès non autorisée — ${r.utilisateur.login} (${r.utilisateur.role.libelle})`,
        dateHeure: r.dateHeure.toISOString(),
        entite: r.entite,
        entiteId: r.entiteId,
        details: {
          utilisateurId: r.utilisateurId,
          login: r.utilisateur.login,
          role: r.utilisateur.role.libelle,
          ...parsed,
        },
      };
    });
  }

  // Stock bas : catalogue réseau entier (Produit n'est pas scopé boutique),
  // pas d'historique persisté — alerte calculée sur l'état courant, comme
  // un snapshot (contrairement aux autres alertes dérivées du journal).
  private async alertesStockBas(): Promise<AlerteDto[]> {
    const produits = await this.prisma.produit.findMany({
      where: { actif: true, seuilReappro: { not: null } },
    });

    return produits
      .filter((p) => p.seuilReappro !== null && p.stock <= p.seuilReappro)
      .map((p) => ({
        type: 'STOCK_BAS' as const,
        severite: 'WARNING' as const,
        message: `Stock bas — ${p.designation} (${p.stock} unité(s), seuil ${p.seuilReappro})`,
        dateHeure: new Date().toISOString(),
        entite: 'Produit',
        entiteId: p.id,
        details: {
          stock: p.stock,
          seuilReappro: p.seuilReappro,
        },
      }));
  }

  // Seuil de caisse (§5.1, ex. 500 000 FCFA) : alerte incitative au
  // versement anticipé, désactivée tant qu'aucun seuil n'est configuré
  // (Societe.seuilVersementAnticipe défaut null). L'initiation du
  // bordereau reste un acte du responsable boutique — pas de création
  // automatique de transaction ici.
  private async alertesSeuilCaisse(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
    seuil: Prisma.Decimal | null,
  ): Promise<AlerteDto[]> {
    if (!seuil) {
      return [];
    }

    const caisses = await this.prisma.caisse.findMany({
      where: {
        type: TypeCaisse.MAGASIN,
        actif: true,
        ...(caisseFilter ?? {}),
      },
      include: { boutique: { select: { nom: true } } },
    });

    const alertes: AlerteDto[] = [];
    for (const caisse of caisses) {
      const solde = await this.caisseBalanceService.calculerSolde(caisse.id);
      if (solde.greaterThanOrEqualTo(seuil)) {
        alertes.push({
          type: 'SEUIL_CAISSE_DEPASSE',
          severite: 'WARNING',
          message: `Seuil de caisse atteint — ${caisse.boutique?.nom ?? 'boutique inconnue'} (solde ${solde.toFixed(2)} ≥ seuil ${seuil.toFixed(2)}), versement anticipé recommandé`,
          dateHeure: new Date().toISOString(),
          entite: 'Caisse',
          entiteId: caisse.id,
          details: {
            solde: solde.toFixed(2),
            seuil: seuil.toFixed(2),
            boutiqueId: caisse.boutiqueId,
          },
        });
      }
    }
    return alertes;
  }

  // SLA de régularisation des litiges (§5.1 : « sous 24 à 48 heures »).
  // L'horloge démarre à la constatation du litige (dateReception), pas à
  // l'ouverture de la transaction — cohérent avec le fait que le litige
  // n'existe qu'à partir du rapprochement. Le délai est configurable
  // (Societe.delaiRegularisationLitigeHeures, défaut 48 = borne haute).
  private async alertesLitigesEnRetard(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
    delaiHeures: number,
  ): Promise<AlerteDto[]> {
    const seuil = new Date(Date.now() - delaiHeures * 60 * 60 * 1000);
    const litiges = await this.prisma.transactionCaisse.findMany({
      where: {
        type: TypeTransaction.SORTIE_FONDS,
        statut: StatutTransaction.LITIGE,
        bordereau: { reception: { dateReception: { lt: seuil } } },
        ...(caisseFilter ? { caisse: caisseFilter } : {}),
      },
      include: {
        caisse: { include: { boutique: { select: { nom: true } } } },
        bordereau: {
          include: { reception: { select: { dateReception: true } } },
        },
      },
      orderBy: { dateHeure: 'asc' },
      take: 100,
    });

    return litiges.map((t) => {
      const boutique = t.caisse.boutique?.nom ?? 'inconnue';
      const dateReception = t.bordereau!.reception!.dateReception;
      const ageH = Math.floor(
        (Date.now() - dateReception.getTime()) / (60 * 60 * 1000),
      );
      return {
        type: 'LITIGE_EN_RETARD' as const,
        severite: 'CRITICAL' as const,
        message: `Litige non régularisé dans le délai (${delaiHeures} h) — ${boutique}, âgé de ${ageH} h`,
        dateHeure: dateReception.toISOString(),
        entite: 'TransactionCaisse',
        entiteId: t.id,
        details: {
          montant: t.montant.toFixed(2),
          ageHeures: ageH,
          boutiqueId: t.caisse.boutiqueId,
        },
      };
    });
  }
}
