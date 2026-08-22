import { apiFetch } from '../api';
import { newClientOperationId } from '../lib/id';
import type { CaisseDto, SoldeDto, TransactionDto } from '../navigation/types';

export function listCaisses() {
  return apiFetch<CaisseDto[]>('/caisses');
}

export function getSolde(caisseId: string) {
  return apiFetch<SoldeDto>(`/caisses/${caisseId}/solde`);
}

export function listTransactions(query?: {
  statut?: string;
  type?: string;
  caisseId?: string;
}) {
  const params = new URLSearchParams();
  if (query?.statut) params.set('statut', query.statut);
  if (query?.type) params.set('type', query.type);
  if (query?.caisseId) params.set('caisseId', query.caisseId);
  const qs = params.toString();
  return apiFetch<TransactionDto[]>(`/transactions${qs ? `?${qs}` : ''}`);
}

export function getTransaction(id: string) {
  return apiFetch<TransactionDto>(`/transactions/${id}`);
}

export function initierSortieFonds(input: {
  caisseId: string;
  montant: number;
  clientOperationId?: string;
}) {
  return apiFetch<TransactionDto>('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      caisseId: input.caisseId,
      type: 'SORTIE_FONDS',
      montant: input.montant,
      clientOperationId: input.clientOperationId ?? newClientOperationId(),
    }),
  });
}

export function passerEnTransit(id: string) {
  return apiFetch<TransactionDto>(`/transactions/${id}/transit`, {
    method: 'PATCH',
  });
}

export function receptionner(id: string) {
  return apiFetch<TransactionDto>(`/transactions/${id}/receptionner`, {
    method: 'PATCH',
  });
}

export function rapprocher(id: string, montantRecu: number) {
  return apiFetch<TransactionDto>(`/transactions/${id}/rapprocher`, {
    method: 'PATCH',
    body: JSON.stringify({ montantRecu }),
  });
}

export function regulariser(
  id: string,
  input: { montantRetenu: number; motif: string },
) {
  return apiFetch<TransactionDto>(`/transactions/${id}/regulariser`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
