#!/usr/bin/env node
/**
 * Parcours démo P2P bout-en-bout contre l'API réelle.
 * Prérequis : API sur :3000, seed à jour (budget, quarantaine, modèles comptables).
 */
import { createHash, randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const PASS = 'MotDePasse!123';

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data?.message
        ? JSON.stringify(data.message)
        : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function login(loginName) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const data = await req('POST', '/auth/login', {
        body: { login: loginName, password: PASS },
      });
      return data.accessToken;
    } catch (err) {
      if (!String(err.message).includes('429')) throw err;
      const wait = 5 + attempt * 3;
      console.log(`  rate-limit login ${loginName}, pause ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw new Error(`Login impossible pour ${loginName} (throttle)`);
}

async function challenge(token, purpose) {
  const data = await req('POST', '/auth/reauth/challenges', {
    token,
    body: { password: PASS, purpose },
  });
  return data.challengeId;
}

function step(label) {
  console.log(`\n▶ ${label}`);
}

async function main() {
  console.log(`Démo P2P → ${API}`);

  step('Login rôles spécialisés');
  const tokens = {
    achats: await login('demo-achats'),
    daf: await login('demo-daf'),
    logistique: await login('demo-logistique'),
    qualite: await login('demo-qualite'),
    raf: await login('demo-raf'),
    central: await login('demo-central'),
  };
  console.log('  OK');

  step('Référentiels (centre, budget, produits, fournisseur, entrepôts)');
  const centres = await req('GET', '/achats/centres-cout', {
    token: tokens.achats,
  });
  const centre = centres.find((c) => c.code === 'RESEAU') ?? centres[0];
  if (!centre) throw new Error('Aucun centre de coût — relancer le seed.');

  const budgets = await req(
    'GET',
    `/achats/budgets/actifs?centreCoutId=${centre.id}&devise=XOF`,
    { token: tokens.achats },
  );
  const budget = budgets[0];
  if (!budget) throw new Error('Aucun budget actif — relancer le seed.');

  const produitsRaw = await req('GET', '/produits?actif=true', {
    token: tokens.daf,
  });
  const produits = Array.isArray(produitsRaw)
    ? produitsRaw
    : produitsRaw?.items ?? produitsRaw?.data ?? [];
  const produit = produits[0];
  if (!produit) throw new Error('Aucun produit.');

  let fournisseurs = await req('GET', '/fournisseurs', {
    token: tokens.achats,
  });
  if (!Array.isArray(fournisseurs)) fournisseurs = fournisseurs?.items ?? [];
  let fournisseur = fournisseurs.find((f) => f.actif !== false) ?? fournisseurs[0];
  if (!fournisseur) {
    fournisseur = await req('POST', '/fournisseurs', {
      token: tokens.daf,
      body: {
        nom: `Fournisseur Démo P2P ${Date.now()}`,
        pays: 'CI',
        devise: 'XOF',
      },
    });
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const quarantaine = await prisma.entrepot.findFirst({
    where: { usage: 'QUARANTAINE', actif: true },
  });
  const stockDest = await prisma.entrepot.findFirst({
    where: { code: 'PRINCIPAL', reseau: true, actif: true },
  });
  const compteBanque = await prisma.compteTresorerie.findFirst({
    where: { code: 'BANQUE', actif: true },
  });
  const societe = await prisma.societe.findFirst();
  await prisma.$disconnect();
  if (!quarantaine) throw new Error('Entrepôt QUARANTAINE manquant — relancer le seed.');
  if (!stockDest) throw new Error('Entrepôt STOCK PRINCIPAL manquant.');
  if (!compteBanque) throw new Error('CompteTresorerie BANQUE manquant.');
  if (!societe) throw new Error('Société manquante.');

  console.log(
    `  centre=${centre.code} budget=${budget.libelle} produit=${produit.designation}`,
  );

  step('1. Demande d’achat → soumission → approbation DAF');
  const demande = await req('POST', '/achats/demandes', {
    token: tokens.achats,
    body: {
      clientOperationId: randomUUID(),
      objet: 'Démo P2P — réassort accessoires',
      justification: 'Parcours de validation terrain',
      centreCoutId: centre.id,
      budgetId: budget.id,
      devise: 'XOF',
      lignes: [
        {
          produitId: produit.id,
          designation: produit.designation,
          quantite: 5,
          prixEstime: 1000,
        },
      ],
    },
  });
  await req('POST', `/achats/demandes/${demande.id}/soumettre`, {
    token: tokens.achats,
  });
  await req('POST', `/achats/demandes/${demande.id}/approuver`, {
    token: tokens.daf,
  });
  console.log(`  demande ${demande.numero} APPROUVEE`);

  step('2. Commande → soumission ACHATS → approbation DAF');
  const commande = await req('POST', '/achats/commandes', {
    token: tokens.achats,
    body: {
      clientOperationId: randomUUID(),
      societeId: societe.id,
      fournisseurId: fournisseur.id,
      devise: 'XOF',
      notes: 'Démo P2P locale',
      lignes: [
        {
          produitId: produit.id,
          quantite: 5,
          prixUnitaire: 1000,
        },
      ],
    },
  });
  await req('POST', `/achats/commandes/${commande.id}/soumettre`, {
    token: tokens.achats,
  });
  await req('POST', `/achats/commandes/${commande.id}/approuver`, {
    token: tokens.daf,
    body: { clientOperationId: randomUUID(), motif: 'OK démo' },
  });
  const cmdDetail = await req('GET', `/achats/commandes/${commande.id}`, {
    token: tokens.achats,
  });
  const ligneCmd = cmdDetail.lignes[0];
  console.log(`  commande ${cmdDetail.numero} ${cmdDetail.statut}`);

  step('3. PDF bon de commande');
  const pdfRes = await fetch(`${API}/achats/commandes/${commande.id}/pdf`, {
    headers: { Authorization: `Bearer ${tokens.achats}` },
  });
  if (!pdfRes.ok) throw new Error(`PDF → ${pdfRes.status}`);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`  PDF ${pdfBuf.length} octets (${pdfBuf.slice(0, 4).toString()})`);

  step('4. Réception quantitative (Logistique) → quarantaine');
  const reception = await req('POST', '/achats/receptions', {
    token: tokens.logistique,
    body: {
      clientOperationId: randomUUID(),
      commandeId: commande.id,
      emplacementQuarantaineId: quarantaine.id,
      referenceLivraison: `BL-DEMO-${Date.now()}`,
      lignes: [
        {
          ligneCommandeId: ligneCmd.id,
          quantiteRecue: 5,
          numeroLot: `LOT-DEMO-${Date.now()}`,
        },
      ],
    },
  });
  const ligneRec = reception.lignes[0];
  console.log(`  réception ${reception.numero} ${reception.statut}`);

  step('5. Contrôle qualité (acceptation totale)');
  const qualite = await req('POST', `/achats/receptions/${reception.id}/qualite`, {
    token: tokens.qualite,
    body: {
      clientOperationId: randomUUID(),
      commentaire: 'Conforme démo',
      lignes: [
        {
          ligneReceptionId: ligneRec.id,
          quantiteAcceptee: 5,
          quantiteRejetee: 0,
        },
      ],
    },
  });
  const ligneQual = (qualite.decisionQualite ?? qualite).lignes?.[0]
    ?? qualite.lignes?.[0];
  // Recharger détail si besoin
  const recDetail = await req('GET', `/achats/receptions/${reception.id}`, {
    token: tokens.qualite,
  });
  const qualityLine =
    recDetail.decisionQualite?.lignes?.[0] ??
    recDetail.lignes?.[0]?.decisionQualite ??
    ligneQual;
  const ligneQualiteId =
    qualityLine?.id ??
    recDetail.decisionQualite?.lignes?.find(
      (l) => l.ligneReceptionId === ligneRec.id,
    )?.id;
  if (!ligneQualiteId) {
    console.log('  détail réception:', JSON.stringify(recDetail, null, 2).slice(0, 800));
    throw new Error('ligneQualiteId introuvable');
  }
  console.log(`  qualité OK ligne=${ligneQualiteId}`);

  step('6. Putaway → stock PRINCIPAL');
  await req('POST', `/achats/receptions/${reception.id}/putaway`, {
    token: tokens.qualite,
    body: {
      clientOperationId: randomUUID(),
      lignes: [{ ligneQualiteId, destinationId: stockDest.id }],
    },
  });
  console.log(`  putaway → ${stockDest.code}`);

  step('7. Facture P2P + rapprochement trois voies');
  const fiscal = await req('GET', `/achats/centres-cout`, { token: tokens.raf });
  // Récupérer taux TVA via Prisma n'est pas exposé — on crée sans taxe ligne si optionnel,
  // ou on lit depuis commande. On tente sans tauxFiscal si le service l'autorise.
  const docContent = `facture-demo-${Date.now()}`;
  const hash = createHash('sha256').update(docContent).digest('hex');
  const facture = await req('POST', '/achats/factures/p2p', {
    token: tokens.raf,
    body: {
      clientOperationId: randomUUID(),
      fournisseurId: fournisseur.id,
      referenceFournisseur: `FF-DEMO-${Date.now()}`,
      dateDocument: new Date().toISOString(),
      dateEcheance: new Date(Date.now() + 7 * 864e5).toISOString(),
      devise: 'XOF',
      tauxChangeSnapshot: '1',
      document: {
        hashSha256: hash,
        nomFichier: 'facture-demo.pdf',
        mimeType: 'application/pdf',
        tailleOctets: 1024,
        uri: 'memory://demo-facture.pdf',
      },
      lignes: [
        {
          ligneCommandeId: ligneCmd.id,
          ligneQualiteId,
          quantite: 5,
          prixUnitaire: '1000',
        },
      ],
    },
  });
  console.log(
    `  facture ${facture.numero} rapprochement=${facture.statutRapprochement} ttc=${facture.totalTtc ?? facture.montant}`,
  );

  step('8. Comptabilisation SYSCOHADA (RAF + réauth)');
  const chPost = await challenge(tokens.raf, 'P2P_INVOICE_POST');
  const ecriture = await req(
    'POST',
    `/achats/comptabilite/factures/${facture.id}/comptabiliser`,
    {
      token: tokens.raf,
      body: { clientOperationId: randomUUID(), challengeId: chPost },
    },
  );
  console.log(`  écriture ${ecriture.numero} (${ecriture.lignes?.length ?? '?'} lignes)`);

  step('9. Proposition de paiement → approbation DAF → exécution');
  const netAPayer = Number(
    facture.netAPayer ?? facture.totalTtc ?? facture.montant,
  );
  const proposition = await req('POST', '/achats/comptabilite/paiements/propositions', {
    token: tokens.raf,
    body: {
      societeId: societe.id,
      compteTresorerieId: compteBanque.id,
      mode: 'VIREMENT',
      devise: 'XOF',
      dateExecutionPrevue: new Date().toISOString(),
      clientOperationId: randomUUID(),
      allocations: [{ factureId: facture.id, montant: netAPayer }],
    },
  });
  console.log(`  proposition ${proposition.numero} ${proposition.statut}`);

  const chAppr = await challenge(tokens.daf, 'P2P_PAYMENT_APPROVE');
  await req(
    'POST',
    `/achats/comptabilite/paiements/propositions/${proposition.id}/approuver`,
    {
      token: tokens.daf,
      body: { clientOperationId: randomUUID(), challengeId: chAppr },
    },
  );
  console.log('  proposition APPROUVEE (DAF)');

  const chExec = await challenge(tokens.daf, 'P2P_PAYMENT_EXECUTE');
  const paiement = await req(
    'POST',
    `/achats/comptabilite/paiements/propositions/${proposition.id}/executer`,
    {
      token: tokens.daf,
      body: {
        clientOperationId: randomUUID(),
        challengeId: chExec,
        reference: `VIR-DEMO-${Date.now()}`,
      },
    },
  );
  console.log(`  paiement exécuté ${paiement.id ?? paiement.numero ?? 'OK'}`);

  console.log('\n✅ Parcours P2P terminé avec succès.');
  console.log(
    JSON.stringify(
      {
        demandeId: demande.id,
        commandeId: commande.id,
        receptionId: reception.id,
        factureId: facture.id,
        ecritureId: ecriture.id,
        propositionId: proposition.id,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('\n❌ Échec démo:', err.message);
  process.exit(1);
});
