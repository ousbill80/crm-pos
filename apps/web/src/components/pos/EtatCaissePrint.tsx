import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { apiDownload, apiFetch } from '../../lib/api';
import { fmtDate, fmtDateHeure, fmtFcfa } from '../../lib/achats-ui';
import { libellePaiements } from '../../lib/paiement-vente';
import { LoadingState } from '../LoadingState';
import type { EtatSessionDto, EtatVenteLigneDto } from '../../lib/types';
import { libellesEtatCaisse } from '../../lib/etat-caisse';
import { MajorBrandMark } from '../MajorBrandMark';

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
      <div className="pos-etat-print">
        <LoadingState label="Préparation de l’état de caisse…" />
      </div>
    );
  }
  if (etat.isError || !etat.data) {
    return (
      <div className="pos-etat-print">
        <p role="alert">Impossible de charger les ventes du jour.</p>
        <button type="button" className="btn-secondary" onClick={onFermer}>
          Fermer
        </button>
      </div>
    );
  }

  const d = etat.data;
  const totalCa = d.releve.reduce((s, l) => s + Number(l.total), 0);
  const estZ = d.typeEtat === 'Z';
  const lib = libellesEtatCaisse(d.typeEtat);
  const ecartN = d.ecart != null ? Number(d.ecart) : 0;

  return (
    <div className="pos-receipt pos-etat-print">
      <div className="pos-etat-toolbar no-print">
        <button type="button" className="btn-ghost" onClick={onFermer}>
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="pos-etat-toolbar-actions">
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimer
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              void apiDownload(
                `/ventes/sessions/${sessionId}/cloture/pdf`,
                `etat-${d.typeEtat.toLowerCase()}-${sessionId}.pdf`,
              )
            }
          >
            <FileDown size={16} /> PDF
          </button>
          {bordereauId ? (
            <a className="btn-secondary" href={`/transactions/${bordereauId}`}>
              Bordereau
            </a>
          ) : null}
        </div>
      </div>

      <article className="pos-etat-doc">
        <header className="pos-etat-head">
          <div className="pos-etat-head-main">
            <MajorBrandMark variant="doc" />
            <span className={`pos-etat-badge pos-etat-badge-${d.typeEtat.toLowerCase()}`}>
              {lib.badge}
            </span>
            <h1>{lib.titre}</h1>
            <p className="pos-etat-explicatif">{lib.sousTitre}</p>
            {d.boutiqueNom ? (
              <p className="pos-etat-societe">{d.boutiqueNom}</p>
            ) : null}
            {d.societe?.adresse ? (
              <p className="pos-etat-addr">{d.societe.adresse}</p>
            ) : null}
          </div>
          <dl className="pos-etat-head-meta">
            <div>
              <dt>Poste</dt>
              <dd>{d.caisseLibelle || '—'}</dd>
            </div>
            <div>
              <dt>Ouverture</dt>
              <dd>{fmtDateHeure(d.ouvertureDateHeure)}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>
                {estZ
                  ? `Fermée · ${fmtDateHeure(d.clotureDateHeure)}`
                  : 'Encore ouverte'}
              </dd>
            </div>
          </dl>
        </header>

        <section className="pos-etat-kpis" aria-label="Totaux">
          <article>
            <span>Chiffre d’affaires</span>
            <strong className="money">{fmtFcfa(totalCa)}</strong>
          </article>
          <article>
            <span>Tickets</span>
            <strong>{d.nombreVentes}</strong>
          </article>
          <article>
            <span>Espèces nettes</span>
            <strong className="money">{fmtFcfa(d.totalEspecesNet)}</strong>
          </article>
          <article>
            <span>Fond théorique</span>
            <strong className="money">{fmtFcfa(d.fondTheorique)}</strong>
          </article>
        </section>

        <section className="pos-etat-block">
          <h2>Journal des tickets</h2>
          <div className="pos-etat-table-wrap">
            <table className="pos-etat-table pos-etat-journal">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>N°</th>
                  <th>Paiement</th>
                  <th className="num">Lignes</th>
                  <th className="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                {d.ventes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="pos-etat-empty">
                      Aucune vente sur cette session.
                    </td>
                  </tr>
                ) : (
                  d.ventes.map((v) => (
                    <tr key={v.id}>
                      <td>{heureTicket(v.dateVente)}</td>
                      <td>
                        <code>{idCourt(v.id)}</code>
                      </td>
                      <td>{libelleTicket(v)}</td>
                      <td className="num">{v.nbLignes}</td>
                      <td className="num money">{fmtFcfa(v.montantTotal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Total</th>
                  <th className="num">{d.nombreVentes}</th>
                  <th className="num money">{fmtFcfa(totalCa)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="pos-etat-split">
          <section className="pos-etat-block">
            <h2>Par mode de paiement</h2>
            <table className="pos-etat-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th className="num">Tickets</th>
                  <th className="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                {d.releve.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="pos-etat-empty">
                      Aucun encaissement
                    </td>
                  </tr>
                ) : (
                  d.releve.map((l) => (
                    <tr key={l.modePaiement}>
                      <td>{MODE[l.modePaiement] ?? l.modePaiement}</td>
                      <td className="num">{l.nombreVentes}</td>
                      <td className="num money">{fmtFcfa(l.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="pos-etat-block pos-etat-tiroir-block">
            <h2>Tiroir</h2>
            <dl className="pos-etat-tiroir">
              <div>
                <dt>Fond initial</dt>
                <dd className="money">{fmtFcfa(d.fondInitial)}</dd>
              </div>
              <div>
                <dt>Espèces nettes</dt>
                <dd className="money">{fmtFcfa(d.totalEspecesNet)}</dd>
              </div>
              <div className="pos-etat-tiroir-emph">
                <dt>Fond théorique</dt>
                <dd className="money">{fmtFcfa(d.fondTheorique)}</dd>
              </div>
              {estZ ? (
                <>
                  <div>
                    <dt>Fond compté</dt>
                    <dd className="money">{fmtFcfa(d.fondCompteCloture ?? '0')}</dd>
                  </div>
                  <div className={ecartN !== 0 ? 'pos-etat-tiroir-ecart' : undefined}>
                    <dt>Écart</dt>
                    <dd className="money">{fmtFcfa(d.ecart ?? '0')}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            {estZ ? (
              <p className="pos-etat-note">{lib.note}</p>
            ) : (
              <p className="pos-etat-note">{lib.note}</p>
            )}
          </section>
        </div>

        <footer className="pos-etat-foot">
          <p>
            {d.ouvreur ? `Ouvert par ${d.ouvreur}` : 'Ouvreur non renseigné'}
            {d.temoinOuverture ? ` · témoin ${d.temoinOuverture}` : ''}
          </p>
          {d.clotureur ? (
            <p>
              Clôturé par {d.clotureur}
              {d.temoinCloture ? ` · témoin ${d.temoinCloture}` : ''}
            </p>
          ) : null}
          <p className="pos-etat-imprime">
            Édité le {fmtDate(d.imprimeAt ?? new Date().toISOString())} · session{' '}
            <code>{idCourt(d.sessionId)}</code>
          </p>
        </footer>
      </article>
    </div>
  );
}
