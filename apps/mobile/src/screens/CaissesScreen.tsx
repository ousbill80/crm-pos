import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TypeCaisse } from '@caisse-crm/shared';
import { ApiError } from '../api';
import { getSolde, listCaisses } from '../api/tresorerie';
import { formatFcfa, labelTypeCaisse } from '../circuit/actions';
import {
  Chip,
  Money,
  ScreenHeader,
  StatusPill,
} from '../components/ScreenChrome';
import { SessionBanner } from '../components/SessionBanner';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, ui } from '../ui';
import type { CaisseDto, CaissesStackParamList } from '../navigation/types';

type Filtre = 'all' | 'TIROIR' | 'MAGASIN' | 'CENTRALE';

const FILTRES: { id: Filtre; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'TIROIR', label: 'Tiroirs' },
  { id: 'MAGASIN', label: 'Magasins' },
  { id: 'CENTRALE', label: 'Centrale' },
];

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type === TypeCaisse.TIROIR || type === 'TIROIR') return 'cash-outline';
  if (type === TypeCaisse.MAGASIN || type === 'MAGASIN') return 'storefront-outline';
  return 'business-outline';
}

function toneFor(type: string): 'info' | 'ok' | 'neutral' {
  if (type === 'TIROIR') return 'info';
  if (type === 'MAGASIN') return 'ok';
  return 'neutral';
}

export function CaissesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CaissesStackParamList>>();
  const [rows, setRows] = useState<CaisseDto[]>([]);
  const [soldes, setSoldes] = useState<Record<string, string>>({});
  const [filtre, setFiltre] = useState<Filtre>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filtrées = useMemo(() => {
    const base =
      filtre === 'all' ? rows : rows.filter((c) => String(c.type) === filtre);
    return base.filter((c) => c.actif !== false);
  }, [rows, filtre]);

  const charger = useCallback(async () => {
    setError(null);
    const list = await listCaisses();
    setRows(list);
    setLoading(false);
    const actifs = list.filter((c) => c.actif !== false);
    const pairs = await Promise.all(
      actifs.map(async (c) => {
        try {
          const s = await getSolde(c.id);
          return [c.id, String(s.solde)] as const;
        } catch {
          return [c.id, '—'] as const;
        }
      }),
    );
    setSoldes(Object.fromEntries(pairs));
  }, []);

  useEffect(() => {
    void charger().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Caisses inaccessibles.');
      setLoading(false);
    });
  }, [charger]);

  return (
    <View style={ui.wrap}>
      <SessionBanner />
      <ScreenHeader
        title="Soldes"
        subtitle="Tiroirs, magasins et centrale — soldes recalculés du grand livre."
      />
      <FlatList
        horizontal
        data={FILTRES}
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <Chip
            label={item.label}
            active={filtre === item.id}
            onPress={() => setFiltre(item.id)}
          />
        )}
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={filtrées}
          keyExtractor={(c) => c.id}
          onRefresh={() => {
            setLoading(true);
            void charger();
          }}
          refreshing={loading}
          ListEmptyComponent={<Text style={ui.muted}>Aucune caisse.</Text>}
          renderItem={({ item }) => {
            const solde = soldes[item.id];
            return (
              <Pressable
                style={[ui.card, ui.row]}
                onPress={() =>
                  navigation.navigate('CaisseSolde', {
                    caisseId: item.id,
                    libelle: item.libelle ?? undefined,
                    type: String(item.type),
                  })
                }
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={iconFor(String(item.type))}
                    size={22}
                    color={colors.accent}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{ fontWeight: '800', color: colors.text }}
                    numberOfLines={2}
                  >
                    {item.libelle ?? item.id.slice(0, 8)}
                  </Text>
                  <StatusPill
                    label={labelTypeCaisse(String(item.type))}
                    tone={toneFor(String(item.type))}
                  />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {solde != null && solde !== '—' ? (
                    <Money value={formatFcfa(solde)} size="sm" />
                  ) : (
                    <Text style={ui.muted}>…</Text>
                  )}
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.muted}
                  />
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ gap: 10, paddingBottom: 110 }}
        />
      )}
    </View>
  );
}
