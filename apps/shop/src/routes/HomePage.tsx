import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { shopFetch } from '../lib/api';
import { CATEGORIES, MARQUES, TRUST } from '../lib/brand';
import { ProductCard, type ProductCardItem } from '../components/ProductCard';
import { useInView } from '../hooks/useInView';

interface CatalogueResponse {
  items: ProductCardItem[];
}

const SHOWCASE = [
  {
    slug: 'jantes',
    label: 'Jantes & Pneus',
    text: 'Alliage, sport, look atelier',
    to: `/catalogue/${encodeURIComponent('Jantes & Pneus')}`,
  },
  {
    slug: 'mecanique',
    label: 'Mécanique',
    text: 'Freins, filtres, performance',
    to: `/catalogue/${encodeURIComponent('Mécanique')}`,
  },
] as const;

export default function HomePage() {
  const { ref: featuredRef, inView: featuredVisible } = useInView<HTMLElement>({
    rootMargin: '280px 0px',
    once: true,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['catalogue-home'],
    queryFn: () =>
      shopFetch<CatalogueResponse>('/shop/catalogue?limit=8&tri=designation'),
    enabled: featuredVisible,
  });
  const featured = data?.items ?? [];
  const marquesLoop = [...MARQUES, ...MARQUES];
  const showSkeleton = !featuredVisible || isLoading || (isFetching && !data);

  return (
    <>
      <section className="hero">
        <div className="hero-media" aria-hidden>
          <div className="hero-glow" />
          <div className="hero-grain" />
        </div>
        <div className="hero-content">
          <p className="hero-brand" aria-label="MAJOR AUTO PARTS">
            <em>MAJOR</em>
            <span>AUTO PARTS</span>
          </p>
          <div className="hero-copy">
            <h1>Le showroom pièces auto, en ligne.</h1>
            <p className="hero-lead">
              Tuning, jantes, éclairage, mécanique — pour tous véhicules.
            </p>
          </div>
          <div className="hero-cta">
            <Link className="btn" to="/catalogue">
              Explorer le catalogue
            </Link>
            <a className="hero-cta-link" href="#categories">
              Parcourir les rayons
            </a>
          </div>
        </div>
        <a className="hero-scroll" href="#categories" aria-label="Descendre">
          <span>Scroll</span>
        </a>
      </section>

      <div className="brands-rail" aria-label="Marques disponibles">
        <div className="brands-track">
          {marquesLoop.map((m, i) => (
            <span key={`${m}-${i}`} className="brand-chip">
              {m}
            </span>
          ))}
        </div>
      </div>

      <section className="home-showcase" aria-label="Univers vedettes">
        {SHOWCASE.map((s) => (
          <Link
            key={s.slug}
            to={s.to}
            className={`home-showcase-panel home-showcase-${s.slug}`}
          >
            <span className="home-showcase-kicker">Univers</span>
            <strong>{s.label}</strong>
            <span>{s.text}</span>
          </Link>
        ))}
      </section>

      <section className="section" id="categories">
        <div className="section-head">
          <div>
            <h2>Rayons boutique</h2>
            <p>Choisissez votre univers — comme en showroom</p>
          </div>
          <Link className="section-link" to="/catalogue">
            Catalogue →
          </Link>
        </div>
        <div className="cat-grid">
          {CATEGORIES.map((c, i) => (
            <Link
              key={c.slug}
              to={`/catalogue/${encodeURIComponent(c.label)}`}
              className={`cat-tile cat-tile-${c.slug}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <strong>{c.label}</strong>
              <span>{c.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="section home-featured"
        ref={featuredRef}
        aria-busy={showSkeleton || undefined}
      >
        <div className="section-head">
          <div>
            <h2>Sélection premium</h2>
            <p>Pièces disponibles à la commande</p>
          </div>
          <Link className="section-link" to="/catalogue">
            Tout voir →
          </Link>
        </div>
        {showSkeleton ? (
          <div className="product-grid" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="product product-skeleton" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <p className="muted">Boutique temporairement inactive.</p>
        ) : (
          <div className="product-grid">
            {featured.map((p, i) => (
              <ProductCard key={p.id} p={p} index={i} eager={i < 2} />
            ))}
          </div>
        )}
      </section>

      <section className="home-promise" aria-label="Engagements MAJOR">
        <div className="home-promise-inner">
          {TRUST.map((t) => (
            <div key={t.title} className="home-promise-item">
              <strong>{t.title}</strong>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="home-fulfill">
        <div className="home-fulfill-media" aria-hidden />
        <div className="home-fulfill-copy">
          <h2>Retrait showroom ou livraison</h2>
          <p>
            Commandez en ligne, retirez en boutique ou faites-vous livrer.
            Wave, Orange Money, carte — ou paiement au retrait.
          </p>
          <Link className="btn" to="/catalogue">
            Commander maintenant
          </Link>
        </div>
      </section>
    </>
  );
}
