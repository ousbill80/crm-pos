import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventaireListScreen } from '../screens/InventaireListScreen';
import { InventaireDetailScreen } from '../screens/InventaireDetailScreen';
import { StockEntrepotDetailScreen } from '../screens/StockEntrepotDetailScreen';
import type { InventaireStackParamList } from './types';

const Stack = createNativeStackNavigator<InventaireStackParamList>();

export function InventaireStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InventaireList" component={InventaireListScreen} />
      <Stack.Screen name="InventaireDetail" component={InventaireDetailScreen} />
      <Stack.Screen name="StockEntrepotDetail" component={StockEntrepotDetailScreen} />
    </Stack.Navigator>
  );
}
