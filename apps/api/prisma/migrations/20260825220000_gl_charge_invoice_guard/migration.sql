CREATE OR REPLACE FUNCTION p2p_guard_invoice_posting() RETURNS trigger AS $$
DECLARE paid DECIMAL(14,2); due DECIMAL(14,2);
BEGIN
  IF NEW."statut" = 'COMPTABILISEE' AND OLD."statut" <> 'COMPTABILISEE'
     AND NOT EXISTS (
       SELECT 1 FROM "ecriture_comptable"
       WHERE "factureId" = NEW."id"
         AND "sourceType" IN ('FACTURE_FOURNISSEUR','AVOIR_FOURNISSEUR','FACTURE_CHARGE')
     ) THEN
    RAISE EXCEPTION 'COMPTABILISEE exige une écriture équilibrée atomique';
  END IF;
  IF NEW."statut" IN ('PARTIELLEMENT_PAYEE','PAYEE') AND NEW."statut" <> OLD."statut" THEN
    SELECT COALESCE(SUM(a."montant"), 0) INTO paid
      FROM "allocation_paiement_fournisseur" a
      JOIN "paiement_fournisseur" p ON p."propositionId" = a."propositionId"
      WHERE a."factureId" = NEW."id";
    due := COALESCE(NEW."netAPayer", NEW."montant");
    IF paid <= 0 OR paid > due THEN
      RAISE EXCEPTION 'Statut paiement incohérent: payé %, dû %', paid, due;
    END IF;
    IF NEW."statut" = 'PAYEE' AND paid <> due THEN
      RAISE EXCEPTION 'PAYEE exige un règlement intégral: payé %, dû %', paid, due;
    END IF;
    IF NEW."statut" = 'PARTIELLEMENT_PAYEE' AND paid >= due THEN
      RAISE EXCEPTION 'PARTIELLEMENT_PAYEE exige un solde restant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
