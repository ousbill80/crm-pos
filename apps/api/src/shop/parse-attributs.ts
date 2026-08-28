/**
 * Parse libre du champ `Produit.attributs` (texte ou JSON).
 * Formats acceptés :
 * - JSON : {"Couleur":"Noir","Culot":"H7"}
 * - paires : Couleur: Noir | Culot: H7
 * - paires : Couleur=Noir; Culot=H7
 * - libellé seul : H7 / Blanc → { Variante: "H7 / Blanc" }
 */
export function parseAttributsMap(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw?.trim()) return {};
  const text = raw.trim();

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v == null || v === '') continue;
          out[String(k).trim()] = String(v).trim();
        }
        return out;
      }
    } catch {
      /* fallback texte */
    }
  }

  const pairs = text.split(/\s*[|;,/]\s*/).filter(Boolean);
  const out: Record<string, string> = {};
  let plainParts: string[] = [];
  for (const part of pairs) {
    const m = part.match(/^([^:=]+)[:=](.+)$/);
    if (m) {
      out[m[1].trim()] = m[2].trim();
    } else {
      plainParts.push(part.trim());
    }
  }
  if (Object.keys(out).length === 0 && plainParts.length > 0) {
    return { Variante: plainParts.join(' / ') };
  }
  if (plainParts.length > 0 && !out.Variante) {
    out.Variante = plainParts.join(' / ');
  }
  return out;
}
