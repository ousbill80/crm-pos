import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

export type EntityFinderSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function EntityFinderSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Rechercher…',
  allowEmpty = false,
  emptyLabel = '— Aucun —',
  disabled,
  required,
  ariaLabel,
  maxResults = 50,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: EntityFinderSelectOption[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  maxResults?: number;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [survol, setSurvol] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  function majRect() {
    const el = wrapRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }

  function ouvrir() {
    if (disabled) return;
    majRect();
    setSaisie(selected?.label ?? '');
    setOuvert(true);
    setSurvol(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }

  function fermer() {
    setOuvert(false);
    setSaisie(selected?.label ?? '');
  }

  const qNorm = normaliser(saisie.trim());
  const filtres = useMemo(() => {
    const base = allowEmpty
      ? [{ value: '', label: emptyLabel, keywords: '' }, ...options]
      : options;
    if (!qNorm) return base.slice(0, maxResults);
    return base
      .filter((o) => {
        const hay = normaliser(`${o.label} ${o.keywords ?? ''}`);
        return hay.includes(qNorm);
      })
      .slice(0, maxResults);
  }, [allowEmpty, emptyLabel, maxResults, options, qNorm]);

  useEffect(() => {
    if (survol >= filtres.length) setSurvol(0);
  }, [filtres.length, survol]);

  useEffect(() => {
    if (ouvert) return;
    setSaisie(selected?.label ?? '');
  }, [selected?.label, ouvert]);

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
  }, [ouvert, listId, selected?.label]);

  function choisir(opt: EntityFinderSelectOption) {
    onChange(opt.value);
    setSaisie(opt.label);
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
      else setSurvol((i) => Math.min(i + 1, Math.max(0, filtres.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurvol((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtres[survol];
      if (ouvert && opt) choisir(opt);
    }
  }

  const affiche = ouvert ? saisie : selected?.label ?? '';

  return (
    <div className="entity-finder entity-finder-select" ref={wrapRef}>
      <Search size={14} className="entity-finder-icon" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        placeholder={placeholder}
        value={affiche}
        aria-expanded={ouvert}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        onChange={(e) => {
          setSaisie(e.target.value);
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
              {filtres.length === 0 ? (
                <li className="entity-finder-empty">Aucune correspondance</li>
              ) : (
                filtres.map((opt, i) => (
                  <li
                    key={opt.value || '__empty__'}
                    role="option"
                    aria-selected={opt.value === value}
                  >
                    <button
                      type="button"
                      className={`entity-finder-item${i === survol ? ' is-active' : ''}${opt.value === value ? ' is-selected' : ''}`}
                      onMouseEnter={() => setSurvol(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choisir(opt)}
                    >
                      <span>{opt.label}</span>
                      {opt.value === value ? (
                        <Check size={14} className="entity-finder-check" aria-hidden />
                      ) : null}
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
