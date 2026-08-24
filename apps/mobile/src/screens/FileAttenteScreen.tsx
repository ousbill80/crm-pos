import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getOfflineStore, type OutboxOp } from '@caisse-crm/offline';
import { formatFcfa } from '../circuit/actions';
import { tenterFlushMobile } from '../offline/auto-sync';
import { Banner, ScreenHeader } from '../components/ScreenChrome';
import { colors, ui } from '../ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FileAttente'>;

function libelleOp(op: OutboxOp): string {
  if (op.path === '/transactions' && op.body.type === 'SORTIE_FONDS') {
    return `Versement — ${formatFcfa(op.body.montant as number)}`;
  }
  if (op.path.includes('/ventes/sessions/')) {
    const lignes = Array.isArray(op.body.lignes) ? op.body.lignes.length : 0;
    return `Vente — ${lignes} article(s)`;
  }
  return `${op.method} ${op.path}`;
}

export function FileAttenteScreen({ navigation }: Props) {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bloquees = ops.filter((op) => op.blockedAt).length;

  const charger = useCallback(async () => {
    const rows = await getOfflineStore().listOutbox();
    setOps(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  async function synchroniser() {
    setSyncing(true);
    setError(null);
    try {
      const result = await tenterFlushMobile();
      if (result == null) {
        setError('Hors ligne — nouvelle tentative automatique (§6.7).');
      }
      await charger();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={ui.wrap}>
      <ScreenHeader
        title="File hors-ligne"
        subtitle={
          bloquees > 0
            ? `${bloquees} opération(s) refusée(s) à traiter — aucun rejeu automatique.`
            : 'Opérations en attente d’envoi — sync auto à la reconnexion (§6.7).'
        }
        onBack={() => navigation.goBack()}
        backLabel="Fermer"
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Pressable
        style={[ui.btn, syncing && ui.btnOff]}
        disabled={syncing}
        onPress={() => void synchroniser()}
      >
        <Text style={ui.btnText}>
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={ops}
          keyExtractor={(op) => op.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 28 }}
          refreshing={loading}
          onRefresh={() => void charger()}
          ListEmptyComponent={
            <Banner tone="ok">File vide — tout est synchronisé.</Banner>
          }
          renderItem={({ item }) => (
            <View style={ui.card}>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                {libelleOp(item)}
              </Text>
              {item.blockedAt ? (
                <Banner tone="danger">
                  Refus serveur — opération bloquée, non rejouée
                  {item.lastError ? ` : ${item.lastError}` : '.'}
                </Banner>
              ) : null}
              <Text style={ui.muted}>
                {new Date(item.createdAt).toLocaleString('fr-FR')}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
