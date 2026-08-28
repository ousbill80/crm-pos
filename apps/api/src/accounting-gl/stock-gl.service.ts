import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TypeSourceComptable } from '@prisma/client';
import { P2pAccountingCalculator } from '../fournisseurs/p2p-accounting.calculator';
import { GlLedgerWriter, type LedgerTx } from './gl-ledger.writer';

type VenteCogs = Prisma.VenteGetPayload<{
  include: { lignes: { include: { produit: true } } };
}>;

type FactureCogs = Prisma.FactureClientGetPayload<{
  include: { lignes: { include: { produit: true } } };
}>;

type RetourCogs = Prisma.RetourVenteGetPayload<{
  include: { ligneVente: { include: { produit: true } } };
}>;

type InventairePourCogs = {
  id: string;
  lignes: Array<{
    quantiteComptee: number | null;
    quantiteTheorique: number;
    produit: { coutMoyenPondere: Prisma.Decimal | null };
  }>;
};

@Injectable()
export class StockGlService {
  private readonly ledger: GlLedgerWriter;

  constructor(private readonly calculator: P2pAccountingCalculator) {
    this.ledger = new GlLedgerWriter(calculator);
  }

  cogsAmountFromVente(vente: VenteCogs): Prisma.Decimal {
    return vente.lignes.reduce((sum, ligne) => {
      const unit = ligne.coutUnitaire ?? ligne.produit.coutMoyenPondere;
      if (!unit) return sum;
      return sum.plus(new Prisma.Decimal(unit).times(ligne.quantite));
    }, new Prisma.Decimal(0));
  }

  cogsAmountFromFacture(facture: FactureCogs): Prisma.Decimal {
    return facture.lignes.reduce((sum, ligne) => {
      const unit =
        ligne.coutUnitaire ?? ligne.produit?.coutMoyenPondere ?? null;
      if (!unit) return sum;
      return sum.plus(new Prisma.Decimal(unit).times(ligne.quantite));
    }, new Prisma.Decimal(0));
  }

  cogsAmountFromRetour(retour: RetourCogs): Prisma.Decimal {
    const unit =
      retour.ligneVente.coutUnitaire ??
      retour.ligneVente.produit.coutMoyenPondere;
    if (!unit) return new Prisma.Decimal(0);
    return new Prisma.Decimal(unit).times(retour.quantite);
  }

  async resolveSocieteId(tx: LedgerTx, preferred?: string | null) {
    if (preferred) return preferred;
    return this.requireSocieteId(tx);
  }

  async postPutaway(
    tx: LedgerTx,
    input: {
      putawayId: string;
      societeId: string;
      supplierId: string;
      date: Date;
      authorId: string;
      value: Prisma.Decimal | number | string;
    },
  ) {
    const lines = this.calculator.stockReceipt(input.value);
    if (lines.length === 0) return null;
    return this.post(
      tx,
      {
        societeId: input.societeId,
        sourceType: 'MISE_EN_STOCK',
        sourceId: input.putawayId,
        date: input.date,
        authorId: input.authorId,
        supplierId: input.supplierId,
        label: `Mise en stock ${input.putawayId.slice(0, 8).toUpperCase()}`,
        operationId: `gl-putaway-${input.putawayId}`,
      },
      lines,
    );
  }

  async postSupplierReturnFromStock(
    tx: LedgerTx,
    input: {
      returnId: string;
      societeId: string;
      supplierId: string;
      date: Date;
      authorId: string;
      value: Prisma.Decimal | number | string;
    },
  ) {
    const receipt = this.calculator.stockReceipt(input.value);
    if (receipt.length === 0) return null;
    return this.post(
      tx,
      {
        societeId: input.societeId,
        sourceType: 'RETOUR_STOCK_FOURNISSEUR',
        sourceId: input.returnId,
        date: input.date,
        authorId: input.authorId,
        supplierId: input.supplierId,
        label: `Retour stock fournisseur ${input.returnId.slice(0, 8).toUpperCase()}`,
        operationId: `gl-rma-stock-${input.returnId}`,
      },
      this.calculator.creditNote(receipt),
    );
  }

  async postCogsFacture(tx: LedgerTx, facture: FactureCogs, auteurId: string) {
    const amount = this.cogsAmountFromFacture(facture);
    const lines = this.calculator.cogs(amount);
    if (lines.length === 0) return null;
    const societeId = await this.requireSocieteId(tx);
    return this.post(
      tx,
      {
        societeId,
        sourceType: 'CMV_VENTE',
        sourceId: facture.id,
        date: facture.emiseAt ?? facture.dateFacture,
        authorId: auteurId,
        label: `CMV facture ${facture.numero}`,
        operationId: `gl-cmv-fac-${facture.id}`,
      },
      lines,
    );
  }

  async postCogsVente(tx: LedgerTx, vente: VenteCogs, auteurId: string) {
    const amount = this.cogsAmountFromVente(vente);
    const lines = this.calculator.cogs(amount);
    if (lines.length === 0) return null;
    const societeId = await this.requireSocieteId(tx);
    return this.post(
      tx,
      {
        societeId,
        sourceType: 'CMV_VENTE',
        sourceId: vente.id,
        date: vente.dateVente,
        authorId: auteurId,
        label: `CMV vente ${vente.id.slice(0, 8).toUpperCase()}`,
        operationId: `gl-cmv-${vente.id}`,
      },
      lines,
    );
  }

  async postCogsRetour(tx: LedgerTx, retour: RetourCogs, auteurId: string) {
    const amount = this.cogsAmountFromRetour(retour);
    const sold = this.calculator.cogs(amount);
    if (sold.length === 0) return null;
    const societeId = await this.requireSocieteId(tx);
    return this.post(
      tx,
      {
        societeId,
        sourceType: 'CMV_AVOIR',
        sourceId: retour.id,
        date: retour.dateHeure,
        authorId: auteurId,
        label: `Reprise CMV ${retour.id.slice(0, 8).toUpperCase()}`,
        operationId: `gl-cmv-avr-${retour.id}`,
      },
      this.calculator.creditNote(sold),
    );
  }

  async postCogsCommandeWeb(
    tx: LedgerTx,
    commandeId: string,
    auteurId: string,
  ) {
    const commande = await tx.commandeWeb.findUnique({
      where: { id: commandeId },
      include: { lignes: { include: { produit: true } } },
    });
    if (!commande) throw new BadRequestException('Commande web introuvable.');
    const amount = commande.lignes.reduce((sum, ligne) => {
      const unit = ligne.produit.coutMoyenPondere;
      if (!unit) return sum;
      return sum.plus(new Prisma.Decimal(unit).times(ligne.quantite));
    }, new Prisma.Decimal(0));
    const lines = this.calculator.cogs(amount);
    if (lines.length === 0) return null;
    const societeId = await this.requireSocieteId(tx);
    const date = commande.payeeAt ?? commande.createdAt;
    return this.post(
      tx,
      {
        societeId,
        sourceType: 'CMV_VENTE',
        sourceId: commande.id,
        date,
        authorId: auteurId,
        label: `CMV commande web ${commande.id.slice(0, 8).toUpperCase()}`,
        operationId: `gl-cmv-web-${commande.id}`,
      },
      lines,
    );
  }

  async postInventaire(
    tx: LedgerTx,
    session: InventairePourCogs,
    auteurId: string,
  ) {
    const net = session.lignes.reduce((sum, ligne) => {
      if (ligne.quantiteComptee === null) return sum;
      const delta = ligne.quantiteComptee - ligne.quantiteTheorique;
      if (delta === 0) return sum;
      const cmp = ligne.produit.coutMoyenPondere ?? new Prisma.Decimal(0);
      return sum.plus(new Prisma.Decimal(cmp).times(delta));
    }, new Prisma.Decimal(0));
    const lines = this.calculator.inventoryVariance(net);
    if (lines.length === 0) return null;
    const societeId = await this.requireSocieteId(tx);
    return this.post(
      tx,
      {
        societeId,
        sourceType: 'VARIATION_STOCK',
        sourceId: session.id,
        date: new Date(),
        authorId: auteurId,
        label: `Inventaire ${session.id.slice(0, 8).toUpperCase()}`,
        operationId: `gl-inv-${session.id}`,
      },
      lines,
    );
  }

  private async post(
    tx: LedgerTx,
    input: {
      societeId: string;
      sourceType: TypeSourceComptable;
      sourceId: string;
      date: Date;
      authorId: string;
      supplierId?: string;
      label: string;
      operationId: string;
    },
    lines: ReturnType<P2pAccountingCalculator['cogs']>,
  ) {
    const existing = await tx.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      },
    });
    if (existing) return existing;
    const context = await this.ledger.context(
      tx,
      input.societeId,
      input.sourceType,
      input.date,
    );
    return this.ledger.createEntry(tx, {
      context,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      label: input.label,
      date: input.date,
      currency: 'XOF',
      operationId: input.operationId,
      authorId: input.authorId,
      supplierId: input.supplierId,
      lines,
    });
  }

  private async requireSocieteId(tx: LedgerTx) {
    const societes = await tx.societe.findMany({
      take: 2,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (societes.length === 0) {
      throw new BadRequestException('Société introuvable pour le grand livre.');
    }
    if (societes.length > 1) {
      throw new BadRequestException(
        'Plusieurs sociétés : rattachez la pièce à une société unique.',
      );
    }
    return societes[0].id;
  }
}
