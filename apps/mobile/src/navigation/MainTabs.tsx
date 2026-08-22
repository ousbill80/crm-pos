import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { accueilOnglet, ongletsMobile, peutEncaisserPos } from '../circuit/actions';
import { useOutboxPending } from '../offline/use-outbox-pending';
import { useSession } from '../session-context';
import { colors } from '../ui';
import { CaissesStack } from './CaissesStack';
import { CircuitStack } from './CircuitStack';
import { GlassTabBackground, glassTabStyles } from './GlassTabBar';
import { InventaireStack } from './InventaireStack';
import { PosStack } from './PosStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_META: Record<
  keyof MainTabParamList,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconOn: keyof typeof Ionicons.glyphMap;
  }
> = {
  Caisse: {
    label: 'Vente',
    icon: 'storefront-outline',
    iconOn: 'storefront',
  },
  Circuit: {
    label: 'Circuit',
    icon: 'git-branch-outline',
    iconOn: 'git-branch',
  },
  Caisses: {
    label: 'Soldes',
    icon: 'wallet-outline',
    iconOn: 'wallet',
  },
  Inventaire: {
    label: 'Stocks',
    icon: 'cube-outline',
    iconOn: 'cube',
  },
};

function TabIcon({
  route,
  focused,
  color,
}: {
  route: keyof MainTabParamList;
  focused: boolean;
  color: string;
}) {
  const meta = TAB_META[route];
  return (
    <View style={[glassTabStyles.iconWrap, focused && glassTabStyles.iconWrapOn]}>
      <Ionicons
        name={focused ? meta.iconOn : meta.icon}
        size={focused ? 22 : 20}
        color={color}
      />
    </View>
  );
}

export function MainTabs() {
  const { user } = useSession();
  const pending = useOutboxPending();
  const role = user?.role;
  const tabs = role ? ongletsMobile(role) : [];
  const initial = role ? accueilOnglet(role) : 'Circuit';
  const showPos = role ? peutEncaisserPos(role) : false;

  const start =
    initial === 'Caisse' && showPos && tabs.includes('Caisse')
      ? 'Caisse'
      : tabs.includes('Circuit')
        ? 'Circuit'
        : tabs[0];

  return (
    <Tab.Navigator
      initialRouteName={start}
      screenOptions={({ route }) => {
        const meta = TAB_META[route.name as keyof MainTabParamList];
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarHideOnKeyboard: true,
          tabBarStyle: glassTabStyles.bar,
          tabBarItemStyle: glassTabStyles.item,
          tabBarBackground: () => <GlassTabBackground />,
          tabBarLabel: ({ focused, color }) => (
            <Text
              style={[
                glassTabStyles.label,
                { color },
                focused && glassTabStyles.labelOn,
              ]}
            >
              {meta.label}
            </Text>
          ),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              route={route.name as keyof MainTabParamList}
              focused={focused}
              color={color}
            />
          ),
        };
      }}
    >
      {tabs.includes('Caisse') ? (
        <Tab.Screen
          name="Caisse"
          component={PosStack}
          options={{
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarBadgeStyle: glassTabStyles.badge,
          }}
        />
      ) : null}
      {tabs.includes('Circuit') ? (
        <Tab.Screen
          name="Circuit"
          component={CircuitStack}
          options={{
            tabBarBadge: !showPos && pending > 0 ? pending : undefined,
            tabBarBadgeStyle: glassTabStyles.badge,
          }}
        />
      ) : null}
      {tabs.includes('Caisses') ? (
        <Tab.Screen name="Caisses" component={CaissesStack} />
      ) : null}
      {tabs.includes('Inventaire') ? (
        <Tab.Screen name="Inventaire" component={InventaireStack} />
      ) : null}
    </Tab.Navigator>
  );
}
