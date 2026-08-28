import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { createMemoryStore, setOfflineStore } from '@caisse-crm/offline';
import { LoginScreen } from './src/screens/LoginScreen';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { HorsPerimetreScreen } from './src/screens/HorsPerimetreScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { FileAttenteScreen } from './src/screens/FileAttenteScreen';
import { MainTabs } from './src/navigation/MainTabs';
import { createSqliteStore } from './src/offline/sqlite-store';
import { demarrerAutoSyncMobile } from './src/offline/auto-sync';
import { SessionProvider, useSession } from './src/session-context';
import {
  accesAppMobile,
} from './src/circuit/actions';
import { ui } from './src/ui';
import type { RootStackParamList } from './src/navigation/types';

// Web : mémoire (pas de SQLite natif). Native : SQLite §6.7.
setOfflineStore(
  Platform.OS === 'web' ? createMemoryStore() : createSqliteStore(),
);

const Stack = createNativeStackNavigator<RootStackParamList>();

function Root() {
  const { ready, user, mustChangePassword } = useSession();

  useEffect(() => demarrerAutoSyncMobile(), []);

  if (!ready) {
    return (
      <View style={ui.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const horsPerimetre =
    user != null &&
    !accesAppMobile(user.role);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user == null ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : horsPerimetre ? (
        <Stack.Screen name="HorsPerimetre" component={HorsPerimetreScreen} />
      ) : mustChangePassword ? (
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="Scanner"
            component={ScannerScreen}
            options={{ presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="FileAttente"
            component={FileAttenteScreen}
            options={{ presentation: 'fullScreenModal' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SessionProvider>
        <NavigationContainer>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <Root />
          </SafeAreaView>
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
