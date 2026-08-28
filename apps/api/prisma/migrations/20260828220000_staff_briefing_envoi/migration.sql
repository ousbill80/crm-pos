-- Briefings Direction / DAF (append-only) + index connexions.
CREATE TABLE "staff_briefing_envoi" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cleUnique" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "destinataireHash" TEXT NOT NULL,
    "resendId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_briefing_envoi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_briefing_envoi_cleUnique_key" ON "staff_briefing_envoi"("cleUnique");
CREATE INDEX "staff_briefing_envoi_type_createdAt_idx" ON "staff_briefing_envoi"("type", "createdAt");

CREATE INDEX "journal_audit_utilisateurId_action_dateHeure_idx" ON "journal_audit"("utilisateurId", "action", "dateHeure");
