import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  MapPin,
  Plus,
  Search,
  Store,
  Warehouse,
  Wallet,
} from 'lucide-react';
import { RoleLibelle, ROLES_CONFIG_TIROIRS } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { compresserImage } from '../lib/compress-image';
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
} from '../lib/insights/entreprise';
import type {
  BoutiqueDto,
  CaisseDto,
  MouvementCaisseDto,
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

function tiroirsBoutique(boutiqueId: string, caisses: CaisseDto[]) {
  return caisses
    .filter((c) => c.type === 'TIROIR' && c.boutiqueId === boutiqueId)
    .sort((a, b) => (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0));
}

function prochainCodeTiroir(boutiqueId: string, caisses: CaisseDto[]): string {
  const existants = tiroirsBoutique(boutiqueId, caisses).map((t) => t.code ?? '');
  for (let i = 1; i <= 8; i += 1) {
    const code = `T${String(i).padStart(2, '0')}`;
    if (!existants.includes(code)) return code;
  }
  return `T${String(existants.length + 1).padStart(2, '0')}`;
}

function formatSolde(valeur: string | number): string {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur;
  if (!Number.isFinite(n)) return String(valeur);
  return Math.round(n).toLocaleString('fr-FR');
}

/** Solde recalculé depuis le grand livre (jamais soldeCourant stocké). */
function SoldeCaisseCell({ caisseId }: { caisseId: string }) {
  const solde = useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () =>
      apiFetch<{ caisseId: string; solde: string }>(
        `/caisses/${caisseId}/solde`,
      ),
  });
  if (solde.isLoading) return <span className="money">…</span>;
  if (solde.isError) return <span className="money">—</span>;
  return (
    <span className="money">{formatSolde(solde.data?.solde ?? 0)} FCFA</span>
  );
}

function libelleCaisse(c: CaisseDto): string {
  if (c.code && c.libelle) return `${c.code} — ${c.libelle}`;
  if (c.code) return c.code;
  if (c.libelle) return c.libelle;
  if (c.type === 'CENTRALE') return 'Caisse centrale';
  if (c.type === 'MAGASIN') return 'Caisse magasin';
  if (c.type === 'TIROIR') return 'Tiroir POS';
  return c.id.slice(0, 8);
}

function libelleTypeCaisse(type: CaisseDto['type']): string {
  if (type === 'CENTRALE') return 'Centrale';
  if (type === 'MAGASIN') return 'Magasin';
  if (type === 'TIROIR') return 'Tiroir';
  return type;
}

export function EntreprisePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);
  const peutConfigTiroirs =
    user !== null && ROLES_CONFIG_TIROIRS.includes(user.role);

  const [onglet, setOnglet] = useState<Onglet>('overview');
  const [modalZone, setModalZone] = useState(false);
  const [zoneEditee, setZoneEditee] = useState<ZoneDto | null>(null);
  const [nomZoneEdit, setNomZoneEdit] = useState('');
  const [createZoneErr, setCreateZoneErr] = useState<string | null>(null);
  const [editSociete, setEditSociete] = useState(false);
  const formSocieteRef = useRef<HTMLFormElement | null>(null);
  const [modalBoutique, setModalBoutique] = useState(false);
  const [boutiqueEditee, setBoutiqueEditee] = useState<BoutiqueDto | null>(null);
  const [filtreZoneMagasin, setFiltreZoneMagasin] = useState('');
  const [createBoutiqueErr, setCreateBoutiqueErr] = useState<string | null>(null);
  const [modalEntrepot, setModalEntrepot] = useState(false);
  const [entrepotEdite, setEntrepotEdite] = useState<EntrepotDto | null>(null);
  const [modalCaisse, setModalCaisse] = useState(false);
  const [caisseDetaillee, setCaisseDetaillee] = useState<CaisseDto | null>(null);
  const [createCaisseErr, setCreateCaisseErr] = useState<string | null>(null);
  const [searchMagasin, setSearchMagasin] = useState('');
  const [filtreEntrepotBoutique, setFiltreEntrepotBoutique] = useState('');
  const autoCompleteLance = useRef(false);

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
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [delaiVersementHeures, setDelaiVersementHeures] = useState('24');
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
    setDelaiVersementHeures(String(societe.data.delaiVersementHeures));
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
          logoUrl: logoUrl || null,
          delaiVersementHeures: delaiVersementHeures
            ? Number(delaiVersementHeures)
            : undefined,
        }),
      }),
    onSuccess: () => {
      setMsg('Société mise à jour.');
      setFormHydrated(false);
      void queryClient.invalidateQueries({ queryKey: ['entreprise'] });
    },
    onError: () => setMsg('Échec de la mise à jour.'),
  });

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoErr(null);
    try {
      setLogoUrl(await compresserImage(file, 320));
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : 'Image refusée.');
    }
  }

  const [nomZone, setNomZone] = useState('');
  const createZone = useMutation({
    mutationFn: () =>
      apiFetch<ZoneDto>('/zones', {
        method: 'POST',
        body: JSON.stringify({ nomZone: nomZone.trim() }),
      }),
    onSuccess: () => {
      setNomZone('');
      setCreateZoneErr(null);
      setModalZone(false);
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
    onError: () => setCreateZoneErr('Échec de la création de la zone.'),
  });

  const updateZone = useMutation({
    mutationFn: () =>
      apiFetch<ZoneDto>(`/zones/${zoneEditee!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nomZone: nomZoneEdit.trim() }),
      }),
    onSuccess: () => {
      setZoneEditee(null);
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const [nomBoutique, setNomBoutique] = useState('');
  const [adresseBoutique, setAdresseBoutique] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [nombreTiroirs, setNombreTiroirs] = useState(1);
  const createBoutique = useMutation({
    mutationFn: () =>
      apiFetch<BoutiqueDto>('/boutiques', {
        method: 'POST',
        body: JSON.stringify({
          nom: nomBoutique.trim(),
          adresse: adresseBoutique.trim(),
          zoneId: zoneId || zones.data?.[0]?.id || '',
          nombreTiroirs,
        }),
      }),
    onSuccess: () => {
      setNomBoutique('');
      setAdresseBoutique('');
      setNombreTiroirs(1);
      setCreateBoutiqueErr(null);
      setModalBoutique(false);
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
      setOnglet('magasins');
    },
    onError: () =>
      setCreateBoutiqueErr(
        'Échec de la création — vérifiez le nom, l’adresse et la zone.',
      ),
  });

  const completerPoste = useMutation({
    mutationFn: (payload: { id: string; nombreTiroirs?: number }) =>
      apiFetch<BoutiqueDto>(`/boutiques/${payload.id}/completer-poste`, {
        method: 'POST',
        body: JSON.stringify({
          nombreTiroirs: payload.nombreTiroirs ?? 1,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
  });

  const completerTous = useMutation({
    mutationFn: () =>
      apiFetch<{ magasinsTraites: number }>('/boutiques/completer-tous', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () => {
      autoCompleteLance.current = false;
    },
  });

  const ajouterTiroir = useMutation({
    mutationFn: (payload: { boutiqueId: string; code: string }) =>
      apiFetch<CaisseDto>('/caisses/tiroirs', {
        method: 'POST',
        body: JSON.stringify({
          boutiqueId: payload.boutiqueId,
          code: payload.code,
          libelle: `Tiroir ${Number(payload.code.replace(/\D/g, '')) || 1}`,
          ordreAffichage: Number(payload.code.replace(/\D/g, '')) || 0,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
  });

  const updateBoutique = useMutation({
    mutationFn: (payload: {
      id: string;
      nom: string;
      adresse: string;
      code: string;
      actif: boolean;
    }) =>
      apiFetch<BoutiqueDto>(`/boutiques/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nom: payload.nom.trim(),
          adresse: payload.adresse.trim(),
          code: payload.code.trim() || undefined,
          actif: payload.actif,
        }),
      }),
    onSuccess: () => {
      setBoutiqueEditee(null);
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

  const updateEntrepot = useMutation({
    mutationFn: (payload: { id: string; nom: string; actif: boolean }) =>
      apiFetch<EntrepotDto>(`/entrepots/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nom: payload.nom.trim(), actif: payload.actif }),
      }),
    onSuccess: () => {
      setEntrepotEdite(null);
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const [caisseBoutiqueId, setCaisseBoutiqueId] = useState('');
  const createCaisse = useMutation({
    mutationFn: () => {
      const bid =
        caisseBoutiqueId ||
        (boutiques.data ?? []).find(
          (b) =>
            b.actif &&
            !(caisses.data ?? []).some(
              (c) => c.type === 'MAGASIN' && c.boutiqueId === b.id,
            ),
        )?.id ||
        '';
      return apiFetch<CaisseDto>('/caisses', {
        method: 'POST',
        body: JSON.stringify({
          type: 'MAGASIN',
          boutiqueId: bid,
        }),
      });
    },
    onSuccess: () => {
      setCreateCaisseErr(null);
      setModalCaisse(false);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () =>
      setCreateCaisseErr(
        'Échec — le magasin a peut-être déjà une caisse, ou la boutique est invalide.',
      ),
  });

  const mouvementsCaisse = useQuery({
    queryKey: ['caisse-mouvements', caisseDetaillee?.id],
    queryFn: () =>
      apiFetch<MouvementCaisseDto[]>(
        `/caisses/${caisseDetaillee!.id}/mouvements`,
      ),
    enabled: caisseDetaillee !== null,
  });

  const soldeCaisseDetail = useQuery({
    queryKey: ['caisses', caisseDetaillee?.id, 'solde'],
    queryFn: () =>
      apiFetch<{ caisseId: string; solde: string }>(
        `/caisses/${caisseDetaillee!.id}/solde`,
      ),
    enabled: caisseDetaillee !== null,
  });

  const zonesList = zones.data ?? [];
  const boutiquesList = boutiques.data ?? [];
  const entrepotsList = entrepots.data ?? [];
  const caissesList = caisses.data ?? [];

  const magasinsActifs = boutiquesList.filter((b) => b.actif);
  const magasinsInactifs = boutiquesList.filter((b) => !b.actif);
  const caissesCentrale = caissesList.filter((c) => c.type === 'CENTRALE');
  const caissesMagasin = caissesList.filter((c) => c.type === 'MAGASIN');
  const caissesTiroir = caissesList.filter((c) => c.type === 'TIROIR');

  const boutiquesSansCaisse = boutiquesList.filter(
    (b) => b.actif && !boutiqueHasMagasin(b.id, caissesList),
  );
  const boutiquesSansPrincipal = boutiquesList.filter(
    (b) => b.actif && !boutiqueHasPrincipal(b.id, entrepotsList),
  );
  const boutiquesSansTiroir = boutiquesList.filter(
    (b) => b.actif && tiroirsBoutique(b.id, caissesList).length === 0,
  );
  const magasinsIncomplets = new Set([
    ...boutiquesSansCaisse.map((b) => b.id),
    ...boutiquesSansPrincipal.map((b) => b.id),
    ...boutiquesSansTiroir.map((b) => b.id),
  ]).size;

  useEffect(() => {
    if (!peutAdmin) return;
    if (!boutiques.isSuccess || !entrepots.isSuccess || !caisses.isSuccess) {
      return;
    }
    if (magasinsIncomplets === 0) return;
    if (autoCompleteLance.current || completerTous.isPending) return;
    autoCompleteLance.current = true;
    completerTous.mutate();
  }, [
    peutAdmin,
    boutiques.isSuccess,
    entrepots.isSuccess,
    caisses.isSuccess,
    magasinsIncomplets,
    completerTous,
  ]);

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
    if (magasinsIncomplets > 0) {
      alerts.push({
        id: 'incomplets',
        label: peutAdmin
          ? `${magasinsIncomplets} magasin(s) : entrepôt, caisse et tiroir se créent automatiquement`
          : `${magasinsIncomplets} magasin(s) sans poste complet`,
        severite: 'warning',
        tab: 'magasins',
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
    magasinsIncomplets,
    peutAdmin,
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
      ok: magasinsIncomplets === 0 && magasinsActifs.length > 0,
      label: 'Chaque magasin a son poste (entrepôt + caisse + tiroir)',
      tab: 'magasins' as Onglet,
    },
  ];

  const scoreCompleteness = Math.round(
    (checklistItems.filter((i) => i.ok).length / checklistItems.length) * 100,
  );

  const magasinsFiltres = boutiquesList.filter((b) => {
    if (filtreZoneMagasin && b.zoneId !== filtreZoneMagasin) return false;
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
        subtitle="Un magasin = entrepôt + caisse + tiroir, créés ensemble"
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
                        <div
                          className="cfg-identity cfg-identity-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setOnglet('societe');
                            setEditSociete(peutAdmin);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOnglet('societe');
                              setEditSociete(peutAdmin);
                            }
                          }}
                        >
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
                            <p className="lead">
                              {peutAdmin
                                ? 'Cliquer pour modifier la fiche société'
                                : 'Cliquer pour voir la fiche société'}
                            </p>
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
                  <div
                    className={`cfg-identity cfg-identity-hero${peutAdmin ? ' cfg-identity-clickable' : ''}`}
                    role={peutAdmin ? 'button' : undefined}
                    tabIndex={peutAdmin ? 0 : undefined}
                    onClick={() => {
                      if (!peutAdmin) return;
                      setEditSociete(true);
                      window.setTimeout(() => formSocieteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }}
                    onKeyDown={(e) => {
                      if (!peutAdmin) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditSociete(true);
                      }
                    }}
                  >
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
                        <span className="cfg-badge muted">
                          Versement &lt; {societe.data.delaiVersementHeures} h
                        </span>
                      </div>
                      {peutAdmin && (
                        <p className="lead" style={{ marginTop: 8 }}>
                          {editSociete
                            ? 'Modification en cours ci-dessous'
                            : 'Cliquer pour éditer'}
                        </p>
                      )}
                    </div>
                  </div>

                  {peutAdmin && editSociete && (
                    <ListPanel title="Modifier la fiche société">
                      <form
                        ref={formSocieteRef}
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
                              autoFocus
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
                            <label htmlFor="logo">Logo</label>
                            <div className="fiche-photo-field">
                              <div className="fiche-photo-preview" aria-hidden>
                                {logoUrl ? (
                                  <img src={logoUrl} alt="" />
                                ) : (
                                  <ImageIcon size={28} />
                                )}
                              </div>
                              <div>
                                <input
                                  id="logo"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) =>
                                    void onLogo(e.target.files?.[0])
                                  }
                                />
                                <p className="lead">
                                  JPEG / PNG / WebP — import fichier, pas d’URL.
                                </p>
                                {logoUrl ? (
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    onClick={() => setLogoUrl('')}
                                  >
                                    Retirer le logo
                                  </button>
                                ) : null}
                                {logoErr ? (
                                  <p role="alert">{logoErr}</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="delai-versement">
                              Délai versement avant alerte (heures)
                            </label>
                            <input
                              id="delai-versement"
                              type="number"
                              min={1}
                              step={1}
                              value={delaiVersementHeures}
                              onChange={(e) =>
                                setDelaiVersementHeures(e.target.value)
                              }
                              required
                            />
                          </div>
                        </div>
                        <div className="cfg-form-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditSociete(false)}
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={patchSociete.isPending}
                          >
                            {patchSociete.isPending ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                          {msg && <p className="cfg-form-msg">{msg}</p>}
                        </div>
                      </form>
                    </ListPanel>
                  )}

                  {peutAdmin && !editSociete && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setEditSociete(true)}
                    >
                      Modifier la fiche
                    </button>
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
                    onClick={() => {
                      setCreateZoneErr(null);
                      setNomZone('');
                      setModalZone(true);
                    }}
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
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th>Magasins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.data.map((z) => {
                        const magasinsZone = boutiquesList.filter(
                          (b) => b.zoneId === z.id,
                        );
                        return (
                          <tr
                            key={z.id}
                            className="produit-row"
                            tabIndex={0}
                            role="button"
                            aria-label={`Ouvrir ${z.nomZone}`}
                            onClick={() => {
                              setZoneEditee(z);
                              setNomZoneEdit(z.nomZone);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setZoneEditee(z);
                                setNomZoneEdit(z.nomZone);
                              }
                            }}
                          >
                            <td>
                              <strong>{z.nomZone}</strong>
                            </td>
                            <td>
                              <span className="cfg-badge">{magasinsZone.length}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
                      placeholder="Rechercher un magasin…"
                      value={searchMagasin}
                      onChange={(e) => setSearchMagasin(e.target.value)}
                      aria-label="Rechercher un magasin"
                    />
                  </label>
                  {peutAdmin && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setCreateBoutiqueErr(null);
                        setNomBoutique('');
                        setAdresseBoutique('');
                        setZoneId(zones.data?.[0]?.id ?? '');
                        setNombreTiroirs(1);
                        setModalBoutique(true);
                      }}
                      disabled={(zones.data?.length ?? 0) === 0}
                      title={
                        (zones.data?.length ?? 0) === 0
                          ? 'Créez d’abord une zone'
                          : undefined
                      }
                    >
                      <Plus size={14} /> Nouveau magasin
                    </button>
                  )}
                </div>
              }
            >
              {zonesList.length > 0 && (
                <div className="cfg-chip-row cfg-filter-chips">
                  <button
                    type="button"
                    className={`cfg-badge${filtreZoneMagasin === '' ? ' ok' : ' muted'}`}
                    onClick={() => setFiltreZoneMagasin('')}
                  >
                    Toutes ({boutiquesList.length})
                  </button>
                  {zonesList.map((z) => {
                    const n = boutiquesList.filter((b) => b.zoneId === z.id).length;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        className={`cfg-badge${filtreZoneMagasin === z.id ? ' ok' : ' muted'}`}
                        onClick={() => setFiltreZoneMagasin(z.id)}
                      >
                        {z.nomZone} ({n})
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="cfg-mag-stats">
                <span>
                  <strong>{magasinsActifs.length}</strong> actif(s)
                </span>
                {magasinsIncomplets > 0 && (
                  <span>
                    <strong>{magasinsIncomplets}</strong>
                    {completerTous.isPending
                      ? ' poste(s) en cours…'
                      : ' à compléter'}
                  </span>
                )}
              </div>

              {boutiques.isLoading && (
                <LoadingState label="Chargement des magasins..." />
              )}
              {boutiques.isError && (
                <p role="alert">Erreur lors du chargement des magasins.</p>
              )}
              {(zones.data?.length ?? 0) === 0 && peutAdmin && (
                <EmptyState
                  title="Aucune zone"
                  description="Créez une zone avant d’ajouter un magasin."
                  action={
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setOnglet('zones');
                        setModalZone(true);
                      }}
                    >
                      Créer une zone
                    </button>
                  }
                />
              )}
              {boutiques.data && boutiques.data.length === 0 && (zones.data?.length ?? 0) > 0 && (
                <EmptyState
                  title="Aucun magasin"
                  description="Ajoutez le premier magasin. Entrepôt, caisse magasin et tiroir POS sont créés automatiquement."
                  action={
                    peutAdmin ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setCreateBoutiqueErr(null);
                          setZoneId(zones.data?.[0]?.id ?? '');
                          setNombreTiroirs(1);
                        setModalBoutique(true);
                        }}
                      >
                        <Plus size={14} /> Nouveau magasin
                      </button>
                    ) : undefined
                  }
                />
              )}
              {boutiques.data && boutiques.data.length > 0 && magasinsFiltres.length === 0 && (
                <EmptyState
                  title="Aucun résultat"
                  description="Aucun magasin ne correspond aux filtres."
                />
              )}
              {magasinsFiltres.length > 0 && (
                <div className="cfg-poste-grid">
                  {magasinsFiltres.map((b) => {
                    const hasCaisse = boutiqueHasMagasin(b.id, caissesList);
                    const hasPrincipal = boutiqueHasPrincipal(
                      b.id,
                      entrepotsList,
                    );
                    const tiroirs = tiroirsBoutique(b.id, caissesList);
                    const hasTiroir = tiroirs.length > 0;
                    const incomplet =
                      !hasCaisse || !hasPrincipal || !hasTiroir;
                    const zoneNom =
                      zonesList.find((z) => z.id === b.zoneId)?.nomZone ??
                      '—';
                    const entrepot = entrepotsList.find(
                      (e) =>
                        e.boutiqueId === b.id &&
                        e.type === 'PRINCIPAL' &&
                        e.actif,
                    );
                    const caisseMag = caissesList.find(
                      (c) => c.type === 'MAGASIN' && c.boutiqueId === b.id,
                    );
                    return (
                      <article
                        key={b.id}
                        className={`cfg-poste-card${incomplet ? ' incomplet' : ''}`}
                      >
                        <button
                          type="button"
                          className="cfg-poste-card-main"
                          onClick={() => setBoutiqueEditee({ ...b })}
                        >
                          <header>
                            <strong>{b.nom}</strong>
                            <span
                              className={`cfg-badge ${b.actif ? 'ok' : 'muted'}`}
                            >
                              {b.actif ? 'Actif' : 'Inactif'}
                            </span>
                          </header>
                          <p className="lead">
                            {zoneNom}
                            {b.code ? ` · ${b.code}` : ''}
                            {b.adresse ? ` · ${b.adresse}` : ''}
                          </p>
                        </button>
                        <ul className="cfg-poste-stack">
                          <li className={hasPrincipal ? 'ok' : 'manque'}>
                            <Warehouse size={14} />
                            {hasPrincipal
                              ? entrepot?.nom ?? 'Entrepôt PRINCIPAL'
                              : 'Entrepôt manquant'}
                          </li>
                          <li className={hasCaisse ? 'ok' : 'manque'}>
                            <Wallet size={14} />
                            {hasCaisse
                              ? caisseMag?.libelle ?? 'Caisse magasin'
                              : 'Caisse magasin manquante'}
                          </li>
                          <li className={hasTiroir ? 'ok' : 'manque'}>
                            <Store size={14} />
                            {hasTiroir
                              ? tiroirs
                                  .map((t) => t.code ?? t.libelle)
                                  .join(' · ')
                              : 'Aucun tiroir POS'}
                          </li>
                        </ul>
                        <div className="cfg-poste-actions">
                          {peutAdmin && incomplet && (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() =>
                                completerPoste.mutate({ id: b.id })
                              }
                              disabled={
                                completerPoste.isPending ||
                                completerTous.isPending
                              }
                            >
                              Compléter le poste
                            </button>
                          )}
                          {peutConfigTiroirs &&
                            hasCaisse &&
                            tiroirs.length < 8 && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  ajouterTiroir.mutate({
                                    boutiqueId: b.id,
                                    code: prochainCodeTiroir(
                                      b.id,
                                      caissesList,
                                    ),
                                  })
                                }
                                disabled={ajouterTiroir.isPending}
                              >
                                <Plus size={14} /> Tiroir
                              </button>
                            )}
                          <InfoTooltip
                            insight={insightSanteMagasin(
                              hasCaisse,
                              hasPrincipal,
                              hasTiroir,
                            )}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
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
                      onClick={() => {
                        setEntrepotBoutiqueId(boutiquesList[0]?.id ?? '');
                        setModalEntrepot(true);
                      }}
                      disabled={boutiquesList.length === 0}
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
                  description="Les entrepôts PRINCIPAL sont créés avec chaque magasin."
                  action={
                    peutAdmin ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setOnglet('magasins')}
                      >
                        Aller aux magasins
                      </button>
                    ) : undefined
                  }
                />
              )}
              {entrepotsFiltres.length > 0 && (
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Entrepôt</th>
                        <th>Type</th>
                        <th>Boutique</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrepotsFiltres.map((e) => (
                        <tr
                          key={e.id}
                          className="produit-row"
                          tabIndex={0}
                          role="button"
                          aria-label={`Ouvrir ${e.nom}`}
                          onClick={() => setEntrepotEdite({ ...e })}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              setEntrepotEdite({ ...e });
                            }
                          }}
                        >
                          <td>
                            <strong>{e.nom}</strong>
                            <br />
                            <code className="cfg-code">{e.code}</code>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ListPanel>
          )}

          {onglet === 'caisses' && (
            <>
              <div className="cfg-mag-stats">
                <span>
                  <strong>{caissesCentrale.length}</strong> centrale
                </span>
                <span>
                  <strong>{caissesMagasin.length}</strong> magasin
                </span>
                <span>
                  <strong>{caissesTiroir.length}</strong> tiroir POS
                </span>
                <span>
                  <strong>{boutiquesSansCaisse.length}</strong> magasin(s) sans
                  caisse
                </span>
              </div>

              {caisses.isLoading && (
                <LoadingState label="Chargement des caisses..." />
              )}
              {caisses.isError && (
                <p role="alert">Erreur lors du chargement des caisses.</p>
              )}

              {caissesCentrale.length > 0 && (
                <ListPanel title="Caisse centrale">
                  <div className="clients-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Caisse</th>
                          <th>
                            Type{' '}
                            <InfoTooltip
                              insight={insightTypeCaisseConfig('CENTRALE')}
                            />
                          </th>
                          <th>Solde courant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caissesCentrale.map((c) => (
                          <tr
                            key={c.id}
                            className="produit-row"
                            tabIndex={0}
                            role="button"
                            aria-label={`Ouvrir ${libelleCaisse(c)}`}
                            onClick={() => setCaisseDetaillee(c)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setCaisseDetaillee(c);
                              }
                            }}
                          >
                            <td>
                              <strong>{libelleCaisse(c)}</strong>
                              <br />
                              <span className="lead">{c.id.slice(0, 8)}…</span>
                            </td>
                            <td>
                              <span className="cfg-badge accent">
                                {libelleTypeCaisse(c.type)}
                              </span>
                            </td>
                            <td>
                              <SoldeCaisseCell caisseId={c.id} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ListPanel>
              )}

              <ListPanel
                title="Caisses magasin"
                toolbar={
                  peutAdmin && magasinsIncomplets > 0 ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => completerTous.mutate()}
                      disabled={completerTous.isPending}
                    >
                      {completerTous.isPending
                        ? 'Complétion…'
                        : 'Compléter les postes manquants'}
                    </button>
                  ) : undefined
                }
              >
                {caissesMagasin.length === 0 && !caisses.isLoading && (
                  <EmptyState
                    title="Aucune caisse magasin"
                    description="Les caisses magasin se créent avec chaque magasin. Les magasins incomplets sont complétés automatiquement."
                    action={
                      peutAdmin && magasinsIncomplets > 0 ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => completerTous.mutate()}
                          disabled={completerTous.isPending}
                        >
                          Compléter les postes
                        </button>
                      ) : undefined
                    }
                  />
                )}
                {caissesMagasin.length > 0 && (
                  <div className="clients-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Caisse</th>
                          <th>Boutique</th>
                          <th>
                            Type{' '}
                            <InfoTooltip
                              insight={insightTypeCaisseConfig('MAGASIN')}
                            />
                          </th>
                          <th>Solde courant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caissesMagasin.map((c) => {
                          const boutiqueNom =
                            boutiquesList.find((b) => b.id === c.boutiqueId)
                              ?.nom ?? '—';
                          return (
                            <tr
                              key={c.id}
                              className="produit-row"
                              tabIndex={0}
                              role="button"
                              aria-label={`Ouvrir ${libelleCaisse(c)}`}
                              onClick={() => setCaisseDetaillee(c)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setCaisseDetaillee(c);
                                }
                              }}
                            >
                              <td>
                                <strong>{libelleCaisse(c)}</strong>
                                <br />
                                <span className="lead">{c.id.slice(0, 8)}…</span>
                              </td>
                              <td>{boutiqueNom}</td>
                              <td>
                                <span className="cfg-badge">
                                  {libelleTypeCaisse(c.type)}
                                </span>
                              </td>
                              <td>
                                <SoldeCaisseCell caisseId={c.id} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ListPanel>

              {caissesTiroir.length > 0 && (
                <ListPanel title="Tiroirs POS">
                  <div className="clients-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tiroir</th>
                          <th>Boutique</th>
                          <th>Statut</th>
                          <th>Solde courant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caissesTiroir.map((c) => (
                          <tr
                            key={c.id}
                            className="produit-row"
                            tabIndex={0}
                            role="button"
                            aria-label={`Ouvrir ${libelleCaisse(c)}`}
                            onClick={() => setCaisseDetaillee(c)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setCaisseDetaillee(c);
                              }
                            }}
                          >
                            <td>
                              <strong>{libelleCaisse(c)}</strong>
                            </td>
                            <td>
                              {boutiquesList.find((b) => b.id === c.boutiqueId)
                                ?.nom ?? '—'}
                            </td>
                            <td>
                              <span
                                className={`cfg-badge ${c.actif === false ? 'muted' : 'ok'}`}
                              >
                                {c.actif === false ? 'Inactif' : 'Actif'}
                              </span>
                            </td>
                            <td>
                              <SoldeCaisseCell caisseId={c.id} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ListPanel>
              )}
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
              className="cfg-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!nomZone.trim()) {
                  setCreateZoneErr('Indiquez un nom de zone.');
                  return;
                }
                createZone.mutate();
              }}
            >
              <div>
                <label htmlFor="nz">Nom de la zone</label>
                <input
                  id="nz"
                  value={nomZone}
                  onChange={(e) => setNomZone(e.target.value)}
                  placeholder="ex. Zone Dakar Centre"
                  required
                  autoFocus
                />
              </div>
              <div className="cfg-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalZone(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createZone.isPending || !nomZone.trim()}
                >
                  {createZone.isPending ? 'Création…' : 'Créer la zone'}
                </button>
              </div>
              {createZoneErr && <p role="alert">{createZoneErr}</p>}
            </form>
          </Modal>

          <Modal
            open={zoneEditee !== null}
            onClose={() => setZoneEditee(null)}
            title={zoneEditee ? `Zone — ${zoneEditee.nomZone}` : 'Zone'}
          >
            {zoneEditee && (
              <div className="cfg-form">
                {peutAdmin ? (
                  <div>
                    <label htmlFor="ze-nom">Nom</label>
                    <input
                      id="ze-nom"
                      value={nomZoneEdit}
                      onChange={(e) => setNomZoneEdit(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <h3>{zoneEditee.nomZone}</h3>
                )}
                <h3 className="cfg-section-title">Magasins rattachés</h3>
                {boutiquesList.filter((b) => b.zoneId === zoneEditee.id).length ===
                0 ? (
                  <EmptyState
                    title="Aucun magasin"
                    description="Aucun magasin dans cette zone."
                  />
                ) : (
                  <ul className="cfg-checklist">
                    {boutiquesList
                      .filter((b) => b.zoneId === zoneEditee.id)
                      .map((b) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            className="cfg-check-item ok"
                            onClick={() => {
                              setFiltreZoneMagasin(zoneEditee.id);
                              setZoneEditee(null);
                              setOnglet('magasins');
                            }}
                          >
                            <Store size={15} />
                            {b.nom}
                            {!b.actif ? ' (inactif)' : ''}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="cfg-form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setFiltreZoneMagasin(zoneEditee.id);
                      setZoneEditee(null);
                      setOnglet('magasins');
                    }}
                  >
                    Voir les magasins
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setZoneEditee(null)}
                  >
                    Fermer
                  </button>
                  {peutAdmin && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={updateZone.isPending || !nomZoneEdit.trim()}
                      onClick={() => updateZone.mutate()}
                    >
                      {updateZone.isPending ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Modal>

          <Modal
            open={entrepotEdite !== null}
            onClose={() => setEntrepotEdite(null)}
            title={
              entrepotEdite
                ? `${entrepotEdite.nom} — détail`
                : 'Entrepôt'
            }
          >
            {entrepotEdite && (
              <form
                className="cfg-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!peutAdmin) return;
                  updateEntrepot.mutate({
                    id: entrepotEdite.id,
                    nom: entrepotEdite.nom,
                    actif: entrepotEdite.actif,
                  });
                }}
              >
                <div className="cfg-mag-detail-meta">
                  <span
                    className={`cfg-badge ${
                      entrepotEdite.type === 'PRINCIPAL' ? 'accent' : 'muted'
                    }`}
                  >
                    {entrepotEdite.type}
                  </span>
                  <span className="cfg-badge muted">
                    {boutiquesList.find((b) => b.id === entrepotEdite.boutiqueId)
                      ?.nom ?? '—'}
                  </span>
                  <span className="cfg-badge muted">
                    Code {entrepotEdite.code}
                  </span>
                </div>
                <div>
                  <label htmlFor="ee-nom">Nom</label>
                  <input
                    id="ee-nom"
                    value={entrepotEdite.nom}
                    disabled={!peutAdmin}
                    onChange={(e) =>
                      setEntrepotEdite({
                        ...entrepotEdite,
                        nom: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                {peutAdmin && (
                  <label className="cfg-check-inline">
                    <input
                      type="checkbox"
                      checked={entrepotEdite.actif}
                      onChange={(e) =>
                        setEntrepotEdite({
                          ...entrepotEdite,
                          actif: e.target.checked,
                        })
                      }
                    />
                    Entrepôt actif
                  </label>
                )}
                <div className="cfg-form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEntrepotEdite(null)}
                  >
                    Fermer
                  </button>
                  {peutAdmin && (
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={updateEntrepot.isPending}
                    >
                      {updateEntrepot.isPending
                        ? 'Enregistrement…'
                        : 'Enregistrer'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </Modal>

          <Modal
            open={modalBoutique}
            onClose={() => setModalBoutique(false)}
            title="Nouveau magasin"
          >
            <form
              className="cfg-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!zoneId && !zones.data?.[0]?.id) {
                  setCreateBoutiqueErr('Choisissez une zone.');
                  return;
                }
                createBoutique.mutate();
              }}
            >
              <p className="lead">
                Nom, adresse, zone — c’est tout. Entrepôt PRINCIPAL, caisse
                magasin et tiroir POS sont créés et liés automatiquement.
              </p>
              <div>
                <label htmlFor="nb">Nom du magasin</label>
                <input
                  id="nb"
                  value={nomBoutique}
                  onChange={(e) => setNomBoutique(e.target.value)}
                  placeholder="ex. Boutique Plateau"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="ab">Adresse</label>
                <input
                  id="ab"
                  value={adresseBoutique}
                  onChange={(e) => setAdresseBoutique(e.target.value)}
                  placeholder="Adresse complète"
                  required
                />
              </div>
              <div>
                <label htmlFor="zb">Zone</label>
                <select
                  id="zb"
                  value={zoneId || zones.data?.[0]?.id || ''}
                  onChange={(e) => setZoneId(e.target.value)}
                  required
                >
                  {(zones.data ?? []).length === 0 && (
                    <option value="">Aucune zone — créez-en une</option>
                  )}
                  {(zones.data ?? []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.nomZone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="nt">Tiroirs POS</label>
                <div className="cfg-qty-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={nombreTiroirs <= 1}
                    onClick={() => setNombreTiroirs((n) => Math.max(1, n - 1))}
                    aria-label="Retirer un tiroir"
                  >
                    −
                  </button>
                  <strong id="nt">{nombreTiroirs}</strong>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={nombreTiroirs >= 8}
                    onClick={() => setNombreTiroirs((n) => Math.min(8, n + 1))}
                    aria-label="Ajouter un tiroir"
                  >
                    +
                  </button>
                  <span className="lead">créé(s) avec le magasin</span>
                </div>
              </div>
              <div className="cfg-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalBoutique(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    createBoutique.isPending || (zones.data?.length ?? 0) === 0
                  }
                >
                  {createBoutique.isPending ? 'Création…' : 'Créer le magasin'}
                </button>
              </div>
              {createBoutiqueErr && <p role="alert">{createBoutiqueErr}</p>}
            </form>
          </Modal>

          <Modal
            open={boutiqueEditee !== null}
            onClose={() => setBoutiqueEditee(null)}
            title={
              boutiqueEditee
                ? `${boutiqueEditee.nom}${peutAdmin ? ' — modifier' : ''}`
                : 'Magasin'
            }
          >
            {boutiqueEditee && (
              <form
                className="cfg-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!peutAdmin) return;
                  updateBoutique.mutate({
                    id: boutiqueEditee.id,
                    nom: boutiqueEditee.nom,
                    adresse: boutiqueEditee.adresse,
                    code: boutiqueEditee.code ?? '',
                    actif: boutiqueEditee.actif,
                  });
                }}
              >
                <div className="cfg-mag-detail-meta">
                  <span className="cfg-badge muted">
                    Zone{' '}
                    {zonesList.find((z) => z.id === boutiqueEditee.zoneId)
                      ?.nomZone ?? '—'}
                  </span>
                  <span
                    className={`cfg-badge ${
                      boutiqueHasMagasin(boutiqueEditee.id, caissesList)
                        ? 'ok'
                        : 'warn'
                    }`}
                  >
                    {boutiqueHasMagasin(boutiqueEditee.id, caissesList)
                      ? 'Caisse magasin'
                      : 'Sans caisse'}
                  </span>
                  <span
                    className={`cfg-badge ${
                      boutiqueHasPrincipal(boutiqueEditee.id, entrepotsList)
                        ? 'ok'
                        : 'warn'
                    }`}
                  >
                    {boutiqueHasPrincipal(boutiqueEditee.id, entrepotsList)
                      ? 'Entrepôt PRINCIPAL'
                      : 'Sans PRINCIPAL'}
                  </span>
                  <span
                    className={`cfg-badge ${
                      tiroirsBoutique(boutiqueEditee.id, caissesList).length > 0
                        ? 'ok'
                        : 'warn'
                    }`}
                  >
                    {tiroirsBoutique(boutiqueEditee.id, caissesList).length > 0
                      ? `${tiroirsBoutique(boutiqueEditee.id, caissesList).length} tiroir(s)`
                      : 'Sans tiroir'}
                  </span>
                </div>
                {peutAdmin &&
                  (!boutiqueHasMagasin(boutiqueEditee.id, caissesList) ||
                    !boutiqueHasPrincipal(boutiqueEditee.id, entrepotsList) ||
                    tiroirsBoutique(boutiqueEditee.id, caissesList).length ===
                      0) && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() =>
                        completerPoste.mutate({ id: boutiqueEditee.id })
                      }
                      disabled={completerPoste.isPending}
                    >
                      {completerPoste.isPending
                        ? 'Préparation…'
                        : 'Compléter le poste (entrepôt + caisse + tiroir)'}
                    </button>
                  )}
                <div>
                  <p className="cfg-section-label">Tiroirs POS</p>
                  <div className="cfg-chip-row">
                    {tiroirsBoutique(boutiqueEditee.id, caissesList).length ===
                    0 ? (
                      <span className="lead">Aucun tiroir — le POS ne peut pas ouvrir.</span>
                    ) : (
                      tiroirsBoutique(boutiqueEditee.id, caissesList).map((t) => (
                        <span
                          key={t.id}
                          className={`cfg-badge ${t.actif === false ? 'muted' : 'ok'}`}
                        >
                          {t.code} {t.libelle}
                          {t.actif === false ? ' (off)' : ''}
                        </span>
                      ))
                    )}
                  </div>
                  {peutConfigTiroirs &&
                    tiroirsBoutique(boutiqueEditee.id, caissesList).length <
                      8 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginTop: 8 }}
                        onClick={() =>
                          ajouterTiroir.mutate({
                            boutiqueId: boutiqueEditee.id,
                            code: prochainCodeTiroir(
                              boutiqueEditee.id,
                              caissesList,
                            ),
                          })
                        }
                        disabled={ajouterTiroir.isPending}
                      >
                        <Plus size={14} /> Ajouter un tiroir
                      </button>
                    )}
                </div>
                <div>
                  <label htmlFor="edit-bn">Nom</label>
                  <input
                    id="edit-bn"
                    value={boutiqueEditee.nom}
                    disabled={!peutAdmin}
                    onChange={(e) =>
                      setBoutiqueEditee({
                        ...boutiqueEditee,
                        nom: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-ba">Adresse</label>
                  <input
                    id="edit-ba"
                    value={boutiqueEditee.adresse}
                    disabled={!peutAdmin}
                    onChange={(e) =>
                      setBoutiqueEditee({
                        ...boutiqueEditee,
                        adresse: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-bc">Code (optionnel)</label>
                  <input
                    id="edit-bc"
                    value={boutiqueEditee.code ?? ''}
                    disabled={!peutAdmin}
                    onChange={(e) =>
                      setBoutiqueEditee({
                        ...boutiqueEditee,
                        code: e.target.value || null,
                      })
                    }
                    placeholder="ex. DEMO-01"
                  />
                </div>
                {peutAdmin && (
                  <label className="cfg-check-inline">
                    <input
                      type="checkbox"
                      checked={boutiqueEditee.actif}
                      onChange={(e) =>
                        setBoutiqueEditee({
                          ...boutiqueEditee,
                          actif: e.target.checked,
                        })
                      }
                    />
                    Magasin actif
                  </label>
                )}
                <div className="cfg-form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setBoutiqueEditee(null)}
                  >
                    Fermer
                  </button>
                  {peutAdmin && (
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={updateBoutique.isPending}
                    >
                      {updateBoutique.isPending ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  )}
                </div>
              </form>
            )}
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
            title="Nouvelle caisse magasin"
          >
            <form
              className="cfg-form"
              onSubmit={(e) => {
                e.preventDefault();
                createCaisse.mutate();
              }}
            >
              <p className="lead">
                Un magasin neuf a déjà sa caisse. Cet écran ne sert qu’aux
                magasins créés avant, encore sans caisse magasin.
              </p>
              <div>
                <label htmlFor="cb">Magasin</label>
                <select
                  id="cb"
                  value={caisseBoutiqueId || boutiquesSansCaisse[0]?.id || ''}
                  onChange={(e) => setCaisseBoutiqueId(e.target.value)}
                  required
                >
                  {boutiquesSansCaisse.length === 0 && (
                    <option value="">Tous les magasins ont déjà une caisse</option>
                  )}
                  {boutiquesSansCaisse.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cfg-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalCaisse(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    createCaisse.isPending || boutiquesSansCaisse.length === 0
                  }
                >
                  {createCaisse.isPending ? 'Création…' : 'Créer la caisse'}
                </button>
              </div>
              {createCaisseErr && <p role="alert">{createCaisseErr}</p>}
            </form>
          </Modal>
        </>
      )}

      <Modal
        open={caisseDetaillee !== null}
        onClose={() => setCaisseDetaillee(null)}
        title={
          caisseDetaillee
            ? `${libelleCaisse(caisseDetaillee)} — détail`
            : 'Caisse'
        }
      >
        {caisseDetaillee && (
          <div className="cfg-form">
            <div className="cfg-mag-detail-meta">
              <span className="cfg-badge accent">
                {libelleTypeCaisse(caisseDetaillee.type)}
              </span>
              {caisseDetaillee.boutiqueId && (
                <span className="cfg-badge muted">
                  {boutiquesList.find((b) => b.id === caisseDetaillee.boutiqueId)
                    ?.nom ?? 'Boutique'}
                </span>
              )}
              <span
                className={`cfg-badge ${caisseDetaillee.actif === false ? 'muted' : 'ok'}`}
              >
                {caisseDetaillee.actif === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            <div className="cfg-caisse-solde">
              <span>Solde courant</span>
              <strong className="money">
                {soldeCaisseDetail.isLoading
                  ? '…'
                  : soldeCaisseDetail.isError
                    ? '—'
                    : `${formatSolde(soldeCaisseDetail.data?.solde ?? 0)} FCFA`}
              </strong>
            </div>
            <p className="lead">
              Réf. <code>{caisseDetaillee.id}</code>
              {caisseDetaillee.code ? ` · Code ${caisseDetaillee.code}` : ''}
            </p>
            <h3 className="cfg-section-title">Derniers mouvements</h3>
            {mouvementsCaisse.isLoading && (
              <LoadingState label="Chargement du grand livre…" />
            )}
            {mouvementsCaisse.isError && (
              <p role="alert">Impossible de charger les mouvements.</p>
            )}
            {mouvementsCaisse.data && mouvementsCaisse.data.length === 0 && (
              <EmptyState
                title="Aucun mouvement"
                description="Le grand livre de cette caisse est encore vide."
              />
            )}
            {mouvementsCaisse.data && mouvementsCaisse.data.length > 0 && (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Libellé</th>
                      <th>Débit</th>
                      <th>Crédit</th>
                      <th>Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvementsCaisse.data.slice(0, 20).map((m) => (
                      <tr key={m.id}>
                        <td>
                          {new Date(m.dateHeure).toLocaleString('fr-FR')}
                        </td>
                        <td>
                          {m.libelle}
                          <br />
                          <span className="lead">{m.statut}</span>
                        </td>
                        <td className="money">
                          {Number(m.debit) > 0
                            ? `${formatSolde(m.debit)}`
                            : '—'}
                        </td>
                        <td className="money">
                          {Number(m.credit) > 0
                            ? `${formatSolde(m.credit)}`
                            : '—'}
                        </td>
                        <td className="money">{formatSolde(m.soldeApres)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cfg-form-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCaisseDetaillee(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
