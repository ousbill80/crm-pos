import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModePaiement, RoleLibelle } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  CaisseDto,
  ClientDto,
  ClotureSessionResponseDto,
  LigneVenteDto,
  ProduitDto,
  RetourVenteDto,
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
  remise: number;
}

function formatMontant(valeur: number): string {
  return valeur.toFixed(2);
}

function calculerTotal(panier: LignePanier[]): number {
  return panier.reduce(
    (total, l) => total + Number(l.prixUnitaire) * l.quantite - l.remise,
    0,
  );
}

function calculerTotalBrut(panier: LignePanier[]): number {
  return panier.reduce((total, l) => total + Number(l.prixUnitaire) * l.quantite, 0);
}

// Un seul mécanisme de remise stocké côté serveur (LigneVente.remise) : la
// remise saisie au niveau du panier est distribuée proportionnellement dans
// chaque ligne avant l'envoi. Le plafond de 20% par ligne reste appliqué et
// vérifié côté serveur (VentesService.encaisserVente) — cet aperçu client
// n'est qu'un affichage, jamais une source de vérité.
function distribuerRemisePanier(panier: LignePanier[], remiseTotale: number): LignePanier[] {
  const totalBrut = calculerTotalBrut(panier);
  if (remiseTotale <= 0 || totalBrut <= 0) {
    return panier.map((l) => ({ ...l, remise: 0 }));
  }
  let cumul = 0;
  return panier.map((l, index) => {
    if (index === panier.length - 1) {
      return { ...l, remise: Number((remiseTotale - cumul).toFixed(2)) };
    }
    const montantLigne = Number(l.prixUnitaire) * l.quantite;
    const part = Number(((montantLigne / totalBrut) * remiseTotale).toFixed(2));
    cumul += part;
    return { ...l, remise: part };
  });
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
  remisePanier,
  onRemisePanierChange,
  onIncrementer,
  onDecrementer,
  onRetirer,
  onPasserAuPaiement,
}: {
  panier: LignePanier[];
  remisePanier: string;
  onRemisePanierChange: (valeur: string) => void;
  onIncrementer: (produitId: string) => void;
  onDecrementer: (produitId: string) => void;
  onRetirer: (produitId: string) => void;
  onPasserAuPaiement: () => void;
}) {
  const totalBrut = calculerTotalBrut(panier);
  const remise = Number(remisePanier) || 0;
  const totalNet = Math.max(0, totalBrut - remise);

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
      {panier.length > 0 && (
        <div className="panier-remise">
          <label htmlFor="remisePanier">Remise panier (montant, plafond 20% par ligne)</label>
          <input
            id="remisePanier"
            type="number"
            min="0"
            step="0.01"
            value={remisePanier}
            onChange={(e) => onRemisePanierChange(e.target.value)}
          />
        </div>
      )}
      <p className="panier-total">Total brut : {formatMontant(totalBrut)}</p>
      {remise > 0 && <p className="panier-total">Remise panier : −{formatMontant(remise)}</p>}
      <p className="panier-total">Total net : {formatMontant(totalNet)}</p>
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
          lignes: panier.map((l) => ({
            produitId: l.produitId,
            quantite: l.quantite,
            ...(l.remise > 0 ? { remise: l.remise } : {}),
          })),
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
      setError(
        'Échec de l’encaissement : vérifiez le stock disponible, les quantités et que la remise ne dépasse pas 20% par ligne.',
      ),
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
  const [remisePanier, setRemisePanier] = useState('');
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
          remise: 0,
        },
      ];
    });
  }

  function passerAuPaiement() {
    setPanier((prev) => distribuerRemisePanier(prev, Number(remisePanier) || 0));
    setEtape('paiement');
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
          setRemisePanier('');
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
        remisePanier={remisePanier}
        onRemisePanierChange={setRemisePanier}
        onIncrementer={incrementer}
        onDecrementer={decrementer}
        onRetirer={retirer}
        onPasserAuPaiement={passerAuPaiement}
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
        <button
          type="button"
          onClick={() =>
            void apiDownload(
              `/ventes/sessions/${session.id}/cloture/pdf`,
              `releve-session-${session.id}.pdf`,
            )
          }
        >
          Télécharger le relevé (PDF)
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

function RetourLigneForm({
  sessionId,
  ligne,
  quantiteRestante,
  onRetourEnregistre,
}: {
  sessionId: string;
  ligne: LigneVenteDto;
  quantiteRestante: number;
  onRetourEnregistre: (retour: RetourVenteDto) => void;
}) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [quantite, setQuantite] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<RetourVenteDto>(`/ventes/sessions/${sessionId}/retours`, {
        method: 'POST',
        body: JSON.stringify({ ligneVenteId: ligne.id, quantite: Number(quantite) }),
      }),
    onSuccess: (retour) => {
      setError(null);
      setOuvert(false);
      setQuantite('1');
      onRetourEnregistre(retour);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: () =>
      setError(
        'Échec du retour : quantité invalide, déjà entièrement retournée, ou session non ouverte.',
      ),
  });

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)}>
        Retourner
      </button>
    );
  }

  return (
    <span className="retour-form">
      <input
        type="number"
        min="1"
        max={quantiteRestante}
        value={quantite}
        onChange={(e) => setQuantite(e.target.value)}
      />
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Confirmer le retour
      </button>
      <button type="button" onClick={() => setOuvert(false)} disabled={mutation.isPending}>
        Annuler
      </button>
      {error && <p role="alert">{error}</p>}
    </span>
  );
}

// Retours limités à la session de caisse en cours (jamais une session déjà
// clôturée/versée) : ces boutons ne portent donc que sur les ventes de la
// session en cours affichée ici — extension au-delà du cahier des charges,
// assumée (cf. plan validé).
function VentesSessionListe({
  sessionId,
  ventes,
  retoursParLigne,
  onRetourEnregistre,
}: {
  sessionId: string;
  ventes: VenteDto[];
  retoursParLigne: Record<string, number>;
  onRetourEnregistre: (retour: RetourVenteDto) => void;
}) {
  return (
    <div className="ventes-session">
      <h3>Ventes de la session en cours</h3>
      <ul>
        {ventes.map((vente) => (
          <li key={vente.id}>
            <p>
              {new Date(vente.dateVente).toLocaleTimeString()} — {vente.montantTotal} (
              {vente.modePaiement})
            </p>
            <ul>
              {vente.lignes.map((ligne) => {
                const retourne = retoursParLigne[ligne.id] ?? 0;
                const restant = ligne.quantite - retourne;
                return (
                  <li key={ligne.id}>
                    {ligne.produit.designation} x{ligne.quantite}
                    {Number(ligne.remise) > 0 && <> (remise {ligne.remise})</>}
                    {restant > 0 ? (
                      <RetourLigneForm
                        sessionId={sessionId}
                        ligne={ligne}
                        quantiteRestante={restant}
                        onRetourEnregistre={onRetourEnregistre}
                      />
                    ) : (
                      <span> — entièrement retourné</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
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
  const [retoursParLigne, setRetoursParLigne] = useState<Record<string, number>>({});

  function enregistrerRetour(retour: RetourVenteDto) {
    setRetoursParLigne((prev) => ({
      ...prev,
      [retour.ligneVenteId]: (prev[retour.ligneVenteId] ?? 0) + retour.quantite,
    }));
  }

  return (
    <div>
      {dernierTicket ? (
        <div>
          <TicketVente vente={dernierTicket} />
          <button type="button" onClick={() => setDernierTicket(null)}>
            Nouvelle vente
          </button>
        </div>
      ) : (
        <>
          <p>
            Session ouverte le {new Date(session.ouvertureDateHeure).toLocaleString()} — fond
            initial {session.fondInitial} — {ventesSession.length} vente(s) encaissée(s)
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
        </>
      )}

      {ventesSession.length > 0 && (
        <VentesSessionListe
          sessionId={session.id}
          ventes={ventesSession}
          retoursParLigne={retoursParLigne}
          onRetourEnregistre={enregistrerRetour}
        />
      )}
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
