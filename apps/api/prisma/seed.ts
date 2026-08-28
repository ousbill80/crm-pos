// Seed démo CaissePOS : rôles, société, zone/boutique/caisse/entrepôt,
// utilisateurs démo, produits + quants, socle P2P (fiscal / SYSCOHADA / approbations).
import { PrismaClient, TypeJournalComptable, TypeTaxeAchat } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { periodesMensuellesExercice } from '../src/accounting-gl/exercice-scaffold';

const prisma = new PrismaClient();
const MOT_DE_PASSE = 'MotDePasse!123';

/**
 * Seuils démo RegleApprobationAchat (XOF) — valeurs explicites du seed uniquement,
 * jamais reprises comme défauts silencieux dans les services métier.
 * Alignés sur ROLES_APPROBATION_* (DAF / DG) : Achats saisit, DAF/DG décident.
 * - niveau 1 DAF : 0 → 5 000 000
 * - niveau 2 DIRECTION_GENERALE : 5 000 000,01 → illimité
 */
const DEMO_APPROBATION_ACHATS = {
  niveau1: {
    role: 'DAF',
    montantMin: '0',
    montantMax: '5000000',
  },
  niveau2: {
    role: 'DIRECTION_GENERALE',
    montantMin: '5000000.01',
    montantMax: null as string | null,
  },
} as const;

async function seedP2pFoundations(societeId: string) {
  const annee = new Date().getUTCFullYear();
  const debutAnnee = new Date(Date.UTC(annee, 0, 1));
  const finAnnee = new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999));

  const referentiel = await prisma.referentielFiscal.upsert({
    where: {
      societeId_code_version: { societeId, code: 'CI', version: 1 },
    },
    update: {
      pays: 'CI',
      libelle: 'Référentiel fiscal Côte d’Ivoire (CGI) — démo',
      valideDu: debutAnnee,
      valideAu: null,
      actif: true,
    },
    create: {
      societeId,
      code: 'CI',
      version: 1,
      pays: 'CI',
      libelle: 'Référentiel fiscal Côte d’Ivoire (CGI) — démo',
      valideDu: debutAnnee,
      actif: true,
    },
  });

  // Taux paramétrables (placeholders) — le métier lit la base, pas des constantes code.
  const tauxFiscaux: Array<{
    code: string;
    libelle: string;
    type: TypeTaxeAchat;
    taux: string;
    compteComptableCode: string | null;
  }> = [
    {
      code: 'TVA18',
      libelle: 'TVA 18 %',
      type: TypeTaxeAchat.TVA,
      taux: '18',
      compteComptableCode: '4452',
    },
    {
      code: 'DD_PLACEHOLDER',
      libelle: 'Droits de douane (taux démo configurable)',
      type: TypeTaxeAchat.DROIT_DOUANE,
      taux: '5',
      compteComptableCode: null,
    },
    {
      code: 'RETENUE_PLACEHOLDER',
      libelle: 'Retenue à la source (taux démo configurable)',
      type: TypeTaxeAchat.RETENUE,
      taux: '2.2',
      compteComptableCode: null,
    },
  ];
  for (const taux of tauxFiscaux) {
    await prisma.tauxFiscalAchat.upsert({
      where: {
        referentielId_code: {
          referentielId: referentiel.id,
          code: taux.code,
        },
      },
      update: {
        libelle: taux.libelle,
        type: taux.type,
        taux: taux.taux,
        compteComptableCode: taux.compteComptableCode,
        actif: true,
      },
      create: {
        referentielId: referentiel.id,
        code: taux.code,
        libelle: taux.libelle,
        type: taux.type,
        taux: taux.taux,
        compteComptableCode: taux.compteComptableCode,
        actif: true,
      },
    });
  }

  // Plan SYSCOHADA opérationnel (retail XOF) — classes 1–7 + comptes
  // mouvementés par P2P / POS / shop. Pas la liasse officielle OHADA.
  const comptes: Array<{ numero: string; intitule: string }> = [
    { numero: '1', intitule: 'Comptes de ressources durables' },
    { numero: '10', intitule: 'Capital' },
    { numero: '101', intitule: 'Capital social' },
    { numero: '11', intitule: 'Réserves' },
    { numero: '12', intitule: 'Report à nouveau' },
    { numero: '13', intitule: 'Résultat net' },
    { numero: '2', intitule: 'Comptes d’actif immobilisé' },
    { numero: '21', intitule: 'Immobilisations corporelles' },
    { numero: '28', intitule: 'Amortissements' },
    { numero: '3', intitule: 'Comptes de stocks' },
    { numero: '31', intitule: 'Marchandises' },
    { numero: '4', intitule: 'Comptes de tiers' },
    { numero: '40', intitule: 'Fournisseurs et comptes rattachés' },
    { numero: '401', intitule: 'Fournisseurs' },
    { numero: '408', intitule: 'Fournisseurs — factures non parvenues' },
    { numero: '603', intitule: 'Variation des stocks de marchandises' },
    { numero: '409', intitule: 'Fournisseurs débiteurs — acomptes versés' },
    { numero: '41', intitule: 'Clients et comptes rattachés' },
    { numero: '411', intitule: 'Clients' },
    { numero: '42', intitule: 'Personnel' },
    { numero: '421', intitule: 'Personnel — rémunérations dues' },
    { numero: '44', intitule: 'État et collectivités publiques' },
    { numero: '4452', intitule: 'TVA récupérable' },
    { numero: '4457', intitule: 'TVA collectée' },
    { numero: '447', intitule: 'État — retenues à la source' },
    { numero: '5', intitule: 'Comptes de trésorerie' },
    { numero: '52', intitule: 'Banques' },
    { numero: '521', intitule: 'Banques locales' },
    { numero: '57', intitule: 'Caisse' },
    { numero: '571', intitule: 'Caisse siège' },
    { numero: '572', intitule: 'Régies d’avances — mobile money' },
    { numero: '6', intitule: 'Comptes de charges' },
    { numero: '60', intitule: 'Achats et variation de stocks' },
    { numero: '601', intitule: 'Achats de marchandises' },
    { numero: '603', intitule: 'Variation des stocks de marchandises' },
    { numero: '605', intitule: 'Autres achats' },
    { numero: '61', intitule: 'Transports' },
    { numero: '613', intitule: 'Locations et charges locatives' },
    { numero: '616', intitule: 'Primes d’assurance' },
    { numero: '62', intitule: 'Services extérieurs A' },
    { numero: '622', intitule: 'Honoraires et prestations de services' },
    { numero: '624', intitule: 'Transports de biens' },
    { numero: '626', intitule: 'Frais postaux et de télécommunications' },
    { numero: '628', intitule: 'Charges diverses' },
    { numero: '65', intitule: 'Autres charges' },
    { numero: '658', intitule: 'Charges diverses ordinaires' },
    { numero: '67', intitule: 'Frais financiers et charges assimilées' },
    { numero: '676', intitule: 'Pertes de change' },
    { numero: '68', intitule: 'Dotations aux amortissements et provisions' },
    { numero: '6813', intitule: 'Dotations aux amortissements des immobilisations corporelles' },
    { numero: '7', intitule: 'Comptes de produits' },
    { numero: '70', intitule: 'Ventes' },
    { numero: '701', intitule: 'Ventes de marchandises' },
    { numero: '707', intitule: 'Ventes de services' },
    { numero: '75', intitule: 'Autres produits' },
    { numero: '758', intitule: 'Produits divers' },
    { numero: '77', intitule: 'Revenus financiers et produits assimilés' },
    { numero: '776', intitule: 'Gains de change' },
  ];
  const comptesParNumero = new Map<string, string>();
  for (const compte of comptes) {
    const row = await prisma.compteComptable.upsert({
      where: {
        societeId_numero: { societeId, numero: compte.numero },
      },
      update: { intitule: compte.intitule, actif: true },
      create: {
        societeId,
        numero: compte.numero,
        intitule: compte.intitule,
        actif: true,
      },
    });
    comptesParNumero.set(compte.numero, row.id);
  }
  for (const [numero, id] of comptesParNumero) {
    let parentId: string | null = null;
    for (let i = numero.length - 1; i >= 1; i -= 1) {
      const parent = comptesParNumero.get(numero.slice(0, i));
      if (parent) {
        parentId = parent;
        break;
      }
    }
    await prisma.compteComptable.update({
      where: { id },
      data: { parentId },
    });
  }

  const exercice = await prisma.exerciceComptable.upsert({
    where: {
      societeId_code: { societeId, code: String(annee) },
    },
    update: {
      dateDebut: debutAnnee,
      dateFin: finAnnee,
    },
    create: {
      societeId,
      code: String(annee),
      dateDebut: debutAnnee,
      dateFin: finAnnee,
      cloture: false,
    },
  });

  const journaux: Array<{
    code: string;
    libelle: string;
    type: TypeJournalComptable;
  }> = [
    { code: 'ACHATS', libelle: 'Journal des achats', type: TypeJournalComptable.ACHATS },
    { code: 'BANQUE', libelle: 'Journal de banque', type: TypeJournalComptable.BANQUE },
    { code: 'CAISSE', libelle: 'Journal de caisse', type: TypeJournalComptable.CAISSE },
    {
      code: 'OD',
      libelle: 'Opérations diverses',
      type: TypeJournalComptable.OPERATIONS_DIVERSES,
    },
    {
      code: 'VENTES',
      libelle: 'Journal des ventes',
      type: TypeJournalComptable.VENTES,
    },
  ];
  for (const journal of journaux) {
    await prisma.journalComptable.upsert({
      where: {
        exerciceId_code: { exerciceId: exercice.id, code: journal.code },
      },
      update: {
        libelle: journal.libelle,
        type: journal.type,
        actif: true,
      },
      create: {
        societeId,
        exerciceId: exercice.id,
        code: journal.code,
        libelle: journal.libelle,
        type: journal.type,
        actif: true,
      },
    });
  }

  const centreReseau = await prisma.centreCout.upsert({
    where: { societeId_code: { societeId, code: 'RESEAU' } },
    update: { libelle: 'Centre de coût réseau', actif: true, boutiqueId: null },
    create: {
      societeId,
      code: 'RESEAU',
      libelle: 'Centre de coût réseau',
      actif: true,
    },
  });

  // Enveloppe démo explicite (50 M XOF / année) — obligatoire pour créer une demande.
  const budgetExistant = await prisma.budgetAchat.findFirst({
    where: {
      centreCoutId: centreReseau.id,
      libelle: 'Budget Achats réseau (démo)',
      devise: 'XOF',
    },
  });
  if (budgetExistant) {
    await prisma.budgetAchat.update({
      where: { id: budgetExistant.id },
      data: {
        montantAlloue: '50000000',
        dateDebut: debutAnnee,
        dateFin: finAnnee,
        actif: true,
      },
    });
  } else {
    await prisma.budgetAchat.create({
      data: {
        centreCoutId: centreReseau.id,
        libelle: 'Budget Achats réseau (démo)',
        devise: 'XOF',
        montantAlloue: '50000000',
        dateDebut: debutAnnee,
        dateFin: finAnnee,
        actif: true,
      },
    });
  }

  if (!exercice.cloture) {
    for (const periode of periodesMensuellesExercice(annee)) {
      await prisma.periodeComptable.upsert({
        where: {
          exerciceId_code: { exerciceId: exercice.id, code: periode.code },
        },
        update: {
          dateDebut: periode.dateDebut,
          dateFin: periode.dateFin,
        },
        create: {
          societeId,
          exerciceId: exercice.id,
          code: periode.code,
          dateDebut: periode.dateDebut,
          dateFin: periode.dateFin,
          cloture: false,
        },
      });
    }
  }

  const journalAchats = await prisma.journalComptable.findUniqueOrThrow({
    where: { exerciceId_code: { exerciceId: exercice.id, code: 'ACHATS' } },
  });
  const journalBanque = await prisma.journalComptable.findUniqueOrThrow({
    where: { exerciceId_code: { exerciceId: exercice.id, code: 'BANQUE' } },
  });
  const journalCaisse = await prisma.journalComptable.findUniqueOrThrow({
    where: { exerciceId_code: { exerciceId: exercice.id, code: 'CAISSE' } },
  });
  const journalVentes = await prisma.journalComptable.findUniqueOrThrow({
    where: { exerciceId_code: { exerciceId: exercice.id, code: 'VENTES' } },
  });
  const journalOd = await prisma.journalComptable.findUniqueOrThrow({
    where: { exerciceId_code: { exerciceId: exercice.id, code: 'OD' } },
  });

  // Compte retenue optionnel pour modèles facture.
  const compteRetenue = await prisma.compteComptable.upsert({
    where: { societeId_numero: { societeId, numero: '447' } },
    update: { intitule: 'État — retenues à la source', actif: true },
    create: {
      societeId,
      numero: '447',
      intitule: 'État — retenues à la source',
      actif: true,
    },
  });
  comptesParNumero.set('447', compteRetenue.id);

  async function ensureModele(params: {
    code: string;
    version?: number;
    sourceType:
      | 'FACTURE_FOURNISSEUR'
      | 'AVOIR_FOURNISSEUR'
      | 'PAIEMENT_FOURNISSEUR'
      | 'VENTE_POS'
      | 'AVOIR_CLIENT'
      | 'COMMANDE_WEB'
      | 'ENCAISSEMENT_CLIENT'
      | 'FACTURE_CHARGE'
      | 'OD_MANUELLE'
      | 'CLOTURE_EXERCICE'
      | 'A_NOUVEAUX'
      | 'MISE_EN_STOCK'
      | 'RETOUR_STOCK_FOURNISSEUR'
      | 'CMV_VENTE'
      | 'CMV_AVOIR'
      | 'VARIATION_STOCK'
      | 'FACTURE_CLIENT'
      | 'AMORTISSEMENT_IMMO';
    journalId: string;
    lignes: Array<{ role: string; compteId: string }>;
  }) {
    const version = params.version ?? 1;
    const existant = await prisma.modeleComptabilisation.findUnique({
      where: {
        societeId_code_version: {
          societeId,
          code: params.code,
          version,
        },
      },
    });
    if (existant) {
      // Modele + lignes = append-only (ledger-guard) : idempotent sans mutation.
      return existant;
    }
    return prisma.modeleComptabilisation.create({
      data: {
        societeId,
        journalId: params.journalId,
        code: params.code,
        version,
        sourceType: params.sourceType,
        valideDu: debutAnnee,
        actif: true,
        lignes: {
          create: params.lignes.map((ligne, index) => ({
            role: ligne.role as
              | 'ACHAT'
              | 'STOCK'
              | 'TAXE'
              | 'RETENUE'
              | 'FOURNISSEUR'
              | 'TRESORERIE'
              | 'GAIN_CHANGE'
              | 'PERTE_CHANGE'
              | 'CLIENT'
              | 'VENTE'
              | 'TVA_COLLECTEE'
              | 'CHARGE',
            compteId: ligne.compteId,
            ordre: index + 1,
          })),
        },
      },
    });
  }

  const lignesFactureMarchandise = [
    { role: 'ACHAT', compteId: comptesParNumero.get('408')! },
    { role: 'TAXE', compteId: comptesParNumero.get('4452')! },
    { role: 'RETENUE', compteId: comptesParNumero.get('447')! },
    { role: 'FOURNISSEUR', compteId: comptesParNumero.get('401')! },
  ];
  const invoiceV1 = await prisma.modeleComptabilisation.findUnique({
    where: {
      societeId_code_version: {
        societeId,
        code: 'SUPPLIER_INVOICE',
        version: 1,
      },
    },
    include: { lignes: { include: { compte: true } } },
  });
  const invoiceAchat = invoiceV1?.lignes.find((ligne) => ligne.role === 'ACHAT');
  if (!invoiceV1) {
    await ensureModele({
      code: 'SUPPLIER_INVOICE',
      sourceType: 'FACTURE_FOURNISSEUR',
      journalId: journalAchats.id,
      lignes: lignesFactureMarchandise,
    });
    await ensureModele({
      code: 'SUPPLIER_CREDIT_NOTE',
      sourceType: 'AVOIR_FOURNISSEUR',
      journalId: journalAchats.id,
      lignes: lignesFactureMarchandise,
    });
  } else if (invoiceAchat?.compte.numero !== '408') {
    await ensureModele({
      code: 'SUPPLIER_INVOICE',
      version: 2,
      sourceType: 'FACTURE_FOURNISSEUR',
      journalId: journalAchats.id,
      lignes: lignesFactureMarchandise,
    });
    await ensureModele({
      code: 'SUPPLIER_CREDIT_NOTE',
      version: 2,
      sourceType: 'AVOIR_FOURNISSEUR',
      journalId: journalAchats.id,
      lignes: lignesFactureMarchandise,
    });
  }

  const lignesPaiementFx = (tresorerieCompteId: string) => [
    { role: 'FOURNISSEUR', compteId: comptesParNumero.get('401')! },
    { role: 'TRESORERIE', compteId: tresorerieCompteId },
    { role: 'GAIN_CHANGE', compteId: comptesParNumero.get('776')! },
    { role: 'PERTE_CHANGE', compteId: comptesParNumero.get('676')! },
  ];

  async function ensurePaymentTemplate(code: string, journalId: string, tresorerieCompteId: string) {
    const v1 = await ensureModele({
      code,
      sourceType: 'PAIEMENT_FOURNISSEUR',
      journalId,
      lignes: lignesPaiementFx(tresorerieCompteId),
    });
    const lignes = await prisma.ligneModeleComptabilisation.findMany({
      where: { modeleId: v1.id },
    });
    if (!lignes.some((ligne) => ligne.role === 'GAIN_CHANGE')) {
      await ensureModele({
        code,
        version: 2,
        sourceType: 'PAIEMENT_FOURNISSEUR',
        journalId,
        lignes: lignesPaiementFx(tresorerieCompteId),
      });
    }
  }

  await ensurePaymentTemplate(
    'SUPPLIER_PAYMENT_BANK',
    journalBanque.id,
    comptesParNumero.get('521')!,
  );
  await ensurePaymentTemplate(
    'SUPPLIER_PAYMENT_CASH',
    journalCaisse.id,
    comptesParNumero.get('571')!,
  );
  await ensurePaymentTemplate(
    'SUPPLIER_PAYMENT_MOBILE',
    journalBanque.id,
    comptesParNumero.get('572')!,
  );

  const lignesVente = [
    { role: 'CLIENT', compteId: comptesParNumero.get('411')! },
    { role: 'VENTE', compteId: comptesParNumero.get('701')! },
    { role: 'TVA_COLLECTEE', compteId: comptesParNumero.get('4457')! },
  ];
  await ensureModele({
    code: 'POS_SALE',
    sourceType: 'VENTE_POS',
    journalId: journalVentes.id,
    lignes: lignesVente,
  });
  await ensureModele({
    code: 'CUSTOMER_INVOICE',
    sourceType: 'FACTURE_CLIENT',
    journalId: journalVentes.id,
    lignes: lignesVente,
  });
  await ensureModele({
    code: 'CUSTOMER_CREDIT_NOTE',
    sourceType: 'AVOIR_CLIENT',
    journalId: journalVentes.id,
    lignes: lignesVente,
  });
  await ensureModele({
    code: 'WEB_SALE',
    sourceType: 'COMMANDE_WEB',
    journalId: journalVentes.id,
    lignes: lignesVente,
  });
  const lignesEncaissement = (tresorerieCompteId: string) => [
    { role: 'TRESORERIE', compteId: tresorerieCompteId },
    { role: 'CLIENT', compteId: comptesParNumero.get('411')! },
  ];
  await ensureModele({
    code: 'CUSTOMER_RECEIPT_CASH',
    sourceType: 'ENCAISSEMENT_CLIENT',
    journalId: journalCaisse.id,
    lignes: lignesEncaissement(comptesParNumero.get('571')!),
  });
  await ensureModele({
    code: 'CUSTOMER_RECEIPT_BANK',
    sourceType: 'ENCAISSEMENT_CLIENT',
    journalId: journalBanque.id,
    lignes: lignesEncaissement(comptesParNumero.get('521')!),
  });
  await ensureModele({
    code: 'CUSTOMER_RECEIPT_MOBILE',
    sourceType: 'ENCAISSEMENT_CLIENT',
    journalId: journalBanque.id,
    lignes: lignesEncaissement(comptesParNumero.get('572')!),
  });
  await ensureModele({
    code: 'EXPENSE_INVOICE',
    sourceType: 'FACTURE_CHARGE',
    journalId: journalAchats.id,
    lignes: [
      { role: 'CHARGE', compteId: comptesParNumero.get('628')! },
      { role: 'TAXE', compteId: comptesParNumero.get('4452')! },
      { role: 'RETENUE', compteId: comptesParNumero.get('447')! },
      { role: 'FOURNISSEUR', compteId: comptesParNumero.get('401')! },
    ],
  });
  const lignesOd = [
    { role: 'CHARGE', compteId: comptesParNumero.get('628')! },
    { role: 'VENTE', compteId: comptesParNumero.get('701')! },
  ];
  await ensureModele({
    code: 'MANUAL_OD',
    sourceType: 'OD_MANUELLE',
    journalId: journalOd.id,
    lignes: lignesOd,
  });
  await ensureModele({
    code: 'YEAR_CLOSE',
    sourceType: 'CLOTURE_EXERCICE',
    journalId: journalOd.id,
    lignes: lignesOd,
  });
  await ensureModele({
    code: 'OPENING_BALANCE',
    sourceType: 'A_NOUVEAUX',
    journalId: journalOd.id,
    lignes: lignesOd,
  });
  await ensureModele({
    code: 'DEPRECIATION',
    sourceType: 'AMORTISSEMENT_IMMO',
    journalId: journalOd.id,
    lignes: [
      { role: 'CHARGE', compteId: comptesParNumero.get('6813')! },
      { role: 'AMORTISSEMENT', compteId: comptesParNumero.get('28')! },
    ],
  });

  const lignesStockFnp = [
    { role: 'STOCK', compteId: comptesParNumero.get('31')! },
    { role: 'FOURNISSEUR', compteId: comptesParNumero.get('408')! },
  ];
  await ensureModele({
    code: 'STOCK_PUTAWAY',
    sourceType: 'MISE_EN_STOCK',
    journalId: journalAchats.id,
    lignes: lignesStockFnp,
  });
  await ensureModele({
    code: 'STOCK_SUPPLIER_RETURN',
    sourceType: 'RETOUR_STOCK_FOURNISSEUR',
    journalId: journalAchats.id,
    lignes: lignesStockFnp,
  });
  const lignesCmv = [
    { role: 'CHARGE', compteId: comptesParNumero.get('603')! },
    { role: 'STOCK', compteId: comptesParNumero.get('31')! },
  ];
  await ensureModele({
    code: 'COGS_SALE',
    sourceType: 'CMV_VENTE',
    journalId: journalOd.id,
    lignes: lignesCmv,
  });
  await ensureModele({
    code: 'COGS_CREDIT_NOTE',
    sourceType: 'CMV_AVOIR',
    journalId: journalOd.id,
    lignes: lignesCmv,
  });
  await ensureModele({
    code: 'STOCK_VARIANCE',
    sourceType: 'VARIATION_STOCK',
    journalId: journalOd.id,
    lignes: lignesCmv,
  });

  const natures: Array<{ code: string; libelle: string; compte: string }> = [
    { code: 'LOYER', libelle: 'Loyers et charges locatives', compte: '613' },
    { code: 'ASSURANCE', libelle: 'Primes d’assurance', compte: '616' },
    { code: 'HONORAIRES', libelle: 'Honoraires et prestations', compte: '622' },
    { code: 'TELECOM', libelle: 'Télécommunications', compte: '626' },
    { code: 'TRANSPORT', libelle: 'Transport', compte: '624' },
    { code: 'FOURNITURES', libelle: 'Fournitures diverses', compte: '605' },
    { code: 'DIVERS', libelle: 'Charges diverses', compte: '628' },
  ];
  for (const nature of natures) {
    await prisma.natureDepense.upsert({
      where: { societeId_code: { societeId, code: nature.code } },
      update: {
        libelle: nature.libelle,
        compteId: comptesParNumero.get(nature.compte)!,
        actif: true,
      },
      create: {
        societeId,
        code: nature.code,
        libelle: nature.libelle,
        compteId: comptesParNumero.get(nature.compte)!,
        actif: true,
      },
    });
  }

  // Remplace les anciennes bandes (ex. ACHATS niveau 1) pour coller à DAF/DG.
  await prisma.regleApprobationAchat.updateMany({
    where: { societeId, devise: 'XOF', actif: true },
    data: { actif: false, valideAu: new Date() },
  });
  for (const [niveau, bande] of [
    [1, DEMO_APPROBATION_ACHATS.niveau1],
    [2, DEMO_APPROBATION_ACHATS.niveau2],
  ] as const) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { libelle: bande.role },
    });
    const existante = await prisma.regleApprobationAchat.findFirst({
      where: {
        societeId,
        niveau,
        roleId: role.id,
        devise: 'XOF',
      },
    });
    const data = {
      montantMin: bande.montantMin,
      montantMax: bande.montantMax,
      devise: 'XOF',
      actif: true,
      valideDu: debutAnnee,
      valideAu: null as Date | null,
    };
    if (existante) {
      await prisma.regleApprobationAchat.update({
        where: { id: existante.id },
        data,
      });
    } else {
      await prisma.regleApprobationAchat.create({
        data: {
          societeId,
          niveau,
          roleId: role.id,
          ...data,
        },
      });
    }
  }

  const idBanque = comptesParNumero.get('521');
  const idCaisse = comptesParNumero.get('571');
  const idMobile = comptesParNumero.get('572');
  if (idBanque) {
    await prisma.compteTresorerie.upsert({
      where: { societeId_code: { societeId, code: 'BANQUE' } },
      update: {
        libelle: 'Compte bancaire principal',
        type: 'BANK',
        devise: 'XOF',
        compteComptableId: idBanque,
        actif: true,
      },
      create: {
        societeId,
        code: 'BANQUE',
        libelle: 'Compte bancaire principal',
        type: 'BANK',
        devise: 'XOF',
        compteComptableId: idBanque,
        actif: true,
      },
    });
  }
  if (idCaisse) {
    await prisma.compteTresorerie.upsert({
      where: { societeId_code: { societeId, code: 'CAISSE_CENTRALE' } },
      update: {
        libelle: 'Caisse centrale',
        type: 'CENTRAL_CASH',
        devise: 'XOF',
        compteComptableId: idCaisse,
        actif: true,
      },
      create: {
        societeId,
        code: 'CAISSE_CENTRALE',
        libelle: 'Caisse centrale',
        type: 'CENTRAL_CASH',
        devise: 'XOF',
        compteComptableId: idCaisse,
        actif: true,
      },
    });
  }
  if (idMobile) {
    await prisma.compteTresorerie.upsert({
      where: { societeId_code: { societeId, code: 'OM_WAVE' } },
      update: {
        libelle: 'Orange Money / Wave',
        type: 'MOBILE_MONEY',
        devise: 'XOF',
        compteComptableId: idMobile,
        actif: true,
      },
      create: {
        societeId,
        code: 'OM_WAVE',
        libelle: 'Orange Money / Wave',
        type: 'MOBILE_MONEY',
        devise: 'XOF',
        compteComptableId: idMobile,
        actif: true,
      },
    });
  }
}

const ROLES = [
  { libelle: 'DIRECTION_GENERALE', niveauHabilitation: 0 },
  { libelle: 'DAF', niveauHabilitation: 1 },
  { libelle: 'ACHATS', niveauHabilitation: 2 },
  { libelle: 'LOGISTIQUE_TRANSIT_DOUANE', niveauHabilitation: 2 },
  { libelle: 'QUALITE_STOCKS', niveauHabilitation: 2 },
  { libelle: 'RAF_COMPTABLE', niveauHabilitation: 2 },
  { libelle: 'CAISSIER_CENTRAL', niveauHabilitation: 1 },
  { libelle: 'CONTROLEUR_INTERNE', niveauHabilitation: 1 },
  { libelle: 'SUPERVISEUR_ZONE', niveauHabilitation: 2 },
  { libelle: 'RESPONSABLE_BOUTIQUE', niveauHabilitation: 3 },
  { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
  { libelle: 'CONVOYEUR', niveauHabilitation: 4 },
  { libelle: 'RESPONSABLE_SI', niveauHabilitation: 1 },
  { libelle: 'RESPONSABLE_CRM', niveauHabilitation: 1 },
] as const;

async function ensureRole(libelle: string, niveauHabilitation: number) {
  return prisma.role.upsert({
    where: { libelle },
    update: { niveauHabilitation },
    create: { libelle, niveauHabilitation },
  });
}

async function ensureUser(params: {
  login: string;
  roleLibelle: string;
  boutiqueId: string | null;
  nom: string;
  prenom: string;
}) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { libelle: params.roleLibelle },
  });
  const existing = await prisma.utilisateur.findUnique({
    where: { login: params.login },
  });
  if (existing) {
    return prisma.utilisateur.update({
      where: { id: existing.id },
      data: {
        roleId: role.id,
        boutiqueId: params.boutiqueId,
        actif: true,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
      },
    });
  }
  return prisma.utilisateur.create({
    data: {
      login: params.login,
      passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
      nom: params.nom,
      prenom: params.prenom,
      actif: true,
      roleId: role.id,
      boutiqueId: params.boutiqueId,
    },
  });
}

async function ensureBoutiquePointDeVente(params: {
  code: string;
  nom: string;
  adresse: string;
  zoneId: string;
  avecReserve?: boolean;
}) {
  let boutique = await prisma.boutique.findFirst({
    where: { code: params.code },
  });
  if (!boutique) {
    boutique = await prisma.boutique.create({
      data: {
        nom: params.nom,
        adresse: params.adresse,
        code: params.code,
        zoneId: params.zoneId,
        actif: true,
      },
    });
  } else {
    boutique = await prisma.boutique.update({
      where: { id: boutique.id },
      data: {
        nom: params.nom,
        adresse: params.adresse,
        zoneId: params.zoneId,
        actif: true,
      },
    });
  }

  const principal = await prisma.entrepot.upsert({
    where: {
      boutiqueId_code: { boutiqueId: boutique.id, code: 'PRINCIPAL' },
    },
    update: { nom: `Principal — ${params.nom}`, usage: 'STOCK', actif: true },
    create: {
      nom: `Principal — ${params.nom}`,
      code: 'PRINCIPAL',
      type: 'PRINCIPAL',
      usage: 'STOCK',
      boutiqueId: boutique.id,
    },
  });

  if (params.avecReserve) {
    await prisma.entrepot.upsert({
      where: {
        boutiqueId_code: { boutiqueId: boutique.id, code: 'RESERVE' },
      },
      update: { nom: `Réserve — ${params.nom}`, usage: 'STOCK', actif: true },
      create: {
        nom: `Réserve — ${params.nom}`,
        code: 'RESERVE',
        type: 'SECONDAIRE',
        usage: 'STOCK',
        boutiqueId: boutique.id,
      },
    });
  }

  const magasin = await prisma.caisse.findFirst({
    where: { boutiqueId: boutique.id, type: 'MAGASIN' },
  });
  if (!magasin) {
    await prisma.caisse.create({
      data: {
        type: 'MAGASIN',
        boutiqueId: boutique.id,
        libelle: `Caisse magasin — ${params.nom}`,
      },
    });
  }

  const tiroir = await prisma.caisse.findFirst({
    where: { boutiqueId: boutique.id, type: 'TIROIR', code: 'T01' },
  });
  if (!tiroir) {
    await prisma.caisse.create({
      data: {
        type: 'TIROIR',
        boutiqueId: boutique.id,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
  }

  return { boutique, principal };
}

async function main() {
  const dejaSeed = await prisma.utilisateur.findUnique({
    where: { login: 'demo-dg' },
  });
  if (dejaSeed) {
    console.log('Seed déjà appliqué (demo-dg présent) — skip.');
    return;
  }

  for (const role of ROLES) {
    await ensureRole(role.libelle, role.niveauHabilitation);
  }

  const existingSociete = await prisma.societe.findFirst();
  const societeSeed = existingSociete
    ? await prisma.societe.update({
        where: { id: existingSociete.id },
        data: { raisonSociale: 'MAJOR AUTO PARTS' },
      })
    : await prisma.societe.create({
        data: {
          raisonSociale: 'MAJOR AUTO PARTS',
          adresse: 'Abidjan — Plateau',
          telephone: '+225 27 00 00 00 00',
          email: 'contact@majorautoparts.local',
          devise: 'XOF',
        },
      });

  await seedP2pFoundations(societeSeed.id);

  let zone =
    (await prisma.zone.findFirst({
      where: { nomZone: 'Marché des Accessoires' },
    })) ??
    (await prisma.zone.findFirst({ where: { nomZone: 'Zone Démo' } }));
  if (!zone) {
    zone = await prisma.zone.create({
      data: { nomZone: 'Marché des Accessoires' },
    });
  } else if (zone.nomZone !== 'Marché des Accessoires') {
    zone = await prisma.zone.update({
      where: { id: zone.id },
      data: { nomZone: 'Marché des Accessoires' },
    });
  }

  const pointsDeVente = [
    {
      code: 'EXT',
      nom: 'Extérieur',
      adresse: 'Allée Extérieur — Marché des Accessoires',
      avecReserve: true,
    },
    {
      code: 'INT',
      nom: 'Intérieur',
      adresse: 'Hall Intérieur — Marché des Accessoires',
      avecReserve: true,
    },
    {
      code: 'AUTO',
      nom: 'Pièces auto',
      adresse: 'Stand Pièces auto',
    },
    {
      code: 'HUILE',
      nom: 'Huiles & fluides',
      adresse: 'Stand Huiles & fluides',
    },
    {
      code: 'ELEC',
      nom: 'Électronique',
      adresse: 'Stand Électronique',
      avecReserve: true,
    },
    {
      code: 'GSM',
      nom: 'Accessoires GSM',
      adresse: 'Stand Accessoires GSM',
    },
    {
      code: 'QUINC',
      nom: 'Quincaillerie',
      adresse: 'Stand Quincaillerie',
    },
    {
      code: 'MODE',
      nom: 'Mode & bagagerie',
      adresse: 'Stand Mode & bagagerie',
    },
    {
      code: 'COSM',
      nom: 'Cosmétiques',
      adresse: 'Stand Cosmétiques',
    },
    {
      code: 'MAIS',
      nom: 'Maison',
      adresse: 'Stand Maison',
    },
    {
      code: 'CAFE',
      nom: 'Café-Market',
      adresse: 'Café-Market — Marché des Accessoires',
    },
  ] as const;

  // Migre l’ancienne boutique démo vers Extérieur si présente sans code Marché.
  const ancienneDemo = await prisma.boutique.findFirst({
    where: { OR: [{ code: 'DEMO-01' }, { nom: 'Boutique Démo Plateau' }] },
  });
  if (ancienneDemo && ancienneDemo.code !== 'EXT') {
    await prisma.boutique.update({
      where: { id: ancienneDemo.id },
      data: {
        code: 'EXT',
        nom: 'Extérieur',
        adresse: 'Allée Extérieur — Marché des Accessoires',
        zoneId: zone.id,
      },
    });
  }

  const pdv: Array<{
    code: string;
    boutique: { id: string; nom: string };
    principal: { id: string };
  }> = [];
  for (const p of pointsDeVente) {
    const created = await ensureBoutiquePointDeVente({
      ...p,
      zoneId: zone.id,
    });
    pdv.push({
      code: p.code,
      boutique: created.boutique,
      principal: created.principal,
    });
  }

  const boutiqueExt = pdv.find((p) => p.code === 'EXT')!;
  const boutiqueGsm = pdv.find((p) => p.code === 'GSM')!;
  const boutiqueCafe = pdv.find((p) => p.code === 'CAFE')!;
  const boutique = boutiqueExt.boutique;
  const entrepot = boutiqueExt.principal;

  const centrale = await prisma.caisse.findFirst({ where: { type: 'CENTRALE' } });
  if (!centrale) {
    await prisma.caisse.create({ data: { type: 'CENTRALE', boutiqueId: null } });
  }

  let hub = await prisma.boutique.findFirst({ where: { code: 'WH-CENTRAL' } });
  if (!hub) {
    hub = await prisma.boutique.create({
      data: {
        nom: 'Entrepôt Central',
        adresse: 'Siège — stock réseau',
        code: 'WH-CENTRAL',
        zoneId: zone.id,
      },
    });
  } else {
    hub = await prisma.boutique.update({
      where: { id: hub.id },
      data: { zoneId: zone.id, nom: 'Entrepôt Central', actif: true },
    });
  }
  const emplacementsHub: Array<{
    code: string;
    nom: string;
    type: 'PRINCIPAL' | 'SECONDAIRE';
    usage:
      | 'STOCK'
      | 'ENTREE'
      | 'SORTIE'
      | 'PERTE'
      | 'FOURNISSEUR'
      | 'CLIENT'
      | 'QUARANTAINE';
    virtuel: boolean;
  }> = [
    { code: 'PRINCIPAL', nom: 'Stock central', type: 'PRINCIPAL', usage: 'STOCK', virtuel: false },
    { code: 'ENTREE', nom: 'Quai de réception', type: 'SECONDAIRE', usage: 'ENTREE', virtuel: false },
    {
      code: 'QUARANTAINE',
      nom: 'Quarantaine qualité',
      type: 'SECONDAIRE',
      usage: 'QUARANTAINE',
      virtuel: false,
    },
    { code: 'SORTIE', nom: 'Quai de sortie', type: 'SECONDAIRE', usage: 'SORTIE', virtuel: false },
    { code: 'PERTE', nom: 'Pertes / rebuts', type: 'SECONDAIRE', usage: 'PERTE', virtuel: false },
    { code: 'FOURNISSEUR', nom: 'Fournisseurs (virtuel)', type: 'SECONDAIRE', usage: 'FOURNISSEUR', virtuel: true },
    { code: 'CLIENT', nom: 'Clients (virtuel)', type: 'SECONDAIRE', usage: 'CLIENT', virtuel: true },
  ];
  for (const e of emplacementsHub) {
    await prisma.entrepot.upsert({
      where: { boutiqueId_code: { boutiqueId: hub.id, code: e.code } },
      update: { usage: e.usage, reseau: true, virtuel: e.virtuel, type: e.type, nom: e.nom },
      create: {
        nom: e.nom,
        code: e.code,
        type: e.type,
        usage: e.usage,
        reseau: true,
        virtuel: e.virtuel,
        boutiqueId: hub.id,
      },
    });
  }

  const hubStock = await prisma.entrepot.findUniqueOrThrow({
    where: { boutiqueId_code: { boutiqueId: hub.id, code: 'PRINCIPAL' } },
  });

  await ensureUser({
    login: 'demo-pos-caissier',
    roleLibelle: 'CAISSIER_BOUTIQUE',
    boutiqueId: boutiqueExt.boutique.id,
    nom: 'Diallo',
    prenom: 'Aïssatou',
  });
  await ensureUser({
    login: 'demo-pos-temoin',
    roleLibelle: 'RESPONSABLE_BOUTIQUE',
    boutiqueId: boutiqueExt.boutique.id,
    nom: 'Ndiaye',
    prenom: 'Moussa',
  });
  await ensureUser({
    login: 'demo-caissier-gsm',
    roleLibelle: 'CAISSIER_BOUTIQUE',
    boutiqueId: boutiqueGsm.boutique.id,
    nom: 'Koné',
    prenom: 'Fatou',
  });
  await ensureUser({
    login: 'demo-resp-gsm',
    roleLibelle: 'RESPONSABLE_BOUTIQUE',
    boutiqueId: boutiqueGsm.boutique.id,
    nom: 'Ouattara',
    prenom: 'Yves',
  });
  await ensureUser({
    login: 'demo-caissier-cafe',
    roleLibelle: 'CAISSIER_BOUTIQUE',
    boutiqueId: boutiqueCafe.boutique.id,
    nom: 'Bamba',
    prenom: 'Sarah',
  });
  await ensureUser({
    login: 'demo-resp-cafe',
    roleLibelle: 'RESPONSABLE_BOUTIQUE',
    boutiqueId: boutiqueCafe.boutique.id,
    nom: 'Coulibaly',
    prenom: 'Issa',
  });
  await ensureUser({
    login: 'demo-convoyeur',
    roleLibelle: 'CONVOYEUR',
    boutiqueId: boutiqueExt.boutique.id,
    nom: 'Fall',
    prenom: 'Ibrahima',
  });
  await ensureUser({
    login: 'demo-dg',
    roleLibelle: 'DIRECTION_GENERALE',
    boutiqueId: null,
    nom: 'Ba',
    prenom: 'Aminata',
  });
  await ensureUser({
    login: 'demo-respsi',
    roleLibelle: 'RESPONSABLE_SI',
    boutiqueId: null,
    nom: 'Admin',
    prenom: 'Système',
  });
  await ensureUser({
    login: 'demo-central',
    roleLibelle: 'CAISSIER_CENTRAL',
    boutiqueId: null,
    nom: 'Ba',
    prenom: 'Fatou',
  });
  await ensureUser({
    login: 'demo-daf',
    roleLibelle: 'DAF',
    boutiqueId: null,
    nom: 'Traoré',
    prenom: 'Mariam',
  });
  await ensureUser({
    login: 'demo-achats',
    roleLibelle: 'ACHATS',
    boutiqueId: null,
    nom: 'Koné',
    prenom: 'Adama',
  });
  await ensureUser({
    login: 'demo-logistique',
    roleLibelle: 'LOGISTIQUE_TRANSIT_DOUANE',
    boutiqueId: null,
    nom: 'Yao',
    prenom: 'Serge',
  });
  await ensureUser({
    login: 'demo-qualite',
    roleLibelle: 'QUALITE_STOCKS',
    boutiqueId: null,
    nom: 'Kouassi',
    prenom: 'Aïcha',
  });
  await ensureUser({
    login: 'demo-raf',
    roleLibelle: 'RAF_COMPTABLE',
    boutiqueId: null,
    nom: 'Diallo',
    prenom: 'Ibrahim',
  });
  await ensureUser({
    login: 'demo-controle',
    roleLibelle: 'CONTROLEUR_INTERNE',
    boutiqueId: null,
    nom: 'Sow',
    prenom: 'Awa',
  });
  await ensureUser({
    login: 'demo-superviseur',
    roleLibelle: 'SUPERVISEUR_ZONE',
    boutiqueId: boutiqueExt.boutique.id,
    nom: 'Diop',
    prenom: 'Cheikh',
  });
  await ensureUser({
    login: 'demo-crm',
    roleLibelle: 'RESPONSABLE_CRM',
    boutiqueId: null,
    nom: 'Cissé',
    prenom: 'Lamine',
  });

  let reserve = await prisma.entrepot.findUnique({
    where: {
      boutiqueId_code: { boutiqueId: boutique.id, code: 'RESERVE' },
    },
  });
  if (!reserve) {
    reserve = await prisma.entrepot.create({
      data: {
        nom: `Réserve — ${boutique.nom}`,
        code: 'RESERVE',
        type: 'SECONDAIRE',
        usage: 'STOCK',
        boutiqueId: boutique.id,
      },
    });
  }

  // Catalogue démo — stocks élevés pour tests POS / circuit (pas de plafonds).
  // Quelques références restent sous seuil / en rupture pour le cockpit inventaire.
  const catalogue: Array<{
    designation: string;
    reference: string;
    categorie: string;
    prixUnitaire: number;
    coutMoyenPondere: number;
    principal: number;
    reserve: number;
    hub: number;
    boutiques: number;
    seuilReappro: number;
    actif: boolean;
    // EAN-13 fournisseur déjà saisi sur quelques articles démo — le reste du
    // catalogue reste sans code pour exercer la génération automatique
    // Code128 à l'impression d'étiquettes (apps/api/src/produits/produits.service.ts).
    codeBarres?: string;
  }> = [
    {
      designation: 'Coque silicone iPhone',
      reference: 'COQ-IP-SIL',
      categorie: 'Protection',
      prixUnitaire: 2500,
      coutMoyenPondere: 900,
      principal: 180,
      reserve: 60,
      hub: 400,
      boutiques: 120,
      seuilReappro: 20,
      actif: true,
      codeBarres: '3760012345670',
    },
    {
      designation: 'Chargeur USB-C 20W',
      reference: 'CHG-C20',
      categorie: 'Charge',
      prixUnitaire: 4500,
      coutMoyenPondere: 1800,
      principal: 150,
      reserve: 40,
      hub: 350,
      boutiques: 100,
      seuilReappro: 25,
      actif: true,
      codeBarres: '3760012345687',
    },
    {
      designation: 'Écouteurs Bluetooth',
      reference: 'AUD-BT-01',
      categorie: 'Audio',
      prixUnitaire: 12000,
      coutMoyenPondere: 6500,
      principal: 90,
      reserve: 30,
      hub: 200,
      boutiques: 70,
      seuilReappro: 15,
      actif: true,
      codeBarres: '3760012345694',
    },
    {
      designation: 'Verre trempé universel',
      reference: 'PRT-VT-U',
      categorie: 'Protection',
      prixUnitaire: 1500,
      coutMoyenPondere: 400,
      principal: 250,
      reserve: 80,
      hub: 500,
      boutiques: 150,
      seuilReappro: 30,
      actif: true,
    },
    {
      designation: 'Câble USB-C 1m',
      reference: 'CAB-C-1M',
      categorie: 'Câbles',
      prixUnitaire: 2000,
      coutMoyenPondere: 700,
      principal: 220,
      reserve: 70,
      hub: 450,
      boutiques: 140,
      seuilReappro: 25,
      actif: true,
    },
    {
      designation: 'Powerbank 10 000 mAh',
      reference: 'PWR-10K',
      categorie: 'Charge',
      prixUnitaire: 8500,
      coutMoyenPondere: 4200,
      principal: 100,
      reserve: 35,
      hub: 220,
      boutiques: 80,
      seuilReappro: 15,
      actif: true,
    },
    {
      designation: 'Coque Samsung A54',
      reference: 'COQ-A54',
      categorie: 'Protection',
      prixUnitaire: 2800,
      coutMoyenPondere: 950,
      principal: 160,
      reserve: 50,
      hub: 300,
      boutiques: 110,
      seuilReappro: 20,
      actif: true,
    },
    {
      designation: 'Écouteurs filaires Jack 3.5',
      reference: 'AUD-J35',
      categorie: 'Audio',
      prixUnitaire: 3500,
      coutMoyenPondere: 1100,
      principal: 140,
      reserve: 45,
      hub: 280,
      boutiques: 90,
      seuilReappro: 18,
      actif: true,
    },
    {
      designation: 'Câble Lightning 1m',
      reference: 'CAB-LT-1M',
      categorie: 'Câbles',
      prixUnitaire: 2500,
      coutMoyenPondere: 800,
      principal: 170,
      reserve: 55,
      hub: 320,
      boutiques: 100,
      seuilReappro: 20,
      actif: true,
    },
    {
      designation: 'Adaptateur USB-C → Jack',
      reference: 'ADP-C-J',
      categorie: 'Accessoires',
      prixUnitaire: 3000,
      coutMoyenPondere: 900,
      principal: 130,
      reserve: 40,
      hub: 250,
      boutiques: 85,
      seuilReappro: 15,
      actif: true,
    },
    {
      designation: 'Carte mémoire 64 Go',
      reference: 'MEM-64',
      categorie: 'Stockage',
      prixUnitaire: 5500,
      coutMoyenPondere: 2800,
      principal: 110,
      reserve: 35,
      hub: 200,
      boutiques: 75,
      seuilReappro: 12,
      actif: true,
    },
    {
      designation: 'Support téléphone bureau',
      reference: 'ACC-SUP-B',
      categorie: 'Accessoires',
      prixUnitaire: 4000,
      coutMoyenPondere: 1500,
      principal: 95,
      reserve: 30,
      hub: 180,
      boutiques: 65,
      seuilReappro: 10,
      actif: true,
    },
    // Cas inventaire : sous-seuil (tests alertes)
    {
      designation: 'Chargeur allume-cigare (sous seuil)',
      reference: 'CHG-AUTO-SS',
      categorie: 'Charge',
      prixUnitaire: 3200,
      coutMoyenPondere: 1200,
      principal: 4,
      reserve: 2,
      hub: 8,
      boutiques: 3,
      seuilReappro: 20,
      actif: true,
    },
    // Rupture volontaire
    {
      designation: 'Support voiture (fin de série)',
      reference: 'ACC-SUP-01',
      categorie: 'Accessoires',
      prixUnitaire: 3500,
      coutMoyenPondere: 1200,
      principal: 0,
      reserve: 0,
      hub: 0,
      boutiques: 0,
      seuilReappro: 4,
      actif: true,
    },
    {
      designation: 'Coque iPhone 11 (ancien)',
      reference: 'COQ-IP11',
      categorie: 'Protection',
      prixUnitaire: 1500,
      coutMoyenPondere: 500,
      principal: 8,
      reserve: 0,
      hub: 5,
      boutiques: 0,
      seuilReappro: 5,
      actif: false,
    },
  ];

  const destBoutiquesPos = [
    boutiqueGsm.principal.id,
    boutiqueCafe.principal.id,
    ...pdv
      .filter((p) => !['EXT', 'GSM', 'CAFE'].includes(p.code))
      .map((p) => p.principal.id),
  ];

  for (const article of catalogue) {
    let produit = await prisma.produit.findFirst({
      where: {
        OR: [
          { reference: article.reference },
          { designation: article.designation },
        ],
      },
    });
    const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="36" fill="#0F766E"/><text x="120" y="132" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="800" fill="#fff">${article.reference.slice(0, 6)}</text></svg>`,
    )}`;
    if (!produit) {
      produit = await prisma.produit.create({
        data: {
          designation: article.designation,
          reference: article.reference,
          categorie: article.categorie,
          prixUnitaire: article.prixUnitaire,
          stock: 0,
          seuilReappro: article.seuilReappro,
          coutMoyenPondere: article.coutMoyenPondere,
          actif: article.actif,
          codeBarres: article.codeBarres,
          imageUrl,
        },
      });
    } else {
      produit = await prisma.produit.update({
        where: { id: produit.id },
        data: {
          designation: article.designation,
          reference: article.reference,
          categorie: article.categorie,
          prixUnitaire: article.prixUnitaire,
          coutMoyenPondere: article.coutMoyenPondere,
          seuilReappro: article.seuilReappro,
          actif: article.actif,
          codeBarres: article.codeBarres ?? produit.codeBarres,
          imageUrl: produit.imageUrl?.startsWith('data:')
            ? produit.imageUrl
            : imageUrl,
        },
      });
    }

    await prisma.stockQuant.upsert({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: entrepot.id,
        },
      },
      update: { quantite: article.principal },
      create: {
        produitId: produit.id,
        entrepotId: entrepot.id,
        quantite: article.principal,
      },
    });
    await prisma.stockQuant.upsert({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: reserve.id,
        },
      },
      update: { quantite: article.reserve },
      create: {
        produitId: produit.id,
        entrepotId: reserve.id,
        quantite: article.reserve,
      },
    });
    await prisma.stockQuant.upsert({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: hubStock.id,
        },
      },
      update: { quantite: article.hub },
      create: {
        produitId: produit.id,
        entrepotId: hubStock.id,
        quantite: article.hub,
      },
    });

    for (const destId of destBoutiquesPos) {
      await prisma.stockQuant.upsert({
        where: {
          produitId_entrepotId: {
            produitId: produit.id,
            entrepotId: destId,
          },
        },
        update: {
          quantite: article.actif ? article.boutiques : 0,
        },
        create: {
          produitId: produit.id,
          entrepotId: destId,
          quantite: article.actif ? article.boutiques : 0,
        },
      });
    }

    const somme = await prisma.stockQuant.aggregate({
      where: { produitId: produit.id },
      _sum: { quantite: true },
    });
    await prisma.produit.update({
      where: { id: produit.id },
      data: { stock: somme._sum.quantite ?? 0 },
    });
  }

  // Migre stock legacy sans quant
  const premierEntrepot = await prisma.entrepot.findFirst({
    where: { type: 'PRINCIPAL' },
    orderBy: { nom: 'asc' },
  });
  if (premierEntrepot) {
    const produitsLegacy = await prisma.produit.findMany({
      where: { stock: { gt: 0 }, quants: { none: {} } },
    });
    for (const produit of produitsLegacy) {
      await prisma.stockQuant.create({
        data: {
          produitId: produit.id,
          entrepotId: premierEntrepot.id,
          quantite: produit.stock,
        },
      });
    }
  }

  const fournisseursDemo = [
    {
      nom: 'Grossiste Accessoires SARL',
      contact: 'Kouadio Jean',
      telephone: '+225 07 00 11 22 33',
      email: 'commandes@grossiste-accessoires.ci',
      adresse: 'Zone industrielle Yopougon, Abidjan',
      notes: 'Principal fournisseur câbles et protections.',
    },
    {
      nom: 'Import Téléphonie CI',
      contact: 'Awa Diallo',
      telephone: '+225 05 44 55 66 77',
      email: 'awa@import-tel.ci',
      adresse: 'Adjamé, marché de la téléphonie',
      notes: 'Import audio et charge.',
    },
  ];
  for (const fiche of fournisseursDemo) {
    const existant = await prisma.fournisseur.findFirst({
      where: { nom: fiche.nom },
    });
    if (existant) {
      await prisma.fournisseur.update({
        where: { id: existant.id },
        data: fiche,
      });
    } else {
      await prisma.fournisseur.create({ data: fiche });
    }
  }

  // E-commerce — ParametreShop, zone livraison, produits web (PLAN-E-COMMERCE Lot 1)
  const societe = await prisma.societe.findFirstOrThrow();
  await prisma.parametreShop.upsert({
    where: { societeId: societe.id },
    update: {
      shopActif: true,
      entrepotWebDefautId: hubStock.id,
      retraitActif: true,
      livraisonActive: true,
    },
    create: {
      societeId: societe.id,
      shopActif: true,
      entrepotWebDefautId: hubStock.id,
      dureeReservationPanierMin: 15,
      retraitActif: true,
      livraisonActive: true,
      modeAffichagePrix: 'HT',
      tauxTvaDefaut: 18,
      fallbackPrixMagasin: true,
      paiementRetraitActif: true,
      paiementLivraisonActif: true,
    },
  });

  await prisma.boutique.update({
    where: { id: boutiqueExt.boutique.id },
    data: {
      retraitWebActif: true,
      entrepotWebId: entrepot.id,
      delaiRetraitHeures: 4,
    },
  });

  await prisma.zoneLivraison.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      libelle: 'Abidjan intra-muros',
      actif: true,
      tarifForfait: 1500,
      villesJson: ['Abidjan', 'Plateau', 'Cocody'],
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      libelle: 'Abidjan intra-muros',
      actif: true,
      tarifForfait: 1500,
      delaiJoursMin: 1,
      delaiJoursMax: 3,
      villesJson: ['Abidjan', 'Plateau', 'Cocody'],
    },
  });

  const refsWeb = [
    { ref: 'COQ-IP15', slug: 'coque-silicone-iphone', prixWeb: 4500 },
    { ref: 'CHG-20W', slug: 'chargeur-usbc-20w', prixWeb: 8500 },
    { ref: 'ECO-BT', slug: 'ecouteurs-bluetooth', prixWeb: 12000 },
    { ref: 'VRG-UNIV', slug: 'verre-trempe-universel', prixWeb: 2500 },
    { ref: 'CBL-USBC', slug: 'cable-usbc-1m', prixWeb: 3500 },
  ];
  for (const item of refsWeb) {
    const p = await prisma.produit.findFirst({ where: { reference: item.ref } });
    if (p) {
      await prisma.produit.update({
        where: { id: p.id },
        data: {
          visibleWeb: true,
          prixWeb: item.prixWeb,
          slug: item.slug,
          tauxTva: 18,
        },
      });
    }
  }

  // Variantes e-commerce démo — kit phares LED (sélecteurs type Temu)
  const phareVariants = [
    {
      ref: 'LED-H7-W',
      slug: 'kit-phares-led-h7',
      designation: 'Kit phares LED H7 blanc 6000K',
      attributs: 'Culot: H7 | Couleur: Blanc | Température: 6000K',
      prixWeb: 28500,
    },
    {
      ref: 'LED-H4-W',
      slug: 'kit-phares-led-h4',
      designation: 'Kit phares LED H4 blanc 6000K',
      attributs: 'Culot: H4 | Couleur: Blanc | Température: 6000K',
      prixWeb: 29500,
    },
    {
      ref: 'LED-H11-W',
      slug: 'kit-phares-led-h11',
      designation: 'Kit phares LED H11 blanc 6000K',
      attributs: 'Culot: H11 | Couleur: Blanc | Température: 6000K',
      prixWeb: 27500,
    },
    {
      ref: 'LED-H7-Y',
      slug: 'kit-phares-led-h7-jaune',
      designation: 'Kit phares LED H7 jaune 3000K',
      attributs: 'Culot: H7 | Couleur: Jaune | Température: 3000K',
      prixWeb: 28900,
    },
  ] as const;

  let phareParentId: string | null = null;
  for (const [i, v] of phareVariants.entries()) {
    const existing = await prisma.produit.findFirst({
      where: { reference: v.ref },
    });
    const data = {
      designation: v.designation,
      reference: v.ref,
      categorie: 'Phares',
      description:
        'Kit LED plug & play — faisceau adapté, faible consommation. Vérifier le culot avant montage.',
      prixUnitaire: v.prixWeb,
      prixWeb: v.prixWeb,
      visibleWeb: true,
      actif: true,
      slug: v.slug,
      tauxTva: 18,
      attributs: v.attributs,
      parentId: i === 0 ? null : phareParentId,
    };
    const row = existing
      ? await prisma.produit.update({ where: { id: existing.id }, data })
      : await prisma.produit.create({ data });
    if (i === 0) phareParentId = row.id;
    else if (phareParentId && row.parentId !== phareParentId) {
      await prisma.produit.update({
        where: { id: row.id },
        data: { parentId: phareParentId },
      });
    }
  }

  console.log(
    [
      'Seed Marché des Accessoires terminé.',
      `Zone: ${zone.nomZone}`,
      `Points de vente: ${pdv.map((p) => p.boutique.nom).join(', ')}`,
      `Hub: ${hub.nom} (${hub.code})`,
      'Comptes (mdp MotDePasse!123) — 10 profils §4 :',
      '  Direction: demo-dg / demo-daf / demo-controle',
      '  Trésorerie: demo-central',
      '  Zone: demo-superviseur',
      '  Boutique: demo-pos-caissier / demo-pos-temoin / demo-convoyeur',
      '  Support: demo-respsi / demo-crm',
      '  Achats P2P: demo-achats / demo-logistique / demo-qualite / demo-raf',
      '  (aussi) GSM: demo-caissier-gsm / demo-resp-gsm · Café: demo-caissier-cafe / demo-resp-cafe',
    ].join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
