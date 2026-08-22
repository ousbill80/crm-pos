import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CaissesScreen } from '../screens/CaissesScreen';
import { CaisseSoldeScreen } from '../screens/CaisseSoldeScreen';
import { CircuitDetailScreen } from '../screens/CircuitDetailScreen';
import type { CaissesStackParamList } from './types';

const Stack = createNativeStackNavigator<CaissesStackParamList>();

export function CaissesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CaissesList" component={CaissesScreen} />
      <Stack.Screen name="CaisseSolde" component={CaisseSoldeScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
    </Stack.Navigator>
  );
}
