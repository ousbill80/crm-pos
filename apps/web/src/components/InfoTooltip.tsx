import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import type { Insight } from '../lib/insights/types';

// Tooltip d'interprétation dynamique : explique un indicateur, l'interprète
// par rapport à sa valeur réelle et propose une recommandation. Le contenu
// vient toujours d'une fonction d'insight par domaine (lib/insights/*.ts) —
// jamais codé en dur ici, ce composant ne fait que l'afficher.
//
// Le panneau est porté dans document.body (position: fixed) : un parent
// overflow:hidden (caisse POS, tableaux, cartes) ne le coupe plus.

export function placerPanneauTooltip(
  trigger: DOMRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const margin = 8;
  const gap = 6;
  let left = trigger.left;
  if (left + panel.width > viewport.width - margin) {
    left = trigger.right - panel.width;
  }
  left = Math.min(
    Math.max(margin, left),
    Math.max(margin, viewport.width - panel.width - margin),
  );
  let top = trigger.bottom + gap;
  if (top + panel.height > viewport.height - margin) {
    top = trigger.top - panel.height - gap;
  }
  if (top < margin) top = margin;
  return { top, left };
}

export function InfoTooltip({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const panelId = useId();

  function cancelClose() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current || !panelRef.current) return;
    const trigger = wrapperRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    setCoords(
      placerPanneauTooltip(trigger, panel, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [open, insight.title, insight.interpretation, insight.recommendation]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      className="info-tooltip"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (wrapperRef.current?.contains(next)) return;
        if (panelRef.current?.contains(next)) return;
        scheduleClose();
      }}
    >
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-describedby={open ? panelId : undefined}
        aria-expanded={open}
        aria-label={`Explication : ${insight.title}`}
        onClick={(e) => {
          e.stopPropagation();
          cancelClose();
          setOpen((v) => !v);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
      >
        <Info size={13} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            className={`info-tooltip-panel info-tooltip-${insight.severity}`}
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? 'visible' : 'hidden',
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="info-tooltip-title">{insight.title}</div>
            <p className="info-tooltip-interpretation">{insight.interpretation}</p>
            {insight.recommendation && (
              <p className="info-tooltip-recommendation">
                <strong>Recommandation.</strong> {insight.recommendation}
              </p>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
