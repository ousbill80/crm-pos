import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, SessionInventaire } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import {
  INVENTAIRE_FREQUENCE_CIBLE_JOURS,
  ROLES_INVENTAIRE_COMPTAGE,
  ROLES_INVENTAIRE_VALIDATION,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';

const includeSession = {
  entrepot: {
    select: {
      id: true,
      code: true,
      nom: true,
      boutiqueId: true,
      boutique: { select: { nom: true } },
    },
  },
  initiateur: { select: { id: true, prenom: true, nom: true, login: true } },
  validateur: { select: { id: true, prenom: true, nom: true, login: true } },
  lignes: {
    include: {
      produit: {
        select: {
          designation: true,
          reference: true,
          actif: true,
          coutMoyenPondere: true,
          seuilReappro: true,
        },
      },
    },
    orderBy: { produit: { designation: 'asc' as const } },
  },
} satisfies Prisma.SessionInventaireInclude;

@Injectable()
export class InventairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stocks: StockService,
  ) {}

  async lister(user: AuthenticatedUser) {
    const entrepotIds = await this.entrepotIdsDuPerimetre(user);
    return this.prisma.sessionInventaire.findMany({
      where: { entrepotId: { in: entrepotIds } },
      include: includeSession,
      orderBy: { dateOuverture: 'desc' },
      take: 80,
    });
  }

  async detail(id: string, user: AuthenticatedUser) {
    const session = await this.charger(id);
    await this.assertEntrepotInScope(user, session.entrepotId);
    return session;
  }

  async priorites(user: AuthenticatedUser) {
    const entrepotIds = await this.entrepotIdsDuPerimetre(user);
    const entrepots = await this.prisma.entrepot.findMany({
      where: { id: { in: entrepotIds }, actif: true },
      include: { boutique: { select: { nom: true } } },
      orderBy: { nom: 'asc' },
    });
    const derniers = await this.prisma.sessionInventaire.findMany({
      where: { entrepotId: { in: entrepotIds }, statut: 'VALIDE' },
      orderBy: { dateValidation: 'desc' },
      distinct: ['entrepotId'],
    });
    const parEntrepot = new Map(
      derniers.map((s) => [s.entrepotId, s.dateValidation]),
    );
    const maintenant = Date.now();
    return entrepots.map((e) => {
      const dernier = parEntrepot.get(e.id) ?? null;
      const joursDepuis =
        dernier !== null
          ? Math.floor((maintenant - dernier.getTime()) / (24 * 60 * 60 * 1000))
          : null;
      const aInventorier =
        joursDepuis === null || joursDepuis >= INVENTAIRE_FREQUENCE_CIBLE_JOURS;
      return {
        entrepotId: e.id,
        code: e.code,
        nom: e.nom,
        nomBoutique: e.boutique.nom,
        dernierInventaireAt: dernier?.toISOString() ?? null,
        joursDepuis,
        aInventorier,
        frequenceCibleJours: INVENTAIRE_FREQUENCE_CIBLE_JOURS,
      };
    });
  }

  async ouvrir(
    user: AuthenticatedUser,
    entrepotId: string,
    motif?: string,
  ): Promise<SessionInventaire> {
    this.assertComptage(user);
    await this.assertEntrepotInScope(user, entrepotId);

    const existant = await this.prisma.sessionInventaire.findFirst({
      where: { entrepotId, statut: 'EN_COURS' },
    });
    if (existant) {
      throw new BadRequestException(
        'Un inventaire est déjà en cours sur cet entrepôt. Clôturez-le ou annulez-le avant d’en ouvrir un autre.',
      );
    }

    const quants = await this.prisma.stockQuant.findMany({
      where: { entrepotId, produit: { actif: true } },
      include: { produit: { select: { designation: true } } },
    });

    return this.prisma.sessionInventaire.create({
      data: {
        entrepotId,
        initiateurId: user.userId,
        motif: motif?.trim() || null,
        lignes: {
          create: quants.map((q) => ({
            produitId: q.produitId,
            quantiteTheorique: q.quantite,
          })),
        },
      },
      include: includeSession,
    });
  }

  async compter(
    id: string,
    user: AuthenticatedUser,
    produitId: string,
    quantiteComptee: number,
  ) {
    this.assertComptage(user);
    const session = await this.charger(id);
    await this.assertEntrepotInScope(user, session.entrepotId);
    if (session.statut !== 'EN_COURS') {
      throw new BadRequestException(
        'Cet inventaire n’est plus ouvert au comptage.',
      );
    }
    const ligne = session.lignes.find((l) => l.produitId === produitId);
    if (!ligne) {
      throw new NotFoundException('Produit absent de cet inventaire.');
    }
    await this.prisma.ligneInventaire.update({
      where: { id: ligne.id },
      data: { quantiteComptee, dateComptage: new Date() },
    });
    return this.charger(id);
  }

  async reporterTheorique(id: string, user: AuthenticatedUser) {
    this.assertComptage(user);
    const session = await this.charger(id);
    await this.assertEntrepotInScope(user, session.entrepotId);
    if (session.statut !== 'EN_COURS') {
      throw new BadRequestException(
        'Cet inventaire n’est plus ouvert au comptage.',
      );
    }
    const restantes = session.lignes.filter((l) => l.quantiteComptee === null);
    if (restantes.length === 0) return session;
    for (const ligne of restantes) {
      await this.prisma.ligneInventaire.update({
        where: { id: ligne.id },
        data: {
          quantiteComptee: ligne.quantiteTheorique,
          dateComptage: new Date(),
        },
      });
    }
    return this.charger(id);
  }

  async valider(id: string, user: AuthenticatedUser) {
    if (!ROLES_INVENTAIRE_VALIDATION.includes(user.role)) {
      throw new ForbiddenException(
        'Seuls le responsable boutique, le DAF, la Direction ou le SI peuvent valider un inventaire.',
      );
    }
    const session = await this.charger(id);
    await this.assertEntrepotInScope(user, session.entrepotId);
    if (session.statut !== 'EN_COURS') {
      throw new BadRequestException('Inventaire déjà clos.');
    }
    if (session.initiateurId === user.userId) {
      throw new ForbiddenException(
        'Séparation des tâches : le comptage et la validation doivent être faits par deux personnes distinctes.',
      );
    }
    const nonComptees = session.lignes.filter(
      (l) => l.quantiteComptee === null,
    );
    if (nonComptees.length > 0) {
      throw new BadRequestException(
        `${nonComptees.length} ligne(s) non comptée(s). Terminez le comptage ou reportez le théorique.`,
      );
    }

    const ref = `INV-${id.slice(0, 8)}`;
    await this.prisma.$transaction(async (tx) => {
      for (const ligne of session.lignes) {
        if (ligne.quantiteComptee === null) continue;
        if (ligne.quantiteComptee === ligne.quantiteTheorique) continue;
        await this.stocks.ajuster(
          {
            produitId: ligne.produitId,
            entrepotId: session.entrepotId,
            quantiteComptee: ligne.quantiteComptee,
            utilisateurId: user.userId,
            reference: ref,
          },
          tx,
        );
      }
      await tx.sessionInventaire.update({
        where: { id },
        data: {
          statut: 'VALIDE',
          validateurId: user.userId,
          dateValidation: new Date(),
        },
      });
    });

    return this.charger(id);
  }

  async annuler(id: string, user: AuthenticatedUser) {
    const session = await this.charger(id);
    await this.assertEntrepotInScope(user, session.entrepotId);
    if (session.statut !== 'EN_COURS') {
      throw new BadRequestException(
        'Seuls les inventaires en cours peuvent être annulés.',
      );
    }
    const admin =
      user.role === 'RESPONSABLE_SI' || user.role === 'DIRECTION_GENERALE';
    if (session.initiateurId !== user.userId && !admin) {
      throw new ForbiddenException(
        'Seul l’initiateur ou le SI / DG peut annuler.',
      );
    }
    return this.prisma.sessionInventaire.update({
      where: { id },
      data: { statut: 'ANNULE' },
      include: includeSession,
    });
  }

  private async charger(id: string) {
    const session = await this.prisma.sessionInventaire.findUnique({
      where: { id },
      include: includeSession,
    });
    if (!session) throw new NotFoundException(`Inventaire ${id} introuvable.`);
    return session;
  }

  private assertComptage(user: AuthenticatedUser) {
    if (!ROLES_INVENTAIRE_COMPTAGE.includes(user.role)) {
      throw new ForbiddenException(
        'Rôle non habilité à compter un inventaire.',
      );
    }
  }

  private async entrepotIdsDuPerimetre(
    user: AuthenticatedUser,
    entrepotId?: string,
  ): Promise<string[]> {
    let boutiqueFilter: { id?: string; zoneId?: string } | undefined;
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      boutiqueFilter = undefined;
    } else if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      boutiqueFilter = { zoneId };
    } else if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      boutiqueFilter = { id: requireOwnBoutiqueId(user) };
    } else {
      throw new ForbiddenException('Périmètre inventaire non déterminé.');
    }
    const entrepots = await this.prisma.entrepot.findMany({
      where: {
        ...(boutiqueFilter ? { boutique: boutiqueFilter } : {}),
        ...(entrepotId ? { id: entrepotId } : {}),
        actif: true,
      },
      select: { id: true },
    });
    if (entrepotId && !entrepots.some((e) => e.id === entrepotId)) {
      throw new ForbiddenException('Entrepôt hors périmètre.');
    }
    return entrepots.map((e) => e.id);
  }

  private async assertEntrepotInScope(
    user: AuthenticatedUser,
    entrepotId: string,
  ) {
    await this.entrepotIdsDuPerimetre(user, entrepotId);
  }
}
