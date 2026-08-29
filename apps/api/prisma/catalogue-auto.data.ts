/**
 * Catalogue e-commerce MAJOR AUTO PARTS — familles + variantes.
 * Catégories = libellés shop (`apps/shop/src/lib/brand.ts`).
 * `image` = fichier dans apps/shop/public/catalogue/.
 */
export type VarianteAuto = {
  ref: string;
  slug: string;
  designation: string;
  attributs: string;
  prixWeb: number;
  image: string;
  stockWeb: number;
};

export type FamilleAuto = {
  categorie: string;
  description: string;
  variants: VarianteAuto[];
};

export const CATALOGUE_AUTO: FamilleAuto[] = [
  {
    categorie: 'Phares',
    description:
      'Kit LED plug & play — faisceau adapté, faible consommation. Vérifier le culot (H7, H4, H11, HB3) avant montage. Garantie showroom.',
    variants: [
      {
        ref: 'LED-H7-W',
        slug: 'kit-phares-led-h7',
        designation: 'Kit phares LED H7 blanc 6000K',
        attributs:
          'Culot: H7 | Couleur: Blanc | Température: 6000K | Compatibilité: Universel',
        prixWeb: 28500,
        image: 'phares-led.jpg',
        stockWeb: 28,
      },
      {
        ref: 'LED-H4-W',
        slug: 'kit-phares-led-h4',
        designation: 'Kit phares LED H4 blanc 6000K',
        attributs:
          'Culot: H4 | Couleur: Blanc | Température: 6000K | Compatibilité: Universel',
        prixWeb: 29500,
        image: 'phares-led.jpg',
        stockWeb: 22,
      },
      {
        ref: 'LED-H11-W',
        slug: 'kit-phares-led-h11',
        designation: 'Kit phares LED H11 blanc 6000K',
        attributs:
          'Culot: H11 | Couleur: Blanc | Température: 6000K | Compatibilité: Universel',
        prixWeb: 27500,
        image: 'phares-led.jpg',
        stockWeb: 24,
      },
      {
        ref: 'LED-HB3-W',
        slug: 'kit-phares-led-hb3',
        designation: 'Kit phares LED HB3 blanc 6000K',
        attributs:
          'Culot: HB3 | Couleur: Blanc | Température: 6000K | Compatibilité: Universel',
        prixWeb: 29900,
        image: 'phares-led.jpg',
        stockWeb: 16,
      },
      {
        ref: 'LED-H7-Y',
        slug: 'kit-phares-led-h7-jaune',
        designation: 'Kit phares LED H7 jaune 3000K',
        attributs:
          'Culot: H7 | Couleur: Jaune | Température: 3000K | Compatibilité: Universel',
        prixWeb: 28900,
        image: 'phares-jaune.jpg',
        stockWeb: 18,
      },
    ],
  },
  {
    categorie: 'Phares',
    description:
      'Antibrouillards LED — visibilité pluie et poussière. Culot H8 / H11. Montage showroom recommandé.',
    variants: [
      {
        ref: 'FOG-H11-W',
        slug: 'antibrouillard-led-h11',
        designation: 'Antibrouillard LED H11 blanc',
        attributs: 'Culot: H11 | Couleur: Blanc | Puissance: 30W',
        prixWeb: 18500,
        image: 'antibrouillard.jpg',
        stockWeb: 20,
      },
      {
        ref: 'FOG-H8-W',
        slug: 'antibrouillard-led-h8',
        designation: 'Antibrouillard LED H8 blanc',
        attributs: 'Culot: H8 | Couleur: Blanc | Puissance: 30W',
        prixWeb: 17900,
        image: 'antibrouillard.jpg',
        stockWeb: 14,
      },
      {
        ref: 'FOG-H11-Y',
        slug: 'antibrouillard-led-h11-jaune',
        designation: 'Antibrouillard LED H11 jaune',
        attributs: 'Culot: H11 | Couleur: Jaune | Puissance: 30W',
        prixWeb: 18900,
        image: 'phares-jaune.jpg',
        stockWeb: 12,
      },
    ],
  },
  {
    categorie: 'Éclairage',
    description:
      'Barre LED 4x4 — aluminium, étanche. Idéale calandre / galerie. Câblage et relais fournis.',
    variants: [
      {
        ref: 'BAR-50-W',
        slug: 'barre-led-50cm',
        designation: 'Barre LED 50 cm blanc',
        attributs: 'Longueur: 50 cm | Couleur: Blanc | Puissance: 72W',
        prixWeb: 45000,
        image: 'eclairage-barre.jpg',
        stockWeb: 15,
      },
      {
        ref: 'BAR-100-W',
        slug: 'barre-led-100cm',
        designation: 'Barre LED 100 cm blanc',
        attributs: 'Longueur: 100 cm | Couleur: Blanc | Puissance: 144W',
        prixWeb: 72000,
        image: 'eclairage-barre.jpg',
        stockWeb: 10,
      },
      {
        ref: 'BAR-100-C',
        slug: 'barre-led-100cm-combo',
        designation: 'Barre LED 100 cm combo blanc / jaune',
        attributs: 'Longueur: 100 cm | Couleur: Combo | Puissance: 144W',
        prixWeb: 78000,
        image: 'eclairage-barre.jpg',
        stockWeb: 8,
      },
    ],
  },
  {
    categorie: 'Éclairage',
    description:
      'Kit ambiance intérieure RGB — bandeaux LED, télécommande. Installation sous tableau de bord / seuils.',
    variants: [
      {
        ref: 'AMB-4P',
        slug: 'ambiance-rgb-4-portes',
        designation: 'Kit ambiance RGB 4 portes',
        attributs: 'Places: 4 portes | Couleur: RGB | Commande: Télécommande',
        prixWeb: 24500,
        image: 'eclairage-ambiance.jpg',
        stockWeb: 18,
      },
      {
        ref: 'AMB-2P',
        slug: 'ambiance-rgb-2-portes',
        designation: 'Kit ambiance RGB 2 portes',
        attributs: 'Places: 2 portes | Couleur: RGB | Commande: Télécommande',
        prixWeb: 19500,
        image: 'eclairage-ambiance.jpg',
        stockWeb: 14,
      },
    ],
  },
  {
    categorie: 'Jantes & Pneus',
    description:
      'Jante alliage sport — vendue à l’unité. Contrôler entraxe, déport (ET) et diamètre de moyeu avant commande.',
    variants: [
      {
        ref: 'JNT-17-N',
        slug: 'jante-alliage-17-noir',
        designation: 'Jante alliage 17" noir',
        attributs: 'Taille: 17" | Finition: Noir | Entraxe: 5x114.3',
        prixWeb: 85000,
        image: 'jantes-noir.jpg',
        stockWeb: 12,
      },
      {
        ref: 'JNT-18-N',
        slug: 'jante-alliage-18-noir',
        designation: 'Jante alliage 18" noir',
        attributs: 'Taille: 18" | Finition: Noir | Entraxe: 5x114.3',
        prixWeb: 98000,
        image: 'jantes-noir.jpg',
        stockWeb: 10,
      },
      {
        ref: 'JNT-18-A',
        slug: 'jante-alliage-18-argent',
        designation: 'Jante alliage 18" argent',
        attributs: 'Taille: 18" | Finition: Argent | Entraxe: 5x114.3',
        prixWeb: 95000,
        image: 'jantes-argent.jpg',
        stockWeb: 10,
      },
      {
        ref: 'JNT-19-G',
        slug: 'jante-alliage-19-gunmetal',
        designation: 'Jante alliage 19" gunmetal',
        attributs: 'Taille: 19" | Finition: Gunmetal | Entraxe: 5x112',
        prixWeb: 125000,
        image: 'jantes-gunmetal.jpg',
        stockWeb: 6,
      },
    ],
  },
  {
    categorie: 'Jantes & Pneus',
    description:
      'Pneu UHP — gomme été, indice H/V. Montage et équilibrage au showroom.',
    variants: [
      {
        ref: 'PNEU-205-55-16',
        slug: 'pneu-uhp-205-55-r16',
        designation: 'Pneu UHP 205/55 R16',
        attributs: 'Dimension: 205/55 R16 | Taille: 16"',
        prixWeb: 42000,
        image: 'pneus.jpg',
        stockWeb: 16,
      },
      {
        ref: 'PNEU-225-45-17',
        slug: 'pneu-uhp-225-45-r17',
        designation: 'Pneu UHP 225/45 R17',
        attributs: 'Dimension: 225/45 R17 | Taille: 17"',
        prixWeb: 52000,
        image: 'pneus.jpg',
        stockWeb: 12,
      },
      {
        ref: 'PNEU-245-40-18',
        slug: 'pneu-uhp-245-40-r18',
        designation: 'Pneu UHP 245/40 R18',
        attributs: 'Dimension: 245/40 R18 | Taille: 18"',
        prixWeb: 68000,
        image: 'pneus.jpg',
        stockWeb: 8,
      },
    ],
  },
  {
    categorie: 'Housses',
    description:
      'Housse sièges cuir PU — 5 places, coutures contrastées. Indiquer marque / modèle / année au showroom pour un ajustement précis.',
    variants: [
      {
        ref: 'HS-5P-N',
        slug: 'housse-cuir-5-places-noir',
        designation: 'Housse cuir PU 5 places noir',
        attributs: 'Couleur: Noir | Matière: Cuir PU | Places: 5',
        prixWeb: 55000,
        image: 'housses-noir.jpg',
        stockWeb: 14,
      },
      {
        ref: 'HS-5P-B',
        slug: 'housse-cuir-5-places-beige',
        designation: 'Housse cuir PU 5 places beige',
        attributs: 'Couleur: Beige | Matière: Cuir PU | Places: 5',
        prixWeb: 55000,
        image: 'housses-beige.jpg',
        stockWeb: 10,
      },
      {
        ref: 'HS-5P-R',
        slug: 'housse-cuir-5-places-rouge',
        designation: 'Housse cuir PU 5 places rouge',
        attributs: 'Couleur: Rouge | Matière: Cuir PU | Places: 5',
        prixWeb: 58000,
        image: 'housses-rouge.jpg',
        stockWeb: 8,
      },
    ],
  },
  {
    categorie: 'Électronique',
    description:
      'Caméra de recul HD — vision nocturne, angle large. Version filaire ou Wi-Fi.',
    variants: [
      {
        ref: 'CAM-FIL',
        slug: 'camera-recul-filaire',
        designation: 'Caméra de recul HD filaire',
        attributs: 'Compatibilité: Universel | Connectique: Filaire',
        prixWeb: 18500,
        image: 'camera-recul.jpg',
        stockWeb: 22,
      },
      {
        ref: 'CAM-WIFI',
        slug: 'camera-recul-wifi',
        designation: 'Caméra de recul HD Wi-Fi',
        attributs: 'Compatibilité: Universel | Connectique: Wi-Fi',
        prixWeb: 26500,
        image: 'camera-recul.jpg',
        stockWeb: 12,
      },
    ],
  },
  {
    categorie: 'Électronique',
    description:
      'Autoradio Android — écran tactile, GPS, Bluetooth. Façade 2 DIN universelle. Adaptation Toyota / Mercedes au showroom.',
    variants: [
      {
        ref: 'RADIO-9',
        slug: 'autoradio-android-9',
        designation: 'Autoradio Android 9 pouces',
        attributs: 'Taille: 9" | Compatibilité: Universel | Capacité: 2 Go',
        prixWeb: 85000,
        image: 'autoradio.jpg',
        stockWeb: 9,
      },
      {
        ref: 'RADIO-10',
        slug: 'autoradio-android-10',
        designation: 'Autoradio Android 10 pouces',
        attributs: 'Taille: 10" | Compatibilité: Universel | Capacité: 4 Go',
        prixWeb: 105000,
        image: 'autoradio.jpg',
        stockWeb: 7,
      },
    ],
  },
  {
    categorie: 'Électronique',
    description:
      'Caméra embarquée 4K — vision nocturne, boucle d’enregistrement. Kit avant ou avant + arrière.',
    variants: [
      {
        ref: 'DASH-AV',
        slug: 'dashcam-4k-avant',
        designation: 'Dashcam 4K avant',
        attributs: 'Variante: Avant | Capacité: 64 Go',
        prixWeb: 32000,
        image: 'dashcam.jpg',
        stockWeb: 16,
      },
      {
        ref: 'DASH-AR',
        slug: 'dashcam-4k-avant-arriere',
        designation: 'Dashcam 4K avant + arrière',
        attributs: 'Variante: Avant + arrière | Capacité: 128 Go',
        prixWeb: 48000,
        image: 'dashcam.jpg',
        stockWeb: 10,
      },
    ],
  },
  {
    categorie: 'Mécanique',
    description:
      'Plaquettes de frein céramique — faible poussière, silence. Référence constructeur recommandée — atelier disponible.',
    variants: [
      {
        ref: 'PLQ-AV-ST',
        slug: 'plaquettes-avant-standard',
        designation: 'Plaquettes avant standard',
        attributs: 'Variante: Avant | Finition: Standard',
        prixWeb: 18500,
        image: 'freins.jpg',
        stockWeb: 24,
      },
      {
        ref: 'PLQ-AV-SP',
        slug: 'plaquettes-avant-sport',
        designation: 'Plaquettes avant sport',
        attributs: 'Variante: Avant | Finition: Sport',
        prixWeb: 28500,
        image: 'freins.jpg',
        stockWeb: 12,
      },
      {
        ref: 'PLQ-AR-ST',
        slug: 'plaquettes-arriere-standard',
        designation: 'Plaquettes arrière standard',
        attributs: 'Variante: Arrière | Finition: Standard',
        prixWeb: 16500,
        image: 'freins.jpg',
        stockWeb: 18,
      },
    ],
  },
  {
    categorie: 'Mécanique',
    description:
      'Huile moteur synthétique — bidon prêt à l’emploi. Vidange possible au showroom.',
    variants: [
      {
        ref: 'HUILE-5W30-4',
        slug: 'huile-5w30-4l',
        designation: 'Huile moteur 5W-30 4 L',
        attributs: 'Viscosité: 5W-30 | Dimension: 4 L',
        prixWeb: 18500,
        image: 'huile.jpg',
        stockWeb: 30,
      },
      {
        ref: 'HUILE-5W40-5',
        slug: 'huile-5w40-5l',
        designation: 'Huile moteur 5W-40 5 L',
        attributs: 'Viscosité: 5W-40 | Dimension: 5 L',
        prixWeb: 24500,
        image: 'huile.jpg',
        stockWeb: 22,
      },
      {
        ref: 'HUILE-10W40-5',
        slug: 'huile-10w40-5l',
        designation: 'Huile moteur 10W-40 5 L',
        attributs: 'Viscosité: 10W-40 | Dimension: 5 L',
        prixWeb: 16500,
        image: 'huile.jpg',
        stockWeb: 20,
      },
    ],
  },
  {
    categorie: 'Tuning Performance',
    description:
      'Admission dynamique — filtre sport, gain de réponse. Finition carbone ou aluminium.',
    variants: [
      {
        ref: 'ADM-CARB',
        slug: 'admission-carbone',
        designation: 'Admission dynamique carbone',
        attributs: 'Finition: Carbone | Compatibilité: Universel',
        prixWeb: 75000,
        image: 'admission.jpg',
        stockWeb: 8,
      },
      {
        ref: 'ADM-ALU',
        slug: 'admission-aluminium',
        designation: 'Admission dynamique aluminium',
        attributs: 'Finition: Aluminium | Compatibilité: Universel',
        prixWeb: 55000,
        image: 'admission.jpg',
        stockWeb: 10,
      },
    ],
  },
  {
    categorie: 'Tuning Performance',
    description:
      'Silencieux sport inox — sortie simple ou double. Contrôle sonore, homologation à confirmer selon usage.',
    variants: [
      {
        ref: 'ECH-SMPL',
        slug: 'silencieux-sport-simple',
        designation: 'Silencieux sport sortie simple',
        attributs: 'Finition: Inox | Variante: Simple',
        prixWeb: 85000,
        image: 'echappement.jpg',
        stockWeb: 6,
      },
      {
        ref: 'ECH-DBL',
        slug: 'silencieux-sport-double',
        designation: 'Silencieux sport sortie double',
        attributs: 'Finition: Inox | Variante: Double',
        prixWeb: 125000,
        image: 'echappement.jpg',
        stockWeb: 4,
      },
    ],
  },
  {
    categorie: 'Accessoires Premium',
    description:
      'Pommeau de vitesse — cuir ou carbone. Filetage universel, bagues d’adaptation fournies.',
    variants: [
      {
        ref: 'POM-CUIR-N',
        slug: 'pommeau-cuir-noir',
        designation: 'Pommeau de vitesse cuir noir',
        attributs: 'Couleur: Noir | Matière: Cuir',
        prixWeb: 12500,
        image: 'pommeau.jpg',
        stockWeb: 20,
      },
      {
        ref: 'POM-CARB',
        slug: 'pommeau-carbone',
        designation: 'Pommeau de vitesse carbone',
        attributs: 'Couleur: Carbone | Matière: Carbone',
        prixWeb: 18500,
        image: 'pommeau.jpg',
        stockWeb: 12,
      },
    ],
  },
  {
    categorie: 'Accessoires Premium',
    description:
      'Seuils de porte — inox ou noir brossé. Protection et look showroom.',
    variants: [
      {
        ref: 'SEUIL-INOX',
        slug: 'seuil-porte-inox',
        designation: 'Seuils de porte inox',
        attributs: 'Finition: Inox | Variante: 4 portes',
        prixWeb: 22000,
        image: 'seuil.jpg',
        stockWeb: 16,
      },
      {
        ref: 'SEUIL-NOIR',
        slug: 'seuil-porte-noir',
        designation: 'Seuils de porte noir',
        attributs: 'Finition: Noir | Variante: 4 portes',
        prixWeb: 22000,
        image: 'seuil.jpg',
        stockWeb: 14,
      },
    ],
  },
];
