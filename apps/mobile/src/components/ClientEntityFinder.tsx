import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, ApiError } from '../api';
import { colors, ui } from '../ui';
import { parseSaisieClient } from './parse-saisie-client';

export { parseSaisieClient } from './parse-saisie-client';

export interface ClientMini {
  id: string;
  nom: string;
  prenom: string | null;
  contact: string | null;
}

export function libelleClient(c: ClientMini) {
  return c.prenom ? `${c.prenom} ${c.nom}`.trim() : c.nom;
}

/**
 * Finder client POS — recherche réseau + ligne « Créer » (EntityFinder).
 * Rattachement vente toujours optionnel (§6.6).
 */
export function ClientEntityFinder({
  value,
  onChange,
  disabled,
}: {
  value: ClientMini | null;
  onChange: (c: ClientMini | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ClientMini[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terme = q.trim();
  const exactMatch = useMemo(() => {
    const n = terme.toLowerCase();
    if (!n) return false;
    return rows.some((c) => {
      const label = libelleClient(c).toLowerCase();
      const contact = (c.contact ?? '').toLowerCase();
      return label === n || contact === n.replace(/\s+/g, '');
    });
  }, [rows, terme]);

  const peutCreer = terme.length >= 2 && !exactMatch;

  useEffect(() => {
    if (value || terme.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      void apiFetch<ClientMini[]>(`/crm/clients?q=${encodeURIComponent(terme)}`)
        .then((list) => setRows(list.slice(0, 10)))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 260);
    return () => clearTimeout(t);
  }, [terme, value]);

  async function creer() {
    if (!peutCreer || creating) return;
    setCreating(true);
    setError(null);
    try {
      const body = parseSaisieClient(terme);
      const created = await apiFetch<ClientMini>('/crm/clients', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onChange(created);
      setQ('');
      setRows([]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Création client refusée.',
      );
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <View style={styles.chip}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.chipTitle}>{libelleClient(value)}</Text>
          {value.contact ? (
            <Text style={ui.muted}>{value.contact}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => onChange(null)}
          disabled={disabled}
          hitSlop={8}
        >
          <Text style={ui.link}>Retirer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Nom, prénom ou téléphone…"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={(t) => {
            setQ(t);
            setError(null);
          }}
          editable={!disabled}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {terme.length >= 2 ? (
        <View style={styles.list}>
          {peutCreer ? (
            <Pressable
              style={[styles.row, styles.createRow]}
              onPress={() => void creer()}
              disabled={creating || disabled}
            >
              <Ionicons name="add-circle" size={18} color={colors.accent} />
              <Text style={styles.createText}>
                {creating ? 'Création…' : `Créer « ${terme} »`}
              </Text>
            </Pressable>
          ) : null}
          {rows.map((c) => (
            <Pressable
              key={c.id}
              style={styles.row}
              onPress={() => {
                onChange(c);
                setQ('');
                setRows([]);
              }}
              disabled={disabled}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{libelleClient(c)}</Text>
                {c.contact ? (
                  <Text style={ui.muted}>{c.contact}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {!loading && rows.length === 0 && !peutCreer ? (
            <Text style={[ui.muted, { padding: 10 }]}>Aucune correspondance</Text>
          ) : null}
        </View>
      ) : (
        <Text style={ui.muted}>Optionnel — vente anonyme possible (§6.6)</Text>
      )}
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  chipTitle: { fontWeight: '800', color: colors.text },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hair,
  },
  createRow: { backgroundColor: colors.accentSoft },
  createText: { color: colors.accentText, fontWeight: '800', flex: 1 },
  rowTitle: { fontWeight: '700', color: colors.text },
});
