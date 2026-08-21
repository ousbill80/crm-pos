import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModePaiement, RoleLibelle } from '@caisse-crm/shared';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Keyboard,
  Minus,
  Pause,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { apiDownload, apiFetch, estErreurReseau, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { InfoTooltip } from '../components/InfoTooltip';
import { LoadingState } from '../components/LoadingState';
import { insightStockQuantite } from '../lib/insights/stocks';
import {
  insightCaisseAuxiliairePos,
  insightClientPos,
  insightCommandeEnAttente,
  insightEcartCloture,
  insightHorsLignePos,
  insightMonnaiePos,
  insightRemisePos,
  insightSessionPos,
  insightTemoinOuverture,
} from '../lib/insights/pos';
import {
  enqueueVente,
  flushOutbox,
  outboxVentesCount,
  quantiteReserveeOutbox,
  venteEnAttenteSync,
} from '../lib/offline/outbox';
import { loadPosCache, savePosCache } from '../lib/offline/pos-cache';
import {
  clearHolds,
  loadHolds,
  prochainLibelleAttente,
  quantiteParquee,
  saveHolds,
  type CommandeEnAttente,
} from '../lib/offline/pos-holds';
import type {
  BoutiqueDto,
  CaisseDto,
  ClientDto,
  ClotureSessionResponseDto,
  EntrepotDto,
  LigneVenteDto,
  ProduitDto,
  RetourVenteDto,
  SessionCaisseDto,
  StatutStock,
  StockQuantDto,
  VenteDto,
} from '../lib/types';

const ROLES_PERIMETRE_BOUTIQUE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const REMISE_MAX_RATIO = 0.2;
const RAPIDE_ESPECES = [500, 1000, 2000, 5000, 10000];

const MODE_META: Record<ModePaiement, { label: string; Icon: typeof Banknote }> = {
  [ModePaiement.ESPECES]: { label: 'Espèces', Icon: Banknote },
  [ModePaiement.CARTE]: { label: 'Carte', Icon: CreditCard },
  [ModePaiement.MOBILE_MONEY]: { label: 'Mobile Money', Icon: Smartphone },
};

interface LignePanier {
  produitId: string;
  designation: string;
  reference: string | null;
  prixUnitaire: string;
  stock: number;
  quantite: number;
  remise: number;
}

function formatMontant(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR');
}

function totalBrut(panier: LignePanier[]): number {
  return panier.reduce((t, l) => t + Number(l.prixUnitaire) * l.quantite, 0);
}

function totalNet(panier: LignePanier[]): number {
  return panier.reduce(
    (t, l) => t + Number(l.prixUnitaire) * l.quantite - l.remise,
    0,
  );
}

function plafondRemise(brut: number): number {
  return Number((brut * REMISE_MAX_RATIO).toFixed(2));
}

function distribuerRemise(panier: LignePanier[], remiseTotale: number): LignePanier[] {
  const brut = totalBrut(panier);
  if (remiseTotale <= 0 || brut <= 0) {
    return panier.map((l) => ({ ...l, remise: 0 }));
  }
  let cumul = 0;
  return panier.map((l, index) => {
    if (index === panier.length - 1) {
      return { ...l, remise: Number((remiseTotale - cumul).toFixed(2)) };
    }
    const ligne = Number(l.prixUnitaire) * l.quantite;
    const part = Number(((ligne / brut) * remiseTotale).toFixed(2));
    cumul += part;
    return { ...l, remise: part };
  });
}

function statutStockBoutique(stock: number, seuil: number | null): StatutStock {
  if (stock <= 0) return 'RUPTURE';
  if (seuil !== null && stock <= seuil) return 'SOUS_SEUIL';
  return 'OK';
}

function quantiteRetournee(retours: RetourVenteDto[], ligneId: string): number {
  return retours
    .filter((r) => r.ligneVenteId === ligneId)
    .reduce((s, r) => s + r.quantite, 0);
}

function idCourt(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function venteOptimiste(
  panier: LignePanier[],
  session: SessionCaisseDto,
  modePaiement: ModePaiement,
  clientId: string | null,
  clientOperationId: string,
): VenteDto {
  return {
    id: clientOperationId,
    dateVente: new Date().toISOString(),
    montantTotal: String(totalNet(panier)),
    modePaiement,
    caisseId: session.caisseId,
    sessionCaisseId: session.id,
    clientId,
    lignes: panier.map((l, index) => ({
      id: `${clientOperationId}-l${index}`,
      venteId: clientOperationId,
      produitId: l.produitId,
      produit: {
        id: l.produitId,
        designation: l.designation,
        reference: l.reference,
        categorie: null,
        description: null,
        actif: true,
        prixUnitaire: l.prixUnitaire,
        stock: l.stock,
        seuilReappro: null,
        coutMoyenPondere: '0',
        statutStock: 'OK',
        margeUnitaire: '0',
        tauxMarge: '0',
        valeurStock: '0',
      },
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      remise: String(l.remise),
    })),
  };
}

function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  useEffect(() => {
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type FiltreCatalogue = 'TOUS' | 'RUPTURE' | string;

const VENTES_VIDES: VenteDto[] = [];

function useNowTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
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

function useProduitsPos(enabled: boolean) {
  return useQuery({
    queryKey: ['produits', 'pos', { actif: true }],
    queryFn: async () => {
      const all = await apiFetch<ProduitDto[]>('/produits');
      return all.filter((p) => p.actif);
    },
    enabled,
  });
}

function useEntrepotPrincipalBoutique(
  boutiqueId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['entrepots', boutiqueId, 'principal'],
    queryFn: async () => {
      const entrepots = await apiFetch<EntrepotDto[]>(
        `/entrepots?boutiqueId=${boutiqueId}`,
      );
      const principal = entrepots.find((e) => e.type === 'PRINCIPAL' && e.actif);
      if (!principal) {
        throw new Error('Aucun entrepôt PRINCIPAL pour cette boutique.');
      }
      return principal;
    },
    enabled: enabled && !!boutiqueId,
  });
}

function useStocksEntrepot(entrepotId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['stocks', entrepotId],
    queryFn: () => apiFetch<StockQuantDto[]>(`/stocks?entrepotId=${entrepotId}`),
    enabled: enabled && !!entrepotId,
  });
}

function useClients(enabled: boolean) {
  return useQuery({
    queryKey: ['crm-clients'],
    queryFn: () => apiFetch<ClientDto[]>('/crm/clients'),
    enabled,
  });
}

function useVentesSession(sessionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['ventes-session', sessionId],
    queryFn: () => apiFetch<VenteDto[]>(`/ventes/sessions/${sessionId}/ventes`),
    enabled: enabled && !!sessionId,
  });
}

function useBoutiques(enabled: boolean) {
  return useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled,
  });
}

function PosGateCard({ children }: { children: ReactNode }) {
  return (
    <div className="pos-gate">
      <div className="pos-gate-card">{children}</div>
    </div>
  );
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
    onError: (err) =>
      setError(
        messageDepuisApi(err, 'Échec ouverture : fond initial ou témoin invalide.'),
      ),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="pos-gate">
      <form className="pos-gate-card" onSubmit={onSubmit}>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>Ouverture de session</h1>
        <p className="lead">
          Comptage contradictoire obligatoire
          <InfoTooltip insight={insightTemoinOuverture()} />
        </p>
        <p className="pos-gate-hint">
          Caisse auxiliaire — encaisser et initier uniquement
          <InfoTooltip insight={insightCaisseAuxiliairePos()} />
        </p>
        <label htmlFor="fondInitial">Fond de caisse initial</label>
        <input
          id="fondInitial"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={fondInitial}
          onChange={(e) => setFondInitial(e.target.value)}
          required
          autoFocus
        />
        <label htmlFor="temoinLogin">
          Login du témoin <InfoTooltip insight={insightTemoinOuverture()} />
        </label>
        <input
          id="temoinLogin"
          value={temoinLogin}
          onChange={(e) => setTemoinLogin(e.target.value)}
          autoComplete="off"
          required
        />
        <button type="submit" className="pos-btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ouverture…' : 'Ouvrir la caisse'}
        </button>
        {error && <p role="alert">{error}</p>}
        <Link to="/dashboard" className="pos-back-link">
          ← Tableau de bord
        </Link>
      </form>
    </div>
  );
}

function TicketVente({
  vente,
  client,
  boutiqueNom,
  caissier,
  onSuite,
}: {
  vente: VenteDto;
  client: ClientDto | null;
  boutiqueNom?: string;
  caissier: string;
  onSuite: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        onSuite();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSuite]);

  const mode = MODE_META[vente.modePaiement];

  return (
    <div className="pos-receipt">
      <div className="pos-receipt-card ticket">
        <div className="pos-receipt-brand">CaissePOS</div>
        {boutiqueNom && <p className="pos-receipt-shop">{boutiqueNom}</p>}
        <h2>Ticket {idCourt(vente.id)}</h2>
        <p className="pos-receipt-meta">
          {new Date(vente.dateVente).toLocaleString('fr-FR')} · {caissier}
        </p>
        <ul>
          {vente.lignes.map((l) => {
            const remise = Number(l.remise);
            const ligne = Number(l.prixUnitaire) * l.quantite - remise;
            return (
              <li key={l.id}>
                <span>
                  {l.produit.designation} ×{l.quantite}
                  {remise > 0 && (
                    <em className="pos-receipt-remise"> −{formatMontant(remise)}</em>
                  )}
                </span>
                <span className="money">{formatMontant(ligne)}</span>
              </li>
            );
          })}
        </ul>
        {client && (
          <p className="pos-receipt-client">
            {client.prenom} {client.nom}
            {client.fidelite ? ` · ${client.fidelite.niveau}` : ''}
          </p>
        )}
        <p className="pos-receipt-pay">{mode.label}</p>
        <p className="pos-receipt-total money">
          {formatMontant(Number(vente.montantTotal))} FCFA
        </p>
        {venteEnAttenteSync(vente.id) && (
          <p className="pos-warn" role="status">
            Ticket en attente de synchronisation — il partira à la reconnexion.
          </p>
        )}
        <div className="pos-receipt-actions no-print">
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimer
          </button>
          <button type="button" className="pos-btn-primary" onClick={onSuite}>
            Nouvelle commande
          </button>
        </div>
      </div>
    </div>
  );
}

function CloturePanel({
  session,
  ventes,
  retours,
  panierNonVide,
  commandesEnAttente,
  onFermer,
}: {
  session: SessionCaisseDto;
  ventes: VenteDto[];
  retours: RetourVenteDto[];
  panierNonVide: boolean;
  commandesEnAttente: number;
  onFermer: () => void;
}) {
  const queryClient = useQueryClient();
  const [fondCompteCloture, setFondCompteCloture] = useState('');
  const [temoinLogin, setTemoinLogin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ClotureSessionResponseDto | null>(null);

  const caEspeces = ventes
    .filter((v) => v.modePaiement === ModePaiement.ESPECES)
    .reduce((s, v) => s + Number(v.montantTotal), 0);
  const retoursEspeces = retours
    .filter((r) => {
      const v = ventes.find((x) => x.id === r.venteId);
      return v?.modePaiement === ModePaiement.ESPECES;
    })
    .reduce((s, r) => s + Number(r.montantRembourse), 0);
  const fondTheorique = Number(session.fondInitial) + caEspeces - retoursEspeces;
  const fondCompteNum = fondCompteCloture === '' ? null : Number(fondCompteCloture);

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
      setResultat(data);
      clearHolds(session.id);
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec clôture : fond compté ou témoin invalide.')),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  if (resultat) {
    return (
      <div className="pos-modal-backdrop">
        <div className="pos-modal ticket">
          <h2>Session clôturée</h2>
          <ul className="pos-cloture-releve">
            {resultat.releve.map((r) => (
              <li key={r.modePaiement}>
                {MODE_META[r.modePaiement]?.label ?? r.modePaiement} :{' '}
                <strong className="money">{formatMontant(Number(r.total))}</strong>{' '}
                ({r.nombreVentes})
              </li>
            ))}
          </ul>
          {resultat.transactionVersementId ? (
            <p>Bordereau espèces initié : {idCourt(resultat.transactionVersementId)}</p>
          ) : (
            <p>Pas de bordereau espèces (aucune vente cash nette).</p>
          )}
          <div className="pos-receipt-actions">
            <button
              type="button"
              onClick={() =>
                void apiDownload(
                  `/ventes/sessions/${session.id}/cloture/pdf`,
                  `releve-${session.id}.pdf`,
                )
              }
            >
              <Printer size={16} />
              PDF
            </button>
            <button type="button" className="pos-btn-primary" onClick={onFermer}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-modal-backdrop" onClick={onFermer} role="presentation">
      <form className="pos-modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <h2>Clôturer la session</h2>
        {panierNonVide && (
          <p className="pos-warn" role="status">
            La commande en cours n’est pas encaissée et sera perdue.
          </p>
        )}
        {commandesEnAttente > 0 && (
          <p className="pos-warn" role="status">
            {commandesEnAttente} ticket(s) en attente — reprendre ou abandonner
            avant de clôturer (rien n’a été encaissé).
            <InfoTooltip insight={insightCommandeEnAttente(commandesEnAttente)} />
          </p>
        )}
        <p className="pos-cloture-theo">
          Fond théorique {formatMontant(fondTheorique)} FCFA
          <InfoTooltip insight={insightEcartCloture(fondTheorique, fondCompteNum)} />
        </p>
        <label htmlFor="fondCompteCloture">Fond compté</label>
        <input
          id="fondCompteCloture"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={fondCompteCloture}
          onChange={(e) => setFondCompteCloture(e.target.value)}
          required
          autoFocus
        />
        <label htmlFor="temoinLoginCloture">
          Login témoin
          <InfoTooltip insight={insightTemoinOuverture()} />
        </label>
        <input
          id="temoinLoginCloture"
          value={temoinLogin}
          onChange={(e) => setTemoinLogin(e.target.value)}
          autoComplete="off"
          required
        />
        <div className="pos-receipt-actions">
          <button type="button" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="submit"
            className="pos-btn-primary"
            disabled={mutation.isPending || commandesEnAttente > 0}
          >
            Clôturer
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}

function RetourLigneForm({
  sessionId,
  ligne,
  quantiteRestante,
  onRetour,
}: {
  sessionId: string;
  ligne: LigneVenteDto;
  quantiteRestante: number;
  onRetour: (retour: RetourVenteDto) => void;
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
      setOuvert(false);
      setQuantite('1');
      onRetour(retour);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['ventes-session'] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Retour impossible.')),
  });

  if (!ouvert) {
    return (
      <button type="button" className="pos-btn-ghost" onClick={() => setOuvert(true)}>
        Retour
      </button>
    );
  }

  return (
    <span className="pos-retour-inline">
      <input
        type="number"
        min={1}
        max={quantiteRestante}
        value={quantite}
        onChange={(e) => setQuantite(e.target.value)}
        aria-label="Quantité à retourner"
      />
      <button
        type="button"
        className="pos-btn-primary pos-btn-compact"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        OK
      </button>
      <button type="button" onClick={() => setOuvert(false)} aria-label="Annuler">
        <X size={14} />
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

function ClientPicker({
  clients,
  clientId,
  onChange,
}: {
  clients: ClientDto[];
  clientId: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = clients.find((c) => c.id === clientId) ?? null;

  const filtres = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = !s
      ? clients
      : clients.filter((c) =>
          `${c.nom} ${c.prenom} ${c.contact ?? ''}`.toLowerCase().includes(s),
        );
    return list.slice(0, 12);
  }, [clients, q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="pos-client" ref={wrapRef}>
      <label htmlFor="pos-client-search">
        Client (optionnel)
        <InfoTooltip insight={insightClientPos(selected)} />
      </label>
      {selected ? (
        <div className="pos-client-chip">
          <div>
            <strong>
              {selected.prenom} {selected.nom}
            </strong>
            <span>
              {selected.segment} · {selected.fidelite?.niveau ?? 'BRONZE'} ·{' '}
              {selected.fidelite?.pointsCumules ?? 0} pts
            </span>
          </div>
          <button type="button" className="pos-btn-ghost" onClick={() => onChange('')}>
            Anonyme
          </button>
        </div>
      ) : (
        <>
          <input
            id="pos-client-search"
            type="search"
            placeholder="Rechercher — laisser vide = anonyme"
            value={q}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open && (
            <ul className="pos-client-list" role="listbox">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setQ('');
                    setOpen(false);
                  }}
                >
                  Client anonyme
                </button>
              </li>
              {filtres.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setQ('');
                      setOpen(false);
                    }}
                  >
                    <strong>
                      {c.prenom} {c.nom}
                    </strong>
                    <small>
                      {c.segment} · {c.fidelite?.niveau ?? 'BRONZE'} ·{' '}
                      {c.fidelite?.pointsCumules ?? 0} pts
                    </small>
                  </button>
                </li>
              ))}
              {filtres.length === 0 && <li className="pos-empty">Aucun client.</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function NumpadEspeces({
  recu,
  onChange,
}: {
  recu: string;
  onChange: (v: string) => void;
}) {
  function tap(digit: string) {
    if (digit === 'C') {
      onChange('');
      return;
    }
    if (digit === '⌫') {
      onChange(recu.slice(0, -1));
      return;
    }
    onChange(recu === '0' ? digit : recu + digit);
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  return (
    <div className="pos-numpad" role="group" aria-label="Pavé numérique espèces">
      {touches.map((t) => (
        <button key={t} type="button" onClick={() => tap(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

function PaiementScreen({
  panier,
  session,
  clients,
  onAnnuler,
  onMettreEnAttente,
  onVente,
}: {
  panier: LignePanier[];
  session: SessionCaisseDto;
  clients: ClientDto[];
  onAnnuler: () => void;
  onMettreEnAttente: () => void;
  onVente: (vente: VenteDto, client: ClientDto | null) => void;
}) {
  const queryClient = useQueryClient();
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.ESPECES);
  const [clientId, setClientId] = useState('');
  const [recu, setRecu] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = totalNet(panier);
  const recuNum = Number(recu) || 0;
  const especeOk = modePaiement !== ModePaiement.ESPECES || recuNum >= total;
  const client = clients.find((c) => c.id === clientId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      const clientOperationId = crypto.randomUUID();
      const payload = {
        lignes: panier.map((l) => ({
          produitId: l.produitId,
          quantite: l.quantite,
          ...(l.remise > 0 ? { remise: l.remise } : {}),
        })),
        modePaiement,
        ...(clientId ? { clientId } : {}),
        clientOperationId,
      };
      if (!navigator.onLine) {
        enqueueVente(session.id, payload);
        return venteOptimiste(
          panier,
          session,
          modePaiement,
          clientId || null,
          clientOperationId,
        );
      }
      try {
        return await apiFetch<VenteDto>(`/ventes/sessions/${session.id}/ventes`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (estErreurReseau(err)) {
          enqueueVente(session.id, payload);
          return venteOptimiste(
            panier,
            session,
            modePaiement,
            clientId || null,
            clientOperationId,
          );
        }
        throw err;
      }
    },
    onSuccess: (vente) => {
      onVente(vente, client);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['ventes-session'] });
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Encaissement refusé (stock / remise max 20 %).')),
  });

  function valider() {
    if (!especeOk || mutation.isPending) return;
    mutation.mutate();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !mutation.isPending) {
        onAnnuler();
        return;
      }
      if (e.key === 'F3' && !mutation.isPending) {
        e.preventDefault();
        onMettreEnAttente();
        return;
      }
      if ((e.key === 'Enter' && e.ctrlKey) || e.key === 'F4') {
        e.preventDefault();
        if (!especeOk || mutation.isPending) return;
        mutation.mutate();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mutation, mutation.isPending, onAnnuler, onMettreEnAttente, especeOk]);

  const rendu = recuNum - total;

  return (
    <div className="pos-payment">
      <div className="pos-payment-main">
        <div className="pos-payment-nav">
          <button type="button" className="pos-btn-ghost pos-back-cmd" onClick={onAnnuler}>
            <ArrowLeft size={16} />
            Retour commande
          </button>
          <button
            type="button"
            className="pos-btn-ghost pos-back-cmd"
            disabled={mutation.isPending}
            onClick={onMettreEnAttente}
          >
            <Pause size={16} />
            Mettre en attente
          </button>
        </div>
        <h1>Paiement</h1>
        <p className="pos-payment-amount money">{formatMontant(total)} FCFA</p>
        <div className="pos-payment-methods">
          {Object.values(ModePaiement).map((m) => {
            const meta = MODE_META[m];
            const Icon = meta.Icon;
            return (
              <button
                key={m}
                type="button"
                className={m === modePaiement ? 'pos-pay-method is-active' : 'pos-pay-method'}
                onClick={() => setModePaiement(m)}
              >
                <Icon size={22} strokeWidth={2} />
                {meta.label}
              </button>
            );
          })}
        </div>

        {modePaiement === ModePaiement.ESPECES && (
          <div className="pos-cash">
            <div className="pos-cash-head">
              <div>
                <span>Reçu</span>
                <strong className="money">{formatMontant(recuNum)} FCFA</strong>
              </div>
              <div>
                <span>
                  Monnaie
                  <InfoTooltip insight={insightMonnaiePos(recuNum, total)} />
                </span>
                <strong className={rendu < 0 ? 'money pos-neg' : 'money'}>
                  {rendu < 0 ? '—' : `${formatMontant(rendu)} FCFA`}
                </strong>
              </div>
            </div>
            <div className="pos-cash-rapide">
              <button type="button" onClick={() => setRecu(String(Math.round(total)))}>
                Exact
              </button>
              {RAPIDE_ESPECES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRecu(String((Number(recu) || 0) + n))}
                >
                  +{formatMontant(n)}
                </button>
              ))}
            </div>
            <NumpadEspeces recu={recu} onChange={setRecu} />
          </div>
        )}

        <ClientPicker clients={clients} clientId={clientId} onChange={setClientId} />
        {error && <p role="alert">{error}</p>}
      </div>
      <aside className="pos-payment-side">
        <ul className="pos-order-lines">
          {panier.map((l) => (
            <li key={l.produitId}>
              <div>
                <strong>{l.designation}</strong>
                <span>
                  {l.quantite} × {formatMontant(Number(l.prixUnitaire))}
                  {l.remise > 0 ? ` − ${formatMontant(l.remise)}` : ''}
                </span>
              </div>
              <span className="money">
                {formatMontant(Number(l.prixUnitaire) * l.quantite - l.remise)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="pos-pay-btn"
          disabled={!especeOk || mutation.isPending}
          onClick={valider}
        >
          {mutation.isPending ? 'Validation…' : `Valider · ${formatMontant(total)}`}
        </button>
      </aside>
    </div>
  );
}

function PosCaisse({
  session,
  produits,
  clients,
  userLogin,
  boutiqueNom,
}: {
  session: SessionCaisseDto;
  produits: ProduitDto[];
  clients: ClientDto[];
  userLogin: string;
  boutiqueNom?: string;
}) {
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [remisePanier, setRemisePanier] = useState('');
  const [holds, setHolds] = useState<CommandeEnAttente[]>(() => loadHolds(session.id));
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreCatalogue>('TOUS');
  const [etape, setEtape] = useState<'caisse' | 'paiement'>('caisse');
  const [ticket, setTicket] = useState<VenteDto | null>(null);
  const [ticketClient, setTicketClient] = useState<ClientDto | null>(null);
  const [cloture, setCloture] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNowTick(30_000);
  const queryClient = useQueryClient();
  const online = useOnline();
  const [pending, setPending] = useState(() => outboxVentesCount(session.id));
  const clientsDisponibles = useMemo(() => {
    if (online) return clients;
    return loadPosCache(session.id)?.clients ?? clients;
  }, [online, session.id, clients]);

  useEffect(() => {
    if (online) savePosCache(session.id, produits, clients);
  }, [online, session.id, produits, clients]);
  const { data: ventesChargees } = useVentesSession(session.id, online);
  const ventes = ventesChargees ?? VENTES_VIDES;
  const retours = useMemo(
    () => ventes.flatMap((v) => v.retours ?? []),
    [ventes],
  );

  useEffect(() => {
    saveHolds(session.id, holds);
  }, [holds, session.id]);

  useEffect(() => {
    async function sync() {
      setPending(outboxVentesCount(session.id));
      if (!navigator.onLine) return;
      const result = await flushOutbox((path, body) =>
        apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
      );
      setPending(outboxVentesCount(session.id));
      if (result.flushed > 0) {
        void queryClient.invalidateQueries({ queryKey: ['ventes-session'] });
        void queryClient.invalidateQueries({ queryKey: ['produits'] });
        void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      }
    }
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [queryClient, session.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of produits) {
      if (p.categorie) set.add(p.categorie);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [produits]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return produits.filter((p) => {
      if (filtre === 'RUPTURE' && p.stock > 0) return false;
      if (filtre !== 'TOUS' && filtre !== 'RUPTURE' && p.categorie !== filtre) {
        return false;
      }
      if (!q) return true;
      return (
        p.designation.toLowerCase().includes(q) ||
        (p.reference?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [produits, recherche, filtre]);

  const brut = totalBrut(panier);
  const remise = Number(remisePanier) || 0;
  const plafond = plafondRemise(brut);
  const remiseDepasse = remise > plafond;
  const net = Math.max(0, brut - (remiseDepasse ? 0 : remise));
  const caSession = ventes.reduce((s, v) => s + Number(v.montantTotal), 0);
  const dureeMinutes = Math.max(
    0,
    Math.floor((now - new Date(session.ouvertureDateHeure).getTime()) / 60_000),
  );

  function stockDisponible(produitId: string, stockCatalogue: number): number {
    return (
      stockCatalogue -
      quantiteReserveeOutbox(session.id, produitId) -
      quantiteParquee(holds, produitId)
    );
  }

  function ajouter(p: ProduitDto) {
    const dispo = stockDisponible(p.id, p.stock);
    if (dispo <= 0 || !p.actif) return;
    setPanier((prev) => {
      const ex = prev.find((l) => l.produitId === p.id);
      if (ex) {
        if (ex.quantite >= dispo) return prev;
        return prev.map((l) =>
          l.produitId === p.id ? { ...l, quantite: l.quantite + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          produitId: p.id,
          designation: p.designation,
          reference: p.reference,
          prixUnitaire: p.prixUnitaire,
          stock: dispo,
          quantite: 1,
          remise: 0,
        },
      ];
    });
  }

  function mettreEnAttente() {
    if (panier.length === 0) return;
    const hold: CommandeEnAttente = {
      id: crypto.randomUUID(),
      libelle: prochainLibelleAttente(holds),
      panier,
      remisePanier,
      createdAt: new Date().toISOString(),
    };
    setHolds((prev) => [...prev, hold]);
    setPanier([]);
    setRemisePanier('');
    setEtape('caisse');
  }

  function reprendre(id: string) {
    const hold = holds.find((h) => h.id === id);
    if (!hold) return;
    const autres = holds.filter((h) => h.id !== id);
    const restaure: LignePanier[] = [];
    for (const ligne of hold.panier) {
      const p = produits.find((x) => x.id === ligne.produitId);
      if (!p?.actif) continue;
      const dispo =
        p.stock -
        quantiteReserveeOutbox(session.id, p.id) -
        quantiteParquee(autres, p.id);
      const quantite = Math.min(ligne.quantite, Math.max(0, dispo));
      if (quantite <= 0) continue;
      restaure.push({ ...ligne, quantite, stock: dispo });
    }
    if (restaure.length === 0) {
      window.alert(
        'Impossible de reprendre ce ticket : stock insuffisant ou produits inactifs.',
      );
      return;
    }
    if (restaure.length < hold.panier.length) {
      window.alert(
        'Certains articles de ce ticket ne sont plus disponibles : le panier a été ajusté.',
      );
    }
    if (panier.length > 0) {
      const courant: CommandeEnAttente = {
        id: crypto.randomUUID(),
        libelle: prochainLibelleAttente(autres),
        panier,
        remisePanier,
        createdAt: new Date().toISOString(),
      };
      setHolds([...autres, courant]);
    } else {
      setHolds(autres);
    }
    setPanier(restaure);
    setRemisePanier(hold.remisePanier);
    setEtape('caisse');
  }

  function abandonnerAttente(id: string) {
    if (
      !window.confirm(
        'Abandonner ce ticket en attente ? Rien n’a été encaissé ; le panier sera perdu.',
      )
    ) {
      return;
    }
    setHolds((prev) => prev.filter((h) => h.id !== id));
  }

  function allerPaiement() {
    if (panier.length === 0 || remiseDepasse) return;
    setPanier((prev) => distribuerRemise(prev, Number(remisePanier) || 0));
    setEtape('paiement');
  }

  function onSearchKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = recherche.trim().toLowerCase();
    if (!q) return;
    const exact = produits.find(
      (p) => p.reference && p.reference.toLowerCase() === q && p.stock > 0,
    );
    if (exact) {
      ajouter(exact);
      setRecherche('');
      return;
    }
    if (filtres.length === 1 && filtres[0]!.stock > 0) {
      ajouter(filtres[0]!);
      setRecherche('');
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (etape !== 'caisse' || ticket) return;
      if (e.key === 'Escape') {
        if (cloture) {
          setCloture(false);
          return;
        }
        if (drawer) setDrawer(false);
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (panier.length === 0) return;
        mettreEnAttente();
        return;
      }
      if ((e.key === 'Enter' && e.ctrlKey) || e.key === 'F4') {
        e.preventDefault();
        if (panier.length === 0 || remiseDepasse) return;
        setPanier((prev) => distribuerRemise(prev, Number(remisePanier) || 0));
        setEtape('paiement');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    etape,
    ticket,
    cloture,
    drawer,
    panier,
    remisePanier,
    holds,
    remiseDepasse,
  ]);

  if (ticket) {
    return (
      <TicketVente
        vente={ticket}
        client={ticketClient}
        boutiqueNom={boutiqueNom}
        caissier={userLogin}
        onSuite={() => {
          setTicket(null);
          setTicketClient(null);
        }}
      />
    );
  }

  if (etape === 'paiement') {
    return (
      <PaiementScreen
        panier={panier}
        session={session}
        clients={clientsDisponibles}
        onAnnuler={() => setEtape('caisse')}
        onMettreEnAttente={mettreEnAttente}
        onVente={(vente, client) => {
          setPanier([]);
          setRemisePanier('');
          setEtape('caisse');
          setTicketClient(client);
          setTicket(vente);
          setPending(outboxVentesCount(session.id));
        }}
      />
    );
  }

  return (
    <div className="pos-shell">
      <header className="pos-topbar">
        <Link to="/dashboard" className="pos-topbar-back" title="Quitter la caisse">
          <ArrowLeft size={18} />
        </Link>
        <div className="pos-topbar-title">
          <strong>
            {boutiqueNom ?? 'CaissePOS'}{' '}
            <InfoTooltip insight={insightCaisseAuxiliairePos()} />
          </strong>
          <span>
            {userLogin} · fond {formatMontant(Number(session.fondInitial))} ·{' '}
            {ventes.length} vente(s) · {formatMontant(caSession)} FCFA · {dureeMinutes} min
            <InfoTooltip
              insight={insightSessionPos({
                nombreVentes: ventes.length,
                chiffreAffaires: caSession,
                dureeMinutes,
              })}
            />
          </span>
        </div>
        <p className="pos-shortcuts-hint" title="Raccourcis">
          <Keyboard size={13} />
          F2 recherche · F3 attente · F4 / Ctrl+Entrée paiement · Échap
        </p>
        <div className="pos-topbar-actions">
          <span className="pos-online-chip" title={online ? 'En ligne' : 'Hors ligne'}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            {pending > 0 ? pending : null}
            <InfoTooltip insight={insightHorsLignePos(pending, online)} />
          </span>
          <button
            type="button"
            disabled={panier.length === 0}
            title="Mettre la commande en attente et servir le client suivant (F3)"
            onClick={mettreEnAttente}
          >
            <Pause size={15} />
            En attente
            {holds.length > 0 && <span className="pos-topbar-count">{holds.length}</span>}
          </button>
          <button type="button" onClick={() => setDrawer((d) => !d)}>
            <ShoppingCart size={15} />
            Commandes
            {ventes.length > 0 && <span className="pos-topbar-count">{ventes.length}</span>}
          </button>
          <button
            type="button"
            disabled={pending > 0 || holds.length > 0}
            title={
              pending > 0
                ? 'Clôture bloquée tant que des ventes sont en file hors-ligne'
                : holds.length > 0
                  ? 'Clôture bloquée tant que des tickets sont en attente'
                  : 'Clôturer la session'
            }
            onClick={() => setCloture(true)}
          >
            Clôturer
          </button>
        </div>
      </header>
      {(!online || pending > 0) && (
        <div className="pos-offline-banner" role="status">
          {online
            ? `${pending} ticket(s) en attente de synchronisation.`
            : 'Hors ligne — les encaissements iront en file locale (§6.7).'}
        </div>
      )}

      <div className="pos-workspace">
        <section className="pos-catalog">
          <div className="pos-search-bar">
            <Search size={18} className="pos-search-icon" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Produit, SKU ou code-barres…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={onSearchKey}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="pos-chips" role="tablist" aria-label="Catégories">
            <button
              type="button"
              className={filtre === 'TOUS' ? 'is-active' : undefined}
              onClick={() => setFiltre('TOUS')}
            >
              Tous
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={filtre === c ? 'is-active' : undefined}
                onClick={() => setFiltre(c)}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className={filtre === 'RUPTURE' ? 'is-active pos-chip-warn' : 'pos-chip-warn'}
              onClick={() => setFiltre('RUPTURE')}
            >
              Rupture
            </button>
          </div>
          <div className="pos-product-grid">
            {filtres.map((p) => {
              const qte = panier.find((l) => l.produitId === p.id)?.quantite ?? 0;
              const restant = stockDisponible(p.id, p.stock) - qte;
              const epuise = restant <= 0;
              const statut = statutStockBoutique(restant, p.seuilReappro);
              return (
                <div key={p.id} className="pos-tile-wrap">
                  <button
                    type="button"
                    className={
                      epuise
                        ? 'pos-tile is-empty'
                        : statut === 'SOUS_SEUIL'
                          ? 'pos-tile is-low'
                          : 'pos-tile'
                    }
                    disabled={epuise}
                    onClick={() => ajouter(p)}
                  >
                    {p.categorie && <span className="pos-tile-cat">{p.categorie}</span>}
                    <span className="pos-tile-name">{p.designation}</span>
                    {p.reference && <span className="pos-tile-sku">{p.reference}</span>}
                    <span className="pos-tile-price money">
                      {formatMontant(Number(p.prixUnitaire))}
                    </span>
                    <span className="pos-tile-stock">
                      {epuise ? 'Rupture' : `Stock ${restant}`}
                    </span>
                    {qte > 0 && <span className="pos-tile-badge">{qte}</span>}
                  </button>
                  {(epuise || statut === 'SOUS_SEUIL') && (
                    <span className="pos-tile-tip">
                      <InfoTooltip insight={insightStockQuantite(restant, p.seuilReappro)} />
                    </span>
                  )}
                </div>
              );
            })}
            {filtres.length === 0 && (
              <p className="pos-empty">Aucun produit pour ce filtre.</p>
            )}
          </div>
        </section>

        <aside className="pos-ticket">
          {holds.length > 0 && (
            <ul className="pos-holds" aria-label="Tickets en attente">
              {holds.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="pos-hold-chip"
                    onClick={() => reprendre(h.id)}
                    title="Reprendre ce ticket"
                  >
                    <Pause size={13} />
                    <span>
                      {h.libelle} · {formatMontant(totalNet(h.panier))}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pos-hold-drop"
                    aria-label={`Abandonner ${h.libelle}`}
                    onClick={() => abandonnerAttente(h.id)}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pos-ticket-header">
            Commande en cours
            <InfoTooltip insight={insightCommandeEnAttente(holds.length)} />
          </div>
          <ul className="pos-order-lines">
            {panier.length === 0 ? (
              <li className="pos-order-empty">
                {holds.length > 0
                  ? 'Touchez un produit, ou reprenez un ticket en attente'
                  : 'Touchez un produit ou scannez un code'}
              </li>
            ) : (
              panier.map((l) => (
                <li key={l.produitId}>
                  <div className="pos-order-line-main">
                    <strong>{l.designation}</strong>
                    <span className="money">
                      {formatMontant(Number(l.prixUnitaire) * l.quantite)}
                    </span>
                  </div>
                  <div className="pos-order-line-qty">
                    <button
                      type="button"
                      aria-label="Diminuer"
                      onClick={() =>
                        setPanier((prev) =>
                          prev
                            .map((x) =>
                              x.produitId === l.produitId
                                ? { ...x, quantite: x.quantite - 1 }
                                : x,
                            )
                            .filter((x) => x.quantite > 0),
                        )
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <span>{l.quantite}</span>
                    <button
                      type="button"
                      aria-label="Augmenter"
                      disabled={
                        l.quantite >=
                        stockDisponible(
                          l.produitId,
                          produits.find((p) => p.id === l.produitId)?.stock ?? l.stock,
                        )
                      }
                      onClick={() =>
                        setPanier((prev) => {
                          const maxQte = stockDisponible(
                            l.produitId,
                            produits.find((p) => p.id === l.produitId)?.stock ?? l.stock,
                          );
                          return prev.map((x) =>
                            x.produitId === l.produitId && x.quantite < maxQte
                              ? { ...x, quantite: x.quantite + 1 }
                              : x,
                          );
                        })
                      }
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="pos-btn-ghost"
                      onClick={() =>
                        setPanier((prev) => prev.filter((x) => x.produitId !== l.produitId))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="pos-ticket-footer">
            <label htmlFor="remisePanier">
              Remise (plafond {formatMontant(plafond)} FCFA)
              <InfoTooltip insight={insightRemisePos(remise, brut)} />
            </label>
            <input
              id="remisePanier"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={remisePanier}
              onChange={(e) => setRemisePanier(e.target.value)}
              disabled={panier.length === 0}
            />
            {remiseDepasse && (
              <p className="pos-warn" role="alert">
                Remise au-dessus du plafond 20 % — encaissement bloqué.
              </p>
            )}
            <div className="pos-order-totals">
              <div>
                <span>Sous-total</span>
                <span className="money">{formatMontant(brut)}</span>
              </div>
              {remise > 0 && !remiseDepasse && (
                <div>
                  <span>Remise</span>
                  <span className="money">−{formatMontant(remise)}</span>
                </div>
              )}
              <div className="pos-order-total">
                <span>Total</span>
                <span className="money">{formatMontant(net)} FCFA</span>
              </div>
            </div>
            {panier.length > 0 && (
              <button
                type="button"
                className="pos-hold-btn"
                onClick={mettreEnAttente}
              >
                <Pause size={16} />
                Mettre en attente
              </button>
            )}
            {panier.length > 0 && (
              <button
                type="button"
                className="pos-btn-ghost pos-clear"
                onClick={() => {
                  if (window.confirm('Vider la commande en cours ?')) {
                    setPanier([]);
                    setRemisePanier('');
                  }
                }}
              >
                Vider le panier
              </button>
            )}
            <button
              type="button"
              className="pos-pay-btn"
              disabled={panier.length === 0 || remiseDepasse}
              onClick={allerPaiement}
            >
              Paiement{panier.length > 0 ? ` · ${formatMontant(net)}` : ''}
            </button>
          </div>
        </aside>

        {drawer && (
          <div className="pos-orders-drawer">
            <div className="pos-orders-drawer-head">
              <h3>Ventes session</h3>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <p className="pos-drawer-kpis">
              {ventes.length} ticket(s) · {formatMontant(caSession)} FCFA
            </p>
            {ventes.length === 0 ? (
              <p className="pos-empty">Aucune vente pour l’instant.</p>
            ) : (
              <ul className="pos-orders-list">
                {ventes.map((vente) => (
                  <li key={vente.id}>
                    <div className="pos-orders-list-head">
                      <span>
                        {new Date(vente.dateVente).toLocaleTimeString('fr-FR')} ·{' '}
                        {MODE_META[vente.modePaiement].label}
                      </span>
                      <strong className="money">
                        {formatMontant(Number(vente.montantTotal))}
                      </strong>
                    </div>
                    <ul>
                      {vente.lignes.map((ligne) => {
                        const retourne = quantiteRetournee(retours, ligne.id);
                        const restant = ligne.quantite - retourne;
                        return (
                          <li key={ligne.id}>
                            {ligne.produit.designation} ×{ligne.quantite}
                            {restant > 0 ? (
                              <RetourLigneForm
                                sessionId={session.id}
                                ligne={ligne}
                                quantiteRestante={restant}
                                onRetour={() => undefined}
                              />
                            ) : (
                              <span className="pos-retour-done"> retourné</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      className="pos-btn-ghost"
                      onClick={() => {
                        setTicketClient(
                          clientsDisponibles.find((c) => c.id === vente.clientId) ??
                            null,
                        );
                        setTicket(vente);
                      }}
                    >
                      Réimprimer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {cloture && (
        <CloturePanel
          session={session}
          ventes={ventes}
          retours={retours}
          panierNonVide={panier.length > 0}
          commandesEnAttente={holds.length}
          onFermer={() => setCloture(false)}
        />
      )}
    </div>
  );
}

export function PosPage() {
  const { user } = useAuth();
  const peut = user !== null && ROLES_PERIMETRE_BOUTIQUE.includes(user.role);

  const { data: caisses, isLoading: loadingCaisses } = useCaisses(peut);
  const caisse = caisses?.find(
    (c) => c.type === 'AUXILIAIRE' && c.boutiqueId === user?.boutiqueId,
  );

  const { data: sessions, isLoading: loadingSessions } = useSessions(peut && !!caisse);
  const session = sessions?.find(
    (s) => s.caisseId === caisse?.id && s.statut === 'OUVERTE',
  );

  const { data: produits } = useProduitsPos(peut && !!session);
  const { data: entrepotPos } = useEntrepotPrincipalBoutique(
    caisse?.boutiqueId,
    peut && !!session,
  );
  const { data: stocksPos } = useStocksEntrepot(
    entrepotPos?.id,
    peut && !!session && !!entrepotPos,
  );
  const { data: clients } = useClients(peut && !!session);
  const { data: boutiques } = useBoutiques(peut);
  const boutiqueNom = boutiques?.find((b) => b.id === user?.boutiqueId)?.nom;

  const produitsEntrepot =
    produits && stocksPos
      ? produits.map((p) => {
          const stock = stocksPos.find((q) => q.produitId === p.id)?.quantite ?? 0;
          return {
            ...p,
            stock,
            statutStock: statutStockBoutique(stock, p.seuilReappro),
          };
        })
      : undefined;

  if (!peut) {
    return (
      <PosGateCard>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>Point de vente</h1>
        <p>Réservé Caissier / Responsable boutique.</p>
        <Link to="/dashboard" className="pos-back-link">
          ← Tableau de bord
        </Link>
      </PosGateCard>
    );
  }

  if (loadingCaisses || loadingSessions) {
    return (
      <div className="pos-gate">
        <LoadingState label="Chargement de la caisse…" />
      </div>
    );
  }

  if (!caisse) {
    return (
      <PosGateCard>
          <h1>
            Aucune caisse auxiliaire <InfoTooltip insight={insightCaisseAuxiliairePos()} />
          </h1>
          <p>Pas de caisse boutique liée à votre compte.</p>
        <Link to="/dashboard" className="pos-back-link">
          ← Tableau de bord
        </Link>
      </PosGateCard>
    );
  }

  if (!session) {
    return <OuvertureSessionForm caisseId={caisse.id} />;
  }

  if (!produitsEntrepot || !clients || !user) {
    return (
      <div className="pos-gate">
        <LoadingState label="Chargement du catalogue…" />
      </div>
    );
  }

  return (
    <PosCaisse
      session={session}
      produits={produitsEntrepot}
      clients={clients}
      userLogin={user.login}
      boutiqueNom={boutiqueNom}
    />
  );
}
