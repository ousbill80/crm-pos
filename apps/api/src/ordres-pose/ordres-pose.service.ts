import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrdreDePose, Prisma } from '@prisma/client';
import bwipjs from 'bwip-js';
import { StatutOrdrePose } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_POSE_ANNULATION,
  ROLES_POSE_LECTURE,
  ROLES_POSE_TECHNIQUE,
} from '../caisses/access-scope.constants';
import { OrdrePoseStateMachineService } from './ordre-pose-state-machine.service';
import { DemarrerOrdrePoseDto } from './dto/demarrer-ordre-pose.dto';
import { AnnulerOrdrePoseDto } from './dto/annuler-ordre-pose.dto';

type TxClient = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  lignes: { include: { produit: true } },
  technicien: { select: { id: true, nom: true, prenom: true } },
  boutique: { select: { id: true, nom: true } },
} as const;

// Suivi de l'OrdreDePose (extension pose/installation atelier validée par
// l'utilisateur, hors MCD §6.5 d'origine — même statut que l'extension
// "Achats" déjà documentée dans packages/shared/src/enums.ts). Toute
// évolution de statut passe par OrdrePoseStateMachineService (objet de
// domaine unique) et génère une entrée d'audit horodatée (§6.7).
@Injectable()
export class OrdresPoseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: OrdrePoseStateMachineService,
  ) {}

  // Appelé par VentesService.encaisserVente, dans la même transaction
  // Prisma que la création de la Vente, dès qu'au moins une ligne a
  // avecPose=true.
  async creerDepuisVente(
    tx: TxClient,
    params: {
      venteId: string;
      boutiqueId: string;
      lignes: { id: string; produitId: string; quantite: number }[];
    },
  ): Promise<OrdreDePose> {
    return tx.ordreDePose.create({
      data: {
        venteId: params.venteId,
        boutiqueId: params.boutiqueId,
        qrToken: randomUUID(),
        statut: StatutOrdrePose.EN_ATTENTE,
        lignes: {
          create: params.lignes.map((ligne) => ({
            ligneVenteId: ligne.id,
            produitId: ligne.produitId,
            quantite: ligne.quantite,
          })),
        },
      },
      include: { lignes: true },
    });
  }

  // QR encodant "id:qrToken" — le technicien scanne le reçu papier sans
  // jamais avoir vu l'id de l'OrdreDePose autrement ; les deux UUID sont
  // nécessaires côté mobile (GET /ordres-pose/:id puis qrToken en body de
  // /demarrer). Zéro nouvelle dépendance mobile, réutilise bwip-js déjà
  // utilisé côté impressions (étiquettes code-barres).
  async genererQrPngBase64(id: string, qrToken: string): Promise<string> {
    const buffer = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: `${id}:${qrToken}`,
      scale: 3,
      includetext: false,
      backgroundcolor: 'FFFFFF',
    });
    return buffer.toString('base64');
  }

  async findOne(id: string, utilisateur: AuthenticatedUser) {
    const ordre = await this.trouverOuEchouer(id);
    this.assertLectureAutorisee(ordre, utilisateur);
    return ordre;
  }

  // Démarrer : le technicien qui scanne le QR en devient l'exécutant —
  // aucune pré-assignation à la création (décision validée : plus réaliste
  // en atelier qu'une affectation a priori).
  async demarrer(
    id: string,
    dto: DemarrerOrdrePoseDto,
    utilisateur: AuthenticatedUser,
  ): Promise<OrdreDePose> {
    if (!ROLES_POSE_TECHNIQUE.includes(utilisateur.role)) {
      throw new ForbiddenException(
        'Seul un technicien pose peut démarrer un ordre de pose.',
      );
    }

    const ordre = await this.trouverOuEchouer(id);
    this.verifierPerimetreBoutique(ordre, utilisateur);

    if (ordre.qrToken !== dto.qrToken) {
      throw new BadRequestException('QR code de pose invalide.');
    }

    this.stateMachine.assertTransitionAutorisee(
      ordre.statut,
      StatutOrdrePose.EN_COURS,
    );

    const misAJour = await this.prisma.ordreDePose.update({
      where: { id },
      data: {
        statut: StatutOrdrePose.EN_COURS,
        technicienId: utilisateur.userId,
        dateDebut: new Date(),
      },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'ORDRE_POSE_DEMARRE',
      entite: 'OrdreDePose',
      entiteId: id,
    });

    return misAJour;
  }

  // Terminer : même technicien que celui qui a démarré (pas de
  // réassignation en v1 — évite un flux de transfert inutile).
  async terminer(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<OrdreDePose> {
    if (!ROLES_POSE_TECHNIQUE.includes(utilisateur.role)) {
      throw new ForbiddenException(
        'Seul un technicien pose peut terminer un ordre de pose.',
      );
    }

    const ordre = await this.trouverOuEchouer(id);

    if (ordre.technicienId !== utilisateur.userId) {
      throw new ForbiddenException(
        'Seul le technicien qui a démarré cette pose peut la terminer.',
      );
    }

    this.stateMachine.assertTransitionAutorisee(
      ordre.statut,
      StatutOrdrePose.TERMINEE,
    );

    const misAJour = await this.prisma.ordreDePose.update({
      where: { id },
      data: { statut: StatutOrdrePose.TERMINEE, dateFin: new Date() },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'ORDRE_POSE_TERMINE',
      entite: 'OrdreDePose',
      entiteId: id,
    });

    return misAJour;
  }

  async annuler(
    id: string,
    dto: AnnulerOrdrePoseDto,
    utilisateur: AuthenticatedUser,
  ): Promise<OrdreDePose> {
    if (!ROLES_POSE_ANNULATION.includes(utilisateur.role)) {
      throw new ForbiddenException(
        'Annulation d’un ordre de pose réservée à l’encadrement boutique/réseau.',
      );
    }

    const ordre = await this.trouverOuEchouer(id);
    this.verifierPerimetreBoutique(ordre, utilisateur);

    this.stateMachine.assertTransitionAutorisee(
      ordre.statut,
      StatutOrdrePose.ANNULEE,
    );

    const misAJour = await this.prisma.ordreDePose.update({
      where: { id },
      data: { statut: StatutOrdrePose.ANNULEE, motifAnnulation: dto.motif },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'ORDRE_POSE_ANNULE',
      entite: 'OrdreDePose',
      entiteId: id,
      details: JSON.stringify({ motif: dto.motif }),
    });

    return misAJour;
  }

  private async trouverOuEchouer(id: string) {
    const ordre = await this.prisma.ordreDePose.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!ordre) {
      throw new NotFoundException('Ordre de pose introuvable.');
    }
    return ordre;
  }

  private assertLectureAutorisee(
    ordre: { boutiqueId: string },
    utilisateur: AuthenticatedUser,
  ): void {
    if (!ROLES_POSE_LECTURE.includes(utilisateur.role)) {
      throw new ForbiddenException(
        `Rôle "${utilisateur.role}" non habilité à consulter les ordres de pose.`,
      );
    }
    this.verifierPerimetreBoutique(ordre, utilisateur);
  }

  // Même pattern que TransactionsService.verifierPerimetreBoutique : les
  // rôles à vue réseau (boutiqueId null au JWT) passent toujours ; les
  // rôles rattachés à une boutique (dont TECHNICIEN_POSE) sont restreints à
  // la leur.
  private verifierPerimetreBoutique(
    ordre: { boutiqueId: string },
    utilisateur: AuthenticatedUser,
  ): void {
    if (utilisateur.boutiqueId && ordre.boutiqueId !== utilisateur.boutiqueId) {
      throw new ForbiddenException(
        'Vous ne pouvez agir que sur un ordre de pose de votre propre boutique.',
      );
    }
  }
}
