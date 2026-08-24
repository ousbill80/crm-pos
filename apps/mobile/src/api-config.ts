const isDev =
  typeof __DEV__ !== 'undefined'
    ? __DEV__
    : process.env.NODE_ENV !== 'production';

const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!isDev && !configured) {
  throw new Error(
    'EXPO_PUBLIC_API_URL est obligatoire pour une version mobile de production.',
  );
}

if (!isDev && configured && !configured.startsWith('https://')) {
  throw new Error(
    'EXPO_PUBLIC_API_URL doit utiliser HTTPS en production (§6.7).',
  );
}

export const API_BASE_URL = configured || 'http://localhost:3000';
