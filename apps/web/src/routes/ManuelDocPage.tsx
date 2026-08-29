import { BookOpen, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

export type ManuelDocConfig = {
  kicker: string;
  title: string;
  lead: string;
  base: string;
  htmlFile: string;
  docxFile: string;
  iframeTitle: string;
  relatedHref?: string;
  relatedLabel?: string;
};

/**
 * Lecteur web d’un manuel + téléchargement Word.
 * Contenu HTML servi depuis public/{base}/ (lecture dans l’app, pas de téléchargement HTML).
 */
export function ManuelDocPage({ config }: { config: ManuelDocConfig }) {
  const htmlHref = `${config.base}/${config.htmlFile}`;
  const docxHref = `${config.base}/${config.docxFile}`;

  return (
    <div className="manuel-caisse-page">
      <header className="manuel-caisse-head">
        <div>
          <p className="manuel-caisse-kicker">{config.kicker}</p>
          <h1>
            <BookOpen size={22} aria-hidden />
            {config.title}
          </h1>
          <p className="manuel-caisse-lead">{config.lead}</p>
        </div>
        <div className="manuel-caisse-actions">
          <a
            className="btn-primary manuel-caisse-btn"
            href={docxHref}
            download={config.docxFile}
          >
            <Download size={16} aria-hidden />
            Télécharger Word
          </a>
          <Link className="manuel-caisse-btn manuel-caisse-btn--ghost" to="/manuels">
            Tous les manuels
          </Link>
          {config.relatedHref && config.relatedLabel ? (
            <Link
              className="manuel-caisse-btn manuel-caisse-btn--ghost"
              to={config.relatedHref}
            >
              {config.relatedLabel}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="manuel-caisse-frame-wrap">
        <iframe
          className="manuel-caisse-frame"
          title={config.iframeTitle}
          src={htmlHref}
        />
      </div>
    </div>
  );
}
