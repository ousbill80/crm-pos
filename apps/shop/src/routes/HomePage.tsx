import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { shopFetch } from '../lib/api';
import { getShopSessionId } from '../lib/aarrr';
import { CATEGORIES, MARQUES, TRUST } from '../lib/brand';
import { ProductCard, type ProductCardItem } from '../components/ProductCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { useInView } from '../hooks/useInView';

interface DecouverteResponse {
  flash: ProductCardItem[];
  pourVous: ProductCardItem[];
  tendances: ProductCardItem[];
  profil?: {
    personnalise: boolean;
    centresInteret: string[];
    message: string;
  };
}

const BANNERS = [
  {
    to: `/catalogue/${encodeURIComponent('Jantes & Pneus')}`,
    kicker: 'Look atelier',
    title: 'Jantes & pneus',
    text: 'Alliage · sport · runflat',
    tone: 'gold',
    image: '/banners/banner-jantes.jpg',
  },
  {
    to: `/catalogue/${encodeURIComponent('Mécanique')}`,
    kicker: 'Entretien',
    title: 'Mécanique',
    text: 'Freins · filtres · performance',
    tone: 'ink',
    image: '/banners/banner-mecanique.jpg',
  },
  {
    to: `/catalogue/${encodeURIComponent('Éclairage')}`,
    kicker: 'Visibilité',
    title: 'Éclairage LED',
    text: 'Phares · barres · ambiance',
    tone: 'steel',
    image: '/banners/banner-eclairage.jpg',
  },
] as const;

const SIDE_BANNERS = [
  {
    to: `/catalogue/${encodeURIComponent('Tuning Performance')}`,
    kicker: 'Hot',
    title: 'Tuning',
    text: 'Look sport',
    tone: 'a',
    image: '/banners/banner-tuning.jpg',
  },
  {
    to: `/catalogue/${encodeURIComponent('Électronique')}`,
    kicker: 'Tech',
    title: 'Électronique',
    text: 'Caméras & multimédia',
    tone: 'b',
    image: '/banners/banner-electronique.jpg',
  },
] as const;

const CAT_TONE: Record<string, string> = {
  tuning: 'tone-a',
  jantes: 'tone-b',
  phares: 'tone-c',
  eclairage: 'tone-d',
  housses: 'tone-e',
  electronique: 'tone-f',
  mecanique: 'tone-g',
  accessoires: 'tone-h',
};

export default function HomePage() {
  const { ref: featuredRef, inView: featuredVisible } = useInView<HTMLElement>({
    rootMargin: '320px 0px',
    once: true,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['shop-decouverte'],
    queryFn: () =>
      shopFetch<DecouverteResponse>(
        `/shop/decouverte?sessionId=${encodeURIComponent(getShopSessionId())}`,
      ),
    enabled: featuredVisible,
  });

  const flash = data?.flash ?? [];
  const pourVous = data?.pourVous ?? [];
  const tendances = data?.tendances ?? [];
  const profilMsg = data?.profil?.message;
  const centres = data?.profil?.centresInteret ?? [];
  const marquesLoop = [...MARQUES, ...MARQUES];
  const showSkeleton = !featuredVisible || isLoading || (isFetching && !data);

  return (
    <div className="home-temu">
      <section className="home-stage" aria-label="Accueil MAJOR">
        <Link to="/catalogue" className="home-hero-banner">
          <div className="home-hero-media" aria-hidden />
          <div className="home-hero-copy">
            <p className="home-hero-brand">
              <em>MAJOR</em>
              <span>AUTO PARTS</span>
            </p>
            <h1>Pièces auto à Abidjan, Côte d’Ivoire</h1>
            <p>
              Phares LED, jantes, freins, électronique — livraison CIV et
              retrait showroom.
            </p>
            <span className="home-hero-cta">Voir les offres</span>
          </div>
        </Link>

        <div className="home-side-banners">
          {SIDE_BANNERS.map((b) => (
            <Link
              key={b.title}
              to={b.to}
              className={`home-side-banner home-side-${b.tone}`}
            >
              <span
                className="home-banner-media"
                style={{ backgroundImage: `url(${b.image})` }}
                aria-hidden
              />
              <span className="home-banner-copy">
                <span>{b.kicker}</span>
                <strong>{b.title}</strong>
                <em>{b.text}</em>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-cat-rail-wrap" aria-label="Rayons">
        <div className="home-cat-rail">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              to={`/catalogue/${encodeURIComponent(c.label)}`}
              className="home-cat-orb"
            >
              <span className={`home-cat-orb-icon ${CAT_TONE[c.slug] ?? 'tone-a'}`}>
                <CategoryIcon slug={c.slug} size={22} />
              </span>
              <strong>{c.label.split(' ')[0]}</strong>
            </Link>
          ))}
          <Link to="/catalogue" className="home-cat-orb">
            <span className="home-cat-orb-icon tone-all">
              <CategoryIcon slug="all" size={22} />
            </span>
            <strong>Tout</strong>
          </Link>
        </div>
      </section>

      <section className="home-banner-row" aria-label="Univers vedettes">
        {BANNERS.map((b) => (
          <Link
            key={b.title}
            to={b.to}
            className={`home-banner-card home-banner-${b.tone}`}
          >
            <span
              className="home-banner-media"
              style={{ backgroundImage: `url(${b.image})` }}
              aria-hidden
            />
            <span className="home-banner-copy">
              <span className="home-banner-kicker">{b.kicker}</span>
              <strong>{b.title}</strong>
              <span>{b.text}</span>
            </span>
          </Link>
        ))}
      </section>

      <section
        className="home-section home-flash"
        ref={featuredRef}
        aria-busy={showSkeleton || undefined}
      >
        <div className="home-section-head home-flash-head">
          <div>
            <p className="home-section-kicker">Les plus demandés</p>
            <h2>En ce moment</h2>
          </div>
          <Link className="home-section-link" to="/catalogue">
            Tout voir
          </Link>
        </div>

        {showSkeleton ? (
          <div className="home-flash-grid" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="product product-skeleton product-dense" />
            ))}
          </div>
        ) : flash.length === 0 ? (
          <p className="muted">Boutique temporairement inactive.</p>
        ) : (
          <div className="home-flash-grid">
            {flash.map((p, i) => (
              <ProductCard
                key={p.id}
                p={p}
                index={i}
                eager={i < 3}
                dense
              />
            ))}
          </div>
        )}
      </section>

      <div className="brands-rail home-brands" aria-label="Marques disponibles">
        <div className="brands-track">
          {marquesLoop.map((m, i) => (
            <span key={`${m}-${i}`} className="brand-chip">
              {m}
            </span>
          ))}
        </div>
      </div>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <p className="home-section-kicker">Pour vous</p>
            <h2>
              {data?.profil?.personnalise
                ? 'Sélection personnalisée'
                : 'À découvrir'}
            </h2>
            {profilMsg && <p className="home-interest-hint">{profilMsg}</p>}
            {centres.length > 0 && (
              <div className="home-interest-chips" aria-label="Centres d’intérêt">
                {centres.slice(0, 4).map((c) => (
                  <Link
                    key={c}
                    to={`/catalogue/${encodeURIComponent(c)}`}
                    className="home-interest-chip"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link className="home-section-link" to="/catalogue">
            Catalogue
          </Link>
        </div>

        {showSkeleton ? (
          <div className="product-grid product-grid-dense" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="product product-skeleton product-dense" />
            ))}
          </div>
        ) : pourVous.length === 0 ? (
          <p className="muted">Aucun produit à afficher.</p>
        ) : (
          <div className="product-grid product-grid-dense">
            {pourVous.map((p, i) => (
              <ProductCard
                key={`pv-${p.id}`}
                p={p}
                index={i}
                dense
                badge={p.badge}
              />
            ))}
          </div>
        )}
      </section>

      {tendances.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <p className="home-section-kicker">Tendances 30 jours</p>
              <h2>Les plus vendus</h2>
            </div>
            <Link className="home-section-link" to="/catalogue">
              Catalogue
            </Link>
          </div>
          <div className="product-grid product-grid-dense">
            {tendances.map((p, i) => (
              <ProductCard key={`td-${p.id}`} p={p} index={i} dense />
            ))}
          </div>
        </section>
      )}

      <section className="home-services" aria-label="Engagements MAJOR">
        {TRUST.map((t) => (
          <div key={t.title} className="home-service">
            <strong>{t.title}</strong>
            <span>{t.text}</span>
          </div>
        ))}
      </section>

      <section className="home-cta-band">
        <div>
          <h2>Pièces auto livrées à Abidjan</h2>
          <p>
            Commandez en ligne vos pièces automobiles en Côte d’Ivoire :
            retrait showroom ou livraison. Paiement Wave, Orange Money, carte
            ou au retrait.
          </p>
        </div>
        <Link className="btn" to="/catalogue">
          Commander maintenant
        </Link>
      </section>
    </div>
  );
}
