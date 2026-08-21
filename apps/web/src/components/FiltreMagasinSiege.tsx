import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { type RoleLibelle, profilOf } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { BoutiqueDto, StatutStockLigne, StockSyntheseDto } from '../lib/types';

const PARAM = 'boutiqueId';

export function peutFiltrerMagasinSiege(role: RoleLibelle | undefined): boolean {
  if (!role) return false;
  const p = profilOf(role).perimetre;
  return p === 'RESEAU' || p === 'SYSTEME' || p === 'ZONE' || p === 'CRM';
}

export function useFiltreMagasinSiege() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = peutFiltrerMagasinSiege(user?.role);
  const boutiqueId = visible ? (params.get(PARAM) ?? '') : '';

  const boutiquesQ = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: visible,
  });

  function setBoutiqueId(id: string) {
    const next = new URLSearchParams(params);
    if (id) next.set(PARAM, id);
    else next.delete(PARAM);
    setParams(next, { replace: true });
  }

  const boutiques = boutiquesQ.data ?? [];
  const nomMagasin = boutiques.find((b) => b.id === boutiqueId)?.nom ?? null;

  return {
    visible,
    boutiqueId,
    setBoutiqueId,
    boutiques,
    nomMagasin,
  };
}

export function libellePerimetrePage(
  role: RoleLibelle | undefined,
  opts: {
    boutiqueId: string;
    nomMagasin: string | null;
    texteReseau: string;
    texteBoutique?: string;
  },
): string {
  if (!role) return opts.texteReseau;
  const p = profilOf(role).perimetre;
  if (p === 'BOUTIQUE') return opts.texteBoutique ?? opts.texteReseau;
  if (!peutFiltrerMagasinSiege(role)) return opts.texteReseau;
  if (opts.boutiqueId) {
    const magasin = opts.nomMagasin ?? 'magasin';
    return `Périmètre magasin · ${magasin} — ${opts.texteReseau}`;
  }
  if (p === 'ZONE') return `Périmètre zone — ${opts.texteReseau}`;
  return `Périmètre réseau — ${opts.texteReseau}`;
}

export function FiltreMagasinSiege({
  id = 'filtre-magasin-siege',
}: {
  id?: string;
}) {
  const { visible, boutiqueId, setBoutiqueId, boutiques } = useFiltreMagasinSiege();
  if (!visible || boutiques.length === 0) return null;
  return (
    <div>
      <label htmlFor={id}>Magasin</label>
      <select
        id={id}
        value={boutiqueId}
        onChange={(e) => setBoutiqueId(e.target.value)}
      >
        <option value="">Tous les magasins (réseau)</option>
        {boutiques.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

export function idsEntrepotsDuMagasin(
  entrepots: Array<{ id: string; boutiqueId: string }>,
  boutiqueId: string,
): Set<string> {
  return new Set(
    entrepots.filter((e) => e.boutiqueId === boutiqueId).map((e) => e.id),
  );
}

export function statutStockDepuisQty(
  stock: number,
  seuil: number | null,
): StatutStockLigne {
  if (stock <= 0) return 'RUPTURE';
  if (seuil != null && stock <= seuil) return 'SOUS_SEUIL';
  return 'OK';
}

export function restreindreSyntheseAuMagasin(
  data: StockSyntheseDto,
  boutiqueId: string,
): StockSyntheseDto {
  const parEntrepot = data.parEntrepot.filter((e) => e.boutiqueId === boutiqueId);
  const ids = new Set(parEntrepot.map((e) => e.entrepotId));
  const lignes = data.lignes.map((l) => {
    const cells = l.parEntrepot.filter((c) => ids.has(c.entrepotId));
    const stock = cells.reduce((n, c) => n + c.quantite, 0);
    const statut = statutStockDepuisQty(stock, l.seuilReappro);
    const valeur =
      Number(l.coutMoyenPondere) * stock;
    return {
      ...l,
      stockReseau: stock,
      valeur: String(valeur),
      statut,
      parEntrepot: cells,
    };
  });
  const ruptures = lignes.filter((l) => l.actif && l.statut === 'RUPTURE').length;
  const sousSeuil = lignes.filter((l) => l.actif && l.statut === 'SOUS_SEUIL').length;
  const unitesTotales = parEntrepot.reduce((n, e) => n + e.unites, 0);
  const valeurStock = parEntrepot.reduce((n, e) => n + Number(e.valeur), 0);
  const skuDistincts = lignes.filter((l) => l.actif && l.stockReseau > 0).length;
  const sante: StockSyntheseDto['sante'] =
    ruptures > 0 ? 'CRITIQUE' : sousSeuil > 0 ? 'VIGILANCE' : 'OK';
  return {
    ...data,
    sante,
    kpis: {
      skuDistincts,
      unitesTotales,
      valeurStock: String(valeurStock),
      ruptures,
      sousSeuil,
      couvertureJoursMediane: data.kpis.couvertureJoursMediane,
    },
    parEntrepot,
    lignes,
    suggestionsTransfert: data.suggestionsTransfert.filter(
      (s) => ids.has(s.entrepotSourceId) || ids.has(s.entrepotDestId),
    ),
  };
}
