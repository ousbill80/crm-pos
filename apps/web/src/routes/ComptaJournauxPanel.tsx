import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Plus } from 'lucide-react';
import { messageDepuisApi } from '../lib/api';
import { insightJournaux } from '../lib/insights/compta';
import {
  hasP2pRole,
  JOURNAL_TYPE_COMPTE,
  JOURNAL_TYPE_HINTS,
  JOURNAL_TYPE_LABELS,
  JOURNAL_TYPES,
  p2pApi,
  type AccountingJournal,
  type JournalComptableType,
} from '../lib/p2p';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { useAuth } from '../context/AuthContext';

export function ComptaJournauxPanel({
  societeId,
  onOpenJournal,
}: {
  societeId: string;
  onOpenJournal: (journalId: string) => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const canWrite = hasP2pRole(user?.role, 'comptabiliteEcriture');
  const [createOpen, setCreateOpen] = useState<JournalComptableType | null>(null);
  const [edit, setEdit] = useState<AccountingJournal | null>(null);
  const [typeFiltre, setTypeFiltre] = useState<JournalComptableType | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const journals = useQuery({
    queryKey: ['p2p-journals', societeId],
    queryFn: () => p2pApi.journals(societeId),
  });
  const byType = useMemo(() => {
    const map = new Map<JournalComptableType, AccountingJournal[]>();
    for (const type of JOURNAL_TYPES) map.set(type, []);
    for (const row of journals.data?.items ?? []) {
      map.get(row.type)?.push(row);
    }
    return map;
  }, [journals.data]);
  const total = journals.data?.items.length ?? 0;
  const actifs = journals.data?.items.filter((row) => row.actif).length ?? 0;
  const typesAffiches =
    typeFiltre === 'ALL' ? JOURNAL_TYPES : ([typeFiltre] as JournalComptableType[]);
  const ecrituresTotal = useMemo(
    () => (journals.data?.items ?? []).reduce((s, r) => s + (r._count.ecritures ?? 0), 0),
    [journals.data],
  );

  function refresh() {
    void client.invalidateQueries({ queryKey: ['p2p-journals'] });
  }

  function matchJournal(row: AccountingJournal) {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.code.toLowerCase().includes(needle) ||
      row.libelle.toLowerCase().includes(needle) ||
      row.exercice.code.toLowerCase().includes(needle)
    );
  }

  return (
    <section className="panel p2p-section compta-report">
      <div className="dash-panel-head">
        <div>
          <h2>
            Journaux comptables <InfoTooltip insight={insightJournaux()} />
          </h2>
          <p className="lead">
            Un type à la fois (Achats, Ventes, Caisse, Banque, OD). Le code et le type sont
            figés après création ; une désactivation bloque les nouvelles écritures seulement.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              setCreateOpen(typeFiltre === 'ALL' ? 'OPERATIONS_DIVERSES' : typeFiltre)
            }
          >
            <Plus size={16} /> Nouveau journal
          </button>
        )}
      </div>
      {journals.isLoading && <LoadingState label="Chargement des journaux…" />}
      {journals.isError && <p role="alert">Impossible de charger les journaux comptables.</p>}
      {journals.data && (
        <>
          <section className="kpi-grid dash-kpi-grid">
            <article
              className={`kpi-card dash-kpi${typeFiltre === 'ALL' ? ' actif' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setTypeFiltre('ALL')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTypeFiltre('ALL');
                }
              }}
            >
              <BookMarked size={16} />
              <div className="kpi-label">
                Journaux <InfoTooltip insight={insightJournaux()} />
              </div>
              <div className="kpi-value">{total}</div>
              <div className="kpi-hint">
                {actifs} actif(s) · {ecrituresTotal} écriture(s)
              </div>
            </article>
            {JOURNAL_TYPES.map((type) => {
              const rows = byType.get(type) ?? [];
              const nEcritures = rows.reduce((s, r) => s + (r._count.ecritures ?? 0), 0);
              return (
                <article
                  key={type}
                  className={`kpi-card dash-kpi${typeFiltre === type ? ' actif' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setTypeFiltre((prev) => (prev === type ? 'ALL' : type))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTypeFiltre((prev) => (prev === type ? 'ALL' : type));
                    }
                  }}
                >
                  <div className="kpi-label">{JOURNAL_TYPE_LABELS[type]}</div>
                  <div className="kpi-value">{rows.length}</div>
                  <div className="kpi-hint">
                    {JOURNAL_TYPE_COMPTE[type]} · {nEcritures} pièce(s)
                  </div>
                </article>
              );
            })}
          </section>
          <div className="p2p-inline-fields no-print">
            <label className="compta-paiements-search">
              Rechercher
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Code, intitulé, exercice…"
                aria-label="Rechercher un journal"
              />
            </label>
          </div>
          <nav className="compta-journal-chips" aria-label="Filtrer par type de journal">
            <button
              type="button"
              className={typeFiltre === 'ALL' ? 'actif' : undefined}
              onClick={() => setTypeFiltre('ALL')}
            >
              Tous · {total}
            </button>
            {JOURNAL_TYPES.map((type) => {
              const n = byType.get(type)?.length ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  className={typeFiltre === type ? 'actif' : undefined}
                  onClick={() => setTypeFiltre(type)}
                >
                  {JOURNAL_TYPE_LABELS[type]} · {n}
                </button>
              );
            })}
          </nav>
          <div className="compta-journal-types">
            {typesAffiches.map((type) => {
              const rows = (byType.get(type) ?? []).filter(matchJournal);
              return (
                <article key={type} className="compta-journal-type">
                  <header>
                    <BookMarked size={16} />
                    <div>
                      <h3>{JOURNAL_TYPE_LABELS[type]}</h3>
                      <p className="lead">
                        {JOURNAL_TYPE_COMPTE[type]} · {JOURNAL_TYPE_HINTS[type]}
                      </p>
                    </div>
                    <span className="badge">{rows.length}</span>
                    {canWrite && (
                      <button type="button" onClick={() => setCreateOpen(type)}>
                        Ajouter
                      </button>
                    )}
                  </header>
                  {rows.length === 0 ? (
                    <p className="lead">
                      {q.trim()
                        ? 'Aucun journal ne correspond à la recherche.'
                        : `Aucun journal ${JOURNAL_TYPE_LABELS[type].toLowerCase()} sur les exercices listés.`}
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Intitulé</th>
                            <th>Exercice</th>
                            <th>Écritures</th>
                            <th>Modèles</th>
                            <th>Statut</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id}>
                              <td className="mono">{row.code}</td>
                              <td>{row.libelle}</td>
                              <td>{row.exercice.code}</td>
                              <td>{row._count.ecritures}</td>
                              <td>{row._count.modeles}</td>
                              <td>
                                <span className={row.actif ? 'badge badge-ok' : 'badge'}>
                                  {row.actif ? 'Actif' : 'Inactif'}
                                </span>
                              </td>
                              <td className="table-actions">
                                <button type="button" onClick={() => onOpenJournal(row.id)}>
                                  Écritures
                                </button>
                                {canWrite && (
                                  <button type="button" onClick={() => setEdit(row)}>
                                    Modifier
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      {createOpen && journals.data && (
        <JournalFormModal
          title={`Nouveau journal — ${JOURNAL_TYPE_LABELS[createOpen]}`}
          defaultType={createOpen}
          exercices={journals.data.exercices.filter((row) => !row.cloture)}
          societeId={societeId}
          onClose={() => setCreateOpen(null)}
          onDone={() => {
            setCreateOpen(null);
            refresh();
          }}
        />
      )}
      {edit && (
        <JournalEditModal
          journal={edit}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function JournalFormModal({
  title,
  defaultType,
  exercices,
  societeId,
  onClose,
  onDone,
}: {
  title: string;
  defaultType: JournalComptableType;
  exercices: Array<{ id: string; code: string; cloture: boolean }>;
  societeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<JournalComptableType>(defaultType);
  const [exerciceId, setExerciceId] = useState(exercices[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      p2pApi.createJournal({ societeId, exerciceId, code, libelle, type }),
    onSuccess: onDone,
    onError: (err) => setError(messageDepuisApi(err, 'Création du journal refusée.')),
  });
  return (
    <Modal open title={title} onClose={onClose} description="Le code et le type sont définitifs. Seul l’intitulé pourra être modifié ensuite.">
      {exercices.length === 0 ? (
        <p role="alert">Aucun exercice ouvert. Ouvrez d’abord une période sur un exercice actif.</p>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as JournalComptableType)}>
              {JOURNAL_TYPES.map((item) => (
                <option key={item} value={item}>{JOURNAL_TYPE_LABELS[item]}</option>
              ))}
            </select>
          </label>
          <label>
            Exercice
            <select value={exerciceId} onChange={(e) => setExerciceId(e.target.value)} required>
              {exercices.map((row) => (
                <option key={row.id} value={row.id}>{row.code}</option>
              ))}
            </select>
          </label>
          <label>
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ACHATS" required minLength={2} maxLength={12} />
          </label>
          <label>
            Intitulé
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Journal des achats" required minLength={2} maxLength={120} />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="table-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button className="btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement…' : 'Créer'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function JournalEditModal({
  journal,
  onClose,
  onDone,
}: {
  journal: AccountingJournal;
  onClose: () => void;
  onDone: () => void;
}) {
  const [libelle, setLibelle] = useState(journal.libelle);
  const [actif, setActif] = useState(journal.actif);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => p2pApi.updateJournal(journal.id, { libelle, actif }),
    onSuccess: onDone,
    onError: (err) => setError(messageDepuisApi(err, 'Modification refusée.')),
  });
  return (
    <Modal
      open
      title={`${journal.code} · ${JOURNAL_TYPE_LABELS[journal.type]}`}
      onClose={onClose}
      description="Le code et le type restent figés. Désactiver un journal empêche les nouvelles écritures."
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="lead">
          Exercice {journal.exercice.code} · {journal._count.ecritures} écriture(s) déjà passée(s)
          {journal._count.modeles ? ` · ${journal._count.modeles} modèle(s)` : ''}
        </p>
        <label>
          Intitulé
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required minLength={2} maxLength={120} />
        </label>
        <label className="compta-check">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          Journal actif (accepte les nouvelles pièces)
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="table-actions">
          <button type="button" onClick={onClose}>Annuler</button>
          <button className="btn-primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
