-- Audit sécurité (CLAUDE.md §6.7) : le journal d'audit doit être append-only
-- "même côté admin". Jusqu'ici cette garantie n'existait qu'au niveau
-- applicatif (AuditService n'expose pas d'update/delete) — un accès direct à
-- la base (psql, script de migration de données, futur bug) pouvait encore
-- altérer l'historique. Un trigger PostgreSQL ferme ce trou au niveau DB,
-- pour tout rôle, y compris le rôle applicatif lui-même.
CREATE OR REPLACE FUNCTION journal_audit_interdire_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'journal_audit est append-only : UPDATE et DELETE sont interdits (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_audit_append_only
  BEFORE UPDATE OR DELETE ON "journal_audit"
  FOR EACH ROW
  EXECUTE FUNCTION journal_audit_interdire_modification();
