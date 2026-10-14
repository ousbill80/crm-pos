import { apiFetch } from '../api';
import type { ReportingDashboardDto, VenteQuotidienneDto } from '../navigation/types';

export function getDashboard() {
  return apiFetch<ReportingDashboardDto>('/reporting/dashboard');
}

export function getVentesQuotidiennes(jours = 14) {
  return apiFetch<VenteQuotidienneDto[]>(
    `/reporting/ventes-quotidiennes?jours=${jours}`,
  );
}
