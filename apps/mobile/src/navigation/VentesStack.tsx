import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VentesDashboardScreen } from '../screens/VentesDashboardScreen';
import type { VentesStackParamList } from './types';

const Stack = createNativeStackNavigator<VentesStackParamList>();

export function VentesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VentesDashboard" component={VentesDashboardScreen} />
    </Stack.Navigator>
  );
}
