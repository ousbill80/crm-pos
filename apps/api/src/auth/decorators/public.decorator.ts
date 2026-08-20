import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Seul moyen explicite d'exempter un endpoint de l'authentification JWT
// globale. Sans ce décorateur, tout endpoint est protégé par défaut
// (secure by default) — cohérent avec l'exigence §6.7 d'authentification
// individuelle obligatoire.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
