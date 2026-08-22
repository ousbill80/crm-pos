import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, apiDownloadPdf, apiPrintPdf } from '../api';
import {
  getEtatSession,
  listerVentesSession,
  pathReleveSessionPdf,
  type EtatSessionDto,
  type RetourVenteDto,
  type VenteDto,
} from '../api/ventes';
import { formatFcfa } from '../circuit/actions';
import { Money, ScreenHeader, StatusPill } from '../components/ScreenChrome';
import { RetourLigneForm } from '../components/RetourLigneForm';
import {
  libelleModesPaiement,
  libellesEtatCaisse,
  MODE_PAIEMENT_LABEL,
} from '../lib/etat-caisse';
import { quantiteRetournee } from '../pos-retours';
import { colors, ui } from '../ui';
import type { PosStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<PosStackParamList, 'EtatSession'>;

function heureTicket(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EtatSessionScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const [etat, setEtat] = useState<EtatSessionDto | null>(null);
  const [ventes, setVentes] = useState<VenteDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printPending, setPrintPending] = useState(false);

  const retours = useMemo(
    () => ventes.flatMap((v) => v.retours ?? []),
    [ventes],
  );

  const charger = useCallback(async () => {
    setError(null);
    const [data, detail] = await Promise.all([
      getEtatSession(sessionId),
      listerVentesSession(sessionId),
    ]);
    setEtat(data);
    setVentes(detail);
  }, [sessionId]);

  /** Rafraîchit uniquement l'état (KPIs/tiroir/écart) après un retour —
   * les lignes de vente affichées sont déjà mises à jour localement. */
  const rafraichirEtat = useCallback(async () => {
    try {
      const data = await getEtatSession(sessionId);
      setEtat(data);
    } catch {
      // best-effort — un échec ici ne doit pas bloquer l'écran, l'utilisateur
      // peut tirer pour rafraîchir manuellement.
    }
  }, [sessionId]);

  function appliquerRetour(venteId: string, retour: RetourVenteDto) {
    setVentes((prev) =>
      prev.map((v) =>
        v.id === venteId
          ? { ...v, retours: [...(v.retours ?? []), retour] }
          : v,
      ),
    );
    void rafraichirEtat();
  }

  useEffect(() => {
    setLoading(true);
    void charger()
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Impossible de charger l’état des ventes.',
        ),
      )
      .finally(() => setLoading(false));
  }, [charger]);

  async function imprimerReleve() {
    setPrintPending(true);
    setError(null);
    try {
      await apiPrintPdf(pathReleveSessionPdf(sessionId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Impression du relevé impossible.',
      );
    } finally {
      setPrintPending(false);
    }
  }

  async function telechargerReleve() {
    setPrintPending(true);
    setError(null);
    try {
      const prefix = etat?.typeEtat === 'Z' ? 'etat-z' : 'etat-x';
      await apiDownloadPdf(
        pathReleveSessionPdf(sessionId),
        `${prefix}-session-${sessionId.slice(0, 8)}.pdf`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Téléchargement du relevé impossible.',
      );
    } finally {
      setPrintPending(false);
    }
  }

  if (loading && !etat) {
    return (
      <View style={ui.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={ui.muted}>Préparation de l’état de caisse…</Text>
      </View>
    );
  }

  if (error && !etat) {
    return (
      <View style={ui.center}>
        <Text style={ui.error}>{error}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={ui.link}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  if (!etat) return null;

  const lib = libellesEtatCaisse(etat.typeEtat);
  const totalCa = etat.releve.reduce((s, l) => s + Number(l.total), 0);
  const estZ = etat.typeEtat === 'Z';
  const ecartN = etat.ecart != null ? Number(etat.ecart) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.wrap}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            setLoading(true);
            void charger()
              .catch((err) =>
                setError(
                  err instanceof ApiError
                    ? err.message
                    : 'Actualisation impossible.',
                ),
              )
              .finally(() => setLoading(false));
          }}
          tintColor={colors.accent}
        />
      }
    >
      <ScreenHeader
        title={lib.titre}
        subtitle={lib.sousTitre}
        onBack={() => navigation.goBack()}
        backLabel="Retour"
        right={
          <StatusPill
            label={lib.badge}
            tone={estZ ? 'ok' : 'info'}
          />
        }
      />

      {error ? <Text style={ui.error}>{error}</Text> : null}

      <View style={styles.printBar}>
        <Pressable
          style={[ui.btn, printPending && ui.btnOff]}
          disabled={printPending}
          onPress={() => void imprimerReleve()}
        >
          <Text style={ui.btnText}>
            {printPending ? 'Préparation…' : 'Imprimer le relevé (PDF)'}
          </Text>
        </Pressable>
        <Pressable
          style={[ui.btnGhost, printPending && ui.btnOff]}
          disabled={printPending}
          onPress={() => void telechargerReleve()}
        >
          <Text style={ui.btnGhostText}>Télécharger le PDF</Text>
        </Pressable>
        <Text style={[ui.muted, { textAlign: 'center' }]}>
          Document officiel de caisse (contrôle X / clôture Z) — pas une
          capture d’écran.
        </Text>
      </View>

      <View style={ui.card}>
        <Text style={styles.societe}>
          {etat.societe?.raisonSociale ?? 'CaissePOS'}
          {etat.boutiqueNom ? ` · ${etat.boutiqueNom}` : ''}
        </Text>
        <Text style={ui.muted}>
          Poste · {etat.caisseLibelle || '—'}
        </Text>
        <Text style={ui.muted}>
          Ouverture ·{' '}
          {new Date(etat.ouvertureDateHeure).toLocaleString('fr-FR')}
        </Text>
        <Text style={ui.muted}>
          {estZ
            ? `Fermée · ${
                etat.clotureDateHeure
                  ? new Date(etat.clotureDateHeure).toLocaleString('fr-FR')
                  : '—'
              }`
            : 'Session encore ouverte'}
        </Text>
      </View>

      <View style={styles.kpis}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Chiffre d’affaires</Text>
          <Money value={formatFcfa(totalCa)} size="md" />
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Tickets</Text>
          <Text style={ui.kpi}>{etat.nombreVentes}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Espèces nettes</Text>
          <Money value={formatFcfa(etat.totalEspecesNet)} size="md" />
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Fond théorique</Text>
          <Money value={formatFcfa(etat.fondTheorique)} size="md" />
        </View>
      </View>

      <Text style={styles.section}>Journal des tickets</Text>
      {etat.ventes.length === 0 ? (
        <View style={ui.card}>
          <Text style={ui.muted}>Aucune vente sur cette session.</Text>
        </View>
      ) : (
        etat.ventes.map((v) => {
          // Détail ligne-à-ligne (retour/avoir) — le fetch `ventes` est
          // parallèle mais peut être ponctuellement en retard sur `etat`
          // (ex. vente concurrente pendant un refresh) : on retombe alors
          // sur l'agrégat de `etat.ventes` sans régresser l'affichage.
          const detail = ventes.find((d) => d.id === v.id);
          return (
            <View key={v.id} style={[ui.card, styles.ticket]}>
              <View style={ui.row}>
                <Text style={styles.ticketHeure}>{heureTicket(v.dateVente)}</Text>
                <Text style={styles.ticketId}>{v.id.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={ui.row}>
                <Text style={ui.muted} numberOfLines={1}>
                  {libelleModesPaiement(
                    v.paiements?.length
                      ? v.paiements
                      : [{ modePaiement: v.modePaiement, montant: v.montantTotal }],
                  )}{' '}
                  · {v.nbLignes} ligne{v.nbLignes > 1 ? 's' : ''}
                </Text>
                <Text style={styles.ticketMontant}>
                  {formatFcfa(v.montantTotal)}
                </Text>
              </View>
              {detail ? (
                <View style={styles.lignesWrap}>
                  {detail.lignes.map((ligne) => {
                    const retourne = quantiteRetournee(retours, ligne.id);
                    const restant = ligne.quantite - retourne;
                    return (
                      <View key={ligne.id} style={styles.ligneRow}>
                        <View style={styles.ligneInfo}>
                          <Text style={ui.muted} numberOfLines={1}>
                            {ligne.produit.designation} × {ligne.quantite}
                            {retourne > 0 ? ` (${retourne} retourné${retourne > 1 ? 's' : ''})` : ''}
                          </Text>
                        </View>
                        {restant > 0 ? (
                          <RetourLigneForm
                            sessionId={sessionId}
                            ligne={ligne}
                            quantiteRestante={restant}
                            onRetour={(retour) => appliquerRetour(v.id, retour)}
                          />
                        ) : (
                          <StatusPill label="Retourné" tone="warn" />
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <Text style={styles.section}>Par mode de paiement</Text>
      <View style={ui.card}>
        {etat.releve.length === 0 ? (
          <Text style={ui.muted}>Aucun encaissement</Text>
        ) : (
          etat.releve.map((l) => (
            <View key={l.modePaiement} style={[ui.row, styles.releveRow]}>
              <Text style={{ flex: 1, fontWeight: '600' }}>
                {MODE_PAIEMENT_LABEL[l.modePaiement] ?? l.modePaiement}
              </Text>
              <Text style={ui.muted}>{l.nombreVentes}</Text>
              <Text style={styles.ticketMontant}>{formatFcfa(l.total)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.section}>Tiroir</Text>
      <View style={ui.card}>
        <View style={[ui.row, styles.releveRow]}>
          <Text style={ui.muted}>Fond initial</Text>
          <Text style={styles.ticketMontant}>{formatFcfa(etat.fondInitial)}</Text>
        </View>
        <View style={[ui.row, styles.releveRow]}>
          <Text style={ui.muted}>Espèces nettes</Text>
          <Text style={styles.ticketMontant}>
            {formatFcfa(etat.totalEspecesNet)}
          </Text>
        </View>
        <View style={[ui.row, styles.releveRow]}>
          <Text style={{ fontWeight: '800' }}>Fond théorique</Text>
          <Text style={[styles.ticketMontant, { fontWeight: '800' }]}>
            {formatFcfa(etat.fondTheorique)}
          </Text>
        </View>
        {estZ ? (
          <>
            <View style={[ui.row, styles.releveRow]}>
              <Text style={ui.muted}>Fond compté</Text>
              <Text style={styles.ticketMontant}>
                {formatFcfa(etat.fondCompteCloture ?? '0')}
              </Text>
            </View>
            <View style={[ui.row, styles.releveRow]}>
              <Text
                style={{
                  fontWeight: '700',
                  color: ecartN !== 0 ? colors.warning : colors.text,
                }}
              >
                Écart
              </Text>
              <Text
                style={[
                  styles.ticketMontant,
                  { color: ecartN !== 0 ? colors.warning : colors.text },
                ]}
              >
                {formatFcfa(etat.ecart ?? '0')}
              </Text>
            </View>
          </>
        ) : null}
        <Text style={[ui.muted, { marginTop: 8 }]}>{lib.note}</Text>
      </View>

      <View style={[ui.card, { gap: 4 }]}>
        <Text style={ui.muted}>
          {etat.ouvreur ? `Ouvert par ${etat.ouvreur}` : 'Ouvreur non renseigné'}
          {etat.temoinOuverture ? ` · témoin ${etat.temoinOuverture}` : ''}
        </Text>
        {etat.clotureur ? (
          <Text style={ui.muted}>
            Clôturé par {etat.clotureur}
            {etat.temoinCloture ? ` · témoin ${etat.temoinCloture}` : ''}
          </Text>
        ) : null}
        <Text style={styles.footId}>
          Session {etat.sessionId.slice(0, 8).toUpperCase()} · édité{' '}
          {new Date(etat.imprimeAt).toLocaleString('fr-FR')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 110,
    gap: 12,
  },
  printBar: {
    gap: 8,
  },
  societe: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
  },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpi: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: 12,
    gap: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accentText,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  ticket: { gap: 4 },
  lignesWrap: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hair,
    gap: 8,
  },
  ligneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ligneInfo: {
    flex: 1,
  },
  ticketHeure: { fontWeight: '800', color: colors.text },
  ticketId: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.tabInactive,
    fontVariant: ['tabular-nums'],
  },
  ticketMontant: {
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  releveRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hair,
  },
  footId: {
    fontSize: 11,
    color: colors.tabInactive,
    marginTop: 4,
  },
});
