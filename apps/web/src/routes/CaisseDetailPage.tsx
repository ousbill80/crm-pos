import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Landmark, Monitor, Printer, Store } from 'lucide-react';
import {
  RoleLibelle,
  StatutSessionCaisse,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { PosShortcutLink } from '../components/PosShortcutLink';
import { insightSoldeCaisse, insightTypeCaisse } from '../lib/insights/caisses';
import { insightStatutTransaction } from '../lib/insights/transactions';
import type {
  BoutiqueDto,
  CaisseDto,
  MouvementCaisseDto,
  SessionCaisseDto,
  TransactionDto,
} from '../lib/types';
import { libellesEtatCaisse } from '../lib/etat-caisse';

const ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const STATUT_TX: Record<string, string> = {
  [StatutTransaction.INITIEE]: 'Initiée',
  [StatutTransaction.EN_TRANSIT]: 'En transit',
  [StatutTransaction.RECEPTIONNEE]: 'Réceptionnée',
  [StatutTransaction.VALIDEE]: 'Validée',
  [StatutTransaction.LITIGE]: 'Litige',
};

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function labelCaisse(c: CaisseDto): string {
  if (c.type === TypeCaisse.TIROIR) return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  if (c.type === TypeCaisse.MAGASIN) return c.libelle ?? 'Caisse magasin';
  return c.libelle ?? 'Caisse centrale';
}

function typeLabel(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'Centrale';
  if (type === TypeCaisse.MAGASIN) return 'Magasin';
  if (type === TypeCaisse.TIROIR) return 'Tiroir';
  return String(type);
}

function typeBadgeClass(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'badge badge-info';
  if (type === TypeCaisse.MAGASIN) return 'badge badge-ok';
  return 'badge badge-neutral';
}

function TypeIcon({ type }: { type: string }) {
  if (type === TypeCaisse.CENTRALE) return <Landmark size={28} />;
  if (type === TypeCaisse.MAGASIN) return <Store size={28} />;
  return <Monitor size={28} />;
}

function labelTypeTx(type: string): string {
  if (type === TypeTransaction.VENTE) return 'Encaissement';
  if (type === TypeTransaction.SORTIE_FONDS) return 'Versement / sortie';
  if (type === TypeTransaction.TRANSFERT_INTERNE) return 'Transfert interne';
  return type;
}

function badgeStatutTx(statut: string): string {
  if (statut === StatutTransaction.VALIDEE) return 'badge badge-ok';
  if (statut === StatutTransaction.LITIGE) return 'badge badge-critical';
  if (statut === StatutTransaction.EN_TRANSIT) return 'badge badge-warning';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'badge badge-info';
  return 'badge badge-neutral';
}

function CircuitPosition({ type }: { type: string }) {
  const etapes: Array<{ id: TypeCaisse; label: string }> = [
    { id: TypeCaisse.TIROIR, label: 'Tiroir' },
    { id: TypeCaisse.MAGASIN, label: 'Magasin' },
    { id: TypeCaisse.CENTRALE, label: 'Centrale' },
  ];
  return (
    <ol className="caisses-circuit" aria-label="Position dans le circuit">
      {etapes.map((e, i) => (
        <li key={e.id} className={e.id === type ? 'is-current' : undefined}>
          {i > 0 ? (
            <span className="caisses-circuit-arrow" aria-hidden>
              →
            </span>
          ) : null}
          <span>{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

function sousTitreRole(type: string): string {
  if (type === TypeCaisse.CENTRALE) {
    return 'Réceptionne et valide les versements magasin — Caissier central / DAF.';
  }
  if (type === TypeCaisse.MAGASIN) {
    return 'Reçoit les clôtures de tiroirs. Initie les versements vers la centrale.';
  }
  return 'Encaisse les ventes. À la clôture, transfert interne vers le magasin.';
}

export function CaisseDetailPage() {
  const { caisseId } = useParams<{ caisseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const [ligneId, setLigneId] = useState<string | null>(null);

  const caisseQ = useQuery({
    queryKey: ['caisses', caisseId],
    queryFn: () => apiFetch<CaisseDto>(`/caisses/${caisseId}`),
    enabled: peutLire && Boolean(caisseId),
  });
  const soldeQ = useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () => apiFetch<{ caisseId: string; solde: string }>(`/caisses/${caisseId}/solde`),
    enabled: peutLire && Boolean(caisseId),
  });
  const mvtsQ = useQuery({
    queryKey: ['caisses', caisseId, 'mouvements'],
    queryFn: () => apiFetch<MouvementCaisseDto[]>(`/caisses/${caisseId}/mouvements`),
    enabled: peutLire && Boolean(caisseId),
  });
  const txQ = useQuery({
    queryKey: ['transactions', { caisseId }],
    queryFn: () => apiFetch<TransactionDto[]>(`/transactions?caisseId=${caisseId}`),
    enabled: peutLire && Boolean(caisseId),
  });
  const sessionsQ = useQuery({
    queryKey: ['ventes', 'sessions'],
    queryFn: () => apiFetch<SessionCaisseDto[]>('/ventes/sessions'),
    enabled: peutLire && Boolean(caisseId),
  });
  const caissesQ = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled: peutLire,
  });
  const boutiquesQ = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: peutLire,
  });

  const c = caisseQ.data;
  const nomBoutique = c?.boutiqueId
    ? (boutiquesQ.data?.find((b) => b.id === c.boutiqueId)?.nom ?? 'Boutique')
    : 'Réseau';

  const tiroirsBoutique = useMemo(() => {
    if (!c?.boutiqueId) return [];
    return (caissesQ.data ?? []).filter(
      (x) => x.boutiqueId === c.boutiqueId && x.type === TypeCaisse.TIROIR,
    );
  }, [caissesQ.data, c?.boutiqueId]);

  const sessions = useMemo(() => {
    const all = sessionsQ.data ?? [];
    if (!caisseId || !c) return [];
    if (c.type === TypeCaisse.TIROIR) {
      return all.filter((s) => s.caisseId === caisseId);
    }
    if (c.type === TypeCaisse.MAGASIN) {
      const ids = new Set(tiroirsBoutique.map((t) => t.id));
      return all.filter((s) => ids.has(s.caisseId));
    }
    return [];
  }, [sessionsQ.data, caisseId, c, tiroirsBoutique]);

  const sessionsOuvertes = sessions.filter((s) => s.statut === StatutSessionCaisse.OUVERTE);
  const caSessions = sessions.reduce((n, s) => n + Number(s.caSession ?? 0), 0);
  const ticketsSessions = sessions.reduce((n, s) => n + (s.nombreVentes ?? 0), 0);

  const pipeline = useMemo(
    () => (txQ.data ?? []).filter((t) => t.statut !== StatutTransaction.VALIDEE),
    [txQ.data],
  );
  const ligne = (mvtsQ.data ?? []).find((m) => m.id === ligneId) ?? null;
  const soldeNum = Number(soldeQ.data?.solde);

  if (!caisseId) return <p role="alert">Caisse introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux caisses.</p>;
  if (caisseQ.isLoading) return <LoadingState label="Chargement de la caisse..." />;
  if (caisseQ.isError || !c) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/caisses')}>
          ← Caisses
        </button>
        <p role="alert">Impossible de charger cette caisse (introuvable ou hors périmètre).</p>
      </div>
    );
  }

  const montreSessions = c.type !== TypeCaisse.CENTRALE;

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/caisses')}>
          ← Caisses
        </button>
        <div className="client-workspace-toolbar-actions">
          {c.type === TypeCaisse.CENTRALE ? (
            <Link className="btn-secondary" to="/transactions?enCours=1">
              Versements en cours
            </Link>
          ) : null}
          {c.type === TypeCaisse.MAGASIN ? (
            <Link className="btn-primary" to={`/transactions?caisseId=${c.id}`}>
              Versements
            </Link>
          ) : null}
          {c.type === TypeCaisse.TIROIR ? (
            <PosShortcutLink label="Ouvrir le POS" hint="Caisse ouverte · encaissement" compact />
          ) : null}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          <TypeIcon type={c.type} />
        </div>
        <div className="client-workspace-hero-main">
          <h1>{labelCaisse(c)}</h1>
          <p className="client-workspace-hero-sub">{sousTitreRole(c.type)}</p>
          <div className="client-workspace-chips">
            <span className={typeBadgeClass(c.type)}>{typeLabel(c.type)}</span>
            <InfoTooltip insight={insightTypeCaisse(c.type)} />
            {c.actif === false ? <span className="badge badge-warning">Inactif</span> : null}
            {sessionsOuvertes.length > 0 ? (
              <span className="badge badge-ok">
                {sessionsOuvertes.length} session{sessionsOuvertes.length > 1 ? 's' : ''} ouverte
                {sessionsOuvertes.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
          <CircuitPosition type={c.type} />
          <div className="client-workspace-meta">
            <span>
              <strong>Périmètre</strong> {nomBoutique}
            </span>
            {c.code ? (
              <span>
                <strong>Code</strong> {c.code}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Solde <InfoTooltip insight={insightSoldeCaisse(c.type)} />
          </div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {soldeQ.isLoading ? '…' : soldeQ.isError ? '—' : formatFcfa(soldeQ.data?.solde)}
          </div>
          <div className="client-kpi-hint">
            {soldeQ.isLoading
              ? 'Calcul depuis le grand livre'
              : soldeNum === 0
                ? 'Aucune écriture validée'
                : 'Recalculé — jamais stocké'}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Écritures validées</div>
          <div className="client-kpi-value">{mvtsQ.data?.length ?? '…'}</div>
          <div className="client-kpi-hint">grand livre append-only</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">En cours §6.4</div>
          <div className="client-kpi-value">{txQ.isLoading ? '…' : pipeline.length}</div>
          <div className="client-kpi-hint">lecture — validation sur la fiche transaction</div>
        </article>
        {montreSessions ? (
          <article className="client-kpi-card">
            <div className="client-kpi-label">
              {c.type === TypeCaisse.MAGASIN ? 'Sessions des tiroirs' : 'Sessions POS'}
            </div>
            <div className="client-kpi-value">{sessionsQ.isLoading ? '…' : sessions.length}</div>
            <div className="client-kpi-hint">
              {ticketsSessions} ticket{ticketsSessions > 1 ? 's' : ''} · {formatFcfa(caSessions)}
            </div>
          </article>
        ) : (
          <article className="client-kpi-card">
            <div className="client-kpi-label">Sessions POS</div>
            <div className="client-kpi-value">—</div>
            <div className="client-kpi-hint">sur les tiroirs boutique, pas ici</div>
          </article>
        )}
      </div>

      {montreSessions ? (
        <section className="client-workspace-section">
          <h2>
            {c.type === TypeCaisse.MAGASIN ? 'Sessions POS des tiroirs' : 'Sessions POS'}
          </h2>
          {sessionsQ.isLoading ? (
            <LoadingState label="Chargement des sessions..." />
          ) : sessions.length === 0 ? (
            <p className="lead">
              {c.type === TypeCaisse.MAGASIN
                ? tiroirsBoutique.length === 0
                  ? 'Aucun tiroir rattaché à ce magasin.'
                  : 'Aucune session ouverte ou clôturée sur les tiroirs de ce magasin.'
                : 'Aucune session sur ce tiroir. L’ouverture se fait depuis le POS (§5.1).'}
            </p>
          ) : (
            <>
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {c.type === TypeCaisse.MAGASIN ? <th>Tiroir</th> : null}
                      <th>Ouverture</th>
                      <th>Statut</th>
                      <th>Tickets</th>
                      <th>CA</th>
                      <th>Fond initial</th>
                      <th>Fond compté</th>
                      <th>Clôture</th>
                      <th>Impression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => {
                      const tiroir = tiroirsBoutique.find((t) => t.id === s.caisseId);
                      const ouverte = s.statut === StatutSessionCaisse.OUVERTE;
                      const lib = libellesEtatCaisse(ouverte ? 'X' : 'Z');
                      return (
                        <tr key={s.id}>
                          {c.type === TypeCaisse.MAGASIN ? (
                            <td>
                              {tiroir ? (
                                <Link to={`/caisses/${tiroir.id}`}>{labelCaisse(tiroir)}</Link>
                              ) : (
                                <code>{s.caisseId.slice(0, 8)}…</code>
                              )}
                            </td>
                          ) : null}
                          <td>{new Date(s.ouvertureDateHeure).toLocaleString('fr-FR')}</td>
                          <td>
                            <span className={ouverte ? 'badge badge-ok' : 'badge badge-neutral'}>
                              {ouverte ? 'Ouverte' : 'Fermée'}
                            </span>
                          </td>
                          <td>{s.nombreVentes ?? 0}</td>
                          <td className="money">{formatFcfa(s.caSession)}</td>
                          <td className="money">{formatFcfa(s.fondInitial)}</td>
                          <td className="money">
                            {s.fondCompteCloture != null ? formatFcfa(s.fondCompteCloture) : '—'}
                          </td>
                          <td>
                            {s.clotureDateHeure
                              ? new Date(s.clotureDateHeure).toLocaleString('fr-FR')
                              : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-ghost"
                              title={lib.sousTitre}
                              onClick={() =>
                                void apiDownload(
                                  `/ventes/sessions/${s.id}/cloture/pdf`,
                                  `${ouverte ? 'releve-controle' : 'releve-cloture'}-${s.id}.pdf`,
                                )
                              }
                            >
                              <Printer size={14} />
                              {lib.boutonCourt}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="lead caisse-fiche-footnote">
                <strong>Contrôle</strong> : caisse encore ouverte, aperçu sans fermer.{' '}
                <strong>Clôture</strong> : session terminée. Fermer un tiroir crée un
                transfert interne vers le magasin — ce n’est pas la validation centrale.
              </p>
            </>
          )}
        </section>
      ) : null}

      {pipeline.length > 0 ? (
        <section className="client-workspace-section">
          <h2>Circuit en cours</h2>
          <p className="lead">
            Réceptionner ou rapprocher se fait sur la fiche transaction — jamais depuis cette
            caisse.
          </p>
          <ul className="caisse-pipeline">
            {pipeline.map((t) => (
              <li key={t.id}>
                <Link to={`/transactions/${t.id}`} className="caisse-pipeline-item">
                  <span className={badgeStatutTx(t.statut)}>
                    {STATUT_TX[t.statut] ?? t.statut}
                  </span>
                  <InfoTooltip insight={insightStatutTransaction(t.statut)} />
                  <span className="caisse-pipeline-type">{labelTypeTx(t.type)}</span>
                  <span className="money">{formatFcfa(t.montant)}</span>
                  <time dateTime={t.dateHeure}>
                    {new Date(t.dateHeure).toLocaleString('fr-FR')}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="client-workspace-section">
        <h2>
          <BookOpen size={16} /> Grand livre
        </h2>
        <p className="lead">Écritures VALIDÉES uniquement — append-only, aucune correction rétroactive.</p>
        {mvtsQ.isLoading ? (
          <LoadingState label="Chargement du grand livre..." />
        ) : mvtsQ.isError ? (
          <p role="alert">Impossible de charger les mouvements.</p>
        ) : (mvtsQ.data ?? []).length === 0 ? (
          <p className="lead">Aucune écriture validée pour l’instant.</p>
        ) : (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Écriture</th>
                  <th>Crédit</th>
                  <th>Débit</th>
                  <th>Solde après</th>
                </tr>
              </thead>
              <tbody>
                {[...(mvtsQ.data ?? [])].reverse().map((m) => (
                  <tr
                    key={m.id}
                    className={ligneId === m.id ? 'produit-row produit-row-selected' : 'produit-row'}
                    onClick={() => setLigneId((id) => (id === m.id ? null : m.id))}
                  >
                    <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
                    <td>
                      <strong>{m.libelle}</strong>
                      <div className="caisses-muted">{labelTypeTx(m.type)}</div>
                    </td>
                    <td className="money">{Number(m.credit) ? formatFcfa(m.credit) : ''}</td>
                    <td className="money">{Number(m.debit) ? formatFcfa(m.debit) : ''}</td>
                    <td className="money">{formatFcfa(m.soldeApres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ligne ? (
          <dl className="clients-dl">
            <div>
              <dt>Type</dt>
              <dd>{labelTypeTx(ligne.type)}</dd>
            </div>
            <div>
              <dt>Initiateur</dt>
              <dd>
                {ligne.initiateur.prenom} {ligne.initiateur.nom} ({ligne.initiateur.login})
              </dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>
                <Link to={`/transactions/${ligne.id}`}>Ouvrir la fiche</Link>
              </dd>
            </div>
          </dl>
        ) : mvtsQ.data && mvtsQ.data.length > 0 ? (
          <p className="lead">Cliquez une ligne pour l’initiateur et le lien transaction.</p>
        ) : null}
      </section>
    </div>
  );
}
