import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type {
  EntrepotDto,
  InventairePrioriteDto,
  SessionInventaireDto,
} from '../lib/types';

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

const ROLES_COMPTAGE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const ROLES_VALIDATION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const STATUT_LABEL: Record<SessionInventaireDto['statut'], string> = {
  EN_COURS: 'En cours',
  VALIDE: 'Validé',
  ANNULE: 'Annulé',
};

function messageErreur(err: unknown): string {
  if (!(err instanceof Error)) return 'Une erreur est survenue.';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
  } catch {
    /* raw */
  }
  return err.message;
}

export function InventairesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCompter = user !== null && ROLES_COMPTAGE.includes(user.role);
  const peutValiderRole = user !== null && ROLES_VALIDATION.includes(user.role);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [modalOuvrir, setModalOuvrir] = useState(false);
  const [entrepotId, setEntrepotId] = useState('');
  const [motif, setMotif] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [filtreEcarts, setFiltreEcarts] = useState(false);
  const [comptageLocal, setComptageLocal] = useState<Record<string, string>>({});

  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const priorites = useQuery({
    queryKey: ['inventaires-priorites'],
    queryFn: () => apiFetch<InventairePrioriteDto[]>('/inventaires/priorites'),
    enabled: peutLire,
  });
  const sessions = useQuery({
    queryKey: ['inventaires'],
    queryFn: () => apiFetch<SessionInventaireDto[]>('/inventaires'),
    enabled: peutLire,
  });
  const session = useQuery({
    queryKey: ['inventaires', sessionId],
    queryFn: () => apiFetch<SessionInventaireDto>(`/inventaires/${sessionId}`),
    enabled: peutLire && sessionId !== null,
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['inventaires'] });
    void queryClient.invalidateQueries({ queryKey: ['inventaires-priorites'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-mouvements'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
  }

  const ouvrir = useMutation({
    mutationFn: () =>
      apiFetch<SessionInventaireDto>('/inventaires', {
        method: 'POST',
        body: JSON.stringify({
          entrepotId,
          ...(motif.trim() ? { motif: motif.trim() } : {}),
        }),
      }),
    onSuccess: (created) => {
      setModalOuvrir(false);
      setMotif('');
      setFormErr(null);
      setSessionId(created.id);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const compter = useMutation({
    mutationFn: (payload: { produitId: string; quantiteComptee: number }) =>
      apiFetch<SessionInventaireDto>(`/inventaires/${sessionId}/lignes`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalider(),
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const reporter = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/reporter-theorique`, { method: 'POST' }),
    onSuccess: () => invalider(),
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const valider = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/valider`, { method: 'POST' }),
    onSuccess: () => {
      setFormErr(null);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const annuler = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/annuler`, { method: 'POST' }),
    onSuccess: () => {
      setSessionId(null);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const detail = session.data;
  const lignes = useMemo(() => {
    const all = detail?.lignes ?? [];
    if (!filtreEcarts) return all;
    return all.filter(
      (l) =>
        l.quantiteComptee !== null && l.quantiteComptee !== l.quantiteTheorique,
    );
  }, [detail, filtreEcarts]);

  const stats = useMemo(() => {
    const all = detail?.lignes ?? [];
    const comptees = all.filter((l) => l.quantiteComptee !== null).length;
    const ecarts = all.filter(
      (l) =>
        l.quantiteComptee !== null && l.quantiteComptee !== l.quantiteTheorique,
    );
    const unitesEcart = ecarts.reduce(
      (n, l) => n + Math.abs((l.quantiteComptee ?? 0) - l.quantiteTheorique),
      0,
    );
    return { total: all.length, comptees, ecarts: ecarts.length, unitesEcart };
  }, [detail]);

  if (!peutLire) {
    return <p>Vous n’avez pas accès aux inventaires.</p>;
  }

  const aInventorier = (priorites.data ?? []).filter((p) => p.aInventorier);
  const peutValiderCetteSession =
    peutValiderRole &&
    detail?.statut === 'EN_COURS' &&
    detail.initiateurId !== user?.userId;

  return (
    <div className="stock-module">
      <PageHeader
        title="Inventaires physiques"
        subtitle="Comptage contradictoire — le stock ne bouge qu’après validation par un tiers"
        actions={
          peutCompter ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEntrepotId(entrepots.data?.[0]?.id ?? '');
                setFormErr(null);
                setModalOuvrir(true);
              }}
            >
              <ClipboardList size={15} /> Nouvel inventaire
            </button>
          ) : undefined
        }
      />

      {aInventorier.length > 0 && (
        <section className="dash-sante dash-sante-warning">
          <div className="dash-sante-main">
            <span className="dash-sante-badge">À inventorier</span>
            <p>
              {aInventorier.length} entrepôt(s) sans inventaire validé depuis{' '}
              {aInventorier[0]?.frequenceCibleJours ?? 30} jours (sécurité du
              stock).
            </p>
          </div>
        </section>
      )}

      <div className="dash-layout stock-charts">
        <ListPanel title="Sessions">
          {sessions.isLoading && <LoadingState label="Chargement..." />}
          {sessions.isError && <p role="alert">Erreur de chargement.</p>}
          {sessions.data && sessions.data.length === 0 && (
            <EmptyState
              title="Aucun inventaire"
              description="Ouvrez un inventaire sur un entrepôt pour figer le théorique et compter."
            />
          )}
          {sessions.data && sessions.data.length > 0 && (
            <ul className="dash-rank">
              {sessions.data.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={
                      s.id === sessionId
                        ? 'stock-link-btn stock-session-actif'
                        : 'stock-link-btn'
                    }
                    onClick={() => {
                      setSessionId(s.id);
                      setFormErr(null);
                    }}
                  >
                    {s.entrepot.code} · {s.entrepot.boutique.nom}
                  </button>
                  <div className="kpi-hint" style={{ margin: '4px 0 0' }}>
                    <span
                      className={
                        s.statut === 'VALIDE'
                          ? 'badge badge-ok'
                          : s.statut === 'ANNULE'
                            ? 'badge badge-neutral'
                            : 'badge badge-warning'
                      }
                    >
                      {STATUT_LABEL[s.statut]}
                    </span>{' '}
                    {new Date(s.dateOuverture).toLocaleString('fr-FR')} ·{' '}
                    {s.initiateur.prenom} {s.initiateur.nom}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListPanel>

        <section className="panel" style={{ gridColumn: 'span 2' }}>
          {!sessionId && (
            <EmptyState
              title="Sélectionnez une session"
              description="Le comptage est tracé. Rien n’est écrit en stock tant qu’un autre utilisateur n’a pas validé."
            />
          )}
          {session.isLoading && <LoadingState label="Chargement de la session..." />}
          {detail && (
            <>
              <div className="dash-panel-head">
                <h2>
                  {detail.entrepot.code} — {detail.entrepot.boutique.nom}
                </h2>
                <span className="dash-panel-meta">
                  {stats.comptees}/{stats.total} compté(s) · {stats.ecarts} écart(s) ·{' '}
                  {stats.unitesEcart} unité(s) d’écart
                </span>
              </div>
              <p className="lead">
                Comptage : {detail.initiateur.prenom} {detail.initiateur.nom}
                {detail.validateur
                  ? ` · Validé par ${detail.validateur.prenom} ${detail.validateur.nom}`
                  : ' · En attente de validation par un tiers'}
                {detail.motif ? ` · ${detail.motif}` : ''}
              </p>
              {formErr && <p role="alert">{formErr}</p>}

              {detail.statut === 'EN_COURS' && (
                <div className="toolbar stock-toolbar">
                  <label>
                    <input
                      type="checkbox"
                      checked={filtreEcarts}
                      onChange={(e) => setFiltreEcarts(e.target.checked)}
                    />{' '}
                    Écarts seulement
                  </label>
                  {peutCompter && (
                    <>
                      <button
                        type="button"
                        onClick={() => reporter.mutate()}
                        disabled={reporter.isPending}
                      >
                        Reporter le théorique
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Annuler cet inventaire ? Aucun stock ne sera modifié.')) {
                            annuler.mutate();
                          }
                        }}
                      >
                        Annuler
                      </button>
                    </>
                  )}
                  {peutValiderCetteSession ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={valider.isPending || stats.comptees < stats.total}
                      onClick={() => valider.mutate()}
                    >
                      <CheckCircle2 size={15} /> Valider et ajuster le stock
                    </button>
                  ) : (
                    <p className="kpi-hint">
                      <ShieldAlert size={13} /> La validation doit être faite par
                      une autre personne (responsable, DAF, DG ou SI).
                    </p>
                  )}
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Théorique</th>
                      <th>Compté</th>
                      <th>Écart</th>
                      {detail.statut === 'EN_COURS' && peutCompter ? (
                        <th>Saisir</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const ecart =
                        l.quantiteComptee === null
                          ? null
                          : l.quantiteComptee - l.quantiteTheorique;
                      return (
                        <tr key={l.id}>
                          <td>
                            <strong>{l.produit.designation}</strong>
                            <div className="kpi-hint" style={{ margin: 0 }}>
                              {l.produit.reference ?? 'Sans réf.'}
                            </div>
                          </td>
                          <td>{l.quantiteTheorique}</td>
                          <td>
                            {l.quantiteComptee === null ? (
                              <span className="badge badge-warning">À compter</span>
                            ) : (
                              l.quantiteComptee
                            )}
                          </td>
                          <td
                            className={
                              ecart === null
                                ? undefined
                                : ecart < 0
                                  ? 'stock-delta-neg'
                                  : ecart > 0
                                    ? 'stock-delta-pos'
                                    : undefined
                            }
                          >
                            {ecart === null ? '—' : ecart > 0 ? `+${ecart}` : ecart}
                            {ecart !== null && ecart !== 0 && (
                              <AlertTriangle size={12} style={{ marginLeft: 4 }} />
                            )}
                          </td>
                          {detail.statut === 'EN_COURS' && peutCompter ? (
                            <td>
                              <form
                                className="stock-count-form"
                                onSubmit={(e: FormEvent) => {
                                  e.preventDefault();
                                  const raw =
                                    comptageLocal[l.produitId] ??
                                    String(l.quantiteComptee ?? l.quantiteTheorique);
                                  compter.mutate({
                                    produitId: l.produitId,
                                    quantiteComptee: Number(raw),
                                  });
                                }}
                              >
                                <input
                                  type="number"
                                  min="0"
                                  value={
                                    comptageLocal[l.produitId] ??
                                    (l.quantiteComptee !== null
                                      ? String(l.quantiteComptee)
                                      : '')
                                  }
                                  onChange={(e) =>
                                    setComptageLocal((prev) => ({
                                      ...prev,
                                      [l.produitId]: e.target.value,
                                    }))
                                  }
                                  aria-label={`Quantité comptée ${l.produit.designation}`}
                                />
                                <button type="submit" disabled={compter.isPending}>
                                  OK
                                </button>
                              </form>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {peutCompter && (
        <Modal
          open={modalOuvrir}
          onClose={() => setModalOuvrir(false)}
          title="Ouvrir un inventaire"
          description="Le théorique est figé maintenant. Le stock réel ne changera qu’à la validation par un autre utilisateur."
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              ouvrir.mutate();
            }}
          >
            <label htmlFor="inv-ent">Entrepôt</label>
            <select
              id="inv-ent"
              value={entrepotId}
              onChange={(e) => setEntrepotId(e.target.value)}
              required
            >
              {(entrepots.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.boutique?.nom ?? e.nom}
                </option>
              ))}
            </select>
            <label htmlFor="inv-motif">Motif (optionnel)</label>
            <input
              id="inv-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex. inventaire mensuel août"
            />
            <button type="submit" className="btn-primary" disabled={ouvrir.isPending}>
              {ouvrir.isPending ? 'Ouverture…' : 'Figer le théorique et compter'}
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}
