import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { MouvementStockDto, ProduitDto } from '../lib/types';

// Miroir de access-scope.constants.ts (apps/api/src/caisses) : le catalogue
// produit (§6.3.2) est traité comme de l'administration système, même RBAC
// que zones/boutiques. Ces constantes ne sont pas exposées via
// @caisse-crm/shared (limite du workspace), la liste est donc dupliquée ici
// pour le seul usage UX — le RBAC réel reste entièrement appliqué côté
// serveur.
const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_LECTURE_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

function useProduits(enabled: boolean) {
  return useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled,
  });
}

function useMouvements(produitId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['produits', produitId, 'mouvements'],
    queryFn: () => apiFetch<MouvementStockDto[]>(`/produits/${produitId}/mouvements`),
    enabled,
  });
}

function NouveauProduitForm() {
  const queryClient = useQueryClient();
  const [designation, setDesignation] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [stock, setStock] = useState('');
  const [seuilReappro, setSeuilReappro] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>('/produits', {
        method: 'POST',
        body: JSON.stringify({
          designation,
          prixUnitaire: Number(prixUnitaire),
          stock: Number(stock),
          ...(seuilReappro ? { seuilReappro: Number(seuilReappro) } : {}),
        }),
      }),
    onSuccess: () => {
      setDesignation('');
      setPrixUnitaire('');
      setStock('');
      setSeuilReappro('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () => setError('Échec de la création du produit.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Nouveau produit</h2>
      <label htmlFor="designation">Désignation</label>
      <input
        id="designation"
        value={designation}
        onChange={(e) => setDesignation(e.target.value)}
        required
      />
      <label htmlFor="prixUnitaire">Prix unitaire</label>
      <input
        id="prixUnitaire"
        type="number"
        min="0.01"
        step="0.01"
        value={prixUnitaire}
        onChange={(e) => setPrixUnitaire(e.target.value)}
        required
      />
      <label htmlFor="stock">Stock initial</label>
      <input
        id="stock"
        type="number"
        min="0"
        step="1"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        required
      />
      <label htmlFor="seuilReappro">Seuil de réapprovisionnement (optionnel)</label>
      <input
        id="seuilReappro"
        type="number"
        min="0"
        step="1"
        value={seuilReappro}
        onChange={(e) => setSeuilReappro(e.target.value)}
      />
      <button type="submit" disabled={mutation.isPending}>
        Créer
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function stockBas(produit: ProduitDto): boolean {
  return produit.seuilReappro !== null && produit.stock <= produit.seuilReappro;
}

function HistoriqueMouvements({ produitId }: { produitId: string }) {
  const { data: mouvements, isLoading } = useMouvements(produitId, true);

  if (isLoading) {
    return <p>Chargement de l’historique...</p>;
  }
  if (!mouvements || mouvements.length === 0) {
    return <p>Aucun mouvement de stock enregistré pour ce produit.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Quantité</th>
          <th>Stock après</th>
        </tr>
      </thead>
      <tbody>
        {mouvements.map((m) => (
          <tr key={m.id}>
            <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
            <td>{m.type}</td>
            <td>{m.quantite}</td>
            <td>{m.stockApres}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProduitRow({ produit }: { produit: ProduitDto }) {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [prixUnitaire, setPrixUnitaire] = useState(produit.prixUnitaire);
  const [seuilReappro, setSeuilReappro] = useState(
    produit.seuilReappro !== null ? String(produit.seuilReappro) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>(`/produits/${produit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prixUnitaire: Number(prixUnitaire),
          ...(seuilReappro ? { seuilReappro: Number(seuilReappro) } : {}),
        }),
      }),
    onSuccess: () => {
      setError(null);
      setEdition(false);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () => setError('Échec de la mise à jour du produit.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (!edition) {
    return (
      <>
        <tr>
          <td>
            {produit.designation}
            {stockBas(produit) && (
              <span className="badge badge-warning" title="Stock sous le seuil de réapprovisionnement">
                Stock bas
              </span>
            )}
          </td>
          <td className="money">{produit.prixUnitaire} FCFA</td>
          <td>
            {produit.stock}{' '}
            <a href="/stocks" style={{ fontSize: 12 }}>
              détail
            </a>
          </td>
          <td>
            <button type="button" onClick={() => setEdition(true)}>
              Modifier
            </button>
            <button type="button" onClick={() => setHistoriqueOuvert((v) => !v)}>
              {historiqueOuvert ? 'Masquer les mouvements' : 'Historique mouvements'}
            </button>
          </td>
        </tr>
        {historiqueOuvert && (
          <tr>
            <td colSpan={4}>
              <HistoriqueMouvements produitId={produit.id} />
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <tr>
      <td colSpan={4}>
        <form onSubmit={handleSubmit}>
          <span>{produit.designation}</span>
          <label htmlFor={`prix-${produit.id}`}>Prix unitaire</label>
          <input
            id={`prix-${produit.id}`}
            type="number"
            min="0.01"
            step="0.01"
            value={prixUnitaire}
            onChange={(e) => setPrixUnitaire(e.target.value)}
            required
          />
          <p>
            Stock réseau : {produit.stock} — ajuster via{' '}
            <a href="/stocks">Stocks</a>
          </p>
          <label htmlFor={`seuil-${produit.id}`}>Seuil de réapprovisionnement</label>
          <input
            id={`seuil-${produit.id}`}
            type="number"
            min="0"
            step="1"
            value={seuilReappro}
            onChange={(e) => setSeuilReappro(e.target.value)}
          />
          <button type="submit" disabled={mutation.isPending}>
            Enregistrer
          </button>
          <button type="button" onClick={() => setEdition(false)}>
            Annuler
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </td>
    </tr>
  );
}

export function ProduitsPage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE_STRUCTURE.includes(user.role);
  const peutGerer = user !== null && ROLES_ADMIN_STRUCTURE.includes(user.role);
  const { data: produits, isLoading, isError } = useProduits(peutLire);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Produits</h1>
          <p className="lead">
            Catalogue réseau — stock total = somme des entrepôts (voir Stocks)
          </p>
        </div>
      </header>

      {peutGerer && <NouveauProduitForm />}

      {!peutLire && <p>Vous n’avez pas accès au catalogue produit.</p>}
      {isLoading && <p>Chargement des produits...</p>}
      {isError && <p role="alert">Erreur lors du chargement des produits.</p>}

      {produits && (
        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Prix unitaire</th>
              <th>Stock</th>
              {peutGerer && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {produits.map((p) =>
              peutGerer ? (
                <ProduitRow key={p.id} produit={p} />
              ) : (
                <tr key={p.id}>
                  <td>
                    {p.designation}
                    {stockBas(p) && (
                      <span className="badge badge-warning" title="Stock sous le seuil de réapprovisionnement">
                        Stock bas
                      </span>
                    )}
                  </td>
                  <td className="money">{p.prixUnitaire} FCFA</td>
                  <td>{p.stock}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
