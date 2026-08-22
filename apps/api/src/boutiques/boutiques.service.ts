import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TypeCaisse, TypeEntrepot } from '@prisma/client';
import type { Boutique } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from './boutique-scope.util';
import {
  CompleterPosteBoutiqueDto,
  CreateBoutiqueDto,
} from './dto/create-boutique.dto';
import { UpdateBoutiqueDto } from './dto/update-boutique.dto';

type Tx = Prisma.TransactionClient;

const TIROIRS_DEFAUT = 1;
const TIROIRS_MAX = 8;

function codeTiroir(index: number): string {
  return `T${String(index).padStart(2, '0')}`;
}

async function provisionnerPoste(
  tx: Tx,
  boutique: { id: string; nom: string },
  nombreTiroirs: number,
): Promise<{ entrepot: boolean; magasin: boolean; tiroirs: string[] }> {
  const created = { entrepot: false, magasin: false, tiroirs: [] as string[] };
  const n = Math.min(TIROIRS_MAX, Math.max(TIROIRS_DEFAUT, nombreTiroirs));

  const principal = await tx.entrepot.findUnique({
    where: {
      boutiqueId_code: { boutiqueId: boutique.id, code: 'PRINCIPAL' },
    },
  });
  if (!principal) {
    await tx.entrepot.create({
      data: {
        nom: `Principal — ${boutique.nom}`,
        code: 'PRINCIPAL',
        type: TypeEntrepot.PRINCIPAL,
        boutiqueId: boutique.id,
      },
    });
    created.entrepot = true;
  }

  const magasin = await tx.caisse.findFirst({
    where: { boutiqueId: boutique.id, type: TypeCaisse.MAGASIN },
  });
  if (!magasin) {
    await tx.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId: boutique.id,
        libelle: `Caisse magasin — ${boutique.nom}`,
      },
    });
    created.magasin = true;
  }

  for (let i = 1; i <= n; i += 1) {
    const code = codeTiroir(i);
    const existant = await tx.caisse.findFirst({
      where: { boutiqueId: boutique.id, code },
    });
    if (existant) continue;
    await tx.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId: boutique.id,
        code,
        libelle: `Tiroir ${i}`,
        actif: true,
        ordreAffichage: i,
      },
    });
    created.tiroirs.push(code);
  }

  return created;
}

// Service Boutique (§3, §4, §6.2) : création = magasin + entrepôt PRINCIPAL
// + caisse MAGASIN + tiroirs POS (§6.7 sans reparamétrage lourd).
@Injectable()
export class BoutiquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<Boutique> {
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new BadRequestException(`Zone ${dto.zoneId} introuvable.`);
    }

    const nombreTiroirs = dto.nombreTiroirs ?? TIROIRS_DEFAUT;
    const boutique = await this.prisma.$transaction(async (tx) => {
      const created = await tx.boutique.create({
        data: { nom: dto.nom, adresse: dto.adresse, zoneId: dto.zoneId },
      });
      await provisionnerPoste(tx, created, nombreTiroirs);
      return created;
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BOUTIQUE_CREATED',
      entite: 'Boutique',
      entiteId: boutique.id,
      details: JSON.stringify({
        nom: boutique.nom,
        zoneId: boutique.zoneId,
        nombreTiroirs,
      }),
    });

    return boutique;
  }

  async completerPoste(
    id: string,
    dto: CompleterPosteBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<Boutique> {
    const boutique = await this.findOne(id, user);
    const nombreTiroirs = dto.nombreTiroirs ?? TIROIRS_DEFAUT;
    const created = await this.prisma.$transaction((tx) =>
      provisionnerPoste(tx, boutique, nombreTiroirs),
    );
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BOUTIQUE_POSTE_COMPLETE',
      entite: 'Boutique',
      entiteId: boutique.id,
      details: JSON.stringify({ ...created, nombreTiroirs }),
    });
    return boutique;
  }

  async completerTous(
    dto: CompleterPosteBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<{
    magasinsTraites: number;
    entrepotsCrees: number;
    caissesCreees: number;
    tiroirsCrees: number;
  }> {
    const boutiques = await this.findAll(user);
    const nombreTiroirs = dto.nombreTiroirs ?? TIROIRS_DEFAUT;
    const totaux = {
      magasinsTraites: 0,
      entrepotsCrees: 0,
      caissesCreees: 0,
      tiroirsCrees: 0,
    };

    await this.prisma.$transaction(async (tx) => {
      for (const boutique of boutiques) {
        if (!boutique.actif) continue;
        const created = await provisionnerPoste(tx, boutique, nombreTiroirs);
        if (created.entrepot || created.magasin || created.tiroirs.length > 0) {
          totaux.magasinsTraites += 1;
          if (created.entrepot) totaux.entrepotsCrees += 1;
          if (created.magasin) totaux.caissesCreees += 1;
          totaux.tiroirsCrees += created.tiroirs.length;
        }
      }
    });

    if (totaux.magasinsTraites > 0) {
      await this.audit.record({
        utilisateurId: user.userId,
        action: 'BOUTIQUE_RESEAU_COMPLETE',
        entite: 'Boutique',
        entiteId: '*',
        details: JSON.stringify({ ...totaux, nombreTiroirs }),
      });
    }

    return totaux;
  }

  async findAll(user: AuthenticatedUser): Promise<Boutique[]> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return this.prisma.boutique.findMany({ orderBy: { nom: 'asc' } });
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return this.prisma.boutique.findMany({
        where: { zoneId },
        orderBy: { nom: 'asc' },
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return this.prisma.boutique.findMany({ where: { id: boutiqueId } });
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les boutiques.`,
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Boutique> {
    const boutique = await this.prisma.boutique.findUnique({ where: { id } });
    if (!boutique) {
      throw new NotFoundException(`Boutique ${id} introuvable.`);
    }

    await this.assertBoutiqueInScope(boutique, user);
    return boutique;
  }

  async update(
    id: string,
    dto: UpdateBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<Boutique> {
    const boutique = await this.findOne(id, user);
    const updated = await this.prisma.boutique.update({
      where: { id: boutique.id },
      data: dto,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BOUTIQUE_UPDATED',
      entite: 'Boutique',
      entiteId: updated.id,
      details: JSON.stringify(dto),
    });
    return updated;
  }

  private async assertBoutiqueInScope(
    boutique: Boutique,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return;
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const scopedZoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        user,
      );
      if (scopedZoneId !== boutique.zoneId) {
        throw new ForbiddenException(
          "Cette boutique n'appartient pas au périmètre de supervision de l'utilisateur.",
        );
      }
      return;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      if (boutiqueId !== boutique.id) {
        throw new ForbiddenException(
          "Cette boutique n'est pas la boutique de rattachement de l'utilisateur.",
        );
      }
      return;
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les boutiques.`,
    );
  }
}
