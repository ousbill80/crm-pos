import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  shopFetch,
  type PanierDto,
  type PanierLigne,
} from './api';

type CartCtx = {
  panier: PanierDto | undefined;
  isLoading: boolean;
  count: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  ensurePanier: () => Promise<PanierDto>;
  setQuantite: (produitId: string, quantite: number) => Promise<void>;
  addProduit: (produitId: string, quantite?: number) => Promise<void>;
  removeProduit: (produitId: string) => Promise<void>;
  clear: () => Promise<void>;
};

const CartContext = createContext<CartCtx | null>(null);

async function syncLignes(lignes: Array<{ produitId: string; quantite: number }>) {
  return shopFetch<PanierDto>('/shop/panier/lignes', {
    method: 'PATCH',
    body: JSON.stringify({ lignes }),
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: panier, isLoading } = useQuery({
    queryKey: ['panier'],
    queryFn: () => shopFetch<PanierDto>('/shop/panier'),
    retry: false,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['panier'] });
  }, [qc]);

  const ensurePanier = useCallback(async () => {
    try {
      return await shopFetch<PanierDto>('/shop/panier');
    } catch {
      const created = await shopFetch<PanierDto>('/shop/panier', { method: 'POST' });
      invalidate();
      return created;
    }
  }, [invalidate]);

  const mutateLignes = useMutation({
    mutationFn: syncLignes,
    onSuccess: (data) => {
      qc.setQueryData(['panier'], data);
    },
  });

  const setQuantite = useCallback(
    async (produitId: string, quantite: number) => {
      await ensurePanier();
      const current =
        (qc.getQueryData(['panier']) as PanierDto | undefined)?.lignes ??
        (await shopFetch<PanierDto>('/shop/panier')).lignes;
      const map = new Map(current.map((l) => [l.produitId, l.quantite]));
      if (quantite <= 0) map.delete(produitId);
      else map.set(produitId, quantite);
      const lignes = [...map.entries()].map(([id, q]) => ({
        produitId: id,
        quantite: q,
      }));
      await mutateLignes.mutateAsync(lignes);
    },
    [ensurePanier, mutateLignes, qc],
  );

  const addProduit = useCallback(
    async (produitId: string, quantite = 1) => {
      await ensurePanier();
      let current: PanierLigne[] = [];
      try {
        current =
          (qc.getQueryData(['panier']) as PanierDto | undefined)?.lignes ??
          (await shopFetch<PanierDto>('/shop/panier')).lignes;
      } catch {
        current = [];
      }
      const map = new Map(current.map((l) => [l.produitId, l.quantite]));
      map.set(produitId, (map.get(produitId) ?? 0) + quantite);
      const lignes = [...map.entries()].map(([id, q]) => ({
        produitId: id,
        quantite: q,
      }));
      await mutateLignes.mutateAsync(lignes);
      setDrawerOpen(true);
    },
    [ensurePanier, mutateLignes, qc],
  );

  const removeProduit = useCallback(
    async (produitId: string) => setQuantite(produitId, 0),
    [setQuantite],
  );

  const clear = useCallback(async () => {
    await ensurePanier();
    await mutateLignes.mutateAsync([]);
  }, [ensurePanier, mutateLignes]);

  const count = useMemo(
    () => panier?.lignes.reduce((s, l) => s + l.quantite, 0) ?? 0,
    [panier],
  );

  const value = useMemo<CartCtx>(
    () => ({
      panier,
      isLoading,
      count,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      ensurePanier,
      setQuantite,
      addProduit,
      removeProduit,
      clear,
    }),
    [
      panier,
      isLoading,
      count,
      drawerOpen,
      ensurePanier,
      setQuantite,
      addProduit,
      removeProduit,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart hors CartProvider');
  return ctx;
}
