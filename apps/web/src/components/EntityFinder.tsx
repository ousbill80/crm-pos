import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, Plus, Search } from 'lucide-react';

export function EntityFinder({
  id,
  value,
  onChange,
  options,
  placeholder = 'Rechercher…',
  allowCreate = true,
  emptyLabel = 'Aucune correspondance',
  createLabel,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  allowCreate?: boolean;
  emptyLabel?: string;
  createLabel?: (saisie: string) => string;
  disabled?: boolean;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState(value);
  const [survol, setSurvol] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setSaisie(value);
  }, [value]);

  function majRect() {
    const el = wrapRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }

  function ouvrir() {
    if (disabled) return;
    majRect();
    setOuvert(true);
    setSurvol(0);
  }

  function fermer() {
    setOuvert(false);
    setSaisie(value);
  }

  const q = saisie.trim();
  const qNorm = q.toLowerCase();
  const existants = useMemo(() => {
    const vus = new Set<string>();
    const out: string[] = [];
    for (const o of options) {
      const t = o.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (vus.has(k)) continue;
      vus.add(k);
      if (qNorm && !k.includes(qNorm)) continue;
      out.push(t);
    }
    return out.slice(0, 12);
  }, [options, qNorm]);

  const dejaExact = options.some((o) => o.trim().toLowerCase() === qNorm);
  const peutCreer = allowCreate && q.length > 0 && !dejaExact;
  const lignes: Array<{ kind: 'create' | 'option'; label: string }> = [
    ...(peutCreer
      ? [{ kind: 'create' as const, label: q }]
      : []),
    ...existants.map((label) => ({ kind: 'option' as const, label })),
  ];

  useEffect(() => {
    if (survol >= lignes.length) setSurvol(0);
  }, [lignes.length, survol]);

  useEffect(() => {
    if (!ouvert) return;
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const menu = document.getElementById(listId);
      if (menu?.contains(t)) return;
      fermer();
    }
    function onScroll() {
      majRect();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [ouvert, listId, value]);

  function choisir(label: string) {
    onChange(label);
    setSaisie(label);
    setOuvert(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      fermer();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!ouvert) ouvrir();
      else setSurvol((i) => Math.min(i + 1, Math.max(0, lignes.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurvol((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      const ligne = lignes[survol];
      if (ouvert && ligne) {
        e.preventDefault();
        choisir(ligne.label);
      }
    }
  }

  const libelleCreer =
    createLabel ?? ((s: string) => `Créer « ${s} »`);

  return (
    <div className="entity-finder" ref={wrapRef}>
      <Search size={14} className="entity-finder-icon" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={saisie}
        aria-expanded={ouvert}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setSaisie(e.target.value);
          onChange(e.target.value);
          if (!ouvert) ouvrir();
          else majRect();
        }}
        onFocus={ouvrir}
        onKeyDown={onKey}
      />
      <button
        type="button"
        className="entity-finder-toggle"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Ouvrir la liste"
        onClick={() => {
          if (ouvert) fermer();
          else {
            ouvrir();
            inputRef.current?.focus();
          }
        }}
      >
        <ChevronsUpDown size={14} />
      </button>
      {ouvert && rect
        ? createPortal(
            <ul
              id={listId}
              className="entity-finder-list"
              role="listbox"
              style={{
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
              }}
            >
              {lignes.length === 0 ? (
                <li className="entity-finder-empty">{emptyLabel}</li>
              ) : (
                lignes.map((ligne, i) => (
                  <li key={`${ligne.kind}-${ligne.label}`} role="option" aria-selected={i === survol}>
                    <button
                      type="button"
                      className={`entity-finder-item${i === survol ? ' is-active' : ''}${ligne.kind === 'create' ? ' is-create' : ''}`}
                      onMouseEnter={() => setSurvol(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choisir(ligne.label)}
                    >
                      {ligne.kind === 'create' ? (
                        <>
                          <Plus size={14} aria-hidden />
                          <span>{libelleCreer(ligne.label)}</span>
                        </>
                      ) : (
                        <span>{ligne.label}</span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
