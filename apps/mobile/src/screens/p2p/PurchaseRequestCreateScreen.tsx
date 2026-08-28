import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api';
import {
  p2pApi,
  type ActiveBudget,
  type CostCentre,
} from '../../api/p2p';
import { ScreenHeader, Banner } from '../../components/ScreenChrome';
import { colors, ui } from '../../ui';
import type { P2pStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<P2pStackParamList, 'PurchaseRequestCreate'>;

export function PurchaseRequestCreateScreen({ navigation }: Props) {
  const [objet, setObjet] = useState('');
  const [justification, setJustification] = useState('');
  const [centreCoutId, setCentreCoutId] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [costCentres, setCostCentres] = useState<CostCentre[]>([]);
  const [budgets, setBudgets] = useState<ActiveBudget[]>([]);
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void p2pApi.costCentres().then(setCostCentres).catch((err) =>
      setError(err instanceof Error ? err.message : 'Centres de coût inaccessibles.'),
    );
  }, []);

  async function selectCostCentre(id: string) {
    setCentreCoutId(id);
    setBudgetId('');
    setBudgets([]);
    try {
      setBudgets(await p2pApi.activeBudgets(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Budgets actifs inaccessibles.');
    }
  }

  async function submit() {
    const qty = Number(quantite);
    const amount = prix ? Number(prix) : undefined;
    if (!objet.trim() || !centreCoutId || !budgetId || !designation.trim() || !Number.isInteger(qty) || qty <= 0 || (amount != null && (!Number.isFinite(amount) || amount <= 0))) {
      setError('Renseignez les identifiants réels, la désignation et des valeurs positives.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await p2pApi.createRequest({
        objet: objet.trim(),
        justification: justification.trim() || undefined,
        centreCoutId,
        budgetId,
        devise: 'XOF',
        lignes: [{ designation: designation.trim(), quantite: qty, ...(amount ? { prixEstime: amount } : {}) }],
      });
      navigation.replace('PurchaseRequestDetail', { id: created.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création refusée.');
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={ui.wrap} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Nouvelle demande" subtitle="Brouillon réel, soumis ensuite au circuit d’approbation." onBack={() => navigation.goBack()} />
        <Field label="Objet" value={objet} onChangeText={setObjet} />
        <Field label="Justification" value={justification} onChangeText={setJustification} multiline />
        <View style={ui.card}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Centre de coût</Text>
          {costCentres.length === 0 ? <Banner tone="info">Aucun centre actif dans votre périmètre.</Banner> : costCentres.map((centre) => (
            <Pressable
              key={centre.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: centreCoutId === centre.id }}
              style={[ui.btnGhost, centreCoutId === centre.id && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
              onPress={() => void selectCostCentre(centre.id)}
            >
              <Text style={ui.btnGhostText}>{centre.code} · {centre.libelle}</Text>
            </Pressable>
          ))}
        </View>
        {centreCoutId ? (
          <View style={ui.card}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Budget actif</Text>
            {budgets.length === 0 ? <Banner tone="info">Aucun budget XOF actif pour ce centre.</Banner> : budgets.map((budget) => (
              <Pressable
                key={budget.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: budgetId === budget.id }}
                style={[ui.btnGhost, budgetId === budget.id && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                onPress={() => setBudgetId(budget.id)}
              >
                <Text style={ui.btnGhostText}>{budget.libelle}</Text>
                <Text style={ui.muted}>Disponible : {budget.montantDisponible} {budget.devise}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={ui.card}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Ligne d’achat</Text>
          <Field label="Désignation" value={designation} onChangeText={setDesignation} />
          <View style={ui.row}>
            <Field label="Quantité" value={quantite} onChangeText={setQuantite} keyboardType="number-pad" grow />
            <Field label="Prix estimé" value={prix} onChangeText={setPrix} keyboardType="decimal-pad" grow />
          </View>
        </View>
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <Pressable style={[ui.btn, pending && ui.btnOff]} disabled={pending} onPress={() => void submit()}>
          <Text style={ui.btnText}>{pending ? 'Création…' : 'Créer le brouillon'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, grow, ...props }: {
  label: string;
  grow?: boolean;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={{ gap: 5, ...(grow ? { flex: 1 } : {}) }}>
      <Text style={ui.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[ui.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}
