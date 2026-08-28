import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api';
import {
  p2pApi,
  type JsonRecord,
  type PaymentProposal,
} from '../../api/p2p';
import { Banner, ScreenHeader } from '../../components/ScreenChrome';
import { SensitiveOnlineAction } from '../../components/SensitiveOnlineAction';
import { canP2p } from '../../p2p/permissions';
import { requireChallengeId } from '../../p2p/sensitive-challenge';
import { useSession } from '../../session-context';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

export function OrderImportScreen({ navigation, route }: NativeStackScreenProps<P2pStackParamList, 'OrderImport'>) {
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void p2pApi.orderImport(route.params.id).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Dossier import inaccessible.')); }, [route.params.id]);
  return (
    <ScrollView contentContainerStyle={ui.wrap}>
      <ScreenHeader title="Dossier import" subtitle="Production, expéditions, conteneurs, douane et coûts rendus." onBack={() => navigation.goBack()} />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {data ? <JsonCards data={data} /> : <Banner tone="info">Chargement du dossier réel…</Banner>}
    </ScrollView>
  );
}

export function SupplierReturnCreateScreen({ navigation, route }: NativeStackScreenProps<P2pStackParamList, 'SupplierReturnCreate'>) {
  const [lineId, setLineId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    try {
      await p2pApi.createReturn(route.params.receiptId, {
        motif: reason,
        avoirAttendu: true,
        lignes: [{ ligneQualiteId: lineId, quantite: Number(quantity), depuisStock: false, sourceId }],
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retour refusé.');
    }
  }
  return (
    <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Retour fournisseur" subtitle="Les articles restent tracés depuis la quarantaine ou le stock." onBack={() => navigation.goBack()} />
      <Input label="Ligne qualité (UUID)" value={lineId} onChangeText={setLineId} />
      <Input label="Emplacement source (UUID)" value={sourceId} onChangeText={setSourceId} />
      <Input label="Quantité" value={quantity} onChangeText={setQuantity} />
      <Input label="Motif" value={reason} onChangeText={setReason} />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Pressable style={[ui.btn, (!lineId || !sourceId || reason.length < 3) && ui.btnOff]} disabled={!lineId || !sourceId || reason.length < 3} onPress={() => void submit()}>
        <Text style={ui.btnText}>Préparer le retour</Text>
      </Pressable>
    </ScrollView>
  );
}

export function P2pAccountingScreen({ navigation }: NativeStackScreenProps<P2pStackParamList, 'P2pAccounting'>) {
  const { user } = useSession();
  const [companyId, setCompanyId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [proposals, setProposals] = useState<PaymentProposal[]>([]);
  const [proposalDetail, setProposalDetail] = useState<PaymentProposal | null>(null);
  const [reference, setReference] = useState('');
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = new Date().toISOString().slice(0, 10);
  const start = `${end.slice(0, 4)}-01-01`;
  async function load() {
    try {
      setData(await p2pApi.accountingDashboard(companyId, start, end) as JsonRecord);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Rapports inaccessibles.');
    }
  }
  async function loadProposals() {
    try {
      const page = await p2pApi.paymentProposals();
      setProposals(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Propositions inaccessibles.');
    }
  }
  async function selectProposal(id: string) {
    setPaymentId(id);
    try {
      setProposalDetail(await p2pApi.paymentProposal(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Détail de proposition inaccessible.');
    }
  }
  useEffect(() => {
    void loadProposals();
  }, []);
  if (!user) return null;
  return (
    <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Comptabilité & paiements" subtitle={`Rapports ${start} → ${end}`} onBack={() => navigation.goBack()} />
      <Input label="Société (UUID)" value={companyId} onChangeText={setCompanyId} />
      <Pressable style={[ui.btnGhost, !companyId && ui.btnOff]} disabled={!companyId} onPress={() => void load()}><Text style={ui.btnGhostText}>Charger les tableaux</Text></Pressable>
      {data ? <JsonCards data={data} /> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {(canP2p(user.role, 'PAYMENT_APPROVE') || canP2p(user.role, 'PAYMENT_EXCEPTION') || canP2p(user.role, 'PAYMENT_EXECUTE')) ? (
        <View style={ui.card}>
          <Text style={styles.section}>Décision de paiement</Text>
          <Pressable style={ui.btnGhost} onPress={() => void loadProposals()}>
            <Text style={ui.btnGhostText}>Actualiser les propositions</Text>
          </Pressable>
          {proposals.length === 0 ? <Banner tone="info">Aucune proposition dans votre périmètre.</Banner> : proposals.map((proposal) => (
            <Pressable
              key={proposal.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: paymentId === proposal.id }}
              style={[ui.card, paymentId === proposal.id && { borderColor: colors.accent }]}
              onPress={() => void selectProposal(proposal.id)}
            >
              <View style={ui.row}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{proposal.numero}</Text>
                <Text style={ui.muted}>{proposal.statut}</Text>
              </View>
              <Text style={ui.muted}>{String(proposal.montant)} {proposal.devise} · {proposal.dateExecutionPrevue}</Text>
            </Pressable>
          ))}
          {proposalDetail ? <JsonCards data={proposalDetail} /> : null}
          <Input label="Référence d’exécution" value={reference} onChangeText={setReference} />
          {canP2p(user.role, 'PAYMENT_APPROVE') ? <SensitiveOnlineAction disabled={!paymentId} purpose="P2P_PAYMENT_APPROVE" label="Approuver niveau DAF" confirmation="Approuver cette proposition de paiement fournisseur." onConfirmed={(challengeId) => p2pApi.approvePayment(paymentId, requireChallengeId(challengeId)).then(() => loadProposals())} /> : null}
          {canP2p(user.role, 'PAYMENT_EXCEPTION') ? <SensitiveOnlineAction disabled={!paymentId} purpose="P2P_PAYMENT_EXCEPTION_APPROVE" label="Approuver l’exception DG" confirmation="Valider cette proposition au-dessus du seuil exceptionnel." onConfirmed={(challengeId) => p2pApi.approvePayment(paymentId, requireChallengeId(challengeId), true).then(() => loadProposals())} /> : null}
          {canP2p(user.role, 'PAYMENT_EXECUTE') ? <SensitiveOnlineAction disabled={!paymentId} purpose="P2P_PAYMENT_EXECUTE" label="Exécuter le paiement" confirmation="Cette action créera les mouvements financiers append-only." onConfirmed={(challengeId) => p2pApi.executePayment(paymentId, requireChallengeId(challengeId), reference || undefined).then(() => loadProposals())} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

export function AccountingAiScreen({ navigation }: NativeStackScreenProps<P2pStackParamList, 'AccountingAi'>) {
  const { user } = useSession();
  const [companyId, setCompanyId] = useState('');
  const [actionId, setActionId] = useState('');
  const [reason, setReason] = useState('');
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const [dashboard, workItems, findings] = await Promise.all([p2pApi.aiDashboard(companyId), p2pApi.aiWorkItems(companyId), p2pApi.aiFindings(companyId)]);
      setData({ dashboard, workItems, findings });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Contrôle IA inaccessible.');
    }
  }
  if (!user) return null;
  return (
    <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Contrôle comptable IA" subtitle="Suggestions non autonomes, politiques approuvées et anomalies auditables." onBack={() => navigation.goBack()} />
      <Banner>Aucune suggestion ne comptabilise ni ne paie seule. Toute décision ci-dessous est en ligne et ré-authentifiée.</Banner>
      <Input label="Société (UUID)" value={companyId} onChangeText={setCompanyId} />
      <Pressable style={[ui.btnGhost, !companyId && ui.btnOff]} disabled={!companyId} onPress={() => void load()}><Text style={ui.btnGhostText}>Charger le contrôle IA</Text></Pressable>
      {data ? <JsonCards data={data} /> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <View style={ui.card}>
        <Text style={styles.section}>Décision contrôlée</Text>
        <Input label="Suggestion / politique / finding (UUID)" value={actionId} onChangeText={setActionId} />
        <Input label="Motif / résolution" value={reason} onChangeText={setReason} />
        {canP2p(user.role, 'AI_REVIEW') ? (
          <>
            <SensitiveOnlineAction disabled={!actionId} label="Accepter la suggestion" confirmation="Accepter cette suggestion IA après revue humaine." onConfirmed={() => p2pApi.decideSuggestion(actionId, 'ACCEPTED', reason || undefined).then(() => undefined)} />
            <SensitiveOnlineAction destructive disabled={!actionId} label="Rejeter la suggestion" confirmation="Rejeter cette suggestion IA." onConfirmed={() => p2pApi.decideSuggestion(actionId, 'REJECTED', reason || undefined).then(() => undefined)} />
          </>
        ) : null}
        {canP2p(user.role, 'AI_POLICY_APPROVE') ? <SensitiveOnlineAction disabled={!actionId} purpose="ACCOUNTING_AI_POLICY_APPROVE" label="Approuver la politique" confirmation="Activer cette politique IA à faible risque après contrôle DAF." onConfirmed={(challengeId) => p2pApi.approvePolicy(actionId, requireChallengeId(challengeId)).then(() => undefined)} /> : null}
        {canP2p(user.role, 'AI_REMEDIATE') ? <SensitiveOnlineAction disabled={!actionId || !reason} label="Résoudre l’anomalie" confirmation="Clore cette anomalie avec la résolution saisie." onConfirmed={() => p2pApi.resolveFinding(actionId, reason).then(() => undefined)} /> : null}
      </View>
    </ScrollView>
  );
}

function JsonCards({ data }: { data: JsonRecord }) {
  return <View style={ui.card}>{Object.entries(data).map(([key, value]) => (
    <View key={key} style={{ gap: 3 }}>
      <Text style={{ fontWeight: '800', color: colors.text }}>{key}</Text>
      <Text selectable style={ui.muted} numberOfLines={8}>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</Text>
    </View>
  ))}</View>;
}

function Input({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={{ gap: 4 }}><Text style={ui.muted}>{label}</Text><TextInput accessibilityLabel={label} style={ui.input} value={value} onChangeText={onChangeText} placeholderTextColor={colors.muted} /></View>;
}

const styles = { section: { fontWeight: '800' as const, fontSize: 12, textTransform: 'uppercase' as const, color: colors.muted } };

