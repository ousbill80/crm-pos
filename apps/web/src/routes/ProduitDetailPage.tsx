import { useNavigate, useParams } from 'react-router-dom';
import { RoleLibelle } from '@caisse-crm/shared';
import { useAuth } from '../context/AuthContext';
import { FicheProduit } from '../components/FicheProduit';
import { LoadingState } from '../components/LoadingState';

const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_LECTURE_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export function ProduitDetailPage() {
  const { produitId } = useParams<{ produitId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!produitId) {
    return <p role="alert">Produit introuvable.</p>;
  }

  if (!user) {
    return <LoadingState label="Chargement..." />;
  }

  if (!ROLES_LECTURE_STRUCTURE.includes(user.role)) {
    return <p>Vous n’avez pas accès au catalogue produit.</p>;
  }

  return (
    <FicheProduit
      produitId={produitId}
      peutGerer={ROLES_ADMIN_STRUCTURE.includes(user.role)}
      onBack={() => navigate('/produits')}
    />
  );
}
