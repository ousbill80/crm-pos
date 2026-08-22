import AsyncStorage from '@react-native-async-storage/async-storage';
import { setToken } from './api';
import { decodeAccessToken } from './session-jwt';
import type { SessionUser } from './session-types';

export type { SessionUser } from './session-types';
export { decodeAccessToken } from './session-jwt';

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
  await AsyncStorage.setItem(TOKEN_KEY, accessToken);
  await AsyncStorage.setItem(MCP_KEY, mustChangePassword ? '1' : '0');
  return user;
}

export async function clearSession(): Promise<void> {
  setToken(null);
  await AsyncStorage.multiRemove([TOKEN_KEY, MCP_KEY]);
}

export async function markPasswordChanged(): Promise<void> {
  await AsyncStorage.setItem(MCP_KEY, '0');
}

export async function hydrateSession(): Promise<{
  user: SessionUser;
  mustChangePassword: boolean;
} | null> {
  const accessToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (!accessToken) {
    setToken(null);
    return null;
  }
  const user = decodeAccessToken(accessToken);
  if (!user) {
    await clearSession();
    return null;
  }
  setToken(accessToken);
  const flag = await AsyncStorage.getItem(MCP_KEY);
  return { user, mustChangePassword: flag === '1' };
}
