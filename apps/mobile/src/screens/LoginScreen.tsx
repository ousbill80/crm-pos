import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiFetch, setToken } from '../api';

const DEMO_PASSWORD = 'MotDePasse!123';

export function LoginScreen({ onConnected }: { onConnected: () => void }) {
  const [login, setLogin] = useState('demo-pos-caissier');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    try {
      const { accessToken } = await apiFetch<{ accessToken: string }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ login, password }),
        },
      );
      setToken(accessToken);
      onConnected();
    } catch {
      setError('Identifiants invalides ou API injoignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>CaissePOS</Text>
      <Text style={styles.title}>Connexion boutique</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Identifiant"
        value={login}
        onChangeText={setLogin}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.btn} onPress={() => void submit()} disabled={pending}>
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Se connecter</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  brand: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#b00020' },
  btn: {
    backgroundColor: '#111',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700' },
});
