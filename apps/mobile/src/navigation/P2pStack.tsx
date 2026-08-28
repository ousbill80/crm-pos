import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { P2pHubScreen } from '../screens/p2p/P2pHubScreen';
import { P2pListsScreen } from '../screens/p2p/P2pListsScreen';
import { PurchaseRequestCreateScreen } from '../screens/p2p/PurchaseRequestCreateScreen';
import { PurchaseRecommendationsScreen } from '../screens/p2p/PurchaseRecommendationsScreen';
import { P2pDetailScreen } from '../screens/p2p/P2pDetailScreen';
import { PurchaseReceiptCreateScreen } from '../screens/p2p/PurchaseReceiptCreateScreen';
import {
  AccountingAiScreen,
  OrderImportScreen,
  P2pAccountingScreen,
  SupplierReturnCreateScreen,
} from '../screens/p2p/P2pOperationsScreen';
import type { P2pStackParamList } from './types';

const Stack = createNativeStackNavigator<P2pStackParamList>();

export function P2pStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="P2pHub" component={P2pHubScreen} />
      <Stack.Screen name="PurchaseRequests" component={P2pListsScreen} />
      <Stack.Screen name="PurchaseRecommendations" component={PurchaseRecommendationsScreen} />
      <Stack.Screen name="PurchaseRequestCreate" component={PurchaseRequestCreateScreen} />
      <Stack.Screen name="PurchaseRequestDetail" component={P2pDetailScreen} />
      <Stack.Screen name="PurchaseOrders" component={P2pListsScreen} />
      <Stack.Screen name="PurchaseOrderDetail" component={P2pDetailScreen} />
      <Stack.Screen name="OrderImport" component={OrderImportScreen} />
      <Stack.Screen name="PurchaseReceipts" component={P2pListsScreen} />
      <Stack.Screen name="PurchaseReceiptCreate" component={PurchaseReceiptCreateScreen} />
      <Stack.Screen name="PurchaseReceiptDetail" component={P2pDetailScreen} />
      <Stack.Screen name="SupplierReturnCreate" component={SupplierReturnCreateScreen} />
      <Stack.Screen name="SupplierInvoices" component={P2pListsScreen} />
      <Stack.Screen name="SupplierInvoiceDetail" component={P2pDetailScreen} />
      <Stack.Screen name="P2pAccounting" component={P2pAccountingScreen} />
      <Stack.Screen name="AccountingAi" component={AccountingAiScreen} />
    </Stack.Navigator>
  );
}
