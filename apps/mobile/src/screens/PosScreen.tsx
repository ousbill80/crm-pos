import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  useFocusEffect,
  type CompositeScreenProps,
} from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ModePaiement, TypeCaisse, trouverProduitParScan } from '@caisse-crm/shared';
import {
  enqueueCloturerSessionOp,
  enqueueLiberationOp,
  enqueueOuvrirSessionOp,
  enqueueReservationOp,
  enqueueVenteOp,
  getOfflineStore,
} from '@caisse-crm/offline';
import { apiFetch, ApiError } from '../api';
import { libererReservation, upsertReservation } from '../api/ventes';
import { formatFcfa, peutNouveauVersement } from '../circuit/actions';
import {
  ClientEntityFinder,
  libelleClient,
  type ClientMini,
} from '../components/ClientEntityFinder';
import { ComptageDenominations } from '../components/ComptageDenominations';
import { NumpadEspeces } from '../components/NumpadEspeces';
import { ProduitThumb } from '../components/ProduitThumb';
import { SessionBanner } from '../components/SessionBanner';
import {
  PosTicketRecu,
  type TicketVenteData,
} from '../components/PosTicketRecu';
import {
  Banner,
  Chip,
  IconAction,
  Money,
  StatusPill,
} from '../components/ScreenChrome';
import {
  DerogationPanel,
  type DerogationState,
  type MotifDerogation,
} from '../components/DerogationPanel';
import { newClientOperationId } from '../lib/id';
import { useRootNavigation } from '../navigation/use-root-navigation';
import {
  useOutboxOperations,
  useOutboxPending,
} from '../offline/use-outbox-pending';
import { tenterFlushMobile } from '../offline/auto-sync';
import { estErreurHorsLigne } from '../offline/erreurs';
import { verifierIdentifiantsLocal } from '../offline/local-auth';
import { stasherSecretOp } from '../offline/op-secrets';
import { quantiteProduitDansVentesOutbox } from '../offline/stock-outbox';
import {
  formatNumeroAttente,
  hydrateHolds,
  payloadReservation,
  prochainNumero,
  quantiteParquee,
  saveHolds,
  type CommandeEnAttente,
  type LignePanierHold,
  type MotifAttente,
} from '../pos-holds';
import { useSession } from '../session-context';
import { colors, ui } from '../ui';
import type {
  CaisseDto,
  MainTabParamList,
  PosStackParamList,
} from '../navigation/types';
import {
  appliquerRemisePanier,
  modePrincipal,
  MODES_POS,
  montantRemiseDepuisPourcent,
  montantRestePart,
  paiementsDepuisParts,
  partEspeces,
  partsInitiales,
  RAPIDE_ESPECES,
  REMISE_MAX_RATIO,
  recuEspecesParDefaut,
  repartitionComplete,
  remiseFideliteFcfa,
  resteARepartir,
  stockDisponible,
  synchroniserPartsAuTotal,
  syntheseEncaissement,
  toggleModePaiement,
  totalBrut,
  totalNet,
  type LignePanier,
  type PartPaiement,
} from '../pos-panier';

type Props = CompositeScreenProps<
  NativeStackScreenProps<PosStackParamList, 'PosHome'>,
  BottomTabScreenProps<MainTabParamList, 'Caisse'>
>;

interface Session {
  id: string;
  caisseId: string;
  statut: string;
  clotureDateHeure?: string | null;
  fondInitial?: string | null;
  fondCompteCloture?: string | null;
  transactionVersementId?: string | null;
  transactionSortieCentraleId?: string | null;
}

interface Produit {
  id: string;
  designation: string;
  prixUnitaire: string;
  reference?: string | null;
  codeBarres?: string | null;
  imageUrl?: string | null;
  actif?: boolean;
  stock?: number;
}

interface Temoin {
  id: string;
  login: string;
  prenom: string;
  nom: string;
  role: string | null;
}

interface ClotureResultat {
  sessionId: string;
  transactionId: string | null;
  sortieCentraleId: string | null;
  fondCompte: number;
  fondInitial: number;
}

interface ParametresCrmPos {
  avantageFideliteArgentPct: number;
  avantageFideliteOrPct: number;
}

const PARAMETRES_CRM_DEFAUT: ParametresCrmPos = {
  avantageFideliteArgentPct: 0,
  avantageFideliteOrPct: 0,
};

const CACHE_CATALOG = 'catalog';

type EtapePos = 'commande' | 'paiement' | 'ticket';

export function PosScreen({ navigation, route }: Props) {
  const root = useRootNavigation();
  const { signOut, user } = useSession();
  const pendingOutbox = useOutboxPending();
  const { ops: operationsOutbox, refresh: rafraichirOperationsOutbox } =
    useOutboxOperations();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tiroirs, setTiroirs] = useState<CaisseDto[]>([]);
  const [caisse, setCaisse] = useState<CaisseDto | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Session ouverte hors ligne : `session.id` porte le placeholder
  // `{{localSessionId:...}}` tant que l'ouverture n'est pas synchronisée
  // (§6.7 — file offline session caisse).
  const [sessionEnAttenteSync, setSessionEnAttenteSync] = useState(false);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [rechercheProduit, setRechercheProduit] = useState('');
  const [temoins, setTemoins] = useState<Temoin[]>([]);
  const [temoinLogin, setTemoinLogin] = useState('');
  const [temoinPassword, setTemoinPassword] = useState('');
  const [fond, setFond] = useState('0');
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [remiseSaisie, setRemiseSaisie] = useState('0');
  const [parts, setParts] = useState<PartPaiement[]>(() => partsInitiales(0));
  const [client, setClient] = useState<ClientMini | null>(null);
  const [parametresCrm, setParametresCrm] = useState<ParametresCrmPos>(
    PARAMETRES_CRM_DEFAUT,
  );
  const [pending, setPending] = useState(false);
  const [clotureOn, setClotureOn] = useState(false);
  const [fondCompteCloture, setFondCompteCloture] = useState('0');
  const [clotureTemoinLogin, setClotureTemoinLogin] = useState('');
  const [clotureTemoinPassword, setClotureTemoinPassword] = useState('');
  const [clotureResultat, setClotureResultat] = useState<ClotureResultat | null>(
    null,
  );
  const [lastClosed, setLastClosed] = useState<Session | null>(null);
  const [forceOuverture, setForceOuverture] = useState(false);
  const [etape, setEtape] = useState<EtapePos>('commande');
  const [recu, setRecu] = useState('');
  const [ticket, setTicket] = useState<TicketVenteData | null>(null);
  const [boutiqueNom, setBoutiqueNom] = useState<string | null>(null);
  const [derogation, setDerogation] = useState<DerogationState | null>(null);
  const [holds, setHolds] = useState<CommandeEnAttente[]>([]);
  // Ticket en attente actuellement repris dans le panier (§6.4) : la
  // réservation stock correspondante n'est libérée qu'à la vente effective
  // (via `holdId` dans le corps de la vente, consommée atomiquement côté
  // serveur) ou à l'abandon explicite du panier — jamais à la simple reprise,
  // pour ne pas ouvrir de fenêtre de double-vente entre caisses.
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null);

  const panierAvecRemise = useMemo(() => {
    const pct = Number(remiseSaisie) || 0;
    const montant = montantRemiseDepuisPourcent(totalBrut(panier), pct);
    const avecDerogation =
      pct > REMISE_MAX_RATIO * 100 &&
      derogation?.login.trim() !== '' &&
      derogation?.password.trim() !== '';
    return appliquerRemisePanier(panier, montant, avecDerogation);
  }, [panier, remiseSaisie, derogation]);

  const stockDisponibleLocal = useCallback(
    (produit: Produit, quantitePanier: number, tickets = holds) => {
      if (typeof produit.stock !== 'number') return null;
      return stockDisponible(
        produit.stock,
        quantitePanier,
        quantiteParquee(tickets, produit.id),
        quantiteProduitDansVentesOutbox(operationsOutbox, produit.id),
      );
    },
    [holds, operationsOutbox],
  );
  const totalAvantFidelite = useMemo(
    () => totalNet(panierAvecRemise),
    [panierAvecRemise],
  );
  const pctFidelite =
    client?.fidelite?.niveau === 'OR'
      ? parametresCrm.avantageFideliteOrPct
      : client?.fidelite?.niveau === 'ARGENT'
        ? parametresCrm.avantageFideliteArgentPct
        : 0;
  const remiseFidelite = remiseFideliteFcfa(
    totalAvantFidelite,
    pctFidelite,
  );
  const total = totalAvantFidelite - remiseFidelite;
  const brut = useMemo(() => totalBrut(panier), [panier]);
  const plafondPct = REMISE_MAX_RATIO * 100;
  const remisePct = Number(remiseSaisie) || 0;
  const remiseMontant = useMemo(
    () => panierAvecRemise.reduce((somme, ligne) => somme + ligne.remise, 0),
    [panierAvecRemise],
  );
  const remiseDepasse = remisePct > plafondPct + 1e-9;
  // Un article déjà au panier peut dépasser le stock connu si le catalogue
  // a été resynchronisé à la baisse entre l'ajout et maintenant (rare, mais
  // le serveur refuse alors sans dérogation — §1 séparation des tâches).
  const depasseStockPanier = useMemo(
    () =>
      panier.some((l) => {
        const p = produits.find((x) => x.id === l.produitId);
        return (
          p !== undefined &&
          typeof p.stock === 'number' &&
          l.quantite > (stockDisponibleLocal(p, 0) ?? 0)
        );
      }),
    [panier, produits, stockDisponibleLocal],
  );
  const chefs = useMemo(
    () => temoins.filter((t) => t.role === 'RESPONSABLE_BOUTIQUE'),
    [temoins],
  );
  const motifsRequis = useMemo(() => {
    const motifs: MotifDerogation[] = [];
    if (remiseDepasse) motifs.push('REMISE_PLAFOND');
    if (depasseStockPanier) motifs.push('STOCK_INSUFFISANT');
    return motifs;
  }, [remiseDepasse, depasseStockPanier]);
  const derogationValide =
    derogation != null &&
    derogation.motifs.length > 0 &&
    derogation.login.trim() !== '' &&
    derogation.password.trim() !== '';
  const stockOverrideActif =
    derogationValide && (derogation?.motifs.includes('STOCK_INSUFFISANT') ?? false);
  const bloqueParDerogation = motifsRequis.length > 0 && !derogationValide;

  /** Le panneau de dérogation suit les motifs requis, sans effacer une saisie déjà en cours. */
  const motifsKey = motifsRequis.join('|');
  useEffect(() => {
    if (motifsRequis.length === 0) {
      setDerogation(null);
      return;
    }
    setDerogation((prev) =>
      prev
        ? { ...prev, motifs: motifsRequis }
        : { motifs: motifsRequis, login: '', password: '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motifsKey]);

  const restePay = resteARepartir(total, parts);
  const payOk = repartitionComplete(total, parts) && panier.length > 0;
  const surAllocation = parts.length > 1 && restePay < -0.5;
  const recuNum = Number(recu) || 0;
  const syn = useMemo(
    () =>
      syntheseEncaissement({
        totalNet: total,
        parts,
        recuEspeces: recuNum,
      }),
    [total, parts, recuNum],
  );
  const cashPart = syn.cashPart;
  const aEspeces = syn.aEspeces;
  const especeOk = syn.especesOk;
  const monnaie = syn.monnaie;
  const peutValiderPaiement =
    syn.peutValider && !bloqueParDerogation && !pending && panier.length > 0;

  useEffect(() => {
    setParts((prev) => synchroniserPartsAuTotal(prev, total));
  }, [total]);

  useEffect(() => {
    if (!user?.boutiqueId) {
      setBoutiqueNom(null);
      return;
    }
    let cancelled = false;
    void apiFetch<{ nom: string }>(`/boutiques/${user.boutiqueId}`)
      .then((b) => {
        if (!cancelled) setBoutiqueNom(b.nom);
      })
      .catch(() => {
        if (!cancelled) setBoutiqueNom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.boutiqueId]);

  // Dérogation requise mais liste des témoins pas encore chargée (session déjà
  // ouverte au montage de l'écran) — même endpoint que l'ouverture/clôture,
  // pas de nouvel appel.
  useEffect(() => {
    if (motifsRequis.length === 0 || temoins.length > 0 || !session?.id) return;
    let cancelled = false;
    void apiFetch<Temoin[]>('/ventes/temoins-eligibles')
      .then((t) => {
        if (!cancelled) setTemoins(t);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [motifsRequis.length, temoins.length, session?.id]);

  // Catalogue : pas de dump — recherche (≥2 car.) ou scan seulement.
  const produitsFiltres = useMemo(() => {
    const q = rechercheProduit.trim().toLowerCase();
    if (q.length < 2) return [];
    return produits.filter(
      (p) =>
        p.designation.toLowerCase().includes(q) ||
        (p.reference ?? '').toLowerCase().includes(q) ||
        (p.codeBarres ?? '').toLowerCase().includes(q),
    );
  }, [produits, rechercheProduit]);

  const chargerCatalogue = useCallback(async (sessionId?: string) => {
    try {
      const [catalog, crm] = await Promise.all([
        apiFetch<Produit[]>('/produits'),
        apiFetch<ParametresCrmPos>('/crm/parametres'),
      ]);
      const actifs = catalog.filter((p) => p.actif !== false);
      setProduits(actifs);
      setParametresCrm(crm);
      await getOfflineStore().setCache(CACHE_CATALOG, {
        produits: actifs,
        parametresCrm: crm,
      });
      if (sessionId) {
        await getOfflineStore().setCache(sessionId, {
          produits: actifs,
          parametresCrm: crm,
        });
      }
      return actifs;
    } catch {
      const cached = (await getOfflineStore().getCache(CACHE_CATALOG)) as {
        produits?: Produit[];
        parametresCrm?: ParametresCrmPos;
      } | null;
      if (cached?.produits?.length) {
        setProduits(cached.produits);
        setParametresCrm(
          cached.parametresCrm ?? PARAMETRES_CRM_DEFAUT,
        );
        setInfo('Catalogue local (hors ligne).');
        return cached.produits;
      }
      throw new Error('Catalogue indisponible');
    }
  }, []);

  const charger = useCallback(
    async (preferId?: string) => {
      setError(null);
      const caisses = await apiFetch<CaisseDto[]>('/caisses');
      const list = caisses.filter(
        (c) => c.type === TypeCaisse.TIROIR && c.actif !== false,
      );
      setTiroirs(list);
      setCaisse((actuel) => {
        return (
          list.find((c) => c.id === preferId) ??
          list.find((c) => c.id === actuel?.id) ??
          list[0] ??
          null
        );
      });
      const chosenId = preferId ?? list[0]?.id;
      if (!chosenId) {
        setLoading(false);
        setSession(null);
        return;
      }
      const sessions = await apiFetch<Session[]>('/ventes/sessions');
      const ouverte = sessions.find(
        (s) => s.caisseId === chosenId && s.statut === 'OUVERTE',
      );
      const fermees = sessions
        .filter((s) => s.caisseId === chosenId && s.statut === 'FERMEE')
        .sort((a, b) => {
          const da = Date.parse(a.clotureDateHeure ?? '');
          const db = Date.parse(b.clotureDateHeure ?? '');
          return db - da;
        });
      setLastClosed(fermees[0] ?? null);
      setSession(ouverte ?? null);
      if (ouverte) {
        setForceOuverture(false);
        await chargerCatalogue(ouverte.id);
      } else {
        const t = await apiFetch<Temoin[]>('/ventes/temoins-eligibles');
        setTemoins(t);
        if (t.length === 1) setTemoinLogin(t[0].login);
      }
      setLoading(false);
    },
    [chargerCatalogue],
  );

  useEffect(() => {
    void charger().catch(() => {
      setError('Impossible de charger la caisse.');
      setLoading(false);
    });
  }, [charger]);

  // Une session ouverte hors ligne garde le placeholder tant que son
  // ouverture n'est pas synchronisée (§6.7) : dès que l'op quitte la file
  // (sync auto en arrière-plan, cf. `auto-sync.ts`), on recharge la session
  // réelle pour que les ventes suivantes portent l'id serveur, pas le
  // placeholder.
  useEffect(() => {
    if (!sessionEnAttenteSync) return;
    let cancelled = false;
    const verifier = async () => {
      const queue = await getOfflineStore().listOutbox();
      const ouvertureEnAttente = queue.some(
        (op) => op.path === '/ventes/sessions' && op.method === 'POST',
      );
      if (!ouvertureEnAttente && !cancelled) {
        setSessionEnAttenteSync(false);
        await charger().catch(() => undefined);
      }
    };
    void verifier();
    const poll = setInterval(() => void verifier(), 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [sessionEnAttenteSync, charger]);

  useEffect(() => {
    void tenterFlushMobile().catch(() => undefined);
  }, []);

  /** Message d'échec de vérification locale du témoin (§6.7, hors ligne). */
  function messageTemoinHorsLigne(local: {
    verrouille?: boolean;
    perime?: boolean;
  }): string {
    if (local.verrouille) {
      return 'Témoin verrouillé localement (trop d’échecs) — reconnectez le réseau.';
    }
    if (local.perime) {
      return 'Identité témoin hors ligne périmée (24h) — reconnexion réseau nécessaire.';
    }
    return 'Identifiants témoin invalides ou jamais connectés en ligne sur cet appareil.';
  }

  async function ouvrir() {
    if (!caisse) return;
    setPending(true);
    setError(null);
    const clientOperationId = newClientOperationId();
    try {
      const created = await apiFetch<Session>('/ventes/sessions', {
        method: 'POST',
        body: JSON.stringify({
          caisseId: caisse.id,
          fondInitial: Number(fond) || 0,
          temoinLogin,
          temoinPassword,
          clientOperationId,
        }),
      });
      setSession(created);
      setSessionEnAttenteSync(false);
      await chargerCatalogue(created.id);
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        const local = await verifierIdentifiantsLocal(temoinLogin, temoinPassword);
        if (!local.ok) {
          setError(messageTemoinHorsLigne(local));
          setPending(false);
          return;
        }
        const { op, placeholderSessionId } = await enqueueOuvrirSessionOp(
          getOfflineStore(),
          {
            caisseId: caisse.id,
            fondInitial: Number(fond) || 0,
            temoinLogin,
            clientOperationId,
          },
        );
        await stasherSecretOp(op.id, { temoinPassword });
        const localSession: Session = {
          id: placeholderSessionId,
          caisseId: caisse.id,
          statut: 'OUVERTE',
        };
        setSession(localSession);
        setSessionEnAttenteSync(true);
        await chargerCatalogue(localSession.id);
        setInfo('Session ouverte hors ligne — en attente de synchronisation.');
        void tenterFlushMobile();
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Ouverture refusée (fond ou confirmateur).',
        );
      }
    } finally {
      setPending(false);
    }
  }

  function ajouter(p: Produit, qteDemandee?: number) {
    const dejaAuPanier = panier.find((l) => l.produitId === p.id)?.quantite ?? 0;
    // Jamais dépasser le stock connu, sauf dérogation STOCK_INSUFFISANT déjà
    // renseignée (chef de caisse) — validation finale toujours server-side.
    if (
      stockDisponibleLocal(p, dejaAuPanier) !== null &&
      stockDisponibleLocal(p, dejaAuPanier) === 0 &&
      !stockOverrideActif
    ) {
      setError(
        `Stock insuffisant pour « ${p.designation} » (stock ${p.stock}) — dérogation du responsable boutique requise.`,
      );
      return;
    }
    // Quantité demandée (défaut 1, ex. "3xREF" recherché) plafonnée au stock
    // disponible si connu et sans dérogation active — jamais un rejet
    // silencieux total, juste un ajout partiel borné (miroir de `ajouter()`
    // web, `PosPage.tsx:2182-2213` : `ajout = Math.min(demande, dispo - deja)`).
    const demande = Math.max(1, qteDemandee ?? 1);
    const ajout =
      typeof p.stock === 'number' && !stockOverrideActif
        ? Math.min(demande, stockDisponibleLocal(p, dejaAuPanier) ?? 0)
        : demande;
    if (ajout <= 0) return;
    setPanier((prev) => {
      const exist = prev.find((l) => l.produitId === p.id);
      if (exist) {
        return prev.map((l) =>
          l.produitId === p.id ? { ...l, quantite: l.quantite + ajout } : l,
        );
      }
      return [
        ...prev,
        {
          produitId: p.id,
          designation: p.designation,
          prixUnitaire: p.prixUnitaire,
          quantite: ajout,
          remise: 0,
          imageUrl: p.imageUrl ?? null,
        },
      ];
    });
    setRechercheProduit('');
  }

  function retirer(produitId: string, tout = false) {
    setPanier((prev) =>
      prev.flatMap((l) => {
        if (l.produitId !== produitId) return [l];
        if (tout || l.quantite <= 1) return [];
        return [{ ...l, quantite: l.quantite - 1 }];
      }),
    );
  }

  // Syntaxe préfixe quantité "3xREF"/"3*REF" + Entrée, et scan pistolet
  // Bluetooth (le code arrive dans le champ puis Entrée) — même lookup
  // EAN/INT/SKU que la caisse web.
  function onSoumissionRecherche() {
    const raw = rechercheProduit.trim();
    if (!raw) return;
    const prefix = /^(\d+)\s*[x*×]\s*(.*)$/i.exec(raw);
    const qte = prefix ? Math.max(1, Number(prefix[1])) : 1;
    const query = (prefix ? prefix[2] : raw).trim();
    if (!query) return;
    const exact = trouverProduitParScan(produits, query);
    if (exact) {
      ajouter(exact, qte);
      setRechercheProduit('');
      setError(null);
      return;
    }
    if (prefix || query.length >= 8) {
      setError(`Aucun produit pour le code « ${query} ».`);
    }
  }

  // Vider le panier en cours (miroir de `confirm?.kind === 'vider'` web,
  // `PosPage.tsx:2532-2555`) : même réinitialisation que `mettreEnAttente()`
  // — panier, remise, répartition de paiement et client — sans conséquence
  // financière (rien n'a été encaissé), confirmation obligatoire avant effet.
  function viderPanier() {
    const sessionId = session?.id;
    async function executer() {
      // Vidage explicite d'un panier repris depuis un ticket en attente : la
      // réservation stock associée n'ayant jamais été libérée à la reprise
      // (cf. effet `resumeHoldId`), c'est ici, à l'abandon effectif, qu'elle
      // doit l'être — mêmes semantiques que la libération précédemment faite
      // à la reprise, déplacées au bon moment du cycle de vie.
      const holdId = resumingHoldId;
      setPanier([]);
      setRemiseSaisie('0');
      setParts(partsInitiales(0));
      setClient(null);
      setError(null);
      setResumingHoldId(null);
      if (holdId && sessionId) {
        try {
          await libererReservation(sessionId, holdId);
        } catch (err) {
          if (estErreurHorsLigne(err)) {
            await enqueueLiberationOp(getOfflineStore(), sessionId, holdId);
          }
        }
      }
    }
    const titre = 'Vider le panier';
    const message = 'La commande en cours sera perdue. Rien n’a été encaissé.';
    if (Platform.OS === 'web') {
      const ok =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`${titre}\n\n${message}`)
          : true;
      if (ok) void executer();
      return;
    }
    Alert.alert(titre, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Vider', style: 'destructive', onPress: () => void executer() },
    ]);
  }

  useEffect(() => {
    const code = route.params?.scannedCode;
    if (!code || !session) return;
    const trouve = trouverProduitParScan(produits, code);
    if (trouve) {
      ajouter(trouve);
      setError(null);
    } else {
      setError(`Aucun produit pour le code « ${code} ».`);
    }
    navigation.setParams({ scannedCode: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.scannedCode]);

  // Tickets en attente (park POS §6.4) : rechargés à chaque focus (aussi au
  // retour de l'écran TicketsAttente, qui mute le stock local via saveHolds).
  useFocusEffect(
    useCallback(() => {
      if (!session?.id) return;
      let cancelled = false;
      void hydrateHolds(session.id).then((loaded) => {
        if (!cancelled) setHolds(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [session?.id]),
  );

  // Reprise d'un ticket en attente depuis TicketsAttenteScreen — même logique
  // que apps/web/src/routes/PosPage.tsx `reprendre()`, à ceci près que si le
  // panier courant n'est pas vide on bloque avec un message plutôt que de
  // porter le swap implicite (simplification ergonomique mobile assumée).
  useEffect(() => {
    const holdId = route.params?.resumeHoldId;
    if (!holdId || !session) return;
    navigation.setParams({ resumeHoldId: undefined });
    if (panier.length > 0) {
      setError(
        'Le panier en cours n’est pas vide — mettez-le en attente ou videz-le avant de reprendre un autre ticket.',
      );
      return;
    }
    void (async () => {
      const local = await hydrateHolds(session.id);
      const hold = local.find((h) => h.id === holdId);
      if (!hold) return;
      const autres = local.filter((h) => h.id !== holdId);
      const restaure: LignePanier[] = [];
      let ajuste = false;
      for (const ligne of hold.panier) {
        const p = produits.find((x) => x.id === ligne.produitId);
        if (!p || p.actif === false) {
          ajuste = true;
          continue;
        }
        const stockConnu = typeof p.stock === 'number';
        const dispo = stockConnu
          ? (stockDisponibleLocal(p, 0, autres) ?? 0)
          : ligne.quantite;
        const quantite = Math.min(ligne.quantite, Math.max(0, dispo));
        if (quantite <= 0) {
          ajuste = true;
          continue;
        }
        if (quantite < ligne.quantite) ajuste = true;
        restaure.push({
          produitId: ligne.produitId,
          designation: ligne.designation,
          prixUnitaire: ligne.prixUnitaire,
          quantite,
          remise: ligne.remise,
          imageUrl: p.imageUrl ?? null,
        });
      }
      if (restaure.length === 0) {
        setError(
          'Impossible de reprendre ce ticket : stock insuffisant ou produits inactifs.',
        );
        return;
      }
      if (ajuste) {
        setInfo(
          'Certains articles de ce ticket ne sont plus disponibles : le panier a été ajusté.',
        );
      }
      setPanier(restaure);
      setRemiseSaisie(hold.remisePanier.trim() || '0');
      if (hold.clientId) {
        try {
          const c = await apiFetch<ClientMini>(`/crm/clients/${hold.clientId}`);
          setClient(c);
        } catch {
          setClient(null);
        }
      } else {
        setClient(null);
      }
      setHolds(autres);
      saveHolds(session.id, autres);
      // La réservation stock du ticket n'est PAS libérée ici : elle reste
      // active jusqu'à la vente effective (consommée atomiquement via
      // `holdId` dans le corps de la vente, §6.4 réservation POS) ou jusqu'à
      // l'abandon explicite du panier repris (`viderPanier()`), afin d'éviter
      // toute fenêtre de double-vente du même stock entre caisses.
      setResumingHoldId(hold.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.resumeHoldId]);

  function mettreEnAttente() {
    if (!session || panier.length === 0) return;
    const numero = prochainNumero(holds);
    const libelle = client
      ? libelleClient(client)
      : `N° ${formatNumeroAttente(numero)}`;
    const motif: MotifAttente = client ? 'FIDELITE' : 'OUBLI_PAIEMENT';
    const holdPanier: LignePanierHold[] = panier.map((l) => {
      const p = produits.find((x) => x.id === l.produitId);
      return {
        produitId: l.produitId,
        designation: l.designation,
        reference: p?.reference ?? null,
        prixUnitaire: l.prixUnitaire,
        stock: typeof p?.stock === 'number' ? (p.stock as number) : l.quantite,
        quantite: l.quantite,
        remise: l.remise,
      };
    });
    const hold: CommandeEnAttente = {
      id: newClientOperationId(),
      numero,
      libelle,
      motif,
      clientId: client?.id ?? null,
      panier: holdPanier,
      remisePanier: remiseSaisie,
      createdAt: new Date().toISOString(),
    };
    const next = [...holds, hold];
    setHolds(next);
    saveHolds(session.id, next);
    const body = payloadReservation(hold);
    // Si le panier courant provient de la reprise d'un autre ticket en
    // attente (`resumingHoldId`), l'identité du panier bascule sur ce
    // nouveau hold : la réservation de l'ancien doit être libérée ici, sinon
    // elle reste bloquée en base indéfiniment (fuite de stock réservé).
    const ancienHoldId = resumingHoldId;
    void (async () => {
      if (ancienHoldId) {
        try {
          await libererReservation(session.id, ancienHoldId);
        } catch (err) {
          if (estErreurHorsLigne(err)) {
            await enqueueLiberationOp(getOfflineStore(), session.id, ancienHoldId);
          }
        }
      }
      try {
        await upsertReservation(session.id, body);
      } catch (err) {
        if (estErreurHorsLigne(err)) {
          await enqueueReservationOp(getOfflineStore(), session.id, body);
          void tenterFlushMobile();
        }
      }
    })();
    setResumingHoldId(null);
    setPanier([]);
    setRemiseSaisie('0');
    setParts(partsInitiales(0));
    setClient(null);
    setError(null);
    setInfo(`Ticket N° ${formatNumeroAttente(numero)} mis en attente.`);
  }

  async function ouvrirCloture() {
    const sessionLocale = session?.id.startsWith('{{localSessionId:') ?? false;
    if (pendingOutbox > 0 && !sessionLocale) {
      setError(
        `File hors-ligne : ${pendingOutbox} opération(s). Synchronisez avant clôture.`,
      );
      void tenterFlushMobile();
      return;
    }
    if (temoins.length === 0) {
      const t = await apiFetch<Temoin[]>('/ventes/temoins-eligibles');
      setTemoins(t);
      if (t.length === 1) setClotureTemoinLogin(t[0].login);
    }
    setError(null);
    setClotureOn(true);
  }

  async function cloturer() {
    if (!session) return;
    // Une session déjà ouverte hors ligne (id = placeholder) porte ses
    // propres ops non synchronisées dans `pendingOutbox` — les clôturer dans
    // le même lot est le scénario nominal, pas un blocage (§6.7). Le
    // blocage reste entier pour une session réelle avec un reliquat étranger
    // (ex. ventes non synchronisées d'un épisode hors ligne antérieur).
    const sessionLocale = session.id.startsWith('{{localSessionId:');
    if (pendingOutbox > 0 && !sessionLocale) {
      setError('File hors-ligne non vide — clôture bloquée.');
      return;
    }
    const sessionId = session.id;
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<{
        transactionVersementId: string | null;
        transactionSortieCentraleId?: string | null;
      }>(`/ventes/sessions/${sessionId}/cloture`, {
        method: 'POST',
        body: JSON.stringify({
          fondCompteCloture: Number(fondCompteCloture) || 0,
          temoinLogin: clotureTemoinLogin,
          temoinPassword: clotureTemoinPassword,
        }),
      });
      setSession(null);
      setSessionEnAttenteSync(false);
      setPanier([]);
      setRemiseSaisie('0');
      setClient(null);
      setClotureOn(false);
      setForceOuverture(false);
      setLastClosed({
        id: sessionId,
        caisseId: session.caisseId,
        statut: 'FERMEE',
        fondInitial: session.fondInitial ?? '0',
        fondCompteCloture: String(Number(fondCompteCloture) || 0),
        transactionVersementId: result.transactionVersementId,
        transactionSortieCentraleId: result.transactionSortieCentraleId ?? null,
      });
      setClotureResultat({
        sessionId,
        transactionId: result.transactionVersementId,
        sortieCentraleId: result.transactionSortieCentraleId ?? null,
        fondCompte: Number(fondCompteCloture) || 0,
        fondInitial: Number(session.fondInitial ?? 0) || 0,
      });
      setFondCompteCloture('0');
      setClotureTemoinLogin('');
      setClotureTemoinPassword('');
      const t = await apiFetch<Temoin[]>('/ventes/temoins-eligibles');
      setTemoins(t);
      if (t.length === 1) setTemoinLogin(t[0].login);
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        const local = await verifierIdentifiantsLocal(
          clotureTemoinLogin,
          clotureTemoinPassword,
        );
        if (!local.ok) {
          setError(messageTemoinHorsLigne(local));
          setPending(false);
          return;
        }
        const op = await enqueueCloturerSessionOp(getOfflineStore(), sessionId, {
          fondCompteCloture: Number(fondCompteCloture) || 0,
          temoinLogin: clotureTemoinLogin,
        });
        await stasherSecretOp(op.id, { temoinPassword: clotureTemoinPassword });
        setSession(null);
        setSessionEnAttenteSync(false);
        setPanier([]);
        setRemiseSaisie('0');
        setClient(null);
        setClotureOn(false);
        setForceOuverture(false);
        setLastClosed({
          id: sessionId,
          caisseId: session.caisseId,
          statut: 'FERMEE',
          fondInitial: session.fondInitial ?? '0',
          fondCompteCloture: String(Number(fondCompteCloture) || 0),
          transactionVersementId: null,
          transactionSortieCentraleId: null,
        });
        setClotureResultat({
          sessionId,
          transactionId: null,
          sortieCentraleId: null,
          fondCompte: Number(fondCompteCloture) || 0,
          fondInitial: Number(session.fondInitial ?? 0) || 0,
        });
        setFondCompteCloture('0');
        setClotureTemoinLogin('');
        setClotureTemoinPassword('');
        setInfo('Clôture enregistrée hors ligne — en attente de synchronisation.');
        void tenterFlushMobile();
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Clôture refusée (fond ou confirmateur).',
        );
      }
    } finally {
      setPending(false);
    }
  }

  function allerPaiement() {
    if (panier.length === 0 || bloqueParDerogation) return;
    setError(null);
    setInfo(null);
    const partsInit = partsInitiales(total);
    setParts(partsInit);
    setRecu('');
    setEtape('paiement');
  }

  function retourCommande() {
    setEtape('commande');
    setError(null);
  }

  function ticketDepuisPanier(
    venteId: string,
    paiements: Array<{ modePaiement: ModePaiement; montant: number }>,
    offline: boolean,
  ): TicketVenteData {
    return {
      id: venteId,
      dateVente: new Date().toISOString(),
      montantTotal: total,
      modePaiement: modePrincipal(paiements),
      lignes: panierAvecRemise.map((l) => ({
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        remise: l.remise,
        produit: { designation: l.designation },
      })),
      paiements: paiements.map((p) => ({
        modePaiement: p.modePaiement,
        montant: p.montant,
      })),
      offline,
      ...(aEspeces && especeOk
        ? { montantRecu: recuNum, monnaie: Math.max(0, monnaie) }
        : {}),
    };
  }

  function nouvelleCommande() {
    setTicket(null);
    setPanier([]);
    setRemiseSaisie('0');
    setParts(partsInitiales(0));
    setClient(null);
    setRecu('');
    setEtape('commande');
    setError(null);
    setInfo(null);
  }

  async function encaisser() {
    if (!session || !peutValiderPaiement) return;
    setPending(true);
    setError(null);
    setInfo(null);
    const lignes = panierAvecRemise.map((l) => ({
      produitId: l.produitId,
      quantite: l.quantite,
      ...(l.remise > 0 ? { remise: l.remise } : {}),
    }));
    const paiements = paiementsDepuisParts(parts);
    const clientOperationId = newClientOperationId();
    const body = {
      lignes,
      modePaiement: modePrincipal(paiements),
      paiements,
      clientOperationId,
      ...(client ? { clientId: client.id } : {}),
      ...(resumingHoldId ? { holdId: resumingHoldId } : {}),
      ...(derogationValide && derogation
        ? {
            derogation: {
              motifs: derogation.motifs,
              login: derogation.login,
              password: derogation.password,
            },
          }
        : {}),
    };
    try {
      const vente = await apiFetch<{
        id: string;
        dateVente: string;
        montantTotal: string;
        modePaiement: string;
        lignes: Array<{
          id: string;
          quantite: number;
          prixUnitaire: string;
          remise: string;
          produit: { designation: string };
        }>;
        paiements?: Array<{ modePaiement: string; montant: string }>;
      }>(`/ventes/sessions/${session.id}/ventes`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setTicket({
        id: vente.id,
        dateVente: vente.dateVente,
        montantTotal: vente.montantTotal,
        modePaiement: vente.modePaiement,
        lignes: vente.lignes,
        paiements: vente.paiements,
        ...(aEspeces && especeOk
          ? { montantRecu: recuNum, monnaie: Math.max(0, monnaie) }
          : {}),
      });
      setEtape('ticket');
      setPanier([]);
      setRemiseSaisie('0');
      setParts(partsInitiales(0));
      setResumingHoldId(null);
      void chargerCatalogue(session.id);
    } catch (err) {
      if (estErreurHorsLigne(err)) {
        const bodyPersistable =
          derogationValide && derogation
            ? {
                ...body,
                derogation: {
                  motifs: derogation.motifs,
                  login: derogation.login,
                },
              }
            : body;
        const op = await enqueueVenteOp(
          getOfflineStore(),
          session.id,
          bodyPersistable,
        );
        if (derogationValide && derogation) {
          await stasherSecretOp(op.id, {
            'derogation.password': derogation.password,
          });
        }
        await rafraichirOperationsOutbox();
        setTicket(ticketDepuisPanier(clientOperationId, paiements, true));
        setEtape('ticket');
        setPanier([]);
        setRemiseSaisie('0');
        setParts(partsInitiales(0));
        setResumingHoldId(null);
        void tenterFlushMobile();
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Encaissement refusé.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  const hubFerme =
    clotureResultat ??
    (!session && lastClosed && !forceOuverture
      ? {
          sessionId: lastClosed.id,
          transactionId: lastClosed.transactionVersementId ?? null,
          sortieCentraleId: lastClosed.transactionSortieCentraleId ?? null,
          fondCompte: Number(lastClosed.fondCompteCloture ?? 0),
          fondInitial: Number(lastClosed.fondInitial ?? 0),
        }
      : null);
  const peutInitierVersement = user
    ? peutNouveauVersement(user.role)
    : false;

  if (loading) {
    return (
      <View style={ui.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (hubFerme) {
    const pointJour = Math.max(0, hubFerme.fondCompte - hubFerme.fondInitial);
    const txCircuit = hubFerme.sortieCentraleId ?? hubFerme.transactionId;
    return (
      <View style={ui.wrap}>
        <Text style={ui.brand}>Journée clôturée · ventes fermées</Text>
        <Text style={ui.title}>Transfert trésorerie principale</Text>
        <Text style={ui.subtitle}>
          Point du jour = espèces comptées − fond d’ouverture. La boutique
          initie ; le DAF réceptionne (§6.4).
        </Text>
        <Text style={ui.kpi}>{formatFcfa(pointJour)}</Text>
        <Text style={ui.subtitle}>
          Fond compté {formatFcfa(hubFerme.fondCompte)} · ouverture{' '}
          {formatFcfa(hubFerme.fondInitial)}
        </Text>
        <Pressable
          style={ui.btn}
          onPress={() => {
            navigation.navigate('EtatSession', { sessionId: hubFerme.sessionId });
          }}
        >
          <Text style={ui.btnText}>Tirer l’état de clôture</Text>
        </Pressable>
        {txCircuit ? (
          <Pressable
            style={ui.btn}
            onPress={() => {
              root.navigate('Main', {
                screen: 'Circuit',
                params: {
                  screen: 'CircuitDetail',
                  params: { transactionId: txCircuit },
                },
              });
            }}
          >
            <Text style={ui.btnText}>
              {hubFerme.sortieCentraleId
                ? 'Suivre le versement vers la centrale'
                : 'Transfert tiroir → magasin'}
            </Text>
          </Pressable>
        ) : null}
        {peutInitierVersement && !hubFerme.sortieCentraleId && pointJour > 0 ? (
          <Pressable
            style={ui.btn}
            onPress={() => {
              root.navigate('Main', {
                screen: 'Circuit',
                params: { screen: 'NouveauVersement' },
              });
            }}
          >
            <Text style={ui.btnText}>Transférer vers la trésorerie principale</Text>
          </Pressable>
        ) : null}
        {hubFerme.transactionId && hubFerme.sortieCentraleId ? (
          <Pressable
            style={ui.btnGhost}
            onPress={() => {
              const id = hubFerme.transactionId;
              if (id) {
                root.navigate('Main', {
                  screen: 'Circuit',
                  params: {
                    screen: 'CircuitDetail',
                    params: { transactionId: id },
                  },
                });
              }
            }}
          >
            <Text style={ui.btnGhostText}>Transfert tiroir → magasin</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={ui.btnGhost}
          onPress={() => {
            root.navigate('Main', {
              screen: 'Circuit',
              params: { screen: 'CircuitList' },
            });
          }}
        >
          <Text style={ui.btnGhostText}>Circuit des versements</Text>
        </Pressable>
        <Pressable
          style={ui.btnGhost}
          onPress={() => {
            setClotureResultat(null);
            setForceOuverture(true);
          }}
        >
          <Text style={ui.btnGhostText}>Ouvrir une nouvelle journée</Text>
        </Pressable>
      </View>
    );
  }

  if (!caisse) {
    return (
      <View style={ui.center}>
        <Text>Aucun tiroir boutique pour ce compte.</Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={ui.link}>Déconnexion</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={ui.wrap}>
        <View style={ui.row}>
          <View style={{ flex: 1 }}>
            <Text style={ui.brand}>POS</Text>
            <Text style={ui.title}>Ouvrir le poste</Text>
          </View>
          <IconAction
            name="log-out-outline"
            label="Quitter"
            onPress={() => void signOut()}
          />
        </View>
        <View style={[ui.card, { gap: 12 }]}>
          {tiroirs.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tiroirs.map((t) => (
                <Chip
                  key={t.id}
                  label={t.libelle ?? t.id.slice(0, 8)}
                  active={caisse.id === t.id}
                  onPress={() => {
                    setLoading(true);
                    void charger(t.id);
                  }}
                />
              ))}
            </View>
          ) : (
            <Text style={{ fontWeight: '700' }}>{caisse.libelle ?? caisse.id}</Text>
          )}
          <TextInput
            style={ui.input}
            keyboardType="numeric"
            value={fond}
            onChangeText={setFond}
            placeholder="Fond compté"
            placeholderTextColor={colors.muted}
          />
          <ComptageDenominations onTotalChange={(total) => setFond(String(total))} />
          <Text style={styles.section}>Confirmateur</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {temoins.map((t) => (
              <Chip
                key={t.id}
                label={`${t.prenom} ${t.nom}`}
                active={temoinLogin === t.login}
                onPress={() => setTemoinLogin(t.login)}
              />
            ))}
          </View>
          <TextInput
            style={ui.input}
            secureTextEntry
            placeholder="Mot de passe confirmateur"
            placeholderTextColor={colors.muted}
            value={temoinPassword}
            onChangeText={setTemoinPassword}
          />
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <Pressable style={ui.btn} onPress={() => void ouvrir()} disabled={pending}>
            <Text style={ui.btnText}>Démarrer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (clotureOn) {
    return (
      <View style={ui.wrap}>
        <Text style={ui.brand}>POS</Text>
        <Text style={ui.title}>Clôturer le poste</Text>
        <Text style={ui.muted}>{caisse.libelle ?? caisse.id}</Text>
        <View style={[ui.card, { gap: 12 }]}>
          <TextInput
            style={ui.input}
            keyboardType="numeric"
            value={fondCompteCloture}
            onChangeText={setFondCompteCloture}
            placeholder="Fond compté à la fermeture"
            placeholderTextColor={colors.muted}
          />
          <ComptageDenominations
            onTotalChange={(total) => setFondCompteCloture(String(total))}
          />
          <Text style={styles.section}>Confirmateur</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {temoins.map((t) => (
              <Chip
                key={t.id}
                label={`${t.prenom} ${t.nom}`}
                active={clotureTemoinLogin === t.login}
                onPress={() => setClotureTemoinLogin(t.login)}
              />
            ))}
          </View>
          <TextInput
            style={ui.input}
            secureTextEntry
            placeholder="Mot de passe confirmateur"
            placeholderTextColor={colors.muted}
            value={clotureTemoinPassword}
            onChangeText={setClotureTemoinPassword}
          />
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <Pressable style={ui.btn} onPress={() => void cloturer()} disabled={pending}>
            <Text style={ui.btnText}>Confirmer la clôture</Text>
          </Pressable>
          <Pressable
            style={ui.btnGhost}
            onPress={() => setClotureOn(false)}
            disabled={pending}
          >
            <Text style={ui.btnGhostText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (etape === 'ticket' && ticket) {
    return (
      <PosTicketRecu
        ticket={ticket}
        boutiqueNom={boutiqueNom}
        caissier={user?.login ?? null}
        clientLabel={client ? libelleClient(client) : null}
        onNouvelleCommande={nouvelleCommande}
      />
    );
  }

  if (etape === 'paiement') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={retourCommande} hitSlop={8}>
          <Text style={ui.link}>← Retour commande</Text>
        </Pressable>
        <Text style={ui.brand}>POS</Text>
        <Text style={ui.title}>Paiement</Text>
        <Text style={ui.kpi}>{formatFcfa(total)}</Text>
        <Text
          style={[
            ui.muted,
            { fontWeight: '700', color: payOk ? colors.ok : colors.warning },
          ]}
        >
          {payOk
            ? 'Répartition complète'
            : `Reste à répartir : ${formatFcfa(restePay)}`}
        </Text>
        {surAllocation ? (
          <Text style={ui.error}>
            La somme des parts dépasse le ticket. Ces montants répartissent le
            ticket entre les modes — le billet client se saisit plus bas.
          </Text>
        ) : null}

        <Text style={styles.section}>Modes</Text>
        <Text style={ui.muted}>
          Touchez un ou plusieurs modes (ex. Espèces + Carte).
        </Text>
        <View style={styles.modes}>
          {MODES_POS.map((m) => {
            const actif = parts.some((p) => p.mode === m.mode);
            return (
              <Chip
                key={m.mode}
                label={m.label}
                active={actif}
                onPress={() =>
                  setParts((prev) => toggleModePaiement(prev, m.mode, total))
                }
              />
            );
          })}
        </View>
        {parts.length > 1 ? (
          <View style={styles.mixteSection}>
            <Text style={styles.mixteTitle}>Répartition du ticket</Text>
            <Text style={ui.muted}>
              Chaque part = portion du total ({formatFcfa(total)}). Somme des
              parts = total.
            </Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {parts.map((p) => (
                <View key={p.mode} style={ui.row}>
                  <Text style={{ flex: 1, fontWeight: '700' }}>
                    Part{' '}
                    {MODES_POS.find((m) => m.mode === p.mode)?.label ?? p.mode}
                  </Text>
                  <TextInput
                    style={[ui.input, styles.remiseInput]}
                    keyboardType="numeric"
                    value={p.montant}
                    onChangeText={(v) =>
                      setParts((prev) =>
                        prev.map((x) =>
                          x.mode === p.mode ? { ...x, montant: v } : x,
                        ),
                      )
                    }
                    placeholder="Part F"
                    placeholderTextColor={colors.muted}
                  />
                  <Chip
                    label="Reste"
                    active={false}
                    onPress={() =>
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
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {aEspeces ? (
          <View style={[ui.card, styles.cashSection]}>
            <Text style={styles.section}>Billet remis par le client</Text>
            <Text style={ui.muted}>
              Montant remis en espèces (part ticket : {formatFcfa(cashPart)}).
              Indépendant de la répartition mixte.
            </Text>
            <View style={ui.row}>
              <View style={{ flex: 1 }}>
                <Text style={ui.muted}>Reçu du client</Text>
                <Text style={ui.kpi}>{recu === '' ? '—' : formatFcfa(recuNum)}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={ui.muted}>Monnaie à rendre</Text>
                <Text
                  style={[
                    ui.kpi,
                    { color: monnaie < 0 ? colors.danger : colors.ok },
                  ]}
                >
                  {monnaie < 0 ? '—' : formatFcfa(monnaie)}
                </Text>
              </View>
            </View>
            <TextInput
              style={ui.input}
              keyboardType="numeric"
              value={recu}
              onChangeText={setRecu}
              placeholder="Montant reçu"
              placeholderTextColor={colors.muted}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip
                label="Exact"
                active={recuNum === Math.round(cashPart)}
                onPress={() => setRecu(recuEspecesParDefaut(cashPart))}
              />
              {RAPIDE_ESPECES.map((n) => (
                <Chip
                  key={n}
                  label={`+${formatFcfa(n)}`}
                  active={false}
                  onPress={() => setRecu(String(recuNum + n))}
                />
              ))}
            </View>
            <NumpadEspeces recu={recu} onChange={setRecu} />
            {!especeOk ? (
              <Text style={ui.error}>
                Montant reçu insuffisant pour la part espèces.
              </Text>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={ui.error}>{error}</Text> : null}

        <Pressable
          style={[ui.btn, !peutValiderPaiement && ui.btnOff]}
          disabled={!peutValiderPaiement}
          onPress={() => void encaisser()}
        >
          <Text style={ui.btnText}>
            {pending
              ? 'Encaissement…'
              : `Valider · ${formatFcfa(total)}${
                  aEspeces && monnaie >= 0
                    ? ` · monnaie ${formatFcfa(monnaie)}`
                    : ''
                }`}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Grille 2 colonnes (ScrollView = fiable sur web ; FlatList nested cassait la hauteur).
  const lignesCatalogue: Produit[][] = [];
  for (let i = 0; i < produitsFiltres.length; i += 2) {
    lignesCatalogue.push(produitsFiltres.slice(i, i + 2));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <SessionBanner caisseLibelle={caisse.libelle ?? 'Poste caisse'} />
      <View style={ui.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ui.brand}>POS</Text>
          <Text style={ui.title}>Encaissement</Text>
          <Text style={ui.muted} numberOfLines={1}>
            {produits.length} articles en catalogue
          </Text>
        </View>
        <View style={ui.headerActions}>
          <IconAction
            name="document-text-outline"
            label="État des ventes"
            onPress={() =>
              navigation.navigate('EtatSession', { sessionId: session.id })
            }
          />
          <IconAction
            name="time-outline"
            label={`Tickets en attente (${holds.length})`}
            badge={holds.length}
            onPress={() =>
              navigation.navigate('TicketsAttente', { sessionId: session.id })
            }
          />
          <IconAction
            name="cloud-upload-outline"
            label="Synchroniser"
            onPress={() => {
              void tenterFlushMobile().then((r) => {
                if (r && r.flushed > 0) setInfo(`Sync : ${r.flushed} op.`);
              });
              void chargerCatalogue(session.id);
            }}
          />
          <IconAction
            name="barcode-outline"
            label="Scanner"
            onPress={() => root.navigate('Scanner')}
          />
          <IconAction
            name="lock-closed-outline"
            label="Clôturer"
            onPress={() => void ouvrirCloture()}
          />
        </View>
      </View>

      {sessionEnAttenteSync ? (
        <Banner tone="warning">
          Session ouverte hors ligne — en attente de synchronisation
        </Banner>
      ) : null}
      {pendingOutbox > 0 ? (
        <Pressable onPress={() => root.navigate('FileAttente')}>
          <Banner tone="warning">
            File hors-ligne : {pendingOutbox} — sync auto à la reconnexion
          </Banner>
        </Pressable>
      ) : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <Text style={styles.section}>Ajouter au ticket</Text>
      <TextInput
        style={ui.input}
        placeholder="Rechercher (min. 2 lettres) ou scanner… (ex. 3xREF)"
        placeholderTextColor={colors.muted}
        value={rechercheProduit}
        onChangeText={setRechercheProduit}
        onSubmitEditing={onSoumissionRecherche}
        returnKeyType="done"
      />

      {rechercheProduit.trim().length < 2 ? (
        <View style={styles.emptyCatalog}>
          <Text style={styles.emptyTitle}>Recherche ou scan</Text>
          <Text style={[ui.muted, { textAlign: 'center' }]}>
            Le catalogue n’affiche rien tant que vous n’avez pas cherché ou
            scanné — seuls les articles touchés vont sur le ticket.
          </Text>
          <Pressable
            style={ui.btnGhost}
            onPress={() => root.navigate('Scanner')}
          >
            <Text style={ui.btnGhostText}>Ouvrir le scanner</Text>
          </Pressable>
        </View>
      ) : lignesCatalogue.length === 0 ? (
        <Text style={ui.muted}>
          Aucun article pour « {rechercheProduit.trim()} ».
        </Text>
      ) : (
        lignesCatalogue.map((ligne, idx) => (
          <View key={`row-${idx}`} style={styles.gridRow}>
            {ligne.map((item) => {
              const inPanier = panier.find((l) => l.produitId === item.id);
              const stockConnu = typeof item.stock === 'number';
              const dispo = stockConnu
                ? stockDisponibleLocal(item, inPanier?.quantite ?? 0)
                : null;
              const rupture = stockConnu && (dispo as number) <= 0;
              const tuileBloquee = rupture && !stockOverrideActif;
              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.gridTile,
                    inPanier ? styles.gridTileOn : null,
                    tuileBloquee ? styles.gridTileOff : null,
                  ]}
                  disabled={tuileBloquee}
                  onPress={() => ajouter(item)}
                >
                  <ProduitThumb
                    imageUrl={item.imageUrl}
                    label={item.designation}
                    size={110}
                    round={0.14}
                  />
                  <Text style={styles.gridName} numberOfLines={2}>
                    {item.designation}
                  </Text>
                  {item.reference ? (
                    <Text style={styles.gridRef} numberOfLines={1}>
                      {item.reference}
                    </Text>
                  ) : null}
                  <View style={[ui.row, { alignSelf: 'stretch' }]}>
                    <Money value={formatFcfa(item.prixUnitaire)} size="sm" />
                    {inPanier ? (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>
                          ×{inPanier.quantite}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {stockConnu ? (
                    <StatusPill
                      label={rupture ? 'Rupture' : `Stock ${dispo}`}
                      tone={rupture ? 'danger' : 'neutral'}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {ligne.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))
      )}

      <View style={styles.ticket}>
        <Text style={styles.section}>Client</Text>
        <ClientEntityFinder value={client} onChange={setClient} />

        <Text style={styles.section}>
          Ticket ({panierAvecRemise.length})
        </Text>
        {panierAvecRemise.length > 0 ? (
          <View style={styles.panierBox}>
            {panierAvecRemise.map((l) => (
              <View key={l.produitId} style={styles.panierLine}>
                <ProduitThumb
                  imageUrl={l.imageUrl}
                  label={l.designation}
                  size={44}
                />
                <Text style={{ flex: 1, fontWeight: '600' }}>
                  {l.quantite} × {l.designation}
                  {l.remise > 0 ? (
                    <Text style={ui.muted}> (−{formatFcfa(l.remise)})</Text>
                  ) : null}
                </Text>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => retirer(l.produitId)}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyTxt}>−</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      // Recherche dans le catalogue (pour le `stock` — pas
                      // disponible sur la ligne panier) plutôt que de
                      // reconstruire un objet partiel qui contournerait le
                      // plafond de stock.
                      const full = produits.find((x) => x.id === l.produitId);
                      ajouter(
                        full ?? {
                          id: l.produitId,
                          designation: l.designation,
                          prixUnitaire: l.prixUnitaire,
                          imageUrl: l.imageUrl,
                        },
                      );
                    }}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyTxt}>+</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => retirer(l.produitId, true)}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyTxt}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={ui.muted}>
            Vide — touchez une photo ci-dessus pour sélectionner.
          </Text>
        )}

        <Text style={styles.section}>Remise panier</Text>
        <Text style={ui.muted}>Saisie en pourcentage (plafond {plafondPct} %).</Text>
        <View style={ui.row}>
          <View style={styles.remiseField}>
            <TextInput
              style={[ui.input, styles.remiseInput]}
              keyboardType="decimal-pad"
              value={remiseSaisie}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9.,]/g, '').replace(',', '.');
                setRemiseSaisie(cleaned);
              }}
              placeholder="0"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Remise en pourcentage"
            />
            <Text style={styles.remiseSuffix}>%</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[0, 5, 10, 15, 20].map((p) => (
            <Chip
              key={p}
              label={p === 0 ? '0 %' : `${p} %`}
              active={remisePct === p}
              onPress={() => setRemiseSaisie(String(p))}
            />
          ))}
        </View>
        {remisePct > 0 && !remiseDepasse ? (
          <Text style={ui.muted}>
            {remisePct} % = −{formatFcfa(remiseMontant)} · sous-total{' '}
            {formatFcfa(totalAvantFidelite)}
          </Text>
        ) : null}
        {remiseFidelite > 0 ? (
          <Text style={ui.muted}>
            Avantage fidélité {pctFidelite} % = −{formatFcfa(remiseFidelite)} ·
            net à payer {formatFcfa(total)}
          </Text>
        ) : null}

        {remiseDepasse ? (
          <Text style={ui.error}>
            Remise au-delà de {plafondPct} % (plafond serveur) — dérogation
            requise ci-dessous.
          </Text>
        ) : null}

        {depasseStockPanier ? (
          <Text style={ui.error}>
            Quantité au panier supérieure au stock disponible (catalogue
            resynchronisé) — dérogation requise ci-dessous.
          </Text>
        ) : null}

        {motifsRequis.length > 0 && derogation ? (
          <DerogationPanel
            derogation={derogation}
            chefs={chefs}
            onChange={setDerogation}
          />
        ) : null}

        <Pressable
          style={[ui.btnGhost, panier.length === 0 && ui.btnOff]}
          disabled={panier.length === 0}
          onPress={mettreEnAttente}
        >
          <Text style={ui.btnGhostText}>Mettre en attente</Text>
        </Pressable>

        {panier.length > 0 ? (
          <Pressable
            style={styles.clearBtn}
            onPress={viderPanier}
            accessibilityLabel="Vider le panier"
          >
            <Text style={styles.clearBtnText}>Vider le panier</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            ui.btn,
            (panier.length === 0 || bloqueParDerogation) && ui.btnOff,
          ]}
          disabled={panier.length === 0 || bloqueParDerogation}
          onPress={allerPaiement}
        >
          <Text style={ui.btnText}>
            {derogationValide
              ? `Paiement avec dérogation · ${formatFcfa(total)}`
              : `Paiement · ${formatFcfa(total)}`}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 110,
    gap: 12,
  },
  clearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
  },
  clearBtnText: { color: colors.danger, fontWeight: '700' },
  emptyCatalog: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
  },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: 12,
    gap: 6,
    alignItems: 'center',
  },
  gridTileOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  gridTileOff: {
    opacity: 0.45,
  },
  gridName: {
    fontWeight: '800',
    color: colors.text,
    fontSize: 13,
    minHeight: 34,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  gridRef: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    textAlign: 'center',
  },
  qtyBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  qtyBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  ticket: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  panierBox: { gap: 8 },
  panierLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qtyRow: { flexDirection: 'row', gap: 4 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  qtyTxt: { fontWeight: '800', color: colors.text, fontSize: 16 },
  section: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remiseInput: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 36,
  },
  remiseField: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  remiseSuffix: {
    position: 'absolute',
    right: 14,
    fontWeight: '800',
    fontSize: 16,
    color: colors.accentText,
  },
  mixteSection: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: 12,
    gap: 4,
  },
  mixteTitle: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.text,
  },
  cashSection: {
    gap: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
});
