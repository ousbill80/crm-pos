import { useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, MapPin, RefreshCw } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type {
  BonStockDto,
  EntrepotDto,
  ProduitDto,
  RegleReapproDto,
} from '../lib/types';

const ROLES_PILOTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_FAIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const TYPE_LABEL: Record<BonStockDto['type'], string> = {
  RECEPTION: 'Réception',
  LIVRAISON: 'Livraison',
  TRANSFERT_INTERNE: 'Transfert interne',
  REBUT: 'Rebut',
};

const STATUT_LABEL: Record<BonStockDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  PRET: 'Prêt',
  FAIT: 'Fait',
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

export function OperationsStockPage() {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const vue = location.pathname.includes('emplacements')
    ? 'emplacements'
    : location.pathname.includes('reappro')
      ? 'reappro'
      : 'operations';
  const role = user?.role as RoleLibelle | undefined;
  const peutPiloter = role ? ROLES_PILOTE.includes(role) : false;
  const peutValider = role ? ROLES_FAIT.includes(role) : false;

  const [type, setType] = useState<BonStockDto['type']>('TRANSFERT_INTERNE');
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [produitId, setProduitId] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [quantiteOk, setQuantiteOk] = useState<number | ''>('');
  const [quantiteRebut, setQuantiteRebut] = useState<number | ''>('');
  const [numeroLot, setNumeroLot] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regleProduitId, setRegleProduitId] = useState('');
  const [regleEntrepotId, setRegleEntrepotId] = useState('');
  const [regleMin, setRegleMin] = useState(0);
  const [regleMax, setRegleMax] = useState(0);

  const bonsQ = useQuery({
    queryKey: ['stocks', 'bons'],
    queryFn: () => apiFetch<BonStockDto[]>('/stocks/bons'),
  });
  const emplQ = useQuery({
    queryKey: ['stocks', 'emplacements'],
    queryFn: () => apiFetch<EntrepotDto[]>('/stocks/emplacements'),
  });
  const produitsQ = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
  });
  const reapproQ = useQuery({
    queryKey: ['stocks', 'reappro'],
    queryFn: () => apiFetch<RegleReapproDto[]>('/stocks/reappro'),
    enabled: vue === 'reappro',
  });

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<BonStockDto>('/stocks/bons', {
        method: 'POST',
        body: JSON.stringify({
          type,
          entrepotSourceId: sourceId || undefined,
          entrepotDestId: destId || undefined,
          lignes: [
            {
              produitId,
              quantite,
              quantiteOk: quantiteOk === '' ? undefined : quantiteOk,
              quantiteRebut: quantiteRebut === '' ? undefined : quantiteRebut,
              numeroLot: numeroLot.trim() || undefined,
            },
          ],
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocks'] });
      setFormOpen(false);
      setErreur(null);
    },
    onError: (e) => setErreur(messageErreur(e)),
  });

  const actionBon = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pret' | 'valider' | 'annuler' }) =>
      apiFetch(`/stocks/bons/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocks'] }),
    onError: (e) => setErreur(messageErreur(e)),
  });

  const upsertRegle = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/reappro', {
        method: 'POST',
        body: JSON.stringify({
          produitId: regleProduitId,
          entrepotId: regleEntrepotId,
          min: regleMin,
          max: regleMax,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocks', 'reappro'] }),
    onError: (e) => setErreur(messageErreur(e)),
  });

  const lancer = useMutation({
    mutationFn: () => apiFetch('/stocks/reappro/lancer', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocks'] }),
    onError: (e) => setErreur(messageErreur(e)),
  });

  const entrepots = emplQ.data ?? [];
  const produits = produitsQ.data ?? [];
  const bons = bonsQ.data ?? [];

  const titre =
    vue === 'emplacements'
      ? 'Emplacements'
      : vue === 'reappro'
        ? 'Réapprovisionnement'
        : 'Opérations de stock';

  const onCreer = (e: FormEvent) => {
    e.preventDefault();
    creer.mutate();
  };

  const usages = useMemo(() => {
    const map = new Map<string, EntrepotDto[]>();
    for (const e of entrepots) {
      const k = e.usage ?? 'STOCK';
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entrepots]);

  return (
    <div className="page-stack">
      <PageHeader
        title={titre}
        subtitle={
          vue === 'operations'
            ? 'Bons de réception, transfert et rebut. Le stock vendable ne bouge qu’au statut Fait.'
            : vue === 'emplacements'
              ? 'Usages d’emplacement (stock, quai, perte, virtuels fournisseur/client).'
              : 'Règles min/max par magasin. Le lanceur crée des bons de transfert journalisés.'
        }
      />
      {erreur ? <p className="form-error">{erreur}</p> : null}

      {vue === 'operations' ? (
        <>
          {peutPiloter ? (
            <p>
              <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
                Nouveau bon
              </button>
            </p>
          ) : null}
          {bonsQ.isLoading ? (
            <LoadingState label="Chargement des bons…" />
          ) : bons.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Aucun bon"
              hint="Les réceptions Achats et les transferts centraux apparaissent ici."
            />
          ) : (
            <ListPanel>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Type</th>
                    <th>Statut</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Lignes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bons.map((b) => (
                    <tr key={b.id}>
                      <td>{b.numero}</td>
                      <td>{TYPE_LABEL[b.type]}</td>
                      <td>{STATUT_LABEL[b.statut]}</td>
                      <td>{b.entrepotSource?.nom ?? '—'}</td>
                      <td>{b.entrepotDest?.nom ?? '—'}</td>
                      <td>
                        {b.lignes
                          .map((l) => `${l.designation} × ${l.quantite}`)
                          .join(', ')}
                      </td>
                      <td>
                        {peutPiloter && b.statut === 'BROUILLON' ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => actionBon.mutate({ id: b.id, action: 'pret' })}
                          >
                            Mettre en prêt
                          </button>
                        ) : null}
                        {peutValider && b.statut === 'PRET' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => actionBon.mutate({ id: b.id, action: 'valider' })}
                          >
                            Valider
                          </button>
                        ) : null}
                        {peutValider && (b.statut === 'BROUILLON' || b.statut === 'PRET') ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => actionBon.mutate({ id: b.id, action: 'annuler' })}
                          >
                            Annuler
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListPanel>
          )}
        </>
      ) : null}

      {vue === 'emplacements' ? (
        emplQ.isLoading ? (
          <LoadingState label="Chargement des emplacements…" />
        ) : (
          usages.map(([usage, list]) => (
            <ListPanel key={usage} title={usage}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Nom</th>
                    <th>Boutique</th>
                    <th>Réseau</th>
                    <th>Virtuel</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td>{e.code}</td>
                      <td>{e.nom}</td>
                      <td>{e.boutique?.nom ?? e.boutiqueId}</td>
                      <td>{e.reseau ? 'Oui' : 'Non'}</td>
                      <td>{e.virtuel ? 'Oui' : 'Non'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListPanel>
          ))
        )
      ) : null}

      {vue === 'reappro' ? (
        <>
          {peutPiloter ? (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                upsertRegle.mutate();
              }}
            >
              <label>
                Produit
                <select
                  value={regleProduitId}
                  onChange={(ev) => setRegleProduitId(ev.target.value)}
                  required
                >
                  <option value="">—</option>
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.designation}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entrepôt magasin
                <select
                  value={regleEntrepotId}
                  onChange={(ev) => setRegleEntrepotId(ev.target.value)}
                  required
                >
                  <option value="">—</option>
                  {entrepots
                    .filter((e) => e.usage === 'STOCK' && !e.reseau)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Min
                <input
                  type="number"
                  min={0}
                  value={regleMin}
                  onChange={(ev) => setRegleMin(Number(ev.target.value))}
                />
              </label>
              <label>
                Max
                <input
                  type="number"
                  min={0}
                  value={regleMax}
                  onChange={(ev) => setRegleMax(Number(ev.target.value))}
                />
              </label>
              <button type="submit" className="btn btn-primary">
                Enregistrer la règle
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => lancer.mutate()}
              >
                <RefreshCw size={16} /> Lancer le réappro
              </button>
            </form>
          ) : null}
          {reapproQ.isLoading ? (
            <LoadingState label="Chargement…" />
          ) : (reapproQ.data ?? []).length === 0 ? (
            <EmptyState icon={MapPin} title="Aucune règle" hint="Définissez un min/max par magasin." />
          ) : (
            <ListPanel>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Entrepôt</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {(reapproQ.data ?? []).map((r) => (
                    <tr key={r.id}>
                      <td>{r.produit.designation}</td>
                      <td>
                        {r.entrepot.nom} ({r.entrepot.code})
                      </td>
                      <td>{r.min}</td>
                      <td>{r.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListPanel>
          )}
        </>
      ) : null}

      <Modal
        open={formOpen}
        title="Nouveau bon de stock"
        onClose={() => setFormOpen(false)}
      >
        <form className="form-grid" onSubmit={onCreer}>
          <label>
            Type
            <select
              value={type}
              onChange={(ev) => setType(ev.target.value as BonStockDto['type'])}
            >
              <option value="TRANSFERT_INTERNE">Transfert interne</option>
              <option value="RECEPTION">Réception</option>
              <option value="REBUT">Rebut</option>
              <option value="LIVRAISON">Livraison</option>
            </select>
          </label>
          <label>
            Source
            <select value={sourceId} onChange={(ev) => setSourceId(ev.target.value)}>
              <option value="">—</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select value={destId} onChange={(ev) => setDestId(ev.target.value)}>
              <option value="">—</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Produit
            <select
              value={produitId}
              onChange={(ev) => setProduitId(ev.target.value)}
              required
            >
              <option value="">—</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.designation}
                  {p.codeBarres ? ` · ${p.codeBarres}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantité
            <input
              type="number"
              min={1}
              value={quantite}
              onChange={(ev) => setQuantite(Number(ev.target.value))}
              required
            />
          </label>
          {type === 'RECEPTION' ? (
            <>
              <label>
                OK (qualité)
                <input
                  type="number"
                  min={0}
                  value={quantiteOk}
                  onChange={(ev) =>
                    setQuantiteOk(ev.target.value === '' ? '' : Number(ev.target.value))
                  }
                />
              </label>
              <label>
                Rebut
                <input
                  type="number"
                  min={0}
                  value={quantiteRebut}
                  onChange={(ev) =>
                    setQuantiteRebut(ev.target.value === '' ? '' : Number(ev.target.value))
                  }
                />
              </label>
            </>
          ) : null}
          <label>
            N° de lot
            <input
              value={numeroLot}
              onChange={(ev) => setNumeroLot(ev.target.value)}
              placeholder="Optionnel"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={creer.isPending}>
            Créer le brouillon
          </button>
        </form>
      </Modal>
    </div>
  );
}
