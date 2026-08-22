import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../ui';

/**
 * Fond « liquid glass » pour la barre d’onglets flottante.
 */
export function GlassTabBackground() {
  return (
    <View style={styles.shell} pointerEvents="none">
      {Platform.OS !== 'web' ? (
        <BlurView
          intensity={Platform.OS === 'ios' ? 58 : 42}
          tint="light"
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      <View style={styles.sheen} />
      <View style={styles.tint} />
      <View style={styles.rim} />
    </View>
  );
}

export const glassTabStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 22 : 14,
    height: 64,
    borderRadius: 28,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    paddingTop: 6,
    paddingBottom: 8,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.16,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 14 },
      default: {
        boxShadow: '0 14px 36px rgba(15, 23, 42, 0.16)',
      },
    }),
  },
  item: {
    paddingTop: 2,
  },
  iconWrap: {
    width: 48,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: {
    backgroundColor: 'rgba(15, 118, 110, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 118, 110, 0.28)',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  labelOn: {
    fontWeight: '800',
  },
  badge: {
    backgroundColor: colors.warning,
    fontSize: 10,
    fontWeight: '700',
    minWidth: 18,
    height: 18,
    lineHeight: 18,
    borderRadius: 9,
    overflow: 'hidden',
  },
});

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor:
      Platform.OS === 'web'
        ? 'rgba(255, 255, 255, 0.48)'
        : 'rgba(255, 255, 255, 0.32)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(185%)',
          WebkitBackdropFilter: 'blur(24px) saturate(185%)',
        } as object)
      : null),
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(204, 251, 241, 0.14)',
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.78)',
  },
});
