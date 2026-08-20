import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Fournisseur, ReceptionStock } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto';
import { CreateReceptionDto } from './dto/create-reception.dto';

// Fournisseurs & réception de stock — extension au socle MCD (§6.5), portée
// validée avec l'utilisateur : fiche fournisseur simple + réception qui
// incrémente Produit.stock. Pas de bon de commande ni de facturation
// fournisseur (hors périmètre, aucun rôle "Achats" dans le cahier des
// charges §4). RBAC identique au catalogue produit — voir
// fournisseurs.controller.ts.
@Injectable()
export class FournisseursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    const reception = await this.prisma.$transaction(async (tx) => {
      // Coût moyen pondéré (CMP) : recalculé à chaque réception, cf. plan
      // de la tâche. stockAvant/cmpAvant lus dans la même transaction pour
      // rester cohérent avec des réceptions concurrentes.
      const stockAvant = produit.stock;
      const cmpAvant = new Prisma.Decimal(produit.coutMoyenPondere);
      const prixAchat = new Prisma.Decimal(dto.prixAchat);
      const stockApres = stockAvant + dto.quantite;
      const nouveauCmp = cmpAvant
        .mul(stockAvant)
        .plus(prixAchat.mul(dto.quantite))
        .div(stockApres);

      await tx.produit.update({
        where: { id: dto.produitId },
        data: {
          stock: { increment: dto.quantite },
          coutMoyenPondere: nouveauCmp,
        },
      });

      const created = await tx.receptionStock.create({
        data: {
          produitId: dto.produitId,
          fournisseurId,
          quantite: dto.quantite,
          prixAchat: dto.prixAchat,
          utilisateurId: user.userId,
        },
      });

      await tx.mouvementStock.create({
        data: {
          produitId: dto.produitId,
          type: 'RECEPTION',
          quantite: dto.quantite,
          stockApres,
          reference: created.id,
          utilisateurId: user.userId,
        },
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
      }),
    });

    return reception;
  }
}
