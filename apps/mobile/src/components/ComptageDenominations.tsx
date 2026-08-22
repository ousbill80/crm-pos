import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatFcfa } from '../circuit/actions';
import { colors, ui } from '../ui';

/**
 * Coupures FCFA en circulation — miroir exact de `DENOMINATIONS_FCFA`
 * (`apps/web/src/routes/PosPage.tsx:375-377`).
 */
const DENOMINATIONS_FCFA = [
  10_000, 5_000, 2_000, 1_000, 500, 250, 200, 100, 50, 25, 10, 5,
] as const;

/**
 * Comptage billets/pièces — port mobile de `ComptageDenominations`
 * (`apps/web/src/routes/PosPage.tsx:374-457`) : panneau repliable (replié
 * par défaut), une ligne par coupure avec quantité + sous-total, total
 * général en tête, "Remise à zéro"/"Masquer". `onTotalChange` est appelé à
 * chaque saisie pour que l'écran parent recopie le total dans son propre
 * champ "fond compté" — la saisie manuelle de ce champ reste possible en
 * parallèle, ce composant est additionnel, pas un remplacement.
 */
export function ComptageDenominations({
  onTotalChange,
}: {
  onTotalChange: (total: number) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [ouvert, setOuvert] = useState(false);

  const total = DENOMINATIONS_FCFA.reduce(
    (s, d) => s + d * (counts[d] ?? 0),
    0,
  );

  function maj(denom: number, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...counts, [denom]: n };
    setCounts(next);
    const sum = DENOMINATIONS_FCFA.reduce(
      (s, d) => s + d * (next[d] ?? 0),
      0,
    );
    onTotalChange(sum);
  }

  function reset() {
    setCounts({});
    onTotalChange(0);
  }

  if (!ouvert) {
    return (
      <Pressable style={ui.btnGhost} onPress={() => setOuvert(true)}>
        <Text style={ui.btnGhostText}>Comptage billets / pièces…</Text>
      </Pressable>
    );
  }

  return (
    <View style={[ui.card, { gap: 10 }]}>
      <View style={ui.row}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Coupures</Text>
        <Text style={ui.kpi}>{formatFcfa(total)}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {DENOMINATIONS_FCFA.map((d) => (
          <View key={d} style={styles.row}>
            <Text style={styles.label}>{formatFcfa(d)}</Text>
            <TextInput
              style={[ui.input, styles.qty]}
              keyboardType="numeric"
              value={counts[d] ? String(counts[d]) : ''}
              placeholder="0"
              placeholderTextColor={colors.muted}
              onChangeText={(v) => maj(d, v)}
              accessibilityLabel={`Quantité billets/pièces ${formatFcfa(d)}`}
            />
            <Text style={styles.subtotal}>
              {formatFcfa((counts[d] ?? 0) * d)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[ui.btnGhost, { flex: 1 }]} onPress={reset}>
          <Text style={ui.btnGhostText}>Remise à zéro</Text>
        </Pressable>
        <Pressable
          style={[ui.btnGhost, { flex: 1 }]}
          onPress={() => setOuvert(false)}
        >
          <Text style={ui.btnGhostText}>Masquer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontWeight: '600', color: colors.text, fontSize: 13 },
  qty: {
    width: 72,
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  subtotal: {
    width: 84,
    textAlign: 'right',
    fontWeight: '700',
    color: colors.muted,
    fontSize: 13,
  },
});
