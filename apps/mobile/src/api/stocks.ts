import { apiFetch } from '../api';
import type { StockQuantDto, StockSyntheseDto } from '../navigation/types';

export function getStockSynthese(entrepotId?: string) {
  const qs = entrepotId ? `?entrepotId=${entrepotId}` : '';
  return apiFetch<StockSyntheseDto>(`/stocks/synthese${qs}`);
}

export function getStockQuants(entrepotId: string) {
  return apiFetch<StockQuantDto[]>(`/stocks?entrepotId=${entrepotId}`);
}
