import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  p2pApi,
  type PurchaseOrder,
  type PurchaseReceipt,
  type PurchaseRequest,
  type SupplierInvoice,
} from '../../api/p2p';
import { ApiError } from '../../api';
import { canP2p } from '../../p2p/permissions';
import { useSession } from '../../session-context';
import { Banner, ScreenHeader, StatusPill } from '../../components/ScreenChrome';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

type Entity = PurchaseRequest | PurchaseOrder | PurchaseReceipt | SupplierInvoice;
type ListRoute = 'PurchaseRequests' | 'PurchaseOrders' | 'PurchaseReceipts' | 'SupplierInvoices';

const CONFIG: Record<ListRoute, {
  title: string;
  subtitle: string;
  load: () => Promise<Entity[]>;
  detail: 'PurchaseRequestDetail' | 'PurchaseOrderDetail' | 'PurchaseReceiptDetail' | 'SupplierInvoiceDetail';
}> = {
  PurchaseRequests: { title: 'Demandes d’achat', subtitle: 'Besoins, recommandations et circuit d’approbation.', load: p2pApi.listRequests, detail: 'PurchaseRequestDetail' },
  PurchaseOrders: { title: 'Commandes & import', subtitle: 'Suivi des commandes, production, expédition et douane.', load: p2pApi.listOrders, detail: 'PurchaseOrderDetail' },
  PurchaseReceipts: { title: 'Réceptions terrain', subtitle: 'Quantitatif, quarantaine, contrôle qualité et putaway.', load: p2pApi.listReceipts, detail: 'PurchaseReceiptDetail' },
  SupplierInvoices: { title: 'Factures fournisseur', subtitle: 'Rapprochement, extraction, litiges et comptabilisation.', load: p2pApi.listInvoices, detail: 'SupplierInvoiceDetail' },
};

export function P2pListsScreen({ navigation, route }: NativeStackScreenProps<P2pStackParamList, ListRoute>) {
  const config = CONFIG[route.name];
  const { user } = useSession();
  const [rows, setRows] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await config.load());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Données P2P inaccessibles.');
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => void load(), [load]);

  const canCreateRequest = route.name === 'PurchaseRequests' && !!user && canP2p(user.role, 'REQUEST_WRITE');
  const canCreateReceipt = route.name === 'PurchaseReceipts' && !!user && canP2p(user.role, 'RECEIPT');

  function openDetail(item: Entity) {
    if (config.detail === 'PurchaseRequestDetail') {
      navigation.navigate('PurchaseRequestDetail', { id: item.id });
    } else if (config.detail === 'PurchaseOrderDetail') {
      navigation.navigate('PurchaseOrderDetail', { id: item.id });
    } else if (config.detail === 'PurchaseReceiptDetail') {
      navigation.navigate('PurchaseReceiptDetail', { id: item.id });
    } else {
      navigation.navigate('SupplierInvoiceDetail', { id: item.id });
    }
  }

  return (
    <View style={ui.wrap}>
      <ScreenHeader title={config.title} subtitle={config.subtitle} onBack={() => navigation.goBack()} backLabel="P2P" />
      {canCreateRequest ? (
        <Pressable style={ui.btn} onPress={() => navigation.navigate('PurchaseRequestCreate')}>
          <Text style={ui.btnText}>Nouvelle demande</Text>
        </Pressable>
      ) : null}
      {route.name === 'PurchaseRequests' ? (
        <Pressable style={ui.btnGhost} onPress={() => navigation.navigate('PurchaseRecommendations')}>
          <Text style={ui.btnGhostText}>Voir les recommandations</Text>
        </Pressable>
      ) : null}
      {canCreateReceipt ? (
        <Pressable style={ui.btn} onPress={() => navigation.navigate('PurchaseReceiptCreate')}>
          <Text style={ui.btnText}>Nouvelle réception terrain</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} /> : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          contentContainerStyle={{ gap: 10, paddingBottom: 32 }}
          ListEmptyComponent={<Banner tone="info">Aucune donnée disponible dans votre périmètre.</Banner>}
          renderItem={({ item }) => (
            <Pressable
              style={ui.card}
              accessibilityRole="button"
              onPress={() => openDetail(item)}
            >
              <View style={ui.row}>
                <Text style={{ flex: 1, fontWeight: '800', color: colors.text }} numberOfLines={2}>
                  {rowTitle(item)}
                </Text>
                <StatusPill label={item.statut} tone={item.statut.includes('REJET') || item.statut.includes('LITIGE') ? 'danger' : item.statut.includes('APPROUV') || item.statut.includes('STOCK') || item.statut === 'PAYEE' ? 'ok' : 'warn'} />
              </View>
              {supplierName(item) ? <Text style={ui.muted}>{supplierName(item)}</Text> : null}
              {'totalTtc' in item && item.totalTtc != null ? <Text style={ui.muted}>Total : {String(item.totalTtc)} XOF</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function rowTitle(item: Entity): string {
  if (typeof item.objet === 'string') return item.objet;
  if (typeof item.referenceFournisseur === 'string') return item.referenceFournisseur;
  if (typeof item.numero === 'string') return item.numero;
  return item.id;
}

function supplierName(item: Entity): string | null {
  const value = item.fournisseur;
  if (!value || typeof value !== 'object' || !('nom' in value)) return null;
  return typeof value.nom === 'string' ? value.nom : null;
}
