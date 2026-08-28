import { Link } from 'react-router-dom';
import { formatFcfa } from '../lib/api';

export type ProductCardItem = {
  id: string;
  slug: string | null;
  designation: string;
  prixAffiche: number;
  categorie: string | null;
  imageUrl?: string | null;
  stockDisponible?: number | null;
  unitesVendues30j?: number | null;
  badge?: string;
  raison?: string;
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
  dense = false,
  badge,
}: {
  p: ProductCardItem;
  index?: number;
  eager?: boolean;
  dense?: boolean;
  badge?: string;
}) {
  const shown = badge ?? p.badge;
  return (
    <Link
      to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
      className={`product${dense ? ' product-dense' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="product-media-wrap">
        {shown && <span className="product-badge">{shown}</span>}
        <ProductMedia
          designation={p.designation}
          imageUrl={p.imageUrl}
          eager={eager ?? index < 2}
        />
      </div>
      <div className="product-body">
        {p.categorie && <span className="meta">{p.categorie}</span>}
        <h3>{p.designation}</h3>
        <span className="price">{formatFcfa(p.prixAffiche)}</span>
        {(p.unitesVendues30j ?? 0) > 0 ||
        (p.stockDisponible != null &&
          p.stockDisponible > 0 &&
          p.stockDisponible <= 3) ? (
          <span className="product-social">
            {(p.unitesVendues30j ?? 0) > 0
              ? `${p.unitesVendues30j} vendu${(p.unitesVendues30j ?? 0) > 1 ? 's' : ''}`
              : null}
            {p.stockDisponible != null &&
            p.stockDisponible > 0 &&
            p.stockDisponible <= 3
              ? `${(p.unitesVendues30j ?? 0) > 0 ? ' · ' : ''}Plus que ${p.stockDisponible}`
              : null}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
