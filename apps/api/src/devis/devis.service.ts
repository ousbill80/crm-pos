import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  CreateDevisDto,
  LigneDevisDto,
  ListDevisQueryDto,
  TransitionDevisDto,
  UpdateDevisDto,
} from './dto/devis.dto';
import {
  ROLES_DEVIS_ECRITURE,
  ROLES_DEVIS_LECTURE,
  transitionDevisAutorisee,
  transitionsDevisAutorisees,
  type StatutDevis,
} from './devis-rules.constants';

@Injectable()
export class DevisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertLecture(user: AuthenticatedUser) {
    if (!ROLES_DEVIS_LECTURE.includes(user.role)) {
      throw new ForbiddenException('Non habilité à consulter les devis.');
    }
  }

  private assertEcriture(user: AuthenticatedUser) {
    if (!ROLES_DEVIS_ECRITURE.includes(user.role)) {
      throw new ForbiddenException('Non habilité à modifier les devis.');
    }
  }

  private montantLignes(lignes: LigneDevisDto[]): Prisma.Decimal {
    return lignes.reduce((acc, l) => {
      const brut = new Prisma.Decimal(l.prixUnitaire).times(l.quantite);
      const remise = new Prisma.Decimal(l.remise ?? 0);
      return acc.plus(brut.minus(remise));
    }, new Prisma.Decimal(0));
  }

  private async genererNumero(): Promise<string> {
    const jour = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.devisClient.count({
      where: { numero: { startsWith: `DEV-${jour}` } },
    });
    return `DEV-${jour}-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll(user: AuthenticatedUser, query: ListDevisQueryDto = {}) {
    this.assertLecture(user);
    const where: Prisma.DevisClientWhereInput = {};
    if (query.statut) where.statut = query.statut;
    if (query.clientId) where.clientId = query.clientId;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { numero: { contains: q, mode: 'insensitive' } },
        {
          client: {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { contact: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    const rows = await this.prisma.devisClient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: { id: true, nom: true, prenom: true, contact: true },
        },
        boutique: { select: { id: true, nom: true } },
        _count: { select: { lignes: true } },
      },
    });
    return rows.map((d) => ({
      ...d,
      transitions: transitionsDevisAutorisees(d.statut),
    }));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.assertLecture(user);
    const devis = await this.prisma.devisClient.findUnique({
      where: { id },
      include: {
        client: true,
        boutique: { select: { id: true, nom: true } },
        lignes: { include: { produit: true } },
      },
    });
    if (!devis) throw new NotFoundException('Devis introuvable.');
    return {
      ...devis,
      transitions: transitionsDevisAutorisees(devis.statut),
    };
  }

  async create(dto: CreateDevisDto, user: AuthenticatedUser) {
    this.assertEcriture(user);
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) throw new NotFoundException('Client introuvable.');

    const montantTotal = this.montantLignes(dto.lignes);
    const numero = await this.genererNumero();
    // Boutique : payload prioritaire, sinon boutique du rédacteur (resp. boutique).
    const boutiqueId = dto.boutiqueId ?? user.boutiqueId ?? undefined;

    const devis = await this.prisma.devisClient.create({
      data: {
        numero,
        clientId: dto.clientId,
        boutiqueId,
        notes: dto.notes,
        montantTotal,
        createdById: user.userId,
        lignes: {
          create: dto.lignes.map((l) => ({
            produitId: l.produitId,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            remise: l.remise ?? 0,
          })),
        },
      },
      include: { lignes: true, client: true },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'DEVIS_CLIENT_CREE',
      entite: 'DevisClient',
      entiteId: devis.id,
      details: `${devis.numero} · ${montantTotal.toFixed(2)} FCFA`,
    });

    return {
      ...devis,
      transitions: transitionsDevisAutorisees(devis.statut),
    };
  }

  async update(id: string, dto: UpdateDevisDto, user: AuthenticatedUser) {
    this.assertEcriture(user);
    const existant = await this.prisma.devisClient.findUnique({
      where: { id },
    });
    if (!existant) throw new NotFoundException('Devis introuvable.');
    if (existant.statut !== 'BROUILLON') {
      throw new BadRequestException(
        'Seul un devis en brouillon peut être modifié.',
      );
    }

    const lignes = dto.lignes;
    const montantTotal = lignes
      ? this.montantLignes(lignes)
      : existant.montantTotal;

    const devis = await this.prisma.$transaction(async (tx) => {
      if (lignes) {
        await tx.ligneDevisClient.deleteMany({ where: { devisId: id } });
        await tx.ligneDevisClient.createMany({
          data: lignes.map((l) => ({
            devisId: id,
            produitId: l.produitId,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            remise: l.remise ?? 0,
          })),
        });
      }
      return tx.devisClient.update({
        where: { id },
        data: {
          notes: dto.notes ?? existant.notes,
          montantTotal,
        },
        include: { lignes: true, client: true },
      });
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'DEVIS_CLIENT_MODIFIE',
      entite: 'DevisClient',
      entiteId: id,
      details: devis.numero,
    });

    return {
      ...devis,
      transitions: transitionsDevisAutorisees(devis.statut),
    };
  }

  async transition(
    id: string,
    dto: TransitionDevisDto,
    user: AuthenticatedUser,
  ) {
    this.assertEcriture(user);
    const existant = await this.prisma.devisClient.findUnique({
      where: { id },
    });
    if (!existant) throw new NotFoundException('Devis introuvable.');

    const from = existant.statut;
    const to = dto.statut as StatutDevis;
    if (!transitionDevisAutorisee(from, to)) {
      throw new BadRequestException(`Transition ${from} → ${to} interdite.`);
    }
    if (to === 'TRANSFORME' && dto.venteId) {
      const vente = await this.prisma.vente.findUnique({
        where: { id: dto.venteId },
      });
      if (!vente) throw new NotFoundException('Vente introuvable.');
    }

    const devis = await this.prisma.devisClient.update({
      where: { id },
      data: {
        statut: to,
        venteId: to === 'TRANSFORME' ? (dto.venteId ?? null) : existant.venteId,
      },
      include: { lignes: true, client: true },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'DEVIS_CLIENT_TRANSITION',
      entite: 'DevisClient',
      entiteId: id,
      details: `${devis.numero} · ${from} → ${to}`,
    });

    return {
      ...devis,
      transitions: transitionsDevisAutorisees(devis.statut),
    };
  }
}
