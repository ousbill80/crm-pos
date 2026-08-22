import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiFetch, ApiError } from '../api';
import { ScreenHeader } from '../components/ScreenChrome';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';

export function ChangePasswordScreen() {
  const { markPasswordChanged, signOut } = useSession();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      await markPasswordChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Changement de mot de passe refusé.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={[ui.wrap, { justifyContent: 'center' }]}>
      <ScreenHeader
        title="Mot de passe à changer"
        subtitle="Obligatoire avant tout autre accès (§6.7)."
      />
      <View style={[ui.card, { gap: 12 }]}>
        <TextInput
          style={ui.input}
          secureTextEntry
          placeholder="Mot de passe actuel"
          placeholderTextColor={colors.muted}
          value={oldPassword}
          onChangeText={setOldPassword}
        />
        <TextInput
          style={ui.input}
          secureTextEntry
          placeholder="Nouveau mot de passe (8 caractères min.)"
          placeholderTextColor={colors.muted}
          value={newPassword}
          onChangeText={setNewPassword}
        />
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <Pressable
          style={[ui.btn, newPassword.length < 8 && ui.btnOff]}
          onPress={() => void submit()}
          disabled={pending || newPassword.length < 8}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={ui.btnText}>Enregistrer</Text>
          )}
        </Pressable>
      </View>
      <Pressable onPress={() => void signOut()}>
        <Text style={[ui.link, { textAlign: 'center' }]}>Déconnexion</Text>
      </Pressable>
    </View>
  );
}
