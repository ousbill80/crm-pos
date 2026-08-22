import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { labelProfil } from '@caisse-crm/shared';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';

export function HorsPerimetreScreen() {
  const { user, signOut } = useSession();
  return (
    <View style={ui.center}>
      <View
        style={{
          backgroundColor: colors.warningSoft,
          borderRadius: 20,
          padding: 16,
          marginBottom: 8,
        }}
      >
        <Ionicons name="shield-outline" size={32} color={colors.warning} />
      </View>
      <Text style={[ui.title, { textAlign: 'center' }]}>
        Hors périmètre trésorerie
      </Text>
      <Text style={[ui.subtitle, { textAlign: 'center' }]}>
        {user ? labelProfil(user.role) : 'Ce profil'} n’a pas accès au circuit
        de fonds ni au POS terrain (§4).
      </Text>
      <Pressable style={[ui.btn, { alignSelf: 'stretch' }]} onPress={() => void signOut()}>
        <Text style={ui.btnText}>Déconnexion</Text>
      </Pressable>
    </View>
  );
}
