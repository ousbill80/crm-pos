import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { enqueueLiberationOp, getOfflineStore } from '@caisse-crm/offline';
import { formatFcfa } from '../circuit/actions';
import { libererReservation, listerTicketsAttente } from '../api/ventes';
import { estErreurHorsLigne } from '../offline/erreurs';
import { Banner, ScreenHeader } from '../components/ScreenChrome';
import { colors, ui } from '../ui';
import {
  formatDureeAttente,
  formatNumeroAttente,
  holdsDepuisApi,
  hydrateHolds,
  labelMotif,
  montantHold,
  nbArticlesHold,
  saveHolds,
  type CommandeEnAttente,
} from '../pos-holds';
import type { PosStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<PosStackParamList, 'TicketsAttente'>;

// Fusion serveur/local, mêmes règles que apps/web/src/routes/PosPage.tsx:2078-2096
// (local prioritaire par défaut, écrasé par la valeur serveur — clé = id du hold).
function fusionner(
  local: CommandeEnAttente[],
  serveur: CommandeEnAttente[],
): CommandeEnAttente[] {
  const byId = new Map(local.map((h) => [h.id, h]));
  for (const t of serveur) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.numero - b.numero);
}

export function TicketsAttenteScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const [holds, setHolds] = useState<CommandeEnAttente[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const charger = useCallback(async () => {
    const local = await hydrateHolds(sessionId);
    setHolds([...local].sort((a, b) => a.numero - b.numero));
    setNow(Date.now());
    setLoading(false);
    try {
      const raw = await listerTicketsAttente(sessionId);
      const serveur = holdsDepuisApi(raw);
      const merged = fusionner(local, serveur);
      setHolds(merged);
      saveHolds(sessionId, merged);
    } catch {
      // Hors ligne ou erreur serveur — la file locale reste la référence.
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  // Rafraîchit la durée d'attente affichée tant que l'écran est ouvert.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function reprendre(hold: CommandeEnAttente) {
    navigation.navigate('PosHome', { resumeHoldId: hold.id });
  }

  function abandonner(hold: CommandeEnAttente) {
    async function executer() {
      const reste = holds.filter((h) => h.id !== hold.id);
      setHolds(reste);
      saveHolds(sessionId, reste);
      try {
        await libererReservation(sessionId, hold.id);
      } catch (err) {
        if (estErreurHorsLigne(err)) {
          await enqueueLiberationOp(getOfflineStore(), sessionId, hold.id);
        }
      }
    }
    const titre = `Abandonner le ticket N° ${formatNumeroAttente(hold.numero)}`;
    const message = 'Rien n’a été encaissé ; ce ticket disparaît de la file.';
    if (Platform.OS === 'web') {
      const ok =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`${titre}\n\n${message}`)
          : true;
      if (ok) void executer();
      return;
    }
    Alert.alert(titre, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Abandonner', style: 'destructive', onPress: () => void executer() },
    ]);
  }

  return (
    <View style={ui.wrap}>
      <ScreenHeader
        title="Tickets en attente"
        subtitle="Paniers parqués — aucune vente, aucun stock décrémenté tant que non repris."
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={holds}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 28 }}
          refreshing={loading}
          onRefresh={() => void charger()}
          ListEmptyComponent={
            <Banner tone="info">Aucun ticket en attente pour ce poste.</Banner>
          }
          renderItem={({ item }) => (
            <View style={ui.card}>
              <View style={ui.row}>
                <Text
                  style={{ fontWeight: '800', color: colors.text, fontSize: 16, flex: 1 }}
                  numberOfLines={1}
                >
                  N° {formatNumeroAttente(item.numero)} — {item.libelle}
                </Text>
                <Text style={{ fontWeight: '800', color: colors.accentText, fontSize: 16 }}>
                  {formatFcfa(montantHold(item.panier))}
                </Text>
              </View>
              <Text style={ui.muted}>
                {labelMotif(item.motif)} · {nbArticlesHold(item.panier)} article(s) ·
                {' '}en attente depuis {formatDureeAttente(item.createdAt, now)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <Pressable
                  style={[ui.btn, { flex: 1, paddingVertical: 11 }]}
                  onPress={() => reprendre(item)}
                >
                  <Text style={ui.btnText}>Reprendre</Text>
                </Pressable>
                <Pressable
                  style={[ui.btnGhost, { flex: 1 }]}
                  onPress={() => abandonner(item)}
                >
                  <Text style={ui.btnGhostText}>Abandonner</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
