import { BookOpen, Download, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export type ManuelDocConfig = {
  kicker: string;
  title: string;
  lead: string;
  base: string;
  htmlFile: string;
  docxFile: string;
  zipFile: string;
  iframeTitle: string;
  relatedHref?: string;
  relatedLabel?: string;
};

/**
 * Lecteur web d’un manuel + téléchargements Word / ZIP.
 * Assets servis depuis public/{base}/.
 */
export function ManuelDocPage({ config }: { config: ManuelDocConfig }) {
  const htmlHref = `${config.base}/${config.htmlFile}`;
  const docxHref = `${config.base}/${config.docxFile}`;
  const zipHref = `${config.base}/${config.zipFile}`;

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
          <a
            className="manuel-caisse-btn manuel-caisse-btn--ghost"
            href={zipHref}
            download={config.zipFile}
          >
            <Download size={16} aria-hidden />
            Télécharger Web (ZIP)
          </a>
          <a
            className="manuel-caisse-btn manuel-caisse-btn--ghost"
            href={htmlHref}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} aria-hidden />
            Ouvrir en plein écran
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
