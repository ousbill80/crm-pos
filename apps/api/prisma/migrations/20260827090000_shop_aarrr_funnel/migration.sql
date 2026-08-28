-- Funnel AARRR boutique : journal append-only + codes parrainage (pas de remise inventée).
CREATE TYPE "ShopFunnelEtape" AS ENUM ('ACQUISITION', 'ACTIVATION', 'REVENUE', 'RETENTION', 'REFERRAL');

ALTER TABLE "compte_client" ADD COLUMN "codeParrainage" TEXT;
ALTER TABLE "compte_client" ADD COLUMN "parrainId" TEXT;

UPDATE "compte_client"
SET "codeParrainage" = 'MA' || UPPER(SUBSTRING(REPLACE("id", '-', ''), 1, 8))
WHERE "codeParrainage" IS NULL;

ALTER TABLE "compte_client" ALTER COLUMN "codeParrainage" SET NOT NULL;

CREATE UNIQUE INDEX "compte_client_codeParrainage_key" ON "compte_client"("codeParrainage");
CREATE INDEX "compte_client_parrainId_idx" ON "compte_client"("parrainId");

ALTER TABLE "compte_client"
  ADD CONSTRAINT "compte_client_parrainId_fkey"
  FOREIGN KEY ("parrainId") REFERENCES "compte_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "shop_funnel_event" (
    "id" TEXT NOT NULL,
    "etape" "ShopFunnelEtape" NOT NULL,
    "action" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "compteClientId" TEXT,
    "produitId" TEXT,
    "commandeWebId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "codeParrain" TEXT,
    "requete" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_funnel_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_funnel_event_sessionId_createdAt_idx" ON "shop_funnel_event"("sessionId", "createdAt");
CREATE INDEX "shop_funnel_event_etape_createdAt_idx" ON "shop_funnel_event"("etape", "createdAt");
CREATE INDEX "shop_funnel_event_action_createdAt_idx" ON "shop_funnel_event"("action", "createdAt");
CREATE INDEX "shop_funnel_event_compteClientId_createdAt_idx" ON "shop_funnel_event"("compteClientId", "createdAt");
CREATE INDEX "shop_funnel_event_produitId_idx" ON "shop_funnel_event"("produitId");

ALTER TABLE "shop_funnel_event"
  ADD CONSTRAINT "shop_funnel_event_compteClientId_fkey"
  FOREIGN KEY ("compteClientId") REFERENCES "compte_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shop_funnel_event"
  ADD CONSTRAINT "shop_funnel_event_produitId_fkey"
  FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shop_funnel_event"
  ADD CONSTRAINT "shop_funnel_event_commandeWebId_fkey"
  FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE SET NULL ON UPDATE CASCADE;
