import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

/**
 * Pavé numérique tactile pour la saisie du montant reçu en espèces — port
 * mobile de `NumpadEspeces` (`apps/web/src/routes/PosPage.tsx:1507-1537`).
 * Même sémantique exacte : 'C' vide, '⌫' efface un caractère, un chiffre
 * remplace un '0' isolé ou s'y ajoute. Additionnel au `TextInput`/clavier
 * physique existant (saisie tactile/gants), jamais un remplacement.
 */
export function NumpadEspeces({
  recu,
  onChange,
}: {
  recu: string;
  onChange: (v: string) => void;
}) {
  function tap(digit: string) {
    if (digit === 'C') {
      onChange('');
      return;
    }
    if (digit === '⌫') {
      onChange(recu.slice(0, -1));
      return;
    }
    onChange(recu === '0' ? digit : recu + digit);
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  return (
    <View
      style={styles.grid}
      accessibilityRole="none"
      accessibilityLabel="Pavé numérique espèces"
    >
      {touches.map((t) => (
        <Pressable
          key={t}
          style={styles.key}
          onPress={() => tap(t)}
          accessibilityLabel={
            t === 'C' ? 'Effacer' : t === '⌫' ? 'Retour arrière' : `Chiffre ${t}`
          }
        >
          <Text style={styles.keyText}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  key: {
    width: '31%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
});
