import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ModePaiement,
  Prisma,
  ProviderPspShop,
  StatutFileEcritureComptable,
  TypeSourceComptable,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { P2pAccountingCalculator } from '../fournisseurs/p2p-accounting.calculator';
import { GlLedgerWriter } from './gl-ledger.writer';
import { StockGlService } from './stock-gl.service';

const DEFAULT_TAUX_TVA = 18;
const WEB_PAY_PREFIX = 'web-pay-';
const AVR_ENC_PREFIX = 'avr-enc-';
const FAC_ENC_PREFIX = 'fac-enc-';

type VenteAvecLignes = Prisma.VenteGetPayload<{
  include: {
    lignes: { include: { produit: true } };
    conversionCommande: true;
    paiements: true;
  };
}>;

type RetourAvecLigne = Prisma.RetourVenteGetPayload<{
  include: {
    ligneVente: {
      include: { produit: true; vente: { include: { paiements: true } } };
    };
  };
}>;

@Injectable()
export class SalesGlService {
  private readonly logger = new Logger(SalesGlService.name);
  private readonly ledger: GlLedgerWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: P2pAccountingCalculator,
    private readonly stockGl: StockGlService,
  ) {
    this.ledger = new GlLedgerWriter(calculator);
  }

  async tryPostVente(venteId: string, auteurId: string): Promise<void> {
    try {
      const vente = await this.prisma.vente.findUnique({
        where: { id: venteId },
        include: {
          lignes: { include: { produit: true } },
          conversionCommande: true,
          paiements: true,
        },
      });
      if (!vente) return;
      if (vente.conversionCommande) {
        const dejaShop = await this.dejaComptabilise(
          'COMMANDE_WEB',
          vente.conversionCommande.commandeWebId,
        );
        if (dejaShop) return;
      }
      const societeId = await this.requireSocieteId();
      if (!(await this.dejaComptabilise('VENTE_POS', vente.id))) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'VENTE_POS',
          sourceId: vente.id,
          auteurId,
          dateComptable: vente.dateVente,
          post: (tx) => this.postVenteTx(tx, vente, auteurId),
        });
      }
      await this.enqueueCogsVente(vente, auteurId, societeId);
      await this.enqueueCollectionsVente(vente, auteurId, societeId);
    } catch (error) {
      this.logger.error(
        `Comptabilisation vente ${venteId} impossible sans bloquer le POS`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async tryPostRetour(retourId: string, auteurId: string): Promise<void> {
    try {
      const retour = await this.prisma.retourVente.findUnique({
        where: { id: retourId },
        include: {
          ligneVente: {
            include: { produit: true, vente: { include: { paiements: true } } },
          },
        },
      });
      if (!retour) return;
      const societeId = await this.requireSocieteId();
      await this.postOrEnqueue({
        societeId,
        sourceType: 'AVOIR_CLIENT',
        sourceId: retour.id,
        auteurId,
        dateComptable: retour.dateHeure,
        post: (tx) => this.postRetourTx(tx, retour, auteurId),
      });
      if (this.stockGl.cogsAmountFromRetour(retour).gt(0)) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'CMV_AVOIR',
          sourceId: retour.id,
          auteurId,
          dateComptable: retour.dateHeure,
          post: (tx) => this.stockGl.postCogsRetour(tx, retour, auteurId),
        });
      }
      if (retour.ligneVente.vente.paiements.length > 0) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'ENCAISSEMENT_CLIENT',
          sourceId: `${AVR_ENC_PREFIX}${retour.id}`,
          auteurId,
          dateComptable: retour.dateHeure,
          post: (tx) => this.postRefundTx(tx, retour, auteurId),
        });
      }
    } catch (error) {
      this.logger.error(
        `Comptabilisation retour ${retourId} impossible sans bloquer le POS`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async tryPostCommandeWeb(
    commandeId: string,
    auteurId?: string,
  ): Promise<void> {
    try {
      const commande = await this.prisma.commandeWeb.findUnique({
        where: { id: commandeId },
        include: { lignes: { include: { produit: true } } },
      });
      if (!commande) return;
      if (commande.modeReglement !== 'PREPAYE_PSP') return;
      if (commande.statut !== 'PAYEE' && commande.statut !== 'PREPARATION') {
        return;
      }
      const auteur = auteurId ?? (await this.auteurSysteme());
      if (!auteur) return;
      const societeId = await this.requireSocieteId();
      const dateComptable = commande.payeeAt ?? commande.createdAt;
      if (!(await this.dejaComptabilise('COMMANDE_WEB', commande.id))) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'COMMANDE_WEB',
          sourceId: commande.id,
          auteurId: auteur,
          dateComptable,
          post: (tx) => this.postCommandeWebTx(tx, commande.id, auteur),
        });
      }
      if (!(await this.dejaComptabilise('CMV_VENTE', commande.id))) {
        const cmv = commande.lignes.reduce((sum, ligne) => {
          const unit = ligne.produit.coutMoyenPondere;
          if (!unit) return sum;
          return sum.plus(new Prisma.Decimal(unit).times(ligne.quantite));
        }, new Prisma.Decimal(0));
        if (cmv.gt(0)) {
          await this.postOrEnqueue({
            societeId,
            sourceType: 'CMV_VENTE',
            sourceId: commande.id,
            auteurId: auteur,
            dateComptable,
            post: (tx) =>
              this.stockGl.postCogsCommandeWeb(tx, commande.id, auteur),
          });
        }
      }
      await this.postOrEnqueue({
        societeId,
        sourceType: 'ENCAISSEMENT_CLIENT',
        sourceId: `${WEB_PAY_PREFIX}${commande.id}`,
        auteurId: auteur,
        dateComptable,
        post: (tx) => this.postWebCollectionTx(tx, commande.id, auteur),
      });
    } catch (error) {
      this.logger.error(
        `Comptabilisation commande web ${commandeId} impossible sans bloquer le shop`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async tryPostFactureClient(
    factureId: string,
    auteurId: string,
  ): Promise<void> {
    try {
      const facture = await this.prisma.factureClient.findUnique({
        where: { id: factureId },
        include: { lignes: { include: { produit: true } } },
      });
      if (!facture || facture.statut !== 'EMISE') return;
      const societeId = await this.requireSocieteId();
      const dateComptable = facture.emiseAt ?? facture.dateFacture;
      if (!(await this.dejaComptabilise('FACTURE_CLIENT', facture.id))) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'FACTURE_CLIENT',
          sourceId: facture.id,
          auteurId,
          dateComptable,
          post: (tx) => this.postFactureTx(tx, facture, auteurId),
        });
      }
      if (this.stockGl.cogsAmountFromFacture(facture).gt(0)) {
        await this.postOrEnqueue({
          societeId,
          sourceType: 'CMV_VENTE',
          sourceId: facture.id,
          auteurId,
          dateComptable,
          post: (tx) => this.stockGl.postCogsFacture(tx, facture, auteurId),
        });
      }
    } catch (error) {
      this.logger.error(
        `Comptabilisation facture client ${factureId} impossible sans bloquer l’émission`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async tryPostEncaissementFactureClient(
    paiementId: string,
    auteurId: string,
  ): Promise<void> {
    try {
      const paiement = await this.prisma.paiementFactureClient.findUnique({
        where: { id: paiementId },
        include: { facture: true },
      });
      if (!paiement) return;
      const societeId = await this.requireSocieteId();
      await this.postOrEnqueue({
        societeId,
        sourceType: 'ENCAISSEMENT_CLIENT',
        sourceId: `${FAC_ENC_PREFIX}${paiement.id}`,
        auteurId,
        dateComptable: paiement.datePaiement,
        post: (tx) =>
          this.postPosCollectionTx(tx, {
            sourceId: `${FAC_ENC_PREFIX}${paiement.id}`,
            societeId,
            date: paiement.datePaiement,
            montant: paiement.montant,
            treasuryNumero: this.treasuryNumeroFacture(paiement.mode),
            auteurId,
            clientId: paiement.facture.clientId,
            lettrage: null,
            label: `Encaissement facture ${paiement.facture.numero}`,
            operationId: `gl-fac-enc-${paiement.id}`,
          }),
      });
    } catch (error) {
      this.logger.error(
        `Comptabilisation encaissement facture ${paiementId} impossible`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async backfillOperational(societeId: string, userId: string) {
    const result = {
      ventes: 0,
      encaissements: 0,
      retours: 0,
      commandesWeb: 0,
      file: 0,
    };
    const ventes = await this.prisma.vente.findMany({
      where: { conversionCommande: null },
      select: { id: true },
      orderBy: { dateVente: 'asc' },
    });
    for (const vente of ventes) {
      const avant = await this.dejaComptabilise('VENTE_POS', vente.id);
      await this.tryPostVente(vente.id, userId);
      if (!avant && (await this.dejaComptabilise('VENTE_POS', vente.id))) {
        result.ventes += 1;
      }
    }
    const retours = await this.prisma.retourVente.findMany({
      select: { id: true },
      orderBy: { dateHeure: 'asc' },
    });
    for (const retour of retours) {
      const avant = await this.dejaComptabilise('AVOIR_CLIENT', retour.id);
      await this.tryPostRetour(retour.id, userId);
      if (!avant && (await this.dejaComptabilise('AVOIR_CLIENT', retour.id))) {
        result.retours += 1;
      }
    }
    const commandes = await this.prisma.commandeWeb.findMany({
      where: {
        modeReglement: 'PREPAYE_PSP',
        statut: { in: ['PAYEE', 'PREPARATION'] },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const commande of commandes) {
      const avant = await this.dejaComptabilise('COMMANDE_WEB', commande.id);
      await this.tryPostCommandeWeb(commande.id, userId);
      if (
        !avant &&
        (await this.dejaComptabilise('COMMANDE_WEB', commande.id))
      ) {
        result.commandesWeb += 1;
      }
    }
    result.encaissements = await this.prisma.ecritureComptable.count({
      where: { societeId, sourceType: 'ENCAISSEMENT_CLIENT' },
    });
    result.file = await this.prisma.fileEcritureComptable.count({
      where: { societeId, statut: { in: ['EN_ATTENTE', 'ERREUR'] } },
    });
    await this.prisma.journalAudit.create({
      data: {
        utilisateurId: userId,
        action: 'VENTES_GL_RATTRAPAGE',
        entite: 'FileEcritureComptable',
        entiteId: societeId,
        details: JSON.stringify(result),
      },
    });
    return result;
  }

  async flushQueue(societeId: string, userId: string) {
    const pending = await this.prisma.fileEcritureComptable.findMany({
      where: {
        societeId,
        statut: { in: ['EN_ATTENTE', 'ERREUR'] },
      },
      orderBy: { dateCreation: 'asc' },
    });
    const results: Array<{
      id: string;
      statut: StatutFileEcritureComptable;
      motif: string | null;
    }> = [];
    for (const item of pending) {
      results.push(await this.flushOne(item.id, userId));
    }
    return results;
  }

  async flushOne(id: string, userId: string) {
    const item = await this.prisma.fileEcritureComptable.findUnique({
      where: { id },
    });
    if (!item) throw new BadRequestException('Écriture en file introuvable.');
    if (item.statut === 'POSTEE') {
      return { id: item.id, statut: item.statut, motif: item.motif };
    }
    try {
      const posted = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.ecritureComptable.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: item.sourceType,
                sourceId: item.sourceId,
              },
            },
          });
          if (existing) return existing;
          return this.postSourceTx(
            tx,
            item.sourceType,
            item.sourceId,
            item.auteurId,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (!posted) {
        const skipped = await this.prisma.fileEcritureComptable.update({
          where: { id: item.id },
          data: {
            statut: 'POSTEE',
            motif: 'Montant nul — aucune écriture.',
            dateTraitement: new Date(),
          },
        });
        return { id: skipped.id, statut: skipped.statut, motif: skipped.motif };
      }
      const updated = await this.prisma.fileEcritureComptable.update({
        where: { id: item.id },
        data: {
          statut: 'POSTEE',
          motif: null,
          dateTraitement: new Date(),
          ecritureId: posted.id,
        },
      });
      await this.prisma.journalAudit.create({
        data: {
          utilisateurId: userId,
          action: 'FILE_ECRITURE_POSTEE',
          entite: 'FileEcritureComptable',
          entiteId: item.id,
          details: JSON.stringify({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            ecritureId: posted.id,
          }),
        },
      });
      return { id: updated.id, statut: updated.statut, motif: updated.motif };
    } catch (error) {
      const motif =
        error instanceof Error ? error.message : 'Échec de comptabilisation.';
      const updated = await this.prisma.fileEcritureComptable.update({
        where: { id: item.id },
        data: { statut: 'ERREUR', motif, dateTraitement: new Date() },
      });
      return { id: updated.id, statut: updated.statut, motif: updated.motif };
    }
  }

  listQueue(societeId: string, statut?: StatutFileEcritureComptable) {
    return this.prisma.fileEcritureComptable.findMany({
      where: { societeId, ...(statut ? { statut } : {}) },
      orderBy: { dateCreation: 'asc' },
    });
  }

  private async enqueueCogsVente(
    vente: VenteAvecLignes,
    auteurId: string,
    societeId: string,
  ) {
    if (this.stockGl.cogsAmountFromVente(vente).lte(0)) return;
    await this.postOrEnqueue({
      societeId,
      sourceType: 'CMV_VENTE',
      sourceId: vente.id,
      auteurId,
      dateComptable: vente.dateVente,
      post: (tx) => this.stockGl.postCogsVente(tx, vente, auteurId),
    });
  }

  private async enqueueCollectionsVente(
    vente: VenteAvecLignes,
    auteurId: string,
    societeId: string,
  ) {
    const lettrage = this.estReglee(vente)
      ? this.codeLettrage('VTE', vente.id)
      : null;
    for (const paiement of vente.paiements) {
      await this.postOrEnqueue({
        societeId,
        sourceType: 'ENCAISSEMENT_CLIENT',
        sourceId: paiement.id,
        auteurId,
        dateComptable: vente.dateVente,
        post: (tx) =>
          this.postPosCollectionTx(tx, {
            sourceId: paiement.id,
            societeId,
            date: vente.dateVente,
            montant: paiement.montant,
            treasuryNumero: this.treasuryNumeroPos(paiement.modePaiement),
            auteurId,
            clientId: vente.clientId,
            lettrage,
            label: `Encaissement POS ${vente.id.slice(0, 8).toUpperCase()}`,
            operationId: `gl-enc-${paiement.id}`,
          }),
      });
    }
  }

  private async postOrEnqueue(input: {
    societeId: string;
    sourceType: TypeSourceComptable;
    sourceId: string;
    auteurId: string;
    dateComptable: Date;
    post: (tx: Prisma.TransactionClient) => Promise<unknown>;
  }) {
    if (await this.dejaComptabilise(input.sourceType, input.sourceId)) return;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.ecritureComptable.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: input.sourceType,
                sourceId: input.sourceId,
              },
            },
          });
          if (existing) return existing;
          return input.post(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.prisma.fileEcritureComptable.updateMany({
        where: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          statut: { in: ['EN_ATTENTE', 'ERREUR'] },
        },
        data: { statut: 'POSTEE', motif: null, dateTraitement: new Date() },
      });
    } catch (error) {
      const motif =
        error instanceof Error ? error.message : 'Échec de comptabilisation.';
      await this.prisma.fileEcritureComptable.upsert({
        where: {
          sourceType_sourceId: {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        },
        update: {
          statut: 'EN_ATTENTE',
          motif,
          dateComptable: input.dateComptable,
          auteurId: input.auteurId,
        },
        create: {
          societeId: input.societeId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          auteurId: input.auteurId,
          dateComptable: input.dateComptable,
          statut: 'EN_ATTENTE',
          motif,
        },
      });
    }
  }

  private async postSourceTx(
    tx: Prisma.TransactionClient,
    sourceType: TypeSourceComptable,
    sourceId: string,
    auteurId: string,
  ) {
    if (sourceType === 'VENTE_POS') {
      const vente = await tx.vente.findUnique({
        where: { id: sourceId },
        include: {
          lignes: { include: { produit: true } },
          conversionCommande: true,
          paiements: true,
        },
      });
      if (!vente) throw new BadRequestException('Vente introuvable.');
      return this.postVenteTx(tx, vente, auteurId);
    }
    if (sourceType === 'AVOIR_CLIENT') {
      const retour = await tx.retourVente.findUnique({
        where: { id: sourceId },
        include: {
          ligneVente: {
            include: { produit: true, vente: { include: { paiements: true } } },
          },
        },
      });
      if (!retour) throw new BadRequestException('Retour introuvable.');
      return this.postRetourTx(tx, retour, auteurId);
    }
    if (sourceType === 'COMMANDE_WEB') {
      return this.postCommandeWebTx(tx, sourceId, auteurId);
    }
    if (sourceType === 'FACTURE_CLIENT') {
      const facture = await tx.factureClient.findUnique({
        where: { id: sourceId },
        include: { lignes: { include: { produit: true } } },
      });
      if (!facture)
        throw new BadRequestException('Facture client introuvable.');
      return this.postFactureTx(tx, facture, auteurId);
    }
    if (sourceType === 'CMV_VENTE') {
      const vente = await tx.vente.findUnique({
        where: { id: sourceId },
        include: { lignes: { include: { produit: true } } },
      });
      if (vente) return this.stockGl.postCogsVente(tx, vente, auteurId);
      const facture = await tx.factureClient.findUnique({
        where: { id: sourceId },
        include: { lignes: { include: { produit: true } } },
      });
      if (facture) return this.stockGl.postCogsFacture(tx, facture, auteurId);
      return this.stockGl.postCogsCommandeWeb(tx, sourceId, auteurId);
    }
    if (sourceType === 'CMV_AVOIR') {
      const retour = await tx.retourVente.findUnique({
        where: { id: sourceId },
        include: { ligneVente: { include: { produit: true } } },
      });
      if (!retour) throw new BadRequestException('Retour introuvable.');
      return this.stockGl.postCogsRetour(tx, retour, auteurId);
    }
    if (sourceType === 'ENCAISSEMENT_CLIENT') {
      return this.postEncaissementSourceTx(tx, sourceId, auteurId);
    }
    throw new BadRequestException(
      `Source ${sourceType} non rejouable depuis la file ventes.`,
    );
  }

  private async postEncaissementSourceTx(
    tx: Prisma.TransactionClient,
    sourceId: string,
    auteurId: string,
  ) {
    if (sourceId.startsWith(AVR_ENC_PREFIX)) {
      const retour = await tx.retourVente.findUnique({
        where: { id: sourceId.slice(AVR_ENC_PREFIX.length) },
        include: {
          ligneVente: {
            include: { produit: true, vente: { include: { paiements: true } } },
          },
        },
      });
      if (!retour) throw new BadRequestException('Retour introuvable.');
      return this.postRefundTx(tx, retour, auteurId);
    }
    if (sourceId.startsWith(WEB_PAY_PREFIX)) {
      return this.postWebCollectionTx(
        tx,
        sourceId.slice(WEB_PAY_PREFIX.length),
        auteurId,
      );
    }
    if (sourceId.startsWith(FAC_ENC_PREFIX)) {
      const paiementFac = await tx.paiementFactureClient.findUnique({
        where: { id: sourceId.slice(FAC_ENC_PREFIX.length) },
        include: { facture: true },
      });
      if (!paiementFac)
        throw new BadRequestException('Encaissement facture introuvable.');
      const societeId = await this.requireSocieteId(tx);
      return this.postPosCollectionTx(tx, {
        sourceId,
        societeId,
        date: paiementFac.datePaiement,
        montant: paiementFac.montant,
        treasuryNumero: this.treasuryNumeroFacture(paiementFac.mode),
        auteurId,
        clientId: paiementFac.facture.clientId,
        lettrage: null,
        label: `Encaissement facture ${paiementFac.facture.numero}`,
        operationId: `gl-fac-enc-${paiementFac.id}`,
      });
    }
    const paiement = await tx.paiementVente.findUnique({
      where: { id: sourceId },
      include: { vente: true },
    });
    if (!paiement)
      throw new BadRequestException('Encaissement POS introuvable.');
    const societeId = await this.requireSocieteId(tx);
    return this.postPosCollectionTx(tx, {
      sourceId: paiement.id,
      societeId,
      date: paiement.vente.dateVente,
      montant: paiement.montant,
      treasuryNumero: this.treasuryNumeroPos(paiement.modePaiement),
      auteurId,
      clientId: paiement.vente.clientId,
      lettrage: this.codeLettrage('VTE', paiement.venteId),
      label: `Encaissement POS ${paiement.venteId.slice(0, 8).toUpperCase()}`,
      operationId: `gl-enc-${paiement.id}`,
    });
  }

  private async postVenteTx(
    tx: Prisma.TransactionClient,
    vente: VenteAvecLignes,
    auteurId: string,
  ) {
    const societeId = await this.requireSocieteId(tx);
    const tauxDefaut = await this.tauxTvaDefaut(tx);
    const collected = new Prisma.Decimal(vente.montantTotal);
    const brut = vente.lignes.reduce(
      (sum, ligne) =>
        sum.plus(
          new Prisma.Decimal(ligne.prixUnitaire)
            .times(ligne.quantite)
            .minus(ligne.remise),
        ),
      new Prisma.Decimal(0),
    );
    const lines = this.calculator.saleFromCollectedTtc(
      vente.lignes.map((ligne) => {
        const ligneTtc = new Prisma.Decimal(ligne.prixUnitaire)
          .times(ligne.quantite)
          .minus(ligne.remise);
        const ttc = brut.gt(0)
          ? ligneTtc.div(brut).times(collected).toDecimalPlaces(2)
          : ligneTtc;
        return {
          ttc,
          tauxTva: this.tauxProduit(ligne.produit.tauxTva, tauxDefaut),
        };
      }),
    );
    this.ajusterTtcClient(lines, collected);
    const date = vente.dateVente;
    const context = await this.ledger.context(tx, societeId, 'VENTE_POS', date);
    const lettrage = this.estReglee(vente)
      ? this.codeLettrage('VTE', vente.id)
      : null;
    return this.ledger.createEntry(tx, {
      context,
      sourceType: 'VENTE_POS',
      sourceId: vente.id,
      label: `Vente POS ${vente.id.slice(0, 8).toUpperCase()}`,
      date,
      currency: 'XOF',
      operationId: vente.clientOperationId ?? `gl-vente-${vente.id}`,
      authorId: auteurId,
      clientId: vente.clientId,
      lines,
      lettrage,
    });
  }

  private async postRetourTx(
    tx: Prisma.TransactionClient,
    retour: RetourAvecLigne,
    auteurId: string,
  ) {
    const societeId = await this.requireSocieteId(tx);
    const tauxDefaut = await this.tauxTvaDefaut(tx);
    const ttc = new Prisma.Decimal(retour.montantRembourse);
    const saleLines = this.calculator.saleFromCollectedTtc([
      {
        ttc,
        tauxTva: this.tauxProduit(
          retour.ligneVente.produit.tauxTva,
          tauxDefaut,
        ),
      },
    ]);
    const lines = this.calculator.creditNote(saleLines);
    const date = retour.dateHeure;
    const context = await this.ledger.context(
      tx,
      societeId,
      'AVOIR_CLIENT',
      date,
    );
    return this.ledger.createEntry(tx, {
      context,
      sourceType: 'AVOIR_CLIENT',
      sourceId: retour.id,
      label: `Avoir client ${retour.id.slice(0, 8).toUpperCase()}`,
      date,
      currency: 'XOF',
      operationId: retour.clientOperationId ?? `gl-avoir-${retour.id}`,
      authorId: auteurId,
      clientId: retour.ligneVente.vente.clientId,
      lines,
      lettrage: this.codeLettrage('AVR', retour.id),
    });
  }

  private async postRefundTx(
    tx: Prisma.TransactionClient,
    retour: RetourAvecLigne,
    auteurId: string,
  ) {
    const societeId = await this.requireSocieteId(tx);
    return this.postPosCollectionTx(tx, {
      sourceId: `${AVR_ENC_PREFIX}${retour.id}`,
      societeId,
      date: retour.dateHeure,
      montant: retour.montantRembourse,
      treasuryNumero: '571',
      auteurId,
      clientId: retour.ligneVente.vente.clientId,
      lettrage: this.codeLettrage('AVR', retour.id),
      label: `Remboursement POS ${retour.id.slice(0, 8).toUpperCase()}`,
      operationId: `gl-avr-enc-${retour.id}`,
      refund: true,
    });
  }

  private async postCommandeWebTx(
    tx: Prisma.TransactionClient,
    commandeId: string,
    auteurId: string,
  ) {
    const commande = await tx.commandeWeb.findUnique({
      where: { id: commandeId },
    });
    if (!commande) throw new BadRequestException('Commande web introuvable.');
    const societeId = await this.requireSocieteId(tx);
    const ht = new Prisma.Decimal(commande.montantArticlesHt).plus(
      commande.fraisLivraison,
    );
    const tva = new Prisma.Decimal(commande.montantTva);
    const ttc = new Prisma.Decimal(commande.montantTotal);
    const lines = this.calculator.saleFromHtTva({ ht, tva, ttc });
    const date = commande.payeeAt ?? commande.createdAt;
    const context = await this.ledger.context(
      tx,
      societeId,
      'COMMANDE_WEB',
      date,
    );
    return this.ledger.createEntry(tx, {
      context,
      sourceType: 'COMMANDE_WEB',
      sourceId: commande.id,
      label: `Commande web ${commande.id.slice(0, 8).toUpperCase()}`,
      date,
      currency: 'XOF',
      operationId: `gl-web-${commande.id}`,
      authorId: auteurId,
      clientId: commande.clientId,
      lines,
      lettrage: this.codeLettrage('WEB', commande.id),
    });
  }

  private async postFactureTx(
    tx: Prisma.TransactionClient,
    facture: Prisma.FactureClientGetPayload<{
      include: { lignes: { include: { produit: true } } };
    }>,
    auteurId: string,
  ) {
    const societeId = await this.requireSocieteId(tx);
    const lines = this.calculator.saleFromHtTva({
      ht: facture.montantHt,
      tva: facture.montantTva,
      ttc: facture.montantTtc,
    });
    const date = facture.emiseAt ?? facture.dateFacture;
    const context = await this.ledger.context(
      tx,
      societeId,
      'FACTURE_CLIENT',
      date,
    );
    return this.ledger.createEntry(tx, {
      context,
      sourceType: 'FACTURE_CLIENT',
      sourceId: facture.id,
      label: `Facture client ${facture.numero}`,
      date,
      currency: 'XOF',
      operationId: `gl-fac-${facture.id}`,
      authorId: auteurId,
      clientId: facture.clientId,
      lines,
      lettrage: null,
    });
  }

  private async postWebCollectionTx(
    tx: Prisma.TransactionClient,
    commandeId: string,
    auteurId: string,
  ) {
    const commande = await tx.commandeWeb.findUnique({
      where: { id: commandeId },
    });
    if (!commande) throw new BadRequestException('Commande web introuvable.');
    const societeId = await this.requireSocieteId(tx);
    return this.postPosCollectionTx(tx, {
      sourceId: `${WEB_PAY_PREFIX}${commande.id}`,
      societeId,
      date: commande.payeeAt ?? commande.createdAt,
      montant: commande.montantTotal,
      treasuryNumero: this.treasuryNumeroPsp(commande.providerPsp),
      auteurId,
      clientId: commande.clientId,
      lettrage: this.codeLettrage('WEB', commande.id),
      label: `Encaissement web ${commande.id.slice(0, 8).toUpperCase()}`,
      operationId: `gl-web-enc-${commande.id}`,
    });
  }

  private async postPosCollectionTx(
    tx: Prisma.TransactionClient,
    input: {
      sourceId: string;
      societeId: string;
      date: Date;
      montant: Prisma.Decimal | number | string;
      treasuryNumero: '571' | '521' | '572';
      auteurId: string;
      clientId: string | null;
      lettrage: string | null;
      label: string;
      operationId: string;
      refund?: boolean;
    },
  ) {
    const existing = await tx.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: 'ENCAISSEMENT_CLIENT',
          sourceId: input.sourceId,
        },
      },
    });
    if (existing) return existing;
    const compte = await tx.compteComptable.findFirst({
      where: {
        societeId: input.societeId,
        numero: input.treasuryNumero,
        actif: true,
      },
    });
    if (!compte) {
      throw new BadRequestException(
        `Compte de trésorerie ${input.treasuryNumero} introuvable.`,
      );
    }
    const collection = this.calculator.customerCollection(input.montant);
    const lines = input.refund
      ? this.calculator.creditNote(collection)
      : collection;
    const context = await this.ledger.context(
      tx,
      input.societeId,
      'ENCAISSEMENT_CLIENT',
      input.date,
      { treasuryCompteComptableId: compte.id },
    );
    return this.ledger.createEntry(tx, {
      context,
      sourceType: 'ENCAISSEMENT_CLIENT',
      sourceId: input.sourceId,
      label: input.label,
      date: input.date,
      currency: 'XOF',
      operationId: input.operationId,
      authorId: input.auteurId,
      clientId: input.clientId,
      lines,
      lettrage: input.lettrage,
    });
  }

  private ajusterTtcClient(
    lines: ReturnType<P2pAccountingCalculator['saleFromCollectedTtc']>,
    collected: Prisma.Decimal,
  ) {
    const client = lines.find((line) => line.role === 'CUSTOMER');
    if (!client) return;
    const current = new Prisma.Decimal(client.debit);
    if (!current.eq(collected)) {
      const delta = collected.minus(current);
      const sale = lines.find((line) => line.role === 'SALE');
      client.debit = collected;
      if (sale) {
        sale.credit = new Prisma.Decimal(sale.credit).plus(delta);
      }
    }
    this.calculator.assertBalanced(lines);
  }

  private estReglee(vente: {
    paiements: Array<{ montant: Prisma.Decimal }>;
    montantTotal: Prisma.Decimal;
  }) {
    const paye = vente.paiements.reduce(
      (sum, item) => sum.plus(item.montant),
      new Prisma.Decimal(0),
    );
    return paye.eq(vente.montantTotal);
  }

  private treasuryNumeroPos(mode: ModePaiement): '571' | '521' | '572' {
    if (mode === 'ESPECES') return '571';
    if (mode === 'MOBILE_MONEY') return '572';
    return '521';
  }

  private treasuryNumeroFacture(
    mode: 'ESPECES' | 'VIREMENT' | 'MOBILE_MONEY' | 'CARTE',
  ): '571' | '521' | '572' {
    if (mode === 'ESPECES') return '571';
    if (mode === 'MOBILE_MONEY') return '572';
    return '521';
  }

  private treasuryNumeroPsp(provider: ProviderPspShop | null): '521' | '572' {
    if (provider === 'ORANGE_MONEY' || provider === 'WAVE') return '572';
    return '521';
  }

  private tauxProduit(
    produit: Prisma.Decimal | number | string | null,
    defaut: number,
  ) {
    if (produit === null || produit === undefined) return defaut;
    return Number(produit);
  }

  private async tauxTvaDefaut(tx: Prisma.TransactionClient) {
    const params = await tx.parametreShop.findFirst();
    if (!params) return DEFAULT_TAUX_TVA;
    return Number(params.tauxTvaDefaut);
  }

  private async requireSocieteId(tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const societes = await db.societe.findMany({
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

  private async dejaComptabilise(
    sourceType: TypeSourceComptable,
    sourceId: string,
  ) {
    const existing = await this.prisma.ecritureComptable.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
    });
    return Boolean(existing);
  }

  private async auteurSysteme() {
    const raf = await this.prisma.utilisateur.findFirst({
      where: { role: { libelle: 'RAF_COMPTABLE' }, actif: true },
      select: { id: true },
    });
    if (raf) return raf.id;
    const si = await this.prisma.utilisateur.findFirst({
      where: { role: { libelle: 'RESPONSABLE_SI' }, actif: true },
      select: { id: true },
    });
    return si?.id ?? null;
  }

  private codeLettrage(prefix: string, id: string) {
    return `${prefix}-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }
}
