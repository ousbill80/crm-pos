import { useEffect, useId, useState } from 'react';
import { CATEGORIE_AUTRE } from '../lib/categories-produit';
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
  const customId = `${fieldId}-custom`;
  const { options, isLoading } = useCategoriesProduit(value);

  const valeurConnue = value === '' || options.includes(value);
  const [saisieLibre, setSaisieLibre] = useState(!valeurConnue);

  useEffect(() => {
    setSaisieLibre(!valeurConnue);
  }, [valeurConnue]);

  const selectValue = saisieLibre ? CATEGORIE_AUTRE : value;

  return (
    <div className="categorie-produit-field">
      <select
        id={fieldId}
        value={selectValue}
        disabled={disabled || isLoading}
        onChange={(event) => {
          const choix = event.target.value;
          if (choix === CATEGORIE_AUTRE) {
            setSaisieLibre(true);
            if (options.includes(value)) onChange('');
            return;
          }
          setSaisieLibre(false);
          onChange(choix);
        }}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CATEGORIE_AUTRE}>Autre (saisir…)</option>
      </select>
      {saisieLibre ? (
        <input
          id={customId}
          type="text"
          className="categorie-produit-custom"
          value={value}
          disabled={disabled}
          placeholder="Nom de la catégorie"
          onChange={(event) => onChange(event.target.value)}
          aria-label="Catégorie personnalisée"
        />
      ) : null}
      {isLoading ? (
        <p className="form-hint-muted" aria-live="polite">
          Chargement des catégories…
        </p>
      ) : null}
    </div>
  );
}
