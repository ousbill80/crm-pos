import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { fmtDate, fmtFcfa } from '../lib/achats-ui';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightActionApprouver,
  insightActionExecuter,
  insightActionPreparer,
  insightBanque,
  insightBanqueLignes,
  insightBanqueMouvements,
  insightCalendrierPeriodes,
  insightClotureExercice,
  insightPaiementsAApprouver,
  insightPaiementsAExecuter,
  insightPaiementsCircuit,
  insightPaiementsPayes,
  insightStatutProposition,
} from '../lib/insights/compta';
import {
  hasP2pRole,
  labelStatutProposition,
  operationId,
  p2pApi,
  type AccountingPeriod,
  type PaymentProposal,
} from '../lib/p2p';
import { parseBankStatementCsv, type ParsedBankStatementLine } from '../lib/bank-statement-csv';
import type { FactureFournisseurDto, SocieteDto } from '../lib/types';
import { EmptyState } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';

type Action = 'proposition' | 'approbation' | 'execution' | 'releve' | 'rapprochement';

function isoDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function montantLot(row: PaymentProposal): number {
  return Number(row.montant) || 0;
}

export function ComptaWhy({ children }: { children: ReactNode }) {
  return <p className="compta-why">{children}</p>;
}

export function ComptaPaiementsPanel({
  societe,
  role,
}: {
  societe?: SocieteDto;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [proposalStatus, setProposalStatus] = useState('');
  const [recherche, setRecherche] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const proposals = useQuery({
    queryKey: ['p2p-payment-proposals', societe?.id],
    queryFn: () => p2pApi.paymentProposals(societe?.id, undefined),
    enabled: Boolean(societe?.id),
  });
  const detail = useQuery({
    queryKey: ['p2p-payment-proposal', selectedId],
    queryFn: () => p2pApi.paymentProposal(selectedId!),
    enabled: Boolean(selectedId),
  });
  const allItems = proposals.data?.items ?? [];
  const rows = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return allItems.filter((row) => {
      if (proposalStatus && row.statut !== proposalStatus) return false;
      if (!q) return true;
      const hay = [
        row.numero,
        row.compteTresorerie.code,
        row.compteTresorerie.libelle,
        ...row.allocations.map((item) => item.facture.numero),
        ...row.allocations.map((item) => item.facture.fournisseur.nom),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allItems, recherche, proposalStatus]);
  const counts = useMemo(() => {
    const preparee = allItems.filter((row) => row.statut === 'PREPAREE');
    const aExecuter = allItems.filter(
      (row) => row.statut === 'APPROUVEE' || row.statut === 'APPROUVEE_EXCEPTION',
    );
    const executee = allItems.filter((row) => row.statut === 'EXECUTEE');
    const sum = (list: PaymentProposal[]) => list.reduce((acc, row) => acc + montantLot(row), 0);
    return {
      preparee: preparee.length,
      prepareeMt: sum(preparee),
      aExecuter: aExecuter.length,
      aExecuterMt: sum(aExecuter),
      executee: executee.length,
      executeeMt: sum(executee),
    };
  }, [allItems]);

  const etapeChips: Array<{ value: string; label: string }> = [
    { value: '', label: 'Toutes' },
    { value: 'PREPAREE', label: 'À approuver' },
    { value: 'APPROUVEE', label: 'Seuil DG' },
    { value: 'APPROUVEE_EXCEPTION', label: 'À exécuter' },
    { value: 'EXECUTEE', label: 'Payées' },
  ];

  return (
    <>
      <ComptaWhy>
        Ici on paie les <strong>factures fournisseur déjà comptabilisées</strong> — pas la caisse
        boutique. Le RAF prépare un lot, le DAF approuve, la DG n’intervient qu’au-delà du seuil,
        puis DAF ou caissier central exécute.{' '}
        <InfoTooltip insight={insightPaiementsCircuit()} />
      </ComptaWhy>
      <ol className="compta-flow" aria-label="Circuit de paiement">
        <li>
          <strong>1. RAF</strong> prépare
        </li>
        <li>
          <strong>2. DAF</strong> approuve
        </li>
        <li>
          <strong>3. DG</strong> si seuil
        </li>
        <li>
          <strong>4. Exécution</strong> + lettrage
        </li>
      </ol>
      <section className="kpi-grid dash-kpi-grid">
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">
            À approuver <InfoTooltip insight={insightPaiementsAApprouver(counts.preparee, counts.prepareeMt)} />
          </div>
          <div className="kpi-value">{counts.preparee}</div>
          <div className="kpi-hint">
            {counts.preparee > 0 ? fmtFcfa(counts.prepareeMt) : 'Lots en attente DAF'}
          </div>
        </article>
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">
            À exécuter <InfoTooltip insight={insightPaiementsAExecuter(counts.aExecuter, counts.aExecuterMt)} />
          </div>
          <div className="kpi-value">{counts.aExecuter}</div>
          <div className="kpi-hint">
            {counts.aExecuter > 0 ? fmtFcfa(counts.aExecuterMt) : 'Approuvés, pas encore payés'}
          </div>
        </article>
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">
            Payés <InfoTooltip insight={insightPaiementsPayes(counts.executee, counts.executeeMt)} />
          </div>
          <div className="kpi-value">{counts.executee}</div>
          <div className="kpi-hint">
            {counts.executee > 0 ? fmtFcfa(counts.executeeMt) : 'Déjà lettrés au grand livre'}
          </div>
        </article>
      </section>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Propositions de paiement <InfoTooltip insight={insightPaiementsCircuit()} />
            </h2>
            <p className="lead">
              Un lot = une ou plusieurs factures, un compte de trésorerie, une date prévue.
            </p>
          </div>
          <label className="compta-paiements-search">
            Rechercher
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="N° lot, facture, fournisseur…"
              aria-label="Rechercher une proposition"
            />
          </label>
        </div>
        <nav className="compta-journal-chips" aria-label="Filtrer par étape">
          {etapeChips.map((chip) => (
            <button
              key={chip.value || 'all'}
              type="button"
              className={proposalStatus === chip.value ? 'actif' : undefined}
              onClick={() => setProposalStatus(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </nav>
        <div className="p2p-action-grid">
          {hasP2pRole(role, 'comptabiliteEcriture') && (
            <span className="compta-action-with-tip">
              <button type="button" className="btn-primary" onClick={() => setAction('proposition')}>
                Préparer une proposition
              </button>
              <InfoTooltip insight={insightActionPreparer()} />
            </span>
          )}
          {hasP2pRole(role, 'paiementApprobation') && (
            <span className="compta-action-with-tip">
              <button type="button" onClick={() => setAction('approbation')}>
                Approuver (DAF)
              </button>
              <InfoTooltip insight={insightActionApprouver()} />
            </span>
          )}
          {hasP2pRole(role, 'paiementException') && (
            <button type="button" onClick={() => setAction('approbation')}>
              Approuver un seuil exceptionnel
            </button>
          )}
          {hasP2pRole(role, 'paiementExecution') && (
            <span className="compta-action-with-tip">
              <button type="button" onClick={() => setAction('execution')}>
                Exécuter un paiement
              </button>
              <InfoTooltip insight={insightActionExecuter()} />
            </span>
          )}
          <Link className="btn btn-secondary" to="/achats/factures">
            Factures à payer
          </Link>
          <Link className="btn btn-secondary" to="/finance/comptabilite?rapport=banque">
            Rapprochement bancaire
          </Link>
        </div>
        {proposals.isLoading && <LoadingState label="Chargement des lots…" />}
        {proposals.isError && (
          <p role="alert">Impossible de charger les propositions de paiement.</p>
        )}
        {rows.length === 0 && !proposals.isLoading && (
          <EmptyState
            title="Aucun lot sur ce filtre"
            description="Le RAF crée une proposition à partir d’une facture comptabilisée. Le DAF la voit ensuite ici."
          />
        )}
        {rows.length > 0 && (
          <PaymentProposalTable rows={rows} onSelect={setSelectedId} selectedId={selectedId} />
        )}
        {detail.isLoading && <LoadingState label="Chargement du détail…" />}
        {detail.data && (
          <div className="compta-paiement-detail" role="status">
            <header>
              <div>
                <strong>{detail.data.numero}</strong>{' '}
                <InfoTooltip insight={insightStatutProposition(detail.data.statut)} />
                <span className={`badge ${badgeProposition(detail.data.statut)}`}>
                  {labelStatutProposition(detail.data.statut)}
                </span>
              </div>
              <p className="lead">
                {fmtFcfa(detail.data.montant)} {detail.data.devise} ·{' '}
                {detail.data.compteTresorerie.code} {detail.data.compteTresorerie.libelle} · prévu{' '}
                {fmtDate(detail.data.dateExecutionPrevue)}
              </p>
            </header>
            <ul>
              {detail.data.allocations.map((a) => (
                <li key={a.id}>
                  <Link to={`/achats/factures/${a.facture.id}`}>{a.facture.numero}</Link>
                  {' · '}
                  {a.facture.fournisseur.nom}
                  {' · '}
                  {fmtFcfa(a.montant)}
                </li>
              ))}
            </ul>
            {detail.data.paiement?.reference && (
              <p className="muted">Réf. paiement : {detail.data.paiement.reference}</p>
            )}
          </div>
        )}
      </section>
      {action && (
        <AccountingActionModal
          action={action}
          societe={societe}
          role={role}
          proposals={allItems}
          onClose={() => {
            setAction(null);
            void client.invalidateQueries({ queryKey: ['p2p-payment-proposals'] });
          }}
        />
      )}
    </>
  );
}

function badgeProposition(statut: PaymentProposal['statut']): string {
  if (statut === 'EXECUTEE') return 'badge-ok';
  if (statut === 'PREPAREE') return 'badge-info';
  if (statut === 'APPROUVEE' || statut === 'APPROUVEE_EXCEPTION') return 'badge-warning';
  return '';
}

export function ComptaPeriodesPanel({
  societeId,
  role,
}: {
  societeId: string;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const periods = useQuery({
    queryKey: ['p2p-periods', societeId],
    queryFn: () => p2pApi.periods(societeId),
  });
  const exercicesQuery = useQuery({
    queryKey: ['p2p-exercices', societeId],
    queryFn: () => p2pApi.listExercices(societeId),
  });
  const exercices = exercicesQuery.data ?? [];
  const ouvertes = (periods.data ?? []).filter((row) => !row.cloture).length;
  const cloturees = (periods.data ?? []).filter((row) => row.cloture).length;
  return (
    <>
      <ComptaWhy>
        Une <strong>période ouverte</strong> est le calendrier dans lequel on passe les écritures
        (août 2026, septembre 2026…). Sans période ouverte, le grand livre refuse toute nouvelle
        pièce. Le RAF ouvre, le DAF clôture. Une clôture n’est jamais annulée.{' '}
        <InfoTooltip insight={insightCalendrierPeriodes(ouvertes)} />
      </ComptaWhy>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Calendrier comptable <InfoTooltip insight={insightCalendrierPeriodes(ouvertes)} />
            </h2>
            <p className="lead">Choisissez ensuite cette période dans Balance ou Grand livre pour imprimer.</p>
          </div>
        </div>
        {(periods.data?.length ?? 0) > 0 && (
          <section className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">
                Ouvertes <InfoTooltip insight={insightCalendrierPeriodes(ouvertes)} />
              </div>
              <div className="kpi-value">{ouvertes}</div>
              <div className="kpi-hint">
                {ouvertes === 0 ? (
                  <span className="badge badge-warning">Bloqué</span>
                ) : (
                  <span className="badge badge-ok">Comptabilisation possible</span>
                )}
              </div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Clôturées</div>
              <div className="kpi-value">{cloturees}</div>
              <div className="kpi-hint">Lecture seule — grand livre figé</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Exercices</div>
              <div className="kpi-value">{exercices.length}</div>
              <div className="kpi-hint">
                {exercices.filter((e) => !e.cloture).length} ouvert(s)
              </div>
            </article>
          </section>
        )}
        {periods.isLoading && <LoadingState label="Chargement des périodes…" />}
        {periods.isError && <p role="alert">Impossible de charger les périodes comptables.</p>}
        {periods.data && periods.data.length === 0 && (
          <EmptyState title="Aucune période" description="Le RAF ouvre la première période de l’exercice avant de comptabiliser." />
        )}
        {periods.data && periods.data.length > 0 && (
          <PeriodTable
            rows={periods.data}
            canClose={hasP2pRole(role, 'paiementApprobation')}
            onClosed={() => void client.invalidateQueries({ queryKey: ['p2p-periods'] })}
          />
        )}
        {hasP2pRole(role, 'comptabiliteEcriture') && (
          <OpenPeriodForm
            societeId={societeId}
            onOpened={() => void client.invalidateQueries({ queryKey: ['p2p-periods'] })}
          />
        )}
      </section>
      {hasP2pRole(role, 'comptabiliteEcriture') && (
        <section className="panel p2p-section">
          <div className="dash-panel-head">
            <div>
              <h2>Ouverture d’exercice</h2>
              <p className="lead">
                Le RAF ouvre l’année : 12 périodes mensuelles, journaux et modèles
                clonés depuis l’exercice précédent. Sans exercice ouvert, aucune
                pièce ne passe.
              </p>
            </div>
          </div>
          {exercicesQuery.data && exercicesQuery.data.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exercice</th>
                    <th>Périodes</th>
                    <th>Journaux</th>
                    <th>Pièces</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {exercicesQuery.data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row._count.periodes}</td>
                      <td>{row._count.journaux}</td>
                      <td>{row._count.ecritures}</td>
                      <td>{row.cloture ? 'Clôturé' : 'Ouvert'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OpenExerciceForm
            societeId={societeId}
            suggestedCode={String(new Date().getUTCFullYear())}
            onOpened={() => {
              void client.invalidateQueries({ queryKey: ['p2p-periods'] });
              void client.invalidateQueries({ queryKey: ['p2p-exercices'] });
            }}
          />
        </section>
      )}
      {hasP2pRole(role, 'paiementApprobation') && exercices.length > 0 && (
        <section className="panel p2p-section">
          <div className="dash-panel-head">
            <div>
              <h2>
                Clôture d’exercice <InfoTooltip insight={insightClotureExercice()} />
              </h2>
              <p className="lead">
                Le DAF solde les classes 6 et 7 sur le compte 13, reporte les classes 1 à 5 en
                à-nouveaux, puis ouvre l’exercice suivant. Irréversible.
              </p>
            </div>
          </div>
          {closeError && <p role="alert">{closeError}</p>}
          <div className="p2p-action-grid">
            {exercices
              .filter((row) => !row.cloture)
              .map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="btn-primary"
                  disabled={closingId === row.id}
                  onClick={() => {
                    setClosingId(row.id);
                    setCloseError(null);
                    void p2pApi
                      .closeExercice(row.id, societeId, operationId())
                      .then(() => {
                        void client.invalidateQueries({ queryKey: ['p2p-periods'] });
                        void client.invalidateQueries({ queryKey: ['p2p-exercices'] });
                      })
                      .catch((err: unknown) => {
                        setCloseError(messageDepuisApi(err, 'Clôture d’exercice refusée.'));
                      })
                      .finally(() => setClosingId(null));
                  }}
                >
                  Clôturer l’exercice {row.code}
                </button>
              ))}
          </div>
          {exercices.every((row) => row.cloture) && (
            <p className="lead">Tous les exercices affichés sont déjà clôturés.</p>
          )}
        </section>
      )}
    </>
  );
}

export function ComptaBanquePanel({
  societe,
  role,
}: {
  societe?: SocieteDto;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [compteId, setCompteId] = useState('');
  const [vue, setVue] = useState<'lignes' | 'mouvements' | 'imports'>('lignes');
  const [q, setQ] = useState('');
  const accounts = useQuery({
    queryKey: ['p2p-treasury', societe?.id],
    queryFn: () => p2pApi.treasuryAccounts(societe!.id),
    enabled: Boolean(societe?.id),
  });
  const selected = compteId || accounts.data?.[0]?.id || '';
  const unmatched = useQuery({
    queryKey: ['p2p-unmatched-bank', societe?.id, selected],
    queryFn: () => p2pApi.unmatchedBank(societe!.id, selected),
    enabled: Boolean(societe?.id && selected),
  });
  const imports = useQuery({
    queryKey: ['p2p-bank-imports', societe?.id, selected],
    queryFn: () => p2pApi.bankImports(societe!.id, selected),
    enabled: Boolean(societe?.id && selected),
  });

  const lignes = unmatched.data?.lignes ?? [];
  const mouvements = unmatched.data?.mouvements ?? [];
  const importRows = imports.data ?? [];
  const ligneMt = useMemo(
    () => lignes.reduce((s, r) => s + Math.abs(Number(r.montant) || 0), 0),
    [lignes],
  );
  const mvtMt = useMemo(
    () => mouvements.reduce((s, r) => s + Math.abs(Number(r.montant) || 0), 0),
    [mouvements],
  );
  const suggestedMouvementIds = useMemo(
    () => new Set(lignes.map((row) => row.mouvementSuggereId).filter((id): id is string => Boolean(id))),
    [lignes],
  );
  const needle = q.trim().toLowerCase();
  const lignesFiltrees = useMemo(() => {
    if (!needle) return lignes;
    return lignes.filter(
      (r) =>
        r.libelle.toLowerCase().includes(needle) ||
        r.importReleve.nomFichier.toLowerCase().includes(needle) ||
        String(r.montant).includes(needle),
    );
  }, [lignes, needle]);
  const mouvementsFiltres = useMemo(() => {
    if (!needle) return mouvements;
    return mouvements.filter(
      (r) =>
        (r.reference ?? '').toLowerCase().includes(needle) ||
        r.sens.toLowerCase().includes(needle) ||
        String(r.montant).includes(needle),
    );
  }, [mouvements, needle]);

  return (
    <>
      <ComptaWhy>
        Le <strong>rapprochement</strong> vérifie qu’un paiement déjà exécuté apparaît bien sur le
        relevé banque / mobile money, au même montant et la même devise. Ce n’est pas le circuit
        de versement boutique → centrale (app Trésorerie).{' '}
        <InfoTooltip insight={insightBanque()} />
      </ComptaWhy>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Relevé et lettrage banque <InfoTooltip insight={insightBanque()} />
            </h2>
            <p className="lead">
              Sélectionnez le compte, importez le CSV, puis rapprochez. Une suggestion
              apparaît quand le montant et la devise correspondent à un mouvement non lettré.
            </p>
          </div>
          <label>
            Compte
            <select
              aria-label="Compte de trésorerie"
              value={selected}
              onChange={(e) => setCompteId(e.target.value)}
            >
              {(accounts.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.libelle} ({row.compteComptable.numero})
                </option>
              ))}
            </select>
          </label>
        </div>
        <section className="kpi-grid dash-kpi-grid">
          <article
            className={`kpi-card dash-kpi${vue === 'imports' ? ' actif' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setVue('imports')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setVue('imports');
              }
            }}
          >
            <div className="kpi-label">Imports</div>
            <div className="kpi-value">{importRows.length}</div>
            <div className="kpi-hint">
              {importRows[0]
                ? `Dernier : ${importRows[0].nomFichier}`
                : 'Aucun relevé importé'}
            </div>
          </article>
          <article
            className={`kpi-card dash-kpi${vue === 'lignes' ? ' actif' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setVue('lignes')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setVue('lignes');
              }
            }}
          >
            <div className="kpi-label">
              Lignes relevé <InfoTooltip insight={insightBanqueLignes(lignes.length, ligneMt)} />
            </div>
            <div className="kpi-value">{lignes.length}</div>
            <div className="kpi-hint">
              {lignes.length > 0 ? fmtFcfa(ligneMt) : 'Tout lettré ou rien importé'}
            </div>
          </article>
          <article
            className={`kpi-card dash-kpi${vue === 'mouvements' ? ' actif' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setVue('mouvements')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setVue('mouvements');
              }
            }}
          >
            <div className="kpi-label">
              Mouvements <InfoTooltip insight={insightBanqueMouvements(mouvements.length, mvtMt)} />
            </div>
            <div className="kpi-value">{mouvements.length}</div>
            <div className="kpi-hint">
              {mouvements.length > 0 ? fmtFcfa(mvtMt) : 'Aucun paiement à lettrer'}
            </div>
          </article>
        </section>
        <div className="p2p-action-grid">
          {hasP2pRole(role, 'comptabiliteEcriture') && (
            <>
              <button type="button" className="btn-primary" onClick={() => setAction('releve')}>
                Importer un relevé
              </button>
              <button
                type="button"
                onClick={() => setAction('rapprochement')}
                disabled={lignes.length === 0 || mouvements.length === 0}
              >
                Rapprocher une ligne
              </button>
            </>
          )}
          <Link className="btn btn-secondary" to="/finance/comptabilite?rapport=paiements">
            Lots de paiement
          </Link>
        </div>
        {!hasP2pRole(role, 'comptabiliteEcriture') && (
          <p className="lead">Lecture seule : seul le RAF importe et rapproche les relevés.</p>
        )}
      </section>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              {vue === 'lignes' && 'Lignes de relevé non rapprochées'}
              {vue === 'mouvements' && 'Mouvements de trésorerie non rapprochés'}
              {vue === 'imports' && 'Historique des imports'}
            </h2>
            <p className="lead">
              Compte sélectionné · filtrez ou rapprochez depuis les actions ci-dessus.
            </p>
          </div>
          {vue !== 'imports' && (
            <label className="compta-paiements-search">
              Rechercher
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={vue === 'lignes' ? 'Libellé, fichier, montant…' : 'Référence, sens, montant…'}
                aria-label="Rechercher dans le rapprochement"
              />
            </label>
          )}
        </div>
        <nav className="compta-journal-chips" aria-label="Vue rapprochement">
          <button
            type="button"
            className={vue === 'lignes' ? 'actif' : undefined}
            onClick={() => setVue('lignes')}
          >
            Lignes · {lignes.length}
          </button>
          <button
            type="button"
            className={vue === 'mouvements' ? 'actif' : undefined}
            onClick={() => setVue('mouvements')}
          >
            Mouvements · {mouvements.length}
          </button>
          <button
            type="button"
            className={vue === 'imports' ? 'actif' : undefined}
            onClick={() => setVue('imports')}
          >
            Imports · {importRows.length}
          </button>
        </nav>
        {unmatched.isLoading && vue !== 'imports' && (
          <LoadingState label="Chargement des lignes…" />
        )}
        {vue === 'lignes' && !unmatched.isLoading && lignesFiltrees.length === 0 && (
          <EmptyState
            title="Aucune ligne"
            description={
              needle
                ? 'Aucun résultat pour cette recherche.'
                : 'Importez un relevé ou tout est déjà lettré.'
            }
          />
        )}
        {vue === 'lignes' && lignesFiltrees.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Fichier</th>
                  <th>Montant</th>
                  <th>Lettrage</th>
                </tr>
              </thead>
              <tbody>
                {lignesFiltrees.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.dateOperation)}</td>
                    <td>{row.libelle}</td>
                    <td>{row.importReleve.nomFichier}</td>
                    <td className="money">
                      {fmtFcfa(row.montant)} {row.devise}
                    </td>
                    <td>
                      {row.mouvementSuggereId ? (
                        <span className="badge badge-ok">Montant identique</span>
                      ) : (
                        <span className="muted">À choisir</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vue === 'mouvements' && !unmatched.isLoading && mouvementsFiltres.length === 0 && (
          <EmptyState
            title="Aucun mouvement"
            description={
              needle
                ? 'Aucun résultat pour cette recherche.'
                : 'Les paiements exécutés apparaîtront ici.'
            }
          />
        )}
        {vue === 'mouvements' && mouvementsFiltres.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date valeur</th>
                  <th>Sens</th>
                  <th>Référence</th>
                  <th>Montant</th>
                  <th>Lettrage</th>
                </tr>
              </thead>
              <tbody>
                {mouvementsFiltres.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.dateValeur)}</td>
                    <td>{row.sens}</td>
                    <td>{row.reference ?? '—'}</td>
                    <td className="money">
                      {fmtFcfa(row.montant)} {row.devise}
                    </td>
                    <td>
                      {suggestedMouvementIds.has(row.id) ? (
                        <span className="badge badge-ok">Montant identique</span>
                      ) : (
                        <span className="muted">À choisir</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vue === 'imports' && imports.isLoading && (
          <LoadingState label="Chargement des imports…" />
        )}
        {vue === 'imports' && !imports.isLoading && importRows.length === 0 && (
          <EmptyState title="Aucun import" description="Importez un relevé CSV pour démarrer." />
        )}
        {vue === 'imports' && importRows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fichier</th>
                  <th>Compte</th>
                  <th>Lignes</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.dateImport)}</td>
                    <td>{row.nomFichier}</td>
                    <td>
                      {row.compte.code} · {row.compte.libelle}
                    </td>
                    <td>{row._count.lignes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {action && (
        <AccountingActionModal
          action={action}
          societe={societe}
          role={role}
          proposals={[]}
          treasuryAccountId={selected}
          onClose={() => {
            setAction(null);
            void client.invalidateQueries({ queryKey: ['p2p-unmatched-bank'] });
            void client.invalidateQueries({ queryKey: ['p2p-bank-imports'] });
          }}
        />
      )}
    </>
  );
}

function PaymentProposalTable({
  rows,
  onSelect,
  selectedId,
}: {
  rows: PaymentProposal[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lot</th>
            <th>Date prévue</th>
            <th>Compte</th>
            <th>Fournisseurs</th>
            <th>Montant</th>
            <th>Étape</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fournisseurs = [
              ...new Set(row.allocations.map((a) => a.facture.fournisseur.nom)),
            ].join(', ');
            return (
              <tr key={row.id} className={selectedId === row.id ? 'p2p-best-row' : undefined}>
                <td>
                  <strong>{row.numero}</strong>
                  <small>
                    {row.preparateur.prenom} {row.preparateur.nom} · {row.allocations.length}{' '}
                    facture(s)
                  </small>
                </td>
                <td>{fmtDate(row.dateExecutionPrevue)}</td>
                <td>
                  {row.compteTresorerie.code} · {row.compteTresorerie.libelle}
                </td>
                <td>{fournisseurs || '—'}</td>
                <td className="money">
                  {fmtFcfa(row.montant)} {row.devise}
                </td>
                <td>
                  <span className={`badge ${badgeProposition(row.statut)}`}>
                    {labelStatutProposition(row.statut)}
                  </span>{' '}
                  <InfoTooltip insight={insightStatutProposition(row.statut)} />
                </td>
                <td>
                  <button type="button" onClick={() => onSelect(row.id)}>
                    Détail
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PeriodTable({
  rows,
  canClose,
  onClosed,
}: {
  rows: AccountingPeriod[];
  canClose: boolean;
  onClosed: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="table-wrap">
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Période</th>
            <th>Exercice</th>
            <th>Du</th>
            <th>Au</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono">{row.code}</td>
              <td>{row.exercice.code}</td>
              <td>{fmtDate(row.dateDebut)}</td>
              <td>{fmtDate(row.dateFin)}</td>
              <td>
                <span className={row.cloture ? 'badge' : 'badge badge-ok'}>
                  {row.cloture ? 'Clôturée — plus d’écritures' : 'Ouverte — on peut comptabiliser'}
                </span>
              </td>
              <td>
                {canClose && !row.cloture && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => {
                      setBusyId(row.id);
                      setError(null);
                      void p2pApi
                        .closePeriod(row.id)
                        .then(onClosed)
                        .catch((err: unknown) => {
                          setError(messageDepuisApi(err, 'Clôture refusée.'));
                        })
                        .finally(() => setBusyId(null));
                    }}
                  >
                    Clôturer
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenExerciceForm({
  societeId,
  suggestedCode,
  onOpened,
}: {
  societeId: string;
  suggestedCode: string;
  onOpened: () => void;
}) {
  const [code, setCode] = useState(suggestedCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="p2p-inline-fields"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void p2pApi
          .openExercice({
            societeId,
            code,
            clientOperationId: operationId(),
          })
          .then(() => onOpened())
          .catch((err: unknown) =>
            setError(messageDepuisApi(err, 'Ouverture d’exercice refusée.')),
          )
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Année
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="2027"
          required
          minLength={4}
          maxLength={4}
          inputMode="numeric"
          pattern="\d{4}"
        />
      </label>
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? 'Ouverture…' : 'Ouvrir l’exercice'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function OpenPeriodForm({ societeId, onOpened }: { societeId: string; onOpened: () => void }) {
  const [code, setCode] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="p2p-inline-fields"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void p2pApi
          .openPeriod({ societeId, code, dateDebut: debut, dateFin: fin })
          .then(() => {
            setCode('');
            onOpened();
          })
          .catch((err: unknown) => setError(messageDepuisApi(err, 'Ouverture refusée.')))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2026-09" required minLength={4} maxLength={12} />
      </label>
      <label>
        Début
        <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
      </label>
      <label>
        Fin
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
      </label>
      <button type="submit" disabled={busy}>
        Ouvrir la période
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function AccountingActionModal({
  action,
  societe,
  role,
  proposals,
  treasuryAccountId,
  onClose,
}: {
  action: Action;
  societe?: SocieteDto;
  role?: RoleLibelle;
  proposals: PaymentProposal[];
  treasuryAccountId?: string;
  onClose: () => void;
}) {
  const [id, setId] = useState('');
  const [accountId, setAccountId] = useState(treasuryAccountId ?? '');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('VIREMENT');
  const [reference, setReference] = useState('');
  const [lineId, setLineId] = useState('');
  const [movementId, setMovementId] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvLines, setCsvLines] = useState<ParsedBankStatementLine[]>([]);
  const factures = useQuery({
    queryKey: ['achats-factures'],
    queryFn: () => apiFetch<FactureFournisseurDto[]>('/achats/factures'),
    enabled: action === 'proposition',
  });
  const treasury = useQuery({
    queryKey: ['p2p-treasury', societe?.id],
    queryFn: () => p2pApi.treasuryAccounts(societe!.id),
    enabled: Boolean(societe?.id) && (action === 'proposition' || action === 'releve' || action === 'rapprochement'),
  });
  const unmatched = useQuery({
    queryKey: ['p2p-unmatched-bank', societe?.id, accountId],
    queryFn: () => p2pApi.unmatchedBank(societe!.id, accountId),
    enabled: action === 'rapprochement' && Boolean(societe?.id && accountId),
  });
  useEffect(() => {
    if (action !== 'rapprochement' || !unmatched.data?.lignes.length) return;
    const first = unmatched.data.lignes[0];
    setLineId((prev) => prev || first.id);
  }, [action, unmatched.data]);
  useEffect(() => {
    if (!lineId || !unmatched.data) return;
    const line = unmatched.data.lignes.find((row) => row.id === lineId);
    if (line?.mouvementSuggereId) setMovementId(line.mouvementSuggereId);
  }, [lineId, unmatched.data]);
  const mutation = useMutation({
    mutationFn: async () => {
      const op = operationId();
      if (action === 'proposition') {
        return apiFetch('/achats/comptabilite/paiements/propositions', {
          method: 'POST',
          body: JSON.stringify({
            societeId: societe?.id,
            compteTresorerieId: accountId,
            mode,
            devise: societe?.devise ?? 'XOF',
            dateExecutionPrevue: isoDate(1),
            referenceInstruction: reference || undefined,
            clientOperationId: op,
            allocations: [{ factureId: invoiceId, montant: Number(amount) }],
          }),
        });
      }
      if (action === 'approbation') {
        const exception = role === 'DIRECTION_GENERALE';
        const challenge = await p2pApi.reauth(
          password,
          exception ? 'P2P_PAYMENT_EXCEPTION_APPROVE' : 'P2P_PAYMENT_APPROVE',
        );
        return apiFetch(
          `/achats/comptabilite/paiements/propositions/${id}/${exception ? 'approuver-exception' : 'approuver'}`,
          {
            method: 'POST',
            body: JSON.stringify({ clientOperationId: op, challengeId: challenge.challengeId }),
          },
        );
      }
      if (action === 'execution') {
        const challenge = await p2pApi.reauth(password, 'P2P_PAYMENT_EXECUTE');
        return apiFetch(`/achats/comptabilite/paiements/propositions/${id}/executer`, {
          method: 'POST',
          body: JSON.stringify({
            clientOperationId: op,
            challengeId: challenge.challengeId,
            reference: reference || undefined,
          }),
        });
      }
      if (action === 'rapprochement') {
        return apiFetch(`/achats/comptabilite/releves/lignes/${lineId}/rapprocher`, {
          method: 'POST',
          body: JSON.stringify({ mouvementId: movementId, clientOperationId: op }),
        });
      }
      return apiFetch('/achats/comptabilite/releves/imports', {
        method: 'POST',
        body: JSON.stringify({
          societeId: societe?.id,
          compteTresorerieId: accountId,
          nomFichier: reference,
          hashSha256: id,
          format: 'CSV',
          clientOperationId: op,
          lignes: csvLines.map((line) => ({
            ...line,
            devise: societe?.devise ?? line.devise,
          })),
        }),
      });
    },
    onSuccess: (data) => {
      setPassword('');
      setResult(data);
      setError(null);
    },
    onError: (err) => {
      setPassword('');
      setError(messageDepuisApi(err, 'Action comptable refusée.'));
    },
  });
  const titles = {
    proposition: 'Préparer une proposition',
    approbation: 'Approuver une proposition',
    execution: 'Exécuter un paiement',
    releve: 'Importer un relevé',
    rapprochement: 'Rapprocher une ligne',
  };
  if (result) {
    return (
      <Modal open title={titles[action]} onClose={onClose}>
        <div role="status" className="p2p-success">
          <strong>Action enregistrée.</strong>
          <p>L’étape suivante du circuit apparaît dans la liste des lots.</p>
        </div>
        <button className="btn-primary" type="button" onClick={onClose}>
          Fermer
        </button>
      </Modal>
    );
  }
  return (
    <Modal open title={titles[action]} onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {(action === 'approbation' || action === 'execution') && (
          <label>
            Proposition
            <select value={id} onChange={(e) => setId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {proposals
                .filter((proposal) =>
                  action === 'execution'
                    ? proposal.statut === 'APPROUVEE_EXCEPTION'
                    : role === 'DIRECTION_GENERALE'
                      ? proposal.statut === 'APPROUVEE'
                      : proposal.statut === 'PREPAREE',
                )
                .map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>
                    {proposal.numero} · {fmtFcfa(proposal.montant)} · {labelStatutProposition(proposal.statut)}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(action === 'proposition' || action === 'releve' || action === 'rapprochement') && (
          <label>
            Compte de trésorerie
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {(treasury.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.libelle} ({row.compteComptable.numero})
                </option>
              ))}
            </select>
          </label>
        )}
        {action === 'proposition' && (
          <>
            <label>
              Facture
              <select
                value={invoiceId}
                onChange={(e) => {
                  setInvoiceId(e.target.value);
                  const f = factures.data?.find((x) => x.id === e.target.value);
                  if (f) setAmount(f.resteAPayer);
                }}
                required
              >
                <option value="">Sélectionner…</option>
                {(factures.data ?? [])
                  .filter((f) => ['COMPTABILISEE', 'PARTIELLEMENT_PAYEE'].includes(f.statut))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.numero} — {f.fournisseur.nom} — {fmtFcfa(f.resteAPayer)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="VIREMENT">Virement</option>
                <option value="CHEQUE">Chèque</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="CAISSE_CENTRALE">Caisse centrale</option>
                <option value="LETTRE_CREDIT">Lettre de crédit</option>
              </select>
            </label>
          </>
        )}
        {action === 'proposition' && (
          <label>
            Montant
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
        )}
        {action === 'releve' && (
          <>
            <label>
              Fichier relevé CSV
              <input
                type="file"
                accept=".csv,text/csv,.txt"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setCsvLines([]);
                  if (!file) return;
                  setReference(file.name);
                  void (async () => {
                    const buffer = await file.arrayBuffer();
                    const digest = await crypto.subtle.digest('SHA-256', buffer);
                    const hex = [...new Uint8Array(digest)]
                      .map((byte) => byte.toString(16).padStart(2, '0'))
                      .join('');
                    setId(hex);
                    const text = new TextDecoder().decode(buffer);
                    try {
                      setCsvLines(parseBankStatementCsv(text, societe?.devise ?? 'XOF'));
                      setError(null);
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Le fichier CSV n’a pas pu être lu.',
                      );
                    }
                  })();
                }}
              />
            </label>
            {csvLines.length > 0 && (
              <p className="lead" role="status">
                {csvLines.length} ligne(s) lue(s) — {csvLines[0].dateOperation} →{' '}
                {csvLines[csvLines.length - 1].dateOperation}
              </p>
            )}
            <label>
              Nom du fichier
              <input value={reference} onChange={(e) => setReference(e.target.value)} required />
            </label>
            <label>
              Empreinte SHA-256
              <input minLength={64} maxLength={64} value={id} onChange={(e) => setId(e.target.value)} required />
            </label>
          </>
        )}
        {action === 'execution' && (
          <label>
            Référence bancaire
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        {(action === 'approbation' || action === 'execution') && (
          <>
            <p className="p2p-contract-note">
              Confirmez avec votre mot de passe actuel. Le challenge est valable deux minutes et
              consommé une seule fois.
            </p>
            <label>
              Mot de passe actuel
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </>
        )}
        {action === 'rapprochement' && (
          <>
            <label>
              Ligne de relevé
              <select value={lineId} onChange={(e) => setLineId(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {(unmatched.data?.lignes ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {fmtDate(row.dateOperation)} · {row.libelle} · {fmtFcfa(row.montant)}
                    {row.mouvementSuggereId ? ' · suggéré' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mouvement de trésorerie
              <select value={movementId} onChange={(e) => setMovementId(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {(unmatched.data?.mouvements ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {fmtDate(row.dateValeur)} · {row.sens} · {fmtFcfa(row.montant)}
                    {row.reference ? ` · ${row.reference}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="table-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            type="submit"
            disabled={mutation.isPending || (action === 'releve' && csvLines.length === 0)}
          >
            {mutation.isPending ? 'Traitement…' : 'Confirmer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
