import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DEFAULT_OG_IMAGE,
  SHOP_ORIGIN,
  absoluteUrl,
  seoForPath,
  type SeoPayload,
} from '../lib/seo';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(data: SeoPayload['jsonLd']) {
  const id = 'major-seo-jsonld';
  const prev = document.getElementById(id);
  if (!data) {
    prev?.remove();
    return;
  }
  const el =
    (prev as HTMLScriptElement | null) ?? document.createElement('script');
  el.id = id;
  el.type = 'application/ld+json';
  el.text = JSON.stringify(data);
  if (!prev) document.head.appendChild(el);
}

export function applySeo(payload: SeoPayload) {
  const url = absoluteUrl(payload.path);
  const image = payload.image || DEFAULT_OG_IMAGE;
  document.title = payload.title;
  upsertMeta('name', 'description', payload.description);
  upsertMeta('name', 'robots', payload.robots ?? 'index, follow, noai, noimageai');
  upsertMeta(
    'property',
    'og:type',
    payload.path.startsWith('/produit/') ? 'product' : 'website',
  );
  upsertMeta('property', 'og:site_name', 'MAJOR AUTO PARTS');
  upsertMeta('property', 'og:locale', 'fr_CI');
  upsertMeta('property', 'og:title', payload.title);
  upsertMeta('property', 'og:description', payload.description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', image);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', payload.title);
  upsertMeta('name', 'twitter:description', payload.description);
  upsertMeta('name', 'twitter:image', image);
  upsertLink('canonical', url.split('?')[0] ?? url);
  upsertJsonLd(payload.jsonLd);
}

/** SEO des routes hors fiche produit (la PDP applique son propre payload). */
export function RouteSeo() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const payload = seoForPath(pathname, search);
    if (payload) applySeo(payload);
  }, [pathname, search]);
  return null;
}

export function useSeo(payload: SeoPayload | null) {
  useEffect(() => {
    if (payload) applySeo(payload);
  }, [payload]);
}

export { SHOP_ORIGIN };
