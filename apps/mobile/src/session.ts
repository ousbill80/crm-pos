import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { setToken } from './api';
import { decodeAccessToken, isAccessTokenExpired } from './session-jwt';
import type { SessionUser } from './session-types';

export type { SessionUser } from './session-types';
export { decodeAccessToken } from './session-jwt';

// Jeton chiffré au repos (§6.7) — expo-secure-store (Keychain/Keystore),
// contrairement à AsyncStorage qui stocke en clair.
const TOKEN_KEY = 'caisse-crm.accessToken';
const MCP_KEY = 'caisse-crm.mustChangePassword';

export async function persistSession(
  accessToken: string,
  mustChangePassword: boolean,
): Promise<SessionUser> {
  const user = decodeAccessToken(accessToken);
  if (!user) {
    throw new Error('Jeton d’authentification illisible.');
  }
  setToken(accessToken);
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await AsyncStorage.setItem(MCP_KEY, mustChangePassword ? '1' : '0');
  return user;
}

export async function clearSession(): Promise<void> {
  setToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.removeItem(MCP_KEY);
}

export async function markPasswordChanged(): Promise<void> {
  await AsyncStorage.setItem(MCP_KEY, '0');
}

export async function hydrateSession(): Promise<{
  user: SessionUser;
  mustChangePassword: boolean;
} | null> {
  const accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!accessToken) {
    setToken(null);
    return null;
  }
  const user = decodeAccessToken(accessToken);
  if (!user) {
    await clearSession();
    return null;
  }
  if (isAccessTokenExpired(accessToken)) {
    // Le jeton serveur est expiré : on ne restaure pas silencieusement la
    // session (§6.7). Le jeton reste en stockage pour le login hors ligne
    // (getDernierAccessTokenConnu) — seule la restauration auto est bloquée.
    setToken(null);
    return null;
  }
  setToken(accessToken);
  const flag = await AsyncStorage.getItem(MCP_KEY);
  return { user, mustChangePassword: flag === '1' };
}
