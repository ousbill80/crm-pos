import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COMPTES_DEMO,
  LISTE_COMPTES_DEMO,
  comptesDemoParFamille,
  labelProfil,
} from '@caisse-crm/shared';
import { apiFetch } from '../api';
import { useSession } from '../session-context';
import { decodeAccessToken } from '../session';
import { estErreurHorsLigne } from '../offline/erreurs';
import {
  cacherIdentifiants,
  verifierIdentifiantsLocal,
} from '../offline/local-auth';
import { colors } from '../ui';

const DEMO_PASSWORD = 'MotDePasse!123';

/** Mapping boutique seed (démo locale) — le JWT porte l’id réel après login. */
const HINT_BOUTIQUE: Partial<Record<string, string>> = {
  'demo-pos-caissier': 'Boutique Extérieur',
  'demo-pos-temoin': 'Boutique Extérieur',
  'demo-convoyeur': 'Boutique Extérieur',
  'demo-caissier-gsm': 'Boutique GSM',
  'demo-resp-gsm': 'Boutique GSM',
  'demo-caissier-cafe': 'Café-Market',
  'demo-resp-cafe': 'Café-Market',
  'demo-superviseur': 'Zone (boutique Ext.)',
  'demo-dg': 'Réseau entier',
  'demo-daf': 'Réseau entier',
  'demo-central': 'Réseau entier',
  'demo-controle': 'Réseau entier',
  'demo-respsi': 'Système (hors trésorerie)',
  'demo-crm': 'CRM (hors trésorerie)',
};

export function LoginScreen() {
  const { signIn } = useSession();
  const [login, setLogin] = useState(COMPTES_DEMO.CAISSIER_BOUTIQUE.login);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [infoHorsLigne, setInfoHorsLigne] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const familles = useMemo(() => comptesDemoParFamille(), []);

  async function tenterConnexionHorsLigne(id: string): Promise<boolean> {
    const resultat = await verifierIdentifiantsLocal(id, password);
    if (resultat.ok && resultat.accessToken !== undefined) {
      setInfoHorsLigne(
        'Connexion hors ligne — identité vérifiée localement, synchronisation en attente.',
      );
      // Bref délai pour laisser le message hors ligne visible avant la
      // navigation automatique déclenchée par signIn (§6.7).
      await new Promise((resolve) => setTimeout(resolve, 900));
      await signIn(resultat.accessToken, resultat.mustChangePassword ?? false);
      return true;
    }
    if (resultat.verrouille) {
      const minutes = resultat.verrouJusqua
        ? Math.max(1, Math.ceil((resultat.verrouJusqua - Date.now()) / 60_000))
        : 15;
      setError(
        `Trop d’échecs hors ligne : réessayez dans ${minutes} min ou reconnectez le réseau.`,
      );
      return true;
    }
    if (resultat.perime) {
      setError(
        'Session hors ligne expirée (24h sans connexion) : une reconnexion réseau est nécessaire.',
      );
      return true;
    }
    return false;
  }

  async function submit(loginOverride?: string) {
    const id = loginOverride ?? login;
    setLogin(id);
    setError(null);
    setInfoHorsLigne(null);
    setPending(true);
    try {
      const { accessToken, mustChangePassword } = await apiFetch<{
        accessToken: string;
        mustChangePassword: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: id, password }),
      });
      const decoded = decodeAccessToken(accessToken);
      if (decoded) {
        await cacherIdentifiants(id, password, {
          role: decoded.role,
          accessToken,
          mustChangePassword,
        });
      }
      await signIn(accessToken, mustChangePassword);
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        const traite = await tenterConnexionHorsLigne(id);
        if (!traite) {
          setError(
            'API injoignable et identifiant jamais connecté en ligne sur cet appareil.',
          );
        }
      } else {
        setError('Identifiants invalides.');
      }
    } finally {
      setPending(false);
    }
  }

  const actif = LISTE_COMPTES_DEMO.find((c) => c.login === login);

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.glowTop} />
      <View style={styles.hero}>
        <View style={styles.logoDisc}>
          <Ionicons name="storefront" size={28} color={colors.accent} />
        </View>
        <Text style={styles.brand}>CAISSEPOS</Text>
        <Text style={styles.headline}>Connexion</Text>
        <Text style={styles.lead}>
          Choisissez un profil (§4) — la boutique / le réseau suivent le compte.
        </Text>
      </View>

      <View style={styles.panel}>
        {familles.map((f) => (
          <View key={f.famille} style={{ gap: 8 }}>
            <Text style={styles.family}>{f.libelle}</Text>
            <View style={styles.chips}>
              {f.comptes.map((c) => {
                const on = login === c.login;
                return (
                  <Pressable
                    key={c.login}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setLogin(c.login)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {c.libelleCourt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {actif ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>{labelProfil(actif.role)}</Text>
            <Text style={styles.hintBody}>{actif.hint}</Text>
            <Text style={styles.hintBody}>
              {HINT_BOUTIQUE[actif.login] ?? 'Périmètre selon fiche utilisateur'}
            </Text>
            <Text style={styles.hintLogin}>{actif.login}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.field}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Identifiant"
          placeholderTextColor="#94A3B8"
          value={login}
          onChangeText={setLogin}
        />
        <TextInput
          style={styles.field}
          secureTextEntry
          placeholder="Mot de passe"
          placeholderTextColor="#94A3B8"
          value={password}
          onChangeText={setPassword}
        />
        {infoHorsLigne ? (
          <Text style={styles.infoHorsLigne}>{infoHorsLigne}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={styles.primaryBtn}
          onPress={() => void submit()}
          disabled={pending}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Se connecter</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: '#ECF4F2',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 36,
    gap: 18,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 200,
    backgroundColor: 'rgba(15, 118, 110, 0.14)',
  },
  hero: { alignItems: 'center', gap: 6 },
  logoDisc: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginBottom: 4,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '800',
    color: colors.accent,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#DCE6E2',
  },
  family: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAF9',
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  chipTextOn: { color: colors.accentText },
  hintBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  hintTitle: { fontWeight: '800', color: colors.accentText },
  hintBody: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  hintLogin: { fontSize: 12, fontWeight: '700', color: colors.accent, marginTop: 4 },
  field: {
    borderWidth: 1.5,
    borderColor: '#C5D4CF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#F8FAF9',
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: 10,
    borderRadius: 10,
    fontWeight: '600',
    fontSize: 13,
  },
  infoHorsLigne: {
    color: colors.accentText,
    backgroundColor: colors.accentSoft,
    padding: 10,
    borderRadius: 10,
    fontWeight: '600',
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
