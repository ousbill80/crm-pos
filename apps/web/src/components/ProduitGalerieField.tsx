import { compresserImage } from '../lib/compress-image';

type Props = {
  coverUrl: string | null;
  onCoverChange: (url: string | null) => void;
  galleryUrls: string[];
  onGalleryChange: (urls: string[]) => void;
  coverRequired?: boolean;
  coverId?: string;
  galleryId?: string;
};

export function ProduitGalerieField({
  coverUrl,
  onCoverChange,
  galleryUrls,
  onGalleryChange,
  coverRequired = false,
  coverId = 'photo-couverture',
  galleryId = 'photo-galerie',
}: Props) {
  async function onFile(file: File | undefined, target: 'cover' | 'gallery') {
    if (!file) return;
    const url = await compresserImage(file, 480);
    if (target === 'cover') onCoverChange(url);
    else onGalleryChange([...galleryUrls, url]);
  }

  return (
    <div className="produit-galerie-field">
      <div className="produit-galerie-cover">
        <div className="produit-galerie-preview" aria-hidden>
          {coverUrl ? <img src={coverUrl} alt="" /> : <span>Couverture</span>}
        </div>
        <div>
          <label htmlFor={coverId}>
            Photo principale (couverture)
            {coverRequired ? ' *' : ''}
          </label>
          <input
            id={coverId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void onFile(e.target.files?.[0], 'cover').finally(() => {
                e.target.value = '';
              });
            }}
          />
          {coverUrl ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onCoverChange(null)}>
              Retirer
            </button>
          ) : null}
          <p className="form-hint-muted">JPEG / PNG / WebP — 480 px, affichée sur la fiche site.</p>
        </div>
      </div>
      <div className="produit-galerie-extra">
        <label htmlFor={galleryId}>Photos supplémentaires (galerie)</label>
        <input
          id={galleryId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            void (async () => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              const urls: string[] = [];
              for (const f of files) {
                urls.push(await compresserImage(f, 480));
              }
              if (urls.length) onGalleryChange([...galleryUrls, ...urls]);
            })();
          }}
        />
        {galleryUrls.length > 0 ? (
          <ul className="produit-galerie-thumbs">
            {galleryUrls.map((url, i) => (
              <li key={i}>
                <img src={url} alt="" />
                <button
                  type="button"
                  aria-label="Retirer"
                  onClick={() => onGalleryChange(galleryUrls.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint-muted">Angles, détails, packaging — visibles sur la page produit.</p>
        )}
      </div>
    </div>
  );
}
