import { Plus, Trash2 } from 'lucide-react';
import { ATTRIBUTS_SUGGESTIONS } from '../lib/parse-attributs';

type Props = {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  idPrefix?: string;
};

function newKey(existing: Record<string, string>): string {
  for (const s of ATTRIBUTS_SUGGESTIONS) {
    if (!(s in existing)) return s;
  }
  return 'Caractéristique';
}

export function ProduitAttributsField({ value, onChange, idPrefix = 'attr' }: Props) {
  const entries = Object.entries(value);

  function setKey(oldKey: string, newK: string) {
    if (oldKey === newK) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === oldKey) next[newK.trim() || k] = v;
      else next[k] = v;
    }
    onChange(next);
  }

  function setVal(key: string, val: string) {
    onChange({ ...value, [key]: val });
  }

  function remove(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function add(suggested?: string) {
    const k = suggested && !(suggested in value) ? suggested : newKey(value);
    onChange({ ...value, [k]: '' });
  }

  return (
    <div className="produit-attributs-field">
      <div className="produit-attributs-head">
        <span className="label-muted">
          Caractéristiques site web (Couleur, Culot, Taille…)
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => add()}>
          <Plus size={14} /> Ajouter
        </button>
      </div>
      <div className="produit-attributs-chips">
        {ATTRIBUTS_SUGGESTIONS.filter((s) => !(s in value)).map((s) => (
          <button key={s} type="button" className="chip-suggest" onClick={() => add(s)}>
            + {s}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="form-hint-muted">
          Ex. Culot: H7 · Couleur: Blanc · Température: 6000K — alimentent le sélecteur
          de variantes sur le site.
        </p>
      ) : (
        <ul className="produit-attributs-list">
          {entries.map(([key, val], i) => (
            <li key={`${idPrefix}-${i}`}>
              <input
                aria-label="Nom caractéristique"
                value={key}
                onChange={(e) => setKey(key, e.target.value)}
                placeholder="Couleur"
              />
              <input
                aria-label="Valeur"
                value={val}
                onChange={(e) => setVal(key, e.target.value)}
                placeholder="Blanc"
              />
              <button
                type="button"
                className="btn-icon-danger"
                aria-label="Retirer"
                onClick={() => remove(key)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function designationDepuisAttributs(
  base: string,
  attributs: Record<string, string>,
): string {
  const vals = Object.values(attributs)
    .map((v) => v.trim())
    .filter(Boolean);
  if (!vals.length) return base.trim();
  return `${base.trim()} — ${vals.join(' / ')}`.slice(0, 160);
}
