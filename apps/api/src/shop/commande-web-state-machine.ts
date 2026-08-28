import {
  ModeFulfillmentCommandeWeb,
  ModeReglementCommandeWeb,
  StatutCommandeWeb,
  TRANSITIONS_COMMANDE_WEB,
  type ModeFulfillmentCommandeWeb as ModeFulfillmentType,
  type ModeReglementCommandeWeb as ModeReglementType,
  type StatutCommandeWeb as StatutType,
} from '@caisse-crm/shared';

export interface ContexteTransitionCommandeWeb {
  modeReglement: ModeReglementType;
  modeFulfillment: ModeFulfillmentType;
}

export function transitionsCommandeWebAutorisees(
  from: StatutType,
  ctx: ContexteTransitionCommandeWeb,
): readonly StatutType[] {
  const base = TRANSITIONS_COMMANDE_WEB[from] ?? [];
  return base.filter((to) => transitionCommandeWebAutorisee(from, to, ctx));
}

export function transitionCommandeWebAutorisee(
  from: StatutType,
  to: StatutType,
  ctx: ContexteTransitionCommandeWeb,
): boolean {
  if (!(TRANSITIONS_COMMANDE_WEB[from] ?? []).includes(to)) {
    return false;
  }

  if (from === StatutCommandeWeb.PANIER) {
    if (to === StatutCommandeWeb.EN_ATTENTE_PAIEMENT) {
      return ctx.modeReglement === ModeReglementCommandeWeb.PREPAYE_PSP;
    }
    if (to === StatutCommandeWeb.PREPARATION) {
      return (
        ctx.modeReglement === ModeReglementCommandeWeb.PAIEMENT_RETRAIT ||
        ctx.modeReglement === ModeReglementCommandeWeb.PAIEMENT_LIVRAISON
      );
    }
  }

  if (from === StatutCommandeWeb.PREPARATION) {
    if (to === StatutCommandeWeb.PRETE) {
      return (
        ctx.modeFulfillment === ModeFulfillmentCommandeWeb.RETRAIT_BOUTIQUE
      );
    }
    if (to === StatutCommandeWeb.EXPEDIEE) {
      return ctx.modeFulfillment === ModeFulfillmentCommandeWeb.LIVRAISON;
    }
  }

  if (
    (from === StatutCommandeWeb.LIVREE || from === StatutCommandeWeb.REMISE) &&
    to === StatutCommandeWeb.PAYEE
  ) {
    return (
      ctx.modeReglement === ModeReglementCommandeWeb.PAIEMENT_RETRAIT ||
      ctx.modeReglement === ModeReglementCommandeWeb.PAIEMENT_LIVRAISON
    );
  }

  if (
    (from === StatutCommandeWeb.LIVREE || from === StatutCommandeWeb.REMISE) &&
    to !== StatutCommandeWeb.PAYEE
  ) {
    return false;
  }

  return true;
}

export function statutApresCheckout(
  modeReglement: ModeReglementType,
): StatutType {
  if (modeReglement === ModeReglementCommandeWeb.PREPAYE_PSP) {
    return StatutCommandeWeb.EN_ATTENTE_PAIEMENT;
  }
  return StatutCommandeWeb.PREPARATION;
}

export function statutApresPaiementPsp(): StatutType {
  return StatutCommandeWeb.PAYEE;
}
