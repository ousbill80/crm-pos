import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { CartDrawer } from './components/CartDrawer';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { FunnelTracker } from './components/FunnelTracker';
import HomePage from './routes/HomePage';
import CataloguePage from './routes/CataloguePage';
import ProduitPage from './routes/ProduitPage';
import PanierPage from './routes/PanierPage';
import CheckoutPage from './routes/CheckoutPage';
import ConfirmationPage from './routes/ConfirmationPage';
import SuiviPage from './routes/SuiviPage';
import ComptePage from './routes/ComptePage';
import AvisPage from './routes/AvisPage';

import CgvPage from './routes/CgvPage';
import ConfidentialitePage from './routes/ConfidentialitePage';
import RetoursPage from './routes/RetoursPage';

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="brand-major">MAJOR</span>
          <span className="brand-auto">AUTO PARTS</span>
          <p>
            Accessoires & pièces pour véhicules — tous modèles, toutes marques.
            Click & collect et livraison.
          </p>
        </div>
        <div className="footer-col">
          <h4>Boutique</h4>
          <Link to="/catalogue">Catalogue</Link>
          <Link to="/panier">Panier</Link>
          <Link to="/compte">Mon compte</Link>
        </div>
        <div className="footer-col">
          <h4>Informations</h4>
          <Link to="/cgv">CGV</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/retours">Retours</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} MAJOR AUTO PARTS
          <span className="footer-sep"> · </span>
          Design by{' '}
          <a
            href="https://www.prodestic.net"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-credit"
          >
            PRODESTIC
          </a>
        </span>
        <span>Tous modèles · Toutes marques</span>
      </div>
    </footer>
  );
}

export default function App() {
  const location = useLocation();
  const isCheckout = location.pathname.startsWith('/checkout');

  return (
    <>
      <PwaInstallBanner />
      <FunnelTracker />
      {!isCheckout && (
        <>
          <SiteHeader />
          <CartDrawer />
        </>
      )}

      <main className={isCheckout ? 'site-main checkout-main-wrap' : 'site-main'}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="/catalogue/:categorie" element={<CataloguePage />} />
          <Route path="/produit/:slug" element={<ProduitPage />} />
          <Route path="/panier" element={<PanierPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/confirmation" element={<ConfirmationPage />} />
          <Route path="/suivi/:token" element={<SuiviPage />} />
          <Route path="/avis/:token" element={<AvisPage />} />
          <Route path="/compte" element={<ComptePage />} />
          <Route path="/cgv" element={<CgvPage />} />
          <Route path="/confidentialite" element={<ConfidentialitePage />} />
          <Route path="/retours" element={<RetoursPage />} />
        </Routes>
      </main>

      {!isCheckout && <SiteFooter />}
    </>
  );
}
