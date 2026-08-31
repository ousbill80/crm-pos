import { useId } from 'react';
import { EntityFinder } from './EntityFinder';
import { useCategoriesProduit } from '../hooks/useCategoriesProduit';

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
};

export function CategorieProduitField({
  id,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = '— Non classé —',
  disabled,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { options, isLoading } = useCategoriesProduit(value);

  const finderOptions = allowEmpty ? [emptyLabel, ...options] : options;

  function normaliserChoix(v: string) {
    return v === emptyLabel ? '' : v;
  }

  return (
    <div className="categorie-produit-field">
      <EntityFinder
        id={fieldId}
        value={value}
        onChange={(v) => onChange(normaliserChoix(v))}
        onSelect={(label) => onChange(normaliserChoix(label))}
        options={finderOptions}
        allowCreate
        placeholder="Rechercher une catégorie…"
        createLabel={(s) => `Utiliser « ${s} »`}
        emptyLabel="Aucune catégorie correspondante"
        isExisting={(saisie) =>
          options.some(
            (c) => c.toLowerCase() === saisie.trim().toLowerCase(),
          )
        }
        disabled={disabled || isLoading}
        ariaLabel="Catégorie produit"
      />
      {isLoading ? (
        <p className="form-hint-muted" aria-live="polite">
          Chargement des catégories…
        </p>
      ) : null}
    </div>
  );
}
