import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { compresserImage } from '../lib/compress-image';
import { genererReferenceProduit } from '../lib/generer-reference';
import { serializeImagesUrls } from '../lib/produit-images';
import { slugifyProduitDesignation } from '../lib/produit-slug';
import {
  designationDepuisAttributs,
  ProduitAttributsField,
} from './ProduitAttributsField';
import { ProduitGalerieField } from './ProduitGalerieField';
import { CategorieProduitField } from './CategorieProduitField';
import { ProduitDescriptionField } from './ProduitDescriptionField';
import { serializeAttributsMap } from '../lib/parse-attributs';
import type { ProduitDto } from '../lib/types';

type VarianteBrouillon = {
  localId: string;
  attributs: Record<string, string>;
  reference: string;
  referenceManuel: boolean;
  prixUnitaire: string;
  prixWeb: string;
  stock: string;
  imageUrl: string | null;
  galleryUrls: string[];
};

function newVariante(): VarianteBrouillon {
  return {
    localId: crypto.randomUUID(),
    attributs: {},
    reference: '',
    referenceManuel: false,
    prixUnitaire: '',
    prixWeb: '',
    stock: '0',
    imageUrl: null,
    galleryUrls: [],
  };
}

type Props = {
  designationsExistantes: string[];
  onSuccess?: (produit: ProduitDto) => void;
};

export function NouveauProduitForm({ designationsExistantes, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const formId = useId();

  const [designation, setDesignation] = useState('');
  const [reference, setReference] = useState('');
  const [referenceManuel, setReferenceManuel] = useState(false);
  const [categorie, setCategorie] = useState('');
  const [description, setDescription] = useState('');
  const [typeProduit, setTypeProduit] = useState<'ARTICLE' | 'PRESTATION'>('ARTICLE');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [stock, setStock] = useState('0');
  const [seuilReappro, setSeuilReappro] = useState('');
  const [visibleWeb, setVisibleWeb] = useState(false);
  const [slug, setSlug] = useState('');
  const [slugManuel, setSlugManuel] = useState(false);
  const [prixWeb, setPrixWeb] = useState('');
  const [tauxTva, setTauxTva] = useState('');
  const [attributs, setAttributs] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [variantes, setVariantes] = useState<VarianteBrouillon[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (referenceManuel || !designation.trim()) return;
    setReference(genererReferenceProduit(designation, categorie));
  }, [designation, categorie, referenceManuel]);

  useEffect(() => {
    if (!visibleWeb || slugManuel) return;
    setSlug(slugifyProduitDesignation(designation));
  }, [designation, visibleWeb, slugManuel]);

  useEffect(() => {
    if (!visibleWeb || prixWeb !== '') return;
    if (prixUnitaire.trim() !== '') setPrixWeb(prixUnitaire);
  }, [visibleWeb, prixUnitaire, prixWeb]);

  const doublon = designationsExistantes.some(
    (d) => d.trim().toLowerCase() === designation.trim().toLowerCase(),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (visibleWeb && !imageUrl) {
        throw new Error('Une photo de couverture est obligatoire pour publier sur le site web.');
      }

      const attributsStr = serializeAttributsMap(attributs);
      const imagesUrlsStr = serializeImagesUrls(galleryUrls);

      const parent = await apiFetch<ProduitDto>('/produits', {
        method: 'POST',
        body: JSON.stringify({
          designation: designation.trim(),
          reference: reference.trim() || undefined,
          categorie: categorie.trim() || undefined,
          description: description.trim() || undefined,
          typeProduit,
          prixUnitaire: Number(prixUnitaire),
          stock: typeProduit === 'PRESTATION' ? 0 : Number(stock),
          seuilReappro: seuilReappro ? Number(seuilReappro) : undefined,
          ...(visibleWeb
            ? {
                visibleWeb: true,
                slug: slug.trim() || undefined,
                prixWeb: prixWeb.trim() ? Number(prixWeb) : Number(prixUnitaire),
                imageUrl,
                imagesUrls: imagesUrlsStr ?? undefined,
                attributs: attributsStr ?? undefined,
                tauxTva: tauxTva.trim() ? Number(tauxTva) : undefined,
              }
            : {}),
        }),
      });

      for (const v of variantes) {
        const vAttributs = serializeAttributsMap(v.attributs);
        const vDesignation = designationDepuisAttributs(designation, v.attributs);
        const vRef =
          v.reference.trim() ||
          genererReferenceProduit(vDesignation, categorie);
        const vPrixMag = v.prixUnitaire.trim() ? Number(v.prixUnitaire) : Number(prixUnitaire);
        const vPrixWeb = v.prixWeb.trim()
          ? Number(v.prixWeb)
          : vPrixMag;
        const vImages = serializeImagesUrls(v.galleryUrls);

        await apiFetch<ProduitDto>(`/produits/${parent.id}/variantes`, {
          method: 'POST',
          body: JSON.stringify({
            designation: vDesignation,
            reference: vRef,
            prixUnitaire: vPrixMag,
            prixWeb: vPrixWeb,
            attributs: vAttributs ?? undefined,
            imageUrl: v.imageUrl ?? imageUrl ?? undefined,
            imagesUrls: vImages ?? undefined,
            visibleWeb: true,
            stock: typeProduit === 'PRESTATION' ? 0 : Number(v.stock || 0),
            slug: slugifyProduitDesignation(vDesignation),
          }),
        });
      }

      return parent;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-categories'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
      onSuccess?.(created);
    },
    onError: (err: unknown) => {
      if (err instanceof Error && !('status' in err)) {
        setError(err.message);
        return;
      }
      const message =
        err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409
          ? 'Référence ou slug déjà utilisé — modifiez et réessayez.'
          : 'Échec de la création du produit.';
      setError(message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  function updateVariante(localId: string, patch: Partial<VarianteBrouillon>) {
    setVariantes((prev) =>
      prev.map((v) => (v.localId === localId ? { ...v, ...patch } : v)),
    );
  }

  return (
    <form id={formId} className="modal-form nouveau-produit-form" onSubmit={handleSubmit}>
      <fieldset className="form-section">
        <legend>Catalogue magasin (POS)</legend>
        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor={`${formId}-designation`}>Désignation *</label>
            <input
              id={`${formId}-designation`}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              required
              placeholder="Antibrouillard LED H11"
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-reference`}>
              Référence / SKU
              <button
                type="button"
                className="btn-link-inline"
                onClick={() => {
                  setReferenceManuel(false);
                  setReference(genererReferenceProduit(designation, categorie));
                }}
                title="Générer une référence"
              >
                <Wand2 size={12} /> Générer
              </button>
            </label>
            <input
              id={`${formId}-reference`}
              value={reference}
              onChange={(e) => {
                setReferenceManuel(true);
                setReference(e.target.value);
              }}
              placeholder="PHR-LED-H11-X3K9"
            />
          </div>
        </div>
        {doublon && (
          <p className="form-hint-warning">
            Un produit porte déjà cette désignation — vérifiez les doublons.
          </p>
        )}
        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor={`${formId}-categorie`}>Catégorie</label>
            <CategorieProduitField
              id={`${formId}-categorie`}
              value={categorie}
              onChange={setCategorie}
              emptyLabel="— Choisir —"
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-type`}>Type</label>
            <select
              id={`${formId}-type`}
              value={typeProduit}
              onChange={(e) => setTypeProduit(e.target.value as 'ARTICLE' | 'PRESTATION')}
            >
              <option value="ARTICLE">Article (stock géré)</option>
              <option value="PRESTATION">Prestation (sans stock)</option>
            </select>
          </div>
        </div>
        <ProduitDescriptionField
          id={`${formId}-description`}
          value={description}
          onChange={setDescription}
          rows={3}
          compact={!visibleWeb}
          webMode={visibleWeb}
        />
        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor={`${formId}-prix`}>Prix magasin (FCFA) *</label>
            <input
              id={`${formId}-prix`}
              type="number"
              min="0.01"
              step="0.01"
              value={prixUnitaire}
              onChange={(e) => setPrixUnitaire(e.target.value)}
              required
            />
          </div>
          {typeProduit === 'ARTICLE' ? (
            <div className="form-field">
              <label htmlFor={`${formId}-stock`}>Stock initial</label>
              <input
                id={`${formId}-stock`}
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
              />
              <p className="form-hint-muted">Déposé sur l’entrepôt hub web si configuré.</p>
            </div>
          ) : null}
        </div>
        {typeProduit === 'ARTICLE' && (
          <div className="form-field">
            <label htmlFor={`${formId}-seuil`}>Seuil de réapprovisionnement (optionnel)</label>
            <input
              id={`${formId}-seuil`}
              type="number"
              min="0"
              step="1"
              value={seuilReappro}
              onChange={(e) => setSeuilReappro(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="form-section form-section-web">
        <legend>
          <label className="checkbox-legend">
            <input
              type="checkbox"
              checked={visibleWeb}
              onChange={(e) => {
                setVisibleWeb(e.target.checked);
                if (!e.target.checked) {
                  setSlug('');
                  setSlugManuel(false);
                  setPrixWeb('');
                  setAttributs({});
                  setGalleryUrls([]);
                  setVariantes([]);
                }
              }}
            />
            Publier sur majorautoparts.shop
          </label>
        </legend>

        {visibleWeb && (
          <>
            <ProduitGalerieField
              coverUrl={imageUrl}
              onCoverChange={setImageUrl}
              galleryUrls={galleryUrls}
              onGalleryChange={setGalleryUrls}
              coverRequired
              coverId={`${formId}-cover`}
              galleryId={`${formId}-gallery`}
            />
            {!imageUrl && (
              <p className="form-hint-warning">Photo de couverture obligatoire pour le site web.</p>
            )}

            <div className="form-grid-2">
              <div className="form-field">
                <label htmlFor={`${formId}-prix-web`}>Prix web (FCFA)</label>
                <input
                  id={`${formId}-prix-web`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={prixWeb}
                  onChange={(e) => setPrixWeb(e.target.value)}
                  placeholder={prixUnitaire || 'Comme prix magasin'}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${formId}-tva`}>TVA (%)</label>
                <input
                  id={`${formId}-tva`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={tauxTva}
                  onChange={(e) => setTauxTva(e.target.value)}
                  placeholder="18"
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor={`${formId}-slug`}>Slug URL (page produit)</label>
              <input
                id={`${formId}-slug`}
                value={slug}
                onChange={(e) => {
                  setSlugManuel(true);
                  setSlug(e.target.value);
                }}
                placeholder="antibrouillard-led-h11-blanc"
              />
              <p className="form-hint-muted">Généré depuis la désignation — un slug unique par variante.</p>
            </div>

            <ProduitAttributsField
              value={attributs}
              onChange={setAttributs}
              idPrefix={`${formId}-main`}
            />

            <div className="variantes-section">
              <div className="variantes-section-head">
                <h4>Variantes (taille, couleur, culot…)</h4>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setVariantes((v) => [...v, newVariante()])}
                >
                  <Plus size={14} /> Ajouter une variante
                </button>
              </div>
              <p className="form-hint-muted">
                Chaque variante a son prix web, sa photo et ses caractéristiques. Le
                produit principal ci-dessus est la référence parente du catalogue.
              </p>
              {variantes.map((v, idx) => (
                <div key={v.localId} className="variante-brouillon-card">
                  <div className="variante-brouillon-head">
                    <strong>Variante {idx + 1}</strong>
                    <span className="label-muted">
                      {designationDepuisAttributs(designation, v.attributs) || '— définir les attributs —'}
                    </span>
                    <button
                      type="button"
                      className="btn-icon-danger"
                      aria-label="Supprimer la variante"
                      onClick={() =>
                        setVariantes((prev) => prev.filter((x) => x.localId !== v.localId))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <ProduitAttributsField
                    value={v.attributs}
                    onChange={(a) => updateVariante(v.localId, { attributs: a })}
                    idPrefix={`${formId}-v${idx}`}
                  />
                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Référence variante</label>
                      <input
                        value={v.reference}
                        onChange={(e) =>
                          updateVariante(v.localId, {
                            reference: e.target.value,
                            referenceManuel: true,
                          })
                        }
                        placeholder={
                          v.referenceManuel
                            ? ''
                            : genererReferenceProduit(
                                designationDepuisAttributs(designation, v.attributs),
                                categorie,
                              )
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Prix magasin variante</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={v.prixUnitaire}
                        onChange={(e) =>
                          updateVariante(v.localId, { prixUnitaire: e.target.value })
                        }
                        placeholder={prixUnitaire || 'Comme produit principal'}
                      />
                    </div>
                    <div className="form-field">
                      <label>Prix web variante *</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={v.prixWeb}
                        onChange={(e) => updateVariante(v.localId, { prixWeb: e.target.value })}
                        placeholder={v.prixUnitaire || prixWeb || prixUnitaire}
                      />
                    </div>
                    {typeProduit === 'ARTICLE' && (
                      <div className="form-field">
                        <label>Stock variante</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={v.stock}
                          onChange={(e) => updateVariante(v.localId, { stock: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  <div className="form-field">
                    <label>Photo variante (optionnel — sinon couverture principale)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        void compresserImage(file, 480).then((url) =>
                          updateVariante(v.localId, { imageUrl: url }),
                        );
                      }}
                    />
                    {v.imageUrl ? (
                      <div className="variante-thumb-preview">
                        <img src={v.imageUrl} alt="" />
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => updateVariante(v.localId, { imageUrl: null })}
                        >
                          Retirer
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <div className="modal-form-actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={mutation.isPending || (visibleWeb && !imageUrl)}
        >
          {mutation.isPending
            ? 'Création…'
            : variantes.length > 0
              ? `Créer (${1 + variantes.length} SKU)`
              : 'Créer le produit'}
        </button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  );
}
