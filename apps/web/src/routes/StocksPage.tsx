import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  EntrepotDto,
  MouvementStockDto,
  ProduitDto,
  StockQuantDto,
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

const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export function StocksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);

  const [filtreEntrepot, setFiltreEntrepot] = useState('');

  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutLire,
  });
  const stocks = useQuery({
    queryKey: ['stocks', filtreEntrepot],
    queryFn: () =>
      apiFetch<StockQuantDto[]>(
        filtreEntrepot ? `/stocks?entrepotId=${filtreEntrepot}` : '/stocks',
      ),
    enabled: peutLire,
  });
  const mouvements = useQuery({
    queryKey: ['stocks-mouvements', filtreEntrepot],
    queryFn: () =>
      apiFetch<MouvementStockDto[]>(
        filtreEntrepot
          ? `/stocks/mouvements?entrepotId=${filtreEntrepot}`
          : '/stocks/mouvements',
      ),
    enabled: peutLire,
  });

  const [ajProduit, setAjProduit] = useState('');
  const [ajEntrepot, setAjEntrepot] = useState('');
  const [ajQty, setAjQty] = useState('');
  const [ajErr, setAjErr] = useState<string | null>(null);

  const ajuster = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/ajustements', {
        method: 'POST',
        body: JSON.stringify({
          produitId: ajProduit,
          entrepotId: ajEntrepot,
          quantiteComptee: Number(ajQty),
        }),
      }),
    onSuccess: () => {
      setAjErr(null);
      setAjQty('');
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks-mouvements'] });
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () => setAjErr('Échec de l’ajustement.'),
  });

  const [trProduit, setTrProduit] = useState('');
  const [trSource, setTrSource] = useState('');
  const [trDest, setTrDest] = useState('');
  const [trQty, setTrQty] = useState('');
  const [trErr, setTrErr] = useState<string | null>(null);

  const transferer = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/transferts', {
        method: 'POST',
        body: JSON.stringify({
          produitId: trProduit,
          entrepotSourceId: trSource,
          entrepotDestId: trDest,
          quantite: Number(trQty),
        }),
      }),
    onSuccess: () => {
      setTrErr(null);
      setTrQty('');
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks-mouvements'] });
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () => setTrErr('Échec du transfert.'),
  });

  const matrice = useMemo(() => {
    const rows = new Map<string, { designation: string; seuil: number | null; byEntrepot: Record<string, number> }>();
    for (const q of stocks.data ?? []) {
      const row = rows.get(q.produitId) ?? {
        designation: q.produit.designation,
        seuil: q.produit.seuilReappro,
        byEntrepot: {},
      };
      row.byEntrepot[q.entrepotId] = q.quantite;
      rows.set(q.produitId, row);
    }
    return rows;
  }, [stocks.data]);

  const entrepotCols = entrepots.data ?? [];

  if (!peutLire) {
    return <p>Vous n’avez pas accès aux stocks.</p>;
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Stocks</h1>
          <p className="lead">Niveaux par entrepôt — ajustements et transferts</p>
        </div>
      </header>

      <label htmlFor="filtre-ent">Filtrer par entrepôt</label>
      <select
        id="filtre-ent"
        value={filtreEntrepot}
        onChange={(e) => setFiltreEntrepot(e.target.value)}
      >
        <option value="">Tous</option>
        {entrepotCols.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nom} ({e.code})
          </option>
        ))}
      </select>

      {stocks.isLoading && <p>Chargement des stocks...</p>}
      {stocks.isError && <p role="alert">Erreur de chargement des stocks.</p>}

      {stocks.data && (
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              {filtreEntrepot
                ? [
                    <th key="q">Quantité</th>,
                    <th key="s">Seuil</th>,
                  ]
                : entrepotCols.map((e) => <th key={e.id}>{e.code}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtreEntrepot
              ? (stocks.data ?? []).map((q) => {
                  const bas =
                    q.produit.seuilReappro !== null &&
                    q.quantite <= q.produit.seuilReappro;
                  return (
                    <tr key={q.id}>
                      <td>
                        {q.produit.designation}
                        {bas && <span className="badge badge-warning">Seuil</span>}
                      </td>
                      <td>{q.quantite}</td>
                      <td>{q.produit.seuilReappro ?? '—'}</td>
                    </tr>
                  );
                })
              : Array.from(matrice.entries()).map(([produitId, row]) => (
                  <tr key={produitId}>
                    <td>{row.designation}</td>
                    {entrepotCols.map((e) => {
                      const qty = row.byEntrepot[e.id] ?? 0;
                      const bas = row.seuil !== null && qty <= row.seuil;
                      return (
                        <td key={e.id}>
                          {qty}
                          {bas && qty > 0 ? ' ⚠' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      )}

      {peutEcrire && (
        <>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              ajuster.mutate();
            }}
          >
            <h2>Ajuster un stock</h2>
            <label htmlFor="ajp">Produit</label>
            <select
              id="ajp"
              value={ajProduit || produits.data?.[0]?.id || ''}
              onChange={(e) => setAjProduit(e.target.value)}
              required
            >
              {(produits.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.designation}
                </option>
              ))}
            </select>
            <label htmlFor="aje">Entrepôt</label>
            <select
              id="aje"
              value={ajEntrepot || entrepotCols[0]?.id || ''}
              onChange={(e) => setAjEntrepot(e.target.value)}
              required
            >
              {entrepotCols.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
            <label htmlFor="ajq">Quantité comptée</label>
            <input
              id="ajq"
              type="number"
              min="0"
              value={ajQty}
              onChange={(e) => setAjQty(e.target.value)}
              required
            />
            <button type="submit" disabled={ajuster.isPending}>
              Ajuster
            </button>
            {ajErr && <p role="alert">{ajErr}</p>}
          </form>

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              transferer.mutate();
            }}
          >
            <h2>Transférer</h2>
            <label htmlFor="trp">Produit</label>
            <select
              id="trp"
              value={trProduit || produits.data?.[0]?.id || ''}
              onChange={(e) => setTrProduit(e.target.value)}
              required
            >
              {(produits.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.designation}
                </option>
              ))}
            </select>
            <label htmlFor="trs">Source</label>
            <select
              id="trs"
              value={trSource || entrepotCols[0]?.id || ''}
              onChange={(e) => setTrSource(e.target.value)}
              required
            >
              {entrepotCols.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
            <label htmlFor="trd">Destination</label>
            <select
              id="trd"
              value={trDest || entrepotCols[1]?.id || entrepotCols[0]?.id || ''}
              onChange={(e) => setTrDest(e.target.value)}
              required
            >
              {entrepotCols.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
            <label htmlFor="trq">Quantité</label>
            <input
              id="trq"
              type="number"
              min="1"
              value={trQty}
              onChange={(e) => setTrQty(e.target.value)}
              required
            />
            <button type="submit" disabled={transferer.isPending}>
              Transférer
            </button>
            {trErr && <p role="alert">{trErr}</p>}
          </form>
        </>
      )}

      <h2>Historique des mouvements</h2>
      {mouvements.isLoading && <p>Chargement...</p>}
      {mouvements.data && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Produit</th>
              <th>Entrepôt</th>
              <th>Δ</th>
              <th>Après</th>
            </tr>
          </thead>
          <tbody>
            {mouvements.data.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
                <td>{m.type}</td>
                <td>{produits.data?.find((p) => p.id === m.produitId)?.designation ?? m.produitId.slice(0, 8)}</td>
                <td>
                  {entrepotCols.find((e) => e.id === m.entrepotId)?.code ?? m.entrepotId?.slice(0, 8) ?? '—'}
                </td>
                <td>{m.quantite}</td>
                <td>{m.stockApres}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
