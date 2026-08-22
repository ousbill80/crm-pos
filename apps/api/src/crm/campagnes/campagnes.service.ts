import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CampagneCrm } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateCampagneDto } from '../dto/create-campagne.dto';
import { toCsv, type CsvPrimitive } from '../../common/csv.util';
import { envoyerEmail, envoyerSms } from '../campagne-envoi';

export interface ContactCible extends Record<string, CsvPrimitive> {
  clientId: string;
  nom: string;
  prenom: string | null;
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

    // §6.6 : uniquement les clients avec consentement marketing et un
    // contact renseigné — la campagne sert l’export pour envoi manuel.
    const clients = await this.prisma.client.findMany({
      where: {
        consentementMarketing: true,
        contact: { not: null },
        NOT: { contact: '' },
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

  async envoyer(
    id: string,
    utilisateurId: string,
  ): Promise<{
    envoyes: number;
    canal: string;
    dateEnvoi: Date;
  }> {
    const campagne = await this.findOne(id);
    const destinataires = await this.contacts(id);
    if (destinataires.length === 0) {
      throw new BadRequestException(
        'Aucun contact ciblé (consentement + coordonnée). Exportez le CSV ou élargissez le ciblage.',
      );
    }

    const canalSms = campagne.canal === 'SMS' || campagne.canal === 'WHATSAPP';
    if (canalSms && !process.env.SMS_GATEWAY_URL) {
      throw new BadRequestException(
        'Passerelle SMS non configurée (SMS_GATEWAY_URL). Utilisez l’export CSV.',
      );
    }
    if (!canalSms && !process.env.SMTP_HOST) {
      throw new BadRequestException(
        'SMTP non configuré (SMTP_HOST). Utilisez l’export CSV.',
      );
    }

    for (const dest of destinataires) {
      const to = dest.contact?.trim();
      if (!to) continue;
      if (canalSms) {
        await envoyerSms(to, campagne.message);
      } else {
        await envoyerEmail(to, campagne.nom, campagne.message);
      }
      await this.prisma.interactionCrm.create({
        data: {
          clientId: dest.clientId,
          type: 'CAMPAGNE',
          canal: campagne.canal,
          contenu: campagne.message,
        },
      });
    }

    const dateEnvoi = new Date();
    await this.prisma.campagneCrm.update({
      where: { id: campagne.id },
      data: { dateEnvoi },
    });
    await this.audit.record({
      utilisateurId,
      action: 'CAMPAGNE_CRM_ENVOYEE',
      entite: 'CampagneCrm',
      entiteId: campagne.id,
      details: `Envoi ${campagne.canal} · ${destinataires.length} destinataire(s) · « ${campagne.nom} »`,
    });
    return {
      envoyes: destinataires.length,
      canal: campagne.canal,
      dateEnvoi,
    };
  }
}
