import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileSearch,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiFetch, messageDepuisApi } from '../lib/api';
import {
  AI_KIND_OPTIONS,
  AI_SOURCE_OPTIONS,
  labelFindingStatus,
  labelKind,
  labelProvider,
  labelRisk,
  labelSeverity,
  labelSource,
  labelWorkStatus,
  suggestionRows,
} from '../lib/accountingAiLabels';
import {
  hasP2pRole,
  p2pApi,
  type AiFinding,
  type AiPolicy,
  type AiSuggestion,
  type AiWorkItem,
} from '../lib/p2p';
import type { SocieteDto, UtilisateurDto } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';

type Dialog =
  | { type: 'decision'; suggestion: AiSuggestion }
  | { type: 'finding'; finding: AiFinding }
  | { type: 'policy' }
  | { type: 'approve-policy'; policyId?: string }
  | null;

type QueueFilter = '' | 'RAF_REVIEW' | 'AUTO_POST_ELIGIBLE';

export function AccountingAiPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState<QueueFilter>('');
  const [selected, setSelected] = useState<string | null>(null);
  const canAudit = hasP2pRole(user?.role, 'aiAudit');
  const societe = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: canAudit,
  });
  const dashboard = useQuery({
    queryKey: ['accounting-ai-dashboard', societe.data?.id],
    queryFn: () => p2pApi.aiDashboard(societe.data!.id),
    enabled: canAudit && Boolean(societe.data?.id),
  });
  const work = useQuery({
    queryKey: ['accounting-ai-work', societe.data?.id],
    queryFn: () => p2pApi.aiWork(societe.data!.id),
    enabled: canAudit && Boolean(societe.data?.id),
  });
  const findings = useQuery({
    queryKey: ['accounting-ai-findings', societe.data?.id],
    queryFn: () => p2pApi.aiFindings(societe.data!.id),
    enabled: canAudit && Boolean(societe.data?.id),
  });
  const policies = useQuery({
    queryKey: ['accounting-ai-policies', societe.data?.id],
    queryFn: () => p2pApi.aiPolicies(societe.data!.id),
    enabled: canAudit && Boolean(societe.data?.id),
  });
  const filtered = useMemo(
    () => (work.data ?? []).filter((item) => !status || item.status === status),
    [status, work.data],
  );
  const active = work.data?.find((item) => item.id === selected) ?? filtered[0];
  function refresh() {
    setDialog(null);
    void client.invalidateQueries({ queryKey: ['accounting-ai-work'] });
    void client.invalidateQueries({ queryKey: ['accounting-ai-findings'] });
    void client.invalidateQueries({ queryKey: ['accounting-ai-dashboard'] });
    void client.invalidateQueries({ queryKey: ['accounting-ai-policies'] });
  }
  if (!canAudit) {
    return <p role="alert">Vous n’avez pas accès à la comptabilité intelligente.</p>;
  }
  const reviewCount = dashboard.data?.workItems.find((x) => x.status === 'RAF_REVIEW')?._count._all ?? 0;
  const readyCount = dashboard.data?.workItems.find((x) => x.status === 'AUTO_POST_ELIGIBLE')?._count._all ?? 0;
  const blockerCount = dashboard.data?.findings.filter((x) => !['RESOLVED', 'DISMISSED'].includes(x.status)).reduce((n, x) => n + x._count._all, 0) ?? 0;
  const pendingSuggestions = (work.data ?? []).reduce(
    (n, item) => n + item.suggestions.filter((s) => s.decisions.length === 0).length,
    0,
  );
  const provider = labelProvider(work.data?.[0]?.providerMode, work.data?.find((item) => item.providerErrorCode)?.providerErrorCode);
  const drafts = (policies.data ?? []).filter((p) => !p.active && !p.approvedAt);
  return (
    <div className="p2p-module accounting-ai">
      <PageHeader
        title="Comptabilité intelligente"
        subtitle="L’IA propose ; les contrôles métier bloquent ; seul un humain valide. Aucune écriture sans politique DAF."
        actions={(
          <>
            <Link className="btn btn-secondary" to="/finance/comptabilite">Grand livre</Link>
            {hasP2pRole(user?.role, 'aiReview') && (
              <button type="button" onClick={() => setDialog({ type: 'policy' })}>Nouvelle politique</button>
            )}
            {hasP2pRole(user?.role, 'aiPolicyApproval') && (
              <button className="btn-primary" type="button" onClick={() => setDialog({ type: 'approve-policy' })}>
                Approuver une politique
              </button>
            )}
          </>
        )}
      />

      <ol className="accounting-ai-steps" aria-label="Comment ça marche">
        <li><ListChecks size={18} /><div><strong>1. Contrôler</strong><span>Équilibre, période, pièce : les règles métier passent avant l’IA.</span></div></li>
        <li><Sparkles size={18} /><div><strong>2. Proposer</strong><span>Suggestion chiffrée, avec confiance, preuves et règles citées.</span></div></li>
        <li><ShieldCheck size={18} /><div><strong>3. Décider</strong><span>Le RAF accepte ou refuse. Le DAF active la politique d’auto-proposition.</span></div></li>
      </ol>

      <section className="kpi-grid dash-kpi-grid">
        <button type="button" className={`kpi-card dash-kpi${status === 'RAF_REVIEW' ? ' kpi-actif' : ''}`} onClick={() => setStatus(status === 'RAF_REVIEW' ? '' : 'RAF_REVIEW')}>
          <Bot size={16} /><div className="kpi-label">À revoir par le RAF</div><div className="kpi-value">{reviewCount}</div><div className="kpi-hint">Dossiers en attente d’un œil humain</div>
        </button>
        <button type="button" className="kpi-card dash-kpi">
          <AlertTriangle size={16} /><div className="kpi-label">Écarts à corriger</div><div className="kpi-value">{blockerCount}</div><div className="kpi-hint">Blocages déterministes et anomalies</div>
        </button>
        <button type="button" className="kpi-card dash-kpi">
          <FileSearch size={16} /><div className="kpi-label">Propositions en attente</div><div className="kpi-value">{dashboard.data?.suggestions != null ? pendingSuggestions : '—'}</div><div className="kpi-hint">{readyCount} dossier(s) prêts si politique DAF</div>
        </button>
        <article className="kpi-card dash-kpi">
          <ShieldCheck size={16} /><div className="kpi-label">Fournisseur IA</div><div className="kpi-value">{provider.title}</div><div className="kpi-hint">{provider.hint}</div>
        </article>
      </section>

      {(work.isLoading || dashboard.isLoading) && <LoadingState label="Chargement de la file…" />}
      {(work.isError || dashboard.isError) && <p role="alert">Impossible de charger la comptabilité intelligente.</p>}

      {work.data && work.data.length === 0 && (
        <EmptyState
          title="Rien à analyser pour l’instant"
          description="Les factures, paiements et relevés apparaissent ici dès qu’ils sont soumis à l’analyse. Les contrôles métier s’appliquent même si le fournisseur IA est désactivé."
          action={<Link className="btn btn-primary" to="/finance/comptabilite">Ouvrir le grand livre fournisseurs</Link>}
        />
      )}

      {work.data && work.data.length > 0 && (
        <div className="accounting-ai-layout">
          <aside className="panel accounting-ai-queue">
            <div className="dash-panel-head">
              <h2>File de travail</h2>
              <select aria-label="Filtrer les statuts" value={status} onChange={(e) => setStatus(e.target.value as QueueFilter)}>
                <option value="">Tous</option>
                <option value="RAF_REVIEW">À revoir</option>
                <option value="AUTO_POST_ELIGIBLE">Prêt (politique DAF)</option>
              </select>
            </div>
            {filtered.length === 0 ? <p className="lead">Aucun dossier pour ce filtre.</p> : (
              <ul>
                {filtered.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={active?.id === item.id ? 'actif' : undefined} onClick={() => setSelected(item.id)}>
                      <span>
                        <strong>{labelSource(item.sourceType)}</strong>
                        <small>{item.sourceId}</small>
                      </span>
                      <span className={item.deterministicBlockers.length ? 'badge badge-warning' : 'badge badge-ok'}>
                        {labelWorkStatus(item.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {active && (
            <WorkItemPanel
              item={active}
              canReview={hasP2pRole(user?.role, 'aiReview')}
              onDecision={(suggestion) => setDialog({ type: 'decision', suggestion })}
            />
          )}
        </div>
      )}

      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>Politiques d’auto-proposition</h2>
            <p className="lead">Un brouillon RAF n’écrit rien. Seule l’approbation DAF active le seuil.</p>
          </div>
        </div>
        {policies.isLoading && <LoadingState label="Chargement des politiques…" />}
        {policies.isError && <p role="alert">Impossible de charger les politiques.</p>}
        {policies.data && policies.data.length === 0 && (
          <EmptyState
            title="Aucune politique"
            description="Le RAF crée un brouillon (source + type de suggestion + confiance minimale). Le DAF l’approuve ensuite. Sans politique active, tout dossier reste « à revoir »."
          />
        )}
        {policies.data && policies.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Suggestion</th>
                  <th>Confiance min.</th>
                  <th>Version</th>
                  <th>Statut</th>
                  {hasP2pRole(user?.role, 'aiPolicyApproval') && <th></th>}
                </tr>
              </thead>
              <tbody>
                {policies.data.map((row) => (
                  <tr key={row.id}>
                    <td>{labelSource(row.sourceType)}</td>
                    <td>{labelKind(row.suggestionKind)}</td>
                    <td>{Math.round(Number(row.minimumConfidence) * 100)} %</td>
                    <td className="mono">v{row.version}</td>
                    <td>
                      <span className={row.active ? 'badge badge-ok' : 'badge'}>
                        {row.active ? 'Active' : row.approvedAt ? 'Inactive' : 'Brouillon'}
                      </span>
                    </td>
                    {hasP2pRole(user?.role, 'aiPolicyApproval') && (
                      <td>
                        {!row.active && !row.approvedAt && (
                          <button type="button" onClick={() => setDialog({ type: 'approve-policy', policyId: row.id })}>
                            Approuver
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {drafts.length > 0 && hasP2pRole(user?.role, 'aiPolicyApproval') && (
          <p className="p2p-contract-note">{drafts.length} brouillon(s) en attente d’approbation DAF.</p>
        )}
      </section>

      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>Écarts d’audit & remédiation</h2>
            <p className="lead">Un constat élevé exige une écriture de storno ou de compensation, jamais une modification rétroactive.</p>
          </div>
        </div>
        {findings.isLoading && <LoadingState label="Chargement des constats…" />}
        {findings.data && findings.data.length === 0 && (
          <EmptyState
            title="Aucun écart"
            description="Les blocages (période fermée, pièce déséquilibrée, mapping incomplet…) s’affichent ici. RAF revoit, DAF / Contrôle interne remédie."
          />
        )}
        {findings.data && findings.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sévérité</th>
                  <th>Règle</th>
                  <th>Constat</th>
                  <th>Statut</th>
                  <th>Assigné</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {findings.data.map((finding) => (
                  <tr key={finding.id}>
                    <td>
                      <span className={['HIGH', 'CRITICAL'].includes(finding.severity) ? 'badge badge-critical' : 'badge badge-warning'}>
                        {labelSeverity(finding.severity)}
                      </span>
                    </td>
                    <td className="mono">{finding.ruleCode}</td>
                    <td>{finding.title}</td>
                    <td>{labelFindingStatus(finding.status)}</td>
                    <td>{finding.assignedToId ?? '—'}</td>
                    <td>
                      {hasP2pRole(user?.role, 'aiRemediation') && !['RESOLVED', 'DISMISSED'].includes(finding.status) && (
                        <button type="button" onClick={() => setDialog({ type: 'finding', finding })}>Traiter</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.type === 'decision' && <DecisionModal suggestion={dialog.suggestion} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === 'finding' && <FindingModal finding={dialog.finding} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === 'policy' && (
        <PolicyModal societeId={societe.data?.id} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.type === 'approve-policy' && (
        <ApprovePolicyModal
          policies={policies.data ?? []}
          initialId={dialog.policyId}
          onClose={() => setDialog(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function WorkItemPanel({
  item,
  canReview,
  onDecision,
}: {
  item: AiWorkItem;
  canReview: boolean;
  onDecision: (suggestion: AiSuggestion) => void;
}) {
  const [showHash, setShowHash] = useState(false);
  return (
    <section className="panel accounting-ai-detail">
      <header>
        <div>
          <span className="badge">{labelSource(item.sourceType)}</span>
          <h2>{labelWorkStatus(item.status)}</h2>
          <p className="lead">Dossier {item.sourceId}</p>
          {showHash ? <p className="mono">{item.sourceHash}</p> : (
            <button type="button" className="linkish" onClick={() => setShowHash(true)}>Empreinte technique</button>
          )}
        </div>
        <span className={item.deterministicBlockers.length ? 'badge badge-critical' : 'badge badge-ok'}>
          {item.deterministicBlockers.length ? `${item.deterministicBlockers.length} blocage(s)` : 'Contrôles passés'}
        </span>
      </header>
      {item.providerErrorCode && (
        <p role="alert">Fournisseur IA indisponible ({item.providerErrorCode}). Les contrôles métier restent appliqués.</p>
      )}
      <h3>Contrôles métier</h3>
      {item.deterministicBlockers.length ? (
        <ul className="p2p-blockers">{item.deterministicBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
      ) : (
        <p className="p2p-success"><CheckCircle2 size={15} /> Aucun blocage déterministe.</p>
      )}
      <h3>Suggestions & preuves</h3>
      {item.suggestions.length === 0 ? (
        <p className="lead">Aucune suggestion émise — seuls les contrôles métier s’appliquent.</p>
      ) : item.suggestions.map((suggestion) => {
        const decided = suggestion.decisions[0];
        const rows = suggestionRows(suggestion.value);
        return (
          <article className="ai-suggestion" key={suggestion.id}>
            <div className="ai-suggestion-head">
              <strong>{labelKind(suggestion.kind)}</strong>
              <span className={`badge ${suggestion.risk === 'HIGH' ? 'badge-critical' : suggestion.risk === 'MEDIUM' ? 'badge-warning' : 'badge-ok'}`}>
                {Math.round(Number(suggestion.confidence) * 100)} % · risque {labelRisk(suggestion.risk)}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary>Détail technique</summary>
              <pre>{JSON.stringify(suggestion.value, null, 2)}</pre>
              <p className="mono">{suggestion.modelVersion} · {suggestion.modelHash.slice(0, 12)} · prompt {suggestion.promptHash.slice(0, 12)}</p>
            </details>
            <dl>
              <div><dt>Preuves</dt><dd>{suggestion.evidence.join(' · ') || '—'}</dd></div>
              <div><dt>Règles citées</dt><dd>{suggestion.ruleCitations.join(' · ') || '—'}</dd></div>
            </dl>
            {decided ? (
              <p className={decided.decision === 'ACCEPTED' ? 'p2p-success' : 'p2p-muted'}>
                Décision humaine : {decided.decision === 'ACCEPTED' ? 'acceptée' : 'rejetée'}
                {decided.reason ? ` · ${decided.reason}` : ''}
              </p>
            ) : canReview && (
              <button className="btn-primary" type="button" onClick={() => onDecision(suggestion)}>Prendre une décision</button>
            )}
          </article>
        );
      })}
    </section>
  );
}

function DecisionModal({ suggestion, onClose, onDone }: { suggestion: AiSuggestion; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/accounting-ai/suggestions/${suggestion.id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason: reason || undefined }),
    }),
    onSuccess: onDone,
    onError: (e) => setError(messageDepuisApi(e, 'Décision refusée.')),
  });
  return (
    <Modal open title="Décision humaine" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <p className="lead">{labelKind(suggestion.kind)} — cette décision est journalisée et n’écrit pas le grand livre toute seule.</p>
        <label>Décision
          <select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <option value="ACCEPTED">Accepter</option>
            <option value="REJECTED">Rejeter</option>
          </select>
        </label>
        <label>Justification<textarea value={reason} onChange={(e) => setReason(e.target.value)} required={decision === 'REJECTED'} /></label>
        {error && <p role="alert">{error}</p>}
        <Actions onClose={onClose} pending={mutation.isPending} />
      </form>
    </Modal>
  );
}

function FindingModal({ finding, onClose, onDone }: { finding: AiFinding; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'assign' | 'resolve'>('assign');
  const [userId, setUserId] = useState('');
  const [resolution, setResolution] = useState('');
  const [storno, setStorno] = useState('');
  const [error, setError] = useState<string | null>(null);
  const users = useQuery({ queryKey: ['utilisateurs'], queryFn: () => apiFetch<UtilisateurDto[]>('/utilisateurs') });
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/accounting-ai/findings/${finding.id}/${mode}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'assign' ? { assignedToId: userId } : { resolution, stornoEntryId: storno || undefined }),
    }),
    onSuccess: onDone,
    onError: (e) => setError(messageDepuisApi(e, 'Remédiation refusée.')),
  });
  return (
    <Modal open title={`Traiter : ${finding.title}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <p className="lead">Règle {finding.ruleCode} · {labelSeverity(finding.severity)}</p>
        <label>Action
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="assign">Assigner</option>
            <option value="resolve">Résoudre</option>
          </select>
        </label>
        {mode === 'assign' ? (
          <label>Responsable
            <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {(users.data ?? []).filter((u) => u.actif).map((u) => (
                <option value={u.id} key={u.id}>{u.prenom} {u.nom} · {u.role.libelle}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>Résolution<textarea value={resolution} onChange={(e) => setResolution(e.target.value)} required /></label>
            <label>Écriture de storno / compensation
              <input value={storno} onChange={(e) => setStorno(e.target.value)} required={['HIGH', 'CRITICAL'].includes(finding.severity)} />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <Actions onClose={onClose} pending={mutation.isPending} />
      </form>
    </Modal>
  );
}

function PolicyModal({
  societeId,
  onClose,
  onDone,
}: {
  societeId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sourceType, setSource] = useState(AI_SOURCE_OPTIONS[0]);
  const [kind, setKind] = useState(AI_KIND_OPTIONS[0]);
  const [confidence, setConfidence] = useState('0.95');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<{ id: string; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const challenge = await p2pApi.reauth(password, 'ACCOUNTING_AI_POLICY_CREATE');
      return apiFetch<{ id: string; version: number }>('/accounting-ai/policies', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          societeId,
          sourceType,
          suggestionKind: kind,
          minimumConfidence: Number(confidence),
          maximumRisk: 'LOW',
        }),
      });
    },
    onSuccess: (value) => { setPassword(''); setResult(value); },
    onError: (e) => { setPassword(''); setError(messageDepuisApi(e, 'Création refusée.')); },
  });
  return (
    <Modal open title="Nouvelle politique" onClose={result ? onDone : onClose}>
      {result ? (
        <div className="p2p-success">
          <strong>Brouillon v{result.version} créé.</strong>
          <p>Le DAF le voit dans le tableau des politiques et l’approuve. Rien n’est auto-proposé tant que ce n’est pas actif.</p>
          <button className="btn-primary" type="button" onClick={onDone}>Fermer</button>
        </div>
      ) : (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); mutation.mutate(); }}>
          <label>Source
            <select value={sourceType} onChange={(e) => setSource(e.target.value)}>
              {AI_SOURCE_OPTIONS.map((x) => <option key={x} value={x}>{labelSource(x)}</option>)}
            </select>
          </label>
          <label>Type de suggestion
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {AI_KIND_OPTIONS.map((x) => <option key={x} value={x}>{labelKind(x)}</option>)}
            </select>
          </label>
          <label>Confiance minimale
            <input type="number" min="0" max="1" step="0.01" value={confidence} onChange={(e) => setConfidence(e.target.value)} />
          </label>
          <p className="lead">Le risque maximal reste faible. Le DAF doit approuver séparément.</p>
          <p className="p2p-contract-note">Action sensible : mot de passe actuel, challenge valable deux minutes, usage unique.</p>
          <label>Mot de passe actuel
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p role="alert">{error}</p>}
          <Actions onClose={onClose} pending={mutation.isPending} />
        </form>
      )}
    </Modal>
  );
}

function ApprovePolicyModal({
  policies,
  initialId,
  onClose,
  onDone,
}: {
  policies: AiPolicy[];
  initialId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const drafts = policies.filter((p) => !p.active && !p.approvedAt);
  const [id, setId] = useState(initialId ?? drafts[0]?.id ?? '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const challenge = await p2pApi.reauth(password, 'ACCOUNTING_AI_POLICY_APPROVE');
      return apiFetch(`/accounting-ai/policies/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ challengeId: challenge.challengeId }),
      });
    },
    onSuccess: () => { setPassword(''); setDone(true); },
    onError: (e) => { setPassword(''); setError(messageDepuisApi(e, 'Approbation refusée.')); },
  });
  return (
    <Modal open title="Approbation DAF d’une politique" onClose={done ? onDone : onClose}>
      {done ? (
        <p className="p2p-success">Politique approuvée et activée. L’ancienne version active du même périmètre a été désactivée.</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          {drafts.length === 0 && !initialId ? (
            <p className="lead">Aucun brouillon à approuver. Le RAF doit d’abord créer une politique.</p>
          ) : (
            <label>Politique
              <select value={id} onChange={(e) => setId(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {(initialId && !drafts.some((p) => p.id === initialId)
                  ? policies.filter((p) => p.id === initialId)
                  : drafts
                ).concat(drafts.filter((p) => p.id === initialId) ? [] : []).filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i).map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelSource(p.sourceType)} · {labelKind(p.suggestionKind)} · v{p.version} · {Math.round(Number(p.minimumConfidence) * 100)} %
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="p2p-contract-note">L’approbation exige un challenge dédié, distinct de la création RAF.</p>
          <label>Mot de passe actuel
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p role="alert">{error}</p>}
          <Actions onClose={onClose} pending={mutation.isPending} />
        </form>
      )}
    </Modal>
  );
}

function Actions({ onClose, pending }: { onClose: () => void; pending: boolean }) {
  return (
    <div className="table-actions">
      <button type="button" onClick={onClose}>Annuler</button>
      <button className="btn-primary" type="submit" disabled={pending}>{pending ? 'Traitement…' : 'Confirmer'}</button>
    </div>
  );
}
