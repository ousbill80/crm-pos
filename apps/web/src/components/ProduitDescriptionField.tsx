const DESCRIPTION_MAX = 500;

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  /** Formulaire création rapide — texte d’aide plus court. */
  compact?: boolean;
  /** Mode boutique en ligne activé à la création. */
  webMode?: boolean;
};

export function ProduitDescriptionField({
  id,
  value,
  onChange,
  rows = 4,
  compact = false,
  webMode = false,
}: Props) {
  const longueur = value.length;
  const procheLimite = longueur > DESCRIPTION_MAX - 40;

  return (
    <div className="produit-description-field">
      <label htmlFor={id}>
        Description
        <span className="label-muted"> — fiche produit &amp; site web</span>
      </label>
      <textarea
        id={id}
        rows={rows}
        maxLength={DESCRIPTION_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex. Antibrouillards LED H11, culot universel, visibilité pluie et brouillard. Kit complet avec câblage — montage showroom recommandé."
        aria-describedby={`${id}-hint ${id}-count`}
      />
      <div className="produit-description-meta">
        <p id={`${id}-hint`} className="form-hint-muted">
          {webMode
            ? 'Affichée sur la page produit du site — décrivez compatibilité, contenu du kit et usage.'
            : compact
              ? 'Visible sur le site si vous cochez « Publier sur majorautoparts.shop ».'
              : 'Texte affiché sur la page produit du site (onglet Description). Mentionnez compatibilité, contenu du kit et conseils d’usage.'}
        </p>
        <span
          id={`${id}-count`}
          className={`produit-description-count${procheLimite ? ' is-warn' : ''}`}
          aria-live="polite"
        >
          {longueur} / {DESCRIPTION_MAX}
        </span>
      </div>
    </div>
  );
}

export { DESCRIPTION_MAX as PRODUIT_DESCRIPTION_MAX };
