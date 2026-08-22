import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let demarre = false;

async function garantirDemarrage(): Promise<void> {
  if (demarre || Platform.OS === 'web') return;
  await NfcManager.start();
  demarre = true;
}

export async function nfcDisponible(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await garantirDemarrage();
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

/** Lit un tag NFC une fois et retourne le code produit (texte NDEF, sinon UID). */
export async function lireTagNfc(): Promise<string> {
  await garantirDemarrage();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];
    if (record?.payload) {
      try {
        const texte = Ndef.text.decodePayload(Uint8Array.from(record.payload));
        if (texte?.trim()) return texte.trim();
      } catch {
        // Enregistrement NDEF non textuel : on retombe sur l'UID du tag.
      }
    }
    if (!tag?.id) throw new Error('Tag NFC illisible.');
    return tag.id;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}
