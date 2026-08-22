import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

/**
 * Scan code-barres produit (POS terrain).
 * Sur navigateur / sans caméra : saisie manuelle reste le chemin principal.
 */
export function ScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const dejaScanne = useRef(false);
  const cameraUtile = Platform.OS !== 'web';

  function valider(code: string) {
    if (dejaScanne.current || !code.trim()) return;
    dejaScanne.current = true;
    navigation.navigate('Main', {
      screen: 'Caisse',
      params: {
        screen: 'PosHome',
        params: { scannedCode: code.trim() },
      },
    });
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    valider(result.data);
  }

  if (!permission) {
    return <View style={styles.root} />;
  }

  const camAutorisee = cameraUtile && permission.granted;

  if (!camAutorisee) {
    return (
      <View style={styles.root}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <View style={styles.topNav}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backChip}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={colors.accentText} />
            <Text style={styles.backLabel}>Caisse</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.iconRing}>
            <View style={styles.iconDisc}>
              <Ionicons name="barcode-outline" size={36} color={colors.accent} />
            </View>
          </View>
          <Text style={styles.kicker}>SCAN PRODUIT</Text>
          <Text style={styles.headline}>
            {cameraUtile ? 'Scanner un article' : 'Saisir le code article'}
          </Text>
          <Text style={styles.lead}>
            {cameraUtile
              ? 'Autorisez la caméra pour viser le code-barres, ou entrez le code à la main.'
              : 'La caméra n’est pas disponible dans le navigateur. Entrez le code-barres pour l’ajouter au ticket.'}
          </Text>
        </View>

        <View style={styles.panel}>
          {cameraUtile ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => void requestPermission()}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Autoriser la caméra</Text>
            </Pressable>
          ) : null}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou saisie manuelle</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.fieldLabel}>Code-barres / référence</Text>
          <TextInput
            style={styles.field}
            placeholder="Ex. 3760123456789"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!cameraUtile}
            value={manualCode}
            onChangeText={setManualCode}
            onSubmitEditing={() => valider(manualCode)}
            returnKeyType="done"
          />

          <Pressable
            style={[
              styles.primaryBtn,
              !manualCode.trim() && styles.primaryBtnOff,
            ]}
            onPress={() => valider(manualCode)}
            disabled={!manualCode.trim()}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Ajouter au ticket</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.ghostBtn}
          >
            <Text style={styles.ghostBtnText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.camRoot}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'qr'],
        }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View style={styles.camMask} pointerEvents="none">
        <View style={styles.camFrame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>
      <View style={styles.camTop}>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.camTitle}>Scanner</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.camFooter}>
        <Text style={styles.camHint}>Cadrez le code dans le cadre</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInputDark}
            placeholder="Saisie manuelle"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            value={manualCode}
            onChangeText={setManualCode}
            onSubmitEditing={() => valider(manualCode)}
          />
          <Pressable
            style={[
              styles.okBtn,
              !manualCode.trim() && styles.primaryBtnOff,
            ]}
            onPress={() => valider(manualCode)}
            disabled={!manualCode.trim()}
          >
            <Text style={styles.primaryBtnText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ECF4F2',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 28,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 200,
    backgroundColor: 'rgba(15, 118, 110, 0.12)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 200,
    backgroundColor: 'rgba(15, 118, 110, 0.08)',
  },
  topNav: {
    marginBottom: 12,
  },
  backChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D5DDD9',
  },
  backLabel: {
    color: colors.accentText,
    fontWeight: '700',
    fontSize: 13,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(15, 118, 110, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: '800',
    color: colors.accent,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 340,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#DCE6E2',
    shadowColor: '#0F766E',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnOff: { opacity: 0.4 },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D5DDD9',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -6,
  },
  field: {
    borderWidth: 1.5,
    borderColor: '#C5D4CF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#F8FAF9',
  },
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  ghostBtnText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  camRoot: { flex: 1, backgroundColor: '#0B1220' },
  camMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camFrame: {
    width: '72%',
    aspectRatio: 1.4,
    maxHeight: 220,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#5EEAD4',
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  camTop: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  camTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    gap: 12,
    backgroundColor: 'rgba(11,18,32,0.92)',
  },
  camHint: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontWeight: '600',
  },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualInputDark: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  okBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
