import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';
import { TypeClient } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
} from '../caisses/access-scope.constants';
import { requireOwnBoutiqueId } from '../boutiques/boutique-scope.util';
import { hasherContact } from '../prisma/field-crypto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import {
  SEUIL_SEGMENT_REGULIER_NB_VENTES,
  SEUIL_SEGMENT_VIP_NB_VENTES,
} from './crm-thresholds.constants';

type ClientPublic = Omit<Client, 'contactHash'>;

function publierClient<T extends { contactHash?: string | null }>(
  client: T,
): Omit<T, 'contactHash'> {
  const { contactHash: _h, ...reste } = client;
  return reste;
}

// Fiche unique réseau (§6.6) : findOne / historique restent réseau.
// Liste d’exploitation magasin pour les rôles boutique ; `q` = recherche
// réseau (POS, téléphone / nom) sans recréer une fiche.
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateClientDto,
    user: AuthenticatedUser,
  ): Promise<ClientPublic> {
    const typeClient = dto.typeClient ?? TypeClient.PHYSIQUE;
    const prenom = dto.prenom?.trim() || null;

    if (typeClient === TypeClient.PHYSIQUE && !prenom) {
      throw new BadRequestException(
        'Le prénom est obligatoire pour une personne physique.',
      );
    }

    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          typeClient,
          nom: dto.nom.trim(),
          prenom,
          contact: dto.contact?.trim() || null,
          adresse: dto.adresse?.trim() || null,
          dateNaissance:
            typeClient === TypeClient.PHYSIQUE && dto.dateNaissance
              ? new Date(dto.dateNaissance)
              : null,
          consentementMarketing: dto.consentementMarketing ?? false,
          boutiqueOrigineId: user.boutiqueId,
        },
      });
      // Un client est automatiquement inscrit au programme de fidélité dès
      // sa création (palier BRONZE, 0 point) — choix d'interprétation :
      // simplifie le modèle (Fidelite reste toujours disponible pour un
      // client existant) sans contredire le caractère optionnel du
      // rattachement client<->vente (§6.6), qui concerne uniquement la vente.
      await tx.fidelite.create({
        data: { clientId: created.id, pointsCumules: 0, niveau: 'BRONZE' },
      });
      return created;
    });

    const libelle =
      typeClient === TypeClient.MORALE
        ? `Création fiche client morale « ${client.nom} »`
        : `Création fiche client ${client.prenom} ${client.nom}`;

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'CLIENT_CREE',
      entite: 'Client',
      entiteId: client.id,
      details: libelle,
    });

    return publierClient(client);
  }

  async findAll(query: ListClientsQueryDto, user: AuthenticatedUser) {
    const where: Prisma.ClientWhereInput = {
      segment: query.segment,
      typeClient: query.typeClient,
      ...(query.consentementMarketing !== undefined
        ? { consentementMarketing: query.consentementMarketing }
        : {}),
      ...(query.niveauFidelite
        ? { fidelite: { niveau: query.niveauFidelite } }
        : {}),
    };

    if (query.q) {
      const q = query.q;
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { prenom: { contains: q, mode: 'insensitive' } },
        { contactHash: hasherContact(q) },
      ];
    } else if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      where.OR = [
        { boutiqueOrigineId: boutiqueId },
        { ventes: { some: { caisse: { boutiqueId } } } },
      ];
    }

    const clients = await this.prisma.client.findMany({
      where,
      include: { fidelite: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    return clients.map(publierClient);
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { fidelite: true },
    });
    if (!client) {
      throw new NotFoundException(`Client "${id}" introuvable.`);
    }
    return publierClient(client);
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    utilisateurId: string,
  ): Promise<ClientPublic> {
    await this.findOne(id);

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        typeClient: dto.typeClient,
        nom: dto.nom,
        prenom: dto.prenom,
        contact: dto.contact,
        adresse: dto.adresse,
        dateNaissance: dto.dateNaissance
          ? new Date(dto.dateNaissance)
          : undefined,
        consentementMarketing: dto.consentementMarketing,
        segment: dto.segment,
      },
    });

    await this.audit.record({
      utilisateurId,
      action: 'CLIENT_MODIFIE',
      entite: 'Client',
      entiteId: client.id,
      details: JSON.stringify(dto),
    });

    return publierClient(client);
  }

  // Historique d'achats réseau du client (§6.6 : "historique d'achats
  // visible depuis n'importe quelle boutique") — lecture seule, agrège les
  // Vente déjà créées par le module Ventes/Transactions. Ce service ne
  // crée ni ne modifie jamais de Vente.
  // Enrichit chaque vente avec le mode de paiement (déjà sur Vente) et
  // l'enregistreur issu du journal d'audit append-only (VENTE_ENREGISTREE) —
  // Vente n'a pas d'utilisateurId dédié ; l'audit est la source de vérité.
  async historiqueAchats(clientId: string) {
    await this.findOne(clientId);

    const selectUtilisateur = {
      id: true,
      prenom: true,
      nom: true,
    } as const;

    const ventes = await this.prisma.vente.findMany({
      where: { clientId },
      include: {
        lignes: { include: { produit: true } },
        paiements: true,
        caisse: { include: { boutique: true } },
        // Repli si l'audit VENTE_ENREGISTREE est absent (vente seed / legacy) :
        // caissier qui a ouvert la session — moins précis qu'un audit dédié.
        sessionCaisse: {
          include: { ouvertureUtilisateur: { select: selectUtilisateur } },
        },
      },
      orderBy: { dateVente: 'desc' },
    });

    if (ventes.length === 0) {
      return ventes;
    }

    const audits = await this.prisma.journalAudit.findMany({
      where: {
        entite: 'Vente',
        action: 'VENTE_ENREGISTREE',
        entiteId: { in: ventes.map((v) => v.id) },
      },
      include: {
        utilisateur: { select: selectUtilisateur },
      },
      orderBy: { dateHeure: 'asc' },
    });

    const enregistreParParVente = new Map(
      audits.map((a) => [a.entiteId, a.utilisateur] as const),
    );

    return ventes.map(({ sessionCaisse, ...vente }) => ({
      ...vente,
      enregistrePar:
        enregistreParParVente.get(vente.id) ??
        sessionCaisse.ouvertureUtilisateur ??
        null,
    }));
  }

  // Tableau de bord client (§6.6) : agrège des données déjà exposées par
  // historique-achats et par le module fidélité — aucun nouveau modèle,
  // simple lecture consolidée réseau.
  async tableauDeBord(clientId: string) {
    await this.findOne(clientId);

    const [agregat, dernierAchat, fidelite, ventesPourPdv] = await Promise.all([
      this.prisma.vente.aggregate({
        where: { clientId },
        _sum: { montantTotal: true },
        _count: true,
      }),
      this.prisma.vente.findFirst({
        where: { clientId },
        orderBy: { dateVente: 'desc' },
      }),
      this.prisma.fidelite.findUnique({ where: { clientId } }),
      // Points de vente fréquentés = boutiques des caisses ayant encaissé
      // ce client (§6.6 : fiche réseau, pas de rattachement boutique fixe).
      this.prisma.vente.findMany({
        where: { clientId },
        select: {
          montantTotal: true,
          dateVente: true,
          caisse: {
            select: {
              boutique: { select: { id: true, nom: true } },
            },
          },
        },
      }),
    ]);

    const parBoutique = new Map<
      string,
      {
        id: string;
        nom: string;
        nombreAchats: number;
        totalDepense: Prisma.Decimal;
        dateDernierAchat: Date;
      }
    >();

    for (const vente of ventesPourPdv) {
      const boutique = vente.caisse.boutique;
      if (!boutique) continue;
      const existant = parBoutique.get(boutique.id);
      if (!existant) {
        parBoutique.set(boutique.id, {
          id: boutique.id,
          nom: boutique.nom,
          nombreAchats: 1,
          totalDepense: new Prisma.Decimal(vente.montantTotal),
          dateDernierAchat: vente.dateVente,
        });
      } else {
        existant.nombreAchats += 1;
        existant.totalDepense = existant.totalDepense.plus(vente.montantTotal);
        if (vente.dateVente > existant.dateDernierAchat) {
          existant.dateDernierAchat = vente.dateVente;
        }
      }
    }

    const pointsDeVente = [...parBoutique.values()]
      .map((p) => ({
        id: p.id,
        nom: p.nom,
        nombreAchats: p.nombreAchats,
        totalDepense: p.totalDepense.toFixed(2),
        dateDernierAchat: p.dateDernierAchat,
      }))
      .sort((a, b) => b.nombreAchats - a.nombreAchats);

    return {
      totalDepense: (
        agregat._sum.montantTotal ?? new Prisma.Decimal(0)
      ).toFixed(2),
      nombreAchats: agregat._count,
      dateDernierAchat: dernierAchat?.dateVente ?? null,
      pointsCumules: fidelite?.pointsCumules ?? 0,
      niveauFidelite: fidelite?.niveau ?? 'BRONZE',
      pointsDeVente,
    };
  }

  // Recalcul de segment basé sur le nombre de ventes historisées du client
  // (§6.6 : "segmentation paramétrable"). Choix d'interprétation : ce
  // recalcul est déclenché explicitement par un rôle habilité (jamais
  // automatiquement à la création d'une vente, qui est hors périmètre de ce
  // module) et se base sur des seuils codés en dur documentés dans
  // crm-thresholds.constants.ts.
  async recalculerSegment(
    id: string,
    utilisateurId: string,
  ): Promise<ClientPublic> {
    await this.findOne(id);

    const nombreVentes = await this.prisma.vente.count({
      where: { clientId: id },
    });

    let segment: Client['segment'];
    if (nombreVentes >= SEUIL_SEGMENT_VIP_NB_VENTES) {
      segment = 'VIP';
    } else if (nombreVentes >= SEUIL_SEGMENT_REGULIER_NB_VENTES) {
      segment = 'REGULIER';
    } else {
      segment = 'NOUVEAU';
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: { segment },
    });

    await this.audit.record({
      utilisateurId,
      action: 'CLIENT_SEGMENT_RECALCULE',
      entite: 'Client',
      entiteId: client.id,
      details: `Segment recalculé sur ${nombreVentes} vente(s) -> ${segment}`,
    });

    return publierClient(client);
  }
}
