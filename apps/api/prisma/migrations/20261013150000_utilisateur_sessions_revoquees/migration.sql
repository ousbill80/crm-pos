-- Révocation immédiate de session (audit sécurité) : le JWT est stateless et
-- valide 24h (fenêtre d'autonomie POS hors ligne, §6.7). Sans ce champ, un
-- compte désactivé, un changement de rôle ou un reset de mot de passe par un
-- admin ne prend effet qu'à l'expiration naturelle du token. Comparé à
-- payload.iat dans JwtStrategy à chaque requête authentifiée.
ALTER TABLE "utilisateur" ADD COLUMN "sessionsRevoqueesAvant" TIMESTAMP(3);
