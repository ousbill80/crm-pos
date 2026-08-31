import { useMemo } from 'react';
import { EntityFinderSelect } from './EntityFinderSelect';

export type ProduitSelectItem = {
  id: string;
  designation: string;
  reference?: string | null;
  codeBarres?: string | null;
};

export function ProduitSelectField({
  id,
  value,
  onChange,
  produits,
  allowEmpty,
  emptyLabel,
  disabled,
  required,
  placeholder = 'Rechercher un produit…',
}: {
  id: string;
  value: string;
  onChange: (produitId: string) => void;
  produits: ProduitSelectItem[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const options = useMemo(
    () =>
      produits.map((p) => ({
        value: p.id,
        label: p.designation,
        keywords: [p.reference, p.codeBarres].filter(Boolean).join(' '),
      })),
    [produits],
  );

  return (
    <EntityFinderSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      allowEmpty={allowEmpty}
      emptyLabel={emptyLabel}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      ariaLabel="Produit"
    />
  );
}
