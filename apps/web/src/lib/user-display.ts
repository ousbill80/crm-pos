import type { RoleLibelle } from '@caisse-crm/shared';
import { labelProfil } from '@caisse-crm/shared';

/** Initiales lisibles (ex. demo-pos-caissier → DC, pas DE). */
export function initialesLogin(login: string): string {
  const parts = login.split(/[-._@+]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? '';
    const b = parts[parts.length - 1]?.[0] ?? '';
    return `${a}${b}`.toUpperCase();
  }
  return login.slice(0, 2).toUpperCase();
}

const AVATAR_COULEUR: Partial<Record<RoleLibelle, string>> = {
  CAISSIER_BOUTIQUE: '#0f766e',
  RESPONSABLE_BOUTIQUE: '#875A7B',
  CAISSIER_CENTRAL: '#017E84',
  DAF: '#1B4F72',
  DIRECTION_GENERALE: '#5D8DA8',
  CONTROLEUR_INTERNE: '#6C757D',
  SUPERVISEUR_ZONE: '#C45100',
  RESPONSABLE_CRM: '#5B6ABF',
  RESPONSABLE_SI: '#714B67',
  CONVOYEUR: '#00A09D',
};

export function couleurAvatarRole(role: RoleLibelle): string {
  return AVATAR_COULEUR[role] ?? '#714b67';
}

export function libelleProfilUtilisateur(role: RoleLibelle): string {
  return labelProfil(role);
}
