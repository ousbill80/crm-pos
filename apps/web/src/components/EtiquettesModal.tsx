import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiDownloadPost, apiFetch, messageDepuisApi } from '../lib/api';
import { Modal } from './Modal';
import type { BoutiqueDto } from '../lib/types';

const MAX_ETIQUETTES = 1000;

export interface ArticleEtiquetteSelection {
  produitId: string;
  designation: string;
  reference: string | null;
  quantite: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  articles: ArticleEtiquetteSelection[];
  onQuantiteChange: (produitId: string, quantite: number) => void;
  onRemove: (produitId: string) => void;
  onImprime?: () => void;
}

export function EtiquettesModal({
  open,
  onClose,
  articles,
  onQuantiteChange,
  onRemove,
  onImprime,
}: Props) {
  const [format, setFormat] = useState<'ROULEAU' | 'PLANCHE_A4'>('PLANCHE_A4');
  const [afficherNom, setAfficherNom] = useState(true);
  const [afficherBoutique, setAfficherBoutique] = useState(false);
  const [afficherReference, setAfficherReference] = useState(false);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: open && afficherBoutique,
  });

  const total = useMemo(
    () => articles.reduce((somme, a) => somme + (Number(a.quantite) || 0), 0),
    [articles],
  );

  async function handleImprimer() {
    setErreur(null);
    setSucces(false);
    if (articles.length === 0) {
      setErreur('Sélectionnez au moins un article.');
      return;
    }
    if (total > MAX_ETIQUETTES) {
      setErreur(
        `Le lot demande ${total} étiquettes, au-delà du plafond de ${MAX_ETIQUETTES} par impression. Scindez la sélection.`,
      );
      return;
    }
    if (afficherBoutique && !boutiqueId) {
      setErreur('Choisissez une boutique à afficher sur les étiquettes.');
      return;
    }
    setEnvoi(true);
    try {
      await apiDownloadPost(
        '/produits/etiquettes/pdf',
        {
          articles: articles.map((a) => ({
            produitId: a.produitId,
            quantite: a.quantite,
          })),
          format,
          afficherNom,
          afficherBoutique,
          afficherReference,
          ...(afficherBoutique ? { boutiqueId } : {}),
        },
        'etiquettes-produits.pdf',
      );
      setSucces(true);
      onImprime?.();
    } catch (err) {
      setErreur(messageDepuisApi(err, "Échec de l'impression des étiquettes."));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Imprimer les étiquettes" size="lg">
      {erreur && <p role="alert">{erreur}</p>}
      {succes && <p className="form-hint-success">Étiquettes générées.</p>}

      <div className="form-stack">
        <table className="table-compact">
          <thead>
            <tr>
              <th>Article</th>
              <th>Quantité</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.produitId}>
                <td>
                  <strong>{a.designation}</strong>
                  <div className="produit-ref">{a.reference ?? '—'}</div>
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={a.quantite}
                    onChange={(e) =>
                      onQuantiteChange(
                        a.produitId,
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onRemove(a.produitId)}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <fieldset>
          <legend>Support</legend>
          <label className="checkbox-row">
            <input
              type="radio"
              name="etiquettes-format"
              checked={format === 'ROULEAU'}
              onChange={() => setFormat('ROULEAU')}
            />
            Rouleau thermique (1 étiquette / page)
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              name="etiquettes-format"
              checked={format === 'PLANCHE_A4'}
              onChange={() => setFormat('PLANCHE_A4')}
            />
            Planche A4 (grille)
          </label>
        </fieldset>

        <fieldset>
          <legend>Contenu (code-barres et prix toujours inclus)</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={afficherNom}
              onChange={(e) => setAfficherNom(e.target.checked)}
            />
            Nom de l’article
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={afficherReference}
              onChange={(e) => setAfficherReference(e.target.checked)}
            />
            Référence interne (SKU)
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={afficherBoutique}
              onChange={(e) => setAfficherBoutique(e.target.checked)}
            />
            Nom de la boutique
          </label>
          {afficherBoutique && (
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
            >
              <option value="">— Choisir la boutique —</option>
              {(boutiques.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <p className={total > MAX_ETIQUETTES ? 'form-hint-warning' : 'kpi-hint'}>
          Total : {total} étiquette(s)
          {total > MAX_ETIQUETTES ? ` — au-delà du plafond de ${MAX_ETIQUETTES}` : ''}
        </p>

        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={envoi || articles.length === 0}
            onClick={() => void handleImprimer()}
          >
            {envoi ? 'Génération…' : 'Imprimer les étiquettes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
