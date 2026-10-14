import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../api';
import { getStockQuants } from '../api/stocks';
import { formatFcfa } from '../circuit/actions';
import { Banner, Chip, Money, ScreenHeader, StatusPill } from '../components/ScreenChrome';
import { SessionBanner } from '../components/SessionBanner';
import type { InventaireStackParamList, StockQuantDto } from '../navigation/types';
import { colors, ui } from '../ui';

type Props = NativeStackScreenProps<InventaireStackParamList, 'StockEntrepotDetail'>;

type Filtre = 'all' | 'rupture' | 'seuil';

function statutLigne(q: StockQuantDto): 'RUPTURE' | 'SOUS_SEUIL' | 'OK' {
  if (q.quantite <= 0) return 'RUPTURE';
  if (q.produit.seuilReappro != null && q.quantite <= q.produit.seuilReappro) {
    return 'SOUS_SEUIL';
  }
  return 'OK';
}

export function StockEntrepotDetailScreen({ navigation, route }: Props) {
  const { entrepotId, label } = route.params;
  const [lignes, setLignes] = useState<StockQuantDto[]>([]);
  const [filtre, setFiltre] = useState<Filtre>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setError(null);
    const data = await getStockQuants(entrepotId);
    setLignes(data);
    setLoading(false);
  }, [entrepotId]);

  useEffect(() => {
    void charger().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Stock entrepôt inaccessible.');
      setLoading(false);
    });
  }, [charger]);

  const ruptures = lignes.filter((l) => statutLigne(l) === 'RUPTURE').length;
  const sousSeuil = lignes.filter((l) => statutLigne(l) === 'SOUS_SEUIL').length;
  const valeurTotale = lignes.reduce(
    (acc, l) => acc + l.quantite * Number(l.produit.prixUnitaire),
    0,
  );
  const unitesTotales = lignes.reduce((acc, l) => acc + l.quantite, 0);

  const rows = lignes.filter((l) => {
    if (filtre === 'all') return true;
    const s = statutLigne(l);
    if (filtre === 'rupture') return s === 'RUPTURE';
    return s === 'SOUS_SEUIL';
  });

  const entrepotNom = lignes[0]
    ? `${lignes[0].entrepot.boutique.nom} · ${lignes[0].entrepot.nom}`
    : (label ?? 'Entrepôt');

  return (
    <View style={ui.wrap}>
      <SessionBanner />
      <ScreenHeader
        title={entrepotNom}
        subtitle="Stock détaillé par produit — lecture seule."
        onBack={() => navigation.goBack()}
        backLabel="Stocks"
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(l) => l.id}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          void charger();
        }}
        contentContainerStyle={{ gap: 10, paddingBottom: 28 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={[ui.card, { gap: 10 }]}>
                <View style={ui.row}>
                  <View style={{ gap: 2 }}>
                    <Text style={ui.muted}>Valeur stock</Text>
                    <Money value={formatFcfa(valeurTotale)} size="lg" />
                  </View>
                  <View style={{ gap: 2, alignItems: 'flex-end' }}>
                    <Text style={ui.muted}>Unités / SKU</Text>
                    <Text style={{ fontWeight: '800', color: colors.text }}>
                      {unitesTotales} · {lignes.length}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ruptures > 0 ? (
                    <StatusPill label={`${ruptures} rupture(s)`} tone="danger" />
                  ) : null}
                  {sousSeuil > 0 ? (
                    <StatusPill label={`${sousSeuil} sous seuil`} tone="warn" />
                  ) : null}
                  {ruptures === 0 && sousSeuil === 0 ? (
                    <StatusPill label="Aucune alerte" tone="ok" />
                  ) : null}
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'rupture', label: 'Ruptures' },
                  { id: 'seuil', label: 'Sous seuil' },
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
          </View>
        }
        ListEmptyComponent={
          loading ? null : <Banner tone="info">Aucune ligne de stock sur ce filtre.</Banner>
        }
        renderItem={({ item }) => {
          const statut = statutLigne(item);
          return (
            <View style={[ui.card, ui.row]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ fontWeight: '800', color: colors.text }}
                  numberOfLines={1}
                >
                  {item.produit.designation}
                </Text>
                <Text style={ui.muted}>
                  {item.quantite} unité(s)
                  {item.quantiteReservee > 0 ? ` · ${item.quantiteReservee} réservée(s)` : ''}
                  {' · '}
                  {formatFcfa(item.quantite * Number(item.produit.prixUnitaire))}
                </Text>
              </View>
              <StatusPill
                label={
                  statut === 'RUPTURE'
                    ? 'Rupture'
                    : statut === 'SOUS_SEUIL'
                      ? 'Sous seuil'
                      : 'OK'
                }
                tone={statut === 'RUPTURE' ? 'danger' : statut === 'SOUS_SEUIL' ? 'warn' : 'ok'}
              />
            </View>
          );
        }}
      />
    </View>
  );
}
