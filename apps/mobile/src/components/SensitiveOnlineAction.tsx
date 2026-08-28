import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { p2pApi, type SensitivePurpose } from '../api/p2p';
import { colors, ui } from '../ui';

export function SensitiveOnlineAction({
  label,
  confirmation,
  onConfirmed,
  purpose,
  destructive = false,
  disabled = false,
}: {
  label: string;
  confirmation: string;
  onConfirmed: (challengeId?: string) => Promise<void>;
  purpose?: SensitivePurpose;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      Alert.alert(
        'Connexion obligatoire',
        'Cette décision financière ou de contrôle ne sera jamais mise en file hors ligne.',
      );
      return;
    }
    Alert.alert('Confirmer l’action', confirmation, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Continuer',
        style: destructive ? 'destructive' : 'default',
        onPress: () => {
          if (purpose) setOpen(true);
          else void executeWithoutChallenge();
        },
      },
    ]);
  }

  async function executeWithoutChallenge() {
    setPending(true);
    try {
      await onConfirmed();
    } catch (err) {
      Alert.alert(
        'Action refusée',
        err instanceof Error ? err.message : 'L’action n’a pas pu être exécutée.',
      );
    } finally {
      setPending(false);
    }
  }

  async function execute() {
    if (!password || !purpose) return;
    setPending(true);
    setError(null);
    try {
      const challenge = await p2pApi.createSensitiveChallenge(password, purpose);
      await onConfirmed(challenge.challengeId);
      setPassword('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ré-authentification ou action refusée.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || pending}
        style={[
          destructive ? ui.btnGhost : ui.btn,
          (disabled || pending) && ui.btnOff,
        ]}
        onPress={() => void begin()}
      >
        <Text
          style={
            destructive
              ? [ui.btnGhostText, { color: colors.danger }]
              : ui.btnText
          }
        >
          {label}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={ui.title}>Vérifier votre identité</Text>
            <Text style={ui.subtitle}>
              Saisissez votre mot de passe. L’action exige une connexion active et ne sera pas mémorisée hors ligne.
            </Text>
            <TextInput
              accessibilityLabel="Mot de passe de confirmation"
              style={ui.input}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              placeholder="Mot de passe"
              placeholderTextColor={colors.muted}
            />
            {error ? <Text style={ui.error}>{error}</Text> : null}
            <View style={ui.row}>
              <Pressable style={[ui.btnGhost, { flex: 1 }]} onPress={() => setOpen(false)}>
                <Text style={ui.btnGhostText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[ui.btn, { flex: 1 }, (!password || pending) && ui.btnOff]}
                disabled={!password || pending}
                onPress={() => void execute()}
              >
                {pending ? <ActivityIndicator color="#fff" /> : <Text style={ui.btnText}>Authentifier</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = {
  backdrop: {
    flex: 1,
    justifyContent: 'center' as const,
    padding: 20,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  dialog: {
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
};
