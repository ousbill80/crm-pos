import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { StatutTransaction, TypeTransaction } from '@caisse-crm/shared';
import { listTransactions } from '../api/tresorerie';
import { ApiError } from '../api';
import {
  formatFcfa,
  labelStatut,
  labelType,
  peutNouveauVersement,
} from '../circuit/actions';
import {
  Banner,
  Chip,
  Money,
  ScreenHeader,
  StatusPill,
} from '../components/ScreenChrome';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SessionBanner } from '../components/SessionBanner';
import { useRootNavigation } from '../navigation/use-root-navigation';
import { useOutboxPending } from '../offline/use-outbox-pending';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';
import type { CircuitStackParamList, TransactionDto } from '../navigation/types';

const FILTRES: { id: string; label: string; type?: string; statut?: string }[] =
  [
    { id: 'all', label: 'Toutes' },
    { id: 'sortie', label: 'Magasin > centrale', type: TypeTransaction.SORTIE_FONDS },
    { id: 'interne', label: 'Tiroir > magasin', type: TypeTransaction.TRANSFERT_INTERNE },
    { id: 'transit', label: 'En transit', statut: StatutTransaction.EN_TRANSIT },
    { id: 'litige', label: 'Litiges', statut: StatutTransaction.LITIGE },
  ];

function toneStatut(statut: string): 'neutral' | 'ok' | 'warn' | 'danger' | 'info' {
  if (statut === StatutTransaction.VALIDEE) return 'ok';
  if (statut === StatutTransaction.LITIGE) return 'danger';
  if (statut === StatutTransaction.EN_TRANSIT) return 'warn';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'info';
  return 'neutral';
}

export function CircuitListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CircuitStackParamList>>();
  const root = useRootNavigation();
  const { user } = useSession();
  const pendingOutbox = useOutboxPending();
  const [filtre, setFiltre] = useState(FILTRES[0].id);
  const [rows, setRows] = useState<TransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const actif = FILTRES.find((f) => f.id === filtre) ?? FILTRES[0];
  const peutInitier = user ? peutNouveauVersement(user.role) : false;

  const charger = useCallback(async () => {
    setError(null);
    const data = await listTransactions({
      type: actif.type,
      statut: actif.statut,
    });
    setRows(data);
    setLoading(false);
  }, [actif.statut, actif.type]);

  useEffect(() => {
    setLoading(true);
    void charger().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
      setLoading(false);
    });
  }, [charger]);

  return (
    <View style={ui.wrap}>
      <SessionBanner />
      <ScreenHeader
        title="Circuit"
        subtitle="Tiroir > Magasin > Centrale (§6.4)"
        right={
          peutInitier ? (
            <Pressable
              style={ui.btnGhost}
              onPress={() => navigation.navigate('NouveauVersement')}
            >
              <Text style={ui.link}>+ Versement</Text>
            </Pressable>
          ) : null
        }
      />
      {pendingOutbox > 0 ? (
        <Pressable onPress={() => root.navigate('FileAttente')}>
          <Banner tone="warning">
            File hors-ligne : {pendingOutbox} opération(s) (§6.7)
          </Banner>
        </Pressable>
      ) : null}
      <FlatList
        horizontal
        data={FILTRES}
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}
        renderItem={({ item }) => (
          <Chip
            label={item.label}
            active={filtre === item.id}
            onPress={() => setFiltre(item.id)}
            style={{ alignSelf: 'flex-start' }}
          />
        )}
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          refreshing={loading}
          onRefresh={() => void charger()}
          ListEmptyComponent={
            <View
              style={[
                ui.card,
                { alignItems: 'center', paddingVertical: 28, gap: 8 },
              ]}
            >
              <Text style={{ fontWeight: '800', color: colors.text }}>
                Aucun mouvement
              </Text>
              <Text style={[ui.muted, { textAlign: 'center' }]}>
                Changez de filtre ou initiez un versement magasin → centrale.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[
                ui.card,
                {
                  borderLeftWidth: 4,
                  borderLeftColor:
                    toneStatut(item.statut) === 'danger'
                      ? colors.danger
                      : toneStatut(item.statut) === 'warn'
                        ? colors.warning
                        : toneStatut(item.statut) === 'ok'
                          ? colors.ok
                          : colors.accent,
                },
              ]}
              onPress={() =>
                navigation.navigate('CircuitDetail', { transactionId: item.id })
              }
            >
              <View style={ui.row}>
                <Text
                  style={{ fontWeight: '800', flex: 1, color: colors.text }}
                  numberOfLines={2}
                >
                  {labelType(item.type)}
                </Text>
                <StatusPill
                  label={labelStatut(item.statut)}
                  tone={toneStatut(item.statut)}
                />
              </View>
              <Money value={formatFcfa(item.montant)} size="lg" />
              <View style={ui.row}>
                <Text style={ui.muted} numberOfLines={1}>
                  {item.caisse?.boutique?.nom ??
                    item.caisse?.libelle ??
                    item.caisseId.slice(0, 8)}
                </Text>
                <Text style={ui.muted}>
                  {new Date(item.dateHeure).toLocaleString('fr-FR')}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={{ gap: 10, paddingBottom: 110 }}
        />
      )}
    </View>
  );
}
