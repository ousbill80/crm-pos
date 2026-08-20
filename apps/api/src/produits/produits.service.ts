import { Injectable, NotFoundException } from '@nestjs/common';
import type { MouvementStock, Produit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
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
    private readonly stockService: StockService,
  ) {}

  async create(
    dto: CreateProduitDto,
    user: AuthenticatedUser,
  ): Promise<Produit> {
    const stockInitial = dto.stock ?? 0;
    const produit = await this.prisma.produit.create({
      data: {
        designation: dto.designation,
        prixUnitaire: dto.prixUnitaire,
        stock: 0,
        seuilReappro: dto.seuilReappro,
      },
    });

    if (stockInitial > 0) {
      const entrepot = await this.prisma.entrepot.findFirst({
        where: { type: 'PRINCIPAL', actif: true },
        orderBy: { nom: 'asc' },
      });
      if (!entrepot) {
        throw new NotFoundException(
          'Aucun entrepôt PRINCIPAL : créez une boutique/entrepôt avant de stocker.',
        );
      }
      await this.stockService.appliquerMouvement({
        produitId: produit.id,
        entrepotId: entrepot.id,
        type: 'AJUSTEMENT',
        delta: stockInitial,
        utilisateurId: user.userId,
        reference: 'STOCK_INITIAL',
      });
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'PRODUIT_CREATED',
      entite: 'Produit',
      entiteId: produit.id,
      details: JSON.stringify({ designation: produit.designation }),
    });

    return this.findOne(produit.id);
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
        seuilReappro: dto.seuilReappro,
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

  async findMouvements(id: string): Promise<MouvementStock[]> {
    await this.findOne(id);
    return this.prisma.mouvementStock.findMany({
      where: { produitId: id },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }
}
