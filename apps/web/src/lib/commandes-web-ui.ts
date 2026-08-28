import { RoleLibelle } from '@caisse-crm/shared';
import { fmtFcfa, fmtDateHeure } from './achats-ui';

export { fmtFcfa, fmtDateHeure };

export const ROLES_COMMANDES_WEB_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export const ROLES_CONVERSION_VENTE_WEB: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export interface CommandeWebLigne {
  id: string;
  designationSnapshot: string;
  quantite: number;
  prixUnitaireTtc: string;
  prixUnitaireHt?: string;
  montantTvaLigne?: string;
  referenceSnapshot?: string | null;
}

export interface CommandeWebListItem {
  id: string;
  statut: string;
  modeFulfillment: string;
  modeReglement: string;
  montantTotal: string;
  createdAt: string;
  payeeAt?: string | null;
  emailInvite?: string | null;
  telephoneInvite?: string | null;
  suiviToken?: string | null;
  noteClient?: string | null;
  boutiqueRetraitId?: string | null;
  boutiqueRetrait?: {
    id: string;
    nom: string;
    adresse: string;
    delaiRetraitHeures?: number | null;
  } | null;
  client?: {
    id: string;
    nom: string;
    prenom: string | null;
    contact: string | null;
  } | null;
  compteClient?: { email: string } | null;
  lignes?: CommandeWebLigne[];
  conversionVente?: { venteId: string; createdAt?: string } | null;
  transitions?: string[];
}

export interface CommandeWebDetail extends CommandeWebListItem {
  montantArticlesHt?: string;
  montantTva?: string;
  montantArticlesTtc?: string;
  remiseFidelite?: string;
  fraisLivraison?: string;
  numeroSuivi?: string | null;
  expireAt?: string | null;
  adresseLivraisonJson?: Record<string, unknown> | null;
  zoneLivraison?: { id: string; libelle: string } | null;
  entrepot?: { id: string; nom: string; code: string } | null;
  providerPsp?: string | null;
  avis?: { note: number | null; soumisAt: string | null } | null;
  paiements?: Array<{
    type: string;
    statut: string;
    provider: string;
    montant?: string;
  }>;
}

export const LABEL_STATUT_CMD_WEB: Record<string, string> = {
  EN_ATTENTE_PAIEMENT: 'Attente paiement',
  PAYEE: 'Payée',
  PREPARATION: 'En préparation',
  PRETE: 'Prête au retrait',
  EXPEDIEE: 'Expédiée',
  LIVREE: 'Livrée',
  REMISE: 'Remise au client',
  ANNULEE: 'Annulée',
  REMBOURSEE: 'Remboursée',
  LITIGE: 'Litige',
};

export const LABEL_ACTION_CMD_WEB: Record<string, string> = {
  PREPARATION: 'Démarrer la préparation',
  PRETE: 'Marquer prête au retrait',
  EXPEDIEE: 'Marquer expédiée',
  LIVREE: 'Marquer livrée',
  REMISE: 'Remettre au client',
  PAYEE: 'Encaisser (paiement différé)',
  ANNULEE: 'Annuler la commande',
  REMBOURSEE: 'Passer en remboursée',
  LITIGE: 'Signaler un litige',
};

export const LABEL_FULFILLMENT: Record<string, string> = {
  RETRAIT_BOUTIQUE: 'Click & collect',
  LIVRAISON: 'Livraison',
};

export const LABEL_REGLEMENT: Record<string, string> = {
  PREPAYE_PSP: 'Prépayé (en ligne)',
  PAIEMENT_RETRAIT: 'Paiement au retrait',
  PAIEMENT_LIVRAISON: 'Paiement à la livraison',
};

export function badgeStatutCmdWeb(statut: string): string {
  if (statut === 'PRETE' || statut === 'PAYEE' || statut === 'REMISE' || statut === 'LIVREE') {
    return 'badge badge-ok';
  }
  if (statut === 'LITIGE' || statut === 'ANNULEE') {
    return 'badge badge-critical';
  }
  if (statut === 'REMBOURSEE') return 'badge badge-neutral';
  if (statut === 'EN_ATTENTE_PAIEMENT' || statut === 'EXPEDIEE') {
    return 'badge badge-warning';
  }
  return 'badge badge-info';
}

export function referenceCommandeWeb(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function contactCommandeWeb(c: CommandeWebListItem): {
  nom: string;
  email: string | null;
  telephone: string | null;
} {
  const prenom = c.client?.prenom?.trim();
  const nomFamille = c.client?.nom?.trim();
  const nom =
    [prenom, nomFamille].filter(Boolean).join(' ') ||
    c.emailInvite ||
    c.compteClient?.email ||
    'Client invité';
  return {
    nom,
    email: c.emailInvite ?? c.compteClient?.email ?? null,
    telephone: c.telephoneInvite ?? c.client?.contact ?? null,
  };
}

export function nbArticles(c: CommandeWebListItem): number {
  return (c.lignes ?? []).reduce((acc, l) => acc + (l.quantite || 0), 0);
}

export function estClickCollect(c: { modeFulfillment: string }): boolean {
  return c.modeFulfillment === 'RETRAIT_BOUTIQUE';
}

export function estTerminale(statut: string): boolean {
  return statut === 'ANNULEE' || statut === 'REMBOURSEE';
}

export function aEncaisserAuRetrait(c: CommandeWebListItem): boolean {
  return (
    estClickCollect(c) &&
    c.modeReglement === 'PAIEMENT_RETRAIT' &&
    c.statut !== 'PAYEE' &&
    c.statut !== 'ANNULEE' &&
    c.statut !== 'REMBOURSEE' &&
    !c.conversionVente
  );
}

export function peutConvertirVente(c: CommandeWebListItem): boolean {
  if (c.conversionVente) return false;
  return c.statut === 'REMISE' || c.statut === 'LIVREE' || c.statut === 'PAYEE';
}

export function transitionsMetier(transitions: string[] | undefined): string[] {
  return (transitions ?? []).filter((s) => s !== 'ANNULEE' && s !== 'LITIGE');
}

export function nouvelleOperationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type EtapeCmdWebDef = {
  key: string;
  label: string;
  /** Statut à appliquer pour atteindre cette étape (depuis l’étape précédente). */
  targetStatut?: string;
  /** Dernière étape : conversion vente POS. */
  convertirVente?: boolean;
};

/** Click & collect — prépaiement en ligne. */
export const ETAPES_RETRAIT_PREPAYE: EtapeCmdWebDef[] = [
  { key: 'paiement', label: 'Paiement', targetStatut: 'PAYEE' },
  { key: 'prep', label: 'Préparation', targetStatut: 'PREPARATION' },
  { key: 'prete', label: 'Prête', targetStatut: 'PRETE' },
  { key: 'remise', label: 'Remise', targetStatut: 'REMISE' },
  { key: 'vente', label: 'Vente POS', convertirVente: true },
];

/** Click & collect — paiement au magasin. */
export const ETAPES_RETRAIT_DIFFERE: EtapeCmdWebDef[] = [
  { key: 'prep', label: 'Préparation', targetStatut: 'PREPARATION' },
  { key: 'prete', label: 'Prête', targetStatut: 'PRETE' },
  { key: 'remise', label: 'Remise', targetStatut: 'REMISE' },
  { key: 'encaissement', label: 'Encaissement POS', convertirVente: true },
];

/** Livraison — prépaiement. */
export const ETAPES_LIVRAISON_PREPAYE: EtapeCmdWebDef[] = [
  { key: 'paiement', label: 'Paiement', targetStatut: 'PAYEE' },
  { key: 'prep', label: 'Préparation', targetStatut: 'PREPARATION' },
  { key: 'expediee', label: 'Expédition', targetStatut: 'EXPEDIEE' },
  { key: 'livree', label: 'Livrée', targetStatut: 'LIVREE' },
  { key: 'cloture', label: 'Clôture POS', convertirVente: true },
];

/** Livraison — paiement à la livraison. */
export const ETAPES_LIVRAISON_DIFFERE: EtapeCmdWebDef[] = [
  { key: 'prep', label: 'Préparation', targetStatut: 'PREPARATION' },
  { key: 'expediee', label: 'Expédition', targetStatut: 'EXPEDIEE' },
  { key: 'livree', label: 'Livrée', targetStatut: 'LIVREE' },
  { key: 'encaissement', label: 'Encaissement POS', convertirVente: true },
];

/** @deprecated alias — préférer etapesPourCommande */
export const ETAPES_RETRAIT = ETAPES_RETRAIT_PREPAYE;
/** @deprecated alias — préférer etapesPourCommande */
export const ETAPES_LIVRAISON = ETAPES_LIVRAISON_PREPAYE;

export const LABEL_PSP: Record<string, string> = {
  PAYSTACK: 'Carte (Paystack)',
  ORANGE_MONEY: 'Orange Money',
  WAVE: 'Wave',
};

export function estPrepaye(c: { modeReglement: string }): boolean {
  return c.modeReglement === 'PREPAYE_PSP';
}

export function etapesPourCommande(c: CommandeWebListItem): EtapeCmdWebDef[] {
  const retrait = estClickCollect(c);
  const prepaid = estPrepaye(c);
  if (retrait && prepaid) return ETAPES_RETRAIT_PREPAYE;
  if (retrait && !prepaid) return ETAPES_RETRAIT_DIFFERE;
  if (!retrait && prepaid) return ETAPES_LIVRAISON_PREPAYE;
  return ETAPES_LIVRAISON_DIFFERE;
}

/**
 * Index de l’étape courante (0-based).
 * Les étapes antérieures = faites ; la courante = en cours.
 */
export function indexEtapeActive(c: CommandeWebListItem): number {
  const etapes = etapesPourCommande(c);
  const prepaid = estPrepaye(c);
  const retrait = estClickCollect(c);

  if (estTerminale(c.statut)) return 0;

  if (c.conversionVente) return etapes.length - 1;

  if (retrait) {
    if (c.statut === 'REMISE') {
      return prepaid ? 3 : 2; // avant vente POS
    }
    if (c.statut === 'PRETE') return prepaid ? 2 : 1;
    if (c.statut === 'PREPARATION') return prepaid ? 1 : 0;
    if (c.statut === 'PAYEE') {
      // Prépayé : paiement OK → préparation ; différé : PAYEE = encaissé = dernière
      return prepaid ? 1 : etapes.length - 1;
    }
    if (c.statut === 'EN_ATTENTE_PAIEMENT') return 0;
    return prepaid ? 0 : 0;
  }

  // Livraison
  if (c.statut === 'LIVREE') return prepaid ? 3 : 2;
  if (c.statut === 'EXPEDIEE') return prepaid ? 2 : 1;
  if (c.statut === 'PREPARATION') return prepaid ? 1 : 0;
  if (c.statut === 'PAYEE') return prepaid ? 1 : etapes.length - 1;
  if (c.statut === 'EN_ATTENTE_PAIEMENT') return 0;
  return 0;
}

/** Compat anciennes APIs. */
export function etapeRetraitActive(c: CommandeWebListItem): number {
  return indexEtapeActive(c);
}

export function etapeLivraisonActive(c: CommandeWebListItem): number {
  return indexEtapeActive(c);
}

/**
 * Action pour avancer vers l’étape `targetIndex` (doit être current+1).
 * Retourne null si non atteignable.
 */
export function actionVersEtape(
  c: CommandeWebListItem,
  targetIndex: number,
): { statut?: string; convertirVente?: boolean; label: string } | null {
  const etapes = etapesPourCommande(c);
  const current = indexEtapeActive(c);
  if (targetIndex !== current + 1) return null;
  if (targetIndex < 0 || targetIndex >= etapes.length) return null;

  const etape = etapes[targetIndex];
  const transitions = new Set(c.transitions ?? []);

  // Cas spécial : PAYEE (webhook) → souvent déjà PREPARATION ; si on clique Préparation
  // depuis PAYEE, target PREPARATION. Si déjà PREPARATION et on clique Prête → PRETE.
  if (etape.convertirVente) {
    if (!peutConvertirVente(c) && c.statut !== 'REMISE' && c.statut !== 'LIVREE' && c.statut !== 'PRETE') {
      // PRETE : d’abord REMISE
      return null;
    }
    // Si PRETE, il faut d’abord REMISE avant convertir
    if (c.statut === 'PRETE') {
      if (!transitions.has('REMISE')) return null;
      return { statut: 'REMISE', label: 'Remettre au client' };
    }
    if (c.statut === 'REMISE' || c.statut === 'LIVREE' || c.statut === 'PAYEE') {
      return { convertirVente: true, label: 'Créer la vente POS' };
    }
    return null;
  }

  if (!etape.targetStatut) return null;

  // Si l’étape cible est PREPARATION mais on est EN_ATTENTE → d’abord PAYEE
  if (
    etape.targetStatut === 'PREPARATION' &&
    c.statut === 'EN_ATTENTE_PAIEMENT'
  ) {
    if (!transitions.has('PAYEE')) return null;
    return { statut: 'PAYEE', label: 'Confirmer le paiement reçu' };
  }

  // Si on est PAYEE et cible PREPARATION
  if (etape.targetStatut === 'PREPARATION' && c.statut === 'PAYEE') {
    if (!transitions.has('PREPARATION')) return null;
    return { statut: 'PREPARATION', label: 'Démarrer la préparation' };
  }

  // Si on est déjà PREPARATION et on clique l’étape Préparation (current) — no-op
  // Avancer vers PRETE / EXPEDIEE
  if (
    (etape.targetStatut === 'PRETE' || etape.targetStatut === 'EXPEDIEE') &&
    (c.statut === 'PREPARATION' || c.statut === 'PAYEE')
  ) {
    // Si encore PAYEE, d’abord PREPARATION
    if (c.statut === 'PAYEE' && transitions.has('PREPARATION')) {
      return { statut: 'PREPARATION', label: 'Démarrer la préparation' };
    }
    if (!transitions.has(etape.targetStatut)) return null;
    return {
      statut: etape.targetStatut,
      label: labelActionStatut(c.statut, etape.targetStatut),
    };
  }

  if (!transitions.has(etape.targetStatut)) {
    // Auto-skip : webhook a déjà passé PAYEE→PREPARATION ; étape Préparation
    // est current alors que target PREPARATION n’est plus dans transitions.
    // Cliquer l’étape suivante (Prête) est géré par targetIndex === current+1.
    return null;
  }

  return {
    statut: etape.targetStatut,
    label: labelActionStatut(c.statut, etape.targetStatut),
  };
}

/** CTA principal pour l’étape courante → suivante. */
export function prochaineActionWorkflow(
  c: CommandeWebListItem,
): { statut?: string; convertirVente?: boolean; label: string; etapeLabel: string } | null {
  const etapes = etapesPourCommande(c);
  const current = indexEtapeActive(c);
  if (c.conversionVente || estTerminale(c.statut)) return null;
  if (current >= etapes.length - 1 && !peutConvertirVente(c)) {
    // Sur dernière étape visuelle mais pas encore convertible (ex. PRETE)
    const action = actionVersEtape(c, current);
    if (action) {
      return { ...action, etapeLabel: etapes[current]?.label ?? '' };
    }
  }
  const next = current + 1;
  if (next >= etapes.length) {
    // Dernière étape active = vente POS
    const action = actionVersEtape(c, current);
    if (action?.convertirVente) {
      return { ...action, etapeLabel: etapes[current]?.label ?? 'Vente POS' };
    }
    return null;
  }
  const action = actionVersEtape(c, next);
  if (!action) return null;
  if (action.statut === 'PAYEE' && c.statut === 'EN_ATTENTE_PAIEMENT') {
    return { ...action, etapeLabel: etapes[0]?.label ?? 'Paiement' };
  }
  return { ...action, etapeLabel: etapes[next]?.label ?? '' };
}

export function labelActionStatut(from: string, to: string): string {
  if (to === 'PAYEE' && from === 'EN_ATTENTE_PAIEMENT') {
    return 'Confirmer le paiement reçu';
  }
  return LABEL_ACTION_CMD_WEB[to] ?? to;
}

export function formatAdresseLivraison(
  json: Record<string, unknown> | null | undefined,
): string | null {
  if (!json) return null;
  const parts = [
    json.ligne1,
    json.ligne2,
    json.ville,
    json.region,
    json.codePostal,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function geoAdresseLivraison(
  json: Record<string, unknown> | null | undefined,
): { lat: number; lng: number } | null {
  if (!json) return null;
  const lat = Number(json.lat ?? json.latitude);
  const lng = Number(json.lng ?? json.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function lienWhatsapp(telephone: string | null): string | null {
  if (!telephone) return null;
  const digits = telephone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export function bannerCommandeWeb(c: CommandeWebDetail): {
  tone: 'warning' | 'ok' | 'info' | 'danger';
  title: string;
  text: string;
} | null {
  if (c.statut === 'EN_ATTENTE_PAIEMENT') {
    const expire = c.expireAt
      ? ` Réservation de stock jusqu’au ${fmtDateHeure(c.expireAt)}.`
      : '';
    return {
      tone: 'warning',
      title: 'Paiement en ligne en attente',
      text: `Ne pas préparer ni expédier tant que le PSP n’a pas confirmé.${expire}`,
    };
  }
  if (c.statut === 'PRETE') {
    return {
      tone: 'ok',
      title: 'Prête au click & collect',
      text: 'Accueillir le client, vérifier l’identité et le QR, puis remettre les articles.',
    };
  }
  if (c.statut === 'EXPEDIEE') {
    return {
      tone: 'info',
      title: 'En cours de livraison',
      text: c.numeroSuivi
        ? `N° de suivi : ${c.numeroSuivi}. Marquer livrée à la remise au destinataire.`
        : 'Marquer livrée dès que le destinataire a reçu la commande.',
    };
  }
  if (c.statut === 'LITIGE') {
    return {
      tone: 'danger',
      title: 'Litige',
      text: 'Commande bloquée. Régulariser ou rembourser — pas de préparation.',
    };
  }
  if (aEncaisserAuRetrait(c) && c.statut === 'REMISE') {
    return {
      tone: 'warning',
      title: 'À encaisser au magasin',
      text: `Créer la vente POS pour solder ${fmtFcfa(c.montantTotal)} (session caisse ouverte).`,
    };
  }
  return null;
}

