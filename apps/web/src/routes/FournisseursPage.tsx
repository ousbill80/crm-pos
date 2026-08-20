import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  FournisseurDetailDto,
  FournisseurDto,
  ProduitDto,
  ReceptionStockDto,
} from '../lib/types';

// Miroir de access-scope.constants.ts (apps/api/src/caisses) : fournisseurs
// et réception de stock sont traités comme de l'administration système,
// même RBAC que le catalogue produit (aucun rôle « Achats » dans le cahier
// des charges §4) — RBAC réel entièrement appliqué côté serveur.
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

function useFournisseurs(enabled: boolean) {
  return useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled,
  });
}

function useProduits(enabled: boolean) {
  return useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled,
  });
}

function useFournisseurDetail(fournisseurId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['fournisseurs', fournisseurId],
    queryFn: () => apiFetch<FournisseurDetailDto>(`/fournisseurs/${fournisseurId}`),
    enabled,
  });
}

function NouveauFournisseurForm() {
  const queryClient = useQueryClient();
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<FournisseurDto>('/fournisseurs', {
        method: 'POST',
        body: JSON.stringify({ nom, ...(contact ? { contact } : {}) }),
      }),
    onSuccess: () => {
      setNom('');
      setContact('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
    },
    onError: () => setError('Échec de la création du fournisseur.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Nouveau fournisseur</h2>
      <div>
        <label htmlFor="nom">Nom</label>
        <input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="contact">Contact (optionnel)</label>
        <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <button type="submit" disabled={mutation.isPending}>
        Créer
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function ReceptionStockForm({
  fournisseurId,
  produits,
  onFermer,
}: {
  fournisseurId: string;
  produits: ProduitDto[];
  onFermer: () => void;
}) {
  const queryClient = useQueryClient();
  const [produitId, setProduitId] = useState(produits[0]?.id ?? '');
  const [quantite, setQuantite] = useState('1');
  const [prixAchat, setPrixAchat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<ReceptionStockDto | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ReceptionStockDto>(`/fournisseurs/${fournisseurId}/receptions`, {
        method: 'POST',
        body: JSON.stringify({
          produitId,
          quantite: Number(quantite),
          prixAchat: Number(prixAchat),
        }),
      }),
    onSuccess: (reception) => {
      setError(null);
      setSucces(reception);
      setQuantite('1');
      setPrixAchat('');
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs', fournisseurId] });
    },
    onError: () =>
      setError('Échec de la réception : vérifiez le produit, la quantité et le prix d’achat.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (produits.length === 0) {
    return <p>Aucun produit au catalogue pour enregistrer une réception.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Réception de stock</h3>
      <div>
        <label htmlFor={`produit-${fournisseurId}`}>Produit</label>
        <select
          id={`produit-${fournisseurId}`}
          value={produitId}
          onChange={(e) => setProduitId(e.target.value)}
        >
          {produits.map((p) => (
            <option key={p.id} value={p.id}>
              {p.designation} (stock actuel {p.stock})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`quantite-${fournisseurId}`}>Quantité reçue</label>
        <input
          id={`quantite-${fournisseurId}`}
          type="number"
          min="1"
          step="1"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`prix-achat-${fournisseurId}`}>Prix d’achat unitaire</label>
        <input
          id={`prix-achat-${fournisseurId}`}
          type="number"
          min="0.01"
          step="0.01"
          value={prixAchat}
          onChange={(e) => setPrixAchat(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={mutation.isPending}>
        Enregistrer la réception
      </button>
      <button type="button" onClick={onFermer}>
        Fermer
      </button>
      {error && <p role="alert">{error}</p>}
      {succes && (
        <p>
          Réception enregistrée : +{succes.quantite} unité(s) — stock mis à jour.
        </p>
      )}
    </form>
  );
}

function HistoriqueReceptions({ fournisseurId }: { fournisseurId: string }) {
  const { data: detail, isLoading } = useFournisseurDetail(fournisseurId, true);

  if (isLoading) {
    return <p>Chargement de l’historique...</p>;
  }
  if (!detail || detail.receptions.length === 0) {
    return <p>Aucune réception enregistrée pour ce fournisseur.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Produit</th>
          <th>Quantité</th>
          <th>Prix d’achat</th>
        </tr>
      </thead>
      <tbody>
        {detail.receptions.map((r) => (
          <tr key={r.id}>
            <td>{new Date(r.dateReception).toLocaleString('fr-FR')}</td>
            <td>{r.produit.designation}</td>
            <td>{r.quantite}</td>
            <td className="money">{r.prixAchat} FCFA</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FournisseurRow({
  fournisseur,
  produits,
  peutGerer,
}: {
  fournisseur: FournisseurDto;
  produits: ProduitDto[];
  peutGerer: boolean;
}) {
  const [receptionOuverte, setReceptionOuverte] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  return (
    <tr>
      <td colSpan={peutGerer ? 1 : undefined}>{fournisseur.nom}</td>
      <td>{fournisseur.contact ?? '—'}</td>
      {peutGerer && (
        <td>
          {receptionOuverte ? (
            <ReceptionStockForm
              fournisseurId={fournisseur.id}
              produits={produits}
              onFermer={() => setReceptionOuverte(false)}
            />
          ) : (
            <button type="button" onClick={() => setReceptionOuverte(true)}>
              Enregistrer une réception
            </button>
          )}
          <button type="button" onClick={() => setHistoriqueOuvert((v) => !v)}>
            {historiqueOuvert ? 'Masquer l’historique' : 'Historique des réceptions'}
          </button>
          {historiqueOuvert && <HistoriqueReceptions fournisseurId={fournisseur.id} />}
        </td>
      )}
    </tr>
  );
}

export function FournisseursPage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE_STRUCTURE.includes(user.role);
  const peutGerer = user !== null && ROLES_ADMIN_STRUCTURE.includes(user.role);
  const { data: fournisseurs, isLoading, isError } = useFournisseurs(peutLire);
  const { data: produits } = useProduits(peutGerer);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Fournisseurs</h1>
          <p className="lead">Fiches fournisseurs et réceptions de stock</p>
        </div>
      </header>

      {peutGerer && <NouveauFournisseurForm />}

      {!peutLire && <p>Vous n’avez pas accès aux fournisseurs.</p>}
      {isLoading && <p>Chargement des fournisseurs...</p>}
      {isError && <p role="alert">Erreur lors du chargement des fournisseurs.</p>}

      {fournisseurs && (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Contact</th>
              {peutGerer && <th>Approvisionnement</th>}
            </tr>
          </thead>
          <tbody>
            {fournisseurs.map((f) => (
              <FournisseurRow
                key={f.id}
                fournisseur={f}
                produits={produits ?? []}
                peutGerer={peutGerer}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
