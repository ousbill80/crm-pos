import { BookOpen, Download, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const BASE = '/manuel-caisse';
const HTML_HREF = `${BASE}/Manuel_Utilisation_Caisse_POS.html`;
const DOCX_HREF = `${BASE}/Manuel_Utilisation_Caisse_POS.docx`;
const ZIP_HREF = `${BASE}/Manuel_Utilisation_Caisse_POS_web.zip`;

/**
 * Manuel d’utilisation POS — lecture web + téléchargements Word / HTML.
 * Contenu servi depuis public/manuel-caisse/ (captures incluses).
 */
export function ManuelCaissePage() {
  return (
    <div className="manuel-caisse-page">
      <header className="manuel-caisse-head">
        <div>
          <p className="manuel-caisse-kicker">Aide · Caisse boutique</p>
          <h1>
            <BookOpen size={22} aria-hidden />
            Manuel d’utilisation POS
          </h1>
          <p className="manuel-caisse-lead">
            De la connexion à la clôture, jusqu’au transfert vers la trésorerie
            principale (caisse centrale). Séparation des tâches : la boutique
            initie, la centrale réceptionne et valide.
          </p>
        </div>
        <div className="manuel-caisse-actions">
          <a
            className="btn-primary manuel-caisse-btn"
            href={DOCX_HREF}
            download="Manuel_Utilisation_Caisse_POS.docx"
          >
            <Download size={16} aria-hidden />
            Télécharger Word
          </a>
          <a
            className="manuel-caisse-btn manuel-caisse-btn--ghost"
            href={ZIP_HREF}
            download="Manuel_Utilisation_Caisse_POS_web.zip"
          >
            <Download size={16} aria-hidden />
            Télécharger Web (ZIP)
          </a>
          <a
            className="manuel-caisse-btn manuel-caisse-btn--ghost"
            href={HTML_HREF}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} aria-hidden />
            Ouvrir en plein écran
          </a>
          <Link className="manuel-caisse-btn manuel-caisse-btn--ghost" to="/pos">
            Aller au point de vente
          </Link>
        </div>
      </header>

      <div className="manuel-caisse-frame-wrap">
        <iframe
          className="manuel-caisse-frame"
          title="Manuel d’utilisation — Caisse boutique"
          src={HTML_HREF}
        />
      </div>
    </div>
  );
}
