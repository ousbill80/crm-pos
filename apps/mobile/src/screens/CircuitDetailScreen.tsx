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
import { Ionicons } from '@expo/vector-icons';
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
  labelTypeCaisse,
  peutPasserEnTransit,
  peutRapprocher,
  peutReceptionner,
  peutRegulariser,
} from '../circuit/actions';
import { Banner, Money, ScreenHeader, StatusPill } from '../components/ScreenChrome';
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

const ETAPES = [
  { key: StatutTransaction.INITIEE, label: 'Initiée' },
  { key: StatutTransaction.EN_TRANSIT, label: 'En transit' },
  { key: StatutTransaction.RECEPTIONNEE, label: 'Réceptionnée' },
  { key: StatutTransaction.VALIDEE, label: 'Validée' },
] as const;

function iconDuType(type: string): keyof typeof Ionicons.glyphMap {
  if (type === TypeTransaction.SORTIE_FONDS) return 'business-outline';
  if (type === TypeTransaction.TRANSFERT_INTERNE) return 'swap-horizontal-outline';
  if (type === TypeTransaction.VENTE) return 'cart-outline';
  return 'repeat-outline';
}

function nomComplet(p?: { nom: string; prenom: string } | null): string | null {
  if (!p) return null;
  return `${p.prenom} ${p.nom}`.trim() || null;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type EtapeInfo = { acteur: string | null; date: string | null };

/**
 * Visualise le parcours Initiée → En transit → Réceptionnée → Validée (§6.4).
 * Seules les étapes réellement tracées côté serveur (initiation, rapprochement)
 * exposent un acteur/horodatage — « En transit »/« Réceptionnée » brutes ne
 * capturent pas d'acteur dédié (seul le journal d'audit le fait).
 */
function CircuitStepper({
  statut,
  infos,
}: {
  statut: string;
  infos: Partial<Record<(typeof ETAPES)[number]['key'], EtapeInfo>>;
}) {
  const isLitige = statut === StatutTransaction.LITIGE;
  const currentIndex = isLitige
    ? 2
    : ETAPES.findIndex((e) => e.key === statut);

  return (
    <View style={[ui.card, { gap: 10 }]}>
      <Text style={ui.sectionLabel}>Avancement du circuit</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {ETAPES.map((etape, i) => {
          const atteinte = i <= currentIndex;
          const bloqueeParLitige = isLitige && i === currentIndex;
          return (
            <View
              key={etape.key}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: !atteinte
                  ? colors.surfaceMuted
                  : bloqueeParLitige
                    ? colors.danger
                    : colors.accent,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {ETAPES.map((etape, i) => {
          const info = infos[etape.key];
          const align =
            i === 0 ? 'flex-start' : i === ETAPES.length - 1 ? 'flex-end' : 'center';
          return (
            <View key={etape.key} style={{ flex: 1, alignItems: align, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10.5,
                  fontWeight: i === currentIndex ? '800' : '600',
                  color: i <= currentIndex ? colors.text : colors.muted,
                }}
              >
                {etape.label}
              </Text>
              {info?.acteur ? (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 9.5, fontWeight: '700', color: colors.muted }}
                >
                  {info.acteur}
                </Text>
              ) : null}
              {info?.date ? (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 9, color: colors.tabInactive }}
                >
                  {dateCourte(info.date)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {isLitige ? (
        <Banner tone="danger">
          Rapprochement en litige — bloqué jusqu'à régularisation (§6.4).
        </Banner>
      ) : null}
    </View>
  );
}

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

  const caisseLabel =
    tx.caisse?.libelle ??
    (tx.caisse?.type ? labelTypeCaisse(tx.caisse.type) : tx.caisseId.slice(0, 8));
  const etapeInfos: Partial<Record<(typeof ETAPES)[number]['key'], EtapeInfo>> = {
    [StatutTransaction.INITIEE]: {
      acteur: nomComplet(tx.initiateur),
      date: tx.dateHeure,
    },
    ...(tx.bordereau?.reception
      ? {
          [tx.bordereau.reception.statutFinal === StatutTransaction.LITIGE
            ? StatutTransaction.RECEPTIONNEE
            : StatutTransaction.VALIDEE]: {
            acteur: nomComplet(tx.bordereau.reception.validateur),
            date: tx.bordereau.reception.dateReception,
          },
        }
      : {}),
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={ui.wrap}>
      <ScreenHeader
        title={labelType(tx.type)}
        subtitle={`${new Date(tx.dateHeure).toLocaleString('fr-FR')} · ${tx.caisse?.boutique?.nom ?? '—'} · ${caisseLabel}`}
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
      <View style={[ui.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={iconDuType(tx.type)} size={23} color={colors.accent} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={ui.muted}>Montant</Text>
          <Money value={formatFcfa(tx.montant)} size="lg" />
        </View>
      </View>

      <CircuitStepper statut={tx.statut} infos={etapeInfos} />
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
        <View style={[ui.card, { gap: 10 }]}>
          <View style={ui.row}>
            <Text style={ui.sectionLabel}>Bordereau</Text>
            {tx.bordereau.reception ? (
              <StatusPill
                label={
                  Number(tx.bordereau.reception.ecart) === 0
                    ? 'Sans écart'
                    : 'Écart constaté'
                }
                tone={
                  Number(tx.bordereau.reception.ecart) === 0 ? 'ok' : 'danger'
                }
              />
            ) : null}
          </View>
          <View style={ui.row}>
            <Text style={ui.muted}>Déclaré</Text>
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {formatFcfa(tx.bordereau.montantDeclare)}
            </Text>
          </View>
          {tx.bordereau.reception ? (
            <>
              <View style={ui.row}>
                <Text style={ui.muted}>Reçu</Text>
                <Text style={{ fontWeight: '700', color: colors.text }}>
                  {formatFcfa(tx.bordereau.reception.montantRecu)}
                </Text>
              </View>
              <View style={ui.row}>
                <Text style={ui.muted}>Écart</Text>
                <Text
                  style={{
                    fontWeight: '800',
                    color:
                      Number(tx.bordereau.reception.ecart) === 0
                        ? colors.ok
                        : colors.danger,
                  }}
                >
                  {formatFcfa(tx.bordereau.reception.ecart)}
                </Text>
              </View>
              {nomComplet(tx.bordereau.reception.validateur) ? (
                <View style={ui.row}>
                  <Text style={ui.muted}>Rapproché par</Text>
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {nomComplet(tx.bordereau.reception.validateur)} ·{' '}
                    {dateCourte(tx.bordereau.reception.dateReception)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {tx.regularisation ? (
        <View style={[ui.card, { gap: 8 }]}>
          <Text style={ui.sectionLabel}>Régularisation</Text>
          <View style={ui.row}>
            <Text style={ui.muted}>Montant retenu</Text>
            <Text style={{ fontWeight: '800', color: colors.text }}>
              {formatFcfa(tx.regularisation.montantRetenu)}
            </Text>
          </View>
          <Text style={{ color: colors.text }}>{tx.regularisation.motif}</Text>
          <Text style={[ui.muted, { fontSize: 11 }]}>
            {[
              nomComplet(tx.regularisation.validateur),
              new Date(tx.regularisation.dateRegularisation).toLocaleString('fr-FR'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
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
