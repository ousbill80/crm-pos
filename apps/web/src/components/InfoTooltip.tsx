import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { Insight } from '../lib/insights/types';

// Tooltip d'interprétation dynamique : explique un indicateur, l'interprète
// par rapport à sa valeur réelle et propose une recommandation. Le contenu
// vient toujours d'une fonction d'insight par domaine (lib/insights/*.ts) —
// jamais codé en dur ici, ce composant ne fait que l'afficher.
export function InfoTooltip({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="info-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-describedby={open ? panelId : undefined}
        aria-label={`Explication : ${insight.title}`}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
      >
        <Info size={13} />
      </button>
      {open && (
        <div
          id={panelId}
          role="tooltip"
          className={`info-tooltip-panel info-tooltip-${insight.severity}`}
        >
          <div className="info-tooltip-title">{insight.title}</div>
          <p className="info-tooltip-interpretation">{insight.interpretation}</p>
          {insight.recommendation && (
            <p className="info-tooltip-recommendation">
              <strong>Recommandation.</strong> {insight.recommendation}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
