import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ModePaiement,
  RAPIDE_ESPECES,
  RoleLibelle,
  ROLES_INITIATION_SORTIE_FONDS,
  TypeCaisse,
  appliquerChiffreNumpad,
  completerPartMixte,
  montantRestePart,
  resteARepartir,
  syntheseEncaissement,
  toggleModePaiement,
} from '@caisse-crm/shared';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  FileText,
  Minus,
  Pause,
  Plus,
  Printer,
  Repeat,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  debitEspecesRetours,
  libellePaiements,
  paiementsEffectifs,
  partEspeces,
} from '../lib/paiement-vente';
import {
  apiFetch,
  codeDepuisApi,
  estErreurReseau,
  messageDepuisApi,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { InfoTooltip } from '../components/InfoTooltip';
import { MajorBrandMark } from '../components/MajorBrandMark';
import { LoadingState } from '../components/LoadingState';
import { insightStockQuantite } from '../lib/insights/stocks';
import {
  insightCaisseAuxiliairePos,
  insightClientPos,
  insightCommandeEnAttente,
  insightEcartCloture,
  insightHorsLignePos,
  insightMonnaiePos,
  insightPaiementMixte,
  insightRemisePos,
  insightSessionPos,
  insightTemoinOuverture,
} from '../lib/insights/pos';
import {
  enqueueLiberation,
  enqueueReservation,
  enqueueVente,
  hydrateOutbox,
  outboxVentesCount,
  quantiteReserveeOutbox,
  venteEnAttenteSync,
} from '../lib/offline/outbox';
import { sAbonnerSync } from '../lib/offline/auto-sync';
import {
  CouponAttente,
  FileAttenteCaisse,
  ParkDialog,
  PosConfirm,
  PosNotice,
  RailAttente,
  nomClientPos,
} from '../components/pos/AttenteCaisse';
import { EtatCaissePrint } from '../components/pos/EtatCaissePrint';
import { PosJourneeFermee } from '../components/pos/PosJourneeFermee';
import { derniereSessionFermee } from '../lib/pos-journee-fermee';
import {
  appliquerTouchePistolet,
  bipScan,
  etatPistoletVide,
  produitContientRechercheCaisse,
  resoudreScanCaisse,
} from '../lib/pos-scan';
import { loadPosCache, savePosCache, hydratePosCache } from '../lib/offline/pos-cache';
import {
  clearHolds,
  formatNumeroAttente,
  loadHolds,
  hydrateHolds,
  holdsDepuisApi,
  payloadReservation,
  prochainNumero,
  quantiteParquee,
  saveHolds,
  type CommandeEnAttente,
  type MotifAttente,
} from '../lib/offline/pos-holds';
import type {
  BoutiqueDto,
  CaisseDto,
  ClientDto,
  ClotureSessionResponseDto,
  EntrepotDto,
  EtatSessionDto,
  LigneVenteDto,
  ProduitDto,
  RetourVenteDto,
  SessionCaisseDto,
  SocieteDto,
  TemoinEligibleDto,
  StatutStock,
  StockQuantDto,
  VenteDto,
} from '../lib/types';

const ROLES_PERIMETRE_BOUTIQUE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const REMISE_MAX_RATIO = 0.2;

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

/** FCFA : arrondi à l’unité (aligné mobile / caisse). */
function arrondiFcfa(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function totalBrut(panier: LignePanier[]): number {
  return panier.reduce(
    (t, l) => t + arrondiFcfa(Number(l.prixUnitaire) * l.quantite),
    0,
  );
}

function totalNet(panier: LignePanier[]): number {
  return panier.reduce(
    (t, l) =>
      t +
      Math.max(
        0,
        arrondiFcfa(Number(l.prixUnitaire) * l.quantite) - arrondiFcfa(l.remise),
      ),
    0,
  );
}

function plafondRemise(brut: number): number {
  return arrondiFcfa(brut * REMISE_MAX_RATIO);
}

function montantRemiseDepuisPourcent(brut: number, pourcent: number): number {
  if (brut <= 0 || pourcent <= 0) return 0;
  const pct = Math.min(pourcent, REMISE_MAX_RATIO * 100);
  return arrondiFcfa((brut * pct) / 100);
}

function distribuerRemise(panier: LignePanier[], remiseTotale: number): LignePanier[] {
  const brut = totalBrut(panier);
  if (remiseTotale <= 0 || brut <= 0) {
    return panier.map((l) => ({ ...l, remise: 0 }));
  }
  const plafond = Math.min(arrondiFcfa(remiseTotale), brut);
  let cumul = 0;
  return panier.map((l, index) => {
    if (index === panier.length - 1) {
      return { ...l, remise: Math.max(0, plafond - cumul) };
    }
    const ligne = arrondiFcfa(Number(l.prixUnitaire) * l.quantite);
    const part = arrondiFcfa((ligne / brut) * plafond);
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
  paiements?: Array<{ modePaiement: ModePaiement; montant: number }>,
): VenteDto {
  const total = String(totalNet(panier));
  return {
    id: clientOperationId,
    dateVente: new Date().toISOString(),
    montantTotal: total,
    modePaiement,
    caisseId: session.caisseId,
    sessionCaisseId: session.id,
    clientId,
    paiements: (paiements && paiements.length > 0
      ? paiements
      : [{ modePaiement, montant: Number(total) }]
    ).map((p) => ({
      modePaiement: p.modePaiement,
      montant: String(p.montant),
    })),
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

function useTemoinsEligibles(enabled: boolean) {
  return useQuery({
    queryKey: ['ventes-temoins-eligibles'],
    queryFn: () => apiFetch<TemoinEligibleDto[]>('/ventes/temoins-eligibles'),
    enabled,
  });
}

const FONDS_RAPIDES = [0, 5_000, 10_000, 20_000, 50_000];
const DENOMINATIONS_FCFA = [
  10_000, 5_000, 2_000, 1_000, 500, 250, 200, 100, 50, 25, 10, 5,
] as const;

function ComptageDenominations({
  onTotalChange,
}: {
  onTotalChange: (total: number) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [ouvert, setOuvert] = useState(false);

  const total = DENOMINATIONS_FCFA.reduce(
    (s, d) => s + d * (counts[d] ?? 0),
    0,
  );

  function maj(denom: number, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...counts, [denom]: n };
    setCounts(next);
    const sum = DENOMINATIONS_FCFA.reduce(
      (s, d) => s + d * (next[d] ?? 0),
      0,
    );
    onTotalChange(sum);
  }

  function reset() {
    setCounts({});
    onTotalChange(0);
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        className="pos-open-detail-toggle"
        onClick={() => setOuvert(true)}
      >
        Comptage billets / pièces…
      </button>
    );
  }

  return (
    <div className="pos-denoms">
      <div className="pos-denoms-head">
        <span>Coupures</span>
        <strong className="money pos-denoms-total">{total.toLocaleString('fr-FR')} F</strong>
        <button type="button" className="pos-btn-ghost" onClick={reset}>
          Remise à zéro
        </button>
        <button
          type="button"
          className="pos-btn-ghost"
          onClick={() => setOuvert(false)}
        >
          Masquer
        </button>
      </div>
      <div className="pos-denoms-grid">
        {DENOMINATIONS_FCFA.map((d) => (
          <label key={d} className="pos-denom-row">
            <span>{d.toLocaleString('fr-FR')} F</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={counts[d] ?? ''}
              placeholder="0"
              onChange={(e) => maj(d, e.target.value)}
            />
            <em className="money">
              {((counts[d] ?? 0) * d).toLocaleString('fr-FR')}
            </em>
          </label>
        ))}
      </div>
    </div>
  );
}

const FOND_STORAGE_KEY = 'pos.fondInitial';

function lireFondMemorise(caisseId: string): string {
  try {
    const raw = localStorage.getItem(`${FOND_STORAGE_KEY}.${caisseId}`);
    if (raw != null && raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
      return String(Number(raw));
    }
  } catch {
    /* ignore */
  }
  return '0';
}

function memoriserFond(caisseId: string, fond: string) {
  try {
    localStorage.setItem(`${FOND_STORAGE_KEY}.${caisseId}`, fond);
  } catch {
    /* ignore */
  }
}

function libelleRoleTemoin(role: string | null) {
  return role === 'RESPONSABLE_BOUTIQUE' ? 'Responsable magasin' : 'Caissier';
}

function TemoinsPicker({
  temoins,
  value,
  onChange,
  loading,
}: {
  temoins: TemoinEligibleDto[] | undefined;
  value: string;
  onChange: (login: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return <LoadingState label="Chargement des coéquipiers…" />;
  }
  if (!temoins || temoins.length === 0) {
    return (
      <p role="alert">
        Aucun coéquipier éligible sur cette boutique. Un autre caissier ou le
        responsable magasin doit être créé et rattaché.
      </p>
    );
  }
  return (
    <div className="pos-open-temoins" role="listbox" aria-label="Confirmateur">
      {temoins.map((t) => {
        const actif = value === t.login;
        return (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={actif}
            data-testid={`pos-temoin-${t.login}`}
            className={actif ? 'actif' : ''}
            onClick={() => onChange(t.login)}
          >
            <strong>
              {t.prenom} {t.nom}
            </strong>
            <span>{libelleRoleTemoin(t.role)}</span>
          </button>
        );
      })}
    </div>
  );
}

function OuvertureSessionForm({
  caisseId,
  tiroirLabel,
  boutiqueNom,
  caissierLogin,
  tiroirs,
  onSelectTiroir,
  onAnnuler,
}: {
  caisseId: string;
  tiroirLabel: string;
  boutiqueNom?: string;
  caissierLogin?: string;
  tiroirs: CaisseDto[];
  onSelectTiroir: (id: string) => void;
  onAnnuler?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: temoins, isLoading: loadingTemoins } = useTemoinsEligibles(true);
  const [etape, setEtape] = useState<1 | 2>(1);
  const [fondInitial, setFondInitial] = useState(() => lireFondMemorise(caisseId));
  const [temoinLogin, setTemoinLogin] = useState('');
  const [temoinPassword, setTemoinPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFondInitial(lireFondMemorise(caisseId));
    setTemoinLogin('');
    setTemoinPassword('');
    setEtape(1);
    setError(null);
  }, [caisseId]);

  useEffect(() => {
    if (!temoins || temoins.length !== 1) return;
    setTemoinLogin(temoins[0].login);
  }, [temoins]);

  const temoinChoisi = temoins?.find((t) => t.login === temoinLogin);
  const fondNum = Number(fondInitial);
  const fondOk = Number.isFinite(fondNum) && fondNum >= 0 && fondInitial !== '';

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<SessionCaisseDto>('/ventes/sessions', {
        method: 'POST',
        body: JSON.stringify({
          caisseId,
          fondInitial: fondNum,
          temoinLogin,
          temoinPassword,
        }),
      }),
    onSuccess: () => {
      memoriserFond(caisseId, String(fondNum));
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
    },
    onError: (err) =>
      setError(
        messageDepuisApi(
          err,
          'Échec ouverture : fond de tiroir ou confirmateur invalide.',
        ),
      ),
  });

  function allerConfirmateur() {
    if (!fondOk) {
      setError('Indiquez le fond compté dans le tiroir.');
      return;
    }
    setError(null);
    setEtape(2);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (etape === 1) {
      allerConfirmateur();
      return;
    }
    if (!temoinLogin) {
      setError('Sélectionnez le coéquipier qui confirme l’ouverture.');
      return;
    }
    if (!temoinPassword) {
      setError('Le confirmateur doit saisir son mot de passe.');
      return;
    }
    mutation.mutate();
  }

  return (
    <form
      className="pos-gate-card pos-open-card"
      data-testid="pos-open"
      onSubmit={onSubmit}
    >
      <div className="pos-open-top">
        <div className="pos-gate-brand">CaissePOS</div>
        <div className="pos-open-steps" aria-label="Étapes">
          <span className={etape === 1 ? 'actif' : 'fait'}>1 Fond</span>
          <span className="pos-open-steps-sep" />
          <span className={etape === 2 ? 'actif' : ''}>2 Confirmateur</span>
        </div>
      </div>

      <h1>Ouvrir le poste</h1>
      <p className="pos-gate-hint">
        {boutiqueNom ? `${boutiqueNom} · ` : ''}
        {tiroirLabel}
        {caissierLogin ? ` · ${caissierLogin}` : ''}
      </p>

      {tiroirs.length > 1 && (
        <fieldset className="pos-open-fieldset">
          <legend>Tiroir</legend>
          <div className="pos-open-tiroirs">
            {tiroirs.map((t) => {
              const label = t.code
                ? `${t.code}${t.libelle ? ` — ${t.libelle}` : ''}`
                : (t.libelle ?? t.id.slice(0, 8));
              const actif = t.id === caisseId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={actif ? 'actif' : ''}
                  onClick={() => onSelectTiroir(t.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {etape === 1 && (
        <fieldset className="pos-open-fieldset">
          <legend>Fond de tiroir</legend>
          <p className="pos-open-help">
            Comptez les espèces déjà dans le tiroir avant la première vente.
          </p>
          <div className="pos-open-fonds">
            {FONDS_RAPIDES.map((n) => (
              <button
                key={n}
                type="button"
                className={fondNum === n ? 'actif' : ''}
                onClick={() => setFondInitial(String(n))}
              >
                {n === 0 ? 'Vide' : `${n.toLocaleString('fr-FR')} F`}
              </button>
            ))}
          </div>
          <ComptageDenominations
            onTotalChange={(total) => setFondInitial(String(total))}
          />
          <label htmlFor="fondInitial">Montant compté (FCFA)</label>
          <input
            id="fondInitial"
            className="pos-open-montant"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={fondInitial}
            onChange={(e) => setFondInitial(e.target.value)}
            required
            autoFocus
          />
          {fondOk && (
            <p className="pos-open-montant-preview money" aria-live="polite">
              {fondNum.toLocaleString('fr-FR')} FCFA
            </p>
          )}
        </fieldset>
      )}

      {etape === 2 && (
        <fieldset className="pos-open-fieldset">
          <legend>Confirmateur présent</legend>
          <p className="pos-open-help">
            Un coéquipier ou le responsable magasin atteste le fond
            <InfoTooltip insight={insightTemoinOuverture()} />
          </p>
          <div className="pos-open-recap">
            <span>Fond</span>
            <strong className="money">
              {fondNum.toLocaleString('fr-FR')} FCFA
            </strong>
          </div>
          <TemoinsPicker
            temoins={temoins}
            value={temoinLogin}
            onChange={(login) => {
              setTemoinLogin(login);
              setTemoinPassword('');
            }}
            loading={loadingTemoins}
          />
          {temoinLogin && (
            <>
              <label htmlFor="temoinPassword">
                Mot de passe de {temoinChoisi?.prenom ?? 'confirmateur'}
              </label>
              <input
                id="temoinPassword"
                data-testid="pos-temoin-password"
                type="password"
                autoComplete="current-password"
                value={temoinPassword}
                onChange={(e) => setTemoinPassword(e.target.value)}
                required
                autoFocus
              />
            </>
          )}
        </fieldset>
      )}

      <div className="pos-open-actions">
        {etape === 1 && onAnnuler ? (
          <button type="button" className="pos-open-back" onClick={onAnnuler}>
            ← Journée clôturée
          </button>
        ) : null}
        {etape === 2 && (
          <button
            type="button"
            className="pos-open-back"
            onClick={() => {
              setError(null);
              setEtape(1);
            }}
          >
            ← Fond
          </button>
        )}
        <button
          type="submit"
          className="pos-btn-primary"
          data-testid="pos-open-submit"
          disabled={
            mutation.isPending ||
            (etape === 1 && !fondOk) ||
            (etape === 2 && (!temoinLogin || !temoinPassword))
          }
        >
          {mutation.isPending
            ? 'Ouverture…'
            : etape === 1
              ? 'Continuer'
              : temoinChoisi
                ? `Démarrer · ${temoinChoisi.prenom}`
                : 'Démarrer les ventes'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <Link to="/dashboard" className="pos-back-link">
        ← Tableau de bord
      </Link>
    </form>
  );
}

function TicketVente({
  vente,
  client,
  boutiqueNom,
  societe,
  caissier,
  montantRecu,
  monnaie,
  onSuite,
}: {
  vente: VenteDto;
  client: ClientDto | null;
  boutiqueNom?: string;
  societe?: SocieteDto | null;
  caissier: string;
  montantRecu?: number;
  monnaie?: number;
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

  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 180);
    return () => window.clearTimeout(t);
  }, []);

  const mode = MODE_META[vente.modePaiement];
  const parts = paiementsEffectifs(vente);

  return (
    <div className="pos-receipt" data-testid="pos-receipt">
      <div className="pos-receipt-card ticket">
        <MajorBrandMark />
        {boutiqueNom && <p className="pos-receipt-shop">{boutiqueNom}</p>}
        {societe?.adresse && <p className="pos-receipt-addr">{societe.adresse}</p>}
        {societe?.telephone && (
          <p className="pos-receipt-addr">{societe.telephone}</p>
        )}
        <div className="pos-receipt-rule" />
        <h2>Ticket {idCourt(vente.id)}</h2>
        <p className="pos-receipt-meta">
          {new Date(vente.dateVente).toLocaleString('fr-FR')}
        </p>
        <p className="pos-receipt-meta">{caissier}</p>
        <div className="pos-receipt-rule" />
        <table className="pos-ticket-lines">
          <thead>
            <tr>
              <th>Article</th>
              <th>Qté</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            {vente.lignes.map((l) => {
              const remise = Number(l.remise);
              const ligne = Number(l.prixUnitaire) * l.quantite - remise;
              return (
                <tr key={l.id}>
                  <td>
                    {l.produit.designation}
                    {remise > 0 && (
                      <em className="pos-receipt-remise"> −{formatMontant(remise)}</em>
                    )}
                  </td>
                  <td>{l.quantite}</td>
                  <td className="money">{formatMontant(ligne)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pos-receipt-rule" />
        {client && (
          <p className="pos-receipt-client">
            {nomClientPos(client)}
            {client.fidelite ? ` · ${client.fidelite.niveau}` : ''}
          </p>
        )}
        {parts.length > 1 ? (
          <ul className="pos-receipt-paiements" data-testid="pos-receipt-paiements">
            {parts.map((p) => (
              <li key={p.modePaiement}>
                <span>{MODE_META[p.modePaiement]?.label ?? p.modePaiement}</span>
                <span className="money">{formatMontant(p.montant)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pos-receipt-pay">{mode.label}</p>
        )}
        <p className="pos-receipt-total money">
          {formatMontant(Number(vente.montantTotal))} FCFA
        </p>
        {montantRecu != null && montantRecu > 0 && (
          <div className="pos-receipt-cash">
            <p>
              <span>Reçu (espèces)</span>
              <span className="money">{formatMontant(montantRecu)} FCFA</span>
            </p>
            {monnaie != null && monnaie >= 0 && (
              <p>
                <span>Monnaie</span>
                <span className="money">{formatMontant(monnaie)} FCFA</span>
              </p>
            )}
          </div>
        )}
        <p className="pos-receipt-thanks">Merci de votre visite</p>
        {venteEnAttenteSync(vente.id) && (
          <p className="pos-warn no-print" role="status">
            Ticket en attente de synchronisation — il partira à la reconnexion.
          </p>
        )}
        <div className="pos-receipt-actions no-print">
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Réimprimer
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
  onCloturee,
}: {
  session: SessionCaisseDto;
  ventes: VenteDto[];
  retours: RetourVenteDto[];
  panierNonVide: boolean;
  commandesEnAttente: number;
  onFermer: () => void;
  onCloturee: (data: ClotureSessionResponseDto) => void;
}) {
  const queryClient = useQueryClient();
  const { data: temoins, isLoading: loadingTemoins } = useTemoinsEligibles(true);
  const { data: etat, isLoading: loadingEtat } = useQuery({
    queryKey: ['etat-session', session.id],
    queryFn: () =>
      apiFetch<EtatSessionDto>(`/ventes/sessions/${session.id}/etat`),
  });
  const [etape, setEtape] = useState<1 | 2>(1);
  const [fondCompteCloture, setFondCompteCloture] = useState('');
  const [temoinLogin, setTemoinLogin] = useState('');
  const [temoinPassword, setTemoinPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!temoins || temoins.length !== 1) return;
    setTemoinLogin(temoins[0].login);
  }, [temoins]);

  // Fallback local si l’état X n’est pas encore chargé — la clôture serveur
  // recalcule toujours via calculerReleve (§6.3.4).
  const caEspeces = ventes.reduce((s, v) => s + partEspeces(v), 0);
  const retoursEspeces = debitEspecesRetours(ventes, retours);
  const fondInitialLocal = Number(session.fondInitial);
  const especesNettesLocal = caEspeces - retoursEspeces;
  const fondInitial = Number(etat?.fondInitial ?? fondInitialLocal);
  const especesNettes = Number(etat?.totalEspecesNet ?? especesNettesLocal);
  const fondTheorique = Number(
    etat?.fondTheorique ?? fondInitialLocal + especesNettesLocal,
  );
  const fondCompteNum = fondCompteCloture === '' ? null : Number(fondCompteCloture);
  const fondOk =
    fondCompteNum != null && Number.isFinite(fondCompteNum) && fondCompteNum >= 0;
  const ecart = fondOk ? fondCompteNum - fondTheorique : null;
  const temoinChoisi = temoins?.find((t) => t.login === temoinLogin);
  const peutContinuer = commandesEnAttente === 0 && fondOk && !loadingEtat;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ClotureSessionResponseDto>(`/ventes/sessions/${session.id}/cloture`, {
        method: 'POST',
        body: JSON.stringify({
          fondCompteCloture: Number(fondCompteCloture),
          temoinLogin,
          temoinPassword,
        }),
      }),
    onSuccess: (data) => {
      clearHolds(session.id);
      queryClient.setQueryData(
        ['ventes-sessions'],
        (old: SessionCaisseDto[] | undefined) =>
          old?.map((s) => (s.id === data.session.id ? data.session : s)) ?? old,
      );
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
      void queryClient.invalidateQueries({
        queryKey: ['etat-session', session.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
      onCloturee(data);
    },
    onError: (err) =>
      setError(
        messageDepuisApi(err, 'Échec clôture : fond compté ou confirmateur invalide.'),
      ),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !mutation.isPending) {
        e.preventDefault();
        onFermer();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mutation.isPending, onFermer]);

  function allerConfirmateur() {
    if (commandesEnAttente > 0) {
      setError('Reprendre ou abandonner les tickets en file avant de clôturer.');
      return;
    }
    if (!fondOk) {
      setError('Indiquez le fond compté dans le tiroir.');
      return;
    }
    if (!temoins || temoins.length === 0) {
      setError(
        'Aucun confirmateur éligible sur cette boutique. Créez un autre caissier ou un responsable magasin.',
      );
      return;
    }
    setError(null);
    setEtape(2);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (etape === 1) {
      allerConfirmateur();
      return;
    }
    if (!temoinLogin) {
      setError('Sélectionnez le coéquipier qui confirme la clôture.');
      return;
    }
    if (!temoinPassword) {
      setError('Le confirmateur doit saisir son mot de passe.');
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div
      className="pos-modal-backdrop"
      onClick={() => {
        if (!mutation.isPending) onFermer();
      }}
      role="presentation"
    >
      <form
        className="pos-modal pos-cloture-card"
        data-testid="pos-cloture-panel"
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-cloture-head">
          <div className="pos-open-top">
            <div className="pos-gate-brand">CaissePOS</div>
            <div className="pos-open-steps" aria-label="Étapes de clôture">
              <span className={etape === 1 ? 'actif' : 'fait'}>1 Comptage</span>
              <span className="pos-open-steps-sep" aria-hidden />
              <span className={etape === 2 ? 'actif' : ''}>2 Confirmateur</span>
            </div>
          </div>
          <h2>Fermer le poste</h2>
          <p className="pos-open-help">
            Comptez le tiroir, puis faites confirmer par un coéquipier présent.
            Un écart ouvre un litige sur le versement magasin.
          </p>
        </div>

        <div className="pos-cloture-body">
          {panierNonVide && (
            <p className="pos-warn" role="status">
              La commande en cours n’est pas encaissée et sera perdue.
            </p>
          )}
          {commandesEnAttente > 0 && (
            <p className="pos-warn" role="status">
              {commandesEnAttente} ticket(s) en file — reprendre ou abandonner
              avant de clôturer.
              <InfoTooltip insight={insightCommandeEnAttente(commandesEnAttente)} />
            </p>
          )}

          {etape === 1 && (
            <fieldset className="pos-open-fieldset">
              <legend>Comptage du tiroir</legend>

              <div className="pos-cloture-breakdown" aria-label="Fond attendu">
                {loadingEtat ? (
                  <LoadingState label="Calcul du fond attendu…" />
                ) : (
                  <>
                    <div>
                      <span>Fond d’ouverture</span>
                      <strong className="money">
                        {formatMontant(fondInitial)} F
                      </strong>
                    </div>
                    <div>
                      <span>Espèces nettes session</span>
                      <strong className="money">
                        {especesNettes >= 0 ? '+' : ''}
                        {formatMontant(especesNettes)} F
                      </strong>
                    </div>
                    {retoursEspeces > 0 && (
                      <div>
                        <span>dont retours espèces</span>
                        <strong className="money">
                          −{formatMontant(retoursEspeces)} F
                        </strong>
                      </div>
                    )}
                    <div className="pos-cloture-breakdown-total">
                      <span>
                        Attendu
                        <InfoTooltip
                          insight={insightEcartCloture(
                            fondTheorique,
                            fondCompteNum,
                          )}
                        />
                      </span>
                      <strong className="money">
                        {formatMontant(fondTheorique)} FCFA
                      </strong>
                    </div>
                  </>
                )}
              </div>

              <div className="pos-open-fonds">
                <button
                  type="button"
                  className={fondCompteNum === fondTheorique ? 'actif' : ''}
                  onClick={() =>
                    setFondCompteCloture(String(Math.round(fondTheorique)))
                  }
                >
                  = Attendu
                </button>
                {FONDS_RAPIDES.filter((n) => n > 0).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={fondCompteNum === n ? 'actif' : ''}
                    onClick={() => setFondCompteCloture(String(n))}
                  >
                    {n.toLocaleString('fr-FR')} F
                  </button>
                ))}
              </div>

              <ComptageDenominations
                onTotalChange={(total) => setFondCompteCloture(String(total))}
              />

              <label htmlFor="fondCompteCloture">Fond compté (FCFA)</label>
              <input
                id="fondCompteCloture"
                data-testid="pos-cloture-fond"
                className="pos-open-montant"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={fondCompteCloture}
                onChange={(e) => setFondCompteCloture(e.target.value)}
                required
                autoFocus
                placeholder="Montant réellement dans le tiroir"
              />

              {ecart != null && (
                <p
                  className={
                    ecart === 0 ? 'pos-cloture-ecart ok' : 'pos-cloture-ecart warn'
                  }
                  role="status"
                  data-testid="pos-cloture-ecart"
                >
                  {ecart === 0
                    ? 'Tiroir juste — aucun écart'
                    : `Écart ${ecart > 0 ? '+' : ''}${formatMontant(ecart)} FCFA`}
                </p>
              )}
            </fieldset>
          )}

          {etape === 2 && (
            <fieldset className="pos-open-fieldset">
              <legend>Confirmateur présent</legend>

              <div className="pos-cloture-breakdown" aria-label="Récapitulatif">
                <div>
                  <span>Attendu</span>
                  <strong className="money">
                    {formatMontant(fondTheorique)} F
                  </strong>
                </div>
                <div>
                  <span>Compté</span>
                  <strong className="money">
                    {formatMontant(fondCompteNum ?? 0)} F
                  </strong>
                </div>
                {ecart != null && (
                  <div className="pos-cloture-breakdown-total">
                    <span>
                      Écart
                      <InfoTooltip
                        insight={insightEcartCloture(fondTheorique, fondCompteNum)}
                      />
                    </span>
                    <strong
                      className={`money${ecart === 0 ? '' : ' pos-cloture-ecart-inline'}`}
                    >
                      {ecart === 0
                        ? '0 F'
                        : `${ecart > 0 ? '+' : ''}${formatMontant(ecart)} F`}
                    </strong>
                  </div>
                )}
              </div>

              <TemoinsPicker
                temoins={temoins}
                value={temoinLogin}
                onChange={(login) => {
                  setTemoinLogin(login);
                  setTemoinPassword('');
                }}
                loading={loadingTemoins}
              />

              {temoinLogin && (
                <>
                  <label htmlFor="temoinPasswordCloture">
                    Mot de passe de {temoinChoisi?.prenom ?? 'confirmateur'}
                  </label>
                  <input
                    id="temoinPasswordCloture"
                    data-testid="pos-cloture-temoin-password"
                    type="password"
                    autoComplete="current-password"
                    value={temoinPassword}
                    onChange={(e) => setTemoinPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </>
              )}
            </fieldset>
          )}

          {error && (
            <p className="pos-cloture-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="pos-cloture-foot pos-open-actions">
          {etape === 2 ? (
            <button
              type="button"
              className="pos-open-back"
              disabled={mutation.isPending}
              onClick={() => {
                setError(null);
                setTemoinPassword('');
                setEtape(1);
              }}
            >
              ← Comptage
            </button>
          ) : (
            <button
              type="button"
              className="pos-open-back"
              disabled={mutation.isPending}
              onClick={onFermer}
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            className="pos-btn-primary"
            data-testid="pos-cloture-submit"
            disabled={
              mutation.isPending ||
              commandesEnAttente > 0 ||
              (etape === 1 && !peutContinuer) ||
              (etape === 2 && (!temoinLogin || !temoinPassword))
            }
          >
            {mutation.isPending
              ? 'Clôture…'
              : etape === 1
                ? 'Continuer'
                : temoinChoisi
                  ? `Clôturer · ${temoinChoisi.prenom}`
                  : 'Clôturer'}
          </button>
        </div>
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
  const [horsListe, setHorsListe] = useState<ClientDto | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const terme = q.trim();
  const rechercheReseau = useQuery({
    queryKey: ['crm-clients', 'recherche', terme],
    queryFn: () =>
      apiFetch<ClientDto[]>(`/crm/clients?q=${encodeURIComponent(terme)}`),
    enabled: terme.length >= 2,
  });
  const selected =
    clients.find((c) => c.id === clientId) ??
    (horsListe?.id === clientId ? horsListe : null);

  const filtres = useMemo(() => {
    if (terme.length >= 2) {
      return (rechercheReseau.data ?? []).slice(0, 12);
    }
    return clients.slice(0, 12);
  }, [clients, terme.length, rechercheReseau.data]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function choisir(client: ClientDto | null) {
    if (client && !clients.some((c) => c.id === client.id)) {
      setHorsListe(client);
    } else {
      setHorsListe(null);
    }
    onChange(client?.id ?? '');
    setQ('');
    setOpen(false);
  }

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
              {nomClientPos(selected)}
            </strong>
            <span>
              {selected.segment} · {selected.fidelite?.niveau ?? 'BRONZE'} ·{' '}
              {selected.fidelite?.pointsCumules ?? 0} pts
            </span>
          </div>
          <button type="button" className="pos-btn-ghost" onClick={() => { setHorsListe(null); onChange(''); }}>
            Anonyme
          </button>
        </div>
      ) : (
        <>
          <input
            id="pos-client-search"
            type="search"
            placeholder="Nom ou téléphone — réseau"
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
                <button type="button" onClick={() => choisir(null)}>
                  Client anonyme
                </button>
              </li>
              {rechercheReseau.isFetching && terme.length >= 2 ? (
                <li className="pos-empty">Recherche réseau…</li>
              ) : null}
              {filtres.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => choisir(c)}>
                    <strong>
                      {nomClientPos(c)}
                    </strong>
                    <small>
                      {c.contact ? `${c.contact} · ` : ''}
                      {c.segment} · {c.fidelite?.niveau ?? 'BRONZE'} ·{' '}
                      {c.fidelite?.pointsCumules ?? 0} pts
                    </small>
                  </button>
                </li>
              ))}
              {filtres.length === 0 && !rechercheReseau.isFetching && (
                <li className="pos-empty">Aucun client.</li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function NumpadEspeces({
  valeur,
  onChange,
  libelle,
}: {
  valeur: string;
  onChange: (v: string) => void;
  libelle: string;
}) {
  function tap(digit: string) {
    onChange(appliquerChiffreNumpad(valeur, digit));
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  return (
    <div className="pos-numpad" role="group" aria-label={libelle}>
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
  clientId,
  holdId,
  besoinDerogationRemise,
  onClientChange,
  onAnnuler,
  onMettreEnAttente,
  onVente,
}: {
  panier: LignePanier[];
  session: SessionCaisseDto;
  clients: ClientDto[];
  clientId: string;
  holdId: string | null;
  besoinDerogationRemise?: boolean;
  onClientChange: (id: string) => void;
  onAnnuler: () => void;
  onMettreEnAttente: () => void;
  onVente: (
    vente: VenteDto,
    client: ClientDto | null,
    encaissement?: { montantRecu: number; monnaie: number },
  ) => void;
}) {
  const queryClient = useQueryClient();
  const { data: temoins } = useTemoinsEligibles(true);
  const chefs = (temoins ?? []).filter((t) => t.role === 'RESPONSABLE_BOUTIQUE');
  const totalInitial = totalNet(panier);
  const [parts, setParts] = useState<{ mode: ModePaiement; montant: string }[]>([
    { mode: ModePaiement.ESPECES, montant: String(arrondiFcfa(totalInitial)) },
  ]);
  const [recu, setRecu] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [derogation, setDerogation] = useState<{
    motifs: Array<'REMISE_PLAFOND' | 'STOCK_INSUFFISANT'>;
    login: string;
    password: string;
  } | null>(
    besoinDerogationRemise
      ? { motifs: ['REMISE_PLAFOND'], login: '', password: '' }
      : null,
  );
  const total = totalNet(panier);
  const recuNum = Number(recu) || 0;
  const syn = syntheseEncaissement({
    totalNet: total,
    parts,
    recuEspeces: recuNum,
  });
  const {
    cashPart,
    aEspeces,
    monnaie: rendu,
    repartitionOk: mixteOk,
    especesOk: especeOk,
  } = syn;
  const partsNum = parts.map((p) => ({
    mode: p.mode,
    montant: Number(p.montant) || 0,
  }));
  const reste = resteARepartir(total, parts);
  const surAllocation = parts.length > 1 && reste < -0.5;
  const modePrincipal = aEspeces
    ? ModePaiement.ESPECES
    : (parts[0]?.mode ?? ModePaiement.ESPECES);
  const client = clients.find((c) => c.id === clientId) ?? null;

  function construirePayload(clientOperationId: string) {
    const paiements = partsNum
      .filter((p) => p.montant > 0)
      .map((p) => ({ modePaiement: p.mode, montant: p.montant }));
    return {
      lignes: panier.map((l) => ({
        produitId: l.produitId,
        quantite: l.quantite,
        ...(l.remise > 0 ? { remise: l.remise } : {}),
      })),
      modePaiement: modePrincipal,
      ...(paiements.length > 0 ? { paiements } : {}),
      ...(clientId ? { clientId } : {}),
      ...(holdId ? { holdId } : {}),
      ...(derogation
        ? {
            derogation: {
              motifs: derogation.motifs,
              login: derogation.login,
              password: derogation.password,
            },
          }
        : {}),
      clientOperationId,
    };
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const clientOperationId = crypto.randomUUID();
      const payload = construirePayload(clientOperationId);
      if (!navigator.onLine) {
        enqueueVente(session.id, payload);
        return venteOptimiste(
          panier,
          session,
          modePrincipal,
          clientId || null,
          clientOperationId,
          partsNum
            .filter((p) => p.montant > 0)
            .map((p) => ({ modePaiement: p.mode, montant: p.montant })),
        );
      }
      try {
        return await apiFetch<VenteDto>(`/ventes/sessions/${session.id}/ventes`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        const code = codeDepuisApi(err);
        if (code === 'REMISE_PLAFOND' || code === 'STOCK_INSUFFISANT') {
          setDerogation({
            motifs: [code],
            login: '',
            password: '',
          });
        }
        if (estErreurReseau(err)) {
          enqueueVente(session.id, payload);
          return venteOptimiste(
            panier,
            session,
            modePrincipal,
            clientId || null,
            clientOperationId,
            partsNum
            .filter((p) => p.montant > 0)
            .map((p) => ({ modePaiement: p.mode, montant: p.montant })),
          );
        }
        throw err;
      }
    },
    onSuccess: (vente) => {
      const encaissement =
        aEspeces && especeOk
          ? { montantRecu: recuNum, monnaie: Math.max(0, rendu) }
          : undefined;
      onVente(vente, client, encaissement);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['ventes-session'] });
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Encaissement refusé (stock / remise max 20 %).')),
  });

  function valider() {
    if (!especeOk || !mixteOk || mutation.isPending) return;
    mutation.mutate();
  }

  function toggleMode(m: ModePaiement) {
    setParts(toggleModePaiement(parts, m, total));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !mutation.isPending) {
        if (derogation) {
          setDerogation(null);
          return;
        }
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
        if (!especeOk || !mixteOk || mutation.isPending) return;
        mutation.mutate();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mutation,
    mutation.isPending,
    onAnnuler,
    onMettreEnAttente,
    especeOk,
    mixteOk,
    derogation,
  ]);

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
        <p
          className={
            mixteOk
              ? 'pos-mixte-reste is-ok'
              : surAllocation
                ? 'pos-mixte-reste is-over'
                : 'pos-mixte-reste'
          }
        >
          {mixteOk
            ? 'Répartition complète'
            : `Reste à répartir : ${formatMontant(reste)} FCFA`}
          <InfoTooltip insight={insightPaiementMixte(reste, parts.length)} />
        </p>
        {surAllocation && (
          <p className="pos-warn" role="status">
            La somme des parts dépasse le ticket. Ces montants répartissent le ticket
            entre les modes — le billet remis par le client se saisit plus bas dans «
            Billet remis ».
          </p>
        )}
        <div className="pos-payment-methods">
          {Object.values(ModePaiement).map((m) => {
            const meta = MODE_META[m];
            const Icon = meta.Icon;
            const actif = parts.some((p) => p.mode === m);
            return (
              <button
                key={m}
                type="button"
                data-testid={`pos-pay-mode-${m}`}
                className={actif ? 'pos-pay-method is-active' : 'pos-pay-method'}
                onClick={() => toggleMode(m)}
              >
                <Icon size={22} strokeWidth={2} />
                {meta.label}
              </button>
            );
          })}
        </div>
        {parts.length > 1 && (
          <div className="pos-mixte-section">
            <h2 className="pos-mixte-title">Répartition du ticket</h2>
            <p className="pos-mixte-hint">
              Chaque part est une portion du total ({formatMontant(total)}{' '}
              FCFA). Le pavé remplit la case surlignée, pas le reçu espèces.
            </p>
            <ul className="pos-mixte-parts">
              {parts.map((p) => (
                <li key={p.mode}>
                  <label htmlFor={`part-${p.mode}`}>
                    Part ticket ({MODE_META[p.mode].label})
                  </label>
                  <input
                    id={`part-${p.mode}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={p.montant}
                    onChange={(e) =>
                      setParts(
                        completerPartMixte(
                          parts,
                          p.mode,
                          e.target.value,
                          total,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setParts((prev) =>
                        prev.map((x) =>
                          x.mode === p.mode
                            ? {
                                ...x,
                                montant: String(
                                  montantRestePart(total, prev, p.mode),
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    Reste
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {aEspeces && (
          <div className="pos-cash-section">
            <h2 className="pos-cash-title">Billets espèces remis</h2>
            <p className="pos-mixte-hint">
              Uniquement les espèces tendues. Monnaie = billets − part
              espèces ({formatMontant(cashPart)} FCFA), jamais le total mixte
              ni le premier mode s’il n’est pas espèces.
            </p>
            <div className="pos-cash">
              <div className="pos-cash-head">
                <div>
                  <span>Reçu du client (billets)</span>
                  <strong
                    className={recu === '' ? 'money is-empty' : 'money'}
                    data-testid="pos-cash-recu"
                  >
                    {recu === ''
                      ? '—'
                      : `${formatMontant(recuNum)} FCFA`}
                  </strong>
                </div>
                <div>
                  <span>
                    Monnaie à rendre
                    <InfoTooltip insight={insightMonnaiePos(recuNum, cashPart)} />
                  </span>
                  <strong
                    className={rendu < 0 ? 'money pos-neg' : 'money'}
                    data-testid="pos-cash-monnaie"
                  >
                    {recu === '' || rendu < 0
                      ? '—'
                      : `${formatMontant(rendu)} FCFA`}
                  </strong>
                </div>
              </div>
              {recu !== '' && aEspeces ? (
                <p className="pos-mixte-hint" data-testid="pos-cash-formule">
                  {formatMontant(recuNum)} − {formatMontant(cashPart)} (espèces) ={' '}
                  {rendu < 0 ? 'insuffisant' : `${formatMontant(rendu)} FCFA`}
                </p>
              ) : null}
            <div className="pos-cash-rapide">
              <button
                type="button"
                data-testid="pos-cash-exact"
                onClick={() => setRecu(String(arrondiFcfa(cashPart)))}
              >
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
            <NumpadEspeces
              valeur={recu}
              onChange={setRecu}
              libelle="Pavé : billets espèces remis par le client"
            />
            </div>
          </div>
        )}

        {derogation && (
          <div className="pos-derogation">
            <h2>Dérogation chef de caisse</h2>
            <p>
              {derogation.motifs.includes('REMISE_PLAFOND')
                ? 'Remise au-dessus du plafond 20 %.'
                : 'Stock insuffisant.'}{' '}
              Le Responsable boutique saisit son mot de passe (pas vous).
            </p>
            {chefs.length > 0 ? (
              <div className="pos-open-temoins" role="listbox" aria-label="Responsable">
                {chefs.map((c) => {
                  const actif = derogation.login === c.login;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={actif}
                      className={actif ? 'actif' : ''}
                      onClick={() =>
                        setDerogation((d) =>
                          d ? { ...d, login: c.login, password: '' } : d,
                        )
                      }
                    >
                      <strong>
                        {c.prenom} {c.nom}
                      </strong>
                      <span>Responsable magasin</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <label htmlFor="chef-login">Login responsable</label>
                <input
                  id="chef-login"
                  value={derogation.login}
                  onChange={(e) =>
                    setDerogation((d) => (d ? { ...d, login: e.target.value } : d))
                  }
                  autoComplete="off"
                />
              </>
            )}
            {derogation.login && (
              <>
                <label htmlFor="chef-password">Mot de passe responsable</label>
                <input
                  id="chef-password"
                  type="password"
                  value={derogation.password}
                  onChange={(e) =>
                    setDerogation((d) => (d ? { ...d, password: e.target.value } : d))
                  }
                  autoComplete="off"
                  autoFocus
                />
              </>
            )}
            <div className="pos-receipt-actions">
              {!besoinDerogationRemise && (
                <button type="button" onClick={() => setDerogation(null)}>
                  Annuler
                </button>
              )}
              <button
                type="button"
                className="pos-btn-primary"
                disabled={!derogation.login || !derogation.password || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Valider la dérogation
              </button>
            </div>
          </div>
        )}

        <ClientPicker clients={clients} clientId={clientId} onChange={onClientChange} />
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
          data-testid="pos-pay-validate"
          disabled={
            !especeOk ||
            !mixteOk ||
            mutation.isPending ||
            (derogation != null &&
              (!derogation.login || !derogation.password))
          }
          onClick={valider}
        >
          {mutation.isPending
            ? 'Validation…'
            : derogation
              ? `Valider avec dérogation · ${formatMontant(total)}`
              : aEspeces && rendu >= 0
                ? `Valider · ${formatMontant(total)} · monnaie ${formatMontant(rendu)}`
                : `Valider · ${formatMontant(total)}`}
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
  onSessionCloturee,
}: {
  session: SessionCaisseDto;
  produits: ProduitDto[];
  clients: ClientDto[];
  userLogin: string;
  boutiqueNom?: string;
  onSessionCloturee: (data: ClotureSessionResponseDto) => void;
}) {
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [remisePanier, setRemisePanier] = useState('');
  const [clientId, setClientId] = useState('');
  const [qteSaisie, setQteSaisie] = useState(1);
  const [lastProduitId, setLastProduitId] = useState<string | null>(null);
  const [holds, setHolds] = useState<CommandeEnAttente[]>(() => loadHolds(session.id));
  const [holdsReady, setHoldsReady] = useState(false);
  const [parkOpen, setParkOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [parkLibelle, setParkLibelle] = useState('');
  const [parkMotif, setParkMotif] = useState<MotifAttente>('OUBLI_PAIEMENT');
  const [parkPrint, setParkPrint] = useState(true);
  const [coupon, setCoupon] = useState<CommandeEnAttente | null>(null);
  const [holdIdEnCours, setHoldIdEnCours] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);
  const scanFeedbackTimer = useRef<number | null>(null);
  const pistoletRef = useRef(etatPistoletVide());
  const traiterScanRef = useRef<
    (code: string, mode: 'saisie' | 'pistolet') => void
  >(() => undefined);
  const [confirm, setConfirm] = useState<
    null | { kind: 'vider' } | { kind: 'abandonner'; id: string }
  >(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreCatalogue>('TOUS');
  const [etape, setEtape] = useState<'caisse' | 'paiement'>('caisse');
  const [ticket, setTicket] = useState<VenteDto | null>(null);
  const [ticketEncaissement, setTicketEncaissement] = useState<{
    montantRecu: number;
    monnaie: number;
  } | null>(null);
  const [ticketClient, setTicketClient] = useState<ClientDto | null>(null);
  const [cloture, setCloture] = useState(false);
  const [etatOpen, setEtatOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNowTick(5_000);
  const queryClient = useQueryClient();
  const societeQ = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
  });
  const online = useOnline();
  const [pending, setPending] = useState(() => outboxVentesCount(session.id));
  const clientsDisponibles = useMemo(() => {
    if (online) return clients;
    return loadPosCache(session.id)?.clients ?? clients;
  }, [online, session.id, clients]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      hydrateOutbox(),
      hydrateHolds(session.id),
      hydratePosCache(session.id),
    ]).then(([, loaded]) => {
      if (cancelled) return;
      setHolds(loaded);
      setHoldsReady(true);
      setPending(outboxVentesCount(session.id));
    });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

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
    if (!holdsReady) return;
    saveHolds(session.id, holds);
  }, [holds, session.id, holdsReady]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void apiFetch<unknown>(`/ventes/sessions/${session.id}/reservations`)
      .then((raw) => {
        if (cancelled) return;
        const serveur = holdsDepuisApi(raw);
        if (serveur.length === 0) return;
        setHolds((local) => {
          const byId = new Map(local.map((h) => [h.id, h]));
          for (const t of serveur) byId.set(t.id, t);
          return [...byId.values()].sort((a, b) => a.numero - b.numero);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, session.id]);

  useEffect(() => {
    if (!online || holds.length === 0) return;
    let cancelled = false;
    async function syncReservations() {
      for (const hold of holds) {
        try {
          await apiFetch(`/ventes/sessions/${session.id}/reservations`, {
            method: 'PUT',
            body: JSON.stringify(payloadReservation(hold)),
          });
        } catch {
          // Park local conservé si le serveur refuse (stock déjà pris, hors-ligne).
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      }
    }
    void syncReservations();
    return () => {
      cancelled = true;
    };
  }, [online, session.id, holds, queryClient]);

  useEffect(() => {
    function rafraichir() {
      setPending(outboxVentesCount(session.id));
    }
    rafraichir();
    return sAbonnerSync(rafraichir);
  }, [session.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of produits) {
      if (p.categorie) set.add(p.categorie);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [produits]);

  const produitsCorrespondants = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return produits.filter((p) => {
      if (filtre === 'RUPTURE' && p.stock > 0) return false;
      if (filtre !== 'TOUS' && filtre !== 'RUPTURE' && p.categorie !== filtre) {
        return false;
      }
      if (!q) return true;
      return produitContientRechercheCaisse(p, q);
    });
  }, [produits, recherche, filtre]);

  /** Grille visible seulement après recherche, scan ou filtre catégorie (pas « Tous »). */
  const catalogueOuvert =
    recherche.trim().length > 0 || filtre !== 'TOUS';
  const produitsAffiches = catalogueOuvert ? produitsCorrespondants : [];

  const brut = totalBrut(panier);
  const remisePct = Number(remisePanier) || 0;
  const plafondPct = REMISE_MAX_RATIO * 100;
  const remise = montantRemiseDepuisPourcent(brut, remisePct);
  const plafond = plafondRemise(brut);
  const remiseDepasse = remisePct > plafondPct + 1e-9;
  const net = Math.max(0, brut - remise);
  const caSession = ventes.reduce((s, v) => s + Number(v.montantTotal), 0);
  const dureeMinutes = Math.max(
    0,
    Math.floor((now - new Date(session.ouvertureDateHeure).getTime()) / 60_000),
  );

  function stockDisponible(produitId: string, stockCatalogue: number): number {
    return (
      stockCatalogue -
      quantiteReserveeOutbox(session.id, produitId) -
      (online ? 0 : quantiteParquee(holds, produitId))
    );
  }

  function focuserScan() {
    window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 0);
  }

  function signalerScan(kind: 'ok' | 'err', text: string) {
    setScanFeedback({ kind, text });
    bipScan(kind);
    if (scanFeedbackTimer.current != null) {
      window.clearTimeout(scanFeedbackTimer.current);
    }
    scanFeedbackTimer.current = window.setTimeout(
      () => setScanFeedback(null),
      kind === 'err' ? 4200 : 1600,
    );
  }

  function ajouter(p: ProduitDto, qteDemandee?: number): boolean {
    const dispo = stockDisponible(p.id, p.stock);
    if (dispo <= 0 || !p.actif) return false;
    const demande = Math.max(1, qteDemandee ?? qteSaisie);
    let added = false;
    setPanier((prev) => {
      const ex = prev.find((l) => l.produitId === p.id);
      const deja = ex?.quantite ?? 0;
      const ajout = Math.min(demande, dispo - deja);
      if (ajout <= 0) return prev;
      added = true;
      if (ex) {
        return prev.map((l) =>
          l.produitId === p.id ? { ...l, quantite: l.quantite + ajout } : l,
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
          quantite: ajout,
          remise: 0,
        },
      ];
    });
    if (!added) return false;
    setLastProduitId(p.id);
    setQteSaisie(1);
    setRecherche('');
    focuserScan();
    return true;
  }

  function traiterCodeScanne(raw: string, mode: 'saisie' | 'pistolet') {
    const resultat = resoudreScanCaisse(
      produits,
      raw,
      qteSaisie,
      (p) => {
        const deja = panier.find((l) => l.produitId === p.id)?.quantite ?? 0;
        return stockDisponible(p.id, p.stock) - deja;
      },
      mode,
    );
    switch (resultat.statut) {
      case 'ignore':
        return;
      case 'qte_seule':
        setQteSaisie(resultat.qte);
        setRecherche('');
        focuserScan();
        return;
      case 'ok': {
        const ok = ajouter(resultat.produit, resultat.qte);
        if (!ok) {
          signalerScan(
            'err',
            `Stock insuffisant pour « ${resultat.produit.designation} ».`,
          );
          focuserScan();
          return;
        }
        signalerScan(
          'ok',
          `${resultat.produit.designation} × ${resultat.qte}`,
        );
        return;
      }
      case 'inconnu':
        setRecherche('');
        signalerScan(
          'err',
          `Aucun article pour le code « ${resultat.code} ».`,
        );
        focuserScan();
        return;
      case 'rupture':
        setRecherche('');
        signalerScan(
          'err',
          `Rupture de stock : « ${resultat.produit.designation} ».`,
        );
        focuserScan();
        return;
      case 'inactif':
        setRecherche('');
        signalerScan(
          'err',
          `Article inactif : « ${resultat.produit.designation} ».`,
        );
        focuserScan();
        return;
    }
  }
  traiterScanRef.current = (code, mode) => traiterCodeScanne(code, mode);

  function ouvrirPark() {
    if (panier.length === 0) return;
    const client = clientsDisponibles.find((c) => c.id === clientId) ?? null;
    setParkLibelle(nomClientPos(client));
    setParkMotif(clientId ? 'FIDELITE' : 'OUBLI_PAIEMENT');
    setParkPrint(true);
    setParkOpen(true);
  }

  function confirmerPark() {
    if (panier.length === 0) return;
    const numero = prochainNumero(holds);
    const client = clientsDisponibles.find((c) => c.id === clientId) ?? null;
    const hold: CommandeEnAttente = {
      id: crypto.randomUUID(),
      numero,
      libelle:
        parkLibelle.trim() ||
        nomClientPos(client) ||
        `N° ${formatNumeroAttente(numero)}`,
      motif: parkMotif,
      clientId: clientId || null,
      panier,
      remisePanier,
      createdAt: new Date().toISOString(),
    };
    setHolds((prev) => [...prev, hold]);
    setPanier([]);
    setRemisePanier('');
    setClientId('');
    setLastProduitId(null);
    setEtape('caisse');
    setParkOpen(false);
    setFileOpen(false);
    setHoldIdEnCours(null);
    if (navigator.onLine) {
      void apiFetch(`/ventes/sessions/${session.id}/reservations`, {
        method: 'PUT',
        body: JSON.stringify(payloadReservation(hold)),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['stocks'] }))
        .catch(() => undefined);
    } else {
      enqueueReservation(session.id, payloadReservation(hold));
    }
    if (parkPrint) setCoupon(hold);
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
      setNotice(
        'Impossible de reprendre ce ticket : stock insuffisant ou produits inactifs.',
      );
      return;
    }
    if (restaure.length < hold.panier.length) {
      setNotice(
        'Certains articles de ce ticket ne sont plus disponibles : le panier a été ajusté.',
      );
    }
    if (panier.length > 0) {
      const numero = prochainNumero(autres);
      const clientCourant = clientsDisponibles.find((c) => c.id === clientId) ?? null;
      const courant: CommandeEnAttente = {
        id: crypto.randomUUID(),
        numero,
        libelle:
          nomClientPos(clientCourant) || `N° ${formatNumeroAttente(numero)}`,
        motif: 'AUTRE',
        clientId: clientId || null,
        panier,
        remisePanier,
        createdAt: new Date().toISOString(),
      };
      setHolds([...autres, courant]);
      if (navigator.onLine) {
        void apiFetch(`/ventes/sessions/${session.id}/reservations`, {
          method: 'PUT',
          body: JSON.stringify(payloadReservation(courant)),
        }).catch(() => undefined);
      } else {
        enqueueReservation(session.id, payloadReservation(courant));
      }
    } else {
      setHolds(autres);
    }
    setPanier(restaure);
    setRemisePanier(hold.remisePanier);
    setClientId(hold.clientId ?? '');
    setLastProduitId(restaure[restaure.length - 1]?.produitId ?? null);
    setHoldIdEnCours(hold.id);
    setEtape('caisse');
    setFileOpen(false);
    setParkOpen(false);
  }

  function abandonnerAttente(id: string) {
    setConfirm({ kind: 'abandonner', id });
  }

  function allerPaiement() {
    if (panier.length === 0) return;
    setPanier((prev) =>
      distribuerRemise(
        prev,
        montantRemiseDepuisPourcent(totalBrut(prev), Number(remisePanier) || 0),
      ),
    );
    setEtape('paiement');
  }

  function onSearchKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
    e.preventDefault();
    traiterCodeScanne(e.currentTarget.value, 'saisie');
  }

  useEffect(() => {
    return () => {
      if (scanFeedbackTimer.current != null) {
        window.clearTimeout(scanFeedbackTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ticket || coupon) return;
      if (e.key === 'Escape') {
        if (notice || confirm || parkOpen || fileOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (notice) {
          setNotice(null);
          return;
        }
        if (confirm) {
          setConfirm(null);
          return;
        }
        if (parkOpen) {
          setParkOpen(false);
          return;
        }
        if (fileOpen) {
          setFileOpen(false);
          return;
        }
        if (etape !== 'caisse') return;
        if (cloture) {
          setCloture(false);
          return;
        }
        if (drawer) setDrawer(false);
        return;
      }
      if (etape !== 'caisse') return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (panier.length === 0) {
          if (holds.length > 0) setFileOpen(true);
          return;
        }
        ouvrirPark();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        if (holds.length > 0) setFileOpen((o) => !o);
        return;
      }
      if ((e.key === 'Enter' && e.ctrlKey) || e.key === 'F4') {
        e.preventDefault();
        if (panier.length === 0) return;
        setPanier((prev) =>
          distribuerRemise(
            prev,
            montantRemiseDepuisPourcent(
              totalBrut(prev),
              Number(remisePanier) || 0,
            ),
          ),
        );
        setEtape('paiement');
        return;
      }

      const overlays = Boolean(notice || confirm || parkOpen || fileOpen || cloture);
      if (overlays) return;

      const target = e.target as HTMLElement | null;
      const search = searchRef.current;
      const searchFocused = search != null && target === search;
      const typeChamp =
        target instanceof HTMLInputElement ? target.type : '';
      const autreChamp =
        target != null &&
        target !== search &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          (target.tagName === 'INPUT' &&
            typeChamp !== 'button' &&
            typeChamp !== 'submit' &&
            typeChamp !== 'checkbox' &&
            typeChamp !== 'radio' &&
            typeChamp !== 'hidden'));

      if (
        !searchFocused &&
        !autreChamp &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const result = appliquerTouchePistolet(
          pistoletRef.current,
          Date.now(),
          e.key,
        );
        pistoletRef.current = result.etat;
        if (result.code) {
          e.preventDefault();
          e.stopImmediatePropagation();
          traiterScanRef.current(result.code, 'pistolet');
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    etape,
    ticket,
    coupon,
    notice,
    confirm,
    parkOpen,
    fileOpen,
    cloture,
    drawer,
    panier,
    remisePanier,
    holds.length,
    remiseDepasse,
    clientId,
    parkLibelle,
    parkMotif,
    parkPrint,
  ]);

  if (coupon) {
    return (
      <CouponAttente
        hold={coupon}
        boutiqueNom={boutiqueNom}
        client={
          clientsDisponibles.find((c) => c.id === coupon.clientId) ?? null
        }
        onSuite={() => setCoupon(null)}
      />
    );
  }

  if (ticket) {
    return (
      <TicketVente
        vente={ticket}
        client={ticketClient}
        boutiqueNom={boutiqueNom}
        societe={societeQ.data}
        caissier={userLogin}
        montantRecu={ticketEncaissement?.montantRecu}
        monnaie={ticketEncaissement?.monnaie}
        onSuite={() => {
          setTicket(null);
          setTicketClient(null);
          setTicketEncaissement(null);
        }}
      />
    );
  }

  if (etatOpen) {
    return (
      <EtatCaissePrint sessionId={session.id} onFermer={() => setEtatOpen(false)} />
    );
  }

  const overlays = (
    <>
      {parkOpen && (
        <ParkDialog
          nbArticles={panier.reduce((s, l) => s + l.quantite, 0)}
          montant={net}
          libelle={parkLibelle}
          motif={parkMotif}
          imprimerCoupon={parkPrint}
          onLibelle={setParkLibelle}
          onMotif={setParkMotif}
          onImprimerCoupon={setParkPrint}
          onConfirmer={confirmerPark}
          onAnnuler={() => setParkOpen(false)}
        />
      )}
      {fileOpen && (
        <FileAttenteCaisse
          holds={holds}
          clients={clientsDisponibles}
          now={now}
          onReprendre={reprendre}
          onAbandonner={abandonnerAttente}
          onImprimer={(id) => {
            const h = holds.find((x) => x.id === id);
            if (h) {
              setFileOpen(false);
              setCoupon(h);
            }
          }}
          onFermer={() => setFileOpen(false)}
        />
      )}
      {notice && <PosNotice message={notice} onFermer={() => setNotice(null)} />}
      {confirm?.kind === 'vider' && (
        <PosConfirm
          titre="Vider la commande"
          message="La commande en cours sera perdue. Rien n’a été encaissé."
          confirmer="Vider"
          danger
          onAnnuler={() => setConfirm(null)}
          onConfirmer={() => {
            setPanier([]);
            setRemisePanier('');
            setClientId('');
            setLastProduitId(null);
            const hold = holdIdEnCours;
            setHoldIdEnCours(null);
            setConfirm(null);
            focuserScan();
            if (hold && navigator.onLine) {
              void apiFetch(
                `/ventes/sessions/${session.id}/reservations/${hold}`,
                { method: 'DELETE' },
              ).catch(() => undefined);
            } else if (hold) {
              enqueueLiberation(session.id, hold);
            }
          }}
        />
      )}
      {confirm?.kind === 'abandonner' && (
        <PosConfirm
          titre="Abandonner le ticket"
          message="Rien n’a été encaissé ; ce ticket disparaît de la file."
          confirmer="Abandonner"
          danger
          onAnnuler={() => setConfirm(null)}
          onConfirmer={() => {
            const id = confirm.id;
            setHolds((prev) => prev.filter((h) => h.id !== id));
            setConfirm(null);
            if (navigator.onLine) {
              void apiFetch(
                `/ventes/sessions/${session.id}/reservations/${id}`,
                { method: 'DELETE' },
              )
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: ['stocks'] }),
                )
                .catch(() => undefined);
            } else {
              enqueueLiberation(session.id, id);
            }
          }}
        />
      )}
    </>
  );

  if (etape === 'paiement') {
    return (
      <>
        <PaiementScreen
          panier={panier}
          session={session}
          clients={clientsDisponibles}
          clientId={clientId}
          holdId={holdIdEnCours}
          besoinDerogationRemise={remiseDepasse}
          onClientChange={setClientId}
          onAnnuler={() => setEtape('caisse')}
          onMettreEnAttente={ouvrirPark}
          onVente={(vente, client, encaissement) => {
            setPanier([]);
            setRemisePanier('');
            setClientId('');
            setLastProduitId(null);
            setHoldIdEnCours(null);
            setEtape('caisse');
            setTicketClient(client);
            setTicket(vente);
            setTicketEncaissement(encaissement ?? null);
            setPending(outboxVentesCount(session.id));
          }}
        />
        {overlays}
      </>
    );
  }

  return (
    <div className="pos-shell" data-testid="pos-shell">
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
        <div className="pos-topbar-actions">
          <span
            className={`pos-online-chip${online ? '' : ' is-off'}${pending > 0 ? ' is-sync' : ''}`}
            title={
              !online
                ? 'Hors ligne — les ventes iront au serveur automatiquement à la reconnexion'
                : pending > 0
                  ? `${pending} vente(s) : envoi automatique en cours`
                  : 'En ligne — les ventes partent au serveur'
            }
          >
            {online ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}
            <span>
              {!online ? 'Hors ligne' : pending > 0 ? `Envoi ${pending}` : 'En ligne'}
            </span>
            <InfoTooltip insight={insightHorsLignePos(pending, online)} />
          </span>
          <button
            type="button"
            data-testid="pos-file-btn"
            title={
              holds.length > 0
                ? 'File d’attente — reprendre un ticket'
                : 'Mettre la commande en attente'
            }
            onClick={() => {
              if (holds.length > 0) {
                setFileOpen(true);
                return;
              }
              ouvrirPark();
            }}
          >
            <Pause size={15} />
            File
            {holds.length > 0 && <span className="pos-topbar-count">{holds.length}</span>}
          </button>
          <button type="button" data-testid="pos-orders-btn" onClick={() => setDrawer((d) => !d)}>
            <ShoppingCart size={15} />
            Commandes
            {ventes.length > 0 && <span className="pos-topbar-count">{ventes.length}</span>}
          </button>
          <button
            type="button"
            data-testid="pos-etat-x-btn"
            title="Relevé de contrôle : ventes du jour, sans fermer la caisse"
            onClick={() => setEtatOpen(true)}
          >
            <FileText size={15} />
            Ventes du jour
          </button>
          <button
            type="button"
            data-testid="pos-cloture-btn"
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
            ? `${pending} ticket(s) : envoi automatique au serveur en cours.`
            : 'Hors ligne — les encaissements iront en file locale, puis au serveur tout seuls à la reconnexion.'}
        </div>
      )}

      <div className="pos-workspace">
        <section className="pos-catalog">
          <div className="pos-search-bar">
            <div className="pos-qty-stepper" aria-label="Quantité à scanner">
              <button
                type="button"
                aria-label="Diminuer la quantité"
                disabled={qteSaisie <= 1}
                onClick={() => setQteSaisie((n) => Math.max(1, n - 1))}
              >
                <Minus size={14} />
              </button>
              <strong>{qteSaisie}</strong>
              <button
                type="button"
                aria-label="Augmenter la quantité"
                disabled={qteSaisie >= 99}
                onClick={() => setQteSaisie((n) => Math.min(99, n + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="pos-search-field">
              <Search size={18} className="pos-search-icon" />
              <input
                ref={searchRef}
                type="search"
                name="pos-scan"
                data-testid="pos-search-input"
                placeholder="Scanner l’étiquette, référence, désignation, 3×SKU…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                onKeyDown={onSearchKey}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
            {lastProduitId && (
              <button
                type="button"
                className="pos-repeat-btn"
                title="Répéter le dernier article"
                onClick={() => {
                  const p = produits.find((x) => x.id === lastProduitId);
                  if (p) ajouter(p);
                }}
              >
                <Repeat size={16} />
              </button>
            )}
          </div>
          {scanFeedback && (
            <div
              className={`pos-scan-feedback is-${scanFeedback.kind}`}
              role="status"
              data-testid="pos-scan-feedback"
            >
              {scanFeedback.text}
            </div>
          )}
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
            {!catalogueOuvert ? (
              <div className="pos-catalog-idle">
                <p className="pos-catalog-idle-title">Rechercher un article</p>
                <p className="pos-catalog-idle-hint">
                  Scannez le code-barres de l&apos;étiquette (EAN ou INT) ou
                  saisissez une référence / une désignation — seuls les articles
                  correspondants s&apos;affichent ici.
                </p>
                <p className="pos-catalog-idle-hint">
                  Vous pouvez aussi choisir une catégorie ou « Rupture » ci-dessus.
                </p>
              </div>
            ) : (
              <>
                {produitsAffiches.map((p) => {
              const qte = panier.find((l) => l.produitId === p.id)?.quantite ?? 0;
              const restant = stockDisponible(p.id, p.stock) - qte;
              const epuise = restant <= 0;
              const statut = statutStockBoutique(restant, p.seuilReappro);
              return (
                <div key={p.id} className="pos-tile-wrap">
                  <button
                    type="button"
                    data-testid={`pos-tile-${p.reference ?? p.id}`}
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
                    {p.imageUrl ? (
                      <img className="pos-tile-img" src={p.imageUrl} alt="" />
                    ) : null}
                    <span className="pos-tile-body">
                      {p.categorie ? (
                        <span className="pos-tile-cat">{p.categorie}</span>
                      ) : null}
                      <span className="pos-tile-name">{p.designation}</span>
                      {p.reference ? (
                        <span className="pos-tile-sku">{p.reference}</span>
                      ) : null}
                      <span className="pos-tile-price money">
                        {formatMontant(Number(p.prixUnitaire))}
                      </span>
                      <span className="pos-tile-stock">
                        {epuise ? 'Rupture' : `Stock ${restant}`}
                      </span>
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
                {produitsAffiches.length === 0 && (
                  <p className="pos-empty">Aucun article pour cette recherche ou ce filtre.</p>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="pos-ticket">
          <RailAttente
            holds={holds}
            now={now}
            onOuvrirFile={() => setFileOpen(true)}
            onReprendre={reprendre}
          />
          <div className="pos-ticket-header">
            Commande en cours
            {panier.length > 0 && (
              <span className="pos-ticket-count">
                {panier.reduce((s, l) => s + l.quantite, 0)} art.
              </span>
            )}
            <InfoTooltip insight={insightCommandeEnAttente(holds.length)} />
          </div>
          <div className="pos-ticket-client">
            <ClientPicker
              clients={clientsDisponibles}
              clientId={clientId}
              onChange={setClientId}
            />
          </div>
          <ul className="pos-order-lines">
            {panier.length === 0 ? (
              <li className="pos-order-empty">
                {holds.length > 0
                  ? 'Scannez, ou reprenez un n° dans la file'
                  : 'Scannez un code ou touchez un produit'}
              </li>
            ) : (
              panier.map((l) => (
                <li
                  key={l.produitId}
                  className={l.produitId === lastProduitId ? 'is-last' : undefined}
                >
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
              Remise en pourcentage (max {plafondPct} %)
              <InfoTooltip insight={insightRemisePos(remise, brut)} />
            </label>
            <div className="pos-remise-pct">
              <input
                id="remisePanier"
                type="number"
                min="0"
                max={plafondPct}
                step="0.5"
                inputMode="decimal"
                value={remisePanier}
                onChange={(e) => setRemisePanier(e.target.value)}
                disabled={panier.length === 0}
                placeholder="0"
                aria-label="Remise en pourcentage"
              />
              <span className="pos-remise-suffix" aria-hidden>
                %
              </span>
            </div>
            <div className="pos-remise-chips" role="group" aria-label="Remises rapides">
              {[0, 5, 10, 15, 20].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    remisePct === p ? 'pos-chip is-active' : 'pos-chip'
                  }
                  disabled={panier.length === 0}
                  onClick={() => setRemisePanier(String(p))}
                >
                  {p} %
                </button>
              ))}
            </div>
            {remise > 0 && !remiseDepasse && (
              <p className="pos-muted" role="status">
                {remisePct} % = −{formatMontant(remise)} FCFA (plafond{' '}
                {formatMontant(plafond)} FCFA)
              </p>
            )}
            {remiseDepasse && (
              <p className="pos-warn" role="status">
                Remise au-dessus du plafond {plafondPct} % — dérogation
                responsable requise au paiement.
              </p>
            )}
            <div className="pos-order-totals">
              <div>
                <span>Sous-total</span>
                <span className="money">{formatMontant(brut)}</span>
              </div>
              {remise > 0 && (
                <div>
                  <span>Remise{remiseDepasse ? ' (!)' : ''}</span>
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
                data-testid="pos-park-btn"
                onClick={ouvrirPark}
              >
                <Pause size={16} />
                Mettre en attente
              </button>
            )}
            {panier.length > 0 && (
              <button
                type="button"
                className="pos-btn-ghost pos-clear"
                data-testid="pos-clear-btn"
                onClick={() => setConfirm({ kind: 'vider' })}
              >
                Vider le panier
              </button>
            )}
            <button
              type="button"
              className="pos-pay-btn"
              data-testid="pos-go-pay"
              disabled={panier.length === 0}
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
              <ul className="pos-orders-list" data-testid="pos-orders-list">
                {ventes.map((vente) => (
                  <li key={vente.id}>
                    <div className="pos-orders-list-head">
                      <span>
                        {new Date(vente.dateVente).toLocaleTimeString('fr-FR')} ·{' '}
                        {libellePaiements(vente)}
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
          onCloturee={onSessionCloturee}
        />
      )}
      {overlays}
    </div>
  );
}

export function PosPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const peut = user !== null && ROLES_PERIMETRE_BOUTIQUE.includes(user.role);
  const [tiroirId, setTiroirId] = useState<string>('');
  const [ouvrirNouvelleJournee, setOuvrirNouvelleJournee] = useState(false);
  const [apresCloture, setApresCloture] =
    useState<ClotureSessionResponseDto | null>(null);

  function allerChangerCompte() {
    logout();
    navigate('/login', { replace: true, state: { from: '/pos' } });
  }
  const {
    data: caisses,
    isLoading: loadingCaisses,
    isError: erreurCaisses,
    refetch: refetchCaisses,
  } = useCaisses(peut);
  const tiroirs =
    caisses?.filter(
      (c) =>
        c.type === TypeCaisse.TIROIR &&
        c.boutiqueId === user?.boutiqueId &&
        c.actif !== false,
    ) ?? [];
  const magasin = caisses?.find(
    (c) =>
      c.type === TypeCaisse.MAGASIN &&
      c.boutiqueId === user?.boutiqueId &&
      c.actif !== false,
  );

  useEffect(() => {
    if (!tiroirId && tiroirs.length > 0) {
      setTiroirId(tiroirs[0].id);
    }
  }, [tiroirId, tiroirs]);

  const caisse = tiroirs.find((c) => c.id === tiroirId) ?? tiroirs[0];

  const { data: sessions, isLoading: loadingSessions } = useSessions(peut && !!caisse);
  const session = sessions?.find(
    (s) => s.caisseId === caisse?.id && s.statut === 'OUVERTE',
  );
  const sessionFermee = derniereSessionFermee(sessions, caisse?.id);

  useEffect(() => {
    if (session) setOuvrirNouvelleJournee(false);
  }, [session]);

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
  const tiroirLabel = caisse
    ? caisse.code
      ? `${caisse.code}${caisse.libelle ? ` — ${caisse.libelle}` : ''}`
      : (caisse.libelle ?? 'Tiroir')
    : 'Tiroir';
  const peutInitierVersement =
    user !== null && ROLES_INITIATION_SORTIE_FONDS.includes(user.role);

  const produitsEntrepot =
    produits && stocksPos
      ? produits.map((p) => {
          const q = stocksPos.find((s) => s.produitId === p.id);
          const stock = Math.max(
            0,
            (q?.quantite ?? 0) - (q?.quantiteReservee ?? 0),
          );
          return {
            ...p,
            stock,
            statutStock: statutStockBoutique(stock, p.seuilReappro),
          };
        })
      : undefined;

  if (apresCloture) {
    return (
      <EtatCaissePrint
        sessionId={apresCloture.session.id}
        autoPrint
        bordereauId={apresCloture.transactionVersementId}
        onFermer={() => setApresCloture(null)}
      />
    );
  }

  if (!peut) {
    return (
      <PosGateCard>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>Point de vente</h1>
        <p>Réservé Caissier / Responsable boutique.</p>
        {user ? (
          <p className="lead">
            Connecté en <strong>{user.login}</strong> ({user.role}) — ce rôle
            n’ouvre pas le POS. Déconnectez-vous puis utilisez le compte
            caissier.
          </p>
        ) : (
          <p className="lead">
            Compte démo : <strong>demo-pos-caissier</strong> / MotDePasse!123
          </p>
        )}
        <button type="button" className="btn-primary" onClick={allerChangerCompte}>
          {user ? 'Changer de compte' : 'Se connecter'}
        </button>
        {user ? (
          <p className="pos-gate-hint">
            Démo POS : <strong>demo-pos-caissier</strong> / MotDePasse!123
          </p>
        ) : null}
      </PosGateCard>
    );
  }

  if (loadingCaisses || (caisse && loadingSessions)) {
    return (
      <div className="pos-gate">
        <LoadingState label="Chargement de la caisse…" />
      </div>
    );
  }

  if (erreurCaisses) {
    return (
      <PosGateCard>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>Caisses indisponibles</h1>
        <p>
          L’API n’a pas pu charger les caisses (souvent un serveur API arrêté ou
          en erreur). Vérifiez que l’API tourne, puis réessayez.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void refetchCaisses()}
        >
          Réessayer
        </button>
        <Link to="/dashboard" className="pos-back-link">
          ← Tableau de bord
        </Link>
      </PosGateCard>
    );
  }

  if (!user?.boutiqueId) {
    return (
      <PosGateCard>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>Aucune boutique rattachée</h1>
        <p>
          Ce compte n’est lié à aucune boutique — le POS boutique exige un
          rattachement.
        </p>
        <p className="lead">
          Compte démo : <strong>demo-pos-caissier</strong> / MotDePasse!123
        </p>
        <button type="button" className="btn-primary" onClick={allerChangerCompte}>
          Changer de compte
        </button>
      </PosGateCard>
    );
  }

  if (!caisse) {
    return (
      <PosGateCard>
        <div className="pos-gate-brand">CaissePOS</div>
        <h1>
          Aucun tiroir <InfoTooltip insight={insightCaisseAuxiliairePos()} />
        </h1>
        <p>
          Aucun tiroir actif pour votre boutique. Le DAF configure les postes
          de caisse (tiroirs) dans Entreprise.
        </p>
        <p className="lead">
          Démo seedée : reconnectez-vous en <strong>demo-pos-caissier</strong>{' '}
          (tiroir T01).
        </p>
        <button type="button" className="btn-primary" onClick={allerChangerCompte}>
          Changer de compte
        </button>
      </PosGateCard>
    );
  }

  if (!session) {
    if (sessionFermee && !ouvrirNouvelleJournee) {
      return (
        <PosJourneeFermee
          session={sessionFermee}
          magasin={magasin}
          boutiqueNom={boutiqueNom}
          tiroirLabel={tiroirLabel}
          caissierLogin={user?.login}
          peutInitierVersement={peutInitierVersement}
          onOuvrirJournee={() => setOuvrirNouvelleJournee(true)}
        />
      );
    }
    return (
      <div className="pos-gate">
        <OuvertureSessionForm
          caisseId={caisse.id}
          tiroirLabel={tiroirLabel}
          boutiqueNom={boutiqueNom}
          caissierLogin={user?.login}
          tiroirs={tiroirs}
          onSelectTiroir={setTiroirId}
          onAnnuler={
            sessionFermee
              ? () => setOuvrirNouvelleJournee(false)
              : undefined
          }
        />
      </div>
    );
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
      onSessionCloturee={setApresCloture}
    />
  );
}
