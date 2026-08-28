import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutDemandeAchat } from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { resolveZoneScopeForSuperviseur } from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateConsultationDto,
  CreateOffreFournisseurDto,
} from './dto/planning-achat.dto';

const INCLUDE_CONSULTATION = {
  demande: {
    include: {
      boutique: { select: { id: true, nom: true, zoneId: true } },
      lignes: true,
    },
  },
  invitations: {
    include: {
      fournisseur: { select: { id: true, nom: true, actif: true } },
    },
  },
  offres: {
    include: {
      fournisseur: { select: { id: true, nom: true } },
      lignes: true,
    },
    orderBy: { dateSoumission: 'asc' as const },
  },
} as const;

type ConsultationChargee = Prisma.ConsultationFournisseurGetPayload<{
  include: typeof INCLUDE_CONSULTATION;
}>;

@Injectable()
export class SourcingAchatsService {
  constructor(private readonly prisma: PrismaService) {}

  async creerConsultation(
    demandeId: string,
    dto: CreateConsultationDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.consultationFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: INCLUDE_CONSULTATION,
    });
    if (replay) {
      if (replay.createurId !== user.userId) {
        throw new ConflictException(
          'clientOperationId déjà utilisé par une autre opération.',
        );
      }
      return this.serialiser(replay);
    }
    const demande = await this.prisma.demandeAchat.findUnique({
      where: { id: demandeId },
      include: { lignes: true },
    });
    if (!demande) throw new NotFoundException('Demande introuvable.');
    if (
      demande.statut !== StatutDemandeAchat.SOUMISE &&
      demande.statut !== StatutDemandeAchat.APPROUVEE
    ) {
      throw new BadRequestException(
        'Une consultation exige une demande SOUMISE ou APPROUVEE.',
      );
    }
    const ids = [...new Set(dto.fournisseurIds)];
    if (ids.length !== dto.fournisseurIds.length) {
      throw new BadRequestException('Fournisseur invité en doublon.');
    }
    const fournisseurs = await this.prisma.fournisseur.findMany({
      where: { id: { in: ids }, actif: true },
      select: { id: true },
    });
    if (fournisseurs.length !== ids.length) {
      throw new BadRequestException('Fournisseur invité absent ou inactif.');
    }

    try {
      const consultation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.consultationFournisseur.create({
          data: {
            numero: this.numero(),
            demandeId,
            clientOperationId: dto.clientOperationId,
            dateLimite: dto.dateLimite ? new Date(dto.dateLimite) : null,
            notes: dto.notes?.trim() || null,
            createurId: user.userId,
            invitations: {
              create: ids.map((fournisseurId) => ({ fournisseurId })),
            },
          },
          include: INCLUDE_CONSULTATION,
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'CONSULTATION_FOURNISSEUR_CREATED',
            entite: 'ConsultationFournisseur',
            entiteId: created.id,
            details: JSON.stringify({ demandeId, fournisseurIds: ids }),
          },
        });
        return created;
      });
      return this.serialiser(consultation);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.consultationFournisseur.findUnique(
          {
            where: { clientOperationId: dto.clientOperationId },
            include: INCLUDE_CONSULTATION,
          },
        );
        if (concurrent?.createurId === user.userId) {
          return this.serialiser(concurrent);
        }
      }
      throw error;
    }
  }

  async ajouterOffre(
    consultationId: string,
    dto: CreateOffreFournisseurDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.offreFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true, fournisseur: true },
    });
    if (replay) {
      if (replay.saisieParId !== user.userId) {
        throw new ConflictException(
          'clientOperationId déjà utilisé par une autre opération.',
        );
      }
      return this.serialiserOffre(replay);
    }
    const consultation = await this.charger(consultationId);
    if (consultation.statut !== 'OUVERTE') {
      throw new BadRequestException('La consultation n’est plus ouverte.');
    }
    if (consultation.demande.devise !== dto.devise.toUpperCase()) {
      throw new BadRequestException(
        'La devise de l’offre doit correspondre à celle de la demande ; aucun taux de change ne sera inventé.',
      );
    }
    const invitation = consultation.invitations.find(
      (item) => item.fournisseurId === dto.fournisseurId,
    );
    if (!invitation?.fournisseur.actif) {
      throw new ForbiddenException(
        'Ce fournisseur actif n’est pas invité à la consultation.',
      );
    }
    const lignesDemande = new Map(
      consultation.demande.lignes.map((ligne) => [ligne.id, ligne]),
    );
    if (
      dto.lignes.length !== lignesDemande.size ||
      new Set(dto.lignes.map((ligne) => ligne.ligneDemandeId)).size !==
        dto.lignes.length ||
      dto.lignes.some(
        (ligne) =>
          !lignesDemande.has(ligne.ligneDemandeId) ||
          lignesDemande.get(ligne.ligneDemandeId)!.quantite !== ligne.quantite,
      )
    ) {
      throw new BadRequestException(
        'L’offre doit chiffrer exactement une fois chaque ligne et quantité de la demande.',
      );
    }

    try {
      const offre = await this.prisma.$transaction(async (tx) => {
        const created = await tx.offreFournisseur.create({
          data: {
            consultationId,
            fournisseurId: dto.fournisseurId,
            devise: dto.devise.toUpperCase(),
            transport: dto.transport,
            assurance: dto.assurance,
            douane: dto.douane,
            taxes: dto.taxes,
            autresCouts: dto.autresCouts,
            delaiLivraisonJours: dto.delaiLivraisonJours,
            conditionsPaiement: dto.conditionsPaiement?.trim() || null,
            validiteJusquAu: dto.validiteJusquAu
              ? new Date(dto.validiteJusquAu)
              : null,
            clientOperationId: dto.clientOperationId,
            saisieParId: user.userId,
            lignes: {
              create: dto.lignes.map((ligne) => {
                const source = lignesDemande.get(ligne.ligneDemandeId)!;
                return {
                  ligneDemandeId: ligne.ligneDemandeId,
                  produitId: source.produitId,
                  quantite: ligne.quantite,
                  prixUnitaire: ligne.prixUnitaire,
                };
              }),
            },
          },
          include: { lignes: true, fournisseur: true },
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'OFFRE_FOURNISSEUR_CREATED',
            entite: 'OffreFournisseur',
            entiteId: created.id,
            details: JSON.stringify({
              consultationId,
              fournisseurId: dto.fournisseurId,
              totalLandedCost: this.totalLandedCost(created).toFixed(2),
            }),
          },
        });
        return created;
      });
      return this.serialiserOffre(offre);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.offreFournisseur.findUnique({
          where: { clientOperationId: dto.clientOperationId },
          include: { lignes: true, fournisseur: true },
        });
        if (concurrent?.saisieParId === user.userId) {
          return this.serialiserOffre(concurrent);
        }
      }
      throw error;
    }
  }

  async detail(id: string, user: AuthenticatedUser) {
    const consultation = await this.charger(id);
    await this.assertScope(consultation, user);
    return this.serialiser(consultation);
  }

  async comparer(id: string, user: AuthenticatedUser) {
    const consultation = await this.charger(id);
    await this.assertScope(consultation, user);
    const offres = consultation.offres
      .map((offre) => this.serialiserOffre(offre))
      .sort(
        (a, b) =>
          Number(a.totalLandedCost) - Number(b.totalLandedCost) ||
          a.delaiLivraisonJours - b.delaiLivraisonJours,
      )
      .map((offre, index) => ({ rang: index + 1, ...offre }));
    return {
      consultationId: consultation.id,
      numero: consultation.numero,
      devise: consultation.demande.devise,
      critereClassement:
        'totalLandedCost croissant, puis délai de livraison croissant',
      formuleTotalLandedCost:
        'somme(quantite × prixUnitaire) + transport + assurance + douane + taxes + autresCouts',
      offres,
    };
  }

  private async charger(id: string): Promise<ConsultationChargee> {
    const consultation = await this.prisma.consultationFournisseur.findUnique({
      where: { id },
      include: INCLUDE_CONSULTATION,
    });
    if (!consultation) {
      throw new NotFoundException(`Consultation ${id} introuvable.`);
    }
    return consultation;
  }

  private async assertScope(
    consultation: ConsultationChargee,
    user: AuthenticatedUser,
  ) {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (
        !user.boutiqueId ||
        consultation.demande.boutiqueId !== user.boutiqueId
      ) {
        throw new ForbiddenException('Consultation hors de votre boutique.');
      }
      return;
    }
    if (user.role === RoleLibelle.SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      if (consultation.demande.boutique?.zoneId !== zoneId) {
        throw new ForbiddenException('Consultation hors de votre zone.');
      }
    }
  }

  private totalLandedCost(offre: {
    transport: Prisma.Decimal;
    assurance: Prisma.Decimal;
    douane: Prisma.Decimal;
    taxes: Prisma.Decimal;
    autresCouts: Prisma.Decimal;
    lignes: Array<{
      quantite: number;
      prixUnitaire: Prisma.Decimal;
    }>;
  }) {
    const marchandises = offre.lignes.reduce(
      (total, ligne) => total.plus(ligne.prixUnitaire.mul(ligne.quantite)),
      new Prisma.Decimal(0),
    );
    return marchandises
      .plus(offre.transport)
      .plus(offre.assurance)
      .plus(offre.douane)
      .plus(offre.taxes)
      .plus(offre.autresCouts);
  }

  private serialiser(consultation: ConsultationChargee) {
    return {
      ...consultation,
      dateCreation: consultation.dateCreation.toISOString(),
      dateLimite: consultation.dateLimite?.toISOString() ?? null,
      offres: consultation.offres.map((offre) => this.serialiserOffre(offre)),
    };
  }

  private serialiserOffre<
    T extends {
      transport: Prisma.Decimal;
      assurance: Prisma.Decimal;
      douane: Prisma.Decimal;
      taxes: Prisma.Decimal;
      autresCouts: Prisma.Decimal;
      delaiLivraisonJours: number;
      lignes: Array<{
        quantite: number;
        prixUnitaire: Prisma.Decimal;
      }>;
    },
  >(offre: T) {
    const marchandises = offre.lignes.reduce(
      (total, ligne) => total.plus(ligne.prixUnitaire.mul(ligne.quantite)),
      new Prisma.Decimal(0),
    );
    return {
      ...offre,
      sousTotalMarchandises: marchandises.toFixed(2),
      transport: offre.transport.toFixed(2),
      assurance: offre.assurance.toFixed(2),
      douane: offre.douane.toFixed(2),
      taxes: offre.taxes.toFixed(2),
      autresCouts: offre.autresCouts.toFixed(2),
      totalLandedCost: this.totalLandedCost(offre).toFixed(2),
      lignes: offre.lignes.map((ligne) => ({
        ...ligne,
        prixUnitaire: ligne.prixUnitaire.toFixed(2),
        montant: ligne.prixUnitaire.mul(ligne.quantite).toFixed(2),
      })),
    };
  }

  private numero() {
    return `CF-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
