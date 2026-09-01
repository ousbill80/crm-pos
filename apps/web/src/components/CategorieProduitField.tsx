import { useId } from 'react';
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
  const listId = `${fieldId}-suggestions`;
  const { options, isLoading } = useCategoriesProduit(value);

  const suggestions = allowEmpty
    ? options.filter((c) => c !== emptyLabel && c !== '— Choisir —')
    : options;

  return (
    <div className="categorie-produit-field">
      <input
        id={fieldId}
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        placeholder="Ex. Suspension & Direction, Freinage…"
        autoComplete="off"
        aria-label="Catégorie produit"
      />
      <datalist id={listId}>
        {suggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <p className="form-hint-muted">
        Saisie libre ou choix dans les suggestions — visible sur le site e-commerce.
      </p>
      {isLoading ? (
        <p className="form-hint-muted" aria-live="polite">
          Chargement des catégories…
        </p>
      ) : null}
    </div>
  );
}
