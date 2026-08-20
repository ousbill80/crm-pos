import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ProduitDto } from '../lib/types';

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

function NouveauProduitForm() {
  const queryClient = useQueryClient();
  const [designation, setDesignation] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [stock, setStock] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>('/produits', {
        method: 'POST',
        body: JSON.stringify({
          designation,
          prixUnitaire: Number(prixUnitaire),
          stock: Number(stock),
        }),
      }),
    onSuccess: () => {
      setDesignation('');
      setPrixUnitaire('');
      setStock('');
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
      <button type="submit" disabled={mutation.isPending}>
        Créer
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function ProduitRow({ produit }: { produit: ProduitDto }) {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(false);
  const [prixUnitaire, setPrixUnitaire] = useState(produit.prixUnitaire);
  const [stock, setStock] = useState(String(produit.stock));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>(`/produits/${produit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prixUnitaire: Number(prixUnitaire),
          stock: Number(stock),
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
      <tr>
        <td>{produit.designation}</td>
        <td>{produit.prixUnitaire}</td>
        <td>{produit.stock}</td>
        <td>
          <button type="button" onClick={() => setEdition(true)}>
            Modifier
          </button>
        </td>
      </tr>
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
          <label htmlFor={`stock-${produit.id}`}>Stock</label>
          <input
            id={`stock-${produit.id}`}
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
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
      <h1>Produits</h1>

      {peutGerer && <NouveauProduitForm />}

      {!peutLire && <p>Vous n’avez pas accès au catalogue produit.</p>}
      {isLoading && <p>Chargement des produits...</p>}
      {isError && <p>Erreur lors du chargement des produits.</p>}

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
                  <td>{p.designation}</td>
                  <td>{p.prixUnitaire}</td>
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
