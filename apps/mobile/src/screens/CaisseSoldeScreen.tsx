import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, apiFetch } from '../api';
import { getSolde } from '../api/tresorerie';
import { formatFcfa, labelTypeCaisse } from '../circuit/actions';
import {
  Money,
  ScreenHeader,
  StatusPill,
} from '../components/ScreenChrome';
import { colors, ui } from '../ui';
import type { CaissesStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<CaissesStackParamList, 'CaisseSolde'>;

interface Mouvement {
  id: string;
  libelle: string;
  sens: 'CREDIT' | 'DEBIT';
  montant: string;
  soldeApres: string;
  dateHeure: string;
  statut: string;
}

export function CaisseSoldeScreen({ navigation, route }: Props) {
  const { caisseId, libelle, type } = route.params;
  const [solde, setSolde] = useState<string | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      getSolde(caisseId),
      apiFetch<Mouvement[]>(`/caisses/${caisseId}/mouvements`),
    ])
      .then(([s, mvt]) => {
        setSolde(String(s.solde));
        setMouvements(mvt.slice(0, 30));
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Solde inaccessible.'),
      )
      .finally(() => setLoading(false));
  }, [caisseId]);

  return (
    <View style={ui.wrap}>
      <ScreenHeader
        title={libelle ?? 'Caisse'}
        subtitle="Solde recalculé depuis le journal immuable des écritures."
        onBack={() => navigation.goBack()}
        backLabel="Caisses"
        right={
          type ? (
            <StatusPill label={labelTypeCaisse(type)} tone="info" />
          ) : null
        }
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          {solde != null ? (
            <View
              style={[
                ui.card,
                { alignItems: 'center', gap: 10, paddingVertical: 24 },
              ]}
            >
              <View
                style={{
                  backgroundColor: colors.accentSoft,
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <Ionicons name="cash-outline" size={28} color={colors.accent} />
              </View>
              <Text style={ui.muted}>Solde actuel</Text>
              <Money value={formatFcfa(solde)} size="lg" />
              <Text style={[ui.muted, { textAlign: 'center' }]}>
                Jamais un champ stocké — lecture du grand livre uniquement.
              </Text>
            </View>
          ) : null}

          <Text style={styles.section}>
            Derniers mouvements validés ({mouvements.length})
          </Text>
          {mouvements.length === 0 ? (
            <Text style={ui.muted}>Aucune écriture validée sur cette caisse.</Text>
          ) : (
            <FlatList
              data={mouvements}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ gap: 8, paddingBottom: 28 }}
              renderItem={({ item }) => (
                <Pressable
                  style={ui.card}
                  onPress={() =>
                    navigation.navigate('CircuitDetail', {
                      transactionId: item.id,
                    })
                  }
                >
                  <View style={ui.row}>
                    <Text
                      style={{ fontWeight: '700', flex: 1, color: colors.text }}
                      numberOfLines={2}
                    >
                      {item.libelle}
                    </Text>
                    <Text
                      style={{
                        fontWeight: '800',
                        color:
                          item.sens === 'CREDIT' ? colors.ok : colors.danger,
                      }}
                    >
                      {item.sens === 'CREDIT' ? '+' : '−'}
                      {formatFcfa(item.montant)}
                    </Text>
                  </View>
                  <View style={ui.row}>
                    <Text style={ui.muted}>
                      {new Date(item.dateHeure).toLocaleString('fr-FR')}
                    </Text>
                    <Text style={ui.muted}>
                      Solde {formatFcfa(item.soldeApres)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </>
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
