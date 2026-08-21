import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, FileSpreadsheet, Upload } from 'lucide-react';
import { apiDownload, apiFetch, messageDepuisApi } from '../lib/api';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';

const CHAMPS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'designation', label: 'Désignation', hint: 'obligatoire à la création' },
  { id: 'reference', label: 'Référence / SKU', hint: 'rapprochement' },
  { id: 'codeBarres', label: 'Code-barres', hint: 'rapprochement' },
  { id: 'prixUnitaire', label: 'Prix unitaire', hint: 'obligatoire à la création' },
  { id: 'categorie', label: 'Catégorie', hint: '' },
  { id: 'description', label: 'Description', hint: '' },
  { id: 'seuilReappro', label: 'Seuil réappro', hint: '' },
  { id: 'actif', label: 'Actif', hint: 'oui / non' },
  { id: 'stock', label: 'Stock initial', hint: 'nouveaux seulement' },
  { id: 'uniteMesure', label: 'Unité', hint: '' },
];

const MAX_FICHIER_OCTETS = 8 * 1024 * 1024;

type Mapping = Record<string, string | null>;
type Etape = 'fichier' | 'mapping' | 'controle';
type FiltreApercu = 'TOUS' | 'CREATE' | 'UPDATE' | 'ERROR' | 'SKIP';

interface ApercuImport {
  source: string;
  enTetes: string[];
  mapping: Mapping;
  colonnesIgnorees: string[];
  totalLignes: number;
  aCreer: number;
  aMettreAJour: number;
  aIgnorer: number;
  enErreur: number;
  avertissementsGlobaux: string[];
  apercu: Array<{
    index: number;
    action: 'CREATE' | 'UPDATE' | 'ERROR' | 'SKIP';
    designation: string | null;
    reference: string | null;
    prixUnitaire: number | null;
    erreurs: string[];
    avertissements: string[];
  }>;
}

interface ResultatImport {
  crees: number;
  misAJour: number;
  ignores: number;
}

function fichierVersPayload(file: File): Promise<{
  csv?: string;
  fichierBase64?: string;
  nomFichier: string;
}> {
  const nomFichier = file.name;
  if (/\.xls$/i.test(nomFichier) && !/\.xlsx$/i.test(nomFichier)) {
    return Promise.reject(
      new Error('Le format .xls n’est pas lu. Enregistrez le fichier en .xlsx ou exportez en CSV.'),
    );
  }
  if (file.size > MAX_FICHIER_OCTETS) {
    return Promise.reject(new Error('Fichier trop volumineux (max. 8 Mo).'));
  }
  const excel = /\.xlsx$/i.test(nomFichier);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    if (excel) {
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Lecture Excel impossible.'));
          return;
        }
        const comma = result.indexOf(',');
        resolve({
          nomFichier,
          fichierBase64: comma >= 0 ? result.slice(comma + 1) : result,
        });
      };
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      resolve({ nomFichier, csv: String(reader.result ?? '') });
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function labelAction(action: ApercuImport['apercu'][number]['action']): string {
  if (action === 'CREATE') return 'Créer';
  if (action === 'UPDATE') return 'Maj';
  if (action === 'SKIP') return 'Ignorer';
  return 'Erreur';
}

export function ImportCatalogueModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [etape, setEtape] = useState<Etape>('fichier');
  const [payload, setPayload] = useState<{
    csv?: string;
    fichierBase64?: string;
    nomFichier: string;
  } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [mode, setMode] = useState<'UPSERT' | 'CREATE_ONLY'>('UPSERT');
  const [importerStockInitial, setImporterStockInitial] = useState(false);
  const [ignorerErreurs, setIgnorerErreurs] = useState(false);
  const [apercu, setApercu] = useState<ApercuImport | null>(null);
  const [filtre, setFiltre] = useState<FiltreApercu>('TOUS');
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setEtape('fichier');
    setPayload(null);
    setMapping({});
    setMode('UPSERT');
    setImporterStockInitial(false);
    setIgnorerErreurs(false);
    setApercu(null);
    setFiltre('TOUS');
    setResultat(null);
    setErreur(null);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const apercuMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ApercuImport>('/produits/import/apercu', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setApercu(data);
      setMapping(data.mapping);
      setErreur(null);
    },
    onError: (e) => setErreur(messageDepuisApi(e, 'Impossible d’analyser le fichier.')),
  });

  const importMut = useMutation({
    mutationFn: () =>
      apiFetch<ResultatImport>('/produits/import', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          mapping,
          mode,
          importerStockInitial,
          ignorerLignesEnErreur: ignorerErreurs,
        }),
      }),
    onSuccess: (data) => {
      setResultat(data);
      void qc.invalidateQueries({ queryKey: ['produits'] });
      void qc.invalidateQueries({ queryKey: ['produits-synthese'] });
      void qc.invalidateQueries({ queryKey: ['produits-categories'] });
      void qc.invalidateQueries({ queryKey: ['produits-classement'] });
    },
    onError: (e) => setErreur(messageDepuisApi(e, 'Échec de l’import.')),
  });

  function demanderApercu(
    nextPayload: NonNullable<typeof payload>,
    nextMapping: Mapping,
    nextMode: 'UPSERT' | 'CREATE_ONLY',
    delay = 0,
  ) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const run = () =>
      apercuMut.mutate({
        ...nextPayload,
        mapping: nextMapping,
        mode: nextMode,
      });
    if (delay <= 0) run();
    else debounceRef.current = setTimeout(run, delay);
  }

  async function chargerFichier(file: File) {
    setErreur(null);
    setResultat(null);
    try {
      const next = await fichierVersPayload(file);
      setPayload(next);
      setEtape('mapping');
      demanderApercu(next, {}, mode);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void chargerFichier(file);
  }

  const lignesFiltrees =
    apercu?.apercu.filter((l) => (filtre === 'TOUS' ? true : l.action === filtre)) ?? [];
  const pretAImporter = (apercu?.aCreer ?? 0) + (apercu?.aMettreAJour ?? 0);
  const importBloque =
    importMut.isPending ||
    pretAImporter === 0 ||
    ((apercu?.enErreur ?? 0) > 0 && !ignorerErreurs);

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importer le catalogue"
      description="CSV ou Excel (.xlsx) — colonnes reconnues même si les en-têtes diffèrent. Le stock d’une fiche existante n’est jamais écrasé."
      size="xl"
    >
      {resultat ? (
        <div className="stack-form">
          <p className="lead">
            Import terminé : <strong>{resultat.crees}</strong> créé(s) ·{' '}
            <strong>{resultat.misAJour}</strong> mis à jour · {resultat.ignores} ignoré(s).
          </p>
          <div className="table-actions">
            <button
              type="button"
              onClick={() => {
                reset();
              }}
            >
              Importer un autre fichier
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Voir le catalogue
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-form import-wizard">
          <ol className="import-steps" aria-label="Étapes">
            {(
              [
                ['fichier', '1. Fichier'],
                ['mapping', '2. Colonnes'],
                ['controle', '3. Contrôle'],
              ] as const
            ).map(([id, label]) => (
              <li key={id} className={etape === id ? 'actif' : ''}>
                {label}
              </li>
            ))}
          </ol>

          {erreur ? <p role="alert">{erreur}</p> : null}

          {etape === 'fichier' ? (
            <>
              <label
                className={dragOver ? 'import-drop import-drop-actif' : 'import-drop'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <Upload size={20} />
                <span>
                  <strong>Déposer un CSV ou Excel</strong>
                  <small> .xlsx, .csv — séparateur , ou ; détecté tout seul</small>
                </span>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void chargerFichier(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="lead">
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    void apiDownload('/produits/import/modele.csv', 'modele-catalogue-produits.csv')
                  }
                >
                  <FileSpreadsheet size={14} /> Télécharger un modèle CSV
                </button>
              </p>
            </>
          ) : null}

          {etape === 'mapping' && payload ? (
            <>
              <p className="lead">
                Fichier <strong>{payload.nomFichier}</strong>
                {apercu ? ` · ${apercu.totalLignes} ligne(s) · source ${apercu.source}` : ''}
              </p>
              {apercuMut.isPending ? <LoadingState label="Analyse des colonnes…" /> : null}
              {apercu ? (
                <>
                  <fieldset className="import-mapping">
                    <legend>Correspondance des colonnes</legend>
                    {CHAMPS.map((c) => (
                      <label key={c.id}>
                        {c.label}
                        {c.hint ? <small> · {c.hint}</small> : null}
                        <select
                          value={mapping[c.id] ?? ''}
                          onChange={(e) => {
                            const next = { ...mapping, [c.id]: e.target.value || null };
                            setMapping(next);
                            demanderApercu(payload, next, mode, 280);
                          }}
                        >
                          <option value="">— ignorer —</option>
                          {apercu.enTetes.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                  {apercu.colonnesIgnorees.length > 0 ? (
                    <p className="lead">
                      Colonnes non importées : {apercu.colonnesIgnorees.join(', ')}
                    </p>
                  ) : null}
                  <div className="table-actions">
                    <button type="button" onClick={() => setEtape('fichier')}>
                      <ChevronLeft size={14} /> Autre fichier
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!mapping.designation && !mapping.reference}
                      onClick={() => {
                        demanderApercu(payload, mapping, mode);
                        setEtape('controle');
                      }}
                    >
                      Contrôler les lignes
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {etape === 'controle' && apercu && payload ? (
            <>
              <div className="import-kpis" role="group" aria-label="Synthèse">
                {(
                  [
                    ['TOUS', `${apercu.totalLignes} lignes`],
                    ['CREATE', `${apercu.aCreer} à créer`],
                    ['UPDATE', `${apercu.aMettreAJour} à maj`],
                    ['ERROR', `${apercu.enErreur} erreur(s)`],
                    ['SKIP', `${apercu.aIgnorer} ignorée(s)`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={filtre === id ? 'import-kpi actif' : 'import-kpi'}
                    onClick={() => setFiltre(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label>
                Si la référence existe déjà
                <select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value as 'UPSERT' | 'CREATE_ONLY';
                    setMode(next);
                    demanderApercu(payload, mapping, next);
                  }}
                >
                  <option value="UPSERT">Mettre à jour la fiche (prix, nom, seuil… pas le stock)</option>
                  <option value="CREATE_ONLY">Ignorer — ne créer que les nouveaux SKU</option>
                </select>
              </label>

              <label className="caisses-check">
                <input
                  type="checkbox"
                  checked={importerStockInitial}
                  onChange={(e) => setImporterStockInitial(e.target.checked)}
                />
                Poser le stock initial des <strong>nouveaux</strong> produits seulement
              </label>

              {apercu.enErreur > 0 ? (
                <label className="caisses-check">
                  <input
                    type="checkbox"
                    checked={ignorerErreurs}
                    onChange={(e) => setIgnorerErreurs(e.target.checked)}
                  />
                  Importer les {pretAImporter} ligne(s) valides et ignorer les {apercu.enErreur}{' '}
                  erreur(s)
                </label>
              ) : null}

              {apercu.avertissementsGlobaux.map((a) => (
                <p key={a} className="form-hint-warning">
                  {a}
                </p>
              ))}

              {apercuMut.isPending ? <LoadingState label="Recalcul…" /> : null}

              <div className="clients-table-wrap import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Action</th>
                      <th>Désignation</th>
                      <th>Réf.</th>
                      <th>Prix</th>
                      <th>Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesFiltrees.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Aucune ligne pour ce filtre.</td>
                      </tr>
                    ) : (
                      lignesFiltrees.map((l) => (
                        <tr key={l.index} className={l.action === 'ERROR' ? 'import-row-err' : undefined}>
                          <td>{l.index}</td>
                          <td>
                            <span
                              className={
                                l.action === 'ERROR'
                                  ? 'badge badge-critical'
                                  : l.action === 'UPDATE'
                                    ? 'badge badge-info'
                                    : l.action === 'SKIP'
                                      ? 'badge badge-neutral'
                                      : 'badge badge-ok'
                              }
                            >
                              {labelAction(l.action)}
                            </span>
                          </td>
                          <td>{l.designation ?? '—'}</td>
                          <td>{l.reference ?? '—'}</td>
                          <td>
                            {l.prixUnitaire != null
                              ? l.prixUnitaire.toLocaleString('fr-FR')
                              : '—'}
                          </td>
                          <td>{[...l.erreurs, ...l.avertissements].join(' ') || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-actions">
                <button type="button" onClick={() => setEtape('mapping')}>
                  <ChevronLeft size={14} /> Colonnes
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={importBloque}
                  onClick={() => importMut.mutate()}
                >
                  <Check size={14} /> Importer {pretAImporter} fiche(s)
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
