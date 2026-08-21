import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import { apiDownload, apiFetch } from '../../lib/api';
import { fmtDate, fmtDateHeure, fmtFcfa } from '../../lib/achats-ui';
import { libellePaiements } from '../../lib/paiement-vente';
import { LoadingState } from '../LoadingState';
import type { EtatSessionDto, EtatVenteLigneDto } from '../../lib/types';

const MODE: Record<string, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  MOBILE_MONEY: 'Mobile money',
};

function idCourt(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function heureTicket(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function libelleTicket(v: EtatVenteLigneDto): string {
  return libellePaiements({
    modePaiement: v.modePaiement,
    montantTotal: v.montantTotal,
    paiements: v.paiements,
  });
}

export function EtatCaissePrint({
  sessionId,
  onFermer,
  autoPrint = false,
  bordereauId,
}: {
  sessionId: string;
  onFermer: () => void;
  autoPrint?: boolean;
  bordereauId?: string | null;
}) {
  const etat = useQuery({
    queryKey: ['etat-session', sessionId],
    queryFn: () => apiFetch<EtatSessionDto>(`/ventes/sessions/${sessionId}/etat`),
  });

  useEffect(() => {
    if (!autoPrint || !etat.data) return;
    const t = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(t);
  }, [autoPrint, etat.data]);

  if (etat.isLoading) {
    return (
      <div className="pos-receipt">
        <LoadingState label="Préparation des ventes du jour…" />
      </div>
    );
  }
  if (etat.isError || !etat.data) {
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-card">
          <p role="alert">Impossible de charger les ventes du jour.</p>
          <button type="button" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  const d = etat.data;
  const totalCa = d.releve.reduce((s, l) => s + Number(l.total), 0);
  const titre =
    d.typeEtat === 'Z' ? 'État Z — Clôture' : 'Ventes du jour';

  return (
    <div className="pos-receipt pos-etat-print">
      <div className="pos-receipt-card ticket pos-etat-card">
        <div className="pos-receipt-brand">
          {d.societe?.raisonSociale ?? 'CaissePOS'}
        </div>
        {d.boutiqueNom ? <p className="pos-receipt-shop">{d.boutiqueNom}</p> : null}
        {d.caisseLibelle ? <p className="pos-receipt-shop">{d.caisseLibelle}</p> : null}
        <p className="pos-etat-kicker">{titre}</p>
        <p className="pos-receipt-meta">
          {fmtDate(d.ouvertureDateHeure)} · {d.nombreVentes} ticket(s) ·{' '}
          {fmtFcfa(totalCa)}
        </p>
        <p className="pos-receipt-meta">
          {d.typeEtat === 'Z'
            ? `Session fermée · ${fmtDateHeure(d.clotureDateHeure)}`
            : 'Session ouverte — n’est pas une clôture'}
        </p>

        <p className="pos-etat-section">Journal</p>
        <table className="pos-etat-table pos-etat-journal">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Paiement</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            {d.ventes.length === 0 ? (
              <tr>
                <td colSpan={3}>Aucune vente aujourd’hui</td>
              </tr>
            ) : (
              d.ventes.map((v) => (
                <tr key={v.id}>
                  <td>
                    {heureTicket(v.dateVente)}
                    <span className="pos-etat-ticket-id">{idCourt(v.id)}</span>
                  </td>
                  <td>
                    {libelleTicket(v)}
                    <span className="pos-etat-ticket-id">
                      {v.nbLignes} ligne{v.nbLignes > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="money">{fmtFcfa(v.montantTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="pos-receipt-total money">{fmtFcfa(totalCa)}</p>
        <p className="pos-receipt-meta">{d.nombreVentes} ticket(s)</p>

        <p className="pos-etat-section">Par mode de paiement</p>
        <table className="pos-etat-table">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Tickets</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            {d.releve.length === 0 ? (
              <tr>
                <td colSpan={3}>Aucune vente</td>
              </tr>
            ) : (
              d.releve.map((l) => (
                <tr key={l.modePaiement}>
                  <td>{MODE[l.modePaiement] ?? l.modePaiement}</td>
                  <td>{l.nombreVentes}</td>
                  <td className="money">{fmtFcfa(l.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="pos-etat-tiroir">
          <div>
            <dt>Fond initial</dt>
            <dd className="money">{fmtFcfa(d.fondInitial)}</dd>
          </div>
          <div>
            <dt>Espèces nettes</dt>
            <dd className="money">{fmtFcfa(d.totalEspecesNet)}</dd>
          </div>
          <div>
            <dt>Fond théorique</dt>
            <dd className="money">{fmtFcfa(d.fondTheorique)}</dd>
          </div>
          {d.typeEtat === 'Z' ? (
            <>
              <div>
                <dt>Fond compté</dt>
                <dd className="money">{fmtFcfa(d.fondCompteCloture ?? '0')}</dd>
              </div>
              <div>
                <dt>Écart</dt>
                <dd className="money">{fmtFcfa(d.ecart ?? '0')}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {d.typeEtat === 'Z' ? (
          <p className="pos-receipt-meta">
            Écart informatif — ne crée pas de litige à lui seul.
          </p>
        ) : null}
        {d.ouvreur ? (
          <p className="pos-receipt-meta">
            Ouvert par {d.ouvreur}
            {d.temoinOuverture ? ` · témoin ${d.temoinOuverture}` : ''}
          </p>
        ) : null}
        {d.clotureur ? (
          <p className="pos-receipt-meta">
            Clôturé par {d.clotureur}
            {d.temoinCloture ? ` · témoin ${d.temoinCloture}` : ''}
          </p>
        ) : null}

        <div className="pos-receipt-actions no-print">
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} /> Imprimer
          </button>
          <button
            type="button"
            onClick={() =>
              void apiDownload(
                `/ventes/sessions/${sessionId}/cloture/pdf`,
                `etat-${d.typeEtat.toLowerCase()}-${sessionId}.pdf`,
              )
            }
          >
            PDF
          </button>
          {bordereauId ? (
            <a className="pos-btn-ghost-link" href={`/transactions/${bordereauId}`}>
              Bordereau
            </a>
          ) : null}
          <button type="button" className="pos-btn-primary" onClick={onFermer}>
            <X size={16} /> Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
