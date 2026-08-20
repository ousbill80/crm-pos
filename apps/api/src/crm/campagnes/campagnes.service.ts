import { Injectable, NotFoundException } from '@nestjs/common';
import type { CampagneCrm } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateCampagneDto } from '../dto/create-campagne.dto';
import { toCsv, type CsvPrimitive } from '../../common/csv.util';

export interface ContactCible extends Record<string, CsvPrimitive> {
  clientId: string;
  nom: string;
  prenom: string;
  contact: string | null;
  pointsCumules: number;
}

// Campagnes ciblées (§6.6) : ciblage par segment/niveau de fidélité + export
// CSV de la liste de contacts pour envoi manuel — pas d'envoi automatisé
// SMS/WhatsApp/email (décision validée avec l'utilisateur, pas de
// dépendance/coût externe).
@Injectable()
export class CampagnesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateCampagneDto,
    utilisateurId: string,
  ): Promise<CampagneCrm> {
    const campagne = await this.prisma.campagneCrm.create({
      data: {
        nom: dto.nom,
        message: dto.message,
        segment: dto.segment,
        niveauFidelite: dto.niveauFidelite,
        canal: dto.canal,
        createdById: utilisateurId,
      },
    });

    await this.audit.record({
      utilisateurId,
      action: 'CAMPAGNE_CRM_CREEE',
      entite: 'CampagneCrm',
      entiteId: campagne.id,
      details: `Campagne "${campagne.nom}" (canal ${campagne.canal}${
        campagne.segment ? `, segment ${campagne.segment}` : ''
      }${campagne.niveauFidelite ? `, palier ${campagne.niveauFidelite}` : ''})`,
    });

    return campagne;
  }

  async findAll(): Promise<CampagneCrm[]> {
    return this.prisma.campagneCrm.findMany({
      orderBy: { dateCreation: 'desc' },
    });
  }

  async findOne(id: string): Promise<CampagneCrm> {
    const campagne = await this.prisma.campagneCrm.findUnique({
      where: { id },
    });
    if (!campagne) {
      throw new NotFoundException(`Campagne "${id}" introuvable.`);
    }
    return campagne;
  }

  async contacts(id: string): Promise<ContactCible[]> {
    const campagne = await this.findOne(id);

    const clients = await this.prisma.client.findMany({
      where: {
        ...(campagne.segment ? { segment: campagne.segment } : {}),
        ...(campagne.niveauFidelite
          ? { fidelite: { niveau: campagne.niveauFidelite } }
          : {}),
      },
      include: { fidelite: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });

    return clients.map((c) => ({
      clientId: c.id,
      nom: c.nom,
      prenom: c.prenom,
      contact: c.contact,
      pointsCumules: c.fidelite?.pointsCumules ?? 0,
    }));
  }

  async contactsCsv(id: string): Promise<string> {
    const contacts = await this.contacts(id);
    return toCsv(contacts, [
      { key: 'clientId', header: 'ID client' },
      { key: 'nom', header: 'Nom' },
      { key: 'prenom', header: 'Prénom' },
      { key: 'contact', header: 'Contact' },
      { key: 'pointsCumules', header: 'Points fidélité' },
    ]);
  }
}
