export {
  appliquerTouchePistolet,
  candidatsCodeScan,
  etatPistoletVide,
  extraireQuantiteScan,
  normaliserCodeScan,
  produitContientRechercheCaisse,
  produitCorrespondAuCodeExact,
  resoudreScanCaisse,
  ressembleCodePistolet,
  trouverProduitParScan,
  type EtatPistolet,
  type ResultatScanCaisse,
} from '@caisse-crm/shared';

/** Bip court (ok / erreur) — ignoré hors navigateur et si l’audio est bloqué. */
export function bipScan(kind: 'ok' | 'err'): void {
  if (typeof window === 'undefined') return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'ok' ? 1240 : 240;
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === 'ok' ? 0.055 : 0.16));
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* autoplay / contexte restreint */
  }
}
