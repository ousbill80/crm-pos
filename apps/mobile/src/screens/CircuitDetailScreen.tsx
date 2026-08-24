import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatutTransaction, TypeTransaction } from '@caisse-crm/shared';
import { ApiError } from '../api';
import {
  getTransaction,
  passerEnTransit,
  rapprocher,
  receptionner,
  regulariser,
} from '../api/tresorerie';
import {
  formatFcfa,
  labelStatut,
  labelType,
  peutPasserEnTransit,
  peutRapprocher,
  peutReceptionner,
  peutRegulariser,
} from '../circuit/actions';
import { Money, ScreenHeader, StatusPill } from '../components/ScreenChrome';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';
import type {
  CaissesStackParamList,
  CircuitStackParamList,
  TransactionDto,
} from '../navigation/types';

type Props =
  | NativeStackScreenProps<CircuitStackParamList, 'CircuitDetail'>
  | NativeStackScreenProps<CaissesStackParamList, 'CircuitDetail'>;

export function CircuitDetailScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const { transactionId } = route.params;
  const [tx, setTx] = useState<TransactionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [montantRecu, setMontantRecu] = useState('');
  const [montantRetenu, setMontantRetenu] = useState('');
  const [motif, setMotif] = useState('');
  const [showRapprocher, setShowRapprocher] = useState(false);

  const charger = useCallback(async () => {
    const data = await getTransaction(transactionId);
    setTx(data);
    setMontantRecu(String(Number(data.montant)));
    setMontantRetenu(String(Number(data.montant)));
  }, [transactionId]);

  useEffect(() => {
    void charger().catch((err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Transaction introuvable ou hors périmètre.',
      );
    });
  }, [charger]);

  async function run(action: () => Promise<TransactionDto>) {
    setPending(true);
    setError(null);
    try {
      const next = await action();
      setTx(next);
      setShowRapprocher(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action refusée.');
    } finally {
      setPending(false);
    }
  }

  function confirmerAction(
    titre: string,
    message: string,
    action: () => void,
  ) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${titre}\n\n${message}`)) action();
      return;
    }
    Alert.alert(titre, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: action },
    ]);
  }

  if (!tx) {
    return (
      <View style={ui.center}>
        {error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator />}
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={ui.link}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const role = user?.role;
  const statut = tx.statut as (typeof StatutTransaction)[keyof typeof StatutTransaction];
  const type = tx.type as (typeof TypeTransaction)[keyof typeof TypeTransaction];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={ui.wrap}>
      <ScreenHeader
        title={labelType(tx.type)}
        subtitle={`${new Date(tx.dateHeure).toLocaleString('fr-FR')} · ${tx.caisse?.boutique?.nom ?? '—'} · ${tx.caisse?.libelle ?? tx.caisseId}`}
        onBack={() => navigation.goBack()}
        backLabel="Circuit"
        right={<StatusPill label={labelStatut(tx.statut)} tone={
          tx.statut === StatutTransaction.VALIDEE ? 'ok'
            : tx.statut === StatutTransaction.LITIGE ? 'danger'
            : tx.statut === StatutTransaction.EN_TRANSIT ? 'warn'
            : tx.statut === StatutTransaction.RECEPTIONNEE ? 'info'
            : 'neutral'
        } />}
      />
      <View style={[ui.card, { alignItems: 'flex-start', gap: 6 }]}>
        <Text style={ui.muted}>Montant</Text>
        <Money value={formatFcfa(tx.montant)} size="lg" />
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {role && peutPasserEnTransit(role, statut) ? (
        <Pressable
          style={ui.btn}
          disabled={pending}
          onPress={() =>
            confirmerAction(
              'Passer en transit',
              'Cette transition financière sera journalisée.',
              () => void run(() => passerEnTransit(tx.id)),
            )
          }
        >
          <Text style={ui.btnText}>Passer en transit</Text>
        </Pressable>
      ) : null}

      {role && peutReceptionner(role, statut) ? (
        <Pressable
          style={ui.btn}
          disabled={pending}
          onPress={() =>
            confirmerAction(
              'Réceptionner le versement',
              `Confirmer la réception de ${formatFcfa(tx.montant)} ?`,
              () => void run(() => receptionner(tx.id)),
            )
          }
        >
          <Text style={ui.btnText}>Réceptionner</Text>
        </Pressable>
      ) : null}

      {role && peutRapprocher(role, statut) && !showRapprocher ? (
        <Pressable
          style={ui.btn}
          disabled={pending}
          onPress={() => setShowRapprocher(true)}
        >
          <Text style={ui.btnText}>Rapprocher</Text>
        </Pressable>
      ) : null}

      {showRapprocher ? (
        <View style={{ gap: 8 }}>
          <Text>Montant reçu (déclaré {formatFcfa(tx.montant)})</Text>
          <TextInput
            style={ui.input}
            keyboardType="numeric"
            value={montantRecu}
            onChangeText={setMontantRecu}
          />
          <Pressable
            style={ui.btn}
            disabled={pending}
            onPress={() =>
              confirmerAction(
                'Confirmer le rapprochement',
                `Montant reçu : ${formatFcfa(Number(montantRecu))}. Cette action peut ouvrir un litige.`,
                () =>
                  void run(() => rapprocher(tx.id, Number(montantRecu))),
              )
            }
          >
            <Text style={ui.btnText}>Confirmer le rapprochement</Text>
          </Pressable>
        </View>
      ) : null}

      {tx.bordereau ? (
        <View style={ui.card}>
          <Text style={{ fontWeight: '700' }}>Bordereau</Text>
          <Text>Déclaré {formatFcfa(tx.bordereau.montantDeclare)}</Text>
          {tx.bordereau.reception ? (
            <>
              <Text>Reçu {formatFcfa(tx.bordereau.reception.montantRecu)}</Text>
              <Text>Écart {formatFcfa(tx.bordereau.reception.ecart)}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {tx.regularisation ? (
        <View style={ui.card}>
          <Text style={{ fontWeight: '700' }}>Régularisation</Text>
          <Text>{formatFcfa(tx.regularisation.montantRetenu)}</Text>
          <Text>{tx.regularisation.motif}</Text>
        </View>
      ) : null}

      {role && peutRegulariser(role, statut, type) ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Régulariser → Validée</Text>
          <TextInput
            style={ui.input}
            keyboardType="numeric"
            value={montantRetenu}
            onChangeText={setMontantRetenu}
            placeholder="Montant retenu"
          />
          <TextInput
            style={[ui.input, { minHeight: 72 }]}
            multiline
            value={motif}
            onChangeText={setMotif}
            placeholder="Motif (obligatoire)"
          />
          <Pressable
            style={[ui.btn, !motif.trim() && ui.btnOff]}
            disabled={pending || !motif.trim()}
            onPress={() =>
              confirmerAction(
                'Régulariser le litige',
                `Montant retenu : ${formatFcfa(Number(montantRetenu))}. La transaction passera à Validée.`,
                () =>
                  void run(() =>
                    regulariser(tx.id, {
                      montantRetenu: Number(montantRetenu),
                      motif: motif.trim(),
                    }),
                  ),
              )
            }
          >
            <Text style={ui.btnText}>Régulariser</Text>
          </Pressable>
        </View>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
