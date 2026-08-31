import { useMemo } from 'react';
import { EntityFinderSelect } from './EntityFinderSelect';

export type EntrepotSelectItem = {
  id: string;
  label: string;
  keywords?: string;
};

export function EntrepotSelectField({
  id,
  value,
  onChange,
  entrepots,
  allowEmpty,
  emptyLabel = '— Choisir —',
  disabled,
  required,
  placeholder = 'Rechercher un entrepôt…',
}: {
  id: string;
  value: string;
  onChange: (entrepotId: string) => void;
  entrepots: EntrepotSelectItem[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const options = useMemo(
    () =>
      entrepots.map((e) => ({
        value: e.id,
        label: e.label,
        keywords: e.keywords,
      })),
    [entrepots],
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
      ariaLabel="Entrepôt"
    />
  );
}
