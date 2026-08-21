import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface AlerteDto {
  type: string;
}

function useAlertesCount() {
  return useQuery({
    queryKey: ['alertes'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
    staleTime: 30_000,
  });
}

/** Systray Odoo : cloche alertes (le menu utilisateur est dans ProtectedRoute). */
export function TopbarSystray() {
  const { data } = useAlertesCount();
  const navigate = useNavigate();
  const nombreAlertes = data?.length ?? 0;

  return (
    <button
      type="button"
      className="odoo-systray-btn"
      onClick={() => navigate('/alertes')}
      aria-label={`${nombreAlertes} alerte(s) active(s)`}
      title="Alertes"
    >
      <Bell size={17} />
      {nombreAlertes > 0 && (
        <span className="odoo-systray-badge">{nombreAlertes}</span>
      )}
    </button>
  );
}
