import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  MapPin,
  Plus,
  Search,
  Store,
  Warehouse,
  Wallet,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightCaissesCount,
  insightCompletenessSetup,
  insightEntrepotsCount,
  insightMagasinsActifs,
  insightSanteMagasin,
  insightSocieteFiche,
  insightTypeCaisseConfig,
  insightTypeEntrepot,
  insightZonesCount,
  insightSanteColonne,
} from '../lib/insights/entreprise';
import type {
  BoutiqueDto,
  CaisseDto,
  EntrepotDto,
  SocieteDto,
  ZoneDto,
} from '../lib/types';

const ROLES_ADMIN: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

type Onglet =
  | 'overview'
  | 'societe'
  | 'zones'
  | 'magasins'
  | 'entrepots'
  | 'caisses';

type Severite = 'critique' | 'warning' | 'info' | 'ok';

interface HealthAlert {
  id: string;
  label: string;
  severite: Severite;
  tab: Onglet;
}

function boutiqueHasMagasin(boutiqueId: string, caisses: CaisseDto[]) {
  return caisses.some((c) => c.type === 'MAGASIN' && c.boutiqueId === boutiqueId);
}

function boutiqueHasPrincipal(boutiqueId: string, entrepots: EntrepotDto[]) {
  return entrepots.some(
    (e) => e.boutiqueId === boutiqueId && e.type === 'PRINCIPAL' && e.actif,
  );
}

export function EntreprisePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);

  const [onglet, setOnglet] = useState<Onglet>('overview');
  const [modalZone, setModalZone] = useState(false);
  const [modalBoutique, setModalBoutique] = useState(false);
  const [modalEntrepot, setModalEntrepot] = useState(false);
  const [modalCaisse, setModalCaisse] = useState(false);
  const [searchMagasin, setSearchMagasin] = useState('');
  const [filtreEntrepotBoutique, setFiltreEntrepotBoutique] = useState('');

  const societe = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: peutLire,
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => apiFetch<ZoneDto[]>('/zones'),
    enabled: peutLire,
  });
  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: peutLire,
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const caisses = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled: peutLire,
  });

  const [raisonSociale, setRaisonSociale] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [devise, setDevise] = useState('XOF');
  const [logoUrl, setLogoUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [formHydrated, setFormHydrated] = useState(false);

  useEffect(() => {
    if (!societe.data || formHydrated) return;
    setRaisonSociale(societe.data.raisonSociale);
    setAdresse(societe.data.adresse);
    setTelephone(societe.data.telephone ?? '');
    setEmail(societe.data.email ?? '');
    setDevise(societe.data.devise);
    setLogoUrl(societe.data.logoUrl ?? '');
    setFormHydrated(true);
  }, [societe.data, formHydrated]);

  const patchSociete = useMutation({
    mutationFn: () =>
      apiFetch<SocieteDto>('/entreprise', {
        method: 'PATCH',
        body: JSON.stringify({
          raisonSociale: raisonSociale || undefined,
          adresse: adresse || undefined,
          telephone: telephone || undefined,
          email: email || undefined,
          devise: devise || undefined,
          logoUrl: logoUrl || undefined,
        }),
      }),
    onSuccess: () => {
      setMsg('Société mise à jour.');
      void queryClient.invalidateQueries({ queryKey: ['entreprise'] });
    },
    onError: () => setMsg('Échec de la mise à jour.'),
  });

  const [nomZone, setNomZone] = useState('');
  const createZone = useMutation({
    mutationFn: () =>
      apiFetch<ZoneDto>('/zones', {
        method: 'POST',
        body: JSON.stringify({ nomZone }),
      }),
    onSuccess: () => {
      setNomZone('');
      setModalZone(false);
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const [nomBoutique, setNomBoutique] = useState('');
  const [adresseBoutique, setAdresseBoutique] = useState('');
  const [zoneId, setZoneId] = useState('');
  const createBoutique = useMutation({
    mutationFn: () =>
      apiFetch<BoutiqueDto>('/boutiques', {
        method: 'POST',
        body: JSON.stringify({
          nom: nomBoutique,
          adresse: adresseBoutique,
          zoneId: zoneId || zones.data?.[0]?.id || '',
        }),
      }),
    onSuccess: () => {
      setNomBoutique('');
      setAdresseBoutique('');
      setModalBoutique(false);
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const toggleBoutique = useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) =>
      apiFetch<BoutiqueDto>(`/boutiques/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
    },
  });

  const [entrepotNom, setEntrepotNom] = useState('');
  const [entrepotCode, setEntrepotCode] = useState('');
  const [entrepotBoutiqueId, setEntrepotBoutiqueId] = useState('');
  const createEntrepot = useMutation({
    mutationFn: () =>
      apiFetch<EntrepotDto>('/entrepots', {
        method: 'POST',
        body: JSON.stringify({
          nom: entrepotNom,
          code: entrepotCode,
          boutiqueId: entrepotBoutiqueId || boutiques.data?.[0]?.id || '',
          type: 'SECONDAIRE',
        }),
      }),
    onSuccess: () => {
      setEntrepotNom('');
      setEntrepotCode('');
      setModalEntrepot(false);
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const toggleEntrepot = useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) =>
      apiFetch<EntrepotDto>(`/entrepots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const [caisseBoutiqueId, setCaisseBoutiqueId] = useState('');
  const createCaisse = useMutation({
    mutationFn: () =>
      apiFetch<CaisseDto>('/caisses', {
        method: 'POST',
        body: JSON.stringify({
          type: 'MAGASIN',
          boutiqueId: caisseBoutiqueId || boutiques.data?.[0]?.id || '',
        }),
      }),
    onSuccess: () => {
      setModalCaisse(false);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
  });

  const zonesList = zones.data ?? [];
  const boutiquesList = boutiques.data ?? [];
  const entrepotsList = entrepots.data ?? [];
  const caissesList = caisses.data ?? [];

  const magasinsActifs = boutiquesList.filter((b) => b.actif);
  const magasinsInactifs = boutiquesList.filter((b) => !b.actif);
  const caissesCentrale = caissesList.filter((c) => c.type === 'CENTRALE');
  const caissesMagasin = caissesList.filter((c) => c.type === 'MAGASIN');

  const boutiquesSansCaisse = boutiquesList.filter(
    (b) => b.actif && !boutiqueHasMagasin(b.id, caissesList),
  );
  const boutiquesSansPrincipal = boutiquesList.filter(
    (b) => b.actif && !boutiqueHasPrincipal(b.id, entrepotsList),
  );

  const societeIncomplete =
    !!societe.data && (!societe.data.email || !societe.data.telephone);

  const healthAlerts = useMemo((): HealthAlert[] => {
    const alerts: HealthAlert[] = [];
    if (societeIncomplete) {
      alerts.push({
        id: 'societe-incomplete',
        label: 'Fiche société incomplète (email ou téléphone manquant)',
        severite: 'warning',
        tab: 'societe',
      });
    }
    if (zones.isSuccess && zonesList.length === 0) {
      alerts.push({
        id: 'no-zones',
        label: 'Aucune zone définie',
        severite: 'critique',
        tab: 'zones',
      });
    }
    if (boutiquesSansCaisse.length > 0) {
      alerts.push({
        id: 'sans-caisse',
        label: `${boutiquesSansCaisse.length} magasin(s) sans caisse magasin`,
        severite: 'critique',
        tab: 'caisses',
      });
    }
    if (boutiquesSansPrincipal.length > 0) {
      alerts.push({
        id: 'sans-principal',
        label: `${boutiquesSansPrincipal.length} magasin(s) sans entrepôt PRINCIPAL`,
        severite: 'critique',
        tab: 'entrepots',
      });
    }
    if (magasinsInactifs.length > 0) {
      alerts.push({
        id: 'inactifs',
        label: `${magasinsInactifs.length} magasin(s) inactif(s)`,
        severite: 'info',
        tab: 'magasins',
      });
    }
    if (alerts.length === 0 && societe.isSuccess && zones.isSuccess) {
      alerts.push({
        id: 'ok',
        label: 'Configuration structurelle complète',
        severite: 'ok',
        tab: 'overview',
      });
    }
    return alerts;
  }, [
    societeIncomplete,
    zones.isSuccess,
    zonesList.length,
    boutiquesSansCaisse.length,
    boutiquesSansPrincipal.length,
    magasinsInactifs.length,
    societe.isSuccess,
  ]);

  const checklistItems = [
    {
      ok: !!societe.data,
      label: 'Société enregistrée',
      tab: 'societe' as Onglet,
    },
    {
      ok: !societeIncomplete,
      label: 'Coordonnées société (email + téléphone)',
      tab: 'societe' as Onglet,
    },
    {
      ok: zonesList.length > 0,
      label: 'Au moins une zone',
      tab: 'zones' as Onglet,
    },
    {
      ok: magasinsActifs.length > 0,
      label: 'Au moins un magasin actif',
      tab: 'magasins' as Onglet,
    },
    {
      ok: boutiquesSansPrincipal.length === 0 && magasinsActifs.length > 0,
      label: 'Chaque magasin actif a un entrepôt PRINCIPAL',
      tab: 'entrepots' as Onglet,
    },
    {
      ok: boutiquesSansCaisse.length === 0 && magasinsActifs.length > 0,
      label: 'Chaque magasin actif a une caisse magasin',
      tab: 'caisses' as Onglet,
    },
  ];

  const scoreCompleteness = Math.round(
    (checklistItems.filter((i) => i.ok).length / checklistItems.length) * 100,
  );

  const magasinsFiltres = boutiquesList.filter((b) => {
    const q = searchMagasin.trim().toLowerCase();
    if (!q) return true;
    const zoneNom = zonesList.find((z) => z.id === b.zoneId)?.nomZone ?? '';
    return (
      b.nom.toLowerCase().includes(q) ||
      b.adresse.toLowerCase().includes(q) ||
      (b.code ?? '').toLowerCase().includes(q) ||
      zoneNom.toLowerCase().includes(q)
    );
  });

  const entrepotsFiltres = entrepotsList.filter(
    (e) => !filtreEntrepotBoutique || e.boutiqueId === filtreEntrepotBoutique,
  );

  const navItems: Array<{
    id: Onglet;
    label: string;
    count?: number;
    icon: typeof Building2;
  }> = [
    { id: 'overview', label: "Vue d'ensemble", icon: CheckCircle2 },
    { id: 'societe', label: 'Société', icon: Building2 },
    { id: 'zones', label: 'Zones', count: zonesList.length, icon: MapPin },
    {
      id: 'magasins',
      label: 'Magasins',
      count: boutiquesList.length,
      icon: Store,
    },
    {
      id: 'entrepots',
      label: 'Entrepôts',
      count: entrepotsList.length,
      icon: Warehouse,
    },
    {
      id: 'caisses',
      label: 'Caisses',
      count: caissesList.length,
      icon: Wallet,
    },
  ];

  if (!peutLire) {
    return <p>Vous n’avez pas accès à la configuration entreprise.</p>;
  }

  const loadingAny =
    societe.isLoading ||
    zones.isLoading ||
    boutiques.isLoading ||
    entrepots.isLoading ||
    caisses.isLoading;

  return (
    <div>
      <PageHeader
        title="Configuration"
        subtitle="Structure de l'entreprise"
      />

      {!loadingAny && (
        <div className="cfg-health" role="status">
          <div className="cfg-health-score">
            <span className="cfg-health-score-value">{scoreCompleteness}%</span>
            <span className="cfg-health-score-label">
              Complétude setup{' '}
              <InfoTooltip
                insight={insightCompletenessSetup(
                  scoreCompleteness,
                  healthAlerts.filter((a) => a.severite !== 'ok').length,
                )}
              />
            </span>
          </div>
          <ul className="cfg-health-alerts">
            {healthAlerts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`cfg-health-alert cfg-health-alert-${a.severite}`}
                  onClick={() => setOnglet(a.tab)}
                >
                  {a.severite === 'ok' ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cfg-layout">
        <nav className="cfg-nav" aria-label="Sections configuration">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`cfg-nav-item${onglet === item.id ? ' actif' : ''}`}
                onClick={() => setOnglet(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className="cfg-nav-count">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="cfg-content">
          {onglet === 'overview' && (
            <>
              {loadingAny && <LoadingState label="Chargement de la configuration..." />}
              {!loadingAny && (
                <>
                  <div className="cfg-kpis">
                    <article className="cfg-card">
                      <div className="cfg-card-head">
                        <MapPin size={16} />
                        <span>Zones</span>
                        <InfoTooltip insight={insightZonesCount(zonesList.length)} />
                      </div>
                      <p className="cfg-kpi-value">{zonesList.length}</p>
                    </article>
                    <article className="cfg-card">
                      <div className="cfg-card-head">
                        <Store size={16} />
                        <span>Magasins actifs</span>
                        <InfoTooltip
                          insight={insightMagasinsActifs(
                            magasinsActifs.length,
                            magasinsInactifs.length,
                          )}
                        />
                      </div>
                      <p className="cfg-kpi-value">{magasinsActifs.length}</p>
                      <p className="cfg-kpi-meta">
                        {magasinsInactifs.length} inactif(s)
                      </p>
                    </article>
                    <article className="cfg-card">
                      <div className="cfg-card-head">
                        <Warehouse size={16} />
                        <span>Entrepôts</span>
                        <InfoTooltip
                          insight={insightEntrepotsCount(
                            entrepotsList.length,
                            boutiquesSansPrincipal.length,
                          )}
                        />
                      </div>
                      <p className="cfg-kpi-value">{entrepotsList.length}</p>
                    </article>
                    <article className="cfg-card">
                      <div className="cfg-card-head">
                        <Wallet size={16} />
                        <span>Caisses</span>
                        <InfoTooltip
                          insight={insightCaissesCount(
                            caissesMagasin.length,
                            caissesCentrale.length,
                          )}
                        />
                      </div>
                      <p className="cfg-kpi-value">{caissesList.length}</p>
                      <p className="cfg-kpi-meta">
                        {caissesMagasin.length} aux. · {caissesCentrale.length}{' '}
                        centrale(s)
                      </p>
                    </article>
                  </div>

                  <div className="cfg-overview-grid">
                    <ListPanel title="Checklist de mise en service">
                      <ul className="cfg-checklist">
                        {checklistItems.map((item) => (
                          <li key={item.label}>
                            <button
                              type="button"
                              className={`cfg-check-item${item.ok ? ' ok' : ''}`}
                              onClick={() => setOnglet(item.tab)}
                            >
                              {item.ok ? (
                                <CheckCircle2 size={15} />
                              ) : (
                                <AlertTriangle size={15} />
                              )}
                              {item.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </ListPanel>

                    <ListPanel title="Identité société">
                      {societe.data ? (
                        <div className="cfg-identity">
                          {societe.data.logoUrl ? (
                            <img
                              src={societe.data.logoUrl}
                              alt=""
                              className="cfg-identity-logo"
                            />
                          ) : (
                            <div className="cfg-identity-logo cfg-identity-logo-placeholder">
                              <Building2 size={28} />
                            </div>
                          )}
                          <div>
                            <h3>
                              {societe.data.raisonSociale}{' '}
                              <InfoTooltip
                                insight={insightSocieteFiche(
                                  !!societe.data.email,
                                  !!societe.data.telephone,
                                )}
                              />
                            </h3>
                            <p className="lead">{societe.data.adresse}</p>
                            <p className="cfg-identity-meta">
                              {societe.data.devise}
                              {societe.data.telephone
                                ? ` · ${societe.data.telephone}`
                                : ''}
                              {societe.data.email ? ` · ${societe.data.email}` : ''}
                            </p>
                            {peutAdmin && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setOnglet('societe')}
                              >
                                Modifier la fiche
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <EmptyState
                          title="Société introuvable"
                          description="Impossible de charger la fiche société."
                        />
                      )}
                    </ListPanel>
                  </div>
                </>
              )}
            </>
          )}

          {onglet === 'societe' && (
            <>
              {societe.isLoading && (
                <LoadingState label="Chargement de la société..." />
              )}
              {societe.isError && (
                <p role="alert">Erreur lors du chargement de la société.</p>
              )}
              {societe.data && (
                <>
                  <div className="cfg-identity cfg-identity-hero">
                    {societe.data.logoUrl ? (
                      <img
                        src={societe.data.logoUrl}
                        alt=""
                        className="cfg-identity-logo"
                      />
                    ) : (
                      <div className="cfg-identity-logo cfg-identity-logo-placeholder">
                        <Building2 size={32} />
                      </div>
                    )}
                    <div>
                      <h2>
                        {societe.data.raisonSociale}{' '}
                        <InfoTooltip
                          insight={insightSocieteFiche(
                            !!societe.data.email,
                            !!societe.data.telephone,
                          )}
                        />
                      </h2>
                      <p className="lead">{societe.data.adresse}</p>
                      <div className="cfg-chip-row">
                        <span className="cfg-badge">{societe.data.devise}</span>
                        {societe.data.telephone && (
                          <span className="cfg-badge muted">
                            {societe.data.telephone}
                          </span>
                        )}
                        {societe.data.email && (
                          <span className="cfg-badge muted">{societe.data.email}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {peutAdmin && (
                    <ListPanel title="Modifier la fiche société">
                      <form
                        className="cfg-form"
                        onSubmit={(e: FormEvent) => {
                          e.preventDefault();
                          patchSociete.mutate();
                        }}
                      >
                        <div className="cfg-form-grid">
                          <div>
                            <label htmlFor="rs">Raison sociale</label>
                            <input
                              id="rs"
                              value={raisonSociale}
                              onChange={(e) => setRaisonSociale(e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor="dev">Devise</label>
                            <input
                              id="dev"
                              value={devise}
                              onChange={(e) => setDevise(e.target.value)}
                              required
                            />
                          </div>
                          <div className="cfg-form-span">
                            <label htmlFor="adr">Adresse</label>
                            <input
                              id="adr"
                              value={adresse}
                              onChange={(e) => setAdresse(e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor="tel">Téléphone</label>
                            <input
                              id="tel"
                              value={telephone}
                              onChange={(e) => setTelephone(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor="em">Email</label>
                            <input
                              id="em"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </div>
                          <div className="cfg-form-span">
                            <label htmlFor="logo">URL du logo</label>
                            <input
                              id="logo"
                              value={logoUrl}
                              onChange={(e) => setLogoUrl(e.target.value)}
                              placeholder="https://…"
                            />
                          </div>
                        </div>
                        <div className="cfg-form-actions">
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={patchSociete.isPending}
                          >
                            Enregistrer
                          </button>
                          {msg && <p className="cfg-form-msg">{msg}</p>}
                        </div>
                      </form>
                    </ListPanel>
                  )}
                </>
              )}
            </>
          )}

          {onglet === 'zones' && (
            <ListPanel
              title="Zones"
              toolbar={
                peutAdmin ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setModalZone(true)}
                  >
                    <Plus size={14} /> Nouvelle zone
                  </button>
                ) : undefined
              }
            >
              {zones.isLoading && <LoadingState label="Chargement des zones..." />}
              {zones.isError && (
                <p role="alert">Erreur lors du chargement des zones.</p>
              )}
              {zones.data && zones.data.length === 0 && (
                <EmptyState
                  title="Aucune zone"
                  description="Créez une zone pour rattacher vos magasins."
                  action={
                    peutAdmin ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalZone(true)}
                      >
                        Nouvelle zone
                      </button>
                    ) : undefined
                  }
                />
              )}
              {zones.data && zones.data.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Magasins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.data.map((z) => {
                      const count = boutiquesList.filter(
                        (b) => b.zoneId === z.id,
                      ).length;
                      return (
                        <tr key={z.id}>
                          <td>{z.nomZone}</td>
                          <td>
                            <span className="cfg-badge">{count}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ListPanel>
          )}

          {onglet === 'magasins' && (
            <ListPanel
              title="Magasins"
              toolbar={
                <div className="cfg-toolbar">
                  <label className="cfg-search">
                    <Search size={14} />
                    <input
                      type="search"
                      placeholder="Rechercher…"
                      value={searchMagasin}
                      onChange={(e) => setSearchMagasin(e.target.value)}
                      aria-label="Rechercher un magasin"
                    />
                  </label>
                  {peutAdmin && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setModalBoutique(true)}
                    >
                      <Plus size={14} /> Nouveau magasin
                    </button>
                  )}
                </div>
              }
            >
              {boutiques.isLoading && (
                <LoadingState label="Chargement des magasins..." />
              )}
              {boutiques.isError && (
                <p role="alert">Erreur lors du chargement des magasins.</p>
              )}
              {boutiques.data && boutiques.data.length === 0 && (
                <EmptyState
                  title="Aucun magasin"
                  description="Aucun magasin enregistré."
                  action={
                    peutAdmin ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalBoutique(true)}
                      >
                        Nouveau magasin
                      </button>
                    ) : undefined
                  }
                />
              )}
              {boutiques.data && boutiques.data.length > 0 && magasinsFiltres.length === 0 && (
                <EmptyState
                  title="Aucun résultat"
                  description="Aucun magasin ne correspond à la recherche."
                />
              )}
              {magasinsFiltres.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Adresse</th>
                      <th>Zone</th>
                      <th>
                        Santé <InfoTooltip insight={insightSanteColonne()} />
                      </th>
                      <th>Statut</th>
                      {peutAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {magasinsFiltres.map((b) => {
                      const hasCaisse = boutiqueHasMagasin(b.id, caissesList);
                      const hasPrincipal = boutiqueHasPrincipal(b.id, entrepotsList);
                      return (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.nom}</strong>
                            {b.code ? (
                              <span className="cfg-code"> {b.code}</span>
                            ) : null}
                          </td>
                          <td>{b.adresse}</td>
                          <td>
                            {zonesList.find((z) => z.id === b.zoneId)?.nomZone ??
                              '—'}
                          </td>
                          <td>
                            <div className="cfg-chip-row">
                              <span
                                className={`cfg-badge ${hasCaisse ? 'ok' : 'warn'}`}
                              >
                                {hasCaisse ? 'Caisse OK' : 'Sans caisse'}
                              </span>
                              <span
                                className={`cfg-badge ${hasPrincipal ? 'ok' : 'warn'}`}
                              >
                                {hasPrincipal ? 'Entrepôt OK' : 'Sans PRINCIPAL'}
                              </span>
                              <InfoTooltip
                                insight={insightSanteMagasin(hasCaisse, hasPrincipal)}
                              />
                            </div>
                          </td>
                          <td>
                            <span
                              className={`cfg-badge ${b.actif ? 'ok' : 'muted'}`}
                            >
                              {b.actif ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          {peutAdmin && (
                            <td>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={toggleBoutique.isPending}
                                onClick={() =>
                                  toggleBoutique.mutate({
                                    id: b.id,
                                    actif: !b.actif,
                                  })
                                }
                              >
                                {b.actif ? 'Désactiver' : 'Activer'}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ListPanel>
          )}

          {onglet === 'entrepots' && (
            <ListPanel
              title="Entrepôts"
              toolbar={
                <div className="cfg-toolbar">
                  <label>
                    Boutique
                    <select
                      value={filtreEntrepotBoutique}
                      onChange={(e) => setFiltreEntrepotBoutique(e.target.value)}
                    >
                      <option value="">Toutes</option>
                      {boutiquesList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  {peutAdmin && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setModalEntrepot(true)}
                    >
                      <Plus size={14} /> Entrepôt secondaire
                    </button>
                  )}
                </div>
              }
            >
              {entrepots.isLoading && (
                <LoadingState label="Chargement des entrepôts..." />
              )}
              {entrepots.isError && (
                <p role="alert">Erreur lors du chargement des entrepôts.</p>
              )}
              {entrepots.data && entrepots.data.length === 0 && (
                <EmptyState
                  title="Aucun entrepôt"
                  description="Aucun entrepôt enregistré."
                  action={
                    peutAdmin ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalEntrepot(true)}
                      >
                        Nouvel entrepôt
                      </button>
                    ) : undefined
                  }
                />
              )}
              {entrepotsFiltres.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Boutique</th>
                      <th>Statut</th>
                      {peutAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entrepotsFiltres.map((e) => (
                      <tr key={e.id}>
                        <td>{e.nom}</td>
                        <td>
                          <code>{e.code}</code>
                        </td>
                        <td>
                          <span
                            className={`cfg-badge ${
                              e.type === 'PRINCIPAL' ? 'accent' : 'muted'
                            }`}
                          >
                            {e.type}
                          </span>{' '}
                          <InfoTooltip
                            insight={insightTypeEntrepot(
                              e.type === 'PRINCIPAL' ? 'PRINCIPAL' : 'SECONDAIRE',
                            )}
                          />
                        </td>
                        <td>
                          {boutiquesList.find((b) => b.id === e.boutiqueId)?.nom ??
                            e.boutique?.nom ??
                            '—'}
                        </td>
                        <td>
                          <span
                            className={`cfg-badge ${e.actif ? 'ok' : 'muted'}`}
                          >
                            {e.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        {peutAdmin && (
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={toggleEntrepot.isPending}
                              onClick={() =>
                                toggleEntrepot.mutate({
                                  id: e.id,
                                  actif: !e.actif,
                                })
                              }
                            >
                              {e.actif ? 'Désactiver' : 'Activer'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListPanel>
          )}

          {onglet === 'caisses' && (
            <>
              {caissesCentrale.length > 0 && (
                <ListPanel title="Caisse centrale">
                  <table>
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>
                          Type{' '}
                          <InfoTooltip insight={insightTypeCaisseConfig('CENTRALE')} />
                        </th>
                        <th>Solde courant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caissesCentrale.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <code>{c.id.slice(0, 8)}…</code>
                          </td>
                          <td>
                            <span className="cfg-badge accent">CENTRALE</span>{' '}
                            <InfoTooltip insight={insightTypeCaisseConfig(c.type)} />
                          </td>
                          <td className="money">{c.soldeCourant} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ListPanel>
              )}

              <ListPanel
                title="Caisses auxiliaires"
                toolbar={
                  peutAdmin ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setModalCaisse(true)}
                    >
                      <Plus size={14} /> Nouvelle caisse
                    </button>
                  ) : undefined
                }
              >
                {caisses.isLoading && (
                  <LoadingState label="Chargement des caisses..." />
                )}
                {caisses.isError && (
                  <p role="alert">Erreur lors du chargement des caisses.</p>
                )}
                {caissesMagasin.length === 0 && !caisses.isLoading && (
                  <EmptyState
                    title="Aucune caisse magasin"
                    description="Provisionnez une caisse pour chaque magasin actif."
                    action={
                      peutAdmin ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setModalCaisse(true)}
                        >
                          Nouvelle caisse
                        </button>
                      ) : undefined
                    }
                  />
                )}
                {caissesMagasin.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>
                          Type{' '}
                          <InfoTooltip insight={insightTypeCaisseConfig('MAGASIN')} />
                        </th>
                        <th>Boutique</th>
                        <th>Solde courant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caissesMagasin.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <code>{c.id.slice(0, 8)}…</code>
                          </td>
                          <td>
                            <span className="cfg-badge">MAGASIN</span>{' '}
                            <InfoTooltip insight={insightTypeCaisseConfig(c.type)} />
                          </td>
                          <td>
                            {boutiquesList.find((b) => b.id === c.boutiqueId)
                              ?.nom ?? '—'}
                          </td>
                          <td className="money">{c.soldeCourant} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ListPanel>
            </>
          )}
        </div>
      </div>

      {peutAdmin && (
        <>
          <Modal
            open={modalZone}
            onClose={() => setModalZone(false)}
            title="Nouvelle zone"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createZone.mutate();
              }}
            >
              <label htmlFor="nz">Nom de la zone</label>
              <input
                id="nz"
                value={nomZone}
                onChange={(e) => setNomZone(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={createZone.isPending}
              >
                Créer la zone
              </button>
            </form>
          </Modal>

          <Modal
            open={modalBoutique}
            onClose={() => setModalBoutique(false)}
            title="Nouveau magasin"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createBoutique.mutate();
              }}
            >
              <label htmlFor="nb">Nom</label>
              <input
                id="nb"
                value={nomBoutique}
                onChange={(e) => setNomBoutique(e.target.value)}
                required
              />
              <label htmlFor="ab">Adresse</label>
              <input
                id="ab"
                value={adresseBoutique}
                onChange={(e) => setAdresseBoutique(e.target.value)}
                required
              />
              <label htmlFor="zb">Zone</label>
              <select
                id="zb"
                value={zoneId || zones.data?.[0]?.id || ''}
                onChange={(e) => setZoneId(e.target.value)}
                required
              >
                {(zones.data ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nomZone}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="btn-primary"
                disabled={createBoutique.isPending}
              >
                Créer le magasin
              </button>
            </form>
          </Modal>

          <Modal
            open={modalEntrepot}
            onClose={() => setModalEntrepot(false)}
            title="Nouvel entrepôt secondaire"
          >
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                createEntrepot.mutate();
              }}
            >
              <label htmlFor="en">Nom</label>
              <input
                id="en"
                value={entrepotNom}
                onChange={(e) => setEntrepotNom(e.target.value)}
                required
              />
              <label htmlFor="ec">Code</label>
              <input
                id="ec"
                value={entrepotCode}
                onChange={(e) => setEntrepotCode(e.target.value)}
                required
              />
              <label htmlFor="eb">Boutique</label>
              <select
                id="eb"
                value={entrepotBoutiqueId || boutiques.data?.[0]?.id || ''}
                onChange={(e) => setEntrepotBoutiqueId(e.target.value)}
                required
              >
                {(boutiques.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="btn-primary"
                disabled={createEntrepot.isPending}
              >
                Créer l’entrepôt
              </button>
            </form>
          </Modal>

          <Modal
            open={modalCaisse}
            onClose={() => setModalCaisse(false)}
            title="Provisionner une caisse magasin"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCaisse.mutate();
              }}
            >
              <label htmlFor="cb">Boutique</label>
              <select
                id="cb"
                value={caisseBoutiqueId || boutiques.data?.[0]?.id || ''}
                onChange={(e) => setCaisseBoutiqueId(e.target.value)}
                required
              >
                {(boutiques.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="btn-primary"
                disabled={createCaisse.isPending}
              >
                Créer la caisse
              </button>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
