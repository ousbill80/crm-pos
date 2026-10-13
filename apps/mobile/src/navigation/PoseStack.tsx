import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrdrePoseScanScreen } from '../screens/OrdrePoseScanScreen';
import type { PoseStackParamList } from './types';

const Stack = createNativeStackNavigator<PoseStackParamList>();

export function PoseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PoseScan" component={OrdrePoseScanScreen} />
    </Stack.Navigator>
  );
}
