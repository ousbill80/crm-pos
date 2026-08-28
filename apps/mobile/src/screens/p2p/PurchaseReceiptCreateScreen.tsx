import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api';
import { newOperationId, p2pApi } from '../../api/p2p';
import { Banner, ScreenHeader } from '../../components/ScreenChrome';
import { enqueueTerrainP2p } from '../../p2p/offline-policy';
import { buildReceiptLine, parseSerials } from '../../p2p/payloads';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<P2pStackParamList, 'PurchaseReceiptCreate'>;

export function PurchaseReceiptCreateScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraMode, setCameraMode] = useState<'scan' | 'photo' | null>(null);
  const [commandeId, setCommandeId] = useState('');
  const [expeditionId, setExpeditionId] = useState('');
  const [quarantineId, setQuarantineId] = useState('');
  const [lineId, setLineId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [barcode, setBarcode] = useState('');
  const [lot, setLot] = useState('');
  const [expiration, setExpiration] = useState('');
  const [serials, setSerials] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [createdReceiptId, setCreatedReceiptId] = useState<string | null>(null);

  async function openCamera(mode: 'scan' | 'photo') {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError('Caméra refusée : utilisez la saisie manuelle.');
        return;
      }
    }
    setCameraMode(mode);
  }

  function onScan(result: BarcodeScanningResult) {
    setBarcode(result.data);
    setCameraMode(null);
  }

  async function takeEvidencePhoto() {
    const captured = await cameraRef.current?.takePictureAsync({ quality: 0.75 });
    if (!captured?.uri) {
      setError('Capture photo impossible.');
      return;
    }
    setPhoto({
      uri: captured.uri,
      name: `reception-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
    setCameraMode(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    setQueued(false);
    try {
      if (createdReceiptId) {
        if (!photo) {
          navigation.replace('PurchaseReceiptDetail', { id: createdReceiptId });
          return;
        }
        await p2pApi.uploadEvidence('RECEIPT', createdReceiptId, photo);
        navigation.replace('PurchaseReceiptDetail', { id: createdReceiptId });
        return;
      }
      const clientOperationId = newOperationId();
      const body = {
        clientOperationId,
        commandeId,
        ...(expeditionId ? { expeditionId } : {}),
        emplacementQuarantaineId: quarantineId,
        lignes: [buildReceiptLine({
          ligneCommandeId: lineId,
          quantiteRecue: Number(quantity),
          codeBarres: barcode || undefined,
          numeroLot: lot || undefined,
          dateExpiration: expiration || undefined,
          numerosSerie: parseSerials(serials),
        })],
      };
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) {
        if (photo) {
          throw new Error(
            'La preuve photo doit être téléversée immédiatement : reconnectez-vous ou retirez la photo avant de mettre la réception en file.',
          );
        }
        await enqueueTerrainP2p('/achats/receptions', body);
        setQueued(true);
        return;
      }
      const created = await p2pApi.createReceipt({
        commandeId,
        expeditionId: expeditionId || undefined,
        emplacementQuarantaineId: quarantineId,
        lignes: body.lignes,
      });
      setCreatedReceiptId(created.id);
      if (photo) {
        await p2pApi.uploadEvidence('RECEIPT', created.id, photo);
      }
      navigation.replace('PurchaseReceiptDetail', { id: created.id });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Réception refusée.');
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Réception quantitative" subtitle="Logistique terrain · toute marchandise entre d’abord en quarantaine." onBack={() => navigation.goBack()} />
        <Banner>Idempotente et autorisée en file hors ligne. La qualité reste une décision indépendante.</Banner>
        <Field label="Commande (UUID)" value={commandeId} onChangeText={setCommandeId} />
        <Field label="Expédition (UUID, optionnel)" value={expeditionId} onChangeText={setExpeditionId} />
        <Field label="Emplacement quarantaine (UUID)" value={quarantineId} onChangeText={setQuarantineId} />
        <View style={ui.card}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Ligne reçue</Text>
          <Field label="Ligne commande (UUID)" value={lineId} onChangeText={setLineId} />
          <Field label="Quantité reçue" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          <View style={ui.row}>
            <TextInput accessibilityLabel="Code-barres" style={[ui.input, { flex: 1 }]} value={barcode} onChangeText={setBarcode} placeholder="Scan ou code-barres" placeholderTextColor={colors.muted} />
            <Pressable accessibilityRole="button" accessibilityLabel="Scanner le code-barres" style={ui.btnGhost} onPress={() => void openCamera('scan')}>
              <Text style={ui.btnGhostText}>Scanner</Text>
            </Pressable>
          </View>
          <Field label="Numéro de lot" value={lot} onChangeText={setLot} />
          <Field label="Expiration (ISO, optionnel)" value={expiration} onChangeText={setExpiration} />
          <Field label="Numéros de série (virgule ou ligne)" value={serials} onChangeText={setSerials} multiline />
        </View>
        <View style={ui.card}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Preuve photo sécurisée</Text>
          <Banner tone="info">JPEG téléversé vers le stockage P2P sécurisé après création de la réception. Maximum serveur : 5 Mo par défaut.</Banner>
          {photo ? (
            <View style={ui.row}>
              <Text style={[ui.muted, { flex: 1 }]}>{photo.name}</Text>
              <Pressable accessibilityRole="button" onPress={() => setPhoto(null)}>
                <Text style={[ui.link, { color: colors.danger }]}>Retirer</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={ui.btnGhost} onPress={() => void openCamera('photo')}>
              <Text style={ui.btnGhostText}>Prendre une photo</Text>
            </Pressable>
          )}
        </View>
        {queued ? <Text style={ui.success}>Réception chiffrée localement et placée dans la file terrain. Elle sera envoyée à la reconnexion.</Text> : null}
        {createdReceiptId && error ? <Banner>La réception est créée. Réessayez pour téléverser uniquement la preuve, sans recréer la réception.</Banner> : null}
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <Pressable
          style={[ui.btn, (pending || !commandeId || !quarantineId || !lineId) && ui.btnOff]}
          disabled={pending || !commandeId || !quarantineId || !lineId}
          onPress={() => void submit()}
        >
          <Text style={ui.btnText}>{pending ? 'Enregistrement…' : 'Enregistrer la réception'}</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={cameraMode !== null} animationType="slide" onRequestClose={() => setCameraMode(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={cameraMode === 'scan' ? onScan : undefined}
          />
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 32, gap: 8 }}>
            {cameraMode === 'photo' ? (
              <Pressable style={ui.btn} onPress={() => void takeEvidencePhoto()}>
                <Text style={ui.btnText}>Capturer la preuve</Text>
              </Pressable>
            ) : null}
            <Pressable style={ui.btnGhost} onPress={() => setCameraMode(null)}>
              <Text style={ui.btnGhostText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'number-pad';
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={ui.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[ui.input, props.multiline && { minHeight: 74, textAlignVertical: 'top' }]}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}
