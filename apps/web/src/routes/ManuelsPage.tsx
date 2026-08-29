import { BookOpen, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

const MANUELS = [
  {
    to: '/manuel-caisse',
    titre: 'Caisse boutique (POS)',
    public: 'Caissier · Responsable boutique',
    resume:
      'Ouverture, ventes, clôture, transfert vers la trésorerie principale.',
    docx: '/manuel-caisse/Manuel_Utilisation_Caisse_POS.docx',
  },
  {
    to: '/manuels/tresorerie-centrale',
    titre: 'Trésorerie centrale',
    public: 'Caissier central · DAF',
    resume: 'Réceptionner, rapprocher, litiges — machine à états §6.4.',
    docx: '/manuel-tresorerie-centrale/Manuel_Utilisation_Tresorerie_Centrale.docx',
  },
  {
    to: '/manuels/crm',
    titre: 'Module CRM',
    public: 'Responsable CRM',
    resume: 'Clients, interactions, fidélité, segmentation, campagnes.',
    docx: '/manuel-crm/Manuel_Utilisation_CRM.docx',
  },
  {
    to: '/manuels/stocks-achats',
    titre: 'Stocks & Achats',
    public: 'Achats · Logistique · Qualité · RAF',
    resume: 'Catalogue, stocks, inventaires, commandes, réceptions, factures.',
    docx: '/manuel-stocks-achats/Manuel_Utilisation_Stocks_Achats.docx',
  },
  {
    to: '/manuels/daf-finance',
    titre: 'DAF & Finance',
    public: 'DAF · Direction · Contrôle',
    resume: 'Cockpit résultat / stocks / cash, validation et alertes.',
    docx: '/manuel-daf-finance/Manuel_Utilisation_DAF_Finance.docx',
  },
] as const;

/**
 * Hub des manuels d’utilisation — lecture web + téléchargements.
 */
export function ManuelsPage() {
  return (
    <div className="manuels-hub">
      <header className="manuels-hub-head">
        <p className="manuel-caisse-kicker">Application Aide</p>
        <h1>
          <BookOpen size={22} aria-hidden />
          Manuels d’utilisation
        </h1>
        <p className="manuels-hub-lead">
          Guides métier intégrés à CaissePOS (captures réelles). Lecture en
          ligne dans l’app ; téléchargement Word si besoin.
        </p>
      </header>

      <ul className="manuels-hub-grid">
        {MANUELS.map((m) => (
          <li key={m.to} className="manuels-hub-card">
            <div>
              <h2>
                <Link to={m.to}>{m.titre}</Link>
              </h2>
              <p className="manuels-hub-public">{m.public}</p>
              <p className="manuels-hub-resume">{m.resume}</p>
            </div>
            <div className="manuels-hub-actions">
              <Link className="btn-primary" to={m.to}>
                Lire
              </Link>
              <a
                className="manuel-caisse-btn manuel-caisse-btn--ghost"
                href={m.docx}
                download
              >
                <Download size={14} aria-hidden />
                Word
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
