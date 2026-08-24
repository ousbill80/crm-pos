import { type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, ui } from '../ui';

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Retour',
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={ui.link}>{backLabel}</Text>
        </Pressable>
      ) : null}
      <View style={ui.row}>
        <Text style={[ui.title, { flex: 1 }]} numberOfLines={2}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? <Text style={ui.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function IconAction({
  name,
  label,
  onPress,
  badge,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Petit badge numérique (ex. tickets en attente) — omis si absent/0. */
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[ui.iconBtn, { position: 'relative' }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Ionicons name={name} size={20} color={colors.accentText} />
      {badge != null && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Banner({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'info' | 'danger' | 'ok';
  children: ReactNode;
}) {
  const bg =
    tone === 'danger'
      ? colors.dangerSoft
      : tone === 'ok'
        ? colors.accentSoft
        : tone === 'info'
          ? colors.surfaceMuted
          : colors.warningSoft;
  const fg =
    tone === 'danger'
      ? colors.danger
      : tone === 'ok'
        ? colors.accentText
        : tone === 'info'
          ? colors.muted
          : colors.warning;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>
        {children}
      </Text>
    </View>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  const map = {
    neutral: { bg: colors.surfaceMuted, fg: colors.muted },
    ok: { bg: colors.accentSoft, fg: colors.accentText },
    warn: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: '#E0F2FE', fg: '#075985' },
  } as const;
  const t = map[tone];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[ui.chip, active && ui.chipOn, style]}
    >
      <Text style={active ? ui.chipTextOn : ui.chipText}>{label}</Text>
    </Pressable>
  );
}

export function Money({
  value,
  size = 'md',
}: {
  value: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const fontSize = size === 'lg' ? 28 : size === 'sm' ? 14 : 16;
  return (
    <Text
      style={{
        fontSize,
        fontWeight: '800',
        color: colors.text,
        fontVariant: ['tabular-nums'],
      }}
    >
      {value}
    </Text>
  );
}
