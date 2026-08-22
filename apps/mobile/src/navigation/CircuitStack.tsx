import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CircuitListScreen } from '../screens/CircuitListScreen';
import { CircuitDetailScreen } from '../screens/CircuitDetailScreen';
import { NouveauVersementScreen } from '../screens/NouveauVersementScreen';
import type { CircuitStackParamList } from './types';

const Stack = createNativeStackNavigator<CircuitStackParamList>();

export function CircuitStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CircuitList" component={CircuitListScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
      <Stack.Screen name="NouveauVersement" component={NouveauVersementScreen} />
    </Stack.Navigator>
  );
}
