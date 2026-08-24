import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
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
    <KeyboardAvoidingView
      style={[ui.wrap, { justifyContent: 'center' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <TextInput
          style={ui.input}
          secureTextEntry
          placeholder="Confirmer le nouveau mot de passe"
          placeholderTextColor={colors.muted}
          value={confirmation}
          onChangeText={setConfirmation}
        />
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <Pressable
          style={[
            ui.btn,
            (newPassword.length < 8 || newPassword !== confirmation) &&
              ui.btnOff,
          ]}
          onPress={() => void submit()}
          disabled={
            pending ||
            newPassword.length < 8 ||
            newPassword !== confirmation
          }
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
    </KeyboardAvoidingView>
  );
}
