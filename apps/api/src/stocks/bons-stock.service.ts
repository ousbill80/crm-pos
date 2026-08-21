import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RoleLibelle,
  StatutBonStock,
  TypeOperationStock,
} from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { StockService } from './stock.service';
import { BonStockStateMachineService } from './bon-stock-state-machine.service';
import {
  CreateBonStockDto,
  CreateCoutLogistiqueDto,
  CreateLotDto,
  CreateRegleReapproDto,
} from './dto/create-bon-stock.dto';

const INCLUDE_BON = {
  entrepotSource: {
    select: {
      id: true,
      nom: true,
      code: true,
      usage: true,
      reseau: true,
      boutiqueId: true,
    },
  },
  entrepotDest: {
    select: {
      id: true,
      nom: true,
      code: true,
      usage: true,
      reseau: true,
      boutiqueId: true,
    },
  },
  initiateur: { select: { id: true, nom: true, prenom: true } },
  lignes: {
    include: {
      produit: {
        select: {
          id: true,
          designation: true,
          reference: true,
          codeBarres: true,
        },
      },
      lot: true,
    },
  },
} as const;

type BonCharge = Prisma.BonStockGetPayload<{ include: typeof INCLUDE_BON }>;

@Injectable()
export class BonsStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stocks: StockService,
    private readonly machine: BonStockStateMachineService,
  ) {}

  async listerEmplacements() {
    return this.prisma.entrepot.findMany({
      where: { actif: true },
      include: { boutique: { select: { id: true, nom: true } } },
      orderBy: [{ reseau: 'desc' }, { usage: 'asc' }, { nom: 'asc' }],
    });
  }

  async creer(dto: CreateBonStockDto, user: AuthenticatedUser) {
    this.assertLignes(dto);
    await this.assertEntrepots(dto);
    const bon = await this.prisma.bonStock.create({
      data: {
        numero: this.numero(dto.type),
        type: dto.type,
        entrepotSourceId: dto.entrepotSourceId,
        entrepotDestId: dto.entrepotDestId,
        notes: dto.notes?.trim() || null,
        initiateurId: user.userId,
        lignes: {
          create: dto.lignes.map((l) => ({
            produitId: l.produitId,
            quantite: l.quantite,
            quantiteOk: l.quantiteOk,
            quantiteRebut: l.quantiteRebut,
            numeroLot: l.numeroLot?.trim() || null,
            dateExpiration: l.dateExpiration
              ? new Date(l.dateExpiration)
              : null,
          })),
        },
      },
      include: INCLUDE_BON,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BON_STOCK_CREATED',
      entite: 'BonStock',
      entiteId: bon.id,
      details: JSON.stringify({ numero: bon.numero, type: bon.type }),
    });
    return this.serialiser(bon);
  }

  async lister(user: AuthenticatedUser) {
    const bons = await this.prisma.bonStock.findMany({
      where: this.scopeWhere(user),
      include: INCLUDE_BON,
      orderBy: { dateCreation: 'desc' },
    });
    return bons.map((b) => this.serialiser(b));
  }

  async detail(id: string, user: AuthenticatedUser) {
    const bon = await this.charger(id);
    this.assertLecture(bon, user);
    return this.serialiser(bon);
  }

  async pret(id: string, user: AuthenticatedUser) {
    const bon = await this.charger(id);
    this.assertPilote(user);
    this.machine.assert(bon.statut, StatutBonStock.PRET);
    const updated = await this.prisma.bonStock.update({
      where: { id },
      data: { statut: StatutBonStock.PRET, datePret: new Date() },
      include: INCLUDE_BON,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BON_STOCK_PRET',
      entite: 'BonStock',
      entiteId: id,
    });
    return this.serialiser(updated);
  }

  async annuler(id: string, user: AuthenticatedUser) {
    const bon = await this.charger(id);
    this.assertPiloteOuDest(bon, user);
    this.machine.assert(bon.statut, StatutBonStock.ANNULE);
    const updated = await this.prisma.bonStock.update({
      where: { id },
      data: { statut: StatutBonStock.ANNULE },
      include: INCLUDE_BON,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BON_STOCK_ANNULE',
      entite: 'BonStock',
      entiteId: id,
    });
    return this.serialiser(updated);
  }

  async valider(id: string, user: AuthenticatedUser) {
    const bon = await this.charger(id);
    this.assertFait(bon, user);
    this.machine.assert(bon.statut, StatutBonStock.FAIT);
    if (bon.lignes.length === 0) {
      throw new BadRequestException('Bon sans ligne : impossible de valider.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const ligne of bon.lignes) {
        const lot = await this.resoudreLot(tx, ligne, user.userId);
        if (bon.type === TypeOperationStock.RECEPTION) {
          await this.executerReception(tx, bon, ligne, lot?.id, user.userId);
        } else if (bon.type === TypeOperationStock.TRANSFERT_INTERNE) {
          await this.executerTransfert(tx, bon, ligne, lot?.id, user.userId);
        } else if (bon.type === TypeOperationStock.REBUT) {
          await this.executerRebut(tx, bon, ligne, lot?.id, user.userId);
        } else if (bon.type === TypeOperationStock.LIVRAISON) {
          await this.executerLivraison(tx, bon, ligne, lot?.id, user.userId);
        }
      }
      await tx.bonStock.update({
        where: { id },
        data: { statut: StatutBonStock.FAIT, dateFait: new Date() },
      });
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BON_STOCK_FAIT',
      entite: 'BonStock',
      entiteId: id,
    });
    return this.detail(id, user);
  }

  async creerDepuisReception(params: {
    receptionId: string;
    produitId: string;
    quantite: number;
    entrepotDestId: string;
    utilisateurId: string;
    autoFait: boolean;
  }) {
    const dest = await this.prisma.entrepot.findUniqueOrThrow({
      where: { id: params.entrepotDestId },
    });
    const bon = await this.prisma.bonStock.create({
      data: {
        numero: this.numero(TypeOperationStock.RECEPTION),
        type: TypeOperationStock.RECEPTION,
        statut: params.autoFait
          ? StatutBonStock.FAIT
          : StatutBonStock.BROUILLON,
        entrepotDestId: dest.id,
        receptionId: params.receptionId,
        initiateurId: params.utilisateurId,
        datePret: params.autoFait ? new Date() : null,
        dateFait: params.autoFait ? new Date() : null,
        lignes: {
          create: {
            produitId: params.produitId,
            quantite: params.quantite,
          },
        },
      },
    });
    return bon;
  }

  async listerRegles() {
    return this.prisma.regleReappro.findMany({
      include: {
        produit: { select: { id: true, designation: true, reference: true } },
        entrepot: {
          select: { id: true, nom: true, code: true, boutiqueId: true },
        },
      },
      orderBy: { produit: { designation: 'asc' } },
    });
  }

  async upsertRegle(dto: CreateRegleReapproDto, user: AuthenticatedUser) {
    if (dto.max < dto.min) {
      throw new BadRequestException('Le max de réappro doit être ≥ au min.');
    }
    const regle = await this.prisma.regleReappro.upsert({
      where: {
        produitId_entrepotId: {
          produitId: dto.produitId,
          entrepotId: dto.entrepotId,
        },
      },
      update: { min: dto.min, max: dto.max },
      create: dto,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'REGLE_REAPPRO_UPSERT',
      entite: 'RegleReappro',
      entiteId: regle.id,
      details: JSON.stringify(dto),
    });
    return regle;
  }

  async lancerReappro(user: AuthenticatedUser) {
    const central = await this.stocks.trouverEntrepotCentralStock();
    const regles = await this.prisma.regleReappro.findMany();
    const bonsIds: string[] = [];
    const commandesIds: string[] = [];
    const propositions: Array<{
      produitId: string;
      entrepotId: string;
      besoin: number;
      route: 'TRANSFERER' | 'ACHETER' | 'MIXTE';
      quantiteTransfert: number;
      quantiteAchat: number;
      bonId?: string;
      commandeId?: string;
    }> = [];

    for (const r of regles) {
      const q = await this.stocks.getQuantite(r.produitId, r.entrepotId);
      if (q >= r.min) continue;
      const besoin = r.max - q;
      const dispoCentral = await this.stocks.getQuantite(
        r.produitId,
        central.id,
      );
      const qtyTransfert = Math.min(besoin, Math.max(0, dispoCentral));
      const qtyAchat = besoin - qtyTransfert;
      let bonId: string | undefined;
      let commandeId: string | undefined;

      if (qtyTransfert > 0) {
        const bon = await this.creer(
          {
            type: TypeOperationStock.TRANSFERT_INTERNE,
            entrepotSourceId: central.id,
            entrepotDestId: r.entrepotId,
            notes: `Réappro Transférer min=${r.min} max=${r.max}`,
            lignes: [{ produitId: r.produitId, quantite: qtyTransfert }],
          },
          user,
        );
        bonId = bon.id;
        bonsIds.push(bon.id);
      }

      if (qtyAchat > 0) {
        const commande = await this.creerCommandeReappro(
          r.produitId,
          qtyAchat,
          user,
        );
        if (commande) {
          commandeId = commande.id;
          commandesIds.push(commande.id);
        }
      }

      propositions.push({
        produitId: r.produitId,
        entrepotId: r.entrepotId,
        besoin,
        route:
          qtyTransfert > 0 && qtyAchat > 0
            ? 'MIXTE'
            : qtyAchat > 0
              ? 'ACHETER'
              : 'TRANSFERER',
        quantiteTransfert: qtyTransfert,
        quantiteAchat: qtyAchat,
        bonId,
        commandeId,
      });
    }

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'REAPPRO_LANCE',
      entite: 'RegleReappro',
      entiteId: central.id,
      details: JSON.stringify({
        bons: bonsIds.length,
        commandes: commandesIds.length,
      }),
    });
    return {
      bonsCrees: bonsIds.length,
      commandesCrees: commandesIds.length,
      ids: bonsIds,
      commandesIds,
      propositions,
    };
  }

  private async creerCommandeReappro(
    produitId: string,
    quantite: number,
    user: AuthenticatedUser,
  ) {
    const derniere = await this.prisma.receptionStock.findFirst({
      where: { produitId },
      orderBy: { dateReception: 'desc' },
    });
    let fournisseurId = derniere?.fournisseurId ?? null;
    if (!fournisseurId) {
      const f = await this.prisma.fournisseur.findFirst({
        where: { actif: true },
      });
      if (!f) return null;
      fournisseurId = f.id;
    }
    const produit = await this.prisma.produit.findUniqueOrThrow({
      where: { id: produitId },
    });
    const prix =
      derniere?.prixAchat ??
      (produit.coutMoyenPondere.greaterThan(0)
        ? produit.coutMoyenPondere
        : produit.prixUnitaire);
    return this.prisma.commandeAchat.create({
      data: {
        numero: `BC-RA-${Date.now().toString(36).toUpperCase()}`,
        fournisseurId,
        notes: `Réappro Acheter — central insuffisant (${quantite} u.)`,
        initiateurId: user.userId,
        lignes: {
          create: {
            produitId,
            quantite,
            prixUnitaire: prix,
          },
        },
      },
    });
  }

  async creerLot(dto: CreateLotDto, user: AuthenticatedUser) {
    return this.prisma.lot.create({
      data: {
        produitId: dto.produitId,
        numero: dto.numero.trim(),
        dateExpiration: dto.dateExpiration
          ? new Date(dto.dateExpiration)
          : null,
        createurId: user.userId,
      },
    });
  }

  async listerLots(produitId?: string) {
    return this.prisma.lot.findMany({
      where: produitId ? { produitId } : {},
      include: { produit: { select: { designation: true } }, stockLots: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ajouterCoutLogistique(
    dto: CreateCoutLogistiqueDto,
    user: AuthenticatedUser,
  ) {
    const created = await this.prisma.coutLogistique.create({
      data: {
        produitId: dto.produitId,
        receptionId: dto.receptionId,
        libelle: dto.libelle,
        montant: dto.montant,
        utilisateurId: user.userId,
      },
    });
    const produit = await this.prisma.produit.findUniqueOrThrow({
      where: { id: dto.produitId },
    });
    if (produit.methodeCout === 'CMP' && produit.stock > 0) {
      const ajout = new Prisma.Decimal(dto.montant).div(produit.stock);
      await this.prisma.produit.update({
        where: { id: dto.produitId },
        data: { coutMoyenPondere: produit.coutMoyenPondere.plus(ajout) },
      });
    }
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COUT_LOGISTIQUE_CREATED',
      entite: 'CoutLogistique',
      entiteId: created.id,
      details: JSON.stringify(dto),
    });
    return created;
  }

  async stockPrevu(produitId: string, entrepotId?: string) {
    let physique: number;
    let reserve: number;
    if (entrepotId) {
      physique = await this.stocks.getQuantite(produitId, entrepotId);
      reserve = await this.stocks.getQuantiteReservee(produitId, entrepotId);
    } else {
      const produit = await this.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      physique = produit.stock;
      const agg = await this.prisma.reservationStock.aggregate({
        where: { produitId },
        _sum: { quantite: true },
      });
      reserve = agg._sum.quantite ?? 0;
    }
    const commandes = await this.prisma.ligneCommandeAchat.findMany({
      where: {
        produitId,
        commande: {
          statut: { in: ['CONFIRMEE', 'PARTIELLEMENT_RECEPTIONNEE'] },
        },
      },
      include: { receptions: { select: { quantite: true } } },
    });
    let aRecevoir = 0;
    for (const l of commandes) {
      const recu = l.receptions.reduce((s, r) => s + r.quantite, 0);
      aRecevoir += Math.max(0, l.quantite - recu);
    }
    const bons = await this.prisma.ligneBonStock.findMany({
      where: {
        produitId,
        bon: {
          statut: 'PRET',
          OR: entrepotId
            ? [{ entrepotDestId: entrepotId }, { entrepotSourceId: entrepotId }]
            : undefined,
        },
      },
      include: { bon: true },
    });
    let enTransit = 0;
    for (const l of bons) {
      if (!entrepotId) {
        if (l.bon.entrepotDestId) enTransit += l.quantite;
        if (l.bon.entrepotSourceId) enTransit -= l.quantite;
        continue;
      }
      if (l.bon.entrepotDestId === entrepotId) enTransit += l.quantite;
      if (l.bon.entrepotSourceId === entrepotId) enTransit -= l.quantite;
    }
    return {
      physique,
      reserve,
      aRecevoir,
      enTransit,
      prevu: physique - reserve + aRecevoir + enTransit,
    };
  }

  private async executerReception(
    tx: Prisma.TransactionClient,
    bon: BonCharge,
    ligne: BonCharge['lignes'][number],
    lotId: string | undefined,
    utilisateurId: string,
  ) {
    if (!bon.entrepotDestId) {
      throw new BadRequestException('Réception sans entrepôt destination.');
    }
    const ok = ligne.quantiteOk ?? ligne.quantite;
    const rebut = ligne.quantiteRebut ?? 0;
    if (ok + rebut > ligne.quantite) {
      throw new BadRequestException('Qualité : ok + rebut > quantité du bon.');
    }
    if (ok > 0) {
      await this.stocks.appliquerMouvement(
        {
          produitId: ligne.produitId,
          entrepotId: bon.entrepotDestId,
          type: 'RECEPTION',
          delta: ok,
          utilisateurId,
          reference: bon.numero,
          lotId,
        },
        tx,
      );
      if (bon.receptionId) {
        const rec = await tx.receptionStock.findUnique({
          where: { id: bon.receptionId },
        });
        if (rec) {
          const produit = await tx.produit.findUniqueOrThrow({
            where: { id: ligne.produitId },
          });
          const valorise = await tx.stockQuant.aggregate({
            where: {
              produitId: ligne.produitId,
              consignation: false,
              entrepot: { usage: { in: ['STOCK', 'ENTREE'] }, virtuel: false },
            },
            _sum: { quantite: true },
          });
          const stockApres = valorise._sum.quantite ?? 0;
          const stockAvant = stockApres - ok;
          const cmpAvant = new Prisma.Decimal(produit.coutMoyenPondere);
          const nouveauCmp =
            stockApres <= 0
              ? cmpAvant
              : cmpAvant
                  .mul(Math.max(stockAvant, 0))
                  .plus(rec.prixAchat.mul(ok))
                  .div(stockApres);
          await tx.produit.update({
            where: { id: ligne.produitId },
            data: { coutMoyenPondere: nouveauCmp },
          });
        }
      }
    }
    if (rebut > 0) {
      const perte = await this.stocks.trouverEmplacementUsage('PERTE', true);
      await this.stocks.appliquerMouvement(
        {
          produitId: ligne.produitId,
          entrepotId: perte.id,
          type: 'SCRAP',
          delta: rebut,
          utilisateurId,
          reference: bon.numero,
          lotId,
        },
        tx,
      );
    }
  }

  private async executerTransfert(
    tx: Prisma.TransactionClient,
    bon: BonCharge,
    ligne: BonCharge['lignes'][number],
    lotId: string | undefined,
    utilisateurId: string,
  ) {
    if (!bon.entrepotSourceId || !bon.entrepotDestId) {
      throw new BadRequestException(
        'Transfert : source et destination obligatoires.',
      );
    }
    await this.stocks.appliquerMouvement(
      {
        produitId: ligne.produitId,
        entrepotId: bon.entrepotSourceId,
        type: 'TRANSFERT_OUT',
        delta: -ligne.quantite,
        utilisateurId,
        reference: bon.numero,
        lotId,
      },
      tx,
    );
    await this.stocks.appliquerMouvement(
      {
        produitId: ligne.produitId,
        entrepotId: bon.entrepotDestId,
        type: 'TRANSFERT_IN',
        delta: ligne.quantite,
        utilisateurId,
        reference: bon.numero,
        lotId,
      },
      tx,
    );
  }

  private async executerRebut(
    tx: Prisma.TransactionClient,
    bon: BonCharge,
    ligne: BonCharge['lignes'][number],
    lotId: string | undefined,
    utilisateurId: string,
  ) {
    if (!bon.entrepotSourceId) {
      throw new BadRequestException('Rebut : entrepôt source obligatoire.');
    }
    const perte =
      bon.entrepotDestId ??
      (await this.stocks.trouverEmplacementUsage('PERTE', true)).id;
    await this.stocks.appliquerMouvement(
      {
        produitId: ligne.produitId,
        entrepotId: bon.entrepotSourceId,
        type: 'SCRAP',
        delta: -ligne.quantite,
        utilisateurId,
        reference: bon.numero,
        lotId,
      },
      tx,
    );
    await this.stocks.appliquerMouvement(
      {
        produitId: ligne.produitId,
        entrepotId: perte,
        type: 'SCRAP',
        delta: ligne.quantite,
        utilisateurId,
        reference: bon.numero,
        lotId,
      },
      tx,
    );
  }

  private async executerLivraison(
    tx: Prisma.TransactionClient,
    bon: BonCharge,
    ligne: BonCharge['lignes'][number],
    lotId: string | undefined,
    utilisateurId: string,
  ) {
    if (!bon.entrepotSourceId) {
      throw new BadRequestException('Livraison : entrepôt source obligatoire.');
    }
    await this.stocks.appliquerMouvement(
      {
        produitId: ligne.produitId,
        entrepotId: bon.entrepotSourceId,
        type: 'VENTE',
        delta: -ligne.quantite,
        utilisateurId,
        reference: bon.numero,
        lotId,
      },
      tx,
    );
  }

  private async resoudreLot(
    tx: Prisma.TransactionClient,
    ligne: BonCharge['lignes'][number],
    utilisateurId: string,
  ) {
    if (ligne.lotId) {
      return tx.lot.findUnique({ where: { id: ligne.lotId } });
    }
    if (!ligne.numeroLot?.trim()) return null;
    const existant = await tx.lot.findUnique({
      where: {
        produitId_numero: {
          produitId: ligne.produitId,
          numero: ligne.numeroLot.trim(),
        },
      },
    });
    if (existant) return existant;
    return tx.lot.create({
      data: {
        produitId: ligne.produitId,
        numero: ligne.numeroLot.trim(),
        dateExpiration: ligne.dateExpiration,
        createurId: utilisateurId,
      },
    });
  }

  private async charger(id: string): Promise<BonCharge> {
    const bon = await this.prisma.bonStock.findUnique({
      where: { id },
      include: INCLUDE_BON,
    });
    if (!bon) throw new NotFoundException(`Bon ${id} introuvable.`);
    return bon;
  }

  private assertLignes(dto: CreateBonStockDto) {
    if (dto.type === TypeOperationStock.TRANSFERT_INTERNE) {
      if (!dto.entrepotSourceId || !dto.entrepotDestId) {
        throw new BadRequestException(
          'Transfert interne : source et destination obligatoires.',
        );
      }
    }
    if (dto.type === TypeOperationStock.RECEPTION && !dto.entrepotDestId) {
      throw new BadRequestException('Réception : destination obligatoire.');
    }
  }

  private async assertEntrepots(dto: CreateBonStockDto) {
    for (const id of [dto.entrepotSourceId, dto.entrepotDestId]) {
      if (!id) continue;
      const e = await this.prisma.entrepot.findUnique({ where: { id } });
      if (!e || !e.actif) {
        throw new BadRequestException(`Entrepôt ${id} introuvable ou inactif.`);
      }
    }
  }

  private scopeWhere(user: AuthenticatedUser): Prisma.BonStockWhereInput {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE && user.boutiqueId) {
      return {
        OR: [
          { entrepotDest: { boutiqueId: user.boutiqueId } },
          { entrepotSource: { boutiqueId: user.boutiqueId } },
        ],
      };
    }
    return {};
  }

  private assertLecture(bon: BonCharge, user: AuthenticatedUser) {
    if (user.role !== RoleLibelle.RESPONSABLE_BOUTIQUE) return;
    const destOk = bon.entrepotDest?.boutiqueId === user.boutiqueId;
    const srcOk = bon.entrepotSource?.boutiqueId === user.boutiqueId;
    if (!destOk && !srcOk) {
      throw new ForbiddenException('Bon hors du périmètre de votre boutique.');
    }
  }

  private assertPilote(user: AuthenticatedUser) {
    if (
      user.role !== RoleLibelle.RESPONSABLE_SI &&
      user.role !== RoleLibelle.DIRECTION_GENERALE
    ) {
      throw new ForbiddenException(
        'Seul SI / Direction peut mettre un bon en prêt.',
      );
    }
  }

  private assertPiloteOuDest(bon: BonCharge, user: AuthenticatedUser) {
    if (
      user.role === RoleLibelle.RESPONSABLE_SI ||
      user.role === RoleLibelle.DIRECTION_GENERALE
    ) {
      return;
    }
    this.assertFait(bon, user);
  }

  private assertFait(bon: BonCharge, user: AuthenticatedUser) {
    if (
      user.role === RoleLibelle.RESPONSABLE_SI ||
      user.role === RoleLibelle.DIRECTION_GENERALE
    ) {
      return;
    }
    if (user.role !== RoleLibelle.RESPONSABLE_BOUTIQUE) {
      throw new ForbiddenException('Validation du bon non autorisée.');
    }
    if (bon.entrepotDest?.boutiqueId !== user.boutiqueId) {
      throw new ForbiddenException(
        'Vous ne pouvez valider que les bons destinés à votre boutique.',
      );
    }
  }

  private numero(type: TypeOperationStock) {
    const p =
      type === 'RECEPTION'
        ? 'IN'
        : type === 'TRANSFERT_INTERNE'
          ? 'INT'
          : type === 'REBUT'
            ? 'SCR'
            : 'OUT';
    return `${p}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  private serialiser(b: BonCharge) {
    return {
      id: b.id,
      numero: b.numero,
      type: b.type,
      statut: b.statut,
      notes: b.notes,
      receptionId: b.receptionId,
      entrepotSource: b.entrepotSource,
      entrepotDest: b.entrepotDest,
      initiateur: b.initiateur,
      dateCreation: b.dateCreation.toISOString(),
      datePret: b.datePret?.toISOString() ?? null,
      dateFait: b.dateFait?.toISOString() ?? null,
      lignes: b.lignes.map((l) => ({
        id: l.id,
        produitId: l.produitId,
        designation: l.produit.designation,
        reference: l.produit.reference,
        codeBarres: l.produit.codeBarres,
        quantite: l.quantite,
        quantiteOk: l.quantiteOk,
        quantiteRebut: l.quantiteRebut,
        numeroLot: l.numeroLot,
        lotId: l.lotId,
      })),
    };
  }
}
