import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatFcfa, shopFetch } from '../lib/api';
import { useCart } from '../lib/cart';
import { readShopSession } from '../lib/shopAuth';
import {
  DeliveryAddressMap,
  type DeliveryGeo,
} from '../components/DeliveryAddressMap';
import { isValidPhoneE164, PhoneInput } from '../components/PhoneInput';

type Mode = 'RETRAIT_BOUTIQUE' | 'LIVRAISON';
type Reglement = 'PREPAYE_PSP' | 'PAIEMENT_RETRAIT' | 'PAIEMENT_LIVRAISON';

type CompteProfil = {
  email: string;
  prenom?: string;
  nom?: string;
  displayName?: string;
  telephone?: string | null;
};

type AdresseCompte = {
  id: string;
  libelle: string;
  ligne1: string;
  ligne2?: string | null;
  ville: string;
  telephone?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string;
};

type BoutiqueRetrait = {
  id: string;
  nom: string;
  adresse?: string;
};

const BOUTIQUE_NOISE =
  /^(?:E2E\b)|(?:testcontainers?)|(?:cosm[ée]tiques?\b)|(?:accessoires?\s*gsm)|(?:caf[ée]-?market)|(?:\d{10,})/i;

function boutiqueScore(nom: string): number {
  if (/pi[eè]ces?\s*auto|major\s*auto|auto\s*parts/i.test(nom)) return 0;
  if (/d[eé]mo\s*pos|showroom/i.test(nom)) return 1;
  return 2;
}

function CheckoutBrand() {
  return (
    <Link to="/" className="checkout-brand" aria-label="MAJOR AUTO PARTS">
      <span className="brand-major">MAJOR</span>
      <span className="brand-auto">AUTO PARTS</span>
    </Link>
  );
}

function OrderSummary({
  panier,
  mode,
  fraisLivraison,
  total,
}: {
  panier: NonNullable<ReturnType<typeof useCart>['panier']>;
  mode: Mode;
  fraisLivraison: number;
  total: number;
}) {
  return (
    <div className="checkout-summary-inner">
      <ul className="checkout-lines">
        {panier.lignes.map((l) => (
          <li key={l.produitId}>
            <div className="checkout-line-media" aria-hidden>
              {(l.designation?.[0] ?? 'M').toUpperCase()}
              <span className="checkout-qty">{l.quantite}</span>
            </div>
            <div className="checkout-line-info">
              <strong>{l.designation}</strong>
            </div>
            <div className="checkout-line-price">
              {formatFcfa(l.prixUnitaireTtc * l.quantite)}
            </div>
          </li>
        ))}
      </ul>
      <dl className="checkout-totals">
        <div>
          <dt>Articles HT</dt>
          <dd>{formatFcfa(panier.montantArticlesHt)}</dd>
        </div>
        {panier.montantTva > 0 ? (
          <div>
            <dt>TVA</dt>
            <dd>{formatFcfa(panier.montantTva)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Livraison</dt>
          <dd>{mode === 'RETRAIT_BOUTIQUE' ? 'Gratuit' : formatFcfa(fraisLivraison)}</dd>
        </div>
        <div className="checkout-total">
          <dt>Total</dt>
          <dd>{formatFcfa(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

const PENDING_PAY_KEY = 'shop_pending_pay';

function readPendingPay(): { id: string; token: string | null } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PAY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; token?: string | null };
    if (!parsed.id) return null;
    return { id: parsed.id, token: parsed.token ?? null };
  } catch {
    return null;
  }
}

function writePendingPay(id: string, token: string | null) {
  try {
    sessionStorage.setItem(PENDING_PAY_KEY, JSON.stringify({ id, token }));
  } catch {
    /* private mode */
  }
}

function clearPendingPay() {
  try {
    sessionStorage.removeItem(PENDING_PAY_KEY);
  } catch {
    /* ignore */
  }
}

export default function CheckoutPage() {
  const nav = useNavigate();
  const { panier, isLoading: cartLoading, ensurePanier, viderApresCommande } =
    useCart();
  const session = readShopSession();
  const isLoggedIn = Boolean(session.token);

  const [email, setEmail] = useState(() => session.email ?? '');
  const [telephone, setTelephone] = useState('');
  const [editContact, setEditContact] = useState(false);
  const [editAdresse, setEditAdresse] = useState(false);
  const [selectedAdresseId, setSelectedAdresseId] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('RETRAIT_BOUTIQUE');
  const [reglement, setReglement] = useState<Reglement>('PREPAYE_PSP');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [ligne1, setLigne1] = useState('');
  const [ville, setVille] = useState('Abidjan');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pendingCommandeId, setPendingCommandeId] = useState<string | null>(
    () => readPendingPay()?.id ?? null,
  );
  const [pendingSuiviToken, setPendingSuiviToken] = useState<string | null>(
    () => readPendingPay()?.token ?? null,
  );
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [profilHydrated, setProfilHydrated] = useState(false);
  const [adresseHydrated, setAdresseHydrated] = useState(false);

  function applyGeo(geo: DeliveryGeo) {
    setLat(geo.lat);
    setLng(geo.lng);
    if (geo.ligne1) setLigne1(geo.ligne1);
    if (geo.ville) setVille(geo.ville);
  }

  function applyAdresse(a: AdresseCompte) {
    setSelectedAdresseId(a.id);
    setLigne1(a.ligne1);
    setVille(a.ville || 'Abidjan');
    if (a.telephone) setTelephone(a.telephone);
    setLat(a.lat ?? null);
    setLng(a.lng ?? null);
  }

  useEffect(() => {
    void ensurePanier().catch(() => undefined);
  }, [ensurePanier]);

  const { data: profil } = useQuery({
    queryKey: ['compte-moi', session.token],
    queryFn: () => shopFetch<CompteProfil>('/shop/compte/moi'),
    enabled: isLoggedIn,
  });

  const { data: adresses } = useQuery({
    queryKey: ['compte-adresses', session.token],
    queryFn: () => shopFetch<AdresseCompte[]>('/shop/compte/adresses'),
    enabled: isLoggedIn,
  });

  useEffect(() => {
    if (!profil || profilHydrated) return;
    setEmail(profil.email);
    if (profil.telephone) setTelephone(profil.telephone);
    setProfilHydrated(true);
  }, [profil, profilHydrated]);

  useEffect(() => {
    if (!adresses?.length || adresseHydrated) return;
    applyAdresse(adresses[0]);
    setAdresseHydrated(true);
  }, [adresses, adresseHydrated]);

  const { data: zones } = useQuery({
    queryKey: ['zones'],
    queryFn: () =>
      shopFetch<Array<{ id: string; libelle: string; tarifForfait: string }>>(
        '/shop/livraison/zones',
      ),
  });
  const { data: boutiques } = useQuery({
    queryKey: ['boutiques-retrait'],
    queryFn: () => shopFetch<BoutiqueRetrait[]>('/shop/retrait/boutiques'),
  });
  const { data: modesReglement } = useQuery({
    queryKey: ['shop-reglements'],
    queryFn: () =>
      shopFetch<{
        paiementRetraitActif: boolean;
        paiementLivraisonActif: boolean;
        retraitActif: boolean;
        livraisonActive: boolean;
      }>('/shop/reglements'),
  });
  const paiementRetraitActif = modesReglement?.paiementRetraitActif !== false;
  const paiementLivraisonActif =
    modesReglement?.paiementLivraisonActif !== false;

  const boutiquesRetrait = useMemo(() => {
    const raw = boutiques ?? [];
    const eligible = raw.filter((b) => !BOUTIQUE_NOISE.test(b.nom.trim()));
    return (eligible.length ? eligible : raw).sort(
      (a, b) =>
        boutiqueScore(a.nom) - boutiqueScore(b.nom) ||
        a.nom.localeCompare(b.nom, 'fr'),
    );
  }, [boutiques]);

  const hasSavedAdresses = (adresses?.length ?? 0) > 0;
  const showSavedAdresse =
    isLoggedIn && mode === 'LIVRAISON' && hasSavedAdresses && !editAdresse;
  const showContactForm = !isLoggedIn || editContact || !profilHydrated;
  const contactName =
    profil?.displayName ??
    session.displayName ??
    ([profil?.prenom, profil?.nom].filter(Boolean).join(' ') || null);

  useEffect(() => {
    if (boutiqueId && boutiquesRetrait.some((b) => b.id === boutiqueId)) return;
    const prefer =
      boutiquesRetrait.find((b) => boutiqueScore(b.nom) === 0) ??
      boutiquesRetrait[0];
    if (prefer) setBoutiqueId(prefer.id);
  }, [boutiquesRetrait, boutiqueId]);

  useEffect(() => {
    if (!zoneId && zones?.[0]) setZoneId(zones[0].id);
  }, [zones, zoneId]);

  useEffect(() => {
    if (mode === 'LIVRAISON' && reglement === 'PAIEMENT_RETRAIT') {
      setReglement(
        paiementLivraisonActif ? 'PAIEMENT_LIVRAISON' : 'PREPAYE_PSP',
      );
    }
    if (mode === 'RETRAIT_BOUTIQUE' && reglement === 'PAIEMENT_LIVRAISON') {
      setReglement(paiementRetraitActif ? 'PAIEMENT_RETRAIT' : 'PREPAYE_PSP');
    }
  }, [mode, reglement, paiementLivraisonActif, paiementRetraitActif]);

  const selectedZone = zones?.find((z) => z.id === zoneId);
  const fraisLivraison =
    mode === 'LIVRAISON' && selectedZone ? Number(selectedZone.tarifForfait) : 0;
  const sousTotal = panier?.montantArticlesTtc ?? 0;
  const total = sousTotal + fraisLivraison;
  const empty = !cartLoading && (!panier || panier.lignes.length === 0);
  const produitIds = useMemo(
    () => panier?.lignes.map((l) => l.produitId) ?? [],
    [panier?.lignes],
  );

  const { data: dispoStock } = useQuery({
    queryKey: ['checkout-stock', mode, boutiqueId, zoneId, produitIds],
    queryFn: () =>
      shopFetch<{
        lignes: Array<{ produitId: string; disponible: number | null }>;
      }>('/shop/stock/disponibilite', {
        method: 'POST',
        body: JSON.stringify({
          modeFulfillment: mode,
          ...(mode === 'RETRAIT_BOUTIQUE' ? { boutiqueRetraitId: boutiqueId } : {}),
          produitIds,
        }),
      }),
    enabled:
      produitIds.length > 0 &&
      (mode === 'LIVRAISON' || Boolean(boutiqueId)),
  });

  const stockIssues = useMemo(() => {
    if (!panier?.lignes.length || !dispoStock?.lignes.length) return [];
    return panier.lignes.flatMap((l) => {
      const row = dispoStock.lignes.find((r) => r.produitId === l.produitId);
      if (row?.disponible == null) return [];
      if (row.disponible < l.quantite) {
        return [
          `Stock insuffisant pour « ${l.designation} » (disponible : ${row.disponible} à cette boutique).`,
        ];
      }
      return [];
    });
  }, [panier?.lignes, dispoStock?.lignes]);

  const checkout = useMutation({
    mutationFn: async () => {
      let commande: {
        id: string;
        suiviToken: string | null;
        statut: string;
        authorizationUrl?: string;
        sandbox?: boolean;
      };

      if (pendingCommandeId && reglement === 'PREPAYE_PSP') {
        commande = {
          id: pendingCommandeId,
          suiviToken: pendingSuiviToken,
          statut: 'EN_ATTENTE_PAIEMENT',
        };
      } else {
        commande = await shopFetch<{
          id: string;
          suiviToken: string | null;
          statut: string;
          authorizationUrl?: string;
          sandbox?: boolean;
        }>('/shop/checkout', {
          method: 'POST',
          body: JSON.stringify({
            clientOperationId: crypto.randomUUID(),
            modeFulfillment: mode,
            modeReglement: reglement,
            providerPsp: reglement === 'PREPAYE_PSP' ? 'PAYSTACK' : undefined,
            boutiqueRetraitId:
              mode === 'RETRAIT_BOUTIQUE' ? boutiqueId : undefined,
            zoneLivraisonId: mode === 'LIVRAISON' ? zoneId : undefined,
            adresseLivraison:
              mode === 'LIVRAISON'
                ? {
                    ville,
                    ligne1,
                    telephone,
                    lat: lat ?? undefined,
                    lng: lng ?? undefined,
                  }
                : undefined,
            emailInvite: email,
            telephoneInvite: telephone || undefined,
            noteClient: note || undefined,
          }),
        });
        setPendingCommandeId(commande.id);
        setPendingSuiviToken(commande.suiviToken);
        writePendingPay(commande.id, commande.suiviToken);
      }

      if (reglement === 'PREPAYE_PSP') {
        let authorizationUrl = commande.authorizationUrl;
        let sandbox = commande.sandbox === true;
        if (!authorizationUrl) {
          const pay = await shopFetch<{
            authorizationUrl?: string;
            sandbox?: boolean;
          }>(`/shop/commandes/${commande.id}/payer`, {
            method: 'POST',
            body: JSON.stringify({ provider: 'PAYSTACK' }),
          });
          authorizationUrl = pay.authorizationUrl;
          sandbox = pay.sandbox === true;
        }
        if (!authorizationUrl) {
          throw new Error(
            'Impossible d’ouvrir le paiement. Réessayez ou choisissez un autre moyen — aucun débit n’a été effectué.',
          );
        }
        return {
          ...commande,
          authorizationUrl,
          sandbox,
        };
      }
      setPendingCommandeId(null);
      setPendingSuiviToken(null);
      clearPendingPay();
      return commande;
    },
    onSuccess: (res) => {
      viderApresCommande();
      if ('authorizationUrl' in res && res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
        return;
      }
      setPendingCommandeId(null);
      setPendingSuiviToken(null);
      clearPendingPay();
      nav(
        `/checkout/confirmation?commandeId=${res.id}&token=${res.suiviToken ?? ''}`,
      );
    },
  });

  function validate(): string | null {
    if (!email.trim() || !email.includes('@')) return 'Indiquez un e-mail valide.';
    if (!telephone.trim()) return 'Indiquez votre numéro de téléphone.';
    if (!isValidPhoneE164(telephone)) {
      return 'Numéro incomplet — respectez le nombre de chiffres du pays choisi.';
    }
    if (mode === 'RETRAIT_BOUTIQUE' && !boutiqueId) {
      return 'Choisissez une boutique de retrait.';
    }
    if (mode === 'LIVRAISON') {
      if (!zoneId) return 'Choisissez une zone.';
      if (!ligne1.trim()) {
        return 'Indiquez votre adresse (recherche ou saisie).';
      }
    }
    if (!panier?.lignes.length) return 'Votre panier est vide.';
    if (stockIssues.length) return stockIssues[0] ?? null;
    return null;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    setFieldError(err);
    if (err) return;
    checkout.mutate();
  }

  if (cartLoading && !panier) {
    return (
      <div className="checkout-shell">
        <header className="checkout-top">
          <CheckoutBrand />
        </header>
        <div className="checkout-loading">Préparation…</div>
      </div>
    );
  }

  if (empty || !panier) {
    return (
      <div className="checkout-shell">
        <header className="checkout-top">
          <CheckoutBrand />
        </header>
        <div className="checkout-empty">
          <h1>Panier vide</h1>
          <p>Ajoutez des pièces avant de commander.</p>
          <Link className="btn" to="/catalogue">
            Voir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  const summaryProps = { panier, mode, fraisLivraison, total };
  const selectedBoutique = boutiquesRetrait.find((b) => b.id === boutiqueId);

  return (
    <div className="checkout-shell">
      <header className="checkout-top">
        <CheckoutBrand />
        <p className="checkout-secure">Paiement sécurisé</p>
      </header>

      <button
        type="button"
        className={`checkout-summary-toggle ${summaryOpen ? 'is-open' : ''}`}
        onClick={() => setSummaryOpen((v) => !v)}
        aria-expanded={summaryOpen}
      >
        <span>{summaryOpen ? 'Masquer' : 'Récapitulatif'}</span>
        <strong>{formatFcfa(total)}</strong>
      </button>
      <div className={`checkout-summary-mobile ${summaryOpen ? 'is-open' : ''}`}>
        <OrderSummary {...summaryProps} />
      </div>

      <div className="checkout-layout">
        <div className="checkout-main-col">
          <p className="checkout-steps-simple">
            <Link to="/panier">Panier</Link>
            <span aria-hidden> › </span>
            <span>Paiement</span>
          </p>

          <form className="checkout-main" onSubmit={onSubmit} noValidate>
            <section className="checkout-block">
              <div className="checkout-block-head">
                <h2>Contact</h2>
                {isLoggedIn && !showContactForm && (
                  <button
                    type="button"
                    className="checkout-link-btn"
                    onClick={() => setEditContact(true)}
                  >
                    Modifier
                  </button>
                )}
              </div>

              {showContactForm ? (
                <>
                  {isLoggedIn && (
                    <p className="checkout-hint">
                      Connecté en tant que{' '}
                      <strong>{contactName ?? email}</strong>
                      {' · '}
                      <button
                        type="button"
                        className="checkout-link-btn"
                        onClick={() => setEditContact(false)}
                      >
                        Utiliser mon profil
                      </button>
                    </p>
                  )}
                  <div className="checkout-fields checkout-fields-2">
                    <label className="checkout-field">
                      <span>E-mail</span>
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.ci"
                      />
                    </label>
                    <div className="checkout-field">
                      <span>Téléphone</span>
                      <PhoneInput
                        value={telephone}
                        onChange={setTelephone}
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="checkout-saved-card">
                  {contactName && (
                    <strong className="checkout-saved-name">{contactName}</strong>
                  )}
                  <p>{email}</p>
                  {telephone ? (
                    <p>{telephone}</p>
                  ) : (
                    <p className="checkout-hint">
                      Téléphone manquant —{' '}
                      <button
                        type="button"
                        className="checkout-link-btn"
                        onClick={() => setEditContact(true)}
                      >
                        l’ajouter
                      </button>
                    </p>
                  )}
                </div>
              )}

              {!isLoggedIn && (
                <p className="checkout-hint checkout-login-hint">
                  Déjà client ?{' '}
                  <Link to="/compte">Connectez-vous</Link> pour préremplir vos
                  coordonnées.
                </p>
              )}
            </section>

            <section className="checkout-block">
              <h2>Livraison</h2>
              <div className="checkout-option-grid" role="radiogroup">
                <button
                  type="button"
                  className={`checkout-option ${mode === 'RETRAIT_BOUTIQUE' ? 'is-active' : ''}`}
                  onClick={() => setMode('RETRAIT_BOUTIQUE')}
                >
                  <strong>Retrait</strong>
                  <span>Gratuit en boutique</span>
                </button>
                <button
                  type="button"
                  className={`checkout-option ${mode === 'LIVRAISON' ? 'is-active' : ''}`}
                  onClick={() => setMode('LIVRAISON')}
                >
                  <strong>Livraison</strong>
                  <span>Partout en CIV</span>
                </button>
              </div>

              {mode === 'RETRAIT_BOUTIQUE' && (
                <div className="checkout-fields">
                  <label className="checkout-field">
                    <span>Boutique</span>
                    <select
                      value={boutiqueId}
                      onChange={(e) => setBoutiqueId(e.target.value)}
                      required
                    >
                      {boutiquesRetrait.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nom}
                          {b.adresse ? ` — ${b.adresse}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedBoutique?.adresse && (
                    <p className="checkout-hint">{selectedBoutique.adresse}</p>
                  )}
                </div>
              )}

              {mode === 'LIVRAISON' && (
                <div className="checkout-fields">
                  {(zones?.length ?? 0) > 1 && (
                    <label className="checkout-field">
                      <span>Zone</span>
                      <select
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                      >
                        {zones?.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.libelle} — {formatFcfa(Number(z.tarifForfait))}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {(zones?.length ?? 0) === 1 && selectedZone && (
                    <p className="checkout-hint">
                      {selectedZone.libelle} ·{' '}
                      {formatFcfa(Number(selectedZone.tarifForfait))}
                    </p>
                  )}

                  {showSavedAdresse ? (
                    <>
                      <div className="checkout-addr-list" role="radiogroup">
                        {adresses!.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={`checkout-saved-card checkout-addr-card ${
                              selectedAdresseId === a.id ? 'is-active' : ''
                            }`}
                            onClick={() => applyAdresse(a)}
                          >
                            <span className="checkout-addr-label">
                              {a.libelle}
                            </span>
                            <strong>{a.ligne1}</strong>
                            <span>
                              {a.ville}
                              {a.telephone ? ` · ${a.telephone}` : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="checkout-link-btn"
                        onClick={() => setEditAdresse(true)}
                      >
                        Utiliser une autre adresse
                      </button>
                    </>
                  ) : (
                    <>
                      {isLoggedIn && hasSavedAdresses && (
                        <button
                          type="button"
                          className="checkout-link-btn"
                          onClick={() => {
                            setEditAdresse(false);
                            if (adresses?.[0]) applyAdresse(adresses[0]);
                          }}
                        >
                          ← Revenir à mes adresses
                        </button>
                      )}
                      <DeliveryAddressMap
                        lat={lat}
                        lng={lng}
                        onPick={applyGeo}
                      />
                      <label className="checkout-field">
                        <span>Adresse</span>
                        <input
                          value={ligne1}
                          onChange={(e) => setLigne1(e.target.value)}
                          placeholder="Rue, quartier…"
                          autoComplete="street-address"
                          required
                        />
                      </label>
                      <label className="checkout-field">
                        <span>Ville</span>
                        <input
                          value={ville}
                          onChange={(e) => setVille(e.target.value)}
                          autoComplete="address-level2"
                          required
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="checkout-block">
              <h2>Paiement</h2>
              <div className="checkout-option-grid" role="radiogroup">
                <button
                  type="button"
                  className={`checkout-option ${reglement === 'PREPAYE_PSP' ? 'is-active' : ''}`}
                  onClick={() => setReglement('PREPAYE_PSP')}
                >
                  <strong>Payer maintenant</strong>
                  <span>Carte ou mobile money</span>
                </button>
                {mode === 'RETRAIT_BOUTIQUE' && paiementRetraitActif && (
                  <button
                    type="button"
                    className={`checkout-option ${reglement === 'PAIEMENT_RETRAIT' ? 'is-active' : ''}`}
                    onClick={() => setReglement('PAIEMENT_RETRAIT')}
                  >
                    <strong>Au retrait</strong>
                    <span>Espèces en boutique</span>
                  </button>
                )}
                {mode === 'LIVRAISON' && paiementLivraisonActif && (
                  <button
                    type="button"
                    className={`checkout-option ${reglement === 'PAIEMENT_LIVRAISON' ? 'is-active' : ''}`}
                    onClick={() => setReglement('PAIEMENT_LIVRAISON')}
                  >
                    <strong>À la livraison</strong>
                    <span>Espèces ou mobile money au livreur</span>
                  </button>
                )}
              </div>
              {reglement === 'PAIEMENT_LIVRAISON' && (
                <p className="checkout-hint">
                  Aucun débit en ligne. Vous réglez quand le colis arrive.
                </p>
              )}
              {reglement === 'PAIEMENT_RETRAIT' && (
                <p className="checkout-hint">
                  Aucun débit en ligne. Vous réglez au showroom.
                </p>
              )}
            </section>

            {!showNote ? (
              <button
                type="button"
                className="checkout-note-toggle"
                onClick={() => setShowNote(true)}
              >
                + Ajouter une note
              </button>
            ) : (
              <label className="checkout-field">
                <span>Note (optionnel)</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Référence véhicule, horaire…"
                />
              </label>
            )}

            {(fieldError || checkout.isError || stockIssues.length > 0) && (
              <div className="checkout-alerts" role="alert">
                {stockIssues.map((msg) => (
                  <p key={msg} className="checkout-error">
                    {msg}
                  </p>
                ))}
                {(fieldError || checkout.isError) && (
                  <p className="checkout-error">
                    {fieldError ?? (checkout.error as Error).message}
                  </p>
                )}
              </div>
            )}

            <div className="checkout-actions">
              <Link to="/panier" className="checkout-back">
                ← Panier
              </Link>
              <button
                type="submit"
                className="btn checkout-submit"
                disabled={checkout.isPending || stockIssues.length > 0}
              >
                {checkout.isPending
                  ? 'Traitement…'
                  : reglement === 'PREPAYE_PSP'
                    ? `Payer · ${formatFcfa(total)}`
                    : `Commander · ${formatFcfa(total)}`}
              </button>
            </div>
          </form>
        </div>

        <aside className="checkout-summary" aria-label="Récapitulatif">
          <h2 className="checkout-summary-title">Récapitulatif</h2>
          <OrderSummary {...summaryProps} />
        </aside>
      </div>
    </div>
  );
}
