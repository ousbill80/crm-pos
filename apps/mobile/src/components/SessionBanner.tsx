import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  labelPerimetre,
  labelProfil,
  profilOf,
} from '@caisse-crm/shared';
import { apiFetch } from '../api';
import { useSession } from '../session-context';
import { colors } from '../ui';

function initials(prenom?: string | null, nom?: string | null, login?: string) {
  if (prenom && nom) return `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase();
  if (prenom) return prenom.slice(0, 2).toUpperCase();
  if (login) {
    const parts = login.replace(/^demo-/, '').split(/[-_]/);
    return parts
      .slice(0, 2)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase() || '?';
  }
  return '?';
}

/**
 * Bandeau session : magasin + identité.
 * Déconnexion volontairement hors du bandeau (menu profil).
 */
export function SessionBanner({
  caisseLibelle,
  compact = false,
}: {
  /** Libellé du poste ouvert (ex. « Tiroir 1 ») — POS uniquement. */
  caisseLibelle?: string | null;
  compact?: boolean;
}) {
  const { user, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [boutiqueNom, setBoutiqueNom] = useState<string | null>(null);
  const [prenom, setPrenom] = useState<string | null>(user?.prenom ?? null);
  const [nom, setNom] = useState<string | null>(user?.nom ?? null);

  useEffect(() => {
    if (!user?.boutiqueId) {
      setBoutiqueNom(null);
      return;
    }
    let cancelled = false;
    void apiFetch<{ id: string; nom: string }>(`/boutiques/${user.boutiqueId}`)
      .then((b) => {
        if (!cancelled) setBoutiqueNom(b.nom);
      })
      .catch(() => {
        if (!cancelled) setBoutiqueNom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.boutiqueId]);

  useEffect(() => {
    if (!user?.userId || (user.prenom && user.nom)) return;
    let cancelled = false;
    void apiFetch<
      Array<{ id: string; prenom: string; nom: string; login: string }>
    >('/ventes/temoins-eligibles')
      .then((rows) => {
        const me = rows.find(
          (r) => r.id === user.userId || r.login === user.login,
        );
        if (!cancelled && me) {
          setPrenom(me.prenom);
          setNom(me.nom);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.userId, user?.login, user?.prenom, user?.nom]);

  if (!user) return null;

  const profil = profilOf(user.role);
  const displayName =
    prenom && nom
      ? `${prenom} ${nom}`
      : prenom || nom || user.login;

  const magasinLabel = user.boutiqueId
    ? boutiqueNom
      ? boutiqueNom
      : '…'
    : labelPerimetre(profil.perimetre);

  function confirmerDeconnexion() {
    setMenuOpen(false);
    const message =
      'Vous allez quitter la session. Les ventes hors-ligne restent en file locale.';
    if (Platform.OS === 'web') {
      const ok =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`Déconnexion\n\n${message}`)
          : true;
      if (ok) void signOut();
      return;
    }
    Alert.alert('Déconnexion', message, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  }

  return (
    <>
      <View style={[styles.wrap, compact && styles.wrapCompact]}>
        <View style={styles.placeBlock}>
          <Text style={styles.placeEyebrow}>
            {user.boutiqueId ? 'Magasin' : 'Périmètre'}
          </Text>
          <Text style={styles.placeName} numberOfLines={1}>
            {magasinLabel}
            {caisseLibelle ? ` · ${caisseLibelle}` : ''}
          </Text>
        </View>

        <Pressable
          style={styles.profileHit}
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Menu compte"
          accessibilityHint="Ouvre le profil et la déconnexion"
          hitSlop={6}
        >
          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {labelProfil(user.role)}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {initials(prenom, nom, user.login)}
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={14}
            color={colors.muted}
            style={styles.chevron}
          />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Fermer le menu"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={[styles.avatar, styles.avatarLg]}>
                <Text style={[styles.avatarText, styles.avatarTextLg]}>
                  {initials(prenom, nom, user.login)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sheetName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.sheetRole} numberOfLines={1}>
                  {labelProfil(user.role)}
                </Text>
                <Text style={styles.sheetLogin} numberOfLines={1}>
                  @{user.login}
                </Text>
              </View>
            </View>

            <View style={styles.sheetMeta}>
              <Text style={styles.sheetMetaLabel}>
                {user.boutiqueId ? 'Magasin' : 'Périmètre'}
              </Text>
              <Text style={styles.sheetMetaValue} numberOfLines={2}>
                {magasinLabel}
                {caisseLibelle ? `\nPoste · ${caisseLibelle}` : ''}
              </Text>
            </View>

            <Pressable
              style={styles.logoutRow}
              onPress={confirmerDeconnexion}
              accessibilityRole="button"
              accessibilityLabel="Se déconnecter"
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color={colors.danger}
              />
              <Text style={styles.logoutLabel}>Se déconnecter</Text>
            </Pressable>

            <Pressable
              style={styles.cancelRow}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.cancelLabel}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wrapCompact: {
    paddingVertical: 10,
  },
  placeBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  placeEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.tabInactive,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  profileHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '48%',
  },
  profileText: {
    alignItems: 'flex-end',
    minWidth: 0,
    flexShrink: 1,
  },
  name: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 13,
  },
  role: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLg: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  avatarText: {
    fontWeight: '800',
    color: colors.accentText,
    fontSize: 13,
  },
  avatarTextLg: {
    fontSize: 16,
  },
  chevron: {
    marginLeft: -2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 72 : 56,
    paddingHorizontal: 16,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.hair,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 12 },
      default: {
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
      },
    }),
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  sheetRole: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentText,
    marginTop: 2,
  },
  sheetLogin: {
    fontSize: 12,
    color: colors.tabInactive,
    marginTop: 2,
  },
  sheetMeta: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  sheetMetaLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.tabInactive,
  },
  sheetMetaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutLabel: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 15,
  },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelLabel: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 14,
  },
});
