import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatFcfa, shopFetch } from '../lib/api';
import {
  SHOP_AUTH_EVENT,
  clearShopSession,
  persistShopSession,
  readShopSession,
} from '../lib/shopAuth';
import {
  PHONE_COUNTRIES,
  digitsOnly,
  formatPhoneNational,
  isCompletePhone,
  maxNationalDigits,
  phoneDigitCount,
  toE164,
  type PhoneCountry,
} from '../lib/phone';
import {
  DeliveryAddressMap,
  type DeliveryGeo,
} from '../components/DeliveryAddressMap';
import { readShopAttribution, trackShopEvent } from '../lib/aarrr';
import {
  formatDateFr,
  labelFulfillment,
  labelReglement,
  labelStatut,
} from '../lib/commandeLabels';

type Mode = 'login' | 'inscription';
type OngletCompte = 'encours' | 'historique' | 'adresses' | 'profil' | 'parrainage';

const CLOTUREES = new Set(['LIVREE', 'REMISE', 'ANNULEE', 'REMBOURSEE']);

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  compteClientId: string;
  email: string;
  prenom?: string;
  nom?: string;
  displayName?: string;
}

interface CommandeRow {
  id: string;
  statut: string;
  montantTotal: string | number;
  modeFulfillment?: string;
  modeReglement?: string;
  createdAt?: string;
  suiviToken?: string | null;
  numeroSuivi?: string | null;
  adresseLivraisonJson?: Record<string, unknown> | null;
  boutiqueRetrait?: { nom: string; adresse: string } | null;
  zoneLivraison?: { libelle: string } | null;
  lignes?: Array<{
    id: string;
    designationSnapshot: string;
    quantite: number;
    prixUnitaireTtc: string | number;
  }>;
}

interface AdresseRow {
  id: string;
  libelle: string;
  ligne1: string;
  ligne2?: string | null;
  ville: string;
  telephone?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string;
}

interface ProfilCompte {
  email: string;
  prenom?: string | null;
  nom?: string | null;
  displayName?: string;
  telephone?: string | null;
  fidelite?: { niveau: string; pointsCumules: number } | null;
  codeParrainage?: string;
  filleuls?: number;
}

function formatDate(iso?: string) {
  return formatDateFr(iso);
}

function adresseCommandeTexte(c: CommandeRow): string | null {
  if (c.boutiqueRetrait) {
    return `${c.boutiqueRetrait.nom} — ${c.boutiqueRetrait.adresse}`;
  }
  const json = c.adresseLivraisonJson;
  if (json && typeof json === 'object') {
    const parts = [json.ligne1, json.ville]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  if (c.zoneLivraison?.libelle) return c.zoneLivraison.libelle;
  return null;
}

function PhoneInput({
  country,
  onCountryChange,
  national,
  onNationalChange,
}: {
  country: PhoneCountry;
  onCountryChange: (c: PhoneCountry) => void;
  national: string;
  onNationalChange: (digits: string) => void;
}) {
  const max = maxNationalDigits(country);
  const display = formatPhoneNational(national, country);

  return (
    <label className="phone-field">
      <span>Téléphone</span>
      <div className="phone-field-row">
        <select
          className="phone-dial"
          value={country.iso}
          aria-label="Indicatif pays"
          onChange={(e) => {
            const next = PHONE_COUNTRIES.find((c) => c.iso === e.target.value);
            if (next) onCountryChange(next);
          }}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.label} (+{c.dial})
            </option>
          ))}
        </select>
        <div className="phone-national">
          <span className="phone-prefix" aria-hidden>
            +{country.dial}
          </span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder={country.mask.replace(/X/g, '0')}
            value={display}
            required
            onChange={(e) => {
              const next = digitsOnly(e.target.value).slice(0, max);
              onNationalChange(next);
            }}
          />
        </div>
      </div>
      <em className="phone-hint">
        {country.label} · format {country.mask.replace(/X/g, '0')}
      </em>
    </label>
  );
}

export default function ComptePage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(PHONE_COUNTRIES[0]!);
  const [phoneNational, setPhoneNational] = useState('');
  const [token, setToken] = useState<string | null>(
    () => readShopSession().token,
  );
  const [compteEmail, setCompteEmail] = useState<string | null>(
    () => readShopSession().email,
  );
  const [displayName, setDisplayName] = useState<string | null>(
    () => readShopSession().displayName,
  );
  const [commandes, setCommandes] = useState<CommandeRow[]>([]);
  const [adresses, setAdresses] = useState<AdresseRow[]>([]);
  const [profil, setProfil] = useState<ProfilCompte | null>(null);
  const [loadingCmd, setLoadingCmd] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<OngletCompte>('encours');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adrLibelle, setAdrLibelle] = useState('Domicile');
  const [adrLigne1, setAdrLigne1] = useState('');
  const [adrVille, setAdrVille] = useState('');
  const [adrTel, setAdrTel] = useState('');
  const [adrLat, setAdrLat] = useState<number | null>(null);
  const [adrLng, setAdrLng] = useState<number | null>(null);
  const [adrPending, setAdrPending] = useState(false);
  const autoOnglet = useRef(false);

  const telephoneE164 = useMemo(
    () => toE164(phoneCountry, phoneNational),
    [phoneCountry, phoneNational],
  );

  const enCours = useMemo(
    () => commandes.filter((c) => !CLOTUREES.has(c.statut)),
    [commandes],
  );
  const historique = useMemo(
    () => commandes.filter((c) => CLOTUREES.has(c.statut)),
    [commandes],
  );

  useEffect(() => {
    function applyHash() {
      const h = window.location.hash.replace('#', '');
      if (
        h === 'encours' ||
        h === 'historique' ||
        h === 'adresses' ||
        h === 'profil' ||
        h === 'parrainage'
      ) {
        autoOnglet.current = true;
        setOnglet(h);
      }
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    function syncSession() {
      const s = readShopSession();
      setToken(s.token);
      setCompteEmail(s.email);
      setDisplayName(s.displayName);
    }
    window.addEventListener(SHOP_AUTH_EVENT, syncSession);
    return () => window.removeEventListener(SHOP_AUTH_EVENT, syncSession);
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadEspace(token);
  }, [token]);

  async function loadEspace(_authToken: string) {
    setLoadingCmd(true);
    setCmdError(null);
    try {
      const [cmds, ads, moi] = await Promise.all([
        shopFetch<CommandeRow[]>('/shop/compte/commandes'),
        shopFetch<AdresseRow[]>('/shop/compte/adresses'),
        shopFetch<ProfilCompte>('/shop/compte/moi'),
      ]);
      setCommandes(cmds);
      setAdresses(ads);
      setProfil(moi);
      if (!autoOnglet.current) {
        autoOnglet.current = true;
        const hash = window.location.hash.replace('#', '');
        if (
          hash === 'encours' ||
          hash === 'historique' ||
          hash === 'adresses' ||
          hash === 'profil' ||
          hash === 'parrainage'
        ) {
          setOnglet(hash);
        } else {
          const ouvertes = cmds.filter((c) => !CLOTUREES.has(c.statut));
          if (ouvertes.length === 0 && cmds.length > 0) {
            setOnglet('historique');
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/invalide|Unauthorized|401|502/i.test(msg)) {
        clearShopSession();
        setToken(null);
        setCompteEmail(null);
        setDisplayName(null);
        setCommandes([]);
        setAdresses([]);
        setProfil(null);
        setError(
          /502/.test(msg)
            ? 'Service temporairement indisponible. Réessayez.'
            : 'Session expirée. Reconnectez-vous pour voir vos commandes.',
        );
        return;
      }
      setCommandes([]);
      setCmdError(
        msg || 'Impossible de charger votre espace.',
      );
    } finally {
      setLoadingCmd(false);
    }
  }

  async function ajouterAdresse() {
    if (!token || !adrLigne1.trim() || !adrVille.trim()) return;
    setAdrPending(true);
    setError(null);
    try {
      await shopFetch('/shop/compte/adresses', {
        method: 'POST',
        body: JSON.stringify({
          libelle: adrLibelle.trim() || 'Livraison',
          ligne1: adrLigne1.trim(),
          ville: adrVille.trim(),
          telephone: adrTel.trim() || undefined,
          lat: adrLat ?? undefined,
          lng: adrLng ?? undefined,
        }),
      });
      setAdrLigne1('');
      setAdrVille('');
      setAdrTel('');
      setAdrLat(null);
      setAdrLng(null);
      const ads = await shopFetch<AdresseRow[]>('/shop/compte/adresses');
      setAdresses(ads);
      setSuccess('Adresse enregistrée.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setAdrPending(false);
    }
  }

  function persistSession(res: AuthResponse) {
    const name =
      res.displayName ??
      ([res.prenom, res.nom].filter(Boolean).join(' ') || res.email);
    persistShopSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      email: res.email,
      displayName: name,
      prenom: res.prenom,
      nom: res.nom,
    });
    setToken(res.accessToken);
    setCompteEmail(res.email);
    setDisplayName(name);
  }

  async function login() {
    setError(null);
    setSuccess(null);
    setPending(true);
    try {
      const res = await shopFetch<AuthResponse>('/shop/compte/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      persistSession(res);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible');
    } finally {
      setPending(false);
    }
  }

  async function inscription() {
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== password2) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!nom.trim() || !prenom.trim()) {
      setError('Nom et prénom sont requis.');
      return;
    }
    if (!isCompletePhone(phoneCountry, phoneNational)) {
      setError(
        `Indiquez un numéro ${phoneCountry.label} complet (${phoneDigitCount(phoneCountry.mask)} chiffres).`,
      );
      return;
    }
    setPending(true);
    try {
      const res = await shopFetch<AuthResponse>('/shop/compte/inscription', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telephoneE164,
          codeParrain: readShopAttribution().codeParrain,
        }),
      });
      persistSession(res);
      setSuccess('Compte créé — bienvenue chez MAJOR AUTO PARTS.');
      setPassword('');
      setPassword2('');
      setPhoneNational('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inscription impossible');
    } finally {
      setPending(false);
    }
  }

  function logout() {
    clearShopSession();
    setToken(null);
    setCompteEmail(null);
    setDisplayName(null);
    setCommandes([]);
    setAdresses([]);
    setProfil(null);
    setOnglet('encours');
    autoOnglet.current = false;
    setMode('login');
  }

  function carteCommande(c: CommandeRow) {
    const lieu = adresseCommandeTexte(c);
    return (
      <article key={c.id} className="compte-order panel">
        <div className="compte-order-top">
          <div>
            <strong className="compte-order-id">
              #{c.id.slice(0, 8).toUpperCase()}
            </strong>
            <p className="muted">{formatDate(c.createdAt)}</p>
          </div>
          <span className={`statut-pill statut-${c.statut}`}>
            {labelStatut(c.statut)}
          </span>
        </div>
        {(c.lignes?.length ?? 0) > 0 && (
          <ul className="compte-order-lignes">
            {c.lignes!.slice(0, 4).map((l) => (
              <li key={l.id}>
                <span>
                  {l.designationSnapshot} × {l.quantite}
                </span>
                <strong>
                  {formatFcfa(Number(l.prixUnitaireTtc) * l.quantite)}
                </strong>
              </li>
            ))}
            {c.lignes!.length > 4 && (
              <li className="muted">+ {c.lignes!.length - 4} article(s)</li>
            )}
          </ul>
        )}
        {lieu && <p className="compte-order-lieu">{lieu}</p>}
        <div className="compte-order-meta">
          <span>
            {labelFulfillment(c.modeFulfillment ?? 'LIVRAISON')}
            {c.modeReglement ? ` · ${labelReglement(c.modeReglement)}` : ''}
          </span>
          <strong>{formatFcfa(Number(c.montantTotal))}</strong>
        </div>
        {c.suiviToken && (
          <Link
            className="section-link"
            to={`/suivi/${c.suiviToken}`}
            style={{ marginTop: '0.75rem', display: 'inline-block' }}
          >
            Suivre la commande →
          </Link>
        )}
      </article>
    );
  }

  if (token) {
    return (
      <div className="section compte-page compte-temu-dash flash">
        <div className="compte-hero">
          <div>
            <p className="compte-temu-secure compte-temu-secure--dash">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 7V7a3 3 0 1 1 6 0v2H9Z"
                />
              </svg>
              Compte sécurisé
            </p>
            <h1 className="compte-temu-title compte-temu-title--dash">
              Mon compte
            </h1>
            <p className="compte-temu-lead">
              Bonjour{' '}
              <strong>{displayName ?? compteEmail ?? 'client'}</strong>
              {compteEmail && displayName ? (
                <span className="muted"> · {compteEmail}</span>
              ) : null}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Déconnexion
          </button>
        </div>

        <div className="compte-dash">
          <aside className="compte-side panel">
            <nav className="compte-nav" aria-label="Espace client">
              {(
                [
                  ['encours', `En cours (${enCours.length})`],
                  ['historique', `Historique (${historique.length})`],
                  ['adresses', `Adresses (${adresses.length})`],
                  ['profil', 'Profil & fidélité'],
                  ['parrainage', 'Parrainage'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={onglet === id ? 'active' : ''}
                  onClick={() => {
                    setOnglet(id);
                    if (window.location.hash !== `#${id}`) {
                      history.replaceState(null, '', `#${id}`);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <Link className="btn" to="/catalogue" style={{ marginTop: '1.25rem' }}>
              Continuer mes achats
            </Link>
            <button
              type="button"
              className="section-link"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginTop: '0.75rem',
              }}
              onClick={() => token && void loadEspace(token)}
            >
              Actualiser
            </button>
          </aside>

          <div className="compte-main">
            {cmdError && <p className="pdp-error">{cmdError}</p>}
            {success && onglet !== 'encours' && (
              <p className="pdp-toast">{success}</p>
            )}
            {loadingCmd && <p className="muted">Chargement…</p>}

            {!loadingCmd && onglet === 'encours' && (
              <>
                <div className="section-head" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h2>Commandes en cours</h2>
                    <p>Paiement, préparation, retrait ou livraison</p>
                  </div>
                </div>
                {enCours.length === 0 ? (
                  <div className="panel compte-empty">
                    <p>Aucune commande en cours.</p>
                    {historique.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ marginTop: '1rem' }}
                        onClick={() => setOnglet('historique')}
                      >
                        Voir l’historique
                      </button>
                    ) : (
                      <Link className="btn" to="/catalogue" style={{ marginTop: '1rem' }}>
                        Découvrir le catalogue
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="compte-orders">{enCours.map(carteCommande)}</div>
                )}
              </>
            )}

            {!loadingCmd && onglet === 'historique' && (
              <>
                <div className="section-head" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h2>Historique</h2>
                    <p>Commandes livrées, remises ou clôturées</p>
                  </div>
                </div>
                {historique.length === 0 ? (
                  <div className="panel compte-empty">
                    <p>Pas encore de commande clôturée.</p>
                  </div>
                ) : (
                  <div className="compte-orders">{historique.map(carteCommande)}</div>
                )}
              </>
            )}

            {!loadingCmd && onglet === 'adresses' && (
              <>
                <div className="section-head" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h2>Adresses de livraison</h2>
                    <p>Carnet utilisé au checkout</p>
                  </div>
                </div>
                {adresses.length === 0 && (
                  <p className="muted">Aucune adresse enregistrée.</p>
                )}
                <div className="compte-adresses">
                  {adresses.map((a) => (
                    <article key={a.id} className="panel compte-adresse">
                      <strong>{a.libelle}</strong>
                      <p>
                        {a.ligne1}
                        {a.ligne2 ? `, ${a.ligne2}` : ''}
                      </p>
                      <p>{a.ville}</p>
                      {a.telephone && <p className="muted">{a.telephone}</p>}
                      {a.lat != null && a.lng != null && (
                        <p className="muted">
                          GPS {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                        </p>
                      )}
                      {a.source === 'derniere_commande' && (
                        <p className="muted">Issue de votre dernière commande</p>
                      )}
                    </article>
                  ))}
                </div>
                <form
                  className="panel form-stack compte-adresse-form"
                  style={{ marginTop: '1.25rem' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ajouterAdresse();
                  }}
                >
                  <h3>Ajouter une adresse</h3>
                  <label>
                    Libellé
                    <input
                      value={adrLibelle}
                      onChange={(e) => setAdrLibelle(e.target.value)}
                      placeholder="Domicile, Bureau…"
                    />
                  </label>
                  <DeliveryAddressMap
                    lat={adrLat}
                    lng={adrLng}
                    onPick={(geo: DeliveryGeo) => {
                      setAdrLat(geo.lat);
                      setAdrLng(geo.lng);
                      if (geo.ligne1) setAdrLigne1(geo.ligne1);
                      if (geo.ville) setAdrVille(geo.ville);
                    }}
                  />
                  <label>
                    Adresse
                    <input
                      value={adrLigne1}
                      onChange={(e) => setAdrLigne1(e.target.value)}
                      placeholder="Rue, quartier"
                      required
                    />
                  </label>
                  <div className="form-row-2">
                    <label>
                      Ville
                      <input
                        value={adrVille}
                        onChange={(e) => setAdrVille(e.target.value)}
                        placeholder="Abidjan"
                        required
                      />
                    </label>
                    <label>
                      Téléphone
                      <input
                        value={adrTel}
                        onChange={(e) => setAdrTel(e.target.value)}
                        placeholder="+225…"
                      />
                    </label>
                  </div>
                  <button type="submit" className="btn" disabled={adrPending}>
                    {adrPending ? 'Enregistrement…' : 'Enregistrer l’adresse'}
                  </button>
                  {error && <p className="pdp-error">{error}</p>}
                </form>
              </>
            )}

            {!loadingCmd && onglet === 'profil' && (
              <div className="panel">
                <h2>Profil</h2>
                <dl className="compte-profil-dl">
                  <div>
                    <dt>Nom</dt>
                    <dd>
                      {profil
                        ? [profil.prenom, profil.nom].filter(Boolean).join(' ') ||
                          displayName
                        : displayName}
                    </dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{profil?.email ?? compteEmail}</dd>
                  </div>
                  <div>
                    <dt>Téléphone</dt>
                    <dd>{profil?.telephone ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Fidélité</dt>
                    <dd>
                      {profil?.fidelite
                        ? `${profil.fidelite.niveau} · ${profil.fidelite.pointsCumules} pt(s)`
                        : 'Bronze · 0 pt (crédités à la remise / livraison)'}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {!loadingCmd && onglet === 'parrainage' && (
              <div className="panel">
                <h2>Parrainez un proche</h2>
                <p className="muted">
                  Partagez votre lien. Les inscriptions via ce code sont
                  tracées dans votre compte — sans remise inventée.
                </p>
                <dl className="compte-profil-dl">
                  <div>
                    <dt>Votre code</dt>
                    <dd>{profil?.codeParrainage ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Filleuls inscrits</dt>
                    <dd>{profil?.filleuls ?? 0}</dd>
                  </div>
                </dl>
                {profil?.codeParrainage ? (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: '1rem' }}
                    onClick={() => {
                      const url = `${window.location.origin}/?ref=${profil.codeParrainage}`;
                      void navigator.clipboard?.writeText(url);
                      trackShopEvent('SHARE');
                      setSuccess('Lien copié — envoyez-le à un proche.');
                    }}
                  >
                    Copier le lien
                  </button>
                ) : null}
              </div>
            )}
            {success && onglet === 'encours' && (
              <p className="pdp-toast">{success}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section compte-page compte-temu flash">
      <div className="compte-temu-shell">
        <header className="compte-temu-head">
          <p className="compte-temu-brand">
            <span className="brand-major">MAJOR</span>
            <span className="brand-auto">AUTO PARTS</span>
          </p>
        </header>

        <h1 className="compte-temu-title">Se connecter / S&apos;inscrire</h1>

        <ul className="compte-temu-perks" aria-label="Avantages client">
          <li>
            <span className="compte-temu-perk-ico" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="currentColor"
                  d="M3 7h11v8H3V7Zm13 2h3.2L22 12.5V15h-6V9Zm-1-2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12Zm-9 11.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm11 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"
                />
              </svg>
            </span>
            <strong>Livraison CIV</strong>
            <em>Partout · showroom</em>
          </li>
          <li>
            <span className="compte-temu-perk-ico" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="currentColor"
                  d="M4 4h16v2H4V4Zm0 4h10v2H4V8Zm0 4h16v2H4v-2Zm0 4h10v2H4v-2Zm14.5-1.5 1.4 1.4L16 20.8l-3-3 1.4-1.4 1.6 1.6 2.5-2.5Z"
                />
              </svg>
            </span>
            <strong>Suivi live</strong>
            <em>Commandes &amp; retrait</em>
          </li>
        </ul>

        <div className="compte-temu-card">
          <div className="compte-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Connexion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'inscription'}
              className={mode === 'inscription' ? 'active' : ''}
              onClick={() => {
                setMode('inscription');
                setError(null);
              }}
            >
              Créer un compte
            </button>
          </div>

          <p className="compte-temu-lead">
            {mode === 'login'
              ? 'Accédez à vos commandes, adresses et avantages fidélité.'
              : 'Nouveau client ? Compte en 30 secondes — checkout accéléré.'}
          </p>

          <form
            className="form-stack compte-temu-form"
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === 'login' ? login() : inscription());
            }}
          >
            {mode === 'inscription' && (
              <>
                <div className="form-row-2">
                  <label>
                    Prénom
                    <input
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label>
                    Nom
                    <input
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </label>
                </div>
                <PhoneInput
                  country={phoneCountry}
                  onCountryChange={(c) => {
                    setPhoneCountry(c);
                    setPhoneNational((prev) =>
                      prev.slice(0, maxNationalDigits(c)),
                    );
                  }}
                  national={phoneNational}
                  onNationalChange={setPhoneNational}
                />
              </>
            )}

            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.ci"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                minLength={mode === 'inscription' ? 8 : undefined}
                required
              />
            </label>

            {mode === 'inscription' && (
              <label>
                Confirmer le mot de passe
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            )}

            <button
              type="submit"
              className="btn compte-temu-cta"
              disabled={pending}
            >
              {pending
                ? 'Patientez…'
                : mode === 'login'
                  ? 'Continuer'
                  : 'Créer mon compte'}
            </button>

            {error && <p className="pdp-error">{error}</p>}

            <p className="compte-switch">
              {mode === 'login' ? (
                <>
                  Pas encore de compte ?{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setMode('inscription')}
                  >
                    S&apos;inscrire
                  </button>
                </>
              ) : (
                <>
                  Déjà client ?{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setMode('login')}
                  >
                    Se connecter
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
