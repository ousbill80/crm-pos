import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

type PosShortcutLinkProps = {
  /** Libellé principal (défaut : Point de vente). */
  label?: string;
  /** Sous-texte discret sous le libellé. */
  hint?: string;
  /** Variante compacte (une ligne, sans hint). */
  compact?: boolean;
  className?: string;
};

/** Raccourci POS harmonisé — padding, icône et lisibilité dans les en-têtes. */
export function PosShortcutLink({
  label = 'Point de vente',
  hint = 'Encaisser · ticket · retour',
  compact = false,
  className = '',
}: PosShortcutLinkProps) {
  return (
    <Link
      to="/pos"
      className={[
        'pos-shortcut-link',
        compact ? 'pos-shortcut-link--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="pos-shortcut-link-icon" aria-hidden>
        <ShoppingCart size={compact ? 16 : 18} strokeWidth={2.25} />
      </span>
      <span className="pos-shortcut-link-text">
        <span className="pos-shortcut-link-label">{label}</span>
        {!compact && hint ? (
          <span className="pos-shortcut-link-hint">{hint}</span>
        ) : null}
      </span>
    </Link>
  );
}
