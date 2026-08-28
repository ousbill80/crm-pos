import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api';
import { p2pApi, type JsonRecord } from '../../api/p2p';
import { Banner, ScreenHeader, StatusPill } from '../../components/ScreenChrome';
import { SensitiveOnlineAction } from '../../components/SensitiveOnlineAction';
import { canP2p } from '../../p2p/permissions';
import { buildQualityLine } from '../../p2p/payloads';
import { requireChallengeId } from '../../p2p/sensitive-challenge';
import { useSession } from '../../session-context';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

type DetailRoute =
  | 'PurchaseRequestDetail'
  | 'PurchaseOrderDetail'
  | 'PurchaseReceiptDetail'
  | 'SupplierInvoiceDetail';

const CONFIG: Record<DetailRoute, {
  title: string;
  load: (id: string) => Promise<JsonRecord & { id: string; statut?: string }>;
}> = {
  PurchaseRequestDetail: { title: 'Demande d’achat', load: p2pApi.request },
  PurchaseOrderDetail: { title: 'Commande & import', load: p2pApi.order },
  PurchaseReceiptDetail: { title: 'Réception', load: p2pApi.receipt },
  SupplierInvoiceDetail: { title: 'Facture & match', load: p2pApi.invoice },
};

export function P2pDetailScreen({ navigation, route }: NativeStackScreenProps<P2pStackParamList, DetailRoute>) {
  const { user } = useSession();
  const config = CONFIG[route.name];
  const [data, setData] = useState<(JsonRecord & { id: string; statut?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [motif, setMotif] = useState('');
  const [lineId, setLineId] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [acceptedQty, setAcceptedQty] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await config.load(route.params.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Détail inaccessible.');
    }
  }, [config, route.params.id]);
  useEffect(() => void load(), [load]);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Action refusée.');
    } finally {
      setPending(false);
    }
  }

  if (!data || !user) {
    return <View style={ui.center}>{error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator />}</View>;
  }

  const id = data.id;
  const status = String(data.statut ?? '—');
  const lines = Array.isArray(data.lignes) ? data.lignes as JsonRecord[] : [];

  return (
    <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={config.title} subtitle={id} onBack={() => navigation.goBack()} right={<StatusPill label={status} tone={status.includes('REJET') || status.includes('LITIGE') ? 'danger' : 'warn'} />} />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Summary data={data} />
      {lines.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>Lignes</Text>
          {lines.map((line, index) => <Summary key={String(line.id ?? index)} data={line} compact />)}
        </View>
      ) : null}
      {(route.name === 'PurchaseReceiptDetail' || route.name === 'SupplierInvoiceDetail') ? (
        <View style={ui.card}>
          <Text style={styles.section}>Preuve sécurisée</Text>
          <TextInput style={ui.input} value={evidenceId} onChangeText={setEvidenceId} placeholder="UUID de la preuve" placeholderTextColor={colors.muted} />
          <Pressable
            style={[ui.btnGhost, !evidenceId && ui.btnOff]}
            disabled={!evidenceId}
            onPress={() => void run(() => p2pApi.downloadEvidence(evidenceId))}
          >
            <Text style={ui.btnGhostText}>Télécharger la preuve</Text>
          </Pressable>
        </View>
      ) : null}

      {route.name === 'PurchaseRequestDetail' ? (
        <View style={ui.card}>
          <Text style={styles.section}>Circuit demande</Text>
          {canP2p(user.role, 'REQUEST_WRITE') && status === 'BROUILLON' ? (
            <Pressable style={[ui.btn, pending && ui.btnOff]} disabled={pending} onPress={() => void run(() => p2pApi.submitRequest(id))}>
              <Text style={ui.btnText}>Soumettre</Text>
            </Pressable>
          ) : null}
          {canP2p(user.role, 'REQUEST_APPROVE') && status === 'SOUMISE' ? (
            <>
              <SensitiveOnlineAction label="Approuver la demande" confirmation="Cette décision engage le budget et sera auditée." onConfirmed={() => run(() => p2pApi.approveRequest(id))} />
              <TextInput style={ui.input} value={motif} onChangeText={setMotif} placeholder="Motif du rejet" placeholderTextColor={colors.muted} />
              <SensitiveOnlineAction destructive disabled={motif.trim().length < 3} label="Rejeter" confirmation="La demande sera rejetée avec le motif saisi." onConfirmed={() => run(() => p2pApi.rejectRequest(id, motif))} />
            </>
          ) : null}
        </View>
      ) : null}

      {route.name === 'PurchaseOrderDetail' ? (
        <View style={ui.card}>
          <Text style={styles.section}>Commande et jalons</Text>
          <Pressable style={ui.btnGhost} onPress={() => navigation.navigate('OrderImport', { id })}>
            <Text style={ui.btnGhostText}>Voir dossier import complet</Text>
          </Pressable>
          {canP2p(user.role, 'ORDER_WRITE') && status === 'BROUILLON' ? (
            <Pressable style={ui.btn} onPress={() => void run(() => p2pApi.submitOrder(id))}><Text style={ui.btnText}>Soumettre</Text></Pressable>
          ) : null}
          {canP2p(user.role, 'ORDER_APPROVE') && status.includes('SOUMISE') ? (
            <SensitiveOnlineAction label="Approuver la commande" confirmation="L’approbation de cette commande sera auditée." onConfirmed={() => run(() => p2pApi.approveOrder(id))} />
          ) : null}
          {canP2p(user.role, 'IMPORT') ? (
            <SensitiveOnlineAction label="Enregistrer jalon production" confirmation="Confirmer le jalon de production à la date actuelle." onConfirmed={() => run(() => p2pApi.productionMilestone(id, new Date().toISOString()))} />
          ) : null}
        </View>
      ) : null}

      {route.name === 'PurchaseReceiptDetail' && canP2p(user.role, 'QUALITY') ? (
        <View style={ui.card}>
          <Text style={styles.section}>Contrôle qualité indépendant</Text>
          <Banner>Les quantités refusées restent en quarantaine jusqu’au retour fournisseur.</Banner>
          <TextInput style={ui.input} value={lineId} onChangeText={setLineId} placeholder="UUID ligne réception" placeholderTextColor={colors.muted} />
          <View style={ui.row}>
            <TextInput style={[ui.input, { flex: 1 }]} value={receivedQty} onChangeText={setReceivedQty} keyboardType="number-pad" placeholder="Reçue" placeholderTextColor={colors.muted} />
            <TextInput style={[ui.input, { flex: 1 }]} value={acceptedQty} onChangeText={setAcceptedQty} keyboardType="number-pad" placeholder="Acceptée" placeholderTextColor={colors.muted} />
          </View>
          <TextInput style={ui.input} value={motif} onChangeText={setMotif} placeholder="Motif de rejet éventuel" placeholderTextColor={colors.muted} />
          <Pressable style={ui.btn} onPress={() => void run(() => p2pApi.quality(id, [buildQualityLine({ ligneReceptionId: lineId, quantiteRecue: Number(receivedQty), quantiteAcceptee: Number(acceptedQty), motifRejet: motif })]))}>
            <Text style={ui.btnText}>Valider le contrôle qualité</Text>
          </Pressable>
          <TextInput style={ui.input} value={destinationId} onChangeText={setDestinationId} placeholder="UUID emplacement stock" placeholderTextColor={colors.muted} />
          <Pressable style={ui.btnGhost} onPress={() => void run(() => p2pApi.putaway(id, [{ ligneQualiteId: lineId, destinationId }]))}>
            <Text style={ui.btnGhostText}>Mettre en stock (putaway)</Text>
          </Pressable>
          <Pressable style={ui.btnGhost} onPress={() => navigation.navigate('SupplierReturnCreate', { receiptId: id })}>
            <Text style={[ui.btnGhostText, { color: colors.danger }]}>Préparer un retour fournisseur</Text>
          </Pressable>
        </View>
      ) : null}

      {route.name === 'SupplierInvoiceDetail' ? (
        <View style={ui.card}>
          <Text style={styles.section}>Revue et décisions</Text>
          {canP2p(user.role, 'INVOICE_REVIEW') ? (
            <>
              <SensitiveOnlineAction label="Confirmer extraction / match" confirmation="Confirmer la lecture et le rapprochement de la facture." onConfirmed={() => run(() => p2pApi.reviewExtraction(id, 'CONFIRMER'))} />
              <SensitiveOnlineAction destructive label="Rejeter l’extraction" confirmation="L’extraction sera rejetée et tracée." onConfirmed={() => run(() => p2pApi.reviewExtraction(id, 'REJETER', motif || undefined))} />
              <SensitiveOnlineAction
                label="Comptabiliser"
                purpose="P2P_INVOICE_POST"
                confirmation="Une écriture comptable append-only sera créée."
                onConfirmed={(challengeId) =>
                  run(() => p2pApi.postInvoice(id, requireChallengeId(challengeId)))
                }
              />
            </>
          ) : null}
          {canP2p(user.role, 'INVOICE_EXCEPTION') ? (
            <>
              <TextInput style={ui.input} value={motif} onChangeText={setMotif} placeholder="Motif détaillé (10 caractères min.)" placeholderTextColor={colors.muted} />
              <SensitiveOnlineAction label="Accorder une exception" disabled={motif.trim().length < 10} confirmation="Cette dérogation au litige P2P sera auditée." onConfirmed={() => run(() => p2pApi.grantInvoiceException(id, motif))} />
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Summary({ data, compact = false }: { data: JsonRecord; compact?: boolean }) {
  const entries = Object.entries(data).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, compact ? 7 : 12);
  return (
    <View style={ui.card}>
      {entries.map(([key, value]) => (
        <View key={key} style={ui.row}>
          <Text style={[ui.muted, { flex: 1 }]}>{key}</Text>
          <Text selectable style={{ maxWidth: '62%', color: colors.text, fontWeight: '600', textAlign: 'right' }}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = {
  section: { fontWeight: '800' as const, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.7, color: colors.muted },
};

