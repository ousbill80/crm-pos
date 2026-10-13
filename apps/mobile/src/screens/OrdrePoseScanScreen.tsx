import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '../api';
import {
  demarrerOrdreDePose,
  getOrdreDePose,
  parseQrOrdrePose,
  terminerOrdreDePose,
  type OrdreDePoseDetailDto,
} from '../api/ordres-pose';
import { colors, ui } from '../ui';

const QR_ONLY = ['qr'] as const;

function labelStatut(statut: OrdreDePoseDetailDto['statut']): string {
  if (statut === 'EN_ATTENTE') return 'En attente de prise en charge';
  if (statut === 'EN_COURS') return 'Pose en cours';
  if (statut === 'TERMINEE') return 'Pose terminée';
  return 'Annulée';
}

/**
 * Scan du QR du reçu atelier (pose/installation) — démarre puis termine
 * l'OrdreDePose. Nécessite du réseau : le suivi de pose n'est pas mis en
 * file hors-ligne (§6.7 — ce n'est pas une opération financière/caisse).
 */
export function OrdrePoseScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [ordre, setOrdre] = useState<OrdreDePoseDetailDto | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const dejaScanne = useRef(false);
  const cameraUtile = Platform.OS !== 'web';

  async function charger(code: string, viaScan: boolean) {
    const parsed = parseQrOrdrePose(code.trim());
    if (!parsed) {
      setErreur('Code invalide — ce n’est pas un reçu atelier.');
      return;
    }
    if (viaScan) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setErreur(null);
    setLoading(true);
    try {
      const detail = await getOrdreDePose(parsed.id);
      setOrdre(detail);
      setQrToken(parsed.qrToken);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Ordre de pose introuvable.');
    } finally {
      setLoading(false);
    }
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (dejaScanne.current) return;
    dejaScanne.current = true;
    void charger(result.data, true);
  }

  function nouveauScan() {
    setOrdre(null);
    setQrToken(null);
    setErreur(null);
    setManualCode('');
    dejaScanne.current = false;
  }

  async function demarrer() {
    if (!ordre || !qrToken) return;
    setActionLoading(true);
    setErreur(null);
    try {
      const misAJour = await demarrerOrdreDePose(ordre.id, qrToken);
      setOrdre(misAJour);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Démarrage impossible.');
    } finally {
      setActionLoading(false);
    }
  }

  async function terminer() {
    if (!ordre) return;
    setActionLoading(true);
    setErreur(null);
    try {
      const misAJour = await terminerOrdreDePose(ordre.id);
      setOrdre(misAJour);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Clôture impossible.');
    } finally {
      setActionLoading(false);
    }
  }

  if (ordre) {
    return (
      <ScrollView style={ui.wrap} contentContainerStyle={styles.detailWrap}>
        <Text style={ui.brand}>REÇU ATELIER</Text>
        <Text style={ui.title}>{labelStatut(ordre.statut)}</Text>
        {ordre.boutique ? <Text style={ui.subtitle}>{ordre.boutique.nom}</Text> : null}

        <View style={ui.card}>
          {ordre.lignes.map((l) => (
            <View key={l.id} style={ui.row}>
              <Text style={ui.body}>{l.produit.designation}</Text>
              <Text style={[ui.body, { fontWeight: '800' }]}>× {l.quantite}</Text>
            </View>
          ))}
        </View>

        {ordre.technicien ? (
          <Text style={ui.muted}>
            Technicien : {ordre.technicien.prenom} {ordre.technicien.nom}
          </Text>
        ) : null}

        {erreur ? <Text style={ui.error}>{erreur}</Text> : null}

        {ordre.statut === 'EN_ATTENTE' ? (
          <Pressable
            style={[ui.btn, actionLoading && ui.btnOff]}
            onPress={() => void demarrer()}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={ui.btnText}>Démarrer la pose</Text>
            )}
          </Pressable>
        ) : null}

        {ordre.statut === 'EN_COURS' ? (
          <Pressable
            style={[ui.btn, actionLoading && ui.btnOff]}
            onPress={() => void terminer()}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={ui.btnText}>Marquer posé</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable style={ui.btnGhost} onPress={nouveauScan}>
          <Text style={ui.btnGhostText}>Scanner un autre reçu</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.iconRing}>
          <Ionicons name="construct-outline" size={32} color={colors.accent} />
        </View>
        <Text style={ui.brand}>POSE / INSTALLATION</Text>
        <Text style={ui.title}>Scanner le reçu atelier</Text>
        <Text style={ui.subtitle}>
          Visez le QR imprimé sur le reçu atelier remis à la caisse.
        </Text>
      </View>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {erreur ? <Text style={ui.error}>{erreur}</Text> : null}

      {cameraUtile && permission?.granted ? (
        <View style={styles.camBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            barcodeScannerSettings={{ barcodeTypes: [...QR_ONLY] }}
            onBarcodeScanned={onBarcodeScanned}
          />
        </View>
      ) : cameraUtile ? (
        <Pressable style={ui.btn} onPress={() => void requestPermission()}>
          <Text style={ui.btnText}>Autoriser la caméra</Text>
        </Pressable>
      ) : null}

      <View style={ui.card}>
        <Text style={ui.muted}>Ou saisie manuelle du code du reçu</Text>
        <TextInput
          style={ui.input}
          placeholder="id:qrToken"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          value={manualCode}
          onChangeText={setManualCode}
          onSubmitEditing={() => void charger(manualCode, false)}
          returnKeyType="done"
        />
        <Pressable
          style={[ui.btnGhost, !manualCode.trim() && ui.btnOff]}
          onPress={() => void charger(manualCode, false)}
          disabled={!manualCode.trim()}
        >
          <Text style={ui.btnGhostText}>Valider le code</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 96,
    gap: 14,
  },
  detailWrap: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 96,
    gap: 12,
  },
  hero: { alignItems: 'center', gap: 6, marginBottom: 4 },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  camBox: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
  },
});
