import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

export function useRootNavigation() {
  const navigation = useNavigation();
  const parent =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return parent ?? (navigation as unknown as NativeStackNavigationProp<RootStackParamList>);
}
