import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../api';
import {
  annulerInventaire,
  compterLigne,
  getInventaire,
  reporterTheorique,
  validerInventaire,
  type InventaireLigneDto,
  type InventaireSessionDto,
} from '../api/inventaires';
import {
  labelStatutInventaire,
  peutCompterInventaire,
  peutValiderInventaire,
} from '../circuit/actions';
import {
  Banner,
  ScreenHeader,
  StatusPill,
} from '../components/ScreenChrome';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';
import type { InventaireStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<
  InventaireStackParamList,
  'InventaireDetail'
>;

export function InventaireDetailScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const { user } = useSession();
  const [session, setSession] = useState<InventaireSessionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtre, setFiltre] = useState('');
  const [pending, setPending] = useState(false);
  const [saisies, setSaisies] = useState<Record<string, string>>({});

  const peutCompter = user ? peutCompterInventaire(user.role) : false;
  const peutValider = user ? peutValiderInventaire(user.role) : false;
  const ouvert = session?.statut === 'EN_COURS';

  const charger = useCallback(async () => {
    const data = await getInventaire(sessionId);
    setSession(data);
    const map: Record<string, string> = {};
    for (const l of data.lignes) {
      if (l.quantiteComptee != null) map[l.produitId] = String(l.quantiteComptee);
    }
    setSaisies(map);
  }, [sessionId]);

  useEffect(() => {
    void charger().catch((err) =>
      setError(
        err instanceof ApiError ? err.message : 'Inventaire introuvable.',
      ),
    );
  }, [charger]);

  const lignes = useMemo(() => {
    if (!session) return [];
    const q = filtre.trim().toLowerCase();
    if (!q) return session.lignes;
    return session.lignes.filter(
      (l) =>
        (l.produit?.designation ?? '').toLowerCase().includes(q) ||
        (l.produit?.reference ?? '').toLowerCase().includes(q),
    );
  }, [session, filtre]);

  const progress = useMemo(() => {
    if (!session) return { n: 0, t: 0 };
    const n = session.lignes.filter((l) => l.quantiteComptee != null).length;
    return { n, t: session.lignes.length };
  }, [session]);

  async function run(action: () => Promise<InventaireSessionDto>) {
    setPending(true);
    setError(null);
    try {
      const next = await action();
      setSession(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action refusée.');
    } finally {
      setPending(false);
    }
  }

  async function sauverLigne(ligne: InventaireLigneDto) {
    if (!ouvert || !peutCompter) return;
    const raw = saisies[ligne.produitId];
    if (raw == null || raw === '') return;
    const qte = Number(raw);
    if (!Number.isInteger(qte) || qte < 0) {
      setError('Quantité entière ≥ 0 requise.');
      return;
    }
    await run(() => compterLigne(sessionId, ligne.produitId, qte));
  }

  function confirmer(
    titre: string,
    message: string,
    action: () => void,
  ) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${titre}\n\n${message}`)) action();
      return;
    }
    Alert.alert(titre, message, [
      { text: 'Retour', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: action },
    ]);
  }

  if (!session) {
    return (
      <View style={ui.center}>
        {error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator />}
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={ui.link}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={ui.wrap}>
      <ScreenHeader
        title={session.entrepot?.nom ?? 'Inventaire'}
        subtitle={`${session.entrepot?.boutique?.nom ?? '—'} · ${progress.n}/${progress.t} comptés`}
        onBack={() => navigation.goBack()}
        backLabel="Inventaires"
        right={
          <StatusPill
            label={labelStatutInventaire(session.statut)}
            tone={
              session.statut === 'VALIDE'
                ? 'ok'
                : session.statut === 'EN_COURS'
                  ? 'warn'
                  : 'danger'
            }
          />
        }
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {ouvert && peutCompter ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            style={ui.btnGhost}
            disabled={pending}
            onPress={() => void run(() => reporterTheorique(sessionId))}
          >
            <Text style={ui.btnGhostText}>Reporter théorique</Text>
          </Pressable>
          <Pressable
            style={ui.btnGhost}
            disabled={pending}
            onPress={() =>
              confirmer(
                'Annuler l’inventaire',
                'Le comptage en cours sera définitivement abandonné.',
                () => void run(() => annulerInventaire(sessionId)),
              )
            }
          >
            <Text style={[ui.btnGhostText, { color: colors.danger }]}>
              Annuler
            </Text>
          </Pressable>
        </View>
      ) : null}

      {ouvert && peutValider ? (
        <Pressable
          style={[ui.btn, (pending || progress.n < progress.t) && ui.btnOff]}
          disabled={pending || progress.n < progress.t}
          onPress={() =>
            confirmer(
              'Valider l’inventaire',
              'Les écarts créeront des mouvements de stock append-only.',
              () => void run(() => validerInventaire(sessionId)),
            )
          }
        >
          <Text style={ui.btnText}>
            Valider l’inventaire
            {progress.n < progress.t ? ` (${progress.t - progress.n} restants)` : ''}
          </Text>
        </Pressable>
      ) : null}

      {!ouvert ? (
        <Banner tone="info">
          Inventaire clos — consultation seule.
        </Banner>
      ) : null}

      <TextInput
        style={ui.input}
        placeholder="Filtrer un produit…"
        placeholderTextColor={colors.muted}
        value={filtre}
        onChangeText={setFiltre}
      />

      <FlatList
        data={lignes}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 32 }}
        renderItem={({ item }) => {
          const theo = Number(item.quantiteTheorique);
          const compte = item.quantiteComptee;
          const saisie = saisies[item.produitId] ?? '';
          const ecart =
            compte != null && Number.isFinite(theo)
              ? Number(compte) - theo
              : null;
          return (
            <View style={ui.card}>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                {item.produit?.designation ?? item.produitId.slice(0, 8)}
              </Text>
              {item.produit?.reference ? (
                <Text style={ui.muted}>{item.produit.reference}</Text>
              ) : null}
              <View style={ui.row}>
                <Text style={ui.muted}>Théo. {theo}</Text>
                {ecart != null ? (
                  <Text
                    style={{
                      fontWeight: '700',
                      color:
                        ecart === 0
                          ? colors.ok
                          : ecart > 0
                            ? colors.accent
                            : colors.danger,
                    }}
                  >
                    Écart {ecart > 0 ? `+${ecart}` : ecart}
                  </Text>
                ) : (
                  <Text style={ui.muted}>Non compté</Text>
                )}
              </View>
              {ouvert && peutCompter ? (
                <View style={ui.row}>
                  <TextInput
                    style={[ui.input, { flex: 1, paddingVertical: 10 }]}
                    keyboardType="number-pad"
                    value={saisie}
                    onChangeText={(v) =>
                      setSaisies((prev) => ({ ...prev, [item.produitId]: v }))
                    }
                    placeholder="Qté comptée"
                    placeholderTextColor={colors.muted}
                  />
                  <Pressable
                    style={[ui.btn, { paddingHorizontal: 14 }]}
                    disabled={pending}
                    onPress={() => void sauverLigne(item)}
                  >
                    <Text style={ui.btnText}>OK</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={{ fontWeight: '700' }}>
                  Compté : {compte ?? '—'}
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
