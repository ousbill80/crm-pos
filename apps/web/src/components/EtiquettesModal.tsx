import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiDownloadPost, apiFetch, messageDepuisApi } from '../lib/api';
import { Modal } from './Modal';
import type { BoutiqueDto } from '../lib/types';

const MAX_ETIQUETTES = 1000;
const A4_PAR_PAGE = 24;

export interface ArticleEtiquetteSelection {
  produitId: string;
  designation: string;
  reference: string | null;
  codeBarres: string | null;
  prixUnitaire?: string;
  quantite: number;
}

interface CriteresApercu {
  afficherNom: boolean;
  afficherBoutique: boolean;
  afficherReference: boolean;
  boutiqueNom: string | null;
}

function fmtPrixEtiquette(prixUnitaire: string | undefined): string {
  const n = Number(prixUnitaire);
  if (!Number.isFinite(n)) return '—';
  const montant = Math.round(n)
    .toLocaleString('fr-FR')
    .replace(/[\u00a0\u202f\u2007\u2009\u200a]/g, ' ');
  return `${montant} FCFA`;
}

function BarresCode({ code }: { code: string }) {
  const seed = [...code].reduce((s, c) => s + c.charCodeAt(0), 1);
  const barres: number[] = [3, 1, 1];
  let n = seed;
  for (let i = 0; i < 42; i += 1) {
    n = (Math.imul(n, 1103515245) + 12345) >>> 0;
    barres.push(1 + (n % 3));
  }
  barres.push(1, 1, 3);
  const total = barres.reduce((s, w) => s + w, 0);
  let x = 2;
  return (
    <svg
      className="etiq-barres"
      viewBox={`0 0 ${total + 4} 36`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {barres.map((w, i) => {
        const rect =
          i % 2 === 0 ? (
            <rect key={i} x={x} y="0" width={w} height="36" fill="#111" />
          ) : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

function EtiquetteFace({
  article,
  criteres,
}: {
  article: ArticleEtiquetteSelection;
  criteres: CriteresApercu;
}) {
  const codeAffiche = article.codeBarres ?? 'INT········';
  return (
    <article className="etiq-face">
      {criteres.afficherNom ? (
        <p className="etiq-nom">{article.designation}</p>
      ) : null}
      {criteres.afficherBoutique ? (
        <p className={criteres.boutiqueNom ? 'etiq-boutique' : 'etiq-boutique is-placeholder'}>
          {criteres.boutiqueNom ?? 'Nom de la boutique'}
        </p>
      ) : null}
      <BarresCode code={codeAffiche} />
      <p className="etiq-code">{codeAffiche}</p>
      {criteres.afficherReference && article.reference ? (
        <p className="etiq-ref">Réf. {article.reference}</p>
      ) : null}
      <p className="etiq-prix">{fmtPrixEtiquette(article.prixUnitaire)}</p>
    </article>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  articles: ArticleEtiquetteSelection[];
  onQuantiteChange: (produitId: string, quantite: number) => void;
  onRemove: (produitId: string) => void;
  onImprime?: () => void;
  boutiqueIdDefaut?: string;
}

export function EtiquettesModal({
  open,
  onClose,
  articles,
  onQuantiteChange,
  onRemove,
  onImprime,
  boutiqueIdDefaut = '',
}: Props) {
  const [format, setFormat] = useState<'ROULEAU' | 'PLANCHE_A4'>('PLANCHE_A4');
  const [afficherNom, setAfficherNom] = useState(true);
  const [afficherBoutique, setAfficherBoutique] = useState(false);
  const [afficherReference, setAfficherReference] = useState(false);
  const [boutiqueId, setBoutiqueId] = useState(boutiqueIdDefaut);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [quantiteCommune, setQuantiteCommune] = useState(1);
  const [apercuId, setApercuId] = useState<string | null>(null);

  const nbCodesAGenerer = useMemo(
    () => articles.filter((a) => !a.codeBarres).length,
    [articles],
  );

  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: open,
  });

  const total = useMemo(
    () => articles.reduce((somme, a) => somme + (Number(a.quantite) || 0), 0),
    [articles],
  );

  const apercuArticle =
    articles.find((a) => a.produitId === apercuId) ?? articles[0] ?? null;

  const boutiqueNom =
    (boutiques.data ?? []).find((b) => b.id === boutiqueId)?.nom ?? null;

  const criteres: CriteresApercu = {
    afficherNom,
    afficherBoutique,
    afficherReference,
    boutiqueNom: afficherBoutique ? boutiqueNom : null,
  };

  const pagesA4 = Math.max(1, Math.ceil(total / A4_PAR_PAGE));
  const rempliesPage1 = Math.min(Math.max(0, total), A4_PAR_PAGE);
  const libelleImprimees = `${total} imprimée${total > 1 ? 's' : ''}`;

  useEffect(() => {
    if (!open) return;
    setErreur(null);
    setSucces(false);
    if (boutiqueIdDefaut) setBoutiqueId(boutiqueIdDefaut);
  }, [open, boutiqueIdDefaut]);

  async function handleImprimer() {
    setErreur(null);
    setSucces(false);
    if (articles.length === 0) {
      setErreur('Sélectionnez au moins un article.');
      return;
    }
    if (total > MAX_ETIQUETTES) {
      setErreur(
        `Le lot demande ${total} étiquettes, au-delà du plafond de ${MAX_ETIQUETTES} par impression. Scindez la sélection.`,
      );
      return;
    }
    if (afficherBoutique && !boutiqueId) {
      setErreur('Choisissez une boutique à afficher sur les étiquettes.');
      return;
    }
    setEnvoi(true);
    try {
      await apiDownloadPost(
        '/produits/etiquettes/pdf',
        {
          articles: articles.map((a) => ({
            produitId: a.produitId,
            quantite: a.quantite,
          })),
          format,
          afficherNom,
          afficherBoutique,
          afficherReference,
          ...(afficherBoutique ? { boutiqueId } : {}),
        },
        'etiquettes-produits.pdf',
      );
      setSucces(true);
      onImprime?.();
    } catch (err) {
      setErreur(messageDepuisApi(err, "Échec de l'impression des étiquettes."));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Imprimer les étiquettes"
      description="L’aperçu suit le support et le contenu choisis. Code-barres et prix sont toujours imprimés."
      size="xl"
    >
      {erreur && <p role="alert">{erreur}</p>}
      {succes && <p className="form-hint-success">Étiquettes générées.</p>}

      <div className="etiq-modal">
        <div className="etiq-modal-form">
          {nbCodesAGenerer > 0 && (
            <p className="kpi-hint">
              {nbCodesAGenerer} article(s) sans code-barres : un code interne sera
              généré à l’impression (un code déjà saisi n’est jamais écrasé).
            </p>
          )}

          {articles.length > 1 && (
            <div className="etiq-qte-commune">
              <label htmlFor="etiq-qte-commune">Quantité commune</label>
              <input
                id="etiq-qte-commune"
                type="number"
                min={1}
                max={500}
                value={quantiteCommune}
                onChange={(e) =>
                  setQuantiteCommune(Math.max(1, Number(e.target.value) || 1))
                }
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  articles.forEach((a) => onQuantiteChange(a.produitId, quantiteCommune))
                }
              >
                Appliquer à toutes les lignes
              </button>
            </div>
          )}

          <div className="etiq-lignes-wrap">
            <table className="table-compact etiq-lignes">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Qté</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr
                    key={a.produitId}
                    className={
                      apercuArticle?.produitId === a.produitId ? 'is-apercu' : undefined
                    }
                    onClick={() => setApercuId(a.produitId)}
                  >
                    <td>
                      <strong>{a.designation}</strong>
                      <div className="produit-ref">
                        {a.reference ?? '—'}
                        {!a.codeBarres && (
                          <span className="badge badge-neutral">Code à générer</span>
                        )}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        aria-label={`Quantité ${a.designation}`}
                        value={a.quantite}
                        onChange={(e) =>
                          onQuantiteChange(
                            a.produitId,
                            Math.max(1, Number(e.target.value) || 1),
                          )
                        }
                      />
                    </td>
                    {articles.length > 1 ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => onRemove(a.produitId)}
                        >
                          Retirer
                        </button>
                      </td>
                    ) : (
                      <td aria-hidden />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="etiq-fieldset">
            <legend>Support</legend>
            <div className="etiq-format-cards" role="radiogroup" aria-label="Support">
              <label className={format === 'ROULEAU' ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="etiquettes-format"
                  checked={format === 'ROULEAU'}
                  onChange={() => setFormat('ROULEAU')}
                />
                <strong>Rouleau thermique</strong>
                <span>50 × 30 mm · 1 étiquette / page</span>
              </label>
              <label className={format === 'PLANCHE_A4' ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="etiquettes-format"
                  checked={format === 'PLANCHE_A4'}
                  onChange={() => setFormat('PLANCHE_A4')}
                />
                <strong>Planche A4</strong>
                <span>Grille 3 × 8 · 24 / page</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="etiq-fieldset">
            <legend>Contenu (code-barres et prix toujours inclus)</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={afficherNom}
                onChange={(e) => setAfficherNom(e.target.checked)}
              />
              Nom de l’article
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={afficherReference}
                onChange={(e) => setAfficherReference(e.target.checked)}
              />
              Référence interne (SKU)
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={afficherBoutique}
                onChange={(e) => setAfficherBoutique(e.target.checked)}
              />
              Nom de la boutique
            </label>
            {afficherBoutique && (
              <select
                value={boutiqueId}
                onChange={(e) => setBoutiqueId(e.target.value)}
                aria-label="Boutique affichée sur l’étiquette"
              >
                <option value="">— Choisir la boutique —</option>
                {(boutiques.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
        </div>

        <aside className="etiq-apercu" aria-live="polite">
          <div className="etiq-apercu-head">
            <h4>Aperçu</h4>
            <span className="etiq-apercu-badge">
              {format === 'ROULEAU' ? 'Rouleau 50 × 30 mm' : 'Planche A4 · 3 × 8'}
            </span>
          </div>
          {!apercuArticle ? (
            <p className="kpi-hint">Sélectionnez un article pour prévisualiser.</p>
          ) : (
            <>
              <div className="etiq-apercu-stage">
                <div className="etiq-apercu-label">
                  <EtiquetteFace article={apercuArticle} criteres={criteres} />
                </div>
              </div>
              {!apercuArticle.codeBarres ? (
                <p className="etiq-apercu-note">
                  Sans code-barres : un code interne (INT…) sera attribué à l’impression.
                </p>
              ) : null}
              {format === 'PLANCHE_A4' ? (
                <div className="etiq-page-a4">
                  <div className="etiq-page-a4-grid" aria-hidden>
                    {Array.from({ length: A4_PAR_PAGE }, (_, i) => (
                      <span
                        key={i}
                        className={i < rempliesPage1 ? 'is-on' : undefined}
                      />
                    ))}
                  </div>
                  <p className="etiq-page-a4-foot">
                    <strong>{total}</strong>
                    <span>
                      imprimée{total > 1 ? 's' : ''}
                      {pagesA4 > 1
                        ? ` · ${pagesA4} pages`
                        : ` · ${rempliesPage1}/${A4_PAR_PAGE}`}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="etiq-page-rouleau">
                  <div className="etiq-page-rouleau-band" aria-hidden>
                    <span />
                    <span className="is-on" />
                    <span />
                  </div>
                  <p className="etiq-page-a4-foot">
                    <strong>{total}</strong>
                    <span>
                      imprimée{total > 1 ? 's' : ''} · {total} page
                      {total > 1 ? 's' : ''}
                    </span>
                  </p>
                </div>
              )}
              <p className="etiq-apercu-meta">
                {apercuArticle.designation}
                {apercuArticle.quantite > 1 ? ` · × ${apercuArticle.quantite}` : ''}
              </p>
              <p className="etiq-apercu-meta">
                {format === 'ROULEAU'
                  ? `${libelleImprimees} · ${total} page(s) rouleau`
                  : `${libelleImprimees} · ${pagesA4} page(s) A4`}
                {total > MAX_ETIQUETTES ? ` — plafond ${MAX_ETIQUETTES} dépassé` : ''}
              </p>
            </>
          )}
        </aside>
      </div>

      <div className="etiq-modal-actions">
        <p className={total > MAX_ETIQUETTES ? 'form-hint-warning' : 'kpi-hint'}>
          Total : {total} étiquette(s)
        </p>
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={envoi || articles.length === 0 || total > MAX_ETIQUETTES}
            onClick={() => void handleImprimer()}
          >
            {envoi ? 'Génération…' : 'Imprimer les étiquettes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
