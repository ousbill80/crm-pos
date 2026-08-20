import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionCaisse, Vente } from '@prisma/client';
import {
  ModePaiement,
  RoleLibelle,
  StatutSessionCaisse,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
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

// Rôles éligibles au comptage contradictoire (§5.1) : caissier boutique ou
// responsable boutique — les deux profils "périmètre boutique" du référentiel.
const ROLES_TEMOIN_ELIGIBLES: RoleLibelle[] = [
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

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

    const vente = await this.prisma.$transaction(async (tx) => {
      let montantTotal = new Prisma.Decimal(0);
      const lignesData: {
        produitId: string;
        quantite: number;
        prixUnitaire: Prisma.Decimal;
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
        if (produit.stock < ligne.quantite) {
          throw new BadRequestException(
            `Stock insuffisant pour le produit "${produit.designation}" (disponible : ${produit.stock}, demandé : ${ligne.quantite}).`,
          );
        }

        await tx.produit.update({
          where: { id: produit.id },
          data: { stock: { decrement: ligne.quantite } },
        });

        await tx.mouvementStock.create({
          data: {
            produitId: produit.id,
            type: 'VENTE',
            quantite: -ligne.quantite,
            stockApres: produit.stock - ligne.quantite,
            utilisateurId: utilisateur.userId,
          },
        });

        const prixUnitaire = new Prisma.Decimal(produit.prixUnitaire);
        montantTotal = montantTotal.plus(prixUnitaire.times(ligne.quantite));
        lignesData.push({
          produitId: produit.id,
          quantite: ligne.quantite,
          prixUnitaire,
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

    const totauxParMode = await this.prisma.vente.groupBy({
      by: ['modePaiement'],
      where: { sessionCaisseId: session.id },
      _sum: { montantTotal: true },
      _count: { _all: true },
    });

    const releve = totauxParMode.map((ligne) => ({
      modePaiement: ligne.modePaiement,
      total: (ligne._sum.montantTotal ?? new Prisma.Decimal(0)).toFixed(2),
      nombreVentes: ligne._count._all,
    }));

    const totalEspeces =
      totauxParMode.find((l) => l.modePaiement === ModePaiement.ESPECES)?._sum
        .montantTotal ?? new Prisma.Decimal(0);

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
