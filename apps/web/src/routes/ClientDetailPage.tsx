import { useNavigate, useParams } from 'react-router-dom';
import { RoleLibelle } from '@caisse-crm/shared';
import { useAuth } from '../context/AuthContext';
import { FicheClient } from '../components/FicheClient';
import { LoadingState } from '../components/LoadingState';

const ROLES_CREATION_CLIENT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const ROLES_ADMIN_CRM: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!clientId) {
    return <p role="alert">Client introuvable.</p>;
  }

  if (!user) {
    return <LoadingState label="Chargement..." />;
  }

  const peutCreer = ROLES_CREATION_CLIENT.includes(user.role);
  const peutAdmin = ROLES_ADMIN_CRM.includes(user.role);

  return (
    <FicheClient
      clientId={clientId}
      peutAdmin={peutAdmin}
      peutCreer={peutCreer}
      onBack={() => navigate('/clients')}
    />
  );
}
