/**
 * Sandbox PSP shop — uniquement hors production (ou SHOP_PSP_SANDBOX=1).
 * Permet d’encaisser une commande de bout en bout sans clé Paystack / OM / Wave.
 */

export function pspSandboxAutorise(env: {
  nodeEnv?: string | null;
  sandboxFlag?: string | null;
}): boolean {
  const flag = (env.sandboxFlag ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  if (flag === '1' || flag.toLowerCase() === 'true') return true;
  return (env.nodeEnv ?? '').trim() !== 'production';
}

export function pspProviderConfigure(
  provider: 'PAYSTACK' | 'ORANGE_MONEY' | 'WAVE',
  env: {
    paystackSecret?: string | null;
    orangeMoneyEnabled?: string | null;
    waveEnabled?: string | null;
  },
): boolean {
  if (provider === 'PAYSTACK') {
    return Boolean(env.paystackSecret?.trim());
  }
  if (provider === 'ORANGE_MONEY') {
    return env.orangeMoneyEnabled === '1';
  }
  return env.waveEnabled === '1';
}

export function urlConfirmationSandbox(opts: {
  shopPublicUrl: string;
  commandeId: string;
  clientOperationId: string;
  suiviToken?: string | null;
}): string {
  const base = opts.shopPublicUrl.replace(/\/$/, '');
  const url = new URL(`${base}/checkout/confirmation`);
  url.searchParams.set('commandeId', opts.commandeId);
  url.searchParams.set('ref', opts.clientOperationId);
  if (opts.suiviToken) url.searchParams.set('token', opts.suiviToken);
  url.searchParams.set('sandbox', '1');
  return url.toString();
}

export function messagePspIndisponible(
  provider: 'PAYSTACK' | 'ORANGE_MONEY' | 'WAVE',
): string {
  if (provider === 'PAYSTACK') {
    return 'Le paiement par carte est temporairement indisponible. Réessayez ou choisissez un autre moyen — aucun débit n’a été effectué.';
  }
  if (provider === 'ORANGE_MONEY') {
    return 'Orange Money n’est pas encore activé. Choisissez la carte ou le paiement au retrait — aucun débit n’a été effectué.';
  }
  return 'Wave n’est pas encore activé. Choisissez la carte ou le paiement au retrait — aucun débit n’a été effectué.';
}
