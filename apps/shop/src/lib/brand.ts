export const MARQUES = [
  'MERCEDES',
  'TOYOTA',
  'BMW',
  'AUDI',
  'LAND ROVER',
  'HYUNDAI',
  'HONDA',
  'FORD',
  'GEELY',
  'HAVAL',
  'CHANGAN',
  'RENAULT',
  'CITROËN',
  'CHEVROLET',
  'SUZUKI',
  'VOLKSWAGEN',
] as const;

export const CATEGORIES = [
  {
    slug: 'tuning',
    label: 'Tuning Performance',
    hint: 'Admission, échappement, look sport',
  },
  {
    slug: 'jantes',
    label: 'Jantes & Pneus',
    hint: 'Alliage, runflat, sport',
  },
  {
    slug: 'phares',
    label: 'Phares',
    hint: 'Optiques LED & xénon',
  },
  {
    slug: 'eclairage',
    label: 'Éclairage',
    hint: 'Barres LED, ambiance',
  },
  {
    slug: 'housses',
    label: 'Housses',
    hint: 'Cuir, sur-mesure',
  },
  {
    slug: 'electronique',
    label: 'Électronique',
    hint: 'Caméras, multimédia',
  },
  {
    slug: 'mecanique',
    label: 'Mécanique',
    hint: 'Freins, filtres, moteur',
  },
  {
    slug: 'accessoires',
    label: 'Accessoires Premium',
    hint: 'Finitions & style',
  },
] as const;

export const TRUST = [
  { title: 'Livraison rapide', text: 'Zones Abidjan & retrait showroom' },
  { title: 'Paiement sécurisé', text: 'Carte, Orange Money, Wave' },
  { title: 'Toutes marques', text: 'Mercedes, Toyota, BMW, Audi…' },
  { title: 'Conseil atelier', text: 'Équipe technique showroom' },
] as const;

/** Seuil panier (FCFA) pour message d’avantage livraison / priorité préparation. */
export const PANIER_SEUIL_AVANTAGE = 75_000;
