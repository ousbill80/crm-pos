import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { p2pApi, type PurchaseRecommendation } from '../../api/p2p';
import { Banner, ScreenHeader } from '../../components/ScreenChrome';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

export function PurchaseRecommendationsScreen({ navigation }: NativeStackScreenProps<P2pStackParamList, 'PurchaseRecommendations'>) {
  const [warehouseId, setWarehouseId] = useState('');
  const [days, setDays] = useState('30');
  const [rows, setRows] = useState<PurchaseRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      setRows(await p2pApi.recommendations(warehouseId, Number(days)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recommandations inaccessibles.');
    }
  }
  return (
    <View style={ui.wrap}>
      <ScreenHeader title="Recommandations" subtitle="Consommation réelle, stock et fenêtre paramétrée par l’API." onBack={() => navigation.goBack()} />
      <TextInput accessibilityLabel="Entrepôt" style={ui.input} value={warehouseId} onChangeText={setWarehouseId} placeholder="Entrepôt (UUID)" placeholderTextColor={colors.muted} />
      <TextInput accessibilityLabel="Fenêtre en jours" style={ui.input} keyboardType="number-pad" value={days} onChangeText={setDays} placeholder="Fenêtre en jours" placeholderTextColor={colors.muted} />
      <Pressable style={[ui.btn, !warehouseId && ui.btnOff]} disabled={!warehouseId} onPress={() => void load()}><Text style={ui.btnText}>Calculer</Text></Pressable>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.produitId}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Banner tone="info">Aucune recommandation chargée.</Banner>}
        renderItem={({ item }) => (
          <View style={ui.card}>
            <Text style={{ fontWeight: '800', color: colors.text }}>{item.designation ?? item.produitId}</Text>
            <Text style={ui.muted}>Quantité recommandée : {item.quantiteRecommandee}</Text>
          </View>
        )}
      />
    </View>
  );
}
