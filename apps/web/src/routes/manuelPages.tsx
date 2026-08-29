import { ManuelDocPage } from './ManuelDocPage';

/** Conservé pour les liens /manuel-caisse. */
export function ManuelCaissePage() {
  return (
    <ManuelDocPage
      config={{
        kicker: 'Aide · Caisse boutique',
        title: 'Manuel d’utilisation POS',
        lead:
          'De la connexion à la clôture, jusqu’au transfert vers la trésorerie principale (caisse centrale). Séparation des tâches : la boutique initie, la centrale réceptionne et valide.',
        base: '/manuel-caisse',
        htmlFile: 'Manuel_Utilisation_Caisse_POS.html',
        docxFile: 'Manuel_Utilisation_Caisse_POS.docx',
        iframeTitle: 'Manuel d’utilisation — Caisse boutique',
        relatedHref: '/pos',
        relatedLabel: 'Aller au point de vente',
      }}
    />
  );
}

export function ManuelTresorerieCentralePage() {
  return (
    <ManuelDocPage
      config={{
        kicker: 'Aide · Trésorerie centrale',
        title: 'Manuel trésorerie centrale',
        lead:
          'Réceptionner les versements en transit, rapprocher (valider ou litige), régulariser. Réservé Caissier central / DAF (§6.4).',
        base: '/manuel-tresorerie-centrale',
        htmlFile: 'Manuel_Utilisation_Tresorerie_Centrale.html',
        docxFile: 'Manuel_Utilisation_Tresorerie_Centrale.docx',
        iframeTitle: 'Manuel — Trésorerie centrale',
        relatedHref: '/tresorerie/reception',
        relatedLabel: 'Réception DAF',
      }}
    />
  );
}

export function ManuelCrmPage() {
  return (
    <ManuelDocPage
      config={{
        kicker: 'Aide · CRM',
        title: 'Manuel module CRM',
        lead:
          'Fiches clients consolidées, interactions, fidélité, segmentation et campagnes (§6.6).',
        base: '/manuel-crm',
        htmlFile: 'Manuel_Utilisation_CRM.html',
        docxFile: 'Manuel_Utilisation_CRM.docx',
        iframeTitle: 'Manuel — CRM',
        relatedHref: '/clients',
        relatedLabel: 'Clients',
      }}
    />
  );
}

export function ManuelStocksAchatsPage() {
  return (
    <ManuelDocPage
      config={{
        kicker: 'Aide · Stocks & Achats',
        title: 'Manuel stocks & achats',
        lead:
          'Catalogue, stocks, inventaires, fournisseurs, commandes, réceptions qualité et factures — avec séparation des tâches P2P.',
        base: '/manuel-stocks-achats',
        htmlFile: 'Manuel_Utilisation_Stocks_Achats.html',
        docxFile: 'Manuel_Utilisation_Stocks_Achats.docx',
        iframeTitle: 'Manuel — Stocks & Achats',
        relatedHref: '/stocks',
        relatedLabel: 'Stocks',
      }}
    />
  );
}

export function ManuelDafFinancePage() {
  return (
    <ManuelDocPage
      config={{
        kicker: 'Aide · DAF & Finance',
        title: 'Manuel DAF & finance',
        lead:
          'Cockpit résultat, stocks valorisés, trésorerie réseau, validation des versements et alertes.',
        base: '/manuel-daf-finance',
        htmlFile: 'Manuel_Utilisation_DAF_Finance.html',
        docxFile: 'Manuel_Utilisation_DAF_Finance.docx',
        iframeTitle: 'Manuel — DAF & Finance',
        relatedHref: '/finance',
        relatedLabel: 'Finance',
      }}
    />
  );
}
