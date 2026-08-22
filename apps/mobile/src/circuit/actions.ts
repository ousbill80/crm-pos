import {
  RoleLibelle,
  ROLES_INITIATION_SORTIE_FONDS,
  ROLES_MISE_EN_TRANSIT,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  ROLES_VALIDATION_CAISSE_CENTRALE,
  StatutTransaction,
  TypeTransaction,
  profilOf,
} from '@caisse-crm/shared';

/** POS écriture : `apps.pos === true` (caissier / responsable), pas la lecture siège. */
export function peutEncaisserPos(role: RoleLibelle): boolean {
  return profilOf(role).apps.pos === true;
}

/** SI / CRM n’ont pas l’app trésorerie (§4). */
export function accesTresorerieMobile(role: RoleLibelle): boolean {
  return profilOf(role).apps.treasury !== undefined;
}

/** Stocks / inventaire physique. */
export function accesInventaireMobile(role: RoleLibelle): boolean {
  return profilOf(role).apps.inventory !== undefined;
}

export function accesAppMobile(role: RoleLibelle): boolean {
  return accesTresorerieMobile(role) || accesInventaireMobile(role);
}

export type OngletMobile = 'Caisse' | 'Circuit' | 'Caisses' | 'Inventaire';

export function ongletsMobile(role: RoleLibelle): OngletMobile[] {
  const tabs: OngletMobile[] = [];
  if (accesTresorerieMobile(role)) {
    tabs.push(
      ...(peutEncaisserPos(role)
        ? (['Caisse', 'Circuit', 'Caisses'] as const)
        : (['Circuit', 'Caisses'] as const)),
    );
  }
  if (accesInventaireMobile(role)) tabs.push('Inventaire');
  return tabs;
}

export function accueilOnglet(role: RoleLibelle): OngletMobile {
  if (peutEncaisserPos(role)) return 'Caisse';
  if (accesTresorerieMobile(role)) return 'Circuit';
  return 'Inventaire';
}

export function peutCompterInventaire(role: RoleLibelle): boolean {
  return (
    role === RoleLibelle.RESPONSABLE_SI ||
    role === RoleLibelle.DIRECTION_GENERALE ||
    role === RoleLibelle.RESPONSABLE_BOUTIQUE ||
    role === RoleLibelle.CAISSIER_BOUTIQUE
  );
}

export function peutValiderInventaire(role: RoleLibelle): boolean {
  return (
    role === RoleLibelle.RESPONSABLE_SI ||
    role === RoleLibelle.DIRECTION_GENERALE ||
    role === RoleLibelle.DAF ||
    role === RoleLibelle.RESPONSABLE_BOUTIQUE
  );
}

export function labelStatutInventaire(statut: string): string {
  if (statut === 'EN_COURS') return 'En cours';
  if (statut === 'VALIDE') return 'Validé';
  if (statut === 'ANNULE') return 'Annulé';
  return statut;
}

export function peutNouveauVersement(role: RoleLibelle): boolean {
  return ROLES_INITIATION_SORTIE_FONDS.includes(role);
}

export function peutPasserEnTransit(
  role: RoleLibelle,
  statut: StatutTransaction,
): boolean {
  return (
    statut === StatutTransaction.INITIEE &&
    ROLES_MISE_EN_TRANSIT.includes(role)
  );
}

export function peutReceptionner(
  role: RoleLibelle,
  statut: StatutTransaction,
): boolean {
  return (
    statut === StatutTransaction.EN_TRANSIT &&
    ROLES_VALIDATION_CAISSE_CENTRALE.includes(role)
  );
}

export function peutRapprocher(
  role: RoleLibelle,
  statut: StatutTransaction,
): boolean {
  return (
    statut === StatutTransaction.RECEPTIONNEE &&
    (ROLES_VALIDATION_CAISSE_CENTRALE.includes(role) ||
      role === RoleLibelle.DIRECTION_GENERALE)
  );
}

export function estLitigeInterne(type: TypeTransaction): boolean {
  return type === TypeTransaction.TRANSFERT_INTERNE;
}

export function peutRegulariser(
  role: RoleLibelle,
  statut: StatutTransaction,
  type: TypeTransaction,
): boolean {
  if (statut !== StatutTransaction.LITIGE) return false;
  return estLitigeInterne(type)
    ? ROLES_REGULARISATION_LITIGE_INTERNE.includes(role)
    : ROLES_REGULARISATION_LITIGE.includes(role);
}

export function labelStatut(statut: string): string {
  if (statut === StatutTransaction.INITIEE) return 'Initiée';
  if (statut === StatutTransaction.EN_TRANSIT) return 'En transit';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'Réceptionnée';
  if (statut === StatutTransaction.VALIDEE) return 'Validée';
  if (statut === StatutTransaction.LITIGE) return 'Litige';
  return statut;
}

export function labelType(type: string): string {
  if (type === TypeTransaction.VENTE) return 'Encaissement';
  if (type === TypeTransaction.SORTIE_FONDS) return 'Versement magasin → centrale';
  if (type === TypeTransaction.TRANSFERT_INTERNE) return 'Transfert tiroir → magasin';
  return type;
}

export function labelTypeCaisse(type: string): string {
  if (type === 'TIROIR') return 'Tiroir';
  if (type === 'MAGASIN') return 'Magasin';
  if (type === 'CENTRALE') return 'Centrale';
  return type;
}

export function formatFcfa(montant: string | number): string {
  const n = typeof montant === 'number' ? montant : Number(montant);
  if (!Number.isFinite(n)) return String(montant);
  return `${Math.round(n).toLocaleString('fr-FR')} F`;
}
