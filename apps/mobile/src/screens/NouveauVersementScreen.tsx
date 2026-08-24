import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TypeCaisse } from '@caisse-crm/shared';
import { enqueueSortieFondsOp, getOfflineStore } from '@caisse-crm/offline';
import { ApiError } from '../api';
import { initierSortieFonds, listCaisses } from '../api/tresorerie';
import { Chip, ScreenHeader } from '../components/ScreenChrome';
import { newClientOperationId } from '../lib/id';
import { tenterFlushMobile } from '../offline/auto-sync';
import { estErreurHorsLigne } from '../offline/erreurs';
import { colors, ui } from '../ui';
import type { CaisseDto, CircuitStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<CircuitStackParamList, 'NouveauVersement'>;

export function NouveauVersementScreen({ navigation }: Props) {
  const [magasins, setMagasins] = useState<CaisseDto[]>([]);
  const [caisseId, setCaisseId] = useState('');
  const [montant, setMontant] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const soumissionEnCours = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCaisses()
      .then((caisses) => {
        const m = caisses.filter(
          (c) => c.type === TypeCaisse.MAGASIN && c.actif !== false,
        );
        setMagasins(m);
        if (m[0]) setCaisseId(m[0].id);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Caisses inaccessibles.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    if (
      soumissionEnCours.current ||
      !caisseId ||
      Number(montant) <= 0
    ) {
      return;
    }
    soumissionEnCours.current = true;
    setPending(true);
    setError(null);
    setInfo(null);
    const clientOperationId = newClientOperationId();
    try {
      const created = await initierSortieFonds({
        caisseId,
        montant: Number(montant),
        clientOperationId,
      });
      navigation.replace('CircuitDetail', { transactionId: created.id });
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        await enqueueSortieFondsOp(getOfflineStore(), {
          caisseId,
          montant: Number(montant),
          clientOperationId,
        });
        void tenterFlushMobile();
        setInfo(
          'Hors ligne — versement enregistré une seule fois dans la file locale (§6.7).',
        );
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Le versement n'a pas pu être initié.",
        );
        soumissionEnCours.current = false;
      }
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <View style={ui.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={ui.wrap}>
      <ScreenHeader
        title="Nouveau versement"
        subtitle="SORTIE_FONDS depuis la caisse magasin · statut Initiée (§6.4)."
        onBack={() => navigation.goBack()}
        backLabel="Circuit"
      />
      {magasins.length === 0 ? (
        <Text style={ui.error}>Aucune caisse magasin sur votre périmètre.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {magasins.map((c) => (
            <Chip
              key={c.id}
              label={c.libelle ?? c.id}
              active={caisseId === c.id}
              onPress={() => setCaisseId(c.id)}
            />
          ))}
        </View>
      )}
      <TextInput
        style={ui.input}
        keyboardType="numeric"
        placeholder="Montant (FCFA)"
        placeholderTextColor={colors.muted}
        value={montant}
        onChangeText={setMontant}
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {info ? <Text style={ui.success}>{info}</Text> : null}
      <Pressable
        style={[
          ui.btn,
          (pending ||
            info !== null ||
            !caisseId ||
            Number(montant) <= 0) &&
            ui.btnOff,
        ]}
        disabled={
          pending || info !== null || !caisseId || Number(montant) <= 0
        }
        onPress={() => void submit()}
      >
        <Text style={ui.btnText}>
          {info ? 'Versement en attente de synchronisation' : 'Initier le versement'}
        </Text>
      </Pressable>
    </View>
  );
}
