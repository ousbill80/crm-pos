/** Déduit nom / prénom / contact pour POST /crm/clients (PHYSIQUE). */
export function parseSaisieClient(raw: string): {
  nom: string;
  prenom: string;
  contact?: string;
} {
  const q = raw.trim().replace(/\s+/g, ' ');
  const phoneLike = /^[\d+\s.-]{6,}$/.test(q);
  if (phoneLike) {
    const contact = q.replace(/\s+/g, '');
    return { nom: 'Client', prenom: 'Nouveau', contact };
  }
  const parts = q.split(' ');
  if (parts.length >= 2) {
    return { prenom: parts[0], nom: parts.slice(1).join(' ') };
  }
  return { prenom: q, nom: q };
}
