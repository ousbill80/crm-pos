import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Calendar, Minus, Plus, Trash2 } from 'lucide-react';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { fmtFcfa } from '../lib/achats-ui';
import { EntityFinder } from './EntityFinder';
import type {
  FournisseurDto,
  FournisseurProduitStatsDto,
  ProduitDto,
} from '../lib/types';

export type LigneBonCommande = {
  key: string;
  produitId: string;
  quantite: string;
  prixUnitaire: string;
};

interface BonCommandeComposerProps {
  fournisseurs: FournisseurDto[];
  produits: ProduitDto[];
  statsFournisseur: FournisseurProduitStatsDto[];
  statsLoading?: boolean;
  fournisseurId: string;
  onFournisseurId: (id: string) => void;
  lignes: LigneBonCommande[];
  onLignes: (lignes: LigneBonCommande[]) => void;
  notes: string;
  onNotes: (notes: string) => void;
  formErr: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** SI / DG / DAF : auto-création article depuis le finder. */
  allowCreateArticle?: boolean;
  onProduitCree?: (produit: ProduitDto) => void;
}

function nouvelleLigne(
  produitId: string,
  quantite: string,
  prixUnitaire: string,
): LigneBonCommande {
  return { key: crypto.randomUUID(), produitId, quantite, prixUnitaire };
}

function prixSuggere(
  produit: ProduitDto,
  stats: Map<string, FournisseurProduitStatsDto>,
): { valeur: string; source: 'dernier' | 'cmp' | null } {
  const dernier = stats.get(produit.id)?.dernierPrix;
  if (dernier && Number(dernier) > 0) {
    return { valeur: String(Number(dernier)), source: 'dernier' };
  }
  const cmp = Number(produit.coutMoyenPondere);
  if (cmp > 0) return { valeur: String(cmp), source: 'cmp' };
  return { valeur: '', source: null };
}

function qteSuggeree(produit: ProduitDto): string {
  if (produit.seuilReappro != null && produit.stock < produit.seuilReappro) {
    return String(Math.max(1, produit.seuilReappro - produit.stock));
  }
  return '1';
}

function badgeStock(statut: ProduitDto['statutStock']): string | null {
  if (statut === 'RUPTURE') return 'Rupture';
  if (statut === 'SOUS_SEUIL') return 'Sous seuil';
  return null;
}

function libelleProduit(p: ProduitDto): string {
  return p.reference ? `${p.designation} · ${p.reference}` : p.designation;
}

export function BonCommandeComposer({
  fournisseurs,
  produits,
  statsFournisseur,
  statsLoading = false,
  fournisseurId,
  onFournisseurId,
  lignes,
  onLignes,
  notes,
  onNotes,
  formErr,
  submitting,
  onSubmit,
  onCancel,
  allowCreateArticle = false,
  onProduitCree,
}: BonCommandeComposerProps) {
  const [recherche, setRecherche] = useState('');
  const [crees, setCrees] = useState<ProduitDto[]>([]);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [creationErr, setCreationErr] = useState<string | null>(null);
  const [lignePulse, setLignePulse] = useState<string | null>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const catalogue = useMemo(() => {
    const ids = new Set(produits.map((p) => p.id));
    return [...produits, ...crees.filter((p) => !ids.has(p.id))];
  }, [produits, crees]);

  const produitsParId = useMemo(
    () => new Map(catalogue.map((p) => [p.id, p])),
    [catalogue],
  );
  const statsParProduit = useMemo(
    () => new Map(statsFournisseur.map((s) => [s.produitId, s])),
    [statsFournisseur],
  );
  const idsCommandes = useMemo(
    () => new Set(lignes.map((l) => l.produitId)),
    [lignes],
  );

  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  const aujourdHui = useMemo(
    () =>
      new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  const habituels = useMemo(
    () =>
      statsFournisseur
        .filter((s) => produitsParId.has(s.produitId) && !idsCommandes.has(s.produitId))
        .slice(0, 10),
    [statsFournisseur, produitsParId, idsCommandes],
  );

  const finderOptions = useMemo(
    () =>
      catalogue.map((p) => ({
        label: libelleProduit(p),
        keywords: [p.designation, p.reference ?? '', p.codeBarres ?? '', p.categorie ?? ''].join(
          ' ',
        ),
      })),
    [catalogue],
  );

  function trouverProduit(saisie: string): ProduitDto | undefined {
    const q = saisie.trim().toLowerCase();
    if (!q) return undefined;
    return catalogue.find((p) => {
      if (libelleProduit(p).toLowerCase() === q) return true;
      if (p.designation.toLowerCase() === q) return true;
      if (p.reference && p.reference.toLowerCase() === q) return true;
      if (p.codeBarres && p.codeBarres.toLowerCase() === q) return true;
      return false;
    });
  }

  function focusQte(key: string) {
    requestAnimationFrame(() => {
      const el = qtyRefs.current.get(key);
      el?.focus();
      el?.select();
    });
  }

  function pulse(key: string) {
    setLignePulse(key);
    window.setTimeout(() => setLignePulse((cur) => (cur === key ? null : cur)), 700);
  }

  function ajouterProduit(produit: ProduitDto) {
    const existante = lignes.find((l) => l.produitId === produit.id);
    if (existante) {
      const next = lignes.map((l) =>
        l.key === existante.key
          ? { ...l, quantite: String(Math.max(1, Number(l.quantite) + 1)) }
          : l,
      );
      onLignes(next);
      pulse(existante.key);
      focusQte(existante.key);
    } else {
      const prix = prixSuggere(produit, statsParProduit);
      const ligne = nouvelleLigne(produit.id, qteSuggeree(produit), prix.valeur);
      onLignes([...lignes, ligne]);
      pulse(ligne.key);
      focusQte(ligne.key);
    }
    setRecherche('');
    setCreationErr(null);
  }

  async function creerEtAjouter(designation: string) {
    const nom = designation.trim();
    if (!nom || creationEnCours) return;
    setCreationEnCours(true);
    setCreationErr(null);
    try {
      const created = await apiFetch<ProduitDto>('/produits', {
        method: 'POST',
        body: JSON.stringify({
          designation: nom,
          prixUnitaire: 1,
          stock: 0,
        }),
      });
      setCrees((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
      onProduitCree?.(created);
      ajouterProduit(created);
    } catch (err) {
      setCreationErr(messageDepuisApi(err, 'Impossible de créer l’article.'));
    } finally {
      setCreationEnCours(false);
    }
  }

  function onSelectArticle(label: string, meta: { created: boolean }) {
    if (meta.created) {
      void creerEtAjouter(label);
      return;
    }
    const produit = trouverProduit(label);
    if (produit) ajouterProduit(produit);
  }

  function majLigne(key: string, patch: Partial<LigneBonCommande>) {
    onLignes(lignes.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function ajusterQte(key: string, delta: number) {
    const ligne = lignes.find((l) => l.key === key);
    if (!ligne) return;
    majLigne(key, { quantite: String(Math.max(1, (Number(ligne.quantite) || 1) + delta)) });
  }

  function retirer(key: string) {
    onLignes(lignes.filter((l) => l.key !== key));
  }

  const totaux = useMemo(() => {
    let articles = 0;
    let unites = 0;
    let montant = 0;
    for (const l of lignes) {
      const q = Number(l.quantite);
      const p = Number(l.prixUnitaire);
      if (!l.produitId || !(q > 0) || !(p > 0)) continue;
      articles += 1;
      unites += q;
      montant += q * p;
    }
    return { articles, unites, montant, incompletes: lignes.length - articles };
  }, [lignes]);

  return (
    <form
      className="bc-doc"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (totaux.articles === 0) return;
        onSubmit();
      }}
    >
      <div className="bc-doc-sheet">
        <header className="bc-doc-head">
          <div className="bc-doc-vendor">
            <label htmlFor="bc-fourn">Fournisseur</label>
            <select
              id="bc-fourn"
              value={fournisseurId}
              onChange={(e) => onFournisseurId(e.target.value)}
              required
            >
              {fournisseurs.length === 0 ? (
                <option value="">Aucun fournisseur actif</option>
              ) : null}
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
            {fournisseur ? (
              <address className="bc-doc-address">
                {fournisseur.adresse ? <span>{fournisseur.adresse}</span> : null}
                {fournisseur.contact ? <span>{fournisseur.contact}</span> : null}
                <span>
                  {[fournisseur.telephone, fournisseur.email].filter(Boolean).join(' · ') ||
                    'Coordonnées non renseignées'}
                </span>
              </address>
            ) : (
              <p className="bc-doc-address-empty">Choisissez le fournisseur de ce bon.</p>
            )}
          </div>
          <div className="bc-doc-identity">
            <p className="bc-doc-kicker">Bon de commande</p>
            <span className="badge">Brouillon</span>
            <dl className="bc-doc-meta">
              <div>
                <dt>
                  <Calendar size={12} aria-hidden /> Date
                </dt>
                <dd>{aujourdHui}</dd>
              </div>
              <div>
                <dt>N°</dt>
                <dd>Attribué à l’enregistrement</dd>
              </div>
            </dl>
          </div>
        </header>

        {(habituels.length > 0 || statsLoading) && (
          <section className="bc-doc-catalog" aria-label="Catalogue de ce fournisseur">
            <p className="bc-doc-label">Articles déjà reçus chez ce fournisseur</p>
            {statsLoading && habituels.length === 0 ? (
              <p className="bc-doc-hint">Chargement du catalogue…</p>
            ) : (
              <div className="bc-doc-chips">
                {habituels.map((s) => {
                  const p = produitsParId.get(s.produitId);
                  if (!p) return null;
                  return (
                    <button
                      key={s.produitId}
                      type="button"
                      className="bc-doc-chip"
                      onClick={() => ajouterProduit(p)}
                    >
                      <Plus size={12} />
                      <span className="bc-doc-chip-name">{s.designation}</span>
                      <span className="bc-doc-chip-prix">{fmtFcfa(s.dernierPrix)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="bc-doc-lines" aria-label="Lignes de commande">
          <div className="bc-doc-table-wrap">
          <table className="bc-doc-table">
            <thead>
              <tr>
                <th className="bc-col-n">#</th>
                <th>Article</th>
                <th className="num">Stock</th>
                <th className="num">Qté</th>
                <th className="num">Prix unit.</th>
                <th className="num">Montant</th>
                <th>
                  <span className="sr-only">Retirer</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr className="bc-doc-empty-row">
                  <td colSpan={7}>Aucune ligne — recherchez un article ci-dessous.</td>
                </tr>
              ) : (
                lignes.map((l, index) => {
                  const p = produitsParId.get(l.produitId);
                  const q = Number(l.quantite);
                  const prix = Number(l.prixUnitaire);
                  const montant = q > 0 && prix > 0 ? q * prix : 0;
                  const hint = p ? badgeStock(p.statutStock) : null;
                  const dernier = statsParProduit.get(l.produitId);
                  const prixDiffere =
                    dernier && prix > 0 && Number(dernier.dernierPrix) !== prix;
                  return (
                    <tr
                      key={l.key}
                      className={lignePulse === l.key ? 'is-pulse' : undefined}
                    >
                      <td className="bc-col-n">{index + 1}</td>
                      <td>
                        <div className="bc-doc-art">
                          <strong>{p?.designation ?? 'Article inconnu'}</strong>
                          <span>
                            {[p?.reference, p?.categorie].filter(Boolean).join(' · ') || '—'}
                            {dernier
                              ? ` · dernier achat ${fmtFcfa(dernier.dernierPrix)}`
                              : ''}
                          </span>
                        </div>
                      </td>
                      <td className="num">
                        <div className="bc-doc-stock">
                          <span>{p ? p.stock : '—'}</span>
                          {hint ? (
                            <span
                              className={
                                p?.statutStock === 'RUPTURE'
                                  ? 'badge badge-critical'
                                  : 'badge badge-warning'
                              }
                            >
                              {hint}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="num">
                        <div className="bc-stepper">
                          <button
                            type="button"
                            onClick={() => ajusterQte(l.key, -1)}
                            aria-label="Diminuer la quantité"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            ref={(el) => {
                              if (el) qtyRefs.current.set(l.key, el);
                              else qtyRefs.current.delete(l.key);
                            }}
                            type="number"
                            min="1"
                            step="1"
                            aria-label={`Quantité ${p?.designation ?? ''}`}
                            value={l.quantite}
                            onChange={(e) => majLigne(l.key, { quantite: e.target.value })}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => ajusterQte(l.key, 1)}
                            aria-label="Augmenter la quantité"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="num">
                        <input
                          className="bc-prix"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0"
                          aria-label={`Prix d’achat ${p?.designation ?? ''}`}
                          value={l.prixUnitaire}
                          onChange={(e) =>
                            majLigne(l.key, { prixUnitaire: e.target.value })
                          }
                          required
                        />
                        {prixDiffere ? (
                          <span className="bc-doc-prix-hint">≠ dernier achat</span>
                        ) : null}
                      </td>
                      <td className="num money">{montant ? fmtFcfa(montant) : '—'}</td>
                      <td className="bc-td-action">
                        <button
                          type="button"
                          className="bc-remove"
                          onClick={() => retirer(l.key)}
                          aria-label={`Retirer ${p?.designation ?? 'la ligne'}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          <div className="bc-doc-search-wrap">
            <EntityFinder
              id="bc-recherche"
              value={recherche}
              onChange={setRecherche}
              onSelect={onSelectArticle}
              options={finderOptions}
              allowCreate={allowCreateArticle}
              isExisting={(saisie) => Boolean(trouverProduit(saisie))}
              placeholder="Ajouter un article — désignation, réf. ou code-barres"
              createLabel={(s) => `Créer l’article « ${s} »`}
              emptyLabel={
                catalogue.length === 0
                  ? allowCreateArticle
                    ? 'Aucun article — saisissez un nom puis créez-le'
                    : 'Aucun article au catalogue'
                  : 'Aucune correspondance'
              }
              disabled={submitting || creationEnCours}
              autoFocus
            />
            {creationEnCours ? (
              <p className="bc-doc-hint">Création de l’article…</p>
            ) : null}
            {creationErr ? (
              <p className="bc-form-err" role="alert">
                {creationErr}
              </p>
            ) : null}
          </div>
        </section>

        <div className="bc-doc-bottom">
          <div className="bc-doc-notes">
            <label htmlFor="bc-notes">Notes / conditions</label>
            <textarea
              id="bc-notes"
              rows={4}
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="Référence fournisseur, délai souhaité, consignes de livraison…"
            />
          </div>
          <aside className="bc-doc-totals" aria-live="polite">
            <div>
              <span>Lignes</span>
              <strong>{totaux.articles}</strong>
            </div>
            <div>
              <span>Unités</span>
              <strong>{totaux.unites}</strong>
            </div>
            <div className="bc-doc-total-final">
              <span>Total</span>
              <strong>{totaux.montant > 0 ? fmtFcfa(totaux.montant) : '—'}</strong>
            </div>
            {totaux.incompletes > 0 ? (
              <p className="bc-doc-totals-warn">
                {totaux.incompletes} ligne(s) sans prix — non incluse(s) au total.
              </p>
            ) : null}
          </aside>
        </div>
      </div>

      <footer className="bc-doc-bar">
        {formErr ? (
          <p className="bc-form-err" role="alert">
            {formErr}
          </p>
        ) : (
          <p className="bc-doc-bar-hint">
            Enregistré en brouillon — à confirmer ensuite avant réception.
          </p>
        )}
        <div className="bc-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || totaux.articles === 0}
          >
            {submitting ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
        </div>
      </footer>
    </form>
  );
}
