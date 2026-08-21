import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  Camera,
  IdCard,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Warehouse,
} from 'lucide-react';
import { ModePaiement } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { LoadingState } from './LoadingState';
import { InfoTooltip } from './InfoTooltip';
import {
  insightCouverture,
  insightMargeUnitaire,
  insightStatutProduit,
  insightSuggestionReappro,
} from '../lib/insights/produits';
import type {
  MouvementStockDto,
  ProduitAnalyseDto,
  ProduitDto,
  ProduitVenteDto,
  StatutStock,
} from '../lib/types';

type OngletFiche = 'apercu' | 'identite' | 'stock' | 'ventes' | 'mouvements';

const CATEGORIES_SUGGEREES = [
  'Protection',
  'Charge',
  'Audio',
  'Câbles',
  'Accessoires',
  'Café-Market',
  'Autre',
];

const STATUT_LABEL: Record<StatutStock, string> = {
  RUPTURE: 'Rupture',
  SOUS_SEUIL: 'Sous seuil',
  OK: 'OK',
};

const STATUT_BADGE: Record<StatutStock, string> = {
  RUPTURE: 'badge badge-critical',
  SOUS_SEUIL: 'badge badge-warning',
  OK: 'badge badge-ok',
};

const MOUVEMENT_LABEL: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'Réception',
  VENTE: 'Vente',
  RETOUR: 'Retour',
  AJUSTEMENT: 'Ajustement',
  TRANSFERT_OUT: 'Transfert sortant',
  TRANSFERT_IN: 'Transfert entrant',
  SCRAP: 'Rebut',
};

const MOUVEMENT_BADGE: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'badge badge-ok',
  RETOUR: 'badge badge-ok',
  TRANSFERT_IN: 'badge badge-ok',
  VENTE: 'badge badge-warning',
  TRANSFERT_OUT: 'badge badge-warning',
  AJUSTEMENT: 'badge',
  SCRAP: 'badge badge-critical',
};

const USAGE_LABEL: Record<string, string> = {
  STOCK: 'Stock vendable',
  ENTREE: 'Quai / entrée',
  SORTIE: 'Sortie',
  PERTE: 'Pertes',
  FOURNISSEUR: 'Virtuel fournisseur',
  CLIENT: 'Virtuel client',
};

const PAIEMENT_LABEL: Record<string, string> = {
  [ModePaiement.ESPECES]: 'Espèces',
  [ModePaiement.CARTE]: 'Carte',
  [ModePaiement.MOBILE_MONEY]: 'Mobile Money',
};

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function compresserPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Fichier image attendu (JPEG, PNG, WebP).'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Photo trop lourde (max. 8 Mo avant compression).'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Impossible de compresser la photo.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}

function useAnalyse(produitId: string) {
  return useQuery({
    queryKey: ['produits', produitId, 'analyse'],
    queryFn: () => apiFetch<ProduitAnalyseDto>(`/produits/${produitId}/analyse`),
  });
}

function useVentes(produitId: string) {
  return useQuery({
    queryKey: ['produits', produitId, 'ventes'],
    queryFn: () => apiFetch<ProduitVenteDto[]>(`/produits/${produitId}/ventes`),
  });
}

function useMouvements(produitId: string) {
  return useQuery({
    queryKey: ['produits', produitId, 'mouvements'],
    queryFn: () => apiFetch<MouvementStockDto[]>(`/produits/${produitId}/mouvements`),
  });
}

function IdentiteForm({
  produit,
  onDone,
}: {
  produit: ProduitDto;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [designation, setDesignation] = useState(produit.designation);
  const [reference, setReference] = useState(produit.reference ?? '');
  const [categorie, setCategorie] = useState(produit.categorie ?? '');
  const [description, setDescription] = useState(produit.description ?? '');
  const [prixUnitaire, setPrixUnitaire] = useState(String(Number(produit.prixUnitaire)));
  const [seuilReappro, setSeuilReappro] = useState(
    produit.seuilReappro !== null ? String(produit.seuilReappro) : '',
  );
  const [codeBarres, setCodeBarres] = useState(produit.codeBarres ?? '');
  const [methodeCout, setMethodeCout] = useState<'CMP' | 'FIFO' | 'STANDARD'>(
    produit.methodeCout ?? 'CMP',
  );
  const [strategieSortie, setStrategieSortie] = useState<'FIFO' | 'FEFO'>(
    produit.strategieSortie ?? 'FIFO',
  );
  const [imageUrl, setImageUrl] = useState(produit.imageUrl ?? '');
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>(`/produits/${produit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          designation,
          reference: reference.trim() === '' ? null : reference.trim(),
          categorie: categorie.trim() === '' ? null : categorie.trim(),
          description: description.trim() === '' ? null : description.trim(),
          prixUnitaire: Number(prixUnitaire),
          seuilReappro: seuilReappro === '' ? null : Number(seuilReappro),
          codeBarres: codeBarres.trim() === '' ? null : codeBarres.trim(),
          methodeCout,
          strategieSortie,
          imageUrl: imageUrl.trim() === '' ? null : imageUrl,
        }),
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-categories'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
      onDone();
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec de la mise à jour du produit.')),
  });

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoErr(null);
    try {
      setImageUrl(await compresserPhoto(file));
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : 'Photo refusée.');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="client-fiche-form fiche-identite-form" onSubmit={handleSubmit}>
      <datalist id="categories-suggerees-fiche">
        {CATEGORIES_SUGGEREES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="fiche-photo-field">
        <div className="fiche-photo-preview" aria-hidden>
          {imageUrl ? (
            <img src={imageUrl} alt="" />
          ) : (
            <Package size={32} />
          )}
        </div>
        <div>
          <label htmlFor="fiche-photo">Photo article</label>
          <input
            id="fiche-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
          <p className="lead">JPEG / PNG / WebP — compressée à 480 px pour le POS et la fiche.</p>
          {imageUrl ? (
            <button type="button" className="btn-ghost" onClick={() => setImageUrl('')}>
              Retirer la photo
            </button>
          ) : null}
          {photoErr ? (
            <p role="alert" className="form-error">
              {photoErr}
            </p>
          ) : null}
        </div>
      </div>

      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="fiche-designation">Désignation</label>
          <input
            id="fiche-designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="fiche-reference">Référence / SKU</label>
          <input
            id="fiche-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="COQ-IP-SIL"
          />
        </div>
      </div>
      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="fiche-categorie">Catégorie</label>
          <input
            id="fiche-categorie"
            list="categories-suggerees-fiche"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="fiche-barcode">Code-barres</label>
          <input
            id="fiche-barcode"
            value={codeBarres}
            onChange={(e) => setCodeBarres(e.target.value)}
            placeholder="Scan / EAN"
          />
        </div>
      </div>
      <label htmlFor="fiche-description">Description</label>
      <textarea
        id="fiche-description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="fiche-prix">Prix unitaire (FCFA)</label>
          <input
            id="fiche-prix"
            type="number"
            min="0.01"
            step="0.01"
            value={prixUnitaire}
            onChange={(e) => setPrixUnitaire(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="fiche-seuil">Seuil de réapprovisionnement</label>
          <input
            id="fiche-seuil"
            type="number"
            min="0"
            step="1"
            value={seuilReappro}
            onChange={(e) => setSeuilReappro(e.target.value)}
          />
        </div>
      </div>
      <p className="lead">
        Le stock ne s’édite pas ici — passer par <Link to="/stocks">Stocks</Link> ou{' '}
        <Link to="/fournisseurs">Fournisseurs</Link>.
      </p>
      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="fiche-cout">Méthode de coût</label>
          <select
            id="fiche-cout"
            value={methodeCout}
            onChange={(e) => setMethodeCout(e.target.value as 'CMP' | 'FIFO' | 'STANDARD')}
          >
            <option value="CMP">CMP</option>
            <option value="FIFO">FIFO</option>
            <option value="STANDARD">Standard</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="fiche-sortie">Sortie lots</label>
          <select
            id="fiche-sortie"
            value={strategieSortie}
            onChange={(e) => setStrategieSortie(e.target.value as 'FIFO' | 'FEFO')}
          >
            <option value="FIFO">FIFO</option>
            <option value="FEFO">FEFO</option>
          </select>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="table-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function PhotoHero({
  produit,
  peutGerer,
}: {
  produit: ProduitDto;
  peutGerer: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const initiales = produit.designation.slice(0, 2).toUpperCase();

  const photo = useMutation({
    mutationFn: (imageUrl: string | null) =>
      apiFetch<ProduitDto>(`/produits/${produit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl }),
      }),
    onSuccess: () => {
      setErr(null);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
    },
    onError: (e) => setErr(messageDepuisApi(e, 'Impossible d’enregistrer la photo.')),
  });

  return (
    <div className="fiche-hero-photo-wrap">
      <button
        type="button"
        className="client-workspace-avatar fiche-hero-photo"
        disabled={!peutGerer || photo.isPending}
        onClick={() => (peutGerer ? inputRef.current?.click() : undefined)}
        aria-label={peutGerer ? 'Changer la photo de l’article' : 'Photo article'}
      >
        {produit.imageUrl ? (
          <img src={produit.imageUrl} alt="" />
        ) : (
          <span>{initiales || <Package size={28} />}</span>
        )}
        {peutGerer ? (
          <span className="fiche-hero-photo-overlay">
            <Camera size={14} />
          </span>
        ) : null}
      </button>
      {peutGerer ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void compresserPhoto(file)
              .then((url) => photo.mutate(url))
              .catch((ex: unknown) =>
                setErr(ex instanceof Error ? ex.message : 'Photo refusée.'),
              );
          }}
        />
      ) : null}
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function StockSection({ data }: { data: ProduitAnalyseDto }) {
  const { produit, repartitionStock, suggestionReappro, stockPrevu } = data;
  const total = Math.max(produit.stock, 0);
  const tries = [...repartitionStock].sort((a, b) => b.quantite - a.quantite);
  const dominant = tries[0];

  return (
    <div className="client-workspace-section">
      <h2>Stock par emplacement</h2>
      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Réseau</div>
          <div className="client-kpi-value">{produit.stock}</div>
          <div className="client-kpi-hint">{formatFcfa(produit.valeurStock)} au CMP</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Prévu</div>
          <div className="client-kpi-value">{stockPrevu?.prevu ?? produit.stock}</div>
          <div className="client-kpi-hint">
            {stockPrevu
              ? `phys. ${stockPrevu.physique} − rés. ${stockPrevu.reserve} + PO ${stockPrevu.aRecevoir} + transit ${stockPrevu.enTransit}`
              : 'Commandes − réservations POS'}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Emplacements</div>
          <div className="client-kpi-value">{repartitionStock.length}</div>
          <div className="client-kpi-hint">
            {dominant
              ? `${dominant.code} détient ${
                  total > 0 ? Math.round((dominant.quantite / total) * 100) : 0
                } %`
              : 'aucune quantité affectée'}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Seuil</div>
          <div className="client-kpi-value">
            {produit.seuilReappro !== null ? produit.seuilReappro : '—'}
          </div>
          <div className="client-kpi-hint">
            {produit.seuilReappro === null
              ? 'non défini — pas d’alerte STOCK_BAS'
              : `alerte si réseau ≤ ${produit.seuilReappro}`}
          </div>
        </article>
      </div>

      {suggestionReappro.necessaire && (
        <div className="produits-callout" style={{ marginTop: 16 }}>
          <strong>Réappro : {suggestionReappro.quantiteSuggeree} unité(s)</strong>
          <InfoTooltip insight={insightSuggestionReappro(suggestionReappro)} />
          <p>{suggestionReappro.motif}</p>
          <div className="table-actions">
            <Link to="/stocks/reappro">Règles de réappro</Link>
            <Link to="/fournisseurs">Réception fournisseur</Link>
            <Link to="/stocks">Transfert interne</Link>
          </div>
        </div>
      )}

      {tries.length === 0 ? (
        <p className="lead" style={{ marginTop: 16 }}>
          Aucune quantité affectée à un entrepôt. Le cache réseau est à {produit.stock} — une
          réception ou un transfert créera les lignes d’emplacement.
        </p>
      ) : (
        <div className="clients-table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Emplacement</th>
                <th>Usage</th>
                <th>Quantité</th>
                <th>Part</th>
                <th>Valeur CMP</th>
                <th>Statut local</th>
              </tr>
            </thead>
            <tbody>
              {tries.map((q) => {
                const part = total > 0 ? Math.round((q.quantite / total) * 100) : 0;
                const statut = q.statut ?? 'OK';
                return (
                  <tr key={q.entrepotId}>
                    <td>
                      <Link to={`/stocks/entrepots/${q.entrepotId}`}>
                        {q.nom}
                      </Link>
                      <div className="produit-ref">
                        {q.code}
                        {q.boutique ? ` · ${q.boutique}` : ''}
                      </div>
                    </td>
                    <td>
                      {USAGE_LABEL[q.usage ?? 'STOCK'] ?? q.usage}
                      {q.virtuel ? ' · virtuel' : ''}
                    </td>
                    <td>
                      <strong>{q.quantite}</strong>
                    </td>
                    <td>
                      <div className="stock-share" title={`${part} % du réseau`}>
                        <span className="stock-share-bar" style={{ width: `${part}%` }} />
                        <span>{part} %</span>
                      </div>
                    </td>
                    <td className="money">{formatFcfa(q.valeur ?? 0)}</td>
                    <td>
                      <span className={STATUT_BADGE[statut]}>{STATUT_LABEL[statut]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="lead" style={{ marginTop: 12 }}>
        Le statut local compare la quantité de l’emplacement au seuil réseau. Le stock vendable
        ne se corrige jamais ici — uniquement par réception, transfert, vente ou inventaire.
      </p>
    </div>
  );
}

function VentesSection({
  produitId,
  prixCatalogue,
}: {
  produitId: string;
  prixCatalogue: string;
}) {
  const { data: ventes, isLoading, isError } = useVentes(produitId);
  if (isLoading) return <LoadingState label="Chargement des ventes..." />;
  if (isError) return <p role="alert">Erreur lors du chargement des ventes.</p>;
  if (!ventes || ventes.length === 0) {
    return (
      <p className="lead">
        Aucune vente rattachée. Les tickets POS anonymes et nominatifs apparaîtront ici (50
        dernières lignes).
      </p>
    );
  }

  const qty = ventes.reduce((n, v) => n + v.quantite, 0);
  const ca = ventes.reduce((n, v) => n + Number(v.montant), 0);
  const remises = ventes.reduce((n, v) => n + Number(v.remise), 0);
  const tickets = new Set(ventes.map((v) => v.venteId)).size;
  const derniere = ventes[0];
  const parBoutique = new Map<string, { qty: number; ca: number }>();
  for (const v of ventes) {
    const k = v.boutique ?? 'Sans boutique';
    const acc = parBoutique.get(k) ?? { qty: 0, ca: 0 };
    acc.qty += v.quantite;
    acc.ca += Number(v.montant);
    parBoutique.set(k, acc);
  }
  const prixMoyen = qty > 0 ? ca / qty : 0;
  const prixCat = Number(prixCatalogue);
  const ecartPrix =
    prixCat > 0 ? Math.round(((prixMoyen - prixCat) / prixCat) * 100) : null;

  return (
    <>
      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Lignes</div>
          <div className="client-kpi-value">{ventes.length}</div>
          <div className="client-kpi-hint">{tickets} ticket(s)</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Unités</div>
          <div className="client-kpi-value">{qty}</div>
          <div className="client-kpi-hint">historique chargé</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">CA lignes</div>
          <div className="client-kpi-value client-kpi-value-sm money">{formatFcfa(ca)}</div>
          <div className="client-kpi-hint">
            {remises > 0 ? `dont ${formatFcfa(remises)} de remises` : 'hors retours'}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Prix moyen</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {formatFcfa(prixMoyen)}
          </div>
          <div className="client-kpi-hint">
            {ecartPrix === null
              ? 'vs catalogue'
              : `${ecartPrix > 0 ? '+' : ''}${ecartPrix} % vs catalogue`}
          </div>
        </article>
      </div>
      <p className="lead" style={{ marginTop: 12 }}>
        Dernière vente le {new Date(derniere.dateVente).toLocaleString('fr-FR')}
        {derniere.boutique ? ` · ${derniere.boutique}` : ''}.
      </p>
      {parBoutique.size > 1 && (
        <div className="client-pdv-chips" style={{ margin: '8px 0 12px' }}>
          {[...parBoutique.entries()].map(([nom, s]) => (
            <span key={nom} className="badge badge-neutral">
              {nom}
              <span className="client-pdv-chip-meta">
                {' '}
                · {s.qty} u. · {formatFcfa(s.ca)}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="clients-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Boutique</th>
              <th>Paiement</th>
              <th>Qté</th>
              <th>Prix</th>
              <th>Remise</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            {ventes.map((v) => (
              <tr key={v.ligneId}>
                <td>{new Date(v.dateVente).toLocaleString('fr-FR')}</td>
                <td>{v.boutique ?? '—'}</td>
                <td>
                  <span className={`badge badge-paiement badge-paiement-${v.modePaiement.toLowerCase()}`}>
                    {PAIEMENT_LABEL[v.modePaiement] ?? v.modePaiement}
                  </span>
                </td>
                <td>{v.quantite}</td>
                <td className="money">{formatFcfa(v.prixUnitaire)}</td>
                <td className="money">
                  {Number(v.remise) > 0 ? formatFcfa(v.remise) : '—'}
                </td>
                <td className="money">{formatFcfa(v.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MouvementsSection({ produitId }: { produitId: string }) {
  const [filtre, setFiltre] = useState<MouvementStockDto['type'] | ''>('');
  const { data: mouvements, isLoading, isError } = useMouvements(produitId);
  if (isLoading) return <LoadingState label="Chargement des mouvements..." />;
  if (isError) return <p role="alert">Erreur lors du chargement des mouvements.</p>;
  if (!mouvements || mouvements.length === 0) {
    return (
      <p className="lead">
        Aucun mouvement. Le grand livre se constitue à la première réception, vente, transfert
        ou ajustement — jamais en éditant le stock sur la fiche.
      </p>
    );
  }

  const filtres = filtre ? mouvements.filter((m) => m.type === filtre) : mouvements;
  const entrees = mouvements.filter((m) => m.quantite > 0).reduce((n, m) => n + m.quantite, 0);
  const sorties = mouvements.filter((m) => m.quantite < 0).reduce((n, m) => n + m.quantite, 0);
  const typesPresents = [...new Set(mouvements.map((m) => m.type))];

  return (
    <>
      <div className="client-kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Écritures</div>
          <div className="client-kpi-value">{mouvements.length}</div>
          <div className="client-kpi-hint">200 dernières</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Entrées</div>
          <div className="client-kpi-value qty-in">+{entrees}</div>
          <div className="client-kpi-hint">réceptions, retours, transferts in</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Sorties</div>
          <div className="client-kpi-value qty-out">{sorties}</div>
          <div className="client-kpi-hint">ventes, transferts out, rebuts</div>
        </article>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="filtre-mvt">Type</label>
          <select
            id="filtre-mvt"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value as MouvementStockDto['type'] | '')}
          >
            <option value="">Tous</option>
            {typesPresents.map((t) => (
              <option key={t} value={t}>
                {MOUVEMENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="clients-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Entrepôt</th>
              <th>Quantité</th>
              <th>Avant → après</th>
              <th>Réf.</th>
              <th>Par</th>
            </tr>
          </thead>
          <tbody>
            {filtres.map((m) => {
              const avant = m.stockApres - m.quantite;
              const qui = m.utilisateur
                ? `${m.utilisateur.prenom} ${m.utilisateur.nom}`.trim()
                : '—';
              return (
                <tr key={m.id} className="produit-row">
                  <td>
                    <Link to={`/stocks/mouvements/${m.id}`}>
                      {new Date(m.dateHeure).toLocaleString('fr-FR')}
                    </Link>
                  </td>
                  <td>
                    <span className={MOUVEMENT_BADGE[m.type]}>
                      {MOUVEMENT_LABEL[m.type] ?? m.type}
                    </span>
                  </td>
                  <td>
                    {m.entrepot?.nom ?? '—'}
                    {m.entrepot?.boutique?.nom ? (
                      <div className="produit-ref">{m.entrepot.boutique.nom}</div>
                    ) : null}
                  </td>
                  <td className={m.quantite >= 0 ? 'qty-in' : 'qty-out'}>
                    {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                  </td>
                  <td>
                    {avant} → <strong>{m.stockApres}</strong>
                  </td>
                  <td className="produit-ref" style={{ margin: 0 }}>
                    {m.reference ?? '—'}
                  </td>
                  <td>{qui}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FicheProduit({
  produitId,
  peutGerer,
  onBack,
}: {
  produitId: string;
  peutGerer: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAnalyse(produitId);
  const ventesQ = useVentes(produitId);
  const mvtsQ = useMouvements(produitId);
  const [onglet, setOnglet] = useState<OngletFiche>('apercu');
  const [edition, setEdition] = useState(false);

  const toggleActif = useMutation({
    mutationFn: (actif: boolean) =>
      apiFetch<ProduitDto>(`/produits/${produitId}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
    },
  });

  const manques = useMemo(() => {
    if (!data) return [];
    const p = data.produit;
    const items: string[] = [];
    if (!p.imageUrl) items.push('photo');
    if (!p.reference) items.push('SKU');
    if (!p.categorie) items.push('catégorie');
    if (!p.codeBarres) items.push('code-barres');
    if (p.seuilReappro === null) items.push('seuil réappro');
    if (Number(p.coutMoyenPondere) <= 0) items.push('CMP (réception)');
    return items;
  }, [data]);

  if (isLoading) return <LoadingState label="Chargement de la fiche..." />;
  if (isError || !data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Retour au catalogue
        </button>
        <p role="alert">Impossible de charger la fiche produit.</p>
      </div>
    );
  }

  const { produit, repartitionStock, performance30j, suggestionReappro, stockPrevu } = data;
  const nbVentes = ventesQ.data?.length ?? 0;
  const nbMvts = mvtsQ.data?.length ?? 0;

  const tabs: Array<{
    id: OngletFiche;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'apercu', label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'identite', label: 'Identité', icon: IdCard },
    { id: 'stock', label: 'Stock', icon: Warehouse, count: produit.stock },
    { id: 'ventes', label: 'Ventes', icon: ShoppingBag, count: nbVentes },
    { id: 'mouvements', label: 'Mouvements', icon: BookOpen, count: nbMvts },
  ];

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Catalogue
        </button>
        <div className="client-workspace-toolbar-actions">
          {peutGerer && (
            <>
              {onglet === 'identite' && !edition && (
                <button type="button" className="btn-primary" onClick={() => setEdition(true)}>
                  Modifier
                </button>
              )}
              <button
                type="button"
                disabled={toggleActif.isPending}
                onClick={() => toggleActif.mutate(!produit.actif)}
              >
                {produit.actif ? 'Désactiver' : 'Réactiver'}
              </button>
            </>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <PhotoHero produit={produit} peutGerer={peutGerer} />
        <div className="client-workspace-hero-main">
          <h1>{produit.designation}</h1>
          <p className="client-workspace-hero-sub">
            {produit.reference ?? 'Sans SKU'}
            {produit.categorie ? ` · ${produit.categorie}` : ''}
            {produit.codeBarres ? ` · EAN ${produit.codeBarres}` : ''}
            {produit.uniteMesure ? ` · ${produit.uniteMesure}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={STATUT_BADGE[produit.statutStock]}>
              {STATUT_LABEL[produit.statutStock]}
            </span>
            <InfoTooltip
              insight={insightStatutProduit(
                produit.stock,
                produit.seuilReappro,
                produit.actif,
              )}
            />
            {!produit.actif && <span className="badge badge-neutral">Inactif</span>}
            {produit.categorie && (
              <span className="badge badge-neutral">{produit.categorie}</span>
            )}
            {Number(produit.coutMoyenPondere) <= 0 && (
              <span className="badge badge-warning">CMP à 0</span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Prix</strong> {formatFcfa(produit.prixUnitaire)}
            </span>
            <span>
              <strong>Stock réseau</strong> {produit.stock}
              {produit.seuilReappro !== null ? ` (seuil ${produit.seuilReappro})` : ''}
            </span>
            <span>
              <strong>Marge</strong> {produit.tauxMarge} %
            </span>
            <span>
              <strong>CMP</strong> {formatFcfa(produit.coutMoyenPondere)}
            </span>
          </div>
        </div>
      </header>

      <nav className="client-workspace-tabs" aria-label="Sections fiche produit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={onglet === tab.id ? 'actif' : ''}
            onClick={() => {
              setOnglet(tab.id);
              setEdition(false);
            }}
          >
            <tab.icon size={14} aria-hidden />
            {tab.label}
            {tab.count !== undefined ? (
              <span className="fiche-tab-count">{tab.count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <section className="client-workspace-panel" aria-live="polite">
        {onglet === 'apercu' && (
          <div className="client-workspace-section">
            <h2>Indicateurs</h2>
            <div className="client-kpi-grid">
              <article className="client-kpi-card">
                <div className="client-kpi-label">Prix de vente</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {formatFcfa(produit.prixUnitaire)}
                </div>
                <div className="client-kpi-hint">catalogue</div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">
                  Marge unitaire
                  <InfoTooltip
                    insight={insightMargeUnitaire(
                      produit.margeUnitaire,
                      produit.tauxMarge,
                      produit.coutMoyenPondere,
                    )}
                  />
                </div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {formatFcfa(produit.margeUnitaire)}
                </div>
                <div className="client-kpi-hint">
                  {produit.tauxMarge} % · CMP {formatFcfa(produit.coutMoyenPondere)}
                </div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">Stock réseau</div>
                <div className="client-kpi-value">{produit.stock}</div>
                <div className="client-kpi-hint">{formatFcfa(produit.valeurStock)} au CMP</div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">Stock prévu</div>
                <div className="client-kpi-value">{stockPrevu?.prevu ?? produit.stock}</div>
                <div className="client-kpi-hint">
                  {stockPrevu
                    ? `physique ${stockPrevu.physique} − rés. ${stockPrevu.reserve} + PO ${stockPrevu.aRecevoir} + transit ${stockPrevu.enTransit}`
                    : 'Commandes confirmées − réservations POS'}
                </div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">
                  Couverture
                  <InfoTooltip
                    insight={insightCouverture(
                      performance30j.joursCouverture,
                      performance30j.quantiteVendue,
                    )}
                  />
                </div>
                <div className="client-kpi-value client-kpi-value-sm">
                  {performance30j.joursCouverture !== null
                    ? `${performance30j.joursCouverture} j`
                    : '—'}
                </div>
                <div className="client-kpi-hint">
                  {performance30j.quantiteVendue} u. vendues / 30 j
                </div>
              </article>
            </div>

            {suggestionReappro.necessaire && (
              <div className="produits-callout" style={{ marginTop: 16 }}>
                <strong>Réappro : {suggestionReappro.quantiteSuggeree} unité(s)</strong>
                <InfoTooltip insight={insightSuggestionReappro(suggestionReappro)} />
                <p>{suggestionReappro.motif}</p>
                <div className="table-actions">
                  <Link to="/fournisseurs">Réception fournisseur</Link>
                  <Link to="/stocks">Transfert / stocks</Link>
                </div>
              </div>
            )}

            <div className="client-workspace-split">
              <div className="panel client-workspace-card">
                <h3>Performance 30 jours</h3>
                <dl className="clients-dl">
                  <div>
                    <dt>Quantité nette</dt>
                    <dd>{performance30j.quantiteVendue}</dd>
                  </div>
                  <div>
                    <dt>CA net</dt>
                    <dd className="money">{formatFcfa(performance30j.chiffreAffaires)}</dd>
                  </div>
                  <div>
                    <dt>Coût des ventes</dt>
                    <dd className="money">{formatFcfa(performance30j.coutDesVentes)}</dd>
                  </div>
                  <div>
                    <dt>Marge brute</dt>
                    <dd className="money">{formatFcfa(performance30j.margeBrute)}</dd>
                  </div>
                </dl>
              </div>
              <div className="panel client-workspace-card">
                <h3>
                  Répartition stock <BarChart3 size={14} aria-hidden />
                </h3>
                {repartitionStock.length === 0 ? (
                  <p className="lead">Aucune quantité affectée à un entrepôt.</p>
                ) : (
                  <ul className="produits-repartition">
                    {[...repartitionStock]
                      .sort((a, b) => b.quantite - a.quantite)
                      .map((q) => (
                        <li key={q.entrepotId}>
                          <span>
                            <Link to={`/stocks/entrepots/${q.entrepotId}`}>{q.nom}</Link>
                            <small>
                              {q.code}
                              {q.boutique ? ` · ${q.boutique}` : ''}
                            </small>
                          </span>
                          <strong>{q.quantite}</strong>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {onglet === 'identite' && (
          <div className="client-workspace-section">
            <h2>Fiche catalogue</h2>
            {edition && peutGerer ? (
              <IdentiteForm produit={produit} onDone={() => setEdition(false)} />
            ) : (
              <>
                {manques.length > 0 && (
                  <p className="fiche-completude">
                    À compléter : {manques.join(', ')}.
                    {peutGerer ? ' Cliquez Modifier pour enrichir la fiche.' : ''}
                  </p>
                )}
                <div className="fiche-identite-grid">
                  <div className="fiche-photo-preview fiche-photo-preview-lg" aria-hidden>
                    {produit.imageUrl ? (
                      <img src={produit.imageUrl} alt="" />
                    ) : (
                      <Package size={40} />
                    )}
                  </div>
                  <div>
                    {produit.description && <p>{produit.description}</p>}
                    <dl className="clients-dl">
                      <div>
                        <dt>Désignation</dt>
                        <dd>{produit.designation}</dd>
                      </div>
                      <div>
                        <dt>Référence</dt>
                        <dd>{produit.reference ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Catégorie</dt>
                        <dd>{produit.categorie ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>État</dt>
                        <dd>{produit.actif ? 'Actif — vendable en POS' : 'Inactif'}</dd>
                      </div>
                      <div>
                        <dt>Prix de vente</dt>
                        <dd className="money">{formatFcfa(produit.prixUnitaire)}</dd>
                      </div>
                      <div>
                        <dt>CMP</dt>
                        <dd className="money">{formatFcfa(produit.coutMoyenPondere)}</dd>
                      </div>
                      <div>
                        <dt>Seuil réappro</dt>
                        <dd>{produit.seuilReappro ?? 'Non défini'}</dd>
                      </div>
                      <div>
                        <dt>Code-barres</dt>
                        <dd>{produit.codeBarres ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Méthode de coût</dt>
                        <dd>{produit.methodeCout ?? 'CMP'}</dd>
                      </div>
                      <div>
                        <dt>Sortie lots</dt>
                        <dd>{produit.strategieSortie ?? 'FIFO'}</dd>
                      </div>
                      <div>
                        <dt>Unité</dt>
                        <dd>{produit.uniteMesure ?? 'UN'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {onglet === 'stock' && <StockSection data={data} />}

        {onglet === 'ventes' && (
          <div className="client-workspace-section">
            <h2>Historique des ventes</h2>
            <VentesSection produitId={produit.id} prixCatalogue={produit.prixUnitaire} />
          </div>
        )}

        {onglet === 'mouvements' && (
          <div className="client-workspace-section">
            <h2>Grand livre stock</h2>
            <MouvementsSection produitId={produit.id} />
          </div>
        )}
      </section>
    </div>
  );
}
