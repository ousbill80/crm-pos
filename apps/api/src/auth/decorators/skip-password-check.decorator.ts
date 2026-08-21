import { SetMetadata } from '@nestjs/common';

export const SKIP_PASSWORD_CHECK_KEY = 'skipPasswordCheck';

// Exempte explicitement un endpoint du blocage "changement de mot de passe
// obligatoire" (PasswordChangeRequiredGuard). Réservé aux endpoints qui
// doivent rester joignables tant que mustChangePassword=true (typiquement
// POST /auth/change-password lui-même, et /auth/logout).
export const SkipPasswordCheck = () =>
  SetMetadata(SKIP_PASSWORD_CHECK_KEY, true);
