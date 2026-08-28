import * as Crypto from 'expo-crypto';
import { apiDownloadPdf, apiFetch, apiFetchMultipart } from '../api';
import { buildChallengeRequest } from '../p2p/sensitive-challenge';

export type JsonRecord = Record<string, unknown>;

export interface PurchaseRequestLine {
  id?: string;
  produitId?: string;
  designation: string;
  quantite: number;
  prixEstime?: number;
  dateBesoin?: string;
}

export interface PurchaseRequest extends JsonRecord {
  id: string;
  objet: string;
  statut: string;
  devise: string;
  montantEstime?: string | number;
  lignes?: PurchaseRequestLine[];
}

export interface PurchaseRequestCreate {
  objet: string;
  justification?: string;
  centreCoutId: string;
  budgetId: string;
  boutiqueId?: string;
  devise: string;
  lignes: PurchaseRequestLine[];
}

export interface PurchaseRecommendation extends JsonRecord {
  produitId: string;
  designation?: string;
  quantiteRecommandee: number;
}

export interface CostCentre extends JsonRecord {
  id: string;
  societeId: string;
  code: string;
  libelle: string;
  actif: boolean;
}

export interface ActiveBudget extends JsonRecord {
  id: string;
  centreCoutId: string;
  libelle: string;
  devise: string;
  montantAlloue: string;
  montantEngage: string;
  montantDisponible: string;
}

export interface PurchaseOrder extends JsonRecord {
  id: string;
  numero?: string;
  statut: string;
  fournisseur?: { nom?: string };
  lignes?: JsonRecord[];
  expeditions?: JsonRecord[];
}

export interface ReceiptEvidence {
  type: 'DOCUMENT' | 'PHOTO';
  nomFichier: string;
  mimeType: string;
  tailleOctets?: number;
  empreinteSha256?: string;
  /** URI durable fournie par le stockage documentaire configuré côté serveur. */
  uri: string;
}

export interface ReceiptLine {
  ligneCommandeId: string;
  quantiteRecue: number;
  codeBarres?: string;
  numeroLot?: string;
  dateExpiration?: string;
  numerosSerie?: string[];
  motifEcart?: string;
}

export interface PurchaseReceipt extends JsonRecord {
  id: string;
  statut: string;
  commandeId: string;
  numero?: string;
  lignes?: JsonRecord[];
  preuves?: ReceiptEvidence[];
}

export interface SupplierInvoice extends JsonRecord {
  id: string;
  numero?: string;
  referenceFournisseur?: string;
  statut: string;
  totalTtc?: string | number;
  statutRapprochement?: string;
  litiges?: JsonRecord[];
}

export interface AccountingDashboard {
  balance?: JsonRecord[];
  aging?: JsonRecord[];
  ledger?: JsonRecord[];
}

export interface PaymentProposal extends JsonRecord {
  id: string;
  numero: string;
  statut: string;
  montant: string | number;
  devise: string;
  dateExecutionPrevue: string;
  compteTresorerie?: { code?: string; libelle?: string };
  allocations?: JsonRecord[];
}

export interface PaymentProposalPage {
  items: PaymentProposal[];
  total: number;
  page: number;
  limit: number;
}

export type SensitivePurpose =
  | 'P2P_INVOICE_POST'
  | 'P2P_PAYMENT_APPROVE'
  | 'P2P_PAYMENT_EXCEPTION_APPROVE'
  | 'P2P_PAYMENT_EXECUTE'
  | 'ACCOUNTING_AI_POLICY_CREATE'
  | 'ACCOUNTING_AI_POLICY_APPROVE';

export interface SensitiveChallenge {
  challengeId: string;
  purpose: SensitivePurpose;
  expiresAt: string;
}

export interface UploadedEvidence extends JsonRecord {
  id: string;
  type: 'RECEIPT' | 'QUALITY' | 'CUSTOMS' | 'INVOICE';
  sourceId: string;
  mimeType: string;
  tailleOctets: number;
  empreinteSha256: string;
}

export interface AiDashboard extends JsonRecord {
  workItems?: JsonRecord[];
  suggestions?: JsonRecord[];
  findings?: JsonRecord[];
}

export function newOperationId(): string {
  return Crypto.randomUUID();
}

function post<T>(path: string, body: JsonRecord = {}): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export const p2pApi = {
  listRequests: () => apiFetch<PurchaseRequest[]>('/achats/demandes'),
  request: (id: string) => apiFetch<PurchaseRequest>(`/achats/demandes/${id}`),
  createRequest: (input: PurchaseRequestCreate) =>
    post<PurchaseRequest>('/achats/demandes', {
      ...input,
      clientOperationId: newOperationId(),
    }),
  submitRequest: (id: string) =>
    post<PurchaseRequest>(`/achats/demandes/${id}/soumettre`),
  approveRequest: (id: string) =>
    post<PurchaseRequest>(`/achats/demandes/${id}/approuver`),
  rejectRequest: (id: string, motif: string) =>
    post<PurchaseRequest>(`/achats/demandes/${id}/rejeter`, { motif }),
  recommendations: (warehouseId: string, days: number) =>
    apiFetch<PurchaseRecommendation[]>(
      `/achats/recommandations?entrepotId=${encodeURIComponent(warehouseId)}&fenetreJours=${days}`,
    ),
  costCentres: () => apiFetch<CostCentre[]>('/achats/centres-cout?actif=true'),
  activeBudgets: (centreCoutId: string, devise = 'XOF') =>
    apiFetch<ActiveBudget[]>(
      `/achats/budgets/actifs?centreCoutId=${encodeURIComponent(centreCoutId)}&devise=${encodeURIComponent(devise)}`,
    ),

  listOrders: () => apiFetch<PurchaseOrder[]>('/achats/commandes'),
  order: (id: string) => apiFetch<PurchaseOrder>(`/achats/commandes/${id}`),
  orderImport: (id: string) => apiFetch<JsonRecord>(`/achats/commandes/${id}/import`),
  submitOrder: (id: string) => post(`/achats/commandes/${id}/soumettre`),
  approveOrder: (id: string, motif?: string) =>
    post(`/achats/commandes/${id}/approuver`, {
      clientOperationId: newOperationId(),
      ...(motif ? { motif } : {}),
    }),
  productionMilestone: (id: string, date: string, notes?: string) =>
    post(`/achats/commandes/${id}/production`, {
      clientOperationId: newOperationId(),
      date,
      ...(notes ? { notes } : {}),
    }),

  listReceipts: () => apiFetch<PurchaseReceipt[]>('/achats/receptions'),
  receipt: (id: string) => apiFetch<PurchaseReceipt>(`/achats/receptions/${id}`),
  createReceipt: (input: {
    commandeId: string;
    expeditionId?: string;
    emplacementQuarantaineId: string;
    referenceLivraison?: string;
    lignes: ReceiptLine[];
    preuves?: ReceiptEvidence[];
  }) =>
    post<PurchaseReceipt>('/achats/receptions', {
      ...input,
      clientOperationId: newOperationId(),
    }),
  quality: (id: string, lignes: JsonRecord[], commentaire?: string) =>
    post<PurchaseReceipt>(`/achats/receptions/${id}/qualite`, {
      clientOperationId: newOperationId(),
      lignes,
      ...(commentaire ? { commentaire } : {}),
    }),
  putaway: (id: string, lignes: JsonRecord[]) =>
    post(`/achats/receptions/${id}/putaway`, {
      clientOperationId: newOperationId(),
      lignes,
    }),
  createReturn: (id: string, input: JsonRecord) =>
    post(`/achats/receptions/${id}/retours`, {
      ...input,
      clientOperationId: newOperationId(),
    }),

  listInvoices: () => apiFetch<SupplierInvoice[]>('/achats/factures'),
  invoice: (id: string) => apiFetch<SupplierInvoice>(`/achats/factures/${id}`),
  reviewExtraction: (
    id: string,
    decision: 'CONFIRMER' | 'REJETER',
    commentaire?: string,
  ) =>
    post(`/achats/factures/${id}/extraction-review`, {
      clientOperationId: newOperationId(),
      decision,
      ...(commentaire ? { commentaire } : {}),
    }),
  grantInvoiceException: (id: string, motif: string) =>
    post(`/achats/factures/${id}/exception`, {
      clientOperationId: newOperationId(),
      motif,
    }),
  postInvoice: (id: string, challengeId: string) =>
    post(`/achats/factures/${id}/comptabiliser`, {
      clientOperationId: newOperationId(),
      challengeId,
    }),

  accountingDashboard: async (
    societeId: string,
    du: string,
    au: string,
  ): Promise<AccountingDashboard> => {
    const q = `societeId=${encodeURIComponent(societeId)}&du=${du}&au=${au}`;
    const [balance, aging, ledger] = await Promise.all([
      apiFetch<JsonRecord[]>(`/achats/comptabilite/rapports/balance?${q}`),
      apiFetch<JsonRecord[]>(
        `/achats/comptabilite/rapports/balance-agee-fournisseurs?${q}`,
      ),
      apiFetch<JsonRecord[]>(`/achats/comptabilite/rapports/grand-livre?${q}`),
    ]);
    return { balance, aging, ledger };
  },
  paymentProposals: (status?: string) =>
    apiFetch<PaymentProposalPage>(
      `/achats/comptabilite/paiements/propositions?limit=100${
        status ? `&statut=${encodeURIComponent(status)}` : ''
      }`,
    ),
  paymentProposal: (id: string) =>
    apiFetch<PaymentProposal>(
      `/achats/comptabilite/paiements/propositions/${id}`,
    ),
  approvePayment: (id: string, challengeId: string, exceptional = false) =>
    post(
      `/achats/comptabilite/paiements/propositions/${id}/${
        exceptional ? 'approuver-exception' : 'approuver'
      }`,
      { clientOperationId: newOperationId(), challengeId },
    ),
  executePayment: (id: string, challengeId: string, reference?: string) =>
    post(`/achats/comptabilite/paiements/propositions/${id}/executer`, {
      clientOperationId: newOperationId(),
      challengeId,
      ...(reference ? { reference } : {}),
    }),

  aiDashboard: (societeId: string) =>
    apiFetch<AiDashboard>(
      `/accounting-ai/dashboard?societeId=${encodeURIComponent(societeId)}`,
    ),
  aiWorkItems: (societeId: string) =>
    apiFetch<JsonRecord[]>(
      `/accounting-ai/work-items?societeId=${encodeURIComponent(societeId)}`,
    ),
  aiFindings: (societeId: string) =>
    apiFetch<JsonRecord[]>(
      `/accounting-ai/findings?societeId=${encodeURIComponent(societeId)}`,
    ),
  decideSuggestion: (id: string, decision: 'ACCEPTED' | 'REJECTED', reason?: string) =>
    post(`/accounting-ai/suggestions/${id}/decision`, {
      decision,
      ...(reason ? { reason } : {}),
    }),
  approvePolicy: (id: string, challengeId: string) =>
    post(`/accounting-ai/policies/${id}/approve`, { challengeId }),
  resolveFinding: (id: string, resolution: string) =>
    post(`/accounting-ai/findings/${id}/resolve`, { resolution }),

  createSensitiveChallenge: (password: string, purpose: SensitivePurpose) =>
    apiFetch<SensitiveChallenge>('/auth/reauth/challenges', {
      method: 'POST',
      body: JSON.stringify(buildChallengeRequest(password, purpose)),
    }),
  uploadEvidence: async (
    type: UploadedEvidence['type'],
    sourceId: string,
    file: { uri: string; name: string; mimeType: string },
  ) => {
    const form = new FormData();
    form.append('type', type);
    form.append('sourceId', sourceId);
    form.append(
      'file',
      { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob,
    );
    return apiFetchMultipart<UploadedEvidence>('/achats/evidences', form);
  },
  downloadEvidence: (id: string, filename = `evidence-${id}`) =>
    apiDownloadPdf(`/achats/evidences/${id}/download`, filename),
};
