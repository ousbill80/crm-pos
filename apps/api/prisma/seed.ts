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

async function main() {
  for (const role of ROLES) {
    await ensureRole(role.libelle, role.niveauHabilitation);
  }

  const existingSociete = await prisma.societe.findFirst();
  if (!existingSociete) {
    await prisma.societe.create({
      data: {
        raisonSociale: 'CaissePOS',
        adresse: 'Siège — Dakar',
        telephone: '+221 33 000 00 00',
        email: 'contact@caissepos.local',
        devise: 'XOF',
      },
    });
  }

  let zone = await prisma.zone.findFirst({ where: { nomZone: 'Zone Démo' } });
  if (!zone) {
    zone = await prisma.zone.create({ data: { nomZone: 'Zone Démo' } });
  }

  let boutique = await prisma.boutique.findFirst({
    where: { nom: 'Boutique Démo Plateau' },
  });
  if (!boutique) {
    boutique = await prisma.boutique.create({
      data: {
        nom: 'Boutique Démo Plateau',
        adresse: 'Avenue Léopold Sédar Senghor, Dakar',
        code: 'DEMO-01',
        zoneId: zone.id,
      },
    });
  }

  let entrepot = await prisma.entrepot.findUnique({
    where: {
      boutiqueId_code: { boutiqueId: boutique.id, code: 'PRINCIPAL' },
    },
  });
  if (!entrepot) {
    entrepot = await prisma.entrepot.create({
      data: {
        nom: `Principal — ${boutique.nom}`,
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });
  }

  let caisse = await prisma.caisse.findFirst({
    where: { boutiqueId: boutique.id, type: 'AUXILIAIRE' },
  });
  if (!caisse) {
    caisse = await prisma.caisse.create({
      data: { type: 'AUXILIAIRE', boutiqueId: boutique.id },
    });
  }

  const centrale = await prisma.caisse.findFirst({ where: { type: 'CENTRALE' } });
  if (!centrale) {
    await prisma.caisse.create({ data: { type: 'CENTRALE', boutiqueId: null } });
  }

  // Entrepôts PRINCIPAL pour toute boutique existante
  const boutiques = await prisma.boutique.findMany();
  for (const b of boutiques) {
    await prisma.entrepot.upsert({
      where: { boutiqueId_code: { boutiqueId: b.id, code: 'PRINCIPAL' } },
      update: {},
      create: {
        nom: `Principal — ${b.nom}`,
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: b.id,
      },
    });
  }

  await ensureUser({
    login: 'demo-pos-caissier',
    roleLibelle: 'CAISSIER_BOUTIQUE',
    boutiqueId: boutique.id,
    nom: 'Diallo',
    prenom: 'Aïssatou',
  });
  await ensureUser({
    login: 'demo-pos-temoin',
    roleLibelle: 'RESPONSABLE_BOUTIQUE',
    boutiqueId: boutique.id,
    nom: 'Ndiaye',
    prenom: 'Moussa',
  });
  await ensureUser({
    login: 'demo-convoyeur',
    roleLibelle: 'CONVOYEUR',
    boutiqueId: boutique.id,
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
        boutiqueId: boutique.id,
      },
    });
  }

  // Répartition multi-emplacement : surplus / sous-seuil / rupture pour
  // alimenter le cockpit Inventaire (suggestions de transfert, valorisation).
  const catalogue = [
    {
      designation: 'Coque silicone iPhone',
      reference: 'COQ-IP-SIL',
      categorie: 'Protection',
      prixUnitaire: 2500,
      coutMoyenPondere: 900,
      principal: 40,
      reserve: 12,
      seuilReappro: 10,
      actif: true,
    },
    {
      designation: 'Chargeur USB-C 20W',
      reference: 'CHG-C20',
      categorie: 'Charge',
      prixUnitaire: 4500,
      coutMoyenPondere: 1800,
      principal: 2,
      reserve: 23,
      seuilReappro: 30,
      actif: true,
    },
    {
      designation: 'Écouteurs Bluetooth',
      reference: 'AUD-BT-01',
      categorie: 'Audio',
      prixUnitaire: 12000,
      coutMoyenPondere: 6500,
      principal: 0,
      reserve: 15,
      seuilReappro: 8,
      actif: true,
    },
    {
      designation: 'Verre trempé universel',
      reference: 'PRT-VT-U',
      categorie: 'Protection',
      prixUnitaire: 1500,
      coutMoyenPondere: 400,
      principal: 60,
      reserve: 8,
      seuilReappro: 15,
      actif: true,
    },
    {
      designation: 'Câble USB-C 1m',
      reference: 'CAB-C-1M',
      categorie: 'Câbles',
      prixUnitaire: 2000,
      coutMoyenPondere: 700,
      principal: 50,
      reserve: 20,
      seuilReappro: 12,
      actif: true,
    },
    {
      designation: 'Support voiture (fin de série)',
      reference: 'ACC-SUP-01',
      categorie: 'Accessoires',
      prixUnitaire: 3500,
      coutMoyenPondere: 1200,
      principal: 0,
      reserve: 0,
      seuilReappro: 4,
      actif: true,
    },
    {
      designation: 'Coque iPhone 11 (ancien)',
      reference: 'COQ-IP11',
      categorie: 'Protection',
      prixUnitaire: 1500,
      coutMoyenPondere: 500,
      principal: 4,
      reserve: 0,
      seuilReappro: 5,
      actif: false,
    },
  ];

  for (const article of catalogue) {
    let produit = await prisma.produit.findFirst({
      where: { designation: article.designation },
    });
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
        },
      });
    } else {
      produit = await prisma.produit.update({
        where: { id: produit.id },
        data: {
          reference: article.reference,
          categorie: article.categorie,
          coutMoyenPondere: article.coutMoyenPondere,
          seuilReappro: article.seuilReappro,
          actif: article.actif,
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

  console.log(
    [
      'Seed CaissePOS terminé.',
      `Boutique: ${boutique.nom}`,
      `Caisse auxiliaire: ${caisse.id}`,
      'Comptes (mdp MotDePasse!123):',
      '  demo-pos-caissier / demo-pos-temoin / demo-convoyeur / demo-dg / demo-respsi / demo-central',
    ].join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
