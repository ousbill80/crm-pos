import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RoleLibelle, StatutCommandeAchat } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stocks/stock.service';
import type { AuthenticatedUser } from '../auth/types';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto';
import { UpdateFournisseurDto } from './dto/update-fournisseur.dto';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { AchatsStateMachineService } from './achats-state-machine.service';

const INCLUDE_RECEPTION = {
  produit: {
    select: {
      id: true,
      designation: true,
      reference: true,
      coutMoyenPondere: true,
    },
  },
  entrepot: { select: { id: true, nom: true, code: true } },
  utilisateur: { select: { id: true, nom: true, prenom: true } },
  fournisseur: { select: { id: true, nom: true } },
  commande: { select: { id: true, numero: true } },
  ligneCommande: { select: { id: true, commandeId: true, quantite: true } },
} as const;

type ReceptionAvecLiens = Prisma.ReceptionStockGetPayload<{
  include: typeof INCLUDE_RECEPTION;
}>;

@Injectable()
export class FournisseursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stockService: StockService,
    private readonly achatsMachine: AchatsStateMachineService,
  ) {}

  async create(dto: CreateFournisseurDto, user: AuthenticatedUser) {
    await this.assertNomUnique(dto.nom);
    const fournisseur = await this.prisma.fournisseur.create({
      data: {
        nom: dto.nom.trim(),
        contact: dto.contact,
        telephone: dto.telephone,
        email: dto.email,
        adresse: dto.adresse,
        notes: dto.notes,
      },
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

  async update(id: string, dto: UpdateFournisseurDto, user: AuthenticatedUser) {
    const existant = await this.prisma.fournisseur.findUnique({
      where: { id },
    });
    if (!existant) {
      throw new NotFoundException(`Fournisseur ${id} introuvable.`);
    }
    if (dto.nom) {
      await this.assertNomUnique(dto.nom, id);
    }

    const fournisseur = await this.prisma.fournisseur.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined ? { nom: dto.nom.trim() } : {}),
        ...(dto.contact !== undefined ? { contact: dto.contact } : {}),
        ...(dto.telephone !== undefined ? { telephone: dto.telephone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.adresse !== undefined ? { adresse: dto.adresse } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'FOURNISSEUR_UPDATED',
      entite: 'Fournisseur',
      entiteId: fournisseur.id,
      details: JSON.stringify(dto),
    });

    return fournisseur;
  }

  async findAll() {
    const [fournisseurs, receptions] = await Promise.all([
      this.prisma.fournisseur.findMany({ orderBy: { nom: 'asc' } }),
      this.prisma.receptionStock.findMany({
        select: {
          fournisseurId: true,
          produitId: true,
          quantite: true,
          prixAchat: true,
          dateReception: true,
        },
      }),
    ]);
    const stats = this.aggregerParFournisseur(receptions);
    return fournisseurs.map((f) => ({
      ...f,
      ...(stats.get(f.id) ?? this.statsVides()),
    }));
  }

  async findOne(id: string) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id },
      include: {
        receptions: {
          include: INCLUDE_RECEPTION,
          orderBy: { dateReception: 'desc' },
        },
      },
    });
    if (!fournisseur) {
      throw new NotFoundException(`Fournisseur ${id} introuvable.`);
    }

    const stats = this.aggregerParFournisseur(
      fournisseur.receptions.map((r) => ({
        fournisseurId: r.fournisseurId,
        produitId: r.produitId,
        quantite: r.quantite,
        prixAchat: r.prixAchat,
        dateReception: r.dateReception,
      })),
    );

    return {
      ...fournisseur,
      ...(stats.get(id) ?? this.statsVides()),
      receptions: fournisseur.receptions.map((r) =>
        this.serialiserReception(r),
      ),
      produits: this.aggregerParProduit(fournisseur.receptions),
    };
  }

  async synthese() {
    const depuis30j = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      fournisseurs,
      receptions,
      receptions30j,
      commandesOuvertes,
      facturesOuvertes,
    ] = await Promise.all([
      this.findAll(),
      this.prisma.receptionStock.findMany({
        include: INCLUDE_RECEPTION,
        orderBy: { dateReception: 'desc' },
      }),
      this.prisma.receptionStock.findMany({
        where: { dateReception: { gte: depuis30j } },
        select: { quantite: true, prixAchat: true },
      }),
      this.prisma.commandeAchat.findMany({
        where: {
          statut: {
            in: [
              StatutCommandeAchat.CONFIRMEE,
              StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE,
            ],
          },
        },
        include: {
          lignes: { include: { receptions: { select: { quantite: true } } } },
        },
      }),
      this.prisma.factureFournisseur.findMany({
        where: {
          statut: { in: ['COMPTABILISEE', 'PARTIELLEMENT_PAYEE'] },
        },
        include: { paiements: true },
      }),
    ]);

    let unites30j = 0;
    let montant30j = new Prisma.Decimal(0);
    for (const r of receptions30j) {
      unites30j += r.quantite;
      montant30j = montant30j.plus(r.prixAchat.mul(r.quantite));
    }

    let unitesARecevoir = 0;
    for (const c of commandesOuvertes) {
      for (const l of c.lignes) {
        const recu = l.receptions.reduce((s, r) => s + r.quantite, 0);
        unitesARecevoir += Math.max(0, l.quantite - recu);
      }
    }
    let encours = new Prisma.Decimal(0);
    for (const f of facturesOuvertes) {
      const paye = f.paiements.reduce(
        (s, p) => s.plus(p.montant),
        new Prisma.Decimal(0),
      );
      encours = encours.plus(f.montant.minus(paye));
    }

    return {
      genereAt: new Date().toISOString(),
      kpis: {
        fournisseurs: fournisseurs.length,
        actifs: fournisseurs.filter((f) => f.actif).length,
        jamaisLivres: fournisseurs.filter((f) => f.nombreReceptions === 0)
          .length,
        receptions30j: receptions30j.length,
        unites30j,
        montant30j: montant30j.toFixed(2),
        commandesOuvertes: commandesOuvertes.length,
        unitesARecevoir,
        facturesImpayees: facturesOuvertes.length,
        encours: encours.toFixed(2),
      },
      haussesPrix: this.detecterHaussesPrix(receptions),
      receptionsRecentes: receptions
        .slice(0, 40)
        .map((r) => this.serialiserReception(r)),
      fournisseurs,
    };
  }

  async creerReception(
    fournisseurId: string,
    dto: CreateReceptionDto,
    user: AuthenticatedUser,
  ) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: fournisseurId },
    });
    if (!fournisseur) {
      throw new NotFoundException(`Fournisseur ${fournisseurId} introuvable.`);
    }
    if (!fournisseur.actif) {
      throw new BadRequestException(
        'Ce fournisseur est inactif : réactivez-le avant d’enregistrer une réception.',
      );
    }

    const produit = await this.prisma.produit.findUnique({
      where: { id: dto.produitId },
    });
    if (!produit) {
      throw new NotFoundException(`Produit ${dto.produitId} introuvable.`);
    }
    if (!produit.actif) {
      throw new BadRequestException(
        'Produit inactif : impossible d’enregistrer une réception sur cet article.',
      );
    }

    const reference = dto.reference?.trim() || null;

    let commandeId: string | null = null;
    let ligneCommandeId: string | null = null;
    let produitId = dto.produitId;
    let prixAchatNum = dto.prixAchat;
    let commandeBoutiqueId: string | null | undefined;

    if (dto.ligneCommandeId) {
      const ligne = await this.prisma.ligneCommandeAchat.findUnique({
        where: { id: dto.ligneCommandeId },
        include: { commande: true, receptions: { select: { quantite: true } } },
      });
      if (!ligne) {
        throw new NotFoundException(
          `Ligne de commande ${dto.ligneCommandeId} introuvable.`,
        );
      }
      if (ligne.commande.fournisseurId !== fournisseurId) {
        throw new BadRequestException(
          'Cette ligne n’appartient pas au fournisseur de la réception.',
        );
      }
      if (dto.produitId && dto.produitId !== ligne.produitId) {
        throw new BadRequestException(
          'Le produit ne correspond pas à la ligne de commande.',
        );
      }
      const ouverts = ['CONFIRMEE', 'PARTIELLEMENT_RECEPTIONNEE'] as const;
      if (
        !ouverts.includes(ligne.commande.statut as (typeof ouverts)[number])
      ) {
        throw new BadRequestException(
          `Réception impossible : commande ${ligne.commande.numero} en statut ${ligne.commande.statut}.`,
        );
      }
      const dejaRecu = ligne.receptions.reduce((s, r) => s + r.quantite, 0);
      const reste = ligne.quantite - dejaRecu;
      if (dto.quantite > reste) {
        throw new BadRequestException(
          `Quantité supérieure au reste à réceptionner (${reste} sur ${ligne.produitId}).`,
        );
      }
      produitId = ligne.produitId;
      commandeId = ligne.commandeId;
      ligneCommandeId = ligne.id;
      commandeBoutiqueId = ligne.commande.boutiqueId;
      if (prixAchatNum === undefined || prixAchatNum === null) {
        prixAchatNum = ligne.prixUnitaire.toNumber();
      }
    }

    const entrepotId = await this.resolveEntrepotReception(
      dto.entrepotId,
      user,
      {
        hasCommande: Boolean(ligneCommandeId),
        commandeBoutiqueId,
      },
    );

    const produitCible =
      produitId !== dto.produitId
        ? await this.prisma.produit.findUnique({ where: { id: produitId } })
        : produit;
    if (!produitCible) {
      throw new NotFoundException(`Produit ${produitId} introuvable.`);
    }
    if (!produitCible.actif) {
      throw new BadRequestException(
        'Produit inactif : impossible d’enregistrer une réception sur cet article.',
      );
    }

    const reception = await this.prisma.$transaction(async (tx) => {
      const dest = await tx.entrepot.findUniqueOrThrow({
        where: { id: entrepotId },
      });
      const autoFait = dest.usage === 'STOCK' && !dest.virtuel;

      const created = await tx.receptionStock.create({
        data: {
          produitId,
          fournisseurId,
          quantite: dto.quantite,
          prixAchat: prixAchatNum,
          utilisateurId: user.userId,
          entrepotId,
          reference,
          commandeId,
          ligneCommandeId,
        },
        include: INCLUDE_RECEPTION,
      });

      await tx.bonStock.create({
        data: {
          numero: `IN-${Date.now().toString(36).toUpperCase()}`,
          type: 'RECEPTION',
          statut: autoFait ? 'FAIT' : 'BROUILLON',
          entrepotDestId: dest.id,
          receptionId: created.id,
          initiateurId: user.userId,
          datePret: autoFait ? new Date() : null,
          dateFait: autoFait ? new Date() : null,
          lignes: {
            create: { produitId, quantite: dto.quantite },
          },
        },
      });

      if (autoFait) {
        const stockAvant = produitCible.stock;
        const cmpAvant = new Prisma.Decimal(produitCible.coutMoyenPondere);
        const prixAchat = new Prisma.Decimal(prixAchatNum);
        const stockApresReseau = stockAvant + dto.quantite;
        const nouveauCmp =
          stockApresReseau === 0
            ? new Prisma.Decimal(0)
            : cmpAvant
                .mul(stockAvant)
                .plus(prixAchat.mul(dto.quantite))
                .div(stockApresReseau);

        await this.stockService.appliquerMouvement(
          {
            produitId,
            entrepotId,
            type: 'RECEPTION',
            delta: dto.quantite,
            utilisateurId: user.userId,
            reference: created.id,
          },
          tx,
        );

        await tx.produit.update({
          where: { id: produitId },
          data: { coutMoyenPondere: nouveauCmp },
        });
      }

      if (commandeId) {
        await this.mettreAJourStatutCommande(commandeId, tx);
      }

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
        reference,
      }),
    });

    return this.serialiserReception(reception);
  }

  private async assertNomUnique(nom: string, exclureId?: string) {
    const existant = await this.prisma.fournisseur.findFirst({
      where: {
        nom: { equals: nom.trim(), mode: 'insensitive' },
        ...(exclureId ? { id: { not: exclureId } } : {}),
      },
    });
    if (existant) {
      throw new BadRequestException(
        `Un fournisseur nommé « ${existant.nom} » existe déjà.`,
      );
    }
  }

  private async resolveEntrepotReception(
    entrepotId: string | undefined,
    user: AuthenticatedUser,
    options?: {
      hasCommande?: boolean;
      commandeBoutiqueId?: string | null;
    },
  ): Promise<string> {
    // Commande groupe (boutiqueId null) : quai ENTREE hub uniquement — pas de
    // fallback PRINCIPAL boutique (§ Achats mutualisés / hub réseau).
    const commandeGroupe =
      options?.hasCommande === true && options.commandeBoutiqueId === null;

    if (commandeGroupe) {
      const quai = await this.prisma.entrepot.findFirst({
        where: { reseau: true, usage: 'ENTREE', actif: true },
      });
      if (!quai) {
        throw new BadRequestException(
          'Commande groupe : aucun quai ENTREE réseau. Semez l’entrepôt central (WH-CENTRAL).',
        );
      }
      if (entrepotId && entrepotId !== quai.id) {
        throw new BadRequestException(
          'Commande groupe : la réception doit cibler le quai ENTREE du hub réseau.',
        );
      }
      return quai.id;
    }

    if (entrepotId) {
      const e = await this.prisma.entrepot.findUnique({
        where: { id: entrepotId },
      });
      if (!e || !e.actif) {
        throw new BadRequestException(
          `Entrepôt ${entrepotId} introuvable ou inactif.`,
        );
      }
      if (e.usage !== 'STOCK' && e.usage !== 'ENTREE') {
        throw new BadRequestException(
          'Réception fournisseur : destination STOCK ou ENTREE uniquement.',
        );
      }
      this.assertEntrepotPerimetre(e.boutiqueId, user);
      return e.id;
    }

    if (options?.commandeBoutiqueId) {
      return this.stockService.trouverEntrepotPrincipalBoutique(
        options.commandeBoutiqueId,
      );
    }

    const quai = await this.prisma.entrepot.findFirst({
      where: { reseau: true, usage: 'ENTREE', actif: true },
    });
    if (quai) return quai.id;
    if (user.boutiqueId) {
      return this.stockService.trouverEntrepotPrincipalBoutique(
        user.boutiqueId,
      );
    }
    const premier = await this.prisma.entrepot.findFirst({
      where: { type: 'PRINCIPAL', actif: true, usage: 'STOCK' },
      orderBy: { nom: 'asc' },
    });
    if (!premier) {
      throw new BadRequestException(
        'Aucun entrepôt PRINCIPAL : configurez Entreprise / Stocks avant réception.',
      );
    }
    return premier.id;
  }

  private assertEntrepotPerimetre(boutiqueId: string, user: AuthenticatedUser) {
    if (user.role !== RoleLibelle.RESPONSABLE_BOUTIQUE) return;
    if (!user.boutiqueId || user.boutiqueId !== boutiqueId) {
      throw new ForbiddenException(
        'Réception hors périmètre : cet entrepôt n’appartient pas à votre boutique.',
      );
    }
  }

  private statsVides() {
    return {
      nombreReceptions: 0,
      unitesRecues: 0,
      montantCumule: '0.00',
      derniereReceptionAt: null as string | null,
      produitsDistincts: 0,
    };
  }

  private aggregerParFournisseur(
    receptions: Array<{
      fournisseurId: string;
      produitId: string;
      quantite: number;
      prixAchat: Prisma.Decimal;
      dateReception: Date;
    }>,
  ) {
    const map = new Map<
      string,
      {
        nombreReceptions: number;
        unitesRecues: number;
        montant: Prisma.Decimal;
        derniere: Date | null;
        produits: Set<string>;
      }
    >();
    for (const r of receptions) {
      const acc = map.get(r.fournisseurId) ?? {
        nombreReceptions: 0,
        unitesRecues: 0,
        montant: new Prisma.Decimal(0),
        derniere: null as Date | null,
        produits: new Set<string>(),
      };
      acc.nombreReceptions += 1;
      acc.unitesRecues += r.quantite;
      acc.montant = acc.montant.plus(r.prixAchat.mul(r.quantite));
      acc.produits.add(r.produitId);
      if (!acc.derniere || r.dateReception > acc.derniere) {
        acc.derniere = r.dateReception;
      }
      map.set(r.fournisseurId, acc);
    }
    const out = new Map<
      string,
      ReturnType<FournisseursService['statsVides']>
    >();
    for (const [id, acc] of map) {
      out.set(id, {
        nombreReceptions: acc.nombreReceptions,
        unitesRecues: acc.unitesRecues,
        montantCumule: acc.montant.toFixed(2),
        derniereReceptionAt: acc.derniere?.toISOString() ?? null,
        produitsDistincts: acc.produits.size,
      });
    }
    return out;
  }

  private aggregerParProduit(receptions: ReceptionAvecLiens[]) {
    const map = new Map<
      string,
      {
        produitId: string;
        designation: string;
        reference: string | null;
        unites: number;
        montant: Prisma.Decimal;
        dernierPrix: Prisma.Decimal;
        prixPrecedent: Prisma.Decimal | null;
        derniereReceptionAt: Date;
      }
    >();
    const tries = [...receptions].sort(
      (a, b) => b.dateReception.getTime() - a.dateReception.getTime(),
    );
    for (const r of tries) {
      const acc = map.get(r.produitId);
      if (!acc) {
        map.set(r.produitId, {
          produitId: r.produitId,
          designation: r.produit.designation,
          reference: r.produit.reference,
          unites: r.quantite,
          montant: r.prixAchat.mul(r.quantite),
          dernierPrix: r.prixAchat,
          prixPrecedent: null,
          derniereReceptionAt: r.dateReception,
        });
      } else {
        acc.unites += r.quantite;
        acc.montant = acc.montant.plus(r.prixAchat.mul(r.quantite));
        if (acc.prixPrecedent === null) {
          acc.prixPrecedent = r.prixAchat;
        }
      }
    }
    return [...map.values()].map((p) => {
      const variationPct =
        p.prixPrecedent && p.prixPrecedent.gt(0)
          ? p.dernierPrix
              .minus(p.prixPrecedent)
              .div(p.prixPrecedent)
              .mul(100)
              .toFixed(1)
          : null;
      return {
        produitId: p.produitId,
        designation: p.designation,
        reference: p.reference,
        unites: p.unites,
        montant: p.montant.toFixed(2),
        dernierPrix: p.dernierPrix.toFixed(2),
        prixPrecedent: p.prixPrecedent?.toFixed(2) ?? null,
        variationPct,
        derniereReceptionAt: p.derniereReceptionAt.toISOString(),
      };
    });
  }

  private detecterHaussesPrix(receptions: ReceptionAvecLiens[]) {
    const parCle = new Map<string, ReceptionAvecLiens[]>();
    for (const r of receptions) {
      const cle = `${r.fournisseurId}:${r.produitId}`;
      const liste = parCle.get(cle) ?? [];
      liste.push(r);
      parCle.set(cle, liste);
    }
    const hausses: Array<{
      fournisseurId: string;
      fournisseurNom: string;
      produitId: string;
      designation: string;
      prixPrecedent: string;
      prixActuel: string;
      variationPct: string;
    }> = [];
    for (const liste of parCle.values()) {
      const triee = [...liste].sort(
        (a, b) => b.dateReception.getTime() - a.dateReception.getTime(),
      );
      if (triee.length < 2) continue;
      const actuel = triee[0];
      const precedent = triee[1];
      if (actuel.prixAchat.lte(precedent.prixAchat)) continue;
      if (precedent.prixAchat.lte(0)) continue;
      const variation = actuel.prixAchat
        .minus(precedent.prixAchat)
        .div(precedent.prixAchat)
        .mul(100);
      hausses.push({
        fournisseurId: actuel.fournisseurId,
        fournisseurNom: actuel.fournisseur.nom,
        produitId: actuel.produitId,
        designation: actuel.produit.designation,
        prixPrecedent: precedent.prixAchat.toFixed(2),
        prixActuel: actuel.prixAchat.toFixed(2),
        variationPct: variation.toFixed(1),
      });
    }

    return hausses.sort(
      (a, b) => Number(b.variationPct) - Number(a.variationPct),
    );
  }

  private async mettreAJourStatutCommande(
    commandeId: string,
    tx: Prisma.TransactionClient,
  ) {
    const commande = await tx.commandeAchat.findUniqueOrThrow({
      where: { id: commandeId },
      include: {
        lignes: { include: { receptions: { select: { quantite: true } } } },
      },
    });
    if (
      commande.statut === StatutCommandeAchat.ANNULEE ||
      commande.statut === StatutCommandeAchat.BROUILLON ||
      commande.statut === StatutCommandeAchat.CLOTUREE
    ) {
      return;
    }
    const lignes = commande.lignes.map((l) => ({
      commandee: l.quantite,
      recue: l.receptions.reduce((s, r) => s + r.quantite, 0),
    }));
    const toutesRecues = lignes.every((l) => l.recue >= l.commandee);
    const aucune = lignes.every((l) => l.recue === 0);
    const cible = toutesRecues
      ? StatutCommandeAchat.RECEPTIONNEE
      : aucune
        ? StatutCommandeAchat.CONFIRMEE
        : StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE;
    if (cible === commande.statut) return;
    this.achatsMachine.assertCommande(commande.statut, cible);
    await tx.commandeAchat.update({
      where: { id: commandeId },
      data: { statut: cible },
    });
  }

  private serialiserReception(r: ReceptionAvecLiens) {
    return {
      id: r.id,
      produitId: r.produitId,
      fournisseurId: r.fournisseurId,
      quantite: r.quantite,
      prixAchat: r.prixAchat.toFixed(2),
      montant: r.prixAchat.mul(r.quantite).toFixed(2),
      dateReception: r.dateReception.toISOString(),
      utilisateurId: r.utilisateurId,
      entrepotId: r.entrepotId,
      reference: r.reference,
      produit: r.produit,
      entrepot: r.entrepot,
      utilisateur: r.utilisateur,
      fournisseur: r.fournisseur,
      commande: r.commande,
      ligneCommandeId: r.ligneCommandeId,
    };
  }
}
