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

interface LigneSaisie {
  produitId: string;
  quantite: string;
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

function EncaissementForm({
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
  const queryClient = useQueryClient();
  const [lignes, setLignes] = useState<LigneSaisie[]>([
    { produitId: produits[0]?.id ?? '', quantite: '1' },
  ]);
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.ESPECES);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<VenteDto>(`/ventes/sessions/${session.id}/ventes`, {
        method: 'POST',
        body: JSON.stringify({
          lignes: lignes
            .filter((l) => l.produitId)
            .map((l) => ({ produitId: l.produitId, quantite: Number(l.quantite) })),
          modePaiement,
          ...(clientId ? { clientId } : {}),
        }),
      }),
    onSuccess: (vente) => {
      setLignes([{ produitId: produits[0]?.id ?? '', quantite: '1' }]);
      setClientId('');
      setError(null);
      onVenteEnregistree(vente);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () =>
      setError('Échec de l’encaissement : vérifiez le stock disponible et les quantités.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  function ajouterLigne() {
    setLignes((prev) => [...prev, { produitId: produits[0]?.id ?? '', quantite: '1' }]);
  }

  function retirerLigne(index: number) {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  }

  function modifierLigne(index: number, champ: keyof LigneSaisie, valeur: string) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  if (produits.length === 0) {
    return <p>Aucun produit disponible au catalogue.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Encaisser une vente</h2>
      {lignes.map((ligne, index) => (
        <div key={index}>
          <label htmlFor={`produit-${index}`}>Produit</label>
          <select
            id={`produit-${index}`}
            value={ligne.produitId}
            onChange={(e) => modifierLigne(index, 'produitId', e.target.value)}
          >
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.designation} — {p.prixUnitaire} (stock {p.stock})
              </option>
            ))}
          </select>
          <label htmlFor={`quantite-${index}`}>Quantité</label>
          <input
            id={`quantite-${index}`}
            type="number"
            min="1"
            step="1"
            value={ligne.quantite}
            onChange={(e) => modifierLigne(index, 'quantite', e.target.value)}
            required
          />
          {lignes.length > 1 && (
            <button type="button" onClick={() => retirerLigne(index)}>
              Retirer
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={ajouterLigne}>
        Ajouter un article
      </button>

      <label htmlFor="modePaiement">Mode de paiement</label>
      <select
        id="modePaiement"
        value={modePaiement}
        onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
      >
        {Object.values(ModePaiement).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <label htmlFor="clientId">Client (optionnel — vente anonyme possible, §6.6)</label>
      <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
        <option value="">Vente anonyme</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom} {c.prenom}
          </option>
        ))}
      </select>

      <button type="submit" disabled={mutation.isPending}>
        Encaisser
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
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
  const [ventesSession, setVentesSession] = useState<VenteDto[]>([]);

  return (
    <div>
      <p>
        Session ouverte le {new Date(session.ouvertureDateHeure).toLocaleString()} — fond initial{' '}
        {session.fondInitial}
      </p>

      <EncaissementForm
        session={session}
        produits={produits}
        clients={clients}
        onVenteEnregistree={(vente) => setVentesSession((prev) => [vente, ...prev])}
      />

      <h2>Ventes de la session en cours</h2>
      {ventesSession.length === 0 ? (
        <p>Aucune vente encaissée pour l’instant.</p>
      ) : (
        ventesSession.map((v) => <TicketVente key={v.id} vente={v} />)
      )}

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
        <h1>Point de vente</h1>
        <p>
          L’encaissement est réservé aux rôles Caissier boutique et Responsable boutique
          (règle de séparation des tâches — cf. CLAUDE.md).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Point de vente</h1>

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
