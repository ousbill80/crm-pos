import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopAvisService {
  constructor(private readonly prisma: PrismaService) {}

  async getByToken(token: string) {
    const avis = await this.prisma.avisCommandeWeb.findUnique({
      where: { token },
      include: {
        commande: {
          select: {
            id: true,
            statut: true,
            montantTotal: true,
            modeFulfillment: true,
          },
        },
      },
    });
    if (!avis) throw new NotFoundException('Avis introuvable.');
    return {
      token: avis.token,
      note: avis.note,
      commentaire: avis.commentaire,
      soumisAt: avis.soumisAt,
      dejaSoumis: avis.soumisAt != null,
      commande: {
        id: avis.commande.id,
        reference: avis.commande.id.slice(0, 8).toUpperCase(),
        statut: avis.commande.statut,
        montantTotal: Number(avis.commande.montantTotal),
        modeFulfillment: avis.commande.modeFulfillment,
      },
    };
  }

  async soumettre(token: string, dto: { note: number; commentaire?: string }) {
    if (!Number.isInteger(dto.note) || dto.note < 1 || dto.note > 5) {
      throw new BadRequestException('La note doit être un entier de 1 à 5.');
    }
    const avis = await this.prisma.avisCommandeWeb.findUnique({
      where: { token },
    });
    if (!avis) throw new NotFoundException('Avis introuvable.');
    if (avis.soumisAt) {
      throw new BadRequestException('Avis déjà soumis.');
    }
    return this.prisma.avisCommandeWeb.update({
      where: { id: avis.id },
      data: {
        note: dto.note,
        commentaire: dto.commentaire?.trim() || null,
        soumisAt: new Date(),
      },
    });
  }
}
