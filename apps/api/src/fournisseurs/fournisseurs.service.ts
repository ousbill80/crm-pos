import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Fournisseur, ReceptionStock } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
import type { AuthenticatedUser } from '../auth/types';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto';
import { CreateReceptionDto } from './dto/create-reception.dto';

@Injectable()
export class FournisseursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stockService: StockService,
  ) {}

  async create(
    dto: CreateFournisseurDto,
    user: AuthenticatedUser,
  ): Promise<Fournisseur> {
    const fournisseur = await this.prisma.fournisseur.create({
      data: { nom: dto.nom, contact: dto.contact },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FOURNISSEUR_CREATED',
      entite: 'Fournisseur',
      entiteId: fournisseur.id,
      details: JSON.stringify({ nom: fournisseur.nom }),
    });

    return fournisseur;
  }

  findAll(): Promise<Fournisseur[]> {
    return this.prisma.fournisseur.findMany({ orderBy: { nom: 'asc' } });
  }

  async findOne(
    id: string,
  ): Promise<Fournisseur & { receptions: ReceptionStock[] }> {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id },
      include: { receptions: { include: { produit: true } } },
    });
    if (!fournisseur) {
      throw new NotFoundException(`Fournisseur ${id} introuvable.`);
    }
    return fournisseur;
  }

  async creerReception(
    fournisseurId: string,
    dto: CreateReceptionDto,
    user: AuthenticatedUser,
  ): Promise<ReceptionStock> {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: fournisseurId },
    });
    if (!fournisseur) {
      throw new NotFoundException(`Fournisseur ${fournisseurId} introuvable.`);
    }

    const produit = await this.prisma.produit.findUnique({
      where: { id: dto.produitId },
    });
    if (!produit) {
      throw new NotFoundException(`Produit ${dto.produitId} introuvable.`);
    }

    const entrepotId = await this.resolveEntrepotReception(dto.entrepotId, user);

    const reception = await this.prisma.$transaction(async (tx) => {
      // CMP réseau : basé sur le cache Produit.stock (somme des quants).
      const stockAvant = produit.stock;
      const cmpAvant = new Prisma.Decimal(produit.coutMoyenPondere);
      const prixAchat = new Prisma.Decimal(dto.prixAchat);
      const stockApresReseau = stockAvant + dto.quantite;
      const nouveauCmp =
        stockApresReseau === 0
          ? new Prisma.Decimal(0)
          : cmpAvant
              .mul(stockAvant)
              .plus(prixAchat.mul(dto.quantite))
              .div(stockApresReseau);

      const created = await tx.receptionStock.create({
        data: {
          produitId: dto.produitId,
          fournisseurId,
          quantite: dto.quantite,
          prixAchat: dto.prixAchat,
          utilisateurId: user.userId,
        },
      });

      await this.stockService.appliquerMouvement(
        {
          produitId: dto.produitId,
          entrepotId,
          type: 'RECEPTION',
          delta: dto.quantite,
          utilisateurId: user.userId,
          reference: created.id,
        },
        tx,
      );

      await tx.produit.update({
        where: { id: dto.produitId },
        data: { coutMoyenPondere: nouveauCmp },
      });

      return created;
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'RECEPTION_STOCK_CREATED',
      entite: 'ReceptionStock',
      entiteId: reception.id,
      details: JSON.stringify({
        fournisseurId,
        produitId: dto.produitId,
        quantite: dto.quantite,
        prixAchat: dto.prixAchat,
        entrepotId,
      }),
    });

    return reception;
  }

  private async resolveEntrepotReception(
    entrepotId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<string> {
    if (entrepotId) {
      const e = await this.prisma.entrepot.findUnique({ where: { id: entrepotId } });
      if (!e || !e.actif) {
        throw new BadRequestException(`Entrepôt ${entrepotId} introuvable ou inactif.`);
      }
      return e.id;
    }
    if (user.boutiqueId) {
      return this.stockService.trouverEntrepotPrincipalBoutique(user.boutiqueId);
    }
    const premier = await this.prisma.entrepot.findFirst({
      where: { type: 'PRINCIPAL', actif: true },
      orderBy: { nom: 'asc' },
    });
    if (!premier) {
      throw new BadRequestException(
        'Aucun entrepôt PRINCIPAL : configurez Entreprise / Stocks avant réception.',
      );
    }
    return premier.id;
  }
}
