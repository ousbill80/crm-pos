import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RetourVente, SessionCaisse, Vente } from '@prisma/client';
import {
  ModePaiement,
  RoleLibelle,
  StatutSessionCaisse,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateSessionCaisseDto } from './dto/create-session-caisse.dto';
import { ClotureSessionCaisseDto } from './dto/cloture-session-caisse.dto';
import { CreateVenteDto } from './dto/create-vente.dto';
import { CreateRetourDto } from './dto/create-retour.dto';

// Rôles éligibles au comptage contradictoire (§5.1) : caissier boutique ou
// responsable boutique — les deux profils "périmètre boutique" du référentiel.
const ROLES_TEMOIN_ELIGIBLES: RoleLibelle[] = [
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

// Plafond de remise par ligne (fraude caissier) : 20% du montant de la
// ligne (prixUnitaire × quantite). Non tranché par le cahier des charges,
// décidé par défaut et signalé à l'utilisateur — voir plan de la tâche.
const REMISE_MAX_RATIO = new Prisma.Decimal(0.2);

type SessionAvecCaisse = SessionCaisse & {
  caisse: { boutiqueId: string | null };
};

// Sessions de caisse + encaissement POS (§6.3.2, §5.1). Les ventes
// individuelles n'écrivent jamais directement de TransactionCaisse : elles
// s'accumulent dans une session ouverte, et c'est la clôture qui génère
// automatiquement UNE TransactionCaisse (via TransactionsService.initier —
// réutilisation de la machine à états §6.4, aucune duplication) pour le
// total ESPECES de la session. Seules les ventes ESPECES alimentent le
// bordereau : CARTE/MOBILE_MONEY ne transitent jamais physiquement par la
// caisse auxiliaire (interprétation documentée, voir plan de la tâche).
@Injectable()
export class VentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactionsService: TransactionsService,
    private readonly stockService: StockService,
  ) {}

  async ouvrirSession(
    dto: CreateSessionCaisseDto,
    utilisateur: AuthenticatedUser,
  ): Promise<SessionCaisse> {
    const boutiqueId = requireOwnBoutiqueId(utilisateur);

    const caisse = await this.prisma.caisse.findUnique({
      where: { id: dto.caisseId },
    });
    if (!caisse) {
      throw new NotFoundException('Caisse introuvable.');
    }
    if (caisse.type !== TypeCaisse.AUXILIAIRE) {
      throw new BadRequestException(
        'Une session de caisse ne peut être ouverte que sur une caisse auxiliaire (boutique).',
      );
    }
    if (caisse.boutiqueId !== boutiqueId) {
      throw new ForbiddenException(
        'Vous ne pouvez ouvrir une session que sur une caisse de votre propre boutique.',
      );
    }

    const sessionExistante = await this.prisma.sessionCaisse.findFirst({
      where: { caisseId: dto.caisseId, statut: StatutSessionCaisse.OUVERTE },
    });
    if (sessionExistante) {
      throw new BadRequestException(
        'Une session de caisse est déjà ouverte pour cette caisse : clôturez-la avant d’en ouvrir une nouvelle.',
      );
    }

    const temoin = await this.resoudreTemoin(
      dto.temoinLogin,
      utilisateur,
      boutiqueId,
    );

    const session = await this.prisma.sessionCaisse.create({
      data: {
        caisseId: dto.caisseId,
        statut: StatutSessionCaisse.OUVERTE,
        fondInitial: dto.fondInitial,
        ouvertureUtilisateurId: utilisateur.userId,
        ouvertureTemoinId: temoin.id,
      },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'SESSION_CAISSE_OUVERTE',
      entite: 'SessionCaisse',
      entiteId: session.id,
      details: JSON.stringify({
        caisseId: dto.caisseId,
        fondInitial: dto.fondInitial,
        temoinId: temoin.id,
      }),
    });

    return session;
  }

  async encaisserVente(
    sessionId: string,
    dto: CreateVenteDto,
    utilisateur: AuthenticatedUser,
  ): Promise<Vente> {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);

    if (session.statut !== StatutSessionCaisse.OUVERTE) {
      throw new BadRequestException(
        'Impossible d’encaisser une vente : la session de caisse est fermée.',
      );
    }

    if (!session.caisse.boutiqueId) {
      throw new BadRequestException(
        'La caisse de session n\'est rattachée à aucune boutique (stock multi-emplacement).',
      );
    }
    const entrepotIdPos = await this.stockService.trouverEntrepotPrincipalBoutique(
      session.caisse.boutiqueId,
    );

    const vente = await this.prisma.$transaction(async (tx) => {
      let montantTotal = new Prisma.Decimal(0);
      const lignesData: {
        produitId: string;
        quantite: number;
        prixUnitaire: Prisma.Decimal;
        remise: Prisma.Decimal;
      }[] = [];

      for (const ligne of dto.lignes) {
        const produit = await tx.produit.findUnique({
          where: { id: ligne.produitId },
        });
        if (!produit) {
          throw new NotFoundException(
            `Produit ${ligne.produitId} introuvable.`,
          );
        }
        const dispo = await this.stockService.getQuantite(produit.id, entrepotIdPos);
        if (dispo < ligne.quantite) {
          throw new BadRequestException(
            `Stock insuffisant pour le produit "${produit.designation}" (disponible : ${dispo}, demandé : ${ligne.quantite}).`,
          );
        }

        const prixUnitaire = new Prisma.Decimal(produit.prixUnitaire);
        const montantLigne = prixUnitaire.times(ligne.quantite);
        const remise = new Prisma.Decimal(ligne.remise ?? 0);
        const plafondRemise = montantLigne.times(REMISE_MAX_RATIO);
        if (remise.greaterThan(plafondRemise)) {
          throw new BadRequestException(
            `Remise trop élevée pour le produit "${produit.designation}" : maximum ${plafondRemise.toFixed(2)} (20% du montant de la ligne).`,
          );
        }

        await this.stockService.appliquerMouvement(
          {
            produitId: produit.id,
            entrepotId: entrepotIdPos,
            type: 'VENTE',
            delta: -ligne.quantite,
            utilisateurId: utilisateur.userId,
          },
          tx,
        );

        montantTotal = montantTotal.plus(montantLigne.minus(remise));
        lignesData.push({
          produitId: produit.id,
          quantite: ligne.quantite,
          prixUnitaire,
          remise,
        });
      }

      return tx.vente.create({
        data: {
          caisseId: session.caisseId,
          sessionCaisseId: session.id,
          modePaiement: dto.modePaiement,
          montantTotal,
          clientId: dto.clientId,
          lignes: { create: lignesData },
        },
        include: { lignes: { include: { produit: true } } },
      });
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'VENTE_ENREGISTREE',
      entite: 'Vente',
      entiteId: vente.id,
      details: JSON.stringify({
        sessionCaisseId: session.id,
        montantTotal: vente.montantTotal.toString(),
        modePaiement: dto.modePaiement,
        clientId: dto.clientId ?? null,
      }),
    });

    return vente;
  }

  // Retour/avoir (extension au-delà du cahier des charges) : limité à une
  // vente de la session de caisse EN COURS — évite de rouvrir une
  // trésorerie déjà versée/validée (§6.4). Recrédite le stock via le grand
  // livre MouvementStock, jamais de retour partiel au-delà du vendu.
  async creerRetour(
    sessionId: string,
    dto: CreateRetourDto,
    utilisateur: AuthenticatedUser,
  ): Promise<RetourVente> {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);

    if (session.statut !== StatutSessionCaisse.OUVERTE) {
      throw new BadRequestException(
        'Impossible d’enregistrer un retour : la session de caisse est fermée.',
      );
    }

    const ligneVente = await this.prisma.ligneVente.findUnique({
      where: { id: dto.ligneVenteId },
      include: { vente: true, produit: true, retours: true },
    });
    if (!ligneVente) {
      throw new NotFoundException('Ligne de vente introuvable.');
    }
    if (ligneVente.vente.sessionCaisseId !== session.id) {
      throw new BadRequestException(
        'Le retour ne peut porter que sur une vente de la session de caisse en cours.',
      );
    }

    const dejaRetourne = ligneVente.retours.reduce(
      (total, r) => total + r.quantite,
      0,
    );
    if (dejaRetourne + dto.quantite > ligneVente.quantite) {
      throw new BadRequestException(
        `Quantité retournée excessive : ${dejaRetourne} déjà retournée(s) sur ${ligneVente.quantite} vendue(s).`,
      );
    }

    const montantParUnite = ligneVente.prixUnitaire
      .times(ligneVente.quantite)
      .minus(ligneVente.remise)
      .div(ligneVente.quantite);
    const montantRembourse = montantParUnite
      .times(dto.quantite)
      .toDecimalPlaces(2);

    const retour = await this.prisma.$transaction(async (tx) => {

      const created = await tx.retourVente.create({
        data: {
          venteId: ligneVente.venteId,
          ligneVenteId: ligneVente.id,
          quantite: dto.quantite,
          montantRembourse,
          sessionCaisseId: session.id,
          utilisateurId: utilisateur.userId,
        },
      });

      if (!session.caisse.boutiqueId) {
        throw new BadRequestException(
          'Caisse sans boutique : impossible de créditer le stock.',
        );
      }
      const entrepotRetour =
        await this.stockService.trouverEntrepotPrincipalBoutique(
          session.caisse.boutiqueId,
        );
      await this.stockService.appliquerMouvement(
        {
          produitId: ligneVente.produitId,
          entrepotId: entrepotRetour,
          type: 'RETOUR',
          delta: dto.quantite,
          utilisateurId: utilisateur.userId,
          reference: created.id,
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'RETOUR_VENTE_ENREGISTRE',
      entite: 'RetourVente',
      entiteId: retour.id,
      details: JSON.stringify({
        ligneVenteId: ligneVente.id,
        quantite: dto.quantite,
        montantRembourse: montantRembourse.toString(),
      }),
    });

    return retour;
  }

  // Relevé par mode de paiement, net des retours espèces — factorisé pour
  // être réutilisé à la fois par la clôture et par l'export PDF (§6.3.4),
  // qui ne doivent jamais recalculer cette règle métier différemment.
  private async calculerReleve(sessionId: string): Promise<{
    releve: {
      modePaiement: ModePaiement;
      total: string;
      nombreVentes: number;
    }[];
    totalEspeces: Prisma.Decimal;
  }> {
    const totauxParMode = await this.prisma.vente.groupBy({
      by: ['modePaiement'],
      where: { sessionCaisseId: sessionId },
      _sum: { montantTotal: true },
      _count: { _all: true },
    });

    // Retours espèces de la session : seul le cash physique alimente le
    // bordereau (règle déjà établie pour l'encaissement), donc seuls les
    // retours sur ventes ESPECES en sont déduits — CARTE/MOBILE_MONEY
    // suivent un remboursement hors caisse physique, hors périmètre ici.
    const retoursEspeces = await this.prisma.retourVente.findMany({
      where: {
        sessionCaisseId: sessionId,
        vente: { modePaiement: ModePaiement.ESPECES },
      },
    });
    const totalRetoursEspeces = retoursEspeces.reduce(
      (total, r) => total.plus(r.montantRembourse),
      new Prisma.Decimal(0),
    );

    const releve = totauxParMode.map((ligne) => {
      const totalBrut = ligne._sum.montantTotal ?? new Prisma.Decimal(0);
      const totalNet =
        ligne.modePaiement === ModePaiement.ESPECES
          ? totalBrut.minus(totalRetoursEspeces)
          : totalBrut;
      return {
        modePaiement: ligne.modePaiement,
        total: totalNet.toFixed(2),
        nombreVentes: ligne._count._all,
      };
    });

    const totalEspecesBrut =
      totauxParMode.find((l) => l.modePaiement === ModePaiement.ESPECES)?._sum
        .montantTotal ?? new Prisma.Decimal(0);
    const totalEspeces = totalEspecesBrut.minus(totalRetoursEspeces);

    return { releve, totalEspeces };
  }

  // Relevé de clôture prêt à imprimer (§6.3.4) — réutilise la même RBAC
  // que la consultation de session et le même calcul que la clôture.
  async genererReleveCloture(
    sessionId: string,
    utilisateur: AuthenticatedUser,
  ): Promise<{
    session: SessionCaisse;
    releve: {
      modePaiement: ModePaiement;
      total: string;
      nombreVentes: number;
    }[];
  }> {
    const session = await this.findOne(sessionId, utilisateur);
    const { releve } = await this.calculerReleve(session.id);
    return { session, releve };
  }

  async cloturerSession(
    sessionId: string,
    dto: ClotureSessionCaisseDto,
    utilisateur: AuthenticatedUser,
  ): Promise<{
    session: SessionCaisse;
    releve: {
      modePaiement: ModePaiement;
      total: string;
      nombreVentes: number;
    }[];
    transactionVersementId: string | null;
  }> {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);

    if (session.statut !== StatutSessionCaisse.OUVERTE) {
      throw new BadRequestException('Cette session de caisse est déjà fermée.');
    }

    const boutiqueId = requireOwnBoutiqueId(utilisateur);
    const temoin = await this.resoudreTemoin(
      dto.temoinLogin,
      utilisateur,
      boutiqueId,
    );

    const { releve, totalEspeces } = await this.calculerReleve(session.id);

    let transactionVersementId: string | null = null;
    if (totalEspeces.greaterThan(0)) {
      const transaction = await this.transactionsService.initier(
        {
          caisseId: session.caisseId,
          type: TypeTransaction.VENTE,
          montant: totalEspeces.toNumber(),
        },
        utilisateur,
      );
      transactionVersementId = transaction.id;
    }

    const sessionFermee = await this.prisma.sessionCaisse.update({
      where: { id: session.id },
      data: {
        statut: StatutSessionCaisse.FERMEE,
        clotureDateHeure: new Date(),
        fondCompteCloture: dto.fondCompteCloture,
        clotureUtilisateurId: utilisateur.userId,
        clotureTemoinId: temoin.id,
        transactionVersementId,
      },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'SESSION_CAISSE_FERMEE',
      entite: 'SessionCaisse',
      entiteId: session.id,
      details: JSON.stringify({
        fondCompteCloture: dto.fondCompteCloture,
        temoinId: temoin.id,
        releve,
        transactionVersementId,
      }),
    });

    return { session: sessionFermee, releve, transactionVersementId };
  }

  async findAll(utilisateur: AuthenticatedUser): Promise<SessionCaisse[]> {
    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      return this.prisma.sessionCaisse.findMany({
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    }

    if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      return this.prisma.sessionCaisse.findMany({
        where: { caisse: { boutique: { zoneId } } },
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      const boutiqueId = requireOwnBoutiqueId(utilisateur);
      return this.prisma.sessionCaisse.findMany({
        where: { caisse: { boutiqueId } },
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    }

    throw new ForbiddenException(
      `Rôle "${utilisateur.role}" non habilité à consulter les sessions de caisse.`,
    );
  }

  async findOne(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<SessionCaisse> {
    const session = await this.trouverSessionOuEchouer(id);

    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      return session;
    }

    if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      const boutique = session.caisse.boutiqueId
        ? await this.prisma.boutique.findUnique({
            where: { id: session.caisse.boutiqueId },
          })
        : null;
      if (!boutique || boutique.zoneId !== zoneId) {
        throw new ForbiddenException(
          'Vous ne pouvez consulter que les sessions de caisse de votre propre zone.',
        );
      }
      return session;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      this.verifierPerimetreBoutique(session, utilisateur);
      return session;
    }

    throw new ForbiddenException(
      `Rôle "${utilisateur.role}" non habilité à consulter les sessions de caisse.`,
    );
  }

  private async trouverSessionOuEchouer(
    id: string,
  ): Promise<SessionAvecCaisse> {
    const session = await this.prisma.sessionCaisse.findUnique({
      where: { id },
      include: { caisse: true },
    });
    if (!session) {
      throw new NotFoundException('Session de caisse introuvable.');
    }
    return session;
  }

  private verifierPerimetreBoutique(
    session: SessionAvecCaisse,
    utilisateur: AuthenticatedUser,
  ): void {
    if (
      utilisateur.boutiqueId &&
      session.caisse.boutiqueId !== utilisateur.boutiqueId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez agir que sur une session de caisse de votre propre boutique.',
      );
    }
  }

  // Comptage contradictoire (§5.1) : le témoin doit être un utilisateur actif
  // de la même boutique, éligible (caissier/responsable boutique), différent
  // de l'acteur principal. Résolu par login, sans ré-authentification —
  // simplification assumée (cf. plan de la tâche).
  private async resoudreTemoin(
    temoinLogin: string,
    acteur: AuthenticatedUser,
    boutiqueId: string,
  ) {
    const temoin = await this.prisma.utilisateur.findUnique({
      where: { login: temoinLogin },
    });

    if (
      !temoin ||
      !temoin.actif ||
      temoin.boutiqueId !== boutiqueId ||
      temoin.id === acteur.userId
    ) {
      throw new BadRequestException(
        'Témoin invalide : il doit s’agir d’un utilisateur actif de la même boutique, différent de vous-même.',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: temoin.roleId },
    });
    if (
      !role ||
      !ROLES_TEMOIN_ELIGIBLES.includes(role.libelle as RoleLibelle)
    ) {
      throw new BadRequestException(
        'Témoin invalide : le rôle doit être Caissier boutique ou Responsable boutique.',
      );
    }

    return temoin;
  }
}
