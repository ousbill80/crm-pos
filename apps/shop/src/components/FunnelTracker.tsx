import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { captureShopAttribution, trackShopEvent } from '../lib/aarrr';
import { rememberInterest } from '../lib/interests';

export function FunnelTracker() {
  const location = useLocation();
  const landingSent = useRef(false);

  useEffect(() => {
    const attr = captureShopAttribution(location.search);
    if (!landingSent.current) {
      landingSent.current = true;
      if (attr.utmSource || attr.codeParrain) {
        trackShopEvent('LANDING');
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (location.pathname === '/') {
      trackShopEvent('VIEW_HOME');
      return;
    }

    if (location.pathname === '/catalogue') {
      const q = new URLSearchParams(location.search).get('q')?.trim();
      if (q) {
        rememberInterest({ categorie: q, weight: 2 });
        trackShopEvent('SEARCH', { requete: q });
      }
      return;
    }

    if (location.pathname.startsWith('/catalogue/')) {
      const segment = decodeURIComponent(
        location.pathname.replace(/^\/catalogue\//, '').split('/')[0] ?? '',
      ).trim();
      const q = new URLSearchParams(location.search).get('q')?.trim();
      if (segment) {
        rememberInterest({ categorie: segment, weight: 3 });
        trackShopEvent('SEARCH', { requete: segment });
      }
      if (q) {
        rememberInterest({ categorie: q, weight: 2 });
        trackShopEvent('SEARCH', { requete: q });
      }
    }
  }, [location.pathname, location.search]);

  return null;
}
