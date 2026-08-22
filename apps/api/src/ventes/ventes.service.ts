import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RetourVente, SessionCaisse, Vente } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  ModePaiement,
  RoleLibelle,
  StatutSessionCaisse,
  StatutTransaction,
  TypeCaisse,
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
import { FideliteService } from '../crm/fidelite/fidelite.service';
import { CreateSessionCaisseDto } from './dto/create-session-caisse.dto';
import { ClotureSessionCaisseDto } from './dto/cloture-session-caisse.dto';
import { CreateVenteDto } from './dto/create-vente.dto';
import { CreateRetourDto } from './dto/create-retour.dto';
import { UpsertReservationDto } from './dto/paiement-reservation.dto';
import { ListVentesQueryDto } from './dto/list-ventes-query.dto';

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

// Sessions de caisse + encaissement POS (§6.3.2, §5.1).
// Grande surface : session sur TIROIR uniquement. À la clôture :
// 1) crédit ledger VENTE (ESPECES) sur le tiroir
// 2) TRANSFERT_INTERNE tiroir → MAGASIN (VALIDEE si écart 0, sinon LITIGE)
@Injectable()
export class VentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactionsService: TransactionsService,
    private readonly stockService: StockService,
    private readonly fideliteService: FideliteService,
  ) {}

  async ouvrirSession(
    dto: CreateSessionCaisseDto,
    utilisateur: AuthenticatedUser,
  ): Promise<SessionCaisse> {
    const boutiqueId = requireOwnBoutiqueId(utilisateur);

    // Idempotence hors-ligne (§6.7) : un rejeu du même clientOperationId
    // (resynchro depuis la file offline) renvoie la session déjà créée,
    // sans repasser par le témoin ni recréer le transfert de fond initial.
    if (dto.clientOperationId) {
      const existante = await this.prisma.sessionCaisse.findUnique({
        where: { clientOperationId: dto.clientOperationId },
        include: { caisse: true },
      });
      if (existante) {
        this.verifierPerimetreBoutique(existante, utilisateur);
        return existante;
      }
    }

    const caisse = await this.prisma.caisse.findUnique({
      where: { id: dto.caisseId },
    });
    if (!caisse) {
      throw new NotFoundException('Caisse introuvable.');
    }
    if (caisse.type !== TypeCaisse.TIROIR) {
      throw new BadRequestException(
        'Une session POS ne peut être ouverte que sur un TIROIR actif.',
      );
    }
    if (!caisse.actif) {
      throw new BadRequestException('Ce tiroir est désactivé.');
    }
    if (caisse.boutiqueId !== boutiqueId) {
      throw new ForbiddenException(
        'Vous ne pouvez ouvrir une session que sur un tiroir de votre propre boutique.',
      );
    }

    const sessionExistante = await this.prisma.sessionCaisse.findFirst({
      where: { caisseId: dto.caisseId, statut: StatutSessionCaisse.OUVERTE },
    });
    if (sessionExistante) {
      if (dto.clientOperationId) {
        // Conflit détecté à la resynchro : une autre ouverture (en ligne ou
        // une autre file offline) a déjà pris le tiroir entre-temps.
        await this.audit.record({
          utilisateurId: utilisateur.userId,
          action: 'SESSION_CONFLIT_HORS_LIGNE',
          entite: 'SessionCaisse',
          entiteId: sessionExistante.id,
          details: JSON.stringify({
            caisseId: dto.caisseId,
            clientOperationIdRejete: dto.clientOperationId,
            sessionExistanteId: sessionExistante.id,
          }),
        });
        throw new ConflictException(
          'Conflit de synchronisation : une session a déjà été ouverte sur ce tiroir entre-temps.',
        );
      }
      throw new BadRequestException(
        'Une session est déjà ouverte pour ce tiroir : clôturez-la avant d’en ouvrir une nouvelle.',
      );
    }

    const temoin = await this.resoudreTemoin(
      dto.temoinLogin,
      dto.temoinPassword,
      utilisateur,
      boutiqueId,
    );

    const magasin = await this.prisma.caisse.findFirst({
      where: { boutiqueId, type: TypeCaisse.MAGASIN },
    });
    if (!magasin) {
      throw new BadRequestException(
        'Caisse MAGASIN introuvable pour cette boutique.',
      );
    }

    const fondInitial = new Prisma.Decimal(dto.fondInitial);
    let session: SessionCaisse;
    try {
      session = await this.prisma.sessionCaisse.create({
        data: {
          caisseId: dto.caisseId,
          statut: StatutSessionCaisse.OUVERTE,
          fondInitial,
          ouvertureUtilisateurId: utilisateur.userId,
          ouvertureTemoinId: temoin.id,
          clientOperationId: dto.clientOperationId,
        },
      });
    } catch (error) {
      if (this.estConflitIdempotence(error) && dto.clientOperationId) {
        const existante = await this.prisma.sessionCaisse.findUnique({
          where: { clientOperationId: dto.clientOperationId },
        });
        if (existante) {
          return existante;
        }
      }
      throw error;
    }

    // Fond de caisse : magasin → tiroir (transfert interne VALIDEE).
    if (fondInitial.greaterThan(0)) {
      await this.transactionsService.creerTransfertInterne({
        caisseSourceId: magasin.id,
        caisseDestinationId: caisse.id,
        montant: fondInitial,
        initiateurId: utilisateur.userId,
        statut: StatutTransaction.VALIDEE,
      });
    }

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
    if (dto.clientOperationId) {
      const existante = await this.chargerParClientOperationId(
        dto.clientOperationId,
      );
      if (existante) {
        const sessionExistante = await this.trouverSessionOuEchouer(
          existante.sessionCaisseId,
        );
        this.verifierPerimetreBoutique(sessionExistante, utilisateur);
        return existante;
      }
    }

    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);

    if (session.statut !== StatutSessionCaisse.OUVERTE) {
      throw new BadRequestException(
        'Impossible d’encaisser une vente : la session de caisse est fermée.',
      );
    }

    if (!session.caisse.boutiqueId) {
      throw new BadRequestException(
        "La caisse de session n'est rattachée à aucune boutique (stock multi-emplacement).",
      );
    }
    const chef = dto.derogation
      ? await this.resoudreChefCaisse(
          dto.derogation.login,
          dto.derogation.password,
          utilisateur,
          session.caisse.boutiqueId,
        )
      : null;
    const motifs = new Set(dto.derogation?.motifs ?? []);
    const entrepotIdPos =
      await this.stockService.trouverEntrepotPrincipalBoutique(
        session.caisse.boutiqueId,
      );

    let vente: Vente;
    try {
      vente = await this.prisma.$transaction(async (tx) => {
        let montantTotal = new Prisma.Decimal(0);
        const lignesData: {
          produitId: string;
          quantite: number;
          prixUnitaire: Prisma.Decimal;
          remise: Prisma.Decimal;
          coutUnitaire: Prisma.Decimal;
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
          if (!produit.actif) {
            throw new BadRequestException(
              `Le produit « ${produit.designation} » est inactif et ne peut plus être encaissé.`,
            );
          }
          const estPrestation = produit.typeProduit === 'PRESTATION';
          if (!estPrestation) {
            const dispo = await this.stockService.getDisponible(
              produit.id,
              entrepotIdPos,
              dto.holdId,
              tx,
            );
            if (dispo < ligne.quantite && !motifs.has('STOCK_INSUFFISANT')) {
              throw new BadRequestException({
                code: 'STOCK_INSUFFISANT',
                message: `Stock insuffisant pour le produit "${produit.designation}" (disponible : ${dispo}, demandé : ${ligne.quantite}).`,
              });
            }
          }

          const prixUnitaire = new Prisma.Decimal(produit.prixUnitaire);
          const montantLigne = prixUnitaire.times(ligne.quantite);
          const remise = new Prisma.Decimal(ligne.remise ?? 0);
          const plafondRemise = montantLigne.times(REMISE_MAX_RATIO);
          if (
            remise.greaterThan(plafondRemise) &&
            !motifs.has('REMISE_PLAFOND')
          ) {
            throw new BadRequestException({
              code: 'REMISE_PLAFOND',
              message: `Remise trop élevée pour le produit "${produit.designation}" : maximum ${plafondRemise.toFixed(2)} (20% du montant de la ligne).`,
            });
          }

          if (!estPrestation) {
            await this.stockService.appliquerMouvement(
              {
                produitId: produit.id,
                entrepotId: entrepotIdPos,
                type: 'VENTE',
                delta: -ligne.quantite,
                utilisateurId: utilisateur.userId,
                autoriserNegatif: motifs.has('STOCK_INSUFFISANT'),
              },
              tx,
            );
          }

          montantTotal = montantTotal.plus(montantLigne.minus(remise));
          lignesData.push({
            produitId: produit.id,
            quantite: ligne.quantite,
            prixUnitaire,
            remise,
            coutUnitaire: new Prisma.Decimal(produit.coutMoyenPondere),
          });
        }

        // Avantage fidélité (§6.6) : remise en % au palier Argent/Or,
        // uniquement si un pourcentage a été configuré (défaut 0 = désactivé).
        let remiseFidelite = new Prisma.Decimal(0);
        if (dto.clientId) {
          const fidelite = await tx.fidelite.findUnique({
            where: { clientId: dto.clientId },
          });
          if (fidelite && fidelite.niveau !== 'BRONZE') {
            const societe = await tx.societe.findFirst();
            const pct =
              fidelite.niveau === 'OR'
                ? (societe?.avantageFideliteOrPct ?? 0)
                : (societe?.avantageFideliteArgentPct ?? 0);
            if (pct > 0) {
              remiseFidelite = montantTotal
                .times(pct)
                .dividedBy(100)
                .toDecimalPlaces(2);
              montantTotal = montantTotal.minus(remiseFidelite);
            }
          }
        }

        const paiements = this.normaliserPaiements(dto, montantTotal);
        const created = await tx.vente.create({
          data: {
            caisseId: session.caisseId,
            sessionCaisseId: session.id,
            modePaiement: this.modePrincipal(paiements, dto.modePaiement),
            montantTotal,
            remiseFidelite,
            clientId: dto.clientId,
            clientOperationId: dto.clientOperationId,
            lignes: { create: lignesData },
            paiements: { create: paiements },
          },
          include: {
            lignes: { include: { produit: true } },
            paiements: true,
          },
        });

        if (dto.holdId) {
          await tx.reservationStock.deleteMany({
            where: { sessionCaisseId: session.id, holdId: dto.holdId },
          });
          await tx.ticketAttente.deleteMany({
            where: { id: dto.holdId, sessionCaisseId: session.id },
          });
        }
        return created;
      });
    } catch (error) {
      if (this.estConflitIdempotence(error) && dto.clientOperationId) {
        const existante = await this.chargerParClientOperationId(
          dto.clientOperationId,
        );
        if (existante) {
          const sessionExistante = await this.trouverSessionOuEchouer(
            existante.sessionCaisseId,
          );
          this.verifierPerimetreBoutique(sessionExistante, utilisateur);
          return existante;
        }
      }
      throw error;
    }

    if (chef && dto.derogation) {
      await this.audit.record({
        utilisateurId: utilisateur.userId,
        action: 'DEROGATION_CAISSE',
        entite: 'Vente',
        entiteId: vente.id,
        details: JSON.stringify({
          chefId: chef.id,
          chefLogin: chef.login,
          motifs: dto.derogation.motifs,
        }),
      });
    }

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'VENTE_ENREGISTREE',
      entite: 'Vente',
      entiteId: vente.id,
      details: JSON.stringify({
        sessionCaisseId: session.id,
        montantTotal: vente.montantTotal.toString(),
        remiseFidelite: vente.remiseFidelite.toString(),
        modePaiement: vente.modePaiement,
        clientId: dto.clientId ?? null,
        holdId: dto.holdId ?? null,
      }),
    });

    // Fidélité auto §6.6 — 1 pt / 1000 FCFA (floor), hors replay idempotent.
    await this.fideliteService.crediterDepuisVente({
      clientId: dto.clientId,
      montantTotal: vente.montantTotal,
      venteId: vente.id,
      utilisateurId: utilisateur.userId,
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
    // Idempotence hors-ligne (§6.7) : un rejeu du même clientOperationId
    // (resynchro depuis la file offline) renvoie le retour déjà créé, sans
    // créditer le stock une seconde fois.
    if (dto.clientOperationId) {
      const existant = await this.prisma.retourVente.findUnique({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existant) {
        const sessionExistante = await this.trouverSessionOuEchouer(
          existant.sessionCaisseId,
        );
        this.verifierPerimetreBoutique(sessionExistante, utilisateur);
        return existant;
      }
    }

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

    let retour: RetourVente;
    try {
      retour = await this.prisma.$transaction(async (tx) => {
        const created = await tx.retourVente.create({
          data: {
            venteId: ligneVente.venteId,
            ligneVenteId: ligneVente.id,
            quantite: dto.quantite,
            montantRembourse,
            sessionCaisseId: session.id,
            utilisateurId: utilisateur.userId,
            clientOperationId: dto.clientOperationId,
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
    } catch (error) {
      if (this.estConflitIdempotence(error) && dto.clientOperationId) {
        const existant = await this.prisma.retourVente.findUnique({
          where: { clientOperationId: dto.clientOperationId },
        });
        if (existant) {
          return existant;
        }
      }
      throw error;
    }

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
    journal: Array<{
      id: string;
      dateVente: Date;
      montantTotal: string;
      modePaiement: ModePaiement;
      paiements: Array<{ modePaiement: ModePaiement; montant: string }>;
      nbLignes: number;
    }>;
  }> {
    const ventes = await this.prisma.vente.findMany({
      where: { sessionCaisseId: sessionId },
      include: {
        paiements: true,
        retours: true,
        _count: { select: { lignes: true } },
      },
      orderBy: { dateVente: 'asc' },
    });

    const totaux = new Map<
      ModePaiement,
      { total: Prisma.Decimal; nombreVentes: number }
    >();
    const bump = (
      mode: ModePaiement,
      montant: Prisma.Decimal,
      ticket: boolean,
    ) => {
      const actuel = totaux.get(mode) ?? {
        total: new Prisma.Decimal(0),
        nombreVentes: 0,
      };
      totaux.set(mode, {
        total: actuel.total.plus(montant),
        nombreVentes: actuel.nombreVentes + (ticket ? 1 : 0),
      });
    };

    for (const vente of ventes) {
      const paiements =
        vente.paiements.length > 0
          ? vente.paiements
          : [
              {
                modePaiement: vente.modePaiement,
                montant: vente.montantTotal,
              },
            ];
      const modesTicket = new Set<ModePaiement>();
      for (const p of paiements) {
        bump(p.modePaiement, p.montant, !modesTicket.has(p.modePaiement));
        modesTicket.add(p.modePaiement);
      }
      const especes =
        paiements.find((p) => p.modePaiement === ModePaiement.ESPECES)
          ?.montant ?? new Prisma.Decimal(0);
      const retours = vente.retours.reduce(
        (s, r) => s.plus(r.montantRembourse),
        new Prisma.Decimal(0),
      );
      const debitEspeces = especes.lessThan(retours) ? especes : retours;
      if (debitEspeces.greaterThan(0)) {
        bump(ModePaiement.ESPECES, debitEspeces.negated(), false);
      }
    }

    const releve = [...totaux.entries()].map(([modePaiement, ligne]) => ({
      modePaiement,
      total: ligne.total.toFixed(2),
      nombreVentes: ligne.nombreVentes,
    }));
    const totalEspeces =
      totaux.get(ModePaiement.ESPECES)?.total ?? new Prisma.Decimal(0);
    const journal = ventes.map((vente) => {
      const paiementsVente: Array<{
        modePaiement: ModePaiement;
        montant: Prisma.Decimal;
      }> =
        vente.paiements.length > 0
          ? vente.paiements
          : [
              {
                modePaiement: vente.modePaiement,
                montant: vente.montantTotal,
              },
            ];
      return {
        id: vente.id,
        dateVente: vente.dateVente,
        montantTotal: vente.montantTotal.toFixed(2),
        modePaiement: vente.modePaiement,
        paiements: paiementsVente.map((p) => ({
          modePaiement: p.modePaiement,
          montant: p.montant.toFixed(2),
        })),
        nbLignes: vente._count.lignes,
      };
    });
    return { releve, totalEspeces, journal };
  }

  // Relevé de session (§6.3.4). Lecture seule — l’audit d’export est
  // déclenché uniquement à la génération PDF, pas à chaque aperçu POS.
  async chargerEtatSession(
    sessionId: string,
    utilisateur: AuthenticatedUser,
  ): Promise<{
    session: SessionCaisse;
    releve: {
      modePaiement: ModePaiement;
      total: string;
      nombreVentes: number;
    }[];
    etat: import('../impressions/etat-session.pdf').EtatSessionPdfInput;
  }> {
    const session = await this.findOne(sessionId, utilisateur);
    const { releve, totalEspeces, journal } = await this.calculerReleve(
      session.id,
    );

    const userIds = [
      session.ouvertureUtilisateurId,
      session.ouvertureTemoinId,
      session.clotureUtilisateurId,
      session.clotureTemoinId,
    ].filter((id): id is string => Boolean(id));

    const [societe, caisse, utilisateurs] = await Promise.all([
      this.prisma.societe.findFirst({
        select: {
          raisonSociale: true,
          adresse: true,
          telephone: true,
          email: true,
        },
      }),
      this.prisma.caisse.findUnique({
        where: { id: session.caisseId },
        include: { boutique: { select: { nom: true } } },
      }),
      this.prisma.utilisateur.findMany({
        where: { id: { in: userIds } },
        select: { id: true, prenom: true, nom: true },
      }),
    ]);
    const nombreVentes = journal.length;

    const nom = (id: string | null) => {
      if (!id) return null;
      const u = utilisateurs.find((x) => x.id === id);
      return u ? `${u.prenom} ${u.nom}` : null;
    };

    const fondInitial = session.fondInitial;
    const fondTheorique = fondInitial.plus(totalEspeces);
    const fondCompte = session.fondCompteCloture;
    const typeEtat: 'X' | 'Z' =
      session.statut === StatutSessionCaisse.FERMEE ? 'Z' : 'X';
    const caisseLibelle = [caisse?.code, caisse?.libelle, caisse?.type]
      .filter(Boolean)
      .join(' — ');

    const etat = {
      typeEtat,
      sessionId: session.id,
      statut: session.statut,
      ouvertureDateHeure: session.ouvertureDateHeure,
      clotureDateHeure: session.clotureDateHeure,
      caisseLibelle: caisseLibelle || session.caisseId,
      boutiqueNom: caisse?.boutique?.nom ?? null,
      ouvreur: nom(session.ouvertureUtilisateurId),
      temoinOuverture: nom(session.ouvertureTemoinId),
      clotureur: nom(session.clotureUtilisateurId),
      temoinCloture: nom(session.clotureTemoinId),
      societe,
      releve,
      ventes: journal,
      nombreVentes,
      fondInitial: fondInitial.toFixed(2),
      totalEspecesNet: totalEspeces.toFixed(2),
      fondTheorique: fondTheorique.toFixed(2),
      fondCompteCloture: fondCompte ? fondCompte.toFixed(2) : null,
      ecart: fondCompte ? fondCompte.minus(fondTheorique).toFixed(2) : null,
      imprimeAt: new Date(),
    };

    return { session, releve, etat };
  }

  async genererReleveCloture(
    sessionId: string,
    utilisateur: AuthenticatedUser,
  ) {
    const payload = await this.chargerEtatSession(sessionId, utilisateur);
    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'ETAT_SESSION_EXPORTE',
      entite: 'SessionCaisse',
      entiteId: payload.session.id,
      details: JSON.stringify({
        typeEtat: payload.etat.typeEtat,
        statut: payload.session.statut,
      }),
    });
    return payload;
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

    const reservationsRestantes = await this.prisma.reservationStock.count({
      where: { sessionCaisseId: session.id },
    });
    if (reservationsRestantes > 0) {
      throw new BadRequestException(
        'Impossible de clôturer : des tickets en attente réservent encore du stock. Reprendre ou abandonner la file.',
      );
    }

    const boutiqueId = requireOwnBoutiqueId(utilisateur);
    const temoin = await this.resoudreTemoin(
      dto.temoinLogin,
      dto.temoinPassword,
      utilisateur,
      boutiqueId,
    );

    const { releve, totalEspeces } = await this.calculerReleve(session.id);
    const fondCompte = new Prisma.Decimal(dto.fondCompteCloture);
    const fondInitial = new Prisma.Decimal(session.fondInitial);
    const attendu = fondInitial.plus(totalEspeces);
    const ecart = fondCompte.minus(attendu);

    const magasin = await this.prisma.caisse.findFirst({
      where: {
        boutiqueId,
        type: TypeCaisse.MAGASIN,
      },
    });
    if (!magasin) {
      throw new BadRequestException(
        'Caisse MAGASIN introuvable pour cette boutique.',
      );
    }

    // 1) Reconnaître les encaissements ESPECES sur le tiroir.
    await this.transactionsService.enregistrerEncaissementTiroir({
      caisseTiroirId: session.caisseId,
      montant: totalEspeces,
      initiateurId: utilisateur.userId,
    });

    // 2) Remise tiroir → magasin (montant compté).
    let transactionVersementId: string | null = null;
    if (fondCompte.greaterThan(0)) {
      const statutTransfert = ecart.isZero()
        ? StatutTransaction.VALIDEE
        : StatutTransaction.LITIGE;
      const transfert = await this.transactionsService.creerTransfertInterne({
        caisseSourceId: session.caisseId,
        caisseDestinationId: magasin.id,
        montant: fondCompte,
        initiateurId: utilisateur.userId,
        statut: statutTransfert,
      });
      transactionVersementId = transfert.id;
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
        fondInitial: fondInitial.toString(),
        totalEspeces: totalEspeces.toString(),
        ecart: ecart.toString(),
        temoinId: temoin.id,
        releve,
        transactionVersementId,
      }),
    });

    return { session: sessionFermee, releve, transactionVersementId };
  }

  async findAll(utilisateur: AuthenticatedUser) {
    let sessions: Awaited<
      ReturnType<typeof this.prisma.sessionCaisse.findMany>
    >;
    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      sessions = await this.prisma.sessionCaisse.findMany({
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    } else if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      sessions = await this.prisma.sessionCaisse.findMany({
        where: { caisse: { boutique: { zoneId } } },
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    } else if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      const boutiqueId = requireOwnBoutiqueId(utilisateur);
      sessions = await this.prisma.sessionCaisse.findMany({
        where: { caisse: { boutiqueId } },
        orderBy: { ouvertureDateHeure: 'desc' },
      });
    } else {
      throw new ForbiddenException(
        `Rôle "${utilisateur.role}" non habilité à consulter les sessions de caisse.`,
      );
    }

    if (sessions.length === 0) {
      return [];
    }

    const stats = await this.prisma.vente.groupBy({
      by: ['sessionCaisseId'],
      where: { sessionCaisseId: { in: sessions.map((s) => s.id) } },
      _count: { _all: true },
      _sum: { montantTotal: true },
    });
    const bySession = new Map(
      stats.map((row) => [
        row.sessionCaisseId,
        {
          nombreVentes: row._count._all,
          caSession: (row._sum.montantTotal ?? new Prisma.Decimal(0)).toFixed(
            2,
          ),
        },
      ]),
    );

    return sessions.map((session) => {
      const s = bySession.get(session.id);
      return {
        ...session,
        nombreVentes: s?.nombreVentes ?? 0,
        caSession: s?.caSession ?? '0.00',
      };
    });
  }

  private async perimetreCaisseWhere(
    utilisateur: AuthenticatedUser,
  ): Promise<Prisma.CaisseWhereInput> {
    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      return {};
    }
    if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      return { boutique: { zoneId } };
    }
    if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      return { boutiqueId: requireOwnBoutiqueId(utilisateur) };
    }
    throw new ForbiddenException(
      `Rôle "${utilisateur.role}" non habilité à consulter les ventes.`,
    );
  }

  async listerJournal(
    utilisateur: AuthenticatedUser,
    query: ListVentesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const perimetre = await this.perimetreCaisseWhere(utilisateur);

    if (
      query.boutiqueId &&
      ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)
    ) {
      const own = requireOwnBoutiqueId(utilisateur);
      if (query.boutiqueId !== own) {
        throw new ForbiddenException(
          'Un rôle boutique ne peut consulter que les tickets de son magasin.',
        );
      }
    }

    const dateVente: Prisma.DateTimeFilter = {};
    if (query.from) dateVente.gte = new Date(query.from);
    if (query.to) dateVente.lte = new Date(query.to);

    const where: Prisma.VenteWhereInput = {
      caisse: {
        ...perimetre,
        ...(query.boutiqueId ? { boutiqueId: query.boutiqueId } : {}),
      },
      ...(query.from || query.to ? { dateVente } : {}),
    };

    const [total, ventes] = await this.prisma.$transaction([
      this.prisma.vente.count({ where }),
      this.prisma.vente.findMany({
        where,
        orderBy: { dateVente: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, nom: true, prenom: true } },
          paiements: true,
          caisse: {
            select: {
              id: true,
              type: true,
              code: true,
              libelle: true,
              boutiqueId: true,
              boutique: { select: { id: true, nom: true } },
            },
          },
        },
      }),
    ]);

    return {
      items: ventes.map((v) => ({
        id: v.id,
        dateVente: v.dateVente,
        montantTotal: v.montantTotal.toFixed(2),
        modePaiement: v.modePaiement,
        sessionCaisseId: v.sessionCaisseId,
        clientId: v.clientId,
        client: v.client,
        paiements: v.paiements.map((p) => ({
          modePaiement: p.modePaiement,
          montant: p.montant.toFixed(2),
        })),
        caisse: v.caisse,
      })),
      total,
      page,
      limit,
    };
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

  // Tickets de la session pour le tiroir POS — lecture seule, même périmètre
  // que findOne. Les retours sont inclus pour reconstituer les quantités
  // encore retournables après un refresh (§6.3.2).
  async listerVentesSession(sessionId: string, utilisateur: AuthenticatedUser) {
    await this.findOne(sessionId, utilisateur);
    return this.prisma.vente.findMany({
      where: { sessionCaisseId: sessionId },
      orderBy: { dateVente: 'desc' },
      include: {
        lignes: { include: { produit: true } },
        retours: true,
        paiements: true,
      },
    });
  }

  private async chargerParClientOperationId(clientOperationId: string) {
    return this.prisma.vente.findUnique({
      where: { clientOperationId },
      include: { lignes: { include: { produit: true } }, paiements: true },
    });
  }

  private estConflitIdempotence(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
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

  // Liste des coéquipiers éligibles au double contrôle d'ouverture/clôture
  // (§5.1) pour la boutique de l'acteur — alimente le sélecteur POS (pas de
  // saisie libre de login, usage terrain type grande surface).
  async listerTemoinsEligibles(utilisateur: AuthenticatedUser) {
    const boutiqueId = requireOwnBoutiqueId(utilisateur);
    const roles = await this.prisma.role.findMany({
      where: { libelle: { in: [...ROLES_TEMOIN_ELIGIBLES] } },
      select: { id: true, libelle: true },
    });
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) {
      return [];
    }

    const temoins = await this.prisma.utilisateur.findMany({
      where: {
        boutiqueId,
        actif: true,
        id: { not: utilisateur.userId },
        roleId: { in: roleIds },
      },
      select: {
        id: true,
        login: true,
        prenom: true,
        nom: true,
        roleId: true,
      },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });

    const libelleParRole = new Map(roles.map((r) => [r.id, r.libelle]));
    return temoins.map((t) => ({
      id: t.id,
      login: t.login,
      prenom: t.prenom,
      nom: t.nom,
      role: libelleParRole.get(t.roleId) ?? null,
    }));
  }

  // Comptage contradictoire (§5.1) : le témoin doit être un utilisateur actif
  // de la même boutique, éligible (caissier/responsable boutique), différent
  // de l'acteur principal, et prouver sa présence par mot de passe.
  private async resoudreTemoin(
    temoinLogin: string,
    temoinPassword: string,
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

    const ok = await bcrypt.compare(temoinPassword, temoin.passwordHash);
    if (!ok) {
      throw new BadRequestException(
        'Témoin invalide : mot de passe du confirmateur incorrect.',
      );
    }

    return temoin;
  }

  async upsertReservation(
    sessionId: string,
    dto: UpsertReservationDto,
    utilisateur: AuthenticatedUser,
  ) {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);
    if (session.statut !== StatutSessionCaisse.OUVERTE) {
      throw new BadRequestException(
        'Impossible de réserver du stock : la session est fermée.',
      );
    }
    if (!session.caisse.boutiqueId) {
      throw new BadRequestException(
        "La caisse de session n'est rattachée à aucune boutique.",
      );
    }
    const entrepotId = await this.stockService.trouverEntrepotPrincipalBoutique(
      session.caisse.boutiqueId,
    );

    const lignes = new Map<string, number>();
    for (const ligne of dto.lignes) {
      lignes.set(
        ligne.produitId,
        (lignes.get(ligne.produitId) ?? 0) + ligne.quantite,
      );
    }

    const reservations = await this.prisma.$transaction(async (tx) => {
      if (lignes.size === 0) {
        await tx.reservationStock.deleteMany({
          where: { sessionCaisseId: session.id, holdId: dto.holdId },
        });
        await tx.ticketAttente.deleteMany({
          where: { id: dto.holdId, sessionCaisseId: session.id },
        });
        return [];
      }
      for (const [produitId, quantite] of lignes) {
        const produit = await tx.produit.findUnique({
          where: { id: produitId },
        });
        if (!produit?.actif) {
          throw new NotFoundException(`Produit ${produitId} introuvable.`);
        }
        const dispo = await this.stockService.getDisponible(
          produitId,
          entrepotId,
          dto.holdId,
          tx,
        );
        if (dispo < quantite) {
          throw new BadRequestException({
            code: 'STOCK_INSUFFISANT',
            message: `Stock insuffisant pour réserver « ${produit.designation} » (disponible : ${dispo}, demandé : ${quantite}).`,
          });
        }
      }
      await tx.reservationStock.deleteMany({
        where: { sessionCaisseId: session.id, holdId: dto.holdId },
      });
      await tx.reservationStock.createMany({
        data: [...lignes.entries()].map(([produitId, quantite]) => ({
          sessionCaisseId: session.id,
          holdId: dto.holdId,
          produitId,
          entrepotId,
          quantite,
        })),
      });
      if (dto.panier && dto.panier.length > 0) {
        const panier = dto.panier.map((l) => ({
          produitId: l.produitId,
          designation: l.designation,
          reference: l.reference ?? null,
          prixUnitaire: l.prixUnitaire,
          stock: l.stock,
          quantite: l.quantite,
          remise: l.remise,
        }));
        await tx.ticketAttente.upsert({
          where: { id: dto.holdId },
          create: {
            id: dto.holdId,
            sessionCaisseId: session.id,
            numero: dto.numero ?? 1,
            libelle: dto.libelle?.trim() || 'Ticket',
            motif: dto.motif ?? 'AUTRE',
            clientId: dto.clientId || null,
            remisePanier: dto.remisePanier ?? '',
            panier,
          },
          update: {
            numero: dto.numero ?? 1,
            libelle: dto.libelle?.trim() || 'Ticket',
            motif: dto.motif ?? 'AUTRE',
            clientId: dto.clientId || null,
            remisePanier: dto.remisePanier ?? '',
            panier,
          },
        });
      }
      return tx.reservationStock.findMany({
        where: { sessionCaisseId: session.id, holdId: dto.holdId },
      });
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'STOCK_RESERVE_ATTENTE',
      entite: 'ReservationStock',
      entiteId: dto.holdId,
      details: JSON.stringify({
        sessionCaisseId: session.id,
        lignes: [...lignes.entries()].map(([produitId, quantite]) => ({
          produitId,
          quantite,
        })),
      }),
    });
    return reservations;
  }

  async libererReservation(
    sessionId: string,
    holdId: string,
    utilisateur: AuthenticatedUser,
  ) {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);
    await this.prisma.reservationStock.deleteMany({
      where: { sessionCaisseId: session.id, holdId },
    });
    await this.prisma.ticketAttente.deleteMany({
      where: { id: holdId, sessionCaisseId: session.id },
    });
    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'STOCK_RESERVATION_LIBEREE',
      entite: 'ReservationStock',
      entiteId: holdId,
      details: JSON.stringify({ sessionCaisseId: session.id }),
    });
    return { holdId };
  }

  async listerTicketsAttente(
    sessionId: string,
    utilisateur: AuthenticatedUser,
  ) {
    const session = await this.trouverSessionOuEchouer(sessionId);
    this.verifierPerimetreBoutique(session, utilisateur);
    const tickets = await this.prisma.ticketAttente.findMany({
      where: { sessionCaisseId: session.id },
      orderBy: { numero: 'asc' },
    });
    return tickets.map((t) => ({
      id: t.id,
      numero: t.numero,
      libelle: t.libelle,
      motif: t.motif,
      clientId: t.clientId,
      remisePanier: t.remisePanier,
      panier: t.panier,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  private normaliserPaiements(
    dto: CreateVenteDto,
    montantTotal: Prisma.Decimal,
  ): { modePaiement: ModePaiement; montant: Prisma.Decimal }[] {
    if (!dto.paiements?.length) {
      return [{ modePaiement: dto.modePaiement, montant: montantTotal }];
    }
    const vus = new Set<ModePaiement>();
    const lignes: { modePaiement: ModePaiement; montant: Prisma.Decimal }[] =
      [];
    let somme = new Prisma.Decimal(0);
    for (const p of dto.paiements) {
      if (vus.has(p.modePaiement)) {
        throw new BadRequestException(
          `Mode de paiement en double : ${p.modePaiement}.`,
        );
      }
      vus.add(p.modePaiement);
      const montant = new Prisma.Decimal(p.montant).toDecimalPlaces(2);
      if (montant.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Chaque règlement doit être d’un montant strictement positif.',
        );
      }
      somme = somme.plus(montant);
      lignes.push({ modePaiement: p.modePaiement, montant });
    }
    if (!somme.equals(montantTotal.toDecimalPlaces(2))) {
      throw new BadRequestException(
        `La somme des règlements (${somme.toFixed(2)}) doit égaler le total (${montantTotal.toFixed(2)}).`,
      );
    }
    return lignes;
  }

  private modePrincipal(
    paiements: { modePaiement: ModePaiement; montant: Prisma.Decimal }[],
    fallback: ModePaiement,
  ): ModePaiement {
    if (paiements.some((p) => p.modePaiement === ModePaiement.ESPECES)) {
      return ModePaiement.ESPECES;
    }
    return paiements[0]?.modePaiement ?? fallback;
  }

  private async resoudreChefCaisse(
    login: string,
    password: string,
    acteur: AuthenticatedUser,
    boutiqueId: string,
  ) {
    const chef = await this.prisma.utilisateur.findUnique({
      where: { login },
      include: { role: true },
    });
    if (
      !chef ||
      !chef.actif ||
      chef.boutiqueId !== boutiqueId ||
      chef.id === acteur.userId
    ) {
      throw new BadRequestException(
        'Dérogation refusée : le chef de caisse doit être un Responsable boutique actif de cette boutique, distinct de vous.',
      );
    }
    if (chef.role.libelle !== RoleLibelle.RESPONSABLE_BOUTIQUE) {
      throw new BadRequestException(
        'Dérogation refusée : seul le Responsable boutique peut déroger.',
      );
    }
    const ok = await bcrypt.compare(password, chef.passwordHash);
    if (!ok) {
      throw new BadRequestException(
        'Dérogation refusée : identifiants invalides.',
      );
    }
    return chef;
  }
}
