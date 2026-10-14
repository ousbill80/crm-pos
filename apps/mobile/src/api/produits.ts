import { apiFetch } from '../api';
import type { ClassementProduitsDto } from '../navigation/types';

export function getClassementProduits() {
  return apiFetch<ClassementProduitsDto>('/produits/classement');
}
