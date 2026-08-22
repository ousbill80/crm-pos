import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError } from '../api';
import {
  listInventaires,
  listPrioritesInventaire,
  ouvrirInventaire,
  type InventairePrioriteDto,
  type InventaireSessionDto,
} from '../api/inventaires';
import {
  labelStatutInventaire,
  peutCompterInventaire,
} from '../circuit/actions';
import {
  Banner,
  Chip,
  ScreenHeader,
  StatusPill,
} from '../components/ScreenChrome';
import { SessionBanner } from '../components/SessionBanner';
import type { InventaireStackParamList } from '../navigation/types';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';

function toneInv(statut: string): 'ok' | 'warn' | 'neutral' | 'danger' {
  if (statut === 'VALIDE') return 'ok';
  if (statut === 'EN_COURS') return 'warn';
  if (statut === 'ANNULE') return 'danger';
  return 'neutral';
}

export function InventaireListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<InventaireStackParamList>>();
  const { user } = useSession();
  const peutCompter = user ? peutCompterInventaire(user.role) : false;
  const [sessions, setSessions] = useState<InventaireSessionDto[]>([]);
  const [priorites, setPriorites] = useState<InventairePrioriteDto[]>([]);
  const [filtre, setFiltre] = useState<'all' | 'EN_COURS' | 'VALIDE'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const charger = useCallback(async () => {
    setError(null);
    const [list, prio] = await Promise.all([
      listInventaires(),
      listPrioritesInventaire(),
    ]);
    setSessions(list);
    setPriorites(prio.filter((p) => p.aInventorier));
    setLoading(false);
  }, []);

  useEffect(() => {
    void charger().catch((err) => {
      setError(
        err instanceof ApiError ? err.message : 'Inventaires inaccessibles.',
      );
      setLoading(false);
    });
  }, [charger]);

  const rows =
    filtre === 'all'
      ? sessions
      : sessions.filter((s) => s.statut === filtre);

  async function ouvrir(entrepotId: string) {
    if (!peutCompter || pending) return;
    setPending(true);
    setError(null);
    try {
      const created = await ouvrirInventaire(entrepotId);
      navigation.navigate('InventaireDetail', { sessionId: created.id });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Ouverture inventaire refusée.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={ui.wrap}>
      <SessionBanner />
      <ScreenHeader
        title="Inventaire"
        subtitle="Comptage physique terrain — validation séparée (§ stocks)."
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {peutCompter && priorites.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>À inventorier</Text>
          {priorites.slice(0, 4).map((p) => (
            <Pressable
              key={p.entrepotId}
              style={[ui.card, ui.row]}
              disabled={pending}
              onPress={() => void ouvrir(p.entrepotId)}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {p.nomBoutique} · {p.nom}
                </Text>
                <Text style={ui.muted}>
                  {p.joursDepuis == null
                    ? 'Jamais inventorié'
                    : `Il y a ${p.joursDepuis} j (cible ${p.frequenceCibleJours} j)`}
                </Text>
              </View>
              <Ionicons name="add-circle" size={22} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            { id: 'all', label: 'Tous' },
            { id: 'EN_COURS', label: 'En cours' },
            { id: 'VALIDE', label: 'Validés' },
          ] as const
        ).map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            active={filtre === f.id}
            onPress={() => setFiltre(f.id)}
          />
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          refreshing={loading}
          onRefresh={() => {
            setLoading(true);
            void charger();
          }}
          ListEmptyComponent={
            <Banner tone="info">Aucun inventaire sur ce filtre.</Banner>
          }
          contentContainerStyle={{ gap: 10, paddingBottom: 28 }}
          renderItem={({ item }) => {
            const comptees = item.lignes.filter(
              (l) => l.quantiteComptee != null,
            ).length;
            const total = item.lignes.length;
            return (
              <Pressable
                style={ui.card}
                onPress={() =>
                  navigation.navigate('InventaireDetail', {
                    sessionId: item.id,
                  })
                }
              >
                <View style={ui.row}>
                  <Text
                    style={{ fontWeight: '800', flex: 1, color: colors.text }}
                    numberOfLines={2}
                  >
                    {item.entrepot?.boutique?.nom ?? '—'} ·{' '}
                    {item.entrepot?.nom ?? item.entrepotId.slice(0, 8)}
                  </Text>
                  <StatusPill
                    label={labelStatutInventaire(item.statut)}
                    tone={toneInv(item.statut)}
                  />
                </View>
                <Text style={ui.muted}>
                  {comptees}/{total} lignes ·{' '}
                  {new Date(item.dateOuverture).toLocaleString('fr-FR')}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = {
  section: {
    fontWeight: '800' as const,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
};
