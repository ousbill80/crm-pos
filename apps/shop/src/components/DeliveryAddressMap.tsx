import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const ABIDJAN = { lat: 5.36, lng: -4.0083 };

export type DeliveryGeo = {
  lat: number;
  lng: number;
  ligne1: string;
  ville: string;
};

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
  };
};

function parseHit(hit: NominatimHit): DeliveryGeo {
  const a = hit.address ?? {};
  const street =
    [a.road, a.neighbourhood ?? a.suburb].filter(Boolean).join(', ') ||
    hit.display_name.split(',')[0]?.trim() ||
    hit.display_name;
  const ville =
    a.city ?? a.town ?? a.village ?? a.municipality ?? a.state ?? 'Abidjan';
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    ligne1: street,
    ville,
  };
}

async function searchAddresses(q: string): Promise<NominatimHit[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${q}, Côte d'Ivoire`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'ci');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  return (await res.json()) as NominatimHit[];
}

async function reverseGeocode(lat: number, lng: number): Promise<DeliveryGeo> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    return {
      lat,
      lng,
      ligne1: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      ville: 'Abidjan',
    };
  }
  const hit = (await res.json()) as NominatimHit;
  return parseHit({ ...hit, lat: String(lat), lon: String(lng) });
}

/** Recherche d’adresse + carte compacte (remplit automatiquement l’adresse). */
export function DeliveryAddressMap({
  lat,
  lng,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  onPick: (geo: DeliveryGeo) => void;
}) {
  const listId = useId();
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [lat ?? ABIDJAN.lat, lng ?? ABIDJAN.lng],
      zoom: 12,
      scrollWheelZoom: false,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      void reverseGeocode(e.latlng.lat, e.latlng.lng).then((g) =>
        onPickRef.current(g),
      );
    });
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current?.getLatLng();
        if (!p) return;
        void reverseGeocode(p.lat, p.lng).then((g) => onPickRef.current(g));
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [lat, lng]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      setBusy(true);
      void searchAddresses(q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [query]);

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude)
          .then((g) => onPickRef.current(g))
          .finally(() => setBusy(false));
      },
      () => {
        setBusy(false);
        setGeoError('Autorisez la localisation ou cherchez votre adresse.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="checkout-map-block">
      <div className="checkout-map-search-row">
        <label className="checkout-field checkout-map-search">
          <span>Adresse sur la carte</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cocody, Plateau, Yopougon…"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={listId}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost checkout-map-locate"
          onClick={useMyLocation}
          disabled={busy}
        >
          Ma position
        </button>
      </div>

      {(busy || hits.length > 0) && (
        <ul id={listId} className="checkout-map-hits" role="listbox">
          {busy && hits.length === 0 && <li className="muted">Recherche…</li>}
          {hits.map((h) => (
            <li key={`${h.lat}-${h.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(parseHit(h));
                  setQuery(h.display_name.split(',').slice(0, 2).join(','));
                  setHits([]);
                }}
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {geoError && (
        <p className="checkout-error" role="alert">
          {geoError}
        </p>
      )}

      <div
        ref={containerRef}
        className="checkout-map"
        role="application"
        aria-label="Carte — cliquez pour placer le pin"
      />

      {lat != null && lng != null ? (
        <p className="checkout-map-ok">
          Point GPS enregistré ({lat.toFixed(4)}, {lng.toFixed(4)})
        </p>
      ) : (
        <p className="checkout-hint">
          Cherchez, utilisez « Ma position », ou cliquez sur la carte.
        </p>
      )}
    </div>
  );
}
