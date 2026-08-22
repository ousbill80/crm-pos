// Seed démo CaissePOS : rôles, société, zone/boutique/caisse/entrepôt,
// utilisateurs démo, produits + quants.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const MOT_DE_PASSE = 'MotDePasse!123';

const ROLES = [
  { libelle: 'DIRECTION_GENERALE', niveauHabilitation: 0 },
  { libelle: 'DAF', niveauHabilitation: 1 },
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
  for (const role of ROLES) {
    await ensureRole(role.libelle, role.niveauHabilitation);
  }

  const existingSociete = await prisma.societe.findFirst();
  if (!existingSociete) {
    await prisma.societe.create({
      data: {
        raisonSociale: 'Marché des Accessoires',
        adresse: 'Abidjan — Plateau',
        telephone: '+225 27 00 00 00 00',
        email: 'contact@marche-accessoires.local',
        devise: 'XOF',
      },
    });
  } else {
    await prisma.societe.update({
      where: { id: existingSociete.id },
      data: { raisonSociale: 'Marché des Accessoires' },
    });
  }

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
    usage: 'STOCK' | 'ENTREE' | 'SORTIE' | 'PERTE' | 'FOURNISSEUR' | 'CLIENT';
    virtuel: boolean;
  }> = [
    { code: 'PRINCIPAL', nom: 'Stock central', type: 'PRINCIPAL', usage: 'STOCK', virtuel: false },
    { code: 'ENTREE', nom: 'Quai de réception', type: 'SECONDAIRE', usage: 'ENTREE', virtuel: false },
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
