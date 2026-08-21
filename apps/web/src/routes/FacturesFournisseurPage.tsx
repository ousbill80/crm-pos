import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModePaiementFournisseur, RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { FactureFournisseurDto, FournisseurDto, ReceptionAFacturerDto } from '../lib/types';

const ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const ROLES_FACTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

const ROLES_PAIEMENT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

const STATUT: Record<FactureFournisseurDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  COMPTABILISEE: 'Comptabilisée',
  PARTIELLEMENT_PAYEE: 'Partiellement payée',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};

function badge(statut: FactureFournisseurDto['statut']) {
  if (statut === 'PAYEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_PAYEE' || statut === 'COMPTABILISEE') return 'badge badge-warning';
  if (statut === 'ANNULEE') return 'badge';
  return 'badge';
}

function fmt(n: string | number) {
  return Math.round(Number(n)).toLocaleString('fr-FR');
}

export function FacturesFournisseurPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutFacturer = user !== null && ROLES_FACTURE.includes(user.role);
  const peutPayer = user !== null && ROLES_PAIEMENT.includes(user.role);

  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [modalPaiement, setModalPaiement] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [reference, setReference] = useState('');
  const [echeance, setEcheance] = useState('');
  const [selectionReceptions, setSelectionReceptions] = useState<string[]>([]);
  const [montantPaye, setMontantPaye] = useState('');
  const [mode, setMode] = useState<ModePaiementFournisseur>('VIREMENT');
  const [refPaiement, setRefPaiement] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const factures = useQuery({
    queryKey: ['achats-factures'],
    queryFn: () => apiFetch<FactureFournisseurDto[]>('/achats/factures'),
    enabled: peutLire,
  });
  const detail = useQuery({
    queryKey: ['achats-factures', selectionId],
    queryFn: () => apiFetch<FactureFournisseurDto>(`/achats/factures/${selectionId}`),
    enabled: peutLire && selectionId !== null,
  });
  const aFacturer = useQuery({
    queryKey: ['achats-a-facturer', fournisseurId],
    queryFn: () =>
      apiFetch<ReceptionAFacturerDto[]>(
        `/achats/factures/a-facturer${fournisseurId ? `?fournisseurId=${fournisseurId}` : ''}`,
      ),
    enabled: peutFacturer && modalNouveau,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled: peutFacturer,
  });

  const parFournisseur = useMemo(() => {
    const map = new Map<string, ReceptionAFacturerDto[]>();
    for (const r of aFacturer.data ?? []) {
      const liste = map.get(r.fournisseurId) ?? [];
      liste.push(r);
      map.set(r.fournisseurId, liste);
    }
    return map;
  }, [aFacturer.data]);

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
    void queryClient.invalidateQueries({ queryKey: ['achats-a-facturer'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
  }

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>('/achats/factures', {
        method: 'POST',
        body: JSON.stringify({
          fournisseurId,
          referenceFournisseur: reference.trim() || undefined,
          dateEcheance: echeance || undefined,
          receptionIds: selectionReceptions,
        }),
      }),
    onSuccess: (f) => {
      setModalNouveau(false);
      setSelectionId(f.id);
      setFormErr(null);
      invalider();
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Facture refusée.')),
  });

  const comptabiliser = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${selectionId}/comptabiliser`, {
        method: 'POST',
      }),
    onSuccess: invalider,
  });
  const annuler = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${selectionId}/annuler`, {
        method: 'POST',
      }),
    onSuccess: invalider,
  });
  const payer = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${selectionId}/paiements`, {
        method: 'POST',
        body: JSON.stringify({
          montant: Number(montantPaye),
          mode,
          reference: refPaiement.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setModalPaiement(false);
      setFormErr(null);
      invalider();
      if (selectionId) {
        void queryClient.invalidateQueries({ queryKey: ['achats-factures', selectionId] });
      }
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Paiement refusé.')),
  });

  if (!peutLire) return <p>Vous n’avez pas accès aux factures fournisseur.</p>;

  const f = detail.data;
  const receptionsFourn = fournisseurId ? parFournisseur.get(fournisseurId) ?? [] : aFacturer.data ?? [];

  return (
    <div>
      <PageHeader
        title="Factures fournisseur"
        subtitle="Une réception ne se facture qu’une fois. Le paiement est un grand livre Achats (DAF / Caissier Central) — il ne débite pas une caisse boutique."
        actions={
          peutFacturer ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFournisseurId(fournisseurs.data?.[0]?.id ?? '');
                setSelectionReceptions([]);
                setReference('');
                setEcheance('');
                setFormErr(null);
                setModalNouveau(true);
              }}
            >
              Nouvelle facture
            </button>
          ) : undefined
        }
      />

      {factures.isLoading && <LoadingState label="Chargement des factures..." />}
      {factures.isError && <p role="alert">Erreur de chargement des factures.</p>}

      {factures.data && (
        <div
          className="dash-layout"
          style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}
        >
          <ListPanel title="Factures">
            {factures.data.length === 0 ? (
              <EmptyState
                title="Aucune facture"
                description="Facturez des réceptions de stock déjà enregistrées."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fournisseur</th>
                    <th>Statut</th>
                    <th>Montant</th>
                    <th>Reste</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.data.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectionId(row.id)}
                      style={{
                        cursor: 'pointer',
                        background:
                          row.id === selectionId ? 'var(--surface-muted, #f4f4f5)' : undefined,
                      }}
                    >
                      <td>{row.numero}</td>
                      <td>{row.fournisseur.nom}</td>
                      <td>
                        <span className={badge(row.statut)}>{STATUT[row.statut]}</span>
                      </td>
                      <td className="money">{fmt(row.montant)} FCFA</td>
                      <td className="money">{fmt(row.resteAPayer)} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ListPanel>

          <ListPanel title={f ? f.numero : 'Détail'}>
            {!selectionId && <EmptyState title="Sélectionnez une facture" />}
            {selectionId && detail.isLoading && <LoadingState label="Chargement..." />}
            {f && (
              <>
                <p className="lead">
                  {f.fournisseur.nom}
                  {f.referenceFournisseur ? ` · n° fournisseur ${f.referenceFournisseur}` : ''}
                </p>
                <p className="lead">
                  {fmt(f.montant)} FCFA · payé {fmt(f.montantPaye)} · reste {fmt(f.resteAPayer)}
                </p>
                <div className="table-actions">
                  {peutFacturer && f.statut === 'BROUILLON' && (
                    <>
                      <button type="button" className="btn-primary" onClick={() => comptabiliser.mutate()}>
                        Comptabiliser
                      </button>
                      <button type="button" onClick={() => annuler.mutate()}>
                        Annuler le brouillon
                      </button>
                    </>
                  )}
                  {peutPayer &&
                    (f.statut === 'COMPTABILISEE' || f.statut === 'PARTIELLEMENT_PAYEE') && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setMontantPaye(f.resteAPayer);
                          setMode('VIREMENT');
                          setRefPaiement('');
                          setFormErr(null);
                          setModalPaiement(true);
                        }}
                      >
                        Enregistrer un paiement
                      </button>
                    )}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th>Qté</th>
                      <th>Prix</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.lignes.map((l) => (
                      <tr key={l.id}>
                        <td>{l.produit.designation}</td>
                        <td>{l.quantite}</td>
                        <td className="money">{fmt(l.prixUnitaire)}</td>
                        <td className="money">{fmt(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {f.paiements.length > 0 && (
                  <>
                    <h3>Règlements</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Mode</th>
                          <th>Montant</th>
                          <th>Réf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.paiements.map((p) => (
                          <tr key={p.id}>
                            <td>{new Date(p.datePaiement).toLocaleString('fr-FR')}</td>
                            <td>{p.mode}</td>
                            <td className="money">{fmt(p.montant)} FCFA</td>
                            <td>{p.reference ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </ListPanel>
        </div>
      )}

      {peutFacturer && (
        <Modal open={modalNouveau} onClose={() => setModalNouveau(false)} title="Nouvelle facture">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              creer.mutate();
            }}
          >
            <div>
              <label htmlFor="ff-fourn">Fournisseur</label>
              <select
                id="ff-fourn"
                value={fournisseurId}
                onChange={(e) => {
                  setFournisseurId(e.target.value);
                  setSelectionReceptions([]);
                }}
              >
                {(fournisseurs.data ?? []).map((fourn) => (
                  <option key={fourn.id} value={fourn.id}>
                    {fourn.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>N° facture fournisseur</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <label>Échéance (optionnel)</label>
              <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
            </div>
            <p className="lead">Réceptions non encore facturées</p>
            {receptionsFourn.length === 0 ? (
              <p>Aucune réception à facturer pour ce fournisseur.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th>Article</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {receptionsFourn.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectionReceptions.includes(r.id)}
                          onChange={(e) => {
                            setSelectionReceptions((prev) =>
                              e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                            );
                          }}
                        />
                      </td>
                      <td>{new Date(r.dateReception).toLocaleDateString('fr-FR')}</td>
                      <td>
                        {r.produit.designation} × {r.quantite}
                      </td>
                      <td className="money">{fmt(r.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={creer.isPending || selectionReceptions.length === 0}
            >
              Créer le brouillon
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}

      {f && (
        <Modal open={modalPaiement} onClose={() => setModalPaiement(false)} title="Paiement fournisseur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              payer.mutate();
            }}
          >
            <p className="lead">Reste à payer : {fmt(f.resteAPayer)} FCFA</p>
            <div>
              <label>Montant</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={montantPaye}
                onChange={(e) => setMontantPaye(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ModePaiementFournisseur)}
              >
                <option value="VIREMENT">Virement</option>
                <option value="ESPECES">Espèces</option>
                <option value="MOBILE_MONEY">Mobile money</option>
              </select>
            </div>
            <div>
              <label>Référence</label>
              <input value={refPaiement} onChange={(e) => setRefPaiement(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={payer.isPending}>
              Enregistrer
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}
