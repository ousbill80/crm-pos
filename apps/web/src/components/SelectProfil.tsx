import {
  FAMILLE_PROFIL_LIBELLES,
  LISTE_PROFILS,
  RoleLibelle,
} from '@caisse-crm/shared';

export function SelectProfil({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: RoleLibelle;
  onChange: (role: RoleLibelle) => void;
  disabled?: boolean;
}) {
  const familles = [...new Set(LISTE_PROFILS.map((p) => p.famille))];

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RoleLibelle)}
    >
      {familles.map((famille) => (
        <optgroup key={famille} label={FAMILLE_PROFIL_LIBELLES[famille]}>
          {LISTE_PROFILS.filter((p) => p.famille === famille).map((p) => (
            <option key={p.role} value={p.role}>
              {p.libelle}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
