import { Text, TextInput, View } from 'react-native';
import { Banner, Chip } from './ScreenChrome';
import { colors, ui } from '../ui';

export type MotifDerogation = 'REMISE_PLAFOND' | 'STOCK_INSUFFISANT';

export interface DerogationState {
  motifs: MotifDerogation[];
  login: string;
  password: string;
}

const LIBELLE_MOTIF: Record<MotifDerogation, string> = {
  REMISE_PLAFOND: 'Remise au-dessus du plafond 20 %',
  STOCK_INSUFFISANT: 'Stock insuffisant',
};

/**
 * Panneau de dérogation chef de caisse (§1 séparation des tâches) — miroir
 * du web (`PosPage.tsx:1869-1946`) : le Responsable boutique saisit lui-même
 * son mot de passe, jamais le caissier. Validation finale toujours
 * server-side (`resoudreChefCaisse`).
 */
export function DerogationPanel({
  derogation,
  chefs,
  onChange,
}: {
  derogation: DerogationState;
  chefs: Array<{ id: string; login: string; prenom: string; nom: string }>;
  onChange: (next: DerogationState) => void;
}) {
  return (
    <View style={[ui.card, { gap: 10 }]}>
      <Text style={{ fontWeight: '800', color: colors.text }}>
        Dérogation chef de caisse
      </Text>
      <Banner tone="warning">
        {derogation.motifs.map((m) => LIBELLE_MOTIF[m]).join(' · ')} — le
        Responsable boutique saisit son mot de passe (pas vous).
      </Banner>
      {chefs.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {chefs.map((c) => (
            <Chip
              key={c.id}
              label={`${c.prenom} ${c.nom}`}
              active={derogation.login === c.login}
              onPress={() =>
                onChange({ ...derogation, login: c.login, password: '' })
              }
            />
          ))}
        </View>
      ) : (
        <TextInput
          style={ui.input}
          placeholder="Login responsable"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          value={derogation.login}
          onChangeText={(v) => onChange({ ...derogation, login: v })}
        />
      )}
      {derogation.login ? (
        <TextInput
          style={ui.input}
          secureTextEntry
          placeholder="Mot de passe responsable"
          placeholderTextColor={colors.muted}
          value={derogation.password}
          onChangeText={(v) => onChange({ ...derogation, password: v })}
        />
      ) : null}
    </View>
  );
}
