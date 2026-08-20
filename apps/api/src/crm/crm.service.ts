import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import {
  SEUIL_SEGMENT_REGULIER_NB_VENTES,
  SEUIL_SEGMENT_VIP_NB_VENTES,
} from './crm-thresholds.constants';

// Fiche client unique consolidée réseau (§6.6) : ce service n'est
// délibérément PAS scopé par boutique — à la différence du module Caisses,
// tout rôle habilité (voir crm-roles.constants.ts) peut consulter/créer un
// client depuis n'importe quelle boutique.
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateClientDto, utilisateurId: string): Promise<Client> {
    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          nom: dto.nom,
          prenom: dto.prenom,
          contact: dto.contact,
          dateNaissance: dto.dateNaissance
            ? new Date(dto.dateNaissance)
            : undefined,
          consentementMarketing: dto.consentementMarketing ?? false,
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

    await this.audit.record({
      utilisateurId,
      action: 'CLIENT_CREE',
      entite: 'Client',
      entiteId: client.id,
      details: `Création fiche client ${client.prenom} ${client.nom}`,
    });

    return client;
  }

  async findAll(query: ListClientsQueryDto): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: {
        segment: query.segment,
        ...(query.niveauFidelite
          ? { fidelite: { niveau: query.niveauFidelite } }
          : {}),
      },
      include: { fidelite: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { fidelite: true },
    });
    if (!client) {
      throw new NotFoundException(`Client "${id}" introuvable.`);
    }
    return client;
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    utilisateurId: string,
  ): Promise<Client> {
    await this.findOne(id);

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        contact: dto.contact,
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

    return client;
  }

  // Historique d'achats réseau du client (§6.6 : "historique d'achats
  // visible depuis n'importe quelle boutique") — lecture seule, agrège les
  // Vente déjà créées par le module Ventes/Transactions. Ce service ne
  // crée ni ne modifie jamais de Vente.
  async historiqueAchats(clientId: string) {
    await this.findOne(clientId);

    return this.prisma.vente.findMany({
      where: { clientId },
      include: {
        lignes: { include: { produit: true } },
        caisse: true,
      },
      orderBy: { dateVente: 'desc' },
    });
  }

  // Tableau de bord client (§6.6) : agrège des données déjà exposées par
  // historique-achats et par le module fidélité — aucun nouveau modèle,
  // simple lecture consolidée réseau.
  async tableauDeBord(clientId: string) {
    await this.findOne(clientId);

    const [agregat, dernierAchat, fidelite] = await Promise.all([
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
    ]);

    return {
      totalDepense: (
        agregat._sum.montantTotal ?? new Prisma.Decimal(0)
      ).toFixed(2),
      nombreAchats: agregat._count,
      dateDernierAchat: dernierAchat?.dateVente ?? null,
      pointsCumules: fidelite?.pointsCumules ?? 0,
      niveauFidelite: fidelite?.niveau ?? 'BRONZE',
    };
  }

  // Recalcul de segment basé sur le nombre de ventes historisées du client
  // (§6.6 : "segmentation paramétrable"). Choix d'interprétation : ce
  // recalcul est déclenché explicitement par un rôle habilité (jamais
  // automatiquement à la création d'une vente, qui est hors périmètre de ce
  // module) et se base sur des seuils codés en dur documentés dans
  // crm-thresholds.constants.ts.
  async recalculerSegment(id: string, utilisateurId: string): Promise<Client> {
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

    return client;
  }
}
