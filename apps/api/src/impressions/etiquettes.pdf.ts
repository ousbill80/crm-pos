import bwipjs from 'bwip-js';
import { fmtFcfaPdf } from './pdf.util';

// Impression d'étiquettes code-barres en lot (Catalogue). Page dédiée : ne
// réutilise pas pipePdf (conçu pour des rapports A4 avec bandeau/pied de
// page — inadapté à une étiquette 5x3cm en rouleau thermique).

export interface EtiquetteArticleData {
  produitId: string;
  designation: string;
  reference: string | null;
  codeBarres: string;
  prixUnitaire: string;
  quantite: number;
}

export interface DonneesEtiquettesPdf {
  format: 'ROULEAU' | 'PLANCHE_A4';
  afficherNom: boolean;
  afficherBoutique: boolean;
  afficherReference: boolean;
  boutiqueNom: string | null;
  articles: EtiquetteArticleData[];
}

const MM_TO_PT = 72 / 25.4;
export const ROULEAU_LARGEUR_PT = 50 * MM_TO_PT;
export const ROULEAU_HAUTEUR_PT = 30 * MM_TO_PT;

const A4_COLONNES = 3;
const A4_RANGEES = 8;
const A4_MARGE = 18;

// Détection intelligente de symbologie : un EAN-13 fournisseur (13 chiffres)
// est rendu en ean13 (standard commerce), tout le reste — y compris les
// codes internes générés INT... — en code128 (alphanumérique, sans
// contrainte de longueur/checksum EAN).
function symbologie(codeBarres: string): 'ean13' | 'code128' {
  return /^\d{13}$/.test(codeBarres) ? 'ean13' : 'code128';
}

async function genererImageCodeBarres(codeBarres: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: symbologie(codeBarres),
    text: codeBarres,
    scale: 3,
    height: 10,
    includetext: false,
    backgroundcolor: 'FFFFFF',
  });
}

function fmtPrixEtiquette(prixUnitaire: string): string {
  const n = Number(prixUnitaire);
  if (!Number.isFinite(n)) return prixUnitaire;
  return fmtFcfaPdf(n);
}

interface EtiquetteUnitaire {
  article: EtiquetteArticleData;
  image: Buffer;
}

// Une étiquette par unité de quantité demandée, articles contigus dans
// l'ordre de sélection (pas d'entrelacement entre articles différents).
function developperEtiquettes(
  articles: EtiquetteArticleData[],
  images: Map<string, Buffer>,
): EtiquetteUnitaire[] {
  const out: EtiquetteUnitaire[] = [];
  for (const article of articles) {
    const image = images.get(article.codeBarres);
    if (!image) continue;
    for (let i = 0; i < article.quantite; i += 1) {
      out.push({ article, image });
    }
  }
  return out;
}

function dessinerContenuEtiquette(
  doc: PDFKit.PDFDocument,
  data: DonneesEtiquettesPdf,
  article: EtiquetteArticleData,
  image: Buffer,
  zone: { x: number; y: number; largeur: number; hauteur: number },
): void {
  let y = zone.y;

  if (data.afficherNom) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000000');
    doc.text(article.designation, zone.x, y, {
      width: zone.largeur,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });
    y += 9;
  }

  if (data.afficherBoutique && data.boutiqueNom) {
    doc.font('Helvetica').fontSize(5.5).fillColor('#475569');
    doc.text(data.boutiqueNom, zone.x, y, {
      width: zone.largeur,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });
    y += 8;
  }

  const imgHauteur = Math.min(zone.hauteur * 0.42, 26);
  const imgLargeur = zone.largeur * 0.92;
  doc.image(image, zone.x + (zone.largeur - imgLargeur) / 2, y, {
    width: imgLargeur,
    height: imgHauteur,
  });
  y += imgHauteur + 2;

  doc.font('Helvetica').fontSize(6).fillColor('#000000');
  doc.text(article.codeBarres, zone.x, y, {
    width: zone.largeur,
    align: 'center',
    lineBreak: false,
  });
  y += 8;

  if (data.afficherReference && article.reference) {
    doc.font('Helvetica').fontSize(5.5).fillColor('#475569');
    doc.text(`Réf. ${article.reference}`, zone.x, y, {
      width: zone.largeur,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });
    y += 8;
  }

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
  doc.text(fmtPrixEtiquette(article.prixUnitaire), zone.x, y, {
    width: zone.largeur,
    align: 'center',
    lineBreak: false,
  });
}

function dessinerRouleau(
  doc: PDFKit.PDFDocument,
  data: DonneesEtiquettesPdf,
  etiquettes: EtiquetteUnitaire[],
): void {
  for (const { article, image } of etiquettes) {
    doc.addPage({
      size: [ROULEAU_LARGEUR_PT, ROULEAU_HAUTEUR_PT],
      margin: 6,
    });
    dessinerContenuEtiquette(doc, data, article, image, {
      x: 6,
      y: 6,
      largeur: ROULEAU_LARGEUR_PT - 12,
      hauteur: ROULEAU_HAUTEUR_PT - 12,
    });
  }
}

function dessinerPlancheA4(
  doc: PDFKit.PDFDocument,
  data: DonneesEtiquettesPdf,
  etiquettes: EtiquetteUnitaire[],
): void {
  const parPage = A4_COLONNES * A4_RANGEES;
  etiquettes.forEach(({ article, image }, index) => {
    const indexDansPage = index % parPage;
    if (indexDansPage === 0) {
      doc.addPage({ size: 'A4', margin: A4_MARGE });
    }
    const col = indexDansPage % A4_COLONNES;
    const row = Math.floor(indexDansPage / A4_COLONNES);
    const largeurUtile = doc.page.width - A4_MARGE * 2;
    const hauteurUtile = doc.page.height - A4_MARGE * 2;
    const largeurCellule = largeurUtile / A4_COLONNES;
    const hauteurCellule = hauteurUtile / A4_RANGEES;
    const x = A4_MARGE + col * largeurCellule;
    const y = A4_MARGE + row * hauteurCellule;

    // Repère de découpe : une planche A4 se découpe aux ciseaux/massicot,
    // le pointillé indique la limite exacte de chaque étiquette.
    doc
      .dash(1.5, { space: 1.5 })
      .rect(x, y, largeurCellule, hauteurCellule)
      .stroke('#94a3b8');
    doc.undash();

    dessinerContenuEtiquette(doc, data, article, image, {
      x: x + 4,
      y: y + 4,
      largeur: largeurCellule - 8,
      hauteur: hauteurCellule - 8,
    });
  });
}

export async function dessinerEtiquettesPdf(
  doc: PDFKit.PDFDocument,
  data: DonneesEtiquettesPdf,
): Promise<void> {
  const codesUniques = Array.from(
    new Set(data.articles.map((a) => a.codeBarres)),
  );
  const images = new Map<string, Buffer>();
  for (const code of codesUniques) {
    images.set(code, await genererImageCodeBarres(code));
  }

  const etiquettes = developperEtiquettes(data.articles, images);

  if (data.format === 'ROULEAU') {
    dessinerRouleau(doc, data, etiquettes);
  } else {
    dessinerPlancheA4(doc, data, etiquettes);
  }
}
