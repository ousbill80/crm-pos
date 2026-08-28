CREATE TYPE "AccountingAiSourceType" AS ENUM ('SUPPLIER_INVOICE','SUPPLIER_CREDIT','SUPPLIER_PAYMENT','CUSTOMER_INVOICE','POS_SALE','POS_RETURN','POS_DISCOUNT','CASH_REMITTANCE','BANK_MOVEMENT','STOCK_MOVEMENT','LANDED_COST','CUSTOMS','TAX');
CREATE TYPE "AccountingAiWorkStatus" AS ENUM ('QUEUED','ANALYZED','RAF_REVIEW','AUTO_POST_ELIGIBLE','DECIDED');
CREATE TYPE "AccountingAiSuggestionKind" AS ENUM ('DOCUMENT_CLASSIFICATION','JOURNAL_CODING','ACCOUNT_CODING','TAX_CODING','ANALYTIC_CODING','MATCHING','ANOMALY');
CREATE TYPE "AccountingAiDecision" AS ENUM ('PENDING','ACCEPTED','REJECTED','AUTO_APPROVED');
CREATE TYPE "AccountingAiRisk" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE "AccountingAuditSeverity" AS ENUM ('INFO','LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "AccountingAuditFindingStatus" AS ENUM ('OPEN','ASSIGNED','RESOLVED','STORNO_REQUIRED');

CREATE TABLE "accounting_ai_work_item" (
  "id" TEXT NOT NULL, "societeId" TEXT NOT NULL,
  "sourceType" "AccountingAiSourceType" NOT NULL, "sourceId" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL, "sourceHash" TEXT NOT NULL,
  "status" "AccountingAiWorkStatus" NOT NULL DEFAULT 'QUEUED',
  "deterministicChecks" JSONB NOT NULL, "deterministicBlockers" JSONB NOT NULL,
  "providerMode" TEXT NOT NULL, "providerErrorCode" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_ai_work_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounting_ai_work_item_source_key" ON "accounting_ai_work_item"("societeId","sourceType","sourceId");
CREATE INDEX "accounting_ai_work_item_status_idx" ON "accounting_ai_work_item"("societeId","status","createdAt");

CREATE TABLE "accounting_ai_suggestion" (
  "id" TEXT NOT NULL, "workItemId" TEXT NOT NULL,
  "kind" "AccountingAiSuggestionKind" NOT NULL, "value" JSONB NOT NULL,
  "confidence" DECIMAL(5,4) NOT NULL, "evidence" JSONB NOT NULL,
  "ruleCitations" JSONB NOT NULL, "risk" "AccountingAiRisk" NOT NULL,
  "modelVersion" TEXT NOT NULL, "modelHash" TEXT NOT NULL, "promptHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_ai_suggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_ai_suggestion_work_fkey" FOREIGN KEY ("workItemId") REFERENCES "accounting_ai_work_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "accounting_ai_suggestion_kind_idx" ON "accounting_ai_suggestion"("workItemId","kind");

CREATE TABLE "accounting_ai_decision_event" (
  "id" TEXT NOT NULL, "suggestionId" TEXT NOT NULL,
  "decision" "AccountingAiDecision" NOT NULL, "actorId" TEXT NOT NULL,
  "reason" TEXT, "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_ai_decision_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_ai_decision_suggestion_fkey" FOREIGN KEY ("suggestionId") REFERENCES "accounting_ai_suggestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "accounting_ai_decision_event_idx" ON "accounting_ai_decision_event"("suggestionId","createdAt");

CREATE TABLE "accounting_ai_policy" (
  "id" TEXT NOT NULL, "societeId" TEXT NOT NULL,
  "sourceType" "AccountingAiSourceType" NOT NULL,
  "suggestionKind" "AccountingAiSuggestionKind" NOT NULL,
  "minimumConfidence" DECIMAL(5,4) NOT NULL, "maximumRisk" "AccountingAiRisk" NOT NULL DEFAULT 'LOW',
  "active" BOOLEAN NOT NULL DEFAULT false, "approvedByDafId" TEXT, "approvedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_ai_policy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounting_ai_policy_version_key" ON "accounting_ai_policy"("societeId","sourceType","suggestionKind","version");
CREATE INDEX "accounting_ai_policy_active_idx" ON "accounting_ai_policy"("societeId","active");

CREATE TABLE "accounting_audit_finding" (
  "id" TEXT NOT NULL, "workItemId" TEXT NOT NULL,
  "severity" "AccountingAuditSeverity" NOT NULL, "ruleCode" TEXT NOT NULL,
  "title" TEXT NOT NULL, "details" JSONB NOT NULL,
  "status" "AccountingAuditFindingStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT, "resolution" TEXT, "stornoEntryId" TEXT,
  "resolvedById" TEXT, "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_audit_finding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_audit_finding_work_fkey" FOREIGN KEY ("workItemId") REFERENCES "accounting_ai_work_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "accounting_audit_finding_status_idx" ON "accounting_audit_finding"("status","severity","assignedToId");

CREATE TABLE "accounting_ai_evidence" (
  "id" TEXT NOT NULL, "workItemId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "actorId" TEXT, "evidence" JSONB NOT NULL, "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_ai_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_ai_evidence_work_fkey" FOREIGN KEY ("workItemId") REFERENCES "accounting_ai_work_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "accounting_ai_evidence_created_idx" ON "accounting_ai_evidence"("workItemId","createdAt");

CREATE OR REPLACE FUNCTION prevent_accounting_ai_append_only_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Accounting AI evidence and decisions are append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "accounting_ai_decision_append_only" BEFORE UPDATE OR DELETE ON "accounting_ai_decision_event" FOR EACH ROW EXECUTE FUNCTION prevent_accounting_ai_append_only_mutation();
CREATE TRIGGER "accounting_ai_evidence_append_only" BEFORE UPDATE OR DELETE ON "accounting_ai_evidence" FOR EACH ROW EXECUTE FUNCTION prevent_accounting_ai_append_only_mutation();
