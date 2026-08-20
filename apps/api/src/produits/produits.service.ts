import { Injectable, NotFoundException } from '@nestjs/common';
import type { Produit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { CreateProduitDto } from './dto/create-produit.dto';
import { UpdateProduitDto } from './dto/update-produit.dto';

// Catalogue produit du POS (§6.3.2). Aucun périmètre boutique : le
// catalogue est réseau entier (paramétrage d'administration système, comme
// zones/boutiques — voir access-scope.constants.ts).
@Injectable()
export class ProduitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateProduitDto,
    user: AuthenticatedUser,
  ): Promise<Produit> {
    const produit = await this.prisma.produit.create({
      data: {
        designation: dto.designation,
        prixUnitaire: dto.prixUnitaire,
        stock: dto.stock,
      },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_CREATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify({ designation: produit.designation }),
    });

    return produit;
  }

  findAll(): Promise<Produit[]> {
    return this.prisma.produit.findMany({ orderBy: { designation: 'asc' } });
  }

  async findOne(id: string): Promise<Produit> {
    const produit = await this.prisma.produit.findUnique({ where: { id } });
    if (!produit) {
      throw new NotFoundException(`Produit ${id} introuvable.`);
    }
    return produit;
  }

  async update(
    id: string,
    dto: UpdateProduitDto,
    user: AuthenticatedUser,
  ): Promise<Produit> {
    await this.findOne(id);

    const produit = await this.prisma.produit.update({
      where: { id },
      data: {
        designation: dto.designation,
        prixUnitaire: dto.prixUnitaire,
        stock: dto.stock,
      },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_UPDATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify(dto),
    });

    return produit;
  }
}
