import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { setOfflineStore } from '@caisse-crm/offline';
import { LoginScreen } from './src/screens/LoginScreen';
import { PosScreen } from './src/screens/PosScreen';
import { createSqliteStore } from './src/offline/sqlite-store';
import { setToken } from './src/api';

setOfflineStore(createSqliteStore());

export default function App() {
  const [connected, setConnected] = useState(false);
  return (
    <>
      <StatusBar style="auto" />
      {connected ? (
        <PosScreen
          onLogout={() => {
            setToken(null);
            setConnected(false);
          }}
        />
      ) : (
        <LoginScreen onConnected={() => setConnected(true)} />
      )}
    </>
  );
}
