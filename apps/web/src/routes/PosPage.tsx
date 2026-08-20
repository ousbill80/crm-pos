import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModePaiement, RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  CaisseDto,
  ClientDto,
  ClotureSessionResponseDto,
  ProduitDto,
  SessionCaisseDto,
  VenteDto,
} from '../lib/types';

// Miroir de access-scope.constants.ts (apps/api/src/caisses) : seule une
// caisse auxiliaire (boutique) encaisse et initie — jamais de
// validation/réception (règle de séparation des tâches, cf. CLAUDE.md).
// Constante dupliquée ici pour le seul usage UX, le RBAC réel reste
// entièrement appliqué côté serveur.
const ROLES_PERIMETRE_BOUTIQUE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

interface LignePanier {
  produitId: string;
  designation: string;
  prixUnitaire: string;
  stock: number;
  quantite: number;
}

function formatMontant(valeur: number): string {
  return valeur.toFixed(2);
}

function calculerTotal(panier: LignePanier[]): number {
  return panier.reduce((total, l) => total + Number(l.prixUnitaire) * l.quantite, 0);
}

function useCaisses(enabled: boolean) {
  return useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled,
  });
}

function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: ['ventes-sessions'],
    queryFn: () => apiFetch<SessionCaisseDto[]>('/ventes/sessions'),
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

function useClients(enabled: boolean) {
  return useQuery({
    queryKey: ['crm-clients'],
    queryFn: () => apiFetch<ClientDto[]>('/crm/clients'),
    enabled,
  });
}

function OuvertureSessionForm({ caisseId }: { caisseId: string }) {
  const queryClient = useQueryClient();
  const [fondInitial, setFondInitial] = useState('');
  const [temoinLogin, setTemoinLogin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<SessionCaisseDto>('/ventes/sessions', {
        method: 'POST',
        body: JSON.stringify({
          caisseId,
          fondInitial: Number(fondInitial),
          temoinLogin,
        }),
      }),
    onSuccess: () => {
      setFondInitial('');
      setTemoinLogin('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
    },
    onError: () =>
      setError(
        'Échec de l’ouverture de session : vérifiez le fond initial et le témoin (comptage contradictoire, §5.1).',
      ),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Ouverture de session de caisse</h2>
      <label htmlFor="fondInitial">Fond initial compté</label>
      <input
        id="fondInitial"
        type="number"
        min="0"
        step="0.01"
        value={fondInitial}
        onChange={(e) => setFondInitial(e.target.value)}
        required
      />
      <label htmlFor="temoinLogin">Login du témoin (comptage contradictoire)</label>
      <input
        id="temoinLogin"
        value={temoinLogin}
        onChange={(e) => setTemoinLogin(e.target.value)}
        required
      />
      <button type="submit" disabled={mutation.isPending}>
        Ouvrir la session
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function TicketVente({ vente }: { vente: VenteDto }) {
  return (
    <div className="ticket">
      <h3>Ticket de vente</h3>
      <p>{new Date(vente.dateVente).toLocaleString()}</p>
      <ul>
        {vente.lignes.map((l) => (
          <li key={l.id}>
            {l.produit.designation} x{l.quantite} — {l.prixUnitaire}
          </li>
        ))}
      </ul>
      <p>Mode de paiement : {vente.modePaiement}</p>
      <p>Total : {vente.montantTotal}</p>
      <button type="button" onClick={() => window.print()}>
        Imprimer
      </button>
    </div>
  );
}

function ProduitTuile({
  produit,
  quantiteAuPanier,
  onAjouter,
}: {
  produit: ProduitDto;
  quantiteAuPanier: number;
  onAjouter: () => void;
}) {
  const epuise = quantiteAuPanier >= produit.stock;
  return (
    <button
      type="button"
      className="produit-tuile"
      onClick={onAjouter}
      disabled={epuise}
    >
      <span className="produit-tuile-nom">{produit.designation}</span>
      <span className="produit-tuile-prix">{produit.prixUnitaire}</span>
      <span className="produit-tuile-stock">
        {epuise ? 'Stock épuisé' : `Stock ${produit.stock - quantiteAuPanier}`}
      </span>
    </button>
  );
}

function PanierPanel({
  panier,
  onIncrementer,
  onDecrementer,
  onRetirer,
  onPasserAuPaiement,
}: {
  panier: LignePanier[];
  onIncrementer: (produitId: string) => void;
  onDecrementer: (produitId: string) => void;
  onRetirer: (produitId: string) => void;
  onPasserAuPaiement: () => void;
}) {
  const total = calculerTotal(panier);

  return (
    <div className="panier">
      <h2>Panier</h2>
      {panier.length === 0 ? (
        <p>Aucun article sélectionné.</p>
      ) : (
        <ul className="panier-lignes">
          {panier.map((l) => (
            <li key={l.produitId} className="panier-ligne">
              <div className="panier-ligne-info">
                <span>{l.designation}</span>
                <span>{formatMontant(Number(l.prixUnitaire) * l.quantite)}</span>
              </div>
              <div className="panier-ligne-qty">
                <button type="button" onClick={() => onDecrementer(l.produitId)}>
                  −
                </button>
                <span>{l.quantite}</span>
                <button
                  type="button"
                  onClick={() => onIncrementer(l.produitId)}
                  disabled={l.quantite >= l.stock}
                >
                  +
                </button>
                <button type="button" onClick={() => onRetirer(l.produitId)}>
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="panier-total">Total : {formatMontant(total)}</p>
      <button
        type="button"
        onClick={onPasserAuPaiement}
        disabled={panier.length === 0}
      >
        Passer au paiement
      </button>
    </div>
  );
}

function PaiementScreen({
  panier,
  session,
  clients,
  onAnnuler,
  onVenteEnregistree,
}: {
  panier: LignePanier[];
  session: SessionCaisseDto;
  clients: ClientDto[];
  onAnnuler: () => void;
  onVenteEnregistree: (vente: VenteDto) => void;
}) {
  const queryClient = useQueryClient();
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.ESPECES);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = calculerTotal(panier);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<VenteDto>(`/ventes/sessions/${session.id}/ventes`, {
        method: 'POST',
        body: JSON.stringify({
          lignes: panier.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
          modePaiement,
          ...(clientId ? { clientId } : {}),
        }),
      }),
    onSuccess: (vente) => {
      setError(null);
      onVenteEnregistree(vente);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () =>
      setError('Échec de l’encaissement : vérifiez le stock disponible et les quantités.'),
  });

  return (
    <div className="paiement-screen">
      <h2>Paiement</h2>
      <p className="paiement-total">Total à encaisser : {formatMontant(total)}</p>

      <div className="paiement-modes">
        {Object.values(ModePaiement).map((m) => (
          <button
            key={m}
            type="button"
            className={m === modePaiement ? 'paiement-mode-btn actif' : 'paiement-mode-btn'}
            onClick={() => setModePaiement(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="clientId">Client (optionnel — vente anonyme possible, §6.6)</label>
        <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Vente anonyme</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} {c.prenom}
            </option>
          ))}
        </select>
      </div>

      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Confirmer l’encaissement
      </button>
      <button type="button" onClick={onAnnuler} disabled={mutation.isPending}>
        Retour au panier
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function VenteScreen({
  session,
  produits,
  clients,
  onVenteEnregistree,
}: {
  session: SessionCaisseDto;
  produits: ProduitDto[];
  clients: ClientDto[];
  onVenteEnregistree: (vente: VenteDto) => void;
}) {
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [etape, setEtape] = useState<'grille' | 'paiement'>('grille');

  function ajouterAuPanier(produit: ProduitDto) {
    setPanier((prev) => {
      const existante = prev.find((l) => l.produitId === produit.id);
      if (existante) {
        if (existante.quantite >= produit.stock) return prev;
        return prev.map((l) =>
          l.produitId === produit.id ? { ...l, quantite: l.quantite + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          produitId: produit.id,
          designation: produit.designation,
          prixUnitaire: produit.prixUnitaire,
          stock: produit.stock,
          quantite: 1,
        },
      ];
    });
  }

  function incrementer(produitId: string) {
    setPanier((prev) =>
      prev.map((l) =>
        l.produitId === produitId && l.quantite < l.stock
          ? { ...l, quantite: l.quantite + 1 }
          : l,
      ),
    );
  }

  function decrementer(produitId: string) {
    setPanier((prev) =>
      prev
        .map((l) => (l.produitId === produitId ? { ...l, quantite: l.quantite - 1 } : l))
        .filter((l) => l.quantite > 0),
    );
  }

  function retirer(produitId: string) {
    setPanier((prev) => prev.filter((l) => l.produitId !== produitId));
  }

  if (produits.length === 0) {
    return <p>Aucun produit disponible au catalogue.</p>;
  }

  if (etape === 'paiement') {
    return (
      <PaiementScreen
        panier={panier}
        session={session}
        clients={clients}
        onAnnuler={() => setEtape('grille')}
        onVenteEnregistree={(vente) => {
          setPanier([]);
          setEtape('grille');
          onVenteEnregistree(vente);
        }}
      />
    );
  }

  return (
    <div className="pos-layout">
      <div className="produit-tuiles">
        {produits.map((p) => {
          const ligne = panier.find((l) => l.produitId === p.id);
          return (
            <ProduitTuile
              key={p.id}
              produit={p}
              quantiteAuPanier={ligne?.quantite ?? 0}
              onAjouter={() => ajouterAuPanier(p)}
            />
          );
        })}
      </div>
      <PanierPanel
        panier={panier}
        onIncrementer={incrementer}
        onDecrementer={decrementer}
        onRetirer={retirer}
        onPasserAuPaiement={() => setEtape('paiement')}
      />
    </div>
  );
}

function ClotureSessionForm({ session }: { session: SessionCaisseDto }) {
  const queryClient = useQueryClient();
  const [fondCompteCloture, setFondCompteCloture] = useState('');
  const [temoinLogin, setTemoinLogin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ClotureSessionResponseDto | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ClotureSessionResponseDto>(`/ventes/sessions/${session.id}/cloture`, {
        method: 'POST',
        body: JSON.stringify({
          fondCompteCloture: Number(fondCompteCloture),
          temoinLogin,
        }),
      }),
    onSuccess: (data) => {
      setError(null);
      setResultat(data);
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
    },
    onError: () =>
      setError(
        'Échec de la clôture : vérifiez le fond compté et le témoin (comptage contradictoire, §5.1).',
      ),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (resultat) {
    return (
      <div className="ticket">
        <h2>Ticket de clôture</h2>
        <p>Session : {resultat.session.id}</p>
        <ul>
          {resultat.releve.map((r) => (
            <li key={r.modePaiement}>
              {r.modePaiement} : {r.total} ({r.nombreVentes} vente(s))
            </li>
          ))}
        </ul>
        {resultat.transactionVersementId ? (
          <p>
            Bordereau de versement généré automatiquement (espèces) : {' '}
            {resultat.transactionVersementId}
          </p>
        ) : (
          <p>Aucune vente en espèces sur cette session : pas de bordereau de versement.</p>
        )}
        <button type="button" onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Clôture de session</h2>
      <label htmlFor="fondCompteCloture">Fond compté à la clôture</label>
      <input
        id="fondCompteCloture"
        type="number"
        min="0"
        step="0.01"
        value={fondCompteCloture}
        onChange={(e) => setFondCompteCloture(e.target.value)}
        required
      />
      <label htmlFor="temoinLoginCloture">Login du témoin (comptage contradictoire)</label>
      <input
        id="temoinLoginCloture"
        value={temoinLogin}
        onChange={(e) => setTemoinLogin(e.target.value)}
        required
      />
      <button type="submit" disabled={mutation.isPending}>
        Clôturer la session
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function SessionOuverte({
  session,
  produits,
  clients,
}: {
  session: SessionCaisseDto;
  produits: ProduitDto[];
  clients: ClientDto[];
}) {
  const [dernierTicket, setDernierTicket] = useState<VenteDto | null>(null);
  const [ventesSession, setVentesSession] = useState<VenteDto[]>([]);

  if (dernierTicket) {
    return (
      <div>
        <TicketVente vente={dernierTicket} />
        <button type="button" onClick={() => setDernierTicket(null)}>
          Nouvelle vente
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>
        Session ouverte le {new Date(session.ouvertureDateHeure).toLocaleString()} — fond initial{' '}
        {session.fondInitial} — {ventesSession.length} vente(s) encaissée(s)
      </p>

      <VenteScreen
        session={session}
        produits={produits}
        clients={clients}
        onVenteEnregistree={(vente) => {
          setVentesSession((prev) => [vente, ...prev]);
          setDernierTicket(vente);
        }}
      />

      <ClotureSessionForm session={session} />
    </div>
  );
}

export function PosPage() {
  const { user } = useAuth();
  const peutEncaisser = user !== null && ROLES_PERIMETRE_BOUTIQUE.includes(user.role);

  const { data: caisses, isLoading: caissesLoading } = useCaisses(peutEncaisser);
  const caisseBoutique = caisses?.find(
    (c) => c.type === 'AUXILIAIRE' && c.boutiqueId === user?.boutiqueId,
  );

  const { data: sessions, isLoading: sessionsLoading } = useSessions(
    peutEncaisser && !!caisseBoutique,
  );
  const sessionOuverte = sessions?.find(
    (s) => s.caisseId === caisseBoutique?.id && s.statut === 'OUVERTE',
  );

  const { data: produits } = useProduits(peutEncaisser && !!sessionOuverte);
  const { data: clients } = useClients(peutEncaisser && !!sessionOuverte);

  if (!peutEncaisser) {
    return (
      <div>
        <header className="page-header">
          <div>
            <h1>Point de vente</h1>
            <p className="lead">Encaissement boutique</p>
          </div>
        </header>
        <p>
          L’encaissement est réservé aux rôles Caissier boutique et Responsable boutique
          (règle de séparation des tâches — cf. CLAUDE.md).
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Point de vente</h1>
          <p className="lead">Session, panier et modes de paiement</p>
        </div>
      </header>

      {(caissesLoading || sessionsLoading) && <p>Chargement...</p>}

      {!caissesLoading && !caisseBoutique && (
        <p>Aucune caisse auxiliaire trouvée pour votre boutique.</p>
      )}

      {caisseBoutique && !sessionsLoading && !sessionOuverte && (
        <OuvertureSessionForm caisseId={caisseBoutique.id} />
      )}

      {sessionOuverte && produits && clients && (
        <SessionOuverte session={sessionOuverte} produits={produits} clients={clients} />
      )}
    </div>
  );
}
