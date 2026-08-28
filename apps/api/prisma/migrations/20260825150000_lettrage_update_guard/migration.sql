-- Le lettrage est le seul UPDATE autorisé sur les lignes d'écriture et les
-- allocations : rattachement du paiement exécuté, sans réécrire le fait.

DROP TRIGGER IF EXISTS "ligne_ecriture_comptable_p2p_accounting_append_only" ON "ligne_ecriture_comptable";
DROP TRIGGER IF EXISTS "allocation_paiement_fournisseur_p2p_accounting_append_only" ON "allocation_paiement_fournisseur";

CREATE OR REPLACE FUNCTION p2p_guard_ligne_lettrage() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: suppression interdite sur ligne_ecriture_comptable';
  END IF;
  IF ROW(
       NEW."id", NEW."ecritureId", NEW."numeroLigne", NEW."compteId",
       NEW."roleSnapshot", NEW."libelle", NEW."debit", NEW."credit", NEW."fournisseurId"
     ) IS DISTINCT FROM ROW(
       OLD."id", OLD."ecritureId", OLD."numeroLigne", OLD."compteId",
       OLD."roleSnapshot", OLD."libelle", OLD."debit", OLD."credit", OLD."fournisseurId"
     ) THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: seuls lettrage et dateLettrage peuvent être mis à jour';
  END IF;
  IF OLD."lettrage" IS NOT NULL AND NEW."lettrage" IS DISTINCT FROM OLD."lettrage" THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: un lettrage déjà posé est immuable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION p2p_guard_allocation_lettrage() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: suppression interdite sur allocation_paiement_fournisseur';
  END IF;
  IF ROW(
       NEW."id", NEW."propositionId", NEW."factureId", NEW."montant", NEW."montantDevise"
     ) IS DISTINCT FROM ROW(
       OLD."id", OLD."propositionId", OLD."factureId", OLD."montant", OLD."montantDevise"
     ) THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: seuls paiementId et lettrage peuvent être mis à jour';
  END IF;
  IF OLD."paiementId" IS NOT NULL AND NEW."paiementId" IS DISTINCT FROM OLD."paiementId" THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: une allocation déjà lettrée est immuable';
  END IF;
  IF OLD."lettrage" IS NOT NULL AND NEW."lettrage" IS DISTINCT FROM OLD."lettrage" THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: un lettrage déjà posé est immuable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ligne_ecriture_comptable_p2p_lettrage"
  BEFORE UPDATE OR DELETE ON "ligne_ecriture_comptable"
  FOR EACH ROW EXECUTE FUNCTION p2p_guard_ligne_lettrage();

CREATE TRIGGER "allocation_paiement_fournisseur_p2p_lettrage"
  BEFORE UPDATE OR DELETE ON "allocation_paiement_fournisseur"
  FOR EACH ROW EXECUTE FUNCTION p2p_guard_allocation_lettrage();
