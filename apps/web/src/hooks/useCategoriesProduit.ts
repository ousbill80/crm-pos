import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { fusionnerCategoriesProduit } from '../lib/categories-produit';

export function useCategoriesProduit(
  valeurCourante?: string | null,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ['produits-categories'],
    queryFn: () => apiFetch<string[]>('/produits/categories'),
    enabled,
  });

  const options = useMemo(
    () => fusionnerCategoriesProduit(query.data ?? [], valeurCourante),
    [query.data, valeurCourante],
  );

  return { ...query, options };
}
