import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ModePaiement } from '@caisse-crm/shared';
import { apiFetch } from '../api';
import { formatFcfa } from '../circuit/actions';
import {
  imprimerTicketCaisse,
  type SocieteTicket,
} from '../lib/ticket-caisse-print';
import { MODES_POS } from '../pos-panier';
import { colors, ui } from '../ui';

export interface LigneTicketVente {
  id?: string;
  quantite: number;
  prixUnitaire: string | number;
  remise?: string | number;
  produit: { designation: string };
}

export interface PaiementTicket {
  modePaiement: string;
  montant: string | number;
}

export interface TicketVenteData {
  id: string;
  dateVente: string;
  montantTotal: string | number;
  modePaiement: string;
  lignes: LigneTicketVente[];
  paiements?: PaiementTicket[];
  offline?: boolean;
  /** Affiché si espèces (UI — non stocké API). */
  montantRecu?: number;
  monnaie?: number;
}

function labelMode(mode: string): string {
  return MODES_POS.find((m) => m.mode === mode)?.label ?? mode;
}

/**
 * Ticket caisse post-encaissement — aperçu + impression thermique 72 mm.
 */
export function PosTicketRecu({
  ticket,
  boutiqueNom,
  caissier,
  clientLabel,
  onNouvelleCommande,
  autoPrint = true,
}: {
  ticket: TicketVenteData;
  boutiqueNom?: string | null;
  caissier?: string | null;
  clientLabel?: string | null;
  onNouvelleCommande: () => void;
  autoPrint?: boolean;
}) {
  const [societe, setSociete] = useState<SocieteTicket | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<SocieteTicket>('/entreprise')
      .then((s) => {
        if (!cancelled) setSociete(s);
      })
      .catch(() => {
        if (!cancelled) setSociete(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => {
      void imprimerTicketCaisse({
        ticket,
        boutiqueNom,
        caissier,
        clientLabel,
        societe,
      }).catch((err) => {
        setPrintError(
          err instanceof Error
            ? err.message
            : 'Impression du ticket impossible.',
        );
      });
    }, 350);
    return () => clearTimeout(t);
    // Une seule tentative à l’arrivée sur le ticket (société peut arriver après).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const parts =
    ticket.paiements && ticket.paiements.length > 0
      ? ticket.paiements
      : [
          {
            modePaiement: ticket.modePaiement,
            montant: ticket.montantTotal,
          },
        ];

  async function printNow() {
    setPrintError(null);
    try {
      await imprimerTicketCaisse({
        ticket,
        boutiqueNom,
        caissier,
        clientLabel,
        societe,
      });
    } catch (err) {
      setPrintError(
        err instanceof Error ? err.message : 'Impression du ticket impossible.',
      );
    }
  }

  const raison = societe?.raisonSociale?.trim() || 'CaissePOS';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.wrap}
    >
      <View style={styles.ticket} collapsable={false}>
        <Text style={styles.brand}>{raison}</Text>
        {boutiqueNom ? <Text style={styles.shop}>{boutiqueNom}</Text> : null}
        {societe?.adresse ? (
          <Text style={styles.addr}>{societe.adresse}</Text>
        ) : null}
        {societe?.telephone ? (
          <Text style={styles.addr}>Tél. {societe.telephone}</Text>
        ) : null}

        <Text style={styles.dash}>--------------------------------</Text>
        <Text style={styles.title}>
          TICKET {ticket.id.slice(0, 8).toUpperCase()}
        </Text>
        <Text style={styles.meta}>
          {new Date(ticket.dateVente).toLocaleString('fr-FR')}
        </Text>
        {caissier ? (
          <Text style={styles.meta}>Caissier : {caissier}</Text>
        ) : null}
        <Text style={styles.dash}>--------------------------------</Text>

        {ticket.lignes.map((l, i) => {
          const remise = Number(l.remise) || 0;
          const ligne = Number(l.prixUnitaire) * l.quantite - remise;
          const pu = Number(l.prixUnitaire);
          return (
            <View
              key={l.id ?? `${i}-${l.produit.designation}`}
              style={styles.ligneBlock}
            >
              <Text style={styles.ligneNom}>{l.produit.designation}</Text>
              <View style={styles.ligneRow}>
                <Text style={styles.detail}>
                  {l.quantite} × {formatFcfa(pu)}
                  {remise > 0 ? ` · −${formatFcfa(remise)}` : ''}
                </Text>
                <Text style={styles.montant}>{formatFcfa(ligne)}</Text>
              </View>
            </View>
          );
        })}

        <Text style={styles.dash}>--------------------------------</Text>
        {clientLabel ? (
          <Text style={styles.meta}>Client : {clientLabel}</Text>
        ) : null}

        {parts.length > 1 ? (
          parts.map((p) => (
            <View key={p.modePaiement} style={styles.payRow}>
              <Text style={styles.meta}>{labelMode(p.modePaiement)}</Text>
              <Text style={styles.montant}>{formatFcfa(p.montant)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>
            {labelMode(parts[0]?.modePaiement ?? ModePaiement.ESPECES)}
          </Text>
        )}

        <Text style={styles.total}>
          {formatFcfa(ticket.montantTotal)} FCFA
        </Text>

        {ticket.montantRecu != null && ticket.montantRecu > 0 ? (
          <View style={styles.cashBox}>
            <View style={styles.payRow}>
              <Text style={styles.meta}>Reçu (espèces)</Text>
              <Text style={styles.montant}>
                {formatFcfa(ticket.montantRecu)}
              </Text>
            </View>
            <View style={styles.payRow}>
              <Text style={[styles.meta, { fontWeight: '800' }]}>Monnaie</Text>
              <Text style={[styles.montant, { fontWeight: '800' }]}>
                {formatFcfa(Math.max(0, ticket.monnaie ?? 0))}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.thanks}>Merci de votre visite</Text>
        {ticket.offline ? (
          <Text style={styles.offline}>
            Hors ligne — sync à la reconnexion (§6.7)
          </Text>
        ) : null}
      </View>

      {printError ? <Text style={ui.error}>{printError}</Text> : null}
      <Pressable style={ui.btn} onPress={() => void printNow()}>
        <Text style={ui.btnText}>Imprimer le ticket caisse</Text>
      </Pressable>
      <Pressable style={ui.btnGhost} onPress={onNouvelleCommande}>
        <Text style={ui.btnGhostText}>Nouvelle commande</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 110,
    gap: 12,
    alignItems: 'center',
  },
  ticket: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4D4D4',
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 2,
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#000',
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'Courier New, monospace',
    }),
  },
  shop: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#000',
    fontSize: 14,
  },
  addr: {
    textAlign: 'center',
    color: '#333',
    fontSize: 11,
  },
  dash: {
    textAlign: 'center',
    color: '#000',
    fontSize: 12,
    marginVertical: 6,
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'Courier New, monospace',
    }),
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  meta: {
    fontSize: 12,
    color: '#222',
    fontWeight: '600',
    textAlign: 'center',
  },
  ligneBlock: {
    gap: 2,
    paddingVertical: 4,
  },
  ligneNom: {
    fontWeight: '700',
    color: '#000',
    fontSize: 13,
  },
  ligneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  detail: {
    color: '#444',
    fontSize: 11,
    flex: 1,
  },
  montant: {
    fontWeight: '800',
    color: '#000',
    fontVariant: ['tabular-nums'],
    fontSize: 13,
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  total: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: '#000',
  },
  cashBox: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#000',
    gap: 4,
  },
  thanks: {
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#333',
    fontSize: 12,
  },
  offline: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: 6,
  },
});
