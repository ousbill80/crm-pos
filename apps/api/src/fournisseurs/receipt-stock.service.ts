import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type LigneMiseEnStockAchat } from '@prisma/client';
import { StatutCommandeAchat, StatutReceptionAchat } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import {
  AllocateReceiptCostDto,
  CreateReceptionAchatDto,
  CreateSupplierReturnDto,
  DispatchSupplierReturnDto,
  PutawayReceiptDto,
  QualityDecisionDto,
  ShortCloseDto,
} from './dto/receipt-stock.dto';
import { ReceiptLandedCostCalculator } from './receipt-landed-cost.calculator';
import { ReceptionAchatStateMachine } from './reception-achat-state-machine';
import { StockGlService } from '../accounting-gl/stock-gl.service';

const RECEIPT_INCLUDE = {
  commande: { select: { id: true, numero: true, devise: true } },
  expedition: { select: { id: true, referenceTransport: true } },
  fournisseur: { select: { id: true, nom: true } },
  emplacementQuarantaine: { select: { id: true, code: true, nom: true } },
  receptionnaire: { select: { id: true, nom: true, prenom: true } },
  preuves: true,
  lignes: {
    include: {
      produit: { select: { id: true, designation: true, reference: true } },
      decisionQualite: true,
      lot: true,
    },
  },
  decisionQualite: { include: { lignes: true } },
  miseEnStock: { include: { lignes: true } },
  charges: { include: { allocations: true } },
  retours: { include: { lignes: true } },
} as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class ReceiptStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly machine: ReceptionAchatStateMachine,
    private readonly costs: ReceiptLandedCostCalculator,
    private readonly stockGl: StockGlService,
  ) {}

  async createReceipt(dto: CreateReceptionAchatDto, user: AuthenticatedUser) {
    const replay = await this.prisma.receptionAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: RECEIPT_INCLUDE,
    });
    if (replay) {
      if (replay.receptionnaireId !== user.userId) {
        throw new ConflictException(
          'clientOperationId déjà utilisé par une autre opération.',
        );
      }
      return replay;
    }
    this.assertUnique(dto.lignes.map((line) => line.ligneCommandeId));

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.lockRows(
            tx,
            'ligne_commande_achat',
            dto.lignes.map((line) => line.ligneCommandeId),
          );
          const commande = await tx.commandeAchat.findUnique({
            where: { id: dto.commandeId },
            include: {
              lignes: {
                include: {
                  lignesReceptionAchat: {
                    select: { quantiteRecue: true },
                  },
                  cloturesCourtes: { select: { quantiteAnnulee: true } },
                },
              },
            },
          });
          if (!commande) {
            throw new NotFoundException(
              `Commande ${dto.commandeId} introuvable.`,
            );
          }
          const interdits = new Set([
            'BROUILLON',
            'SOUMISE_APPROBATION',
            'REJETEE',
            'ANNULEE',
            'CLOTUREE',
          ]);
          if (
            interdits.has(commande.statut) ||
            !commande.dateApprobation ||
            !commande.approbateurId
          ) {
            throw new BadRequestException(
              'La réception exige une commande approuvée et encore ouverte.',
            );
          }
          if (dto.expeditionId) {
            const shipment = await tx.expeditionInternationale.findFirst({
              where: {
                id: dto.expeditionId,
                commandeId: commande.id,
              },
            });
            if (!shipment) {
              throw new BadRequestException(
                'L’expédition ne correspond pas à la commande.',
              );
            }
          }
          const quarantine = await tx.entrepot.findUnique({
            where: { id: dto.emplacementQuarantaineId },
          });
          if (
            !quarantine ||
            !quarantine.actif ||
            quarantine.usage !== 'QUARANTAINE'
          ) {
            throw new BadRequestException(
              'La réception quantitative doit cibler un emplacement QUARANTAINE actif.',
            );
          }

          const byId = new Map(commande.lignes.map((line) => [line.id, line]));
          const lines = await Promise.all(
            dto.lignes.map(async (input) => {
              const poLine = byId.get(input.ligneCommandeId);
              if (!poLine) {
                throw new BadRequestException(
                  'Une ligne reçue n’appartient pas à la commande.',
                );
              }
              const alreadyReceived = poLine.lignesReceptionAchat.reduce(
                (sum, item) => sum + item.quantiteRecue,
                0,
              );
              const shortClosed = poLine.cloturesCourtes.reduce(
                (sum, item) => sum + item.quantiteAnnulee,
                0,
              );
              const remaining = poLine.quantite - alreadyReceived - shortClosed;
              if (input.quantiteRecue > remaining) {
                throw new ConflictException(
                  `Sur-réception interdite : reste ${remaining} pour la ligne ${poLine.id}.`,
                );
              }
              if (
                input.numerosSerie &&
                (input.numerosSerie.length !== input.quantiteRecue ||
                  new Set(input.numerosSerie).size !==
                    input.numerosSerie.length)
              ) {
                throw new BadRequestException(
                  'Les numéros de série doivent être uniques et correspondre à la quantité reçue.',
                );
              }
              let lotId: string | null = null;
              if (input.numeroLot) {
                const lot = await tx.lot.upsert({
                  where: {
                    produitId_numero: {
                      produitId: poLine.produitId,
                      numero: input.numeroLot.trim(),
                    },
                  },
                  update: {},
                  create: {
                    produitId: poLine.produitId,
                    numero: input.numeroLot.trim(),
                    dateExpiration: input.dateExpiration
                      ? new Date(input.dateExpiration)
                      : null,
                    createurId: user.userId,
                  },
                });
                lotId = lot.id;
              }
              return {
                ligneCommandeId: poLine.id,
                produitId: poLine.produitId,
                quantiteCommandee: poLine.quantite,
                quantiteRecue: input.quantiteRecue,
                prixUnitaireSnapshot: poLine.prixUnitaire,
                codeBarres: input.codeBarres?.trim() || null,
                numeroLot: input.numeroLot?.trim() || null,
                dateExpiration: input.dateExpiration
                  ? new Date(input.dateExpiration)
                  : null,
                numerosSerie: input.numerosSerie ?? Prisma.JsonNull,
                motifEcart: input.motifEcart?.trim() || null,
                lotId,
              };
            }),
          );

          const receipt = await tx.receptionAchat.create({
            data: {
              numero: this.number('REC', dto.clientOperationId),
              commandeId: commande.id,
              expeditionId: dto.expeditionId,
              fournisseurId: commande.fournisseurId,
              referenceLivraison: dto.referenceLivraison?.trim() || null,
              emplacementQuarantaineId: quarantine.id,
              receptionnaireId: user.userId,
              clientOperationId: dto.clientOperationId,
              lignes: { create: lines },
              preuves: dto.preuves
                ? {
                    create: dto.preuves.map((proof) => ({
                      ...proof,
                      empreinteSha256:
                        proof.empreinteSha256?.toLowerCase() || null,
                    })),
                  }
                : undefined,
            },
            include: RECEIPT_INCLUDE,
          });
          await this.refreshPurchaseOrderStatus(tx, commande.id);
          await this.auditTx(tx, user.userId, 'RECEPTION_ACHAT_QUANTITATIVE', {
            receiptId: receipt.id,
            commandeId: commande.id,
            lineCount: lines.length,
          });
          return receipt;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw this.concurrencyError(error);
    }
  }

  async decideQuality(
    receiptId: string,
    dto: QualityDecisionDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.decisionQualiteAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockRows(tx, 'reception_achat', [receiptId]);
        const receipt = await tx.receptionAchat.findUnique({
          where: { id: receiptId },
          include: { lignes: true, decisionQualite: true },
        });
        if (!receipt) throw new NotFoundException('Réception introuvable.');
        if (receipt.receptionnaireId === user.userId) {
          throw new ForbiddenException(
            'Le réceptionnaire quantitatif ne peut pas prendre la décision qualité.',
          );
        }
        if (receipt.decisionQualite) {
          throw new ConflictException(
            'Une décision qualité existe déjà pour cette réception.',
          );
        }
        this.machine.assertTransition(
          receipt.statut,
          StatutReceptionAchat.QUALITE_VALIDEE,
        );
        this.assertUnique(dto.lignes.map((line) => line.ligneReceptionId));
        if (dto.lignes.length !== receipt.lignes.length) {
          throw new BadRequestException(
            'La décision qualité doit couvrir toutes les lignes reçues.',
          );
        }
        const receiptLines = new Map(
          receipt.lignes.map((line) => [line.id, line]),
        );
        const lines = dto.lignes.map((input) => {
          const receiptLine = receiptLines.get(input.ligneReceptionId);
          if (!receiptLine) {
            throw new BadRequestException(
              'Une ligne qualité n’appartient pas à la réception.',
            );
          }
          if (
            input.quantiteAcceptee + input.quantiteRejetee !==
            receiptLine.quantiteRecue
          ) {
            throw new BadRequestException(
              'Acceptée + rejetée doit égaler la quantité reçue.',
            );
          }
          if (input.quantiteRejetee > 0 && !input.motifRejet?.trim()) {
            throw new BadRequestException(
              'Un motif est obligatoire pour toute quantité rejetée.',
            );
          }
          return {
            ligneReceptionId: receiptLine.id,
            produitId: receiptLine.produitId,
            quantiteAcceptee: input.quantiteAcceptee,
            quantiteRejetee: input.quantiteRejetee,
            motifRejet: input.motifRejet?.trim() || null,
          };
        });
        const decision = await tx.decisionQualiteAchat.create({
          data: {
            receptionId: receipt.id,
            controleurId: user.userId,
            commentaire: dto.commentaire?.trim() || null,
            clientOperationId: dto.clientOperationId,
            lignes: { create: lines },
          },
          include: { lignes: true },
        });
        await tx.receptionAchat.update({
          where: { id: receipt.id },
          data: { statut: 'QUALITE_VALIDEE' },
        });
        await this.auditTx(tx, user.userId, 'RECEPTION_ACHAT_QUALITE_VALIDEE', {
          receiptId,
          accepted: lines.reduce((sum, line) => sum + line.quantiteAcceptee, 0),
          rejected: lines.reduce((sum, line) => sum + line.quantiteRejetee, 0),
        });
        return decision;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async allocateCost(
    receiptId: string,
    dto: AllocateReceiptCostDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.chargeCoutReception.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { allocations: true },
    });
    if (replay) return replay;
    const receipt = await this.prisma.receptionAchat.findUnique({
      where: { id: receiptId },
      include: {
        lignes: {
          include: { decisionQualite: true },
        },
        miseEnStock: true,
      },
    });
    if (!receipt) throw new NotFoundException('Réception introuvable.');
    if (receipt.statut !== 'QUALITE_VALIDEE' || receipt.miseEnStock) {
      throw new BadRequestException(
        'Les coûts réels doivent être alloués après qualité et avant putaway.',
      );
    }
    const accepted = receipt.lignes
      .filter((line) => (line.decisionQualite?.quantiteAcceptee ?? 0) > 0)
      .map((line) => ({
        lineId: line.decisionQualite!.id,
        acceptedQuantity: line.decisionQualite!.quantiteAcceptee,
        goodsValue: line.prixUnitaireSnapshot.mul(
          line.decisionQualite!.quantiteAcceptee,
        ),
      }));
    const allocations = this.costs.allocate(
      dto.methode,
      dto.montant,
      accepted,
      dto.allocations?.map((item) => ({
        lineId: item.ligneQualiteId,
        amount: item.montant,
      })),
    );
    return this.prisma.$transaction(async (tx) => {
      const charge = await tx.chargeCoutReception.create({
        data: {
          receptionId: receiptId,
          libelle: dto.libelle.trim(),
          montant: dto.montant,
          methode: dto.methode,
          clientOperationId: dto.clientOperationId,
          allocations: {
            create: allocations.map((allocation) => {
              const line = receipt.lignes.find(
                (item) => item.decisionQualite?.id === allocation.lineId,
              )!;
              return {
                ligneQualiteId: allocation.lineId,
                produitId: line.produitId,
                montant: allocation.amount,
              };
            }),
          },
        },
        include: { allocations: true },
      });
      await this.auditTx(tx, user.userId, 'COUT_RECEPTION_ALLOUE', {
        receiptId,
        chargeId: charge.id,
        method: dto.methode,
        amount: dto.montant,
      });
      return charge;
    });
  }

  async putaway(
    receiptId: string,
    dto: PutawayReceiptDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.miseEnStockAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    this.assertUnique(dto.lignes.map((line) => line.ligneQualiteId));
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.lockRows(tx, 'reception_achat', [receiptId]);
          const receipt = await tx.receptionAchat.findUnique({
            where: { id: receiptId },
            include: {
              commande: true,
              lignes: {
                include: {
                  decisionQualite: { include: { allocations: true } },
                },
              },
              miseEnStock: true,
            },
          });
          if (!receipt) throw new NotFoundException('Réception introuvable.');
          if (receipt.miseEnStock) {
            throw new ConflictException(
              'Cette réception a déjà été mise en stock.',
            );
          }
          this.machine.assertTransition(
            receipt.statut,
            StatutReceptionAchat.MISE_EN_STOCK,
          );
          const accepted = receipt.lignes.filter(
            (line) => (line.decisionQualite?.quantiteAcceptee ?? 0) > 0,
          );
          if (accepted.length !== dto.lignes.length) {
            throw new BadRequestException(
              'Le putaway doit couvrir exactement toutes les lignes acceptées.',
            );
          }
          const destinations = await tx.entrepot.findMany({
            where: {
              id: { in: dto.lignes.map((line) => line.destinationId) },
              usage: 'STOCK',
              virtuel: false,
              actif: true,
            },
          });
          if (
            destinations.length !==
            new Set(dto.lignes.map((line) => line.destinationId)).size
          ) {
            throw new BadRequestException(
              'Chaque destination de putaway doit être un emplacement STOCK physique actif.',
            );
          }
          await this.lockRows(
            tx,
            'produit',
            accepted.map((line) => line.produitId),
          );
          const putaway = await tx.miseEnStockAchat.create({
            data: {
              receptionId: receiptId,
              operateurId: user.userId,
              clientOperationId: dto.clientOperationId,
            },
          });
          const output: LigneMiseEnStockAchat[] = [];
          for (const line of accepted) {
            const quality = line.decisionQualite!;
            const input = dto.lignes.find(
              (item) => item.ligneQualiteId === quality.id,
            );
            if (!input) {
              throw new BadRequestException(
                'Ligne acceptée absente du putaway.',
              );
            }
            const product = await tx.produit.findUniqueOrThrow({
              where: { id: line.produitId },
            });
            const rate =
              receipt.commande.tauxChangeSnapshot ?? new Prisma.Decimal(1);
            const allocated = quality.allocations.reduce(
              (sum, item) => sum.plus(item.montant),
              new Prisma.Decimal(0),
            );
            const acceptedValue = line.prixUnitaireSnapshot
              .mul(rate)
              .mul(quality.quantiteAcceptee)
              .plus(allocated);
            const unitLanded = acceptedValue.div(quality.quantiteAcceptee);
            const movement = await this.stock.appliquerMouvement(
              {
                produitId: line.produitId,
                entrepotId: input.destinationId,
                type: 'RECEPTION',
                delta: quality.quantiteAcceptee,
                utilisateurId: user.userId,
                reference: `P2P-PUTAWAY:${putaway.id}:${quality.id}`,
                lotId: line.lotId ?? undefined,
              },
              tx,
            );
            const cmp = this.costs.weightedAverage({
              stockBefore: product.stock,
              cmpBefore: product.coutMoyenPondere,
              acceptedQuantity: quality.quantiteAcceptee,
              acceptedValue,
            });
            await tx.produit.update({
              where: { id: product.id },
              data: { coutMoyenPondere: cmp },
            });
            output.push(
              await tx.ligneMiseEnStockAchat.create({
                data: {
                  miseEnStockId: putaway.id,
                  ligneQualiteId: quality.id,
                  produitId: line.produitId,
                  quantite: quality.quantiteAcceptee,
                  destinationId: input.destinationId,
                  lotId: line.lotId,
                  mouvementId: movement.id,
                  coutUnitaireRendu: unitLanded,
                },
              }),
            );
          }
          await tx.receptionAchat.update({
            where: { id: receiptId },
            data: { statut: 'MISE_EN_STOCK' },
          });
          await this.auditTx(tx, user.userId, 'RECEPTION_ACHAT_MISE_EN_STOCK', {
            receiptId,
            putawayId: putaway.id,
            movements: output.map((line) => line.mouvementId),
          });
          const landed = output.reduce(
            (sum, line) => sum.plus(line.coutUnitaireRendu.mul(line.quantite)),
            new Prisma.Decimal(0),
          );
          const societeId = await this.stockGl.resolveSocieteId(
            tx,
            receipt.commande.societeId,
          );
          await this.stockGl.postPutaway(tx, {
            putawayId: putaway.id,
            societeId,
            supplierId: receipt.fournisseurId,
            date: putaway.dateMiseEnStock,
            authorId: user.userId,
            value: landed,
          });
          return { ...putaway, lignes: output };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw this.concurrencyError(error);
    }
  }

  async createReturn(
    receiptId: string,
    dto: CreateSupplierReturnDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.retourFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    return this.prisma.$transaction(
      async (tx) => {
        const receipt = await tx.receptionAchat.findUnique({
          where: { id: receiptId },
          include: {
            decisionQualite: {
              include: {
                lignes: {
                  include: {
                    ligneReception: true,
                    retours: true,
                    misesEnStock: true,
                  },
                },
              },
            },
          },
        });
        if (!receipt?.decisionQualite) {
          throw new BadRequestException(
            'Une décision qualité est requise avant un retour fournisseur.',
          );
        }
        this.assertUnique(dto.lignes.map((line) => line.ligneQualiteId));
        const qualityLines = new Map(
          receipt.decisionQualite.lignes.map((line) => [line.id, line]),
        );
        const lines = dto.lignes.map((input) => {
          const quality = qualityLines.get(input.ligneQualiteId);
          if (!quality) {
            throw new BadRequestException(
              'Une ligne de retour n’appartient pas à cette réception.',
            );
          }
          const previous = quality.retours
            .filter((line) => line.depuisStock === input.depuisStock)
            .reduce((sum, line) => sum + line.quantite, 0);
          const maximum = input.depuisStock
            ? quality.misesEnStock.reduce((sum, line) => sum + line.quantite, 0)
            : quality.quantiteRejetee;
          if (input.quantite > maximum - previous) {
            throw new ConflictException(
              'Quantité de retour supérieure à la quantité disponible.',
            );
          }
          return {
            ligneQualiteId: quality.id,
            produitId: quality.produitId,
            quantite: input.quantite,
            depuisStock: input.depuisStock,
            sourceId: input.sourceId,
            lotId: quality.ligneReception.lotId,
          };
        });
        const result = await tx.retourFournisseur.create({
          data: {
            numero: this.number('RMA', dto.clientOperationId),
            receptionId: receipt.id,
            fournisseurId: receipt.fournisseurId,
            referenceRma: dto.referenceRma?.trim() || null,
            motif: dto.motif.trim(),
            reclamationQualite: dto.reclamationQualite?.trim() || null,
            avoirAttendu: dto.avoirAttendu,
            montantAvoirAttendu: dto.montantAvoirAttendu,
            createurId: user.userId,
            clientOperationId: dto.clientOperationId,
            lignes: { create: lines },
          },
          include: { lignes: true },
        });
        await this.auditTx(tx, user.userId, 'RETOUR_FOURNISSEUR_PREPARE', {
          receiptId,
          returnId: result.id,
          expectedCreditNote: dto.avoirAttendu,
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async dispatchReturn(
    returnId: string,
    dto: DispatchSupplierReturnDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.retourFournisseur.findUnique({
      where: { expeditionOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockRows(tx, 'retour_fournisseur', [returnId]);
        const supplierReturn = await tx.retourFournisseur.findUnique({
          where: { id: returnId },
          include: {
            lignes: true,
            reception: {
              include: {
                commande: { select: { societeId: true } },
                miseEnStock: { include: { lignes: true } },
              },
            },
          },
        });
        if (!supplierReturn) {
          throw new NotFoundException('Retour fournisseur introuvable.');
        }
        if (supplierReturn.statut === 'EXPEDIE') {
          throw new ConflictException('Ce retour a déjà été expédié.');
        }
        await this.lockRows(
          tx,
          'produit',
          supplierReturn.lignes
            .filter((line) => line.depuisStock)
            .map((line) => line.produitId),
        );
        for (const line of supplierReturn.lignes) {
          if (!line.depuisStock) continue;
          const movement = await this.stock.appliquerMouvement(
            {
              produitId: line.produitId,
              entrepotId: line.sourceId,
              type: 'RETOUR_FOURNISSEUR',
              delta: -line.quantite,
              utilisateurId: user.userId,
              reference: `P2P-RMA:${supplierReturn.id}:${line.id}`,
              lotId: line.lotId ?? undefined,
            },
            tx,
          );
          await tx.ligneRetourFournisseur.update({
            where: { id: line.id },
            data: { mouvementId: movement.id },
          });
        }
        const result = await tx.retourFournisseur.update({
          where: { id: returnId },
          data: {
            statut: 'EXPEDIE',
            dateExpedition: new Date(),
            expeditionOperationId: dto.clientOperationId,
          },
          include: { lignes: true },
        });
        const stockLines = supplierReturn.lignes.filter(
          (line) => line.depuisStock,
        );
        if (stockLines.length > 0) {
          const putawayByQuality = new Map(
            (supplierReturn.reception.miseEnStock?.lignes ?? []).map((line) => [
              line.ligneQualiteId,
              line,
            ]),
          );
          const value = stockLines.reduce((sum, line) => {
            const putaway = putawayByQuality.get(line.ligneQualiteId);
            if (!putaway) {
              throw new BadRequestException(
                'Retour depuis stock sans coût rendu de mise en stock.',
              );
            }
            return sum.plus(putaway.coutUnitaireRendu.mul(line.quantite));
          }, new Prisma.Decimal(0));
          const societeId = await this.stockGl.resolveSocieteId(
            tx,
            supplierReturn.reception.commande.societeId,
          );
          await this.stockGl.postSupplierReturnFromStock(tx, {
            returnId,
            societeId,
            supplierId: supplierReturn.fournisseurId,
            date: result.dateExpedition ?? new Date(),
            authorId: user.userId,
            value,
          });
        }
        await this.auditTx(tx, user.userId, 'RETOUR_FOURNISSEUR_EXPEDIE', {
          returnId,
          movements: result.lignes
            .map((line) => line.mouvementId)
            .filter(Boolean),
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async shortClose(
    orderId: string,
    dto: ShortCloseDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.clotureCourteAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    this.assertUnique(dto.lignes.map((line) => line.ligneCommandeId));
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockRows(
          tx,
          'ligne_commande_achat',
          dto.lignes.map((line) => line.ligneCommandeId),
        );
        const order = await tx.commandeAchat.findUnique({
          where: { id: orderId },
          include: {
            lignes: {
              include: {
                lignesReceptionAchat: true,
                cloturesCourtes: true,
              },
            },
          },
        });
        if (!order || ['ANNULEE', 'CLOTUREE'].includes(order.statut)) {
          throw new BadRequestException(
            'Commande introuvable ou déjà terminale.',
          );
        }
        const byId = new Map(order.lignes.map((line) => [line.id, line]));
        const lines = dto.lignes.map((input) => {
          const line = byId.get(input.ligneCommandeId);
          if (!line) {
            throw new BadRequestException(
              'Une ligne de clôture courte n’appartient pas à la commande.',
            );
          }
          const received = line.lignesReceptionAchat.reduce(
            (sum, item) => sum + item.quantiteRecue,
            0,
          );
          const closed = line.cloturesCourtes.reduce(
            (sum, item) => sum + item.quantiteAnnulee,
            0,
          );
          if (input.quantiteAnnulee !== line.quantite - received - closed) {
            throw new BadRequestException(
              'La clôture courte doit annuler exactement le reliquat de la ligne.',
            );
          }
          return {
            ligneCommandeId: line.id,
            quantiteAnnulee: input.quantiteAnnulee,
            motif: input.motif.trim(),
          };
        });
        const result = await tx.clotureCourteAchat.create({
          data: {
            commandeId: order.id,
            motif: dto.motif.trim(),
            approbateurId: user.userId,
            roleSnapshot: user.role,
            clientOperationId: dto.clientOperationId,
            lignes: { create: lines },
          },
          include: { lignes: true },
        });
        await this.refreshPurchaseOrderStatus(tx, order.id, true);
        await this.auditTx(tx, user.userId, 'COMMANDE_ACHAT_SHORT_CLOSE', {
          orderId,
          shortCloseId: result.id,
          lines,
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list() {
    return this.prisma.receptionAchat.findMany({
      include: RECEIPT_INCLUDE,
      orderBy: { dateReception: 'desc' },
    });
  }

  async detail(id: string) {
    const result = await this.prisma.receptionAchat.findUnique({
      where: { id },
      include: RECEIPT_INCLUDE,
    });
    if (!result) throw new NotFoundException('Réception introuvable.');
    return result;
  }

  private async refreshPurchaseOrderStatus(
    tx: Tx,
    orderId: string,
    forceClose = false,
  ) {
    const order = await tx.commandeAchat.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        lignes: {
          include: {
            lignesReceptionAchat: true,
            cloturesCourtes: true,
          },
        },
      },
    });
    const allCovered = order.lignes.every((line) => {
      const received = line.lignesReceptionAchat.reduce(
        (sum, item) => sum + item.quantiteRecue,
        0,
      );
      const closed = line.cloturesCourtes.reduce(
        (sum, item) => sum + item.quantiteAnnulee,
        0,
      );
      return received + closed >= line.quantite;
    });
    const anyReceived = order.lignes.some((line) =>
      line.lignesReceptionAchat.some((item) => item.quantiteRecue > 0),
    );
    const status =
      forceClose && allCovered
        ? StatutCommandeAchat.CLOTUREE
        : allCovered
          ? StatutCommandeAchat.RECEPTIONNEE
          : anyReceived
            ? StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE
            : order.statut;
    if (status !== order.statut) {
      await tx.commandeAchat.update({
        where: { id: order.id },
        data: {
          statut: status,
          dateCloture: status === 'CLOTUREE' ? new Date() : undefined,
        },
      });
    }
  }

  private async auditTx(
    tx: Tx,
    userId: string,
    action: string,
    details: object,
  ) {
    await tx.journalAudit.create({
      data: {
        utilisateurId: userId,
        action,
        entite: 'P2PReceiptStock',
        entiteId:
          ('receiptId' in details && String(details.receiptId)) ||
          ('returnId' in details && String(details.returnId)) ||
          ('orderId' in details && String(details.orderId)) ||
          'P2P',
        details: JSON.stringify(details),
      },
    });
  }

  private async lockRows(tx: Tx, table: string, ids: string[]) {
    if (!ids.length) return;
    const allowed = new Set([
      'ligne_commande_achat',
      'reception_achat',
      'retour_fournisseur',
      'produit',
    ]);
    if (!allowed.has(table))
      throw new Error('Table de verrouillage interdite.');
    await tx.$queryRawUnsafe(
      `SELECT "id" FROM "${table}" WHERE "id" = ANY($1::text[]) FOR UPDATE`,
      ids,
    );
  }

  private assertUnique(values: string[]) {
    if (new Set(values).size !== values.length) {
      throw new BadRequestException('Les lignes dupliquées sont interdites.');
    }
  }

  private number(prefix: string, operationId: string) {
    return `${prefix}-${new Date().getUTCFullYear()}-${operationId.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  }

  private concurrencyError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' || error.code === 'P2002')
    ) {
      return new ConflictException(
        'Conflit concurrent ou opération déjà enregistrée ; relisez la réception.',
      );
    }
    return error;
  }
}
