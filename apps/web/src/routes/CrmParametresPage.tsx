import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  Crown,
  Gift,
  Layers,
  Medal,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import { NiveauFidelite, RoleLibelle, SegmentClient, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import {
  FIDELITE_FCFA_PAR_POINT,
  SEUILS_CRM_DEFAUT,
  caDepuisPoints,
  parseSeuilsForm,
  seuilsModifies,
  validerSeuils,
  type SeuilsCrmForm,
} from '../lib/crm-parametres';
import {
  insightAvantageFidelite,
  insightCreditFideliteAuto,
  insightSeuilFideliteArgent,
  insightSeuilFideliteOr,
  insightSeuilSegmentRegulier,
  insightSeuilSegmentVip,
} from '../lib/insights/crm';
import type { CrmParametresDto, TableauDeBordCrmDto } from '../lib/types';

const ROLES = rolesPourMenu('contacts', '/clients/parametres');
const ROLES_ADMIN: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

const ACCENT = {
  bronze: '#a67c52',
  argent: '#6b7c93',
  or: '#c9a227',
  nouveau: '#64748b',
  regulier: '#2563eb',
  vip: '#9333ea',
} as const;

function labelSegment(s: string) {
  if (s === SegmentClient.VIP) return 'VIP';
  if (s === SegmentClient.REGULIER) return 'Régulier';
  if (s === SegmentClient.NOUVEAU) return 'Nouveau';
  return s;
}

function labelPalier(n: string) {
  if (n === NiveauFidelite.OR) return 'Or';
  if (n === NiveauFidelite.ARGENT) return 'Argent';
  if (n === NiveauFidelite.BRONZE) return 'Bronze';
  return n;
}

function SeuilStep({
  icon: Icon,
  title,
  detail,
  value,
  accent,
  threshold = false,
}: {
  icon: typeof Medal;
  title: string;
  detail: string;
  value: string;
  accent: string;
  threshold?: boolean;
}) {
  return (
    <div
      className={`crm-seuil-step${threshold ? ' is-threshold' : ''}`}
      style={{ '--step-accent': accent } as React.CSSProperties}
    >
      <span className="crm-seuil-step-icon" aria-hidden>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="crm-seuil-step-body">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <span className="crm-seuil-step-value">{value}</span>
    </div>
  );
}

export function CrmParametresPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);

  const params = useQuery({
    queryKey: ['crm-parametres'],
    queryFn: () => apiFetch<CrmParametresDto>('/crm/parametres'),
    enabled: peutLire,
  });

  const tdb = useQuery({
    queryKey: ['crm-tdb-reseau'],
    queryFn: () => apiFetch<TableauDeBordCrmDto>('/crm/tableau-de-bord'),
    enabled: peutLire,
  });

  const [argent, setArgent] = useState('');
  const [or, setOr] = useState('');
  const [regulier, setRegulier] = useState('');
  const [vip, setVip] = useState('');
  const [avantageArgent, setAvantageArgent] = useState('0');
  const [avantageOr, setAvantageOr] = useState('0');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!params.data) return;
    setArgent(String(params.data.seuilFideliteArgent));
    setOr(String(params.data.seuilFideliteOr));
    setRegulier(String(params.data.seuilSegmentRegulier));
    setVip(String(params.data.seuilSegmentVip));
    setAvantageArgent(String(params.data.avantageFideliteArgentPct));
    setAvantageOr(String(params.data.avantageFideliteOrPct));
  }, [params.data]);

  const brouillon = useMemo(
    () =>
      parseSeuilsForm({
        argent,
        or,
        regulier,
        vip,
        avantageArgent,
        avantageOr,
      }),
    [argent, or, regulier, vip, avantageArgent, avantageOr],
  );

  const sauvegarde = useMemo<SeuilsCrmForm | null>(() => {
    if (!params.data) return null;
    return {
      seuilFideliteArgent: params.data.seuilFideliteArgent,
      seuilFideliteOr: params.data.seuilFideliteOr,
      seuilSegmentRegulier: params.data.seuilSegmentRegulier,
      seuilSegmentVip: params.data.seuilSegmentVip,
      avantageFideliteArgentPct: params.data.avantageFideliteArgentPct,
      avantageFideliteOrPct: params.data.avantageFideliteOrPct,
    };
  }, [params.data]);

  const erreurValidation = brouillon ? validerSeuils(brouillon) : null;
  const modifie =
    brouillon && sauvegarde ? seuilsModifies(brouillon, sauvegarde) : false;

  const save = useMutation({
    mutationFn: (seuils: SeuilsCrmForm) =>
      apiFetch<CrmParametresDto>('/crm/parametres', {
        method: 'PATCH',
        body: JSON.stringify(seuils),
      }),
    onSuccess: () => {
      setMsg({ text: 'Seuils enregistrés.', ok: true });
      void queryClient.invalidateQueries({ queryKey: ['crm-parametres'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-tdb-reseau'] });
    },
    onError: (e) =>
      setMsg({ text: messageDepuisApi(e, 'Enregistrement refusé.'), ok: false }),
  });

  if (!peutLire) return <Navigate to="/" replace />;

  function appliquerDefauts() {
    setArgent(String(SEUILS_CRM_DEFAUT.seuilFideliteArgent));
    setOr(String(SEUILS_CRM_DEFAUT.seuilFideliteOr));
    setRegulier(String(SEUILS_CRM_DEFAUT.seuilSegmentRegulier));
    setVip(String(SEUILS_CRM_DEFAUT.seuilSegmentVip));
    setAvantageArgent(String(SEUILS_CRM_DEFAUT.avantageFideliteArgentPct));
    setAvantageOr(String(SEUILS_CRM_DEFAUT.avantageFideliteOrPct));
    setMsg(null);
  }

  function annulerBrouillon() {
    if (!params.data) return;
    setArgent(String(params.data.seuilFideliteArgent));
    setOr(String(params.data.seuilFideliteOr));
    setRegulier(String(params.data.seuilSegmentRegulier));
    setVip(String(params.data.seuilSegmentVip));
    setAvantageArgent(String(params.data.avantageFideliteArgentPct));
    setAvantageOr(String(params.data.avantageFideliteOrPct));
    setMsg(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!brouillon || erreurValidation) return;
    save.mutate(brouillon);
  }

  const argentN = brouillon?.seuilFideliteArgent ?? params.data?.seuilFideliteArgent ?? 0;
  const orN = brouillon?.seuilFideliteOr ?? params.data?.seuilFideliteOr ?? 0;
  const regulierN = brouillon?.seuilSegmentRegulier ?? params.data?.seuilSegmentRegulier ?? 0;
  const vipN = brouillon?.seuilSegmentVip ?? params.data?.seuilSegmentVip ?? 0;
  const avantageArgentN =
    brouillon?.avantageFideliteArgentPct ?? params.data?.avantageFideliteArgentPct ?? 0;
  const avantageOrN =
    brouillon?.avantageFideliteOrPct ?? params.data?.avantageFideliteOrPct ?? 0;

  return (
    <div className="crm-parametres-page">
      <PageHeader
        title="Paramètres CRM"
        subtitle="Paliers de fidélité et seuils de segmentation — paramétrables réseau (§6.6)."
      />

      {params.isLoading && <LoadingState label="Chargement des seuils…" />}
      {params.isError && (
        <p role="alert">Impossible de charger les paramètres.</p>
      )}

      {params.data && brouillon && (
        <>
          <p className="lead crm-parametres-intro">
            Les seuils s’appliquent à tout le réseau. La fidélité se crédite
            automatiquement au POS ; la segmentation se recalcule sur demande
            depuis la page Segmentation.
          </p>

          <nav className="crm-parametres-links" aria-label="Pages CRM liées">
            <Link to="/clients/fidelite">
              <Gift size={15} aria-hidden /> Fidélité
            </Link>
            <Link to="/clients/segmentation">
              <Layers size={15} aria-hidden /> Segmentation
            </Link>
            <Link to="/clients/pilotage">
              <BarChart3 size={15} aria-hidden /> Pilotage
            </Link>
          </nav>

          <CrmKpiGrid>
            <CrmKpiWidget
              label="Seuil Argent"
              value={`${argentN} pts`}
              hint={`≈ ${caDepuisPoints(argentN)} d’achats cumulés`}
              icon={Medal}
              accent={ACCENT.argent}
            />
            <CrmKpiWidget
              label="Seuil Or"
              value={`${orN} pts`}
              hint={`≈ ${caDepuisPoints(orN)} d’achats cumulés`}
              icon={Crown}
              accent={ACCENT.or}
            />
            <CrmKpiWidget
              label="Seuil Régulier"
              value={`${regulierN} ventes`}
              hint="Achats rattachés à la fiche"
              icon={UserCheck}
              accent={ACCENT.regulier}
            />
            <CrmKpiWidget
              label="Seuil VIP"
              value={`${vipN} ventes`}
              hint="Clients à forte récurrence"
              icon={Star}
              accent={ACCENT.vip}
            />
          </CrmKpiGrid>

          <form
            className="crm-parametres-form client-workspace-card"
            onSubmit={onSubmit}
          >
            <div className="client-workspace-split">
              <section className="crm-parametres-panel">
                <h3>
                  Programme de fidélité
                  <InfoTooltip insight={insightCreditFideliteAuto()} />
                </h3>
                <p className="crm-parametres-panel-lead">
                  Paliers calculés sur les points cumulés — crédit auto{' '}
                  <strong>1 pt / {FIDELITE_FCFA_PAR_POINT.toLocaleString('fr-FR')} FCFA</strong>{' '}
                  à l’encaissement POS (client rattaché).
                </p>

                <div className="crm-seuil-ladder" aria-label="Échelle des paliers">
                  <SeuilStep
                    icon={Award}
                    title="Bronze"
                    detail="Palier d’entrée — 0 point"
                    value="0 pt"
                    accent={ACCENT.bronze}
                  />
                  <SeuilStep
                    icon={Medal}
                    title="Argent"
                    detail={`Dès ${argentN} point(s) cumulés`}
                    value={`≥ ${argentN} pts`}
                    accent={ACCENT.argent}
                    threshold
                  />
                  <SeuilStep
                    icon={Crown}
                    title="Or"
                    detail={`Dès ${orN} point(s) cumulés`}
                    value={`≥ ${orN} pts`}
                    accent={ACCENT.or}
                    threshold
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label htmlFor="seuil-argent">
                      Seuil Argent (points)
                      <InfoTooltip
                        insight={insightSeuilFideliteArgent(argentN)}
                      />
                    </label>
                    <input
                      id="seuil-argent"
                      type="number"
                      min={1}
                      value={argent}
                      onChange={(e) => {
                        setArgent(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="seuil-or">
                      Seuil Or (points)
                      <InfoTooltip
                        insight={insightSeuilFideliteOr(orN, argentN)}
                      />
                    </label>
                    <input
                      id="seuil-or"
                      type="number"
                      min={1}
                      value={or}
                      onChange={(e) => {
                        setOr(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label htmlFor="avantage-argent">
                      Avantage Argent (% remise à l’encaissement)
                      <InfoTooltip
                        insight={insightAvantageFidelite('Argent', avantageArgentN)}
                      />
                    </label>
                    <input
                      id="avantage-argent"
                      type="number"
                      min={0}
                      max={100}
                      value={avantageArgent}
                      onChange={(e) => {
                        setAvantageArgent(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="avantage-or">
                      Avantage Or (% remise à l’encaissement)
                      <InfoTooltip
                        insight={insightAvantageFidelite('Or', avantageOrN)}
                      />
                    </label>
                    <input
                      id="avantage-or"
                      type="number"
                      min={0}
                      max={100}
                      value={avantageOr}
                      onChange={(e) => {
                        setAvantageOr(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                </div>

                {tdb.data && (
                  <div className="crm-parametres-impact">
                    <h4>Effectif actuel par palier</h4>
                    <ul>
                      {Object.entries(tdb.data.effectifs.parPalier).map(
                        ([k, n]) => (
                          <li key={k}>
                            {labelPalier(k)} · {n}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </section>

              <section className="crm-parametres-panel">
                <h3>Segmentation client</h3>
                <p className="crm-parametres-panel-lead">
                  Segments dérivés du nombre de ventes rattachées à la fiche
                  client sur l’ensemble du réseau.
                </p>

                <div className="crm-seuil-ladder" aria-label="Échelle des segments">
                  <SeuilStep
                    icon={Sparkles}
                    title="Nouveau"
                    detail="Moins de ventes que le seuil Régulier"
                    value={`< ${regulierN} vente(s)`}
                    accent={ACCENT.nouveau}
                  />
                  <SeuilStep
                    icon={Users}
                    title="Régulier"
                    detail={`Dès ${regulierN} vente(s) rattachée(s)`}
                    value={`≥ ${regulierN}`}
                    accent={ACCENT.regulier}
                    threshold
                  />
                  <SeuilStep
                    icon={Star}
                    title="VIP"
                    detail={`Dès ${vipN} vente(s) rattachée(s)`}
                    value={`≥ ${vipN}`}
                    accent={ACCENT.vip}
                    threshold
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label htmlFor="seuil-regulier">
                      Seuil Régulier (ventes)
                      <InfoTooltip
                        insight={insightSeuilSegmentRegulier(regulierN)}
                      />
                    </label>
                    <input
                      id="seuil-regulier"
                      type="number"
                      min={1}
                      value={regulier}
                      onChange={(e) => {
                        setRegulier(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="seuil-vip">
                      Seuil VIP (ventes)
                      <InfoTooltip
                        insight={insightSeuilSegmentVip(vipN, regulierN)}
                      />
                    </label>
                    <input
                      id="seuil-vip"
                      type="number"
                      min={1}
                      value={vip}
                      onChange={(e) => {
                        setVip(e.target.value);
                        setMsg(null);
                      }}
                      disabled={!peutAdmin}
                      required
                    />
                  </div>
                </div>

                {tdb.data && (
                  <div className="crm-parametres-impact">
                    <h4>Effectif actuel par segment</h4>
                    <ul>
                      {Object.entries(tdb.data.effectifs.parSegment).map(
                        ([k, n]) => (
                          <li key={k}>
                            {labelSegment(k)} · {n}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </section>
            </div>

            <div className="crm-parametres-note">
              <Medal size={18} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Après modification</strong> — les nouveaux paliers
                s’appliquent dès le prochain crédit de points. Pour le fichier
                existant, lancez un recalcul segment par segment depuis{' '}
                <Link to="/clients/segmentation">Segmentation</Link>.
              </div>
            </div>

            <div className="crm-parametres-actions">
              {peutAdmin ? (
                <>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={
                      save.isPending ||
                      Boolean(erreurValidation) ||
                      !brouillon
                    }
                  >
                    <Save size={16} aria-hidden />
                    {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                  {modifie && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={annulerBrouillon}
                    >
                      <RotateCcw size={16} aria-hidden /> Annuler
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={appliquerDefauts}
                  >
                    Valeurs par défaut
                  </button>
                </>
              ) : (
                <p className="lead">
                  Lecture seule — seul le Responsable CRM peut modifier les
                  seuils.
                </p>
              )}
            </div>

            {erreurValidation && (
              <p className="crm-parametres-status is-error" role="alert">
                {erreurValidation}
              </p>
            )}
            {msg && (
              <p
                className={`crm-parametres-status${msg.ok ? ' is-ok' : ' is-error'}`}
                role="status"
              >
                {msg.text}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
