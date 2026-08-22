import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PosScreen } from '../screens/PosScreen';
import { EtatSessionScreen } from '../screens/EtatSessionScreen';
import { TicketsAttenteScreen } from '../screens/TicketsAttenteScreen';
import type { PosStackParamList } from './types';

const Stack = createNativeStackNavigator<PosStackParamList>();

export function PosStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PosHome" component={PosScreen} />
      <Stack.Screen name="EtatSession" component={EtatSessionScreen} />
      <Stack.Screen name="TicketsAttente" component={TicketsAttenteScreen} />
    </Stack.Navigator>
  );
}
