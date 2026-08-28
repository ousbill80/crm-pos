import { Link } from 'react-router-dom';
import { formatFcfa } from '../lib/api';

export type ProductCardItem = {
  id: string;
  slug: string | null;
  designation: string;
  prixAffiche: number;
  categorie: string | null;
  imageUrl?: string | null;
};

function hasRealImage(url?: string | null) {
  return !!url && !url.startsWith('data:image/svg');
}

export function ProductMedia({
  designation,
  imageUrl,
  eager = false,
}: {
  designation: string;
  imageUrl?: string | null;
  /** Premier(s) produit(s) above-the-fold : pas de lazy. */
  eager?: boolean;
}) {
  const letter = (designation?.[0] ?? 'M').toUpperCase();
  if (hasRealImage(imageUrl)) {
    return (
      <div className="product-media has-image">
        <img
          src={imageUrl!}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
        />
      </div>
    );
  }
  return (
    <div className="product-media" data-letter={letter}>
      <span>{letter}</span>
    </div>
  );
}

export function ProductCard({
  p,
  index = 0,
  eager,
}: {
  p: ProductCardItem;
  index?: number;
  eager?: boolean;
}) {
  return (
    <Link
      to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
      className="product"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <ProductMedia
        designation={p.designation}
        imageUrl={p.imageUrl}
        eager={eager ?? index < 2}
      />
      <div className="product-body">
        {p.categorie && <span className="meta">{p.categorie}</span>}
        <h3>{p.designation}</h3>
        <span className="price">{formatFcfa(p.prixAffiche)}</span>
      </div>
    </Link>
  );
}
