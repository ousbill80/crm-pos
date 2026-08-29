import { RoleLibelle } from '@caisse-crm/shared';
import {
  assemblerSnapshotVentes,
  synthetiserCompteResultat,
  synthetiserCloture,
  type SnapshotCloture,
  type SnapshotFinance,
  type SnapshotGl,
  type SnapshotShop,
  type SnapshotStocks,
  type SnapshotVentes,
} from './staff-briefing.engine';
import {
  renderBriefing,
  type BriefingHtml,
  type LiensBriefing,
} from './staff-briefing.templates';
import {
  renderMailDigestDaf,
  renderMailPointNonVerse,
  renderMailReceptionDaf,
} from '../alertes/alertes-mail';

export type EchantillonMail = {
  type: string;
  canal: 'briefing' | 'alerte';
  mail: BriefingHtml;
};

export function liensDefaut(): LiensBriefing {
  const crm = 'https://crm.majorautoparts.shop';
  const shop = 'https://www.majorautoparts.shop';
  return {
    crm,
    shop,
    dashboard: `${crm}/dashboard`,
    finance: `${crm}/finance`,
    croissance: `${crm}/clients/croissance`,
  };
}

export function marquerMailTest(mail: BriefingHtml): BriefingHtml {
  const bandeau =
    '<div style="background:#b42318;color:#fff;padding:10px 16px;font:12px/1.4 sans-serif">E-MAIL DE TEST — maquette des envois automatiques. Ne pas traiter comme une alerte opérationnelle.</div>';
  return {
    objet: `[TEST] ${mail.objet}`.slice(0, 180),
    text: `[TEST — ne pas traiter comme une alerte opérationnelle]\n${mail.text}`,
    html: mail.html.includes('<body')
      ? mail.html.replace(/<body([^>]*)>/i, `<body$1>${bandeau}`)
      : `${bandeau}${mail.html}`,
  };
}

function ventesIllustration(
  horizon: SnapshotVentes['horizon'],
  periodeLabel: string,
): SnapshotVentes {
  return assemblerSnapshotVentes({
    horizon,
    periodeLabel,
    caReseau: 2_450_000,
    tickets: 86,
    parBoutique: [
      { nom: 'Marcory', ca: 820_000, tickets: 28 },
      { nom: 'Yopougon', ca: 610_000, tickets: 22 },
      { nom: 'Cocody', ca: 540_000, tickets: 18 },
      { nom: 'Plateau', ca: 480_000, tickets: 18 },
      { nom: 'Café-Market', ca: 0, tickets: 0 },
    ],
    caWeb: 185_000,
    commandesWeb: 7,
    mixPaiement: [
      { mode: 'ESPECES', montant: 1_520_000, tickets: 51 },
      { mode: 'MOBILE_MONEY', montant: 640_000, tickets: 22 },
      { mode: 'CARTE', montant: 290_000, tickets: 13 },
    ],
    litigesOuverts: 1,
    versementsEnRetard: 2,
    boutiquesTotal: 5,
    caPrecedent: 2_180_000,
    ticketsPrecedent: 79,
  });
}

function financeIllustration(): SnapshotFinance {
  return {
    initiee: { n: 2, montant: 210_000 },
    enTransit: { n: 1, montant: 84_000 },
    receptionnee: { n: 1, montant: 95_000 },
    valideePeriode: { n: 11, montant: 1_840_000 },
    litige: { n: 1, montant: 32_000 },
    versementsEnRetard: 2,
  };
}

function stocksIllustration(): SnapshotStocks {
  return { valeurStock: 48_500_000, ruptures: 6, sousSeuil: 14 };
}

function glIllustration(): SnapshotGl {
  return synthetiserCompteResultat(
    [
      {
        numero: '701',
        intitule: 'Ventes de marchandises',
        debit: '0',
        credit: '2450000',
        solde: '-2450000',
      },
      {
        numero: '613',
        intitule: 'Loyers',
        debit: '450000',
        credit: '0',
        solde: '450000',
      },
      {
        numero: '622',
        intitule: 'Rémunérations d’intermédiaires',
        debit: '80000',
        credit: '0',
        solde: '80000',
      },
    ],
    {
      fileAttente: 2,
      fileErreur: 0,
      facturesFournisseurOuvertes: 3,
      montantFacturesOuvertes: 1_200_000,
      lotsPaiementAApprouver: 1,
    },
  );
}

function clotureIllustration(): SnapshotCloture {
  const ouverte: Parameters<typeof synthetiserCloture>[0][number] = {
    id: 's-ouverte',
    statut: 'OUVERTE',
    ouvertureDateHeure: new Date('2026-08-29T08:05:00Z'),
    clotureDateHeure: null,
    clotureTemoinId: null,
    boutiqueNom: 'Plateau',
    caisseLibelle: 'Tiroir 1',
  };
  const fermee: Parameters<typeof synthetiserCloture>[0][number] = {
    id: 's-fermee',
    statut: 'FERMEE',
    ouvertureDateHeure: new Date('2026-08-29T08:00:00Z'),
    clotureDateHeure: new Date('2026-08-29T19:12:00Z'),
    clotureTemoinId: 'temoin',
    boutiqueNom: 'Marcory',
    caisseLibelle: 'Tiroir 1',
  };
  return synthetiserCloture(
    [ouverte, fermee],
    new Date('2026-08-29T20:10:00Z'),
    20,
  );
}

function shopIllustration(): SnapshotShop {
  return {
    shopActif: true,
    produitsVisibles: 42,
    commandes7j: 0,
    sessions7j: 310,
  };
}

/** Maquettes HTML (chiffres d’illustration) — pour envoi de test hors base. */
export function echantillonsIllustration(
  liens = liensDefaut(),
): EchantillonMail[] {
  const role = RoleLibelle.DAF;
  const prenom = 'Équipe';
  const ventesJour = ventesIllustration('JOUR', '2026-08-29');
  const ventesSemaine = ventesIllustration('SEMAINE', 'semaine 2026-W35');
  const ventesMois = ventesIllustration('MOIS', '2026-08');
  const cloture = clotureIllustration();
  const stocks = stocksIllustration();
  const finance = financeIllustration();
  const gl = glIllustration();
  const shop = shopIllustration();
  const briefings: EchantillonMail[] = [
    {
      type: 'SOIR',
      canal: 'briefing',
      mail: renderBriefing('SOIR', role, prenom, {
        ventes: ventesJour,
        cloture,
        liens,
      }),
    },
    {
      type: 'HEBDO',
      canal: 'briefing',
      mail: renderBriefing('HEBDO', role, prenom, {
        ventes: ventesSemaine,
        stocks,
        finance,
        gl,
        liens,
      }),
    },
    {
      type: 'MOIS',
      canal: 'briefing',
      mail: renderBriefing('MOIS', role, prenom, {
        ventes: ventesMois,
        stocks,
        finance,
        gl,
        liens,
      }),
    },
    {
      type: 'CLOTURE_CAISSE',
      canal: 'briefing',
      mail: renderBriefing('CLOTURE_CAISSE', role, prenom, { cloture, liens }),
    },
    {
      type: 'RELANCE_CONNEXION',
      canal: 'briefing',
      mail: renderBriefing('RELANCE_CONNEXION', role, prenom, {
        heuresSansConnexion: 72,
        liens,
      }),
    },
    {
      type: 'SHOP_INACTIF',
      canal: 'briefing',
      mail: renderBriefing('SHOP_INACTIF', role, prenom, { shop, liens }),
    },
  ];
  const posUrl = `${liens.crm}/pos`;
  const receptionUrl = `${liens.crm}/tresorerie/reception`;
  const alertes: EchantillonMail[] = [
    {
      type: 'POINT_JOUR_NON_VERSE',
      canal: 'alerte',
      mail: renderMailPointNonVerse({
        boutique: 'Marcory',
        montant: '125000',
        ageHeures: 26,
        ctaUrl: posUrl,
      }),
    },
    {
      type: 'RECEPTION_DAF_EN_ATTENTE',
      canal: 'alerte',
      mail: renderMailReceptionDaf({
        boutique: 'Yopougon',
        montant: '84000',
        ctaUrl: receptionUrl,
      }),
    },
    {
      type: 'DIGEST_FONDS_DAF',
      canal: 'alerte',
      mail: renderMailDigestDaf({
        nonTransferes: [
          {
            boutique: 'Marcory',
            montant: '125000',
            etape: 'Non transféré',
            age: '26 h',
          },
        ],
        aReceptionner: [
          {
            boutique: 'Yopougon',
            montant: '84000',
            etape: 'En transit — à réceptionner',
            age: '2 h',
          },
        ],
        ctaUrl: receptionUrl,
      }),
    },
  ];
  return [...briefings, ...alertes].map((e) => ({
    ...e,
    mail: marquerMailTest(e.mail),
  }));
}
