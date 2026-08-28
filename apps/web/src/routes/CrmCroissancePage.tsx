import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MousePointerClick,
  Repeat,
  Share2,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import { CRM_KPI } from '../lib/crm-kpi-accents';

const ROLES = rolesPourMenu('contacts', '/clients/croissance');

type AarrrDto = {
  fenetreJours: number;
  acquisition: {
    sessions: number;
    vuesHome: number;
    vuesPdp: number;
    recherches: number;
    landings: number;
  };
  activation: {
    sessions: number;
    ajoutsPanier: number;
    inscriptions: number;
    checkouts: number;
    tauxActivation: number;
  };
  revenue: {
    commandes: number;
    caTtc: number;
    panierMoyen: number;
    tauxConversion: number;
  };
  retention: {
    clientsAcheteurs: number;
    clientsRecurrents: number;
    partRecurrente: number;
  };
  referral: {
    partages: number;
    inscriptionsParrainees: number;
    tauxParrainage: number;
  };
};

function formatFcfa(n: number) {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

export function CrmCroissancePage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES.includes(user.role);

  const q = useQuery({
    queryKey: ['shop-aarrr', 7],
    queryFn: () => apiFetch<AarrrDto>('/commandes-web/aarrr?jours=7'),
    enabled: peutLire,
  });

  if (!peutLire) return <Navigate to="/" replace />;

  const d = q.data;

  return (
    <div>
      <PageHeader
        title="Croissance boutique"
        subtitle="Funnel AARRR 7 jours — visites, paniers, commandes web payées, clients récurrents et parrainage. Chiffres réels, sans promo fictive."
      />
      {q.isLoading && <LoadingState label="Chargement du funnel boutique…" />}
      {q.isError && (
        <p role="alert">Impossible de charger le funnel AARRR boutique.</p>
      )}
      {d && (
        <>
          <CrmKpiGrid>
            <CrmKpiWidget
              label="Acquisition"
              value={d.acquisition.sessions}
              hint={`${d.acquisition.vuesHome} accueil · ${d.acquisition.vuesPdp} fiches · ${d.acquisition.recherches} recherches`}
              icon={MousePointerClick}
              accent={CRM_KPI.nouveau}
            />
            <CrmKpiWidget
              label="Activation"
              value={`${d.activation.tauxActivation} %`}
              hint={`${d.activation.ajoutsPanier} panier(s) · ${d.activation.inscriptions} compte(s) · ${d.activation.checkouts} checkout(s)`}
              icon={Users}
              accent={CRM_KPI.regulier}
              badge={`${d.activation.sessions} session(s)`}
            />
            <CrmKpiWidget
              label="Revenue"
              value={formatFcfa(d.revenue.caTtc)}
              hint={`${d.revenue.commandes} commande(s) · panier moyen ${formatFcfa(d.revenue.panierMoyen)} · conv. ${d.revenue.tauxConversion} %`}
              icon={ShoppingBag}
              accent={CRM_KPI.caIdentifie}
              valueClassName="is-compact money"
            />
            <CrmKpiWidget
              label="Rétention"
              value={`${d.retention.partRecurrente} %`}
              hint={`${d.retention.clientsRecurrents} client(s) ≥ 2 commandes / ${d.retention.clientsAcheteurs} acheteur(s)`}
              icon={Repeat}
              accent={CRM_KPI.vip}
            />
            <CrmKpiWidget
              label="Parrainage"
              value={d.referral.inscriptionsParrainees}
              hint={`${d.referral.partages} partage(s) · taux ${d.referral.tauxParrainage} %`}
              icon={Share2}
              accent={CRM_KPI.marketing}
            />
          </CrmKpiGrid>
          <p className="lead" style={{ marginTop: '1.25rem' }}>
            Ranking vitrine : ventes POS + web 24 h / 7 j / 30 j, stock réel et
            pages vues de la session. Aucun compte à rebours ni rabais inventé.
          </p>
        </>
      )}
    </div>
  );
}
