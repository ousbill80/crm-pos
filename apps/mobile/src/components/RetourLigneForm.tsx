import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { enqueueRetourOp, getOfflineStore } from '@caisse-crm/offline';
import { ApiError } from '../api';
import { creerRetour, type LigneVenteDto, type RetourVenteDto } from '../api/ventes';
import { newClientOperationId } from '../lib/id';
import { tenterFlushMobile } from '../offline/auto-sync';
import { estErreurHorsLigne } from '../offline/erreurs';
import { colors, ui } from '../ui';

/**
 * Retour/avoir partiel sur une ligne de vente — port mobile de
 * `RetourLigneForm` (`apps/web/src/routes/PosPage.tsx:1318-1383`). Bouton
 * "Retour" replié par défaut ; déplié, saisie de la quantité bornée à
 * `[1, quantiteRestante]` puis confirmation. Toute la validation métier
 * (sur-retour, calcul du remboursement pro-rata) est faite côté serveur
 * (`VentesService.creerRetour`) — ce composant se contente de border
 * l'input côté UX et d'afficher l'erreur serveur telle quelle si elle
 * survient (§ RBAC : pas de gate de rôle côté client, le serveur tranche).
 */
export function RetourLigneForm({
  sessionId,
  ligne,
  quantiteRestante,
  onRetour,
}: {
  sessionId: string;
  ligne: LigneVenteDto;
  quantiteRestante: number;
  onRetour: (retour: RetourVenteDto) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [quantite, setQuantite] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmer() {
    const q = Number(quantite);
    if (!Number.isInteger(q) || q < 1 || q > quantiteRestante) {
      setError(`Quantité invalide (1 à ${quantiteRestante}).`);
      return;
    }
    setPending(true);
    setError(null);
    const clientOperationId = newClientOperationId();
    try {
      const retour = await creerRetour(sessionId, {
        ligneVenteId: ligne.id,
        quantite: q,
        clientOperationId,
      });
      setOuvert(false);
      setQuantite('1');
      onRetour(retour);
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        await enqueueRetourOp(getOfflineStore(), sessionId, {
          ligneVenteId: ligne.id,
          quantite: q,
          clientOperationId,
        });
        onRetour({
          id: clientOperationId,
          venteId: ligne.venteId,
          ligneVenteId: ligne.id,
          quantite: q,
          montantRembourse: '0',
          sessionCaisseId: sessionId,
          utilisateurId: 'offline',
          dateHeure: new Date().toISOString(),
        });
        setOuvert(false);
        setQuantite('1');
        void tenterFlushMobile();
      } else {
        setError(err instanceof ApiError ? err.message : 'Retour impossible.');
      }
    } finally {
      setPending(false);
    }
  }

  if (!ouvert) {
    return (
      <Pressable
        style={styles.btnGhostSmall}
        onPress={() => setOuvert(true)}
        accessibilityLabel={`Retour sur ${ligne.produit.designation}`}
      >
        <Text style={styles.btnGhostSmallText}>Retour</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[ui.input, styles.input]}
        keyboardType="numeric"
        value={quantite}
        onChangeText={setQuantite}
        editable={!pending}
        accessibilityLabel="Quantité à retourner"
      />
      <Pressable
        style={[ui.btn, styles.btnCompact, pending && ui.btnOff]}
        disabled={pending}
        onPress={() => void confirmer()}
      >
        <Text style={ui.btnText}>{pending ? '…' : 'OK'}</Text>
      </Pressable>
      <Pressable
        style={styles.btnCancel}
        disabled={pending}
        onPress={() => {
          setOuvert(false);
          setQuantite('1');
          setError(null);
        }}
        accessibilityLabel="Annuler le retour"
      >
        <Text style={styles.btnCancelText}>Annuler</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  input: {
    width: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  btnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnCancel: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  btnCancelText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  btnGhostSmall: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  btnGhostSmallText: {
    color: colors.accentText,
    fontWeight: '700',
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    width: '100%',
  },
});
