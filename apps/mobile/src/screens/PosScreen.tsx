import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ModePaiement } from '@caisse-crm/shared';
import {
  flushOutbox,
  getOfflineStore,
  hydrateOffline,
} from '@caisse-crm/offline';
import { apiFetch, getToken } from '../api';

interface Caisse {
  id: string;
  type: string;
  boutiqueId: string | null;
  libelle?: string | null;
  actif?: boolean;
}

interface Session {
  id: string;
  caisseId: string;
  statut: string;
}

interface Produit {
  id: string;
  designation: string;
  prixUnitaire: string;
  stock?: number;
  actif?: boolean;
}

interface Temoin {
  id: string;
  login: string;
  prenom: string;
  nom: string;
}

interface Ligne {
  produitId: string;
  designation: string;
  prixUnitaire: string;
  quantite: number;
}

function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function PosScreen({ onLogout }: { onLogout: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caisse, setCaisse] = useState<Caisse | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [temoins, setTemoins] = useState<Temoin[]>([]);
  const [temoinLogin, setTemoinLogin] = useState('');
  const [temoinPassword, setTemoinPassword] = useState('');
  const [fond, setFond] = useState('0');
  const [panier, setPanier] = useState<Ligne[]>([]);
  const [pending, setPending] = useState(false);

  const total = useMemo(
    () =>
      panier.reduce((s, l) => s + Number(l.prixUnitaire) * l.quantite, 0),
    [panier],
  );

  const charger = useCallback(async () => {
    setError(null);
    const caisses = await apiFetch<Caisse[]>('/caisses');
    const tiroir =
      caisses.find((c) => c.type === 'TIROIR' && c.actif !== false) ?? null;
    setCaisse(tiroir);
    if (!tiroir) {
      setLoading(false);
      return;
    }
    const sessions = await apiFetch<Session[]>('/ventes/sessions');
    const ouverte = sessions.find(
      (s) => s.caisseId === tiroir.id && s.statut === 'OUVERTE',
    );
    setSession(ouverte ?? null);
    if (ouverte) {
      const catalog = await apiFetch<Produit[]>('/produits');
      setProduits(catalog.filter((p) => p.actif !== false));
    } else {
      const t = await apiFetch<Temoin[]>('/ventes/temoins-eligibles');
      setTemoins(t);
      if (t.length === 1) setTemoinLogin(t[0].login);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void charger().catch(() => {
      setError('Impossible de charger la caisse.');
      setLoading(false);
    });
  }, [charger]);

  useEffect(() => {
    async function sync() {
      await hydrateOffline();
      const result = await flushOutbox(getOfflineStore(), (op) =>
        apiFetch(op.path, {
          method: op.method,
          ...(op.method === 'DELETE'
            ? {}
            : { body: JSON.stringify(op.body) }),
        }),
      );
      if (result.flushed > 0) void charger();
    }
    void sync().catch(() => undefined);
  }, [charger]);

  async function ouvrir() {
    if (!caisse) return;
    setPending(true);
    setError(null);
    try {
      const created = await apiFetch<Session>('/ventes/sessions', {
        method: 'POST',
        body: JSON.stringify({
          caisseId: caisse.id,
          fondInitial: Number(fond) || 0,
          temoinLogin,
          temoinPassword,
        }),
      });
      setSession(created);
      const catalog = await apiFetch<Produit[]>('/produits');
      setProduits(catalog.filter((p) => p.actif !== false));
    } catch {
      setError('Ouverture refusée (fond ou confirmateur).');
    } finally {
      setPending(false);
    }
  }

  function ajouter(p: Produit) {
    setPanier((prev) => {
      const exist = prev.find((l) => l.produitId === p.id);
      if (exist) {
        return prev.map((l) =>
          l.produitId === p.id ? { ...l, quantite: l.quantite + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          produitId: p.id,
          designation: p.designation,
          prixUnitaire: p.prixUnitaire,
          quantite: 1,
        },
      ];
    });
  }

  async function encaisser() {
    if (!session || panier.length === 0) return;
    setPending(true);
    setError(null);
    const body = {
      lignes: panier.map((l) => ({
        produitId: l.produitId,
        quantite: l.quantite,
      })),
      modePaiement: ModePaiement.ESPECES,
      paiements: [{ modePaiement: ModePaiement.ESPECES, montant: total }],
      clientOperationId: newId(),
    };
    try {
      await apiFetch(`/ventes/sessions/${session.id}/ventes`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPanier([]);
    } catch {
      const store = getOfflineStore();
      const queue = await store.listOutbox();
      await store.replaceOutbox([
        ...queue,
        {
          id: newId(),
          path: `/ventes/sessions/${session.id}/ventes`,
          method: 'POST',
          body,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPanier([]);
      setError('Hors ligne — vente en file locale (§6.7).');
    } finally {
      setPending(false);
    }
  }

  if (!getToken()) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!caisse) {
    return (
      <View style={styles.center}>
        <Text>Aucun tiroir boutique pour ce compte.</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.link}>Déconnexion</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Ouvrir le poste</Text>
        <Text>{caisse.libelle ?? caisse.id}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={fond}
          onChangeText={setFond}
          placeholder="Fond compté"
        />
        {temoins.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, temoinLogin === t.login && styles.chipOn]}
            onPress={() => setTemoinLogin(t.login)}
          >
            <Text>
              {t.prenom} {t.nom}
            </Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Mot de passe confirmateur"
          value={temoinPassword}
          onChangeText={setTemoinPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={() => void ouvrir()} disabled={pending}>
          <Text style={styles.btnText}>Démarrer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>Caisse</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.link}>Quitter</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={produits}
        keyExtractor={(p) => p.id}
        style={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.tile} onPress={() => ajouter(item)}>
            <Text style={styles.tileName}>{item.designation}</Text>
            <Text>{Math.round(Number(item.prixUnitaire))} F</Text>
          </Pressable>
        )}
      />
      <View style={styles.ticket}>
        {panier.map((l) => (
          <Text key={l.produitId}>
            {l.quantite} × {l.designation}
          </Text>
        ))}
        <Pressable
          style={[styles.btn, panier.length === 0 && styles.btnOff]}
          disabled={panier.length === 0 || pending}
          onPress={() => void encaisser()}
        >
          <Text style={styles.btnText}>
            Encaisser espèces · {Math.round(total)} F
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, paddingTop: 48, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { flex: 1 },
  tile: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tileName: { fontWeight: '600', flex: 1, marginRight: 8 },
  ticket: { borderTopWidth: 1, borderColor: '#ddd', paddingTop: 8, gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  chip: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  chipOn: { backgroundColor: '#eee' },
  error: { color: '#b00020' },
  btn: { backgroundColor: '#111', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700' },
  link: { color: '#06c', fontWeight: '600' },
});
