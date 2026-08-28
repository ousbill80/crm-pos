import { ScrollView, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { canP2p } from '../../p2p/permissions';
import { useSession } from '../../session-context';
import { ScreenHeader, Banner } from '../../components/ScreenChrome';
import { SessionBanner } from '../../components/SessionBanner';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<P2pStackParamList, 'P2pHub'>;

export function P2pHubScreen({ navigation }: Props) {
  const { user } = useSession();
  if (!user) return null;
  const items = [
    { title: 'Demandes & recommandations', detail: 'Créer, soumettre et décider selon le rôle', icon: 'clipboard-outline' as const, route: 'PurchaseRequests' as const, show: canP2p(user.role, 'READ') },
    { title: 'Commandes & import', detail: 'Jalons production, transport et douane', icon: 'boat-outline' as const, route: 'PurchaseOrders' as const, show: canP2p(user.role, 'READ') },
    { title: 'Réceptions terrain', detail: 'Scan, quarantaine, qualité, mise en stock et retours', icon: 'scan-outline' as const, route: 'PurchaseReceipts' as const, show: canP2p(user.role, 'READ') },
    { title: 'Factures & rapprochement', detail: 'Extraction, match, litiges et exceptions', icon: 'document-text-outline' as const, route: 'SupplierInvoices' as const, show: canP2p(user.role, 'READ') },
    { title: 'Comptabilité & paiements', detail: 'Balance, grand livre, balance âgée et décisions', icon: 'calculator-outline' as const, route: 'P2pAccounting' as const, show: canP2p(user.role, 'ACCOUNTING') || canP2p(user.role, 'PAYMENT_APPROVE') || canP2p(user.role, 'PAYMENT_EXCEPTION') || canP2p(user.role, 'PAYMENT_EXECUTE') || canP2p(user.role, 'AI_AUDIT') },
    { title: 'Contrôle comptable IA', detail: 'Suggestions, politiques et anomalies auditables', icon: 'sparkles-outline' as const, route: 'AccountingAi' as const, show: canP2p(user.role, 'AI_AUDIT') },
  ].filter((item) => item.show);

  return (
    <ScrollView contentContainerStyle={ui.wrap}>
      <SessionBanner />
      <ScreenHeader title="Procure-to-pay" subtitle="Cycle réel API, habilitations serveur et séparation des tâches." />
      <Banner tone="info">
        Les décisions financières et IA exigent réseau, confirmation et ré-authentification. Elles ne passent jamais par la file hors ligne.
      </Banner>
      {items.map((item) => (
        <Pressable
          key={item.route}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={[ui.card, ui.row]}
          onPress={() => navigation.navigate(item.route)}
        >
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={item.icon} size={23} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{item.title}</Text>
            <Text style={ui.muted}>{item.detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
