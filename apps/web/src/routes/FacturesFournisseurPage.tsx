import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
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

const STATUT: Record<FactureFournisseurDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  COMPTABILISEE: 'Comptabilisée',
  PARTIELLEMENT_PAYEE: 'Partiellement payée',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};

function badge(statut: FactureFournisseurDto['statut']) {
  if (statut === 'PAYEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_PAYEE' || statut === 'COMPTABILISEE') {
    return 'badge badge-warning';
  }
  if (statut === 'ANNULEE') return 'badge badge-neutral';
  return 'badge';
}

function fmt(n: string | number) {
  return Math.round(Number(n)).toLocaleString('fr-FR');
}

export function FacturesFournisseurPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutFacturer = user !== null && ROLES_FACTURE.includes(user.role);

  const [filtreStatut, setFiltreStatut] = useState<FactureFournisseurDto['statut'] | ''>(
    '',
  );
  const [modalNouveau, setModalNouveau] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [reference, setReference] = useState('');
  const [echeance, setEcheance] = useState('');
  const [selectionReceptions, setSelectionReceptions] = useState<string[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const factures = useQuery({
    queryKey: ['achats-factures'],
    queryFn: () => apiFetch<FactureFournisseurDto[]>('/achats/factures'),
    enabled: peutLire,
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

  const liste = useMemo(
    () =>
      (factures.data ?? []).filter((f) =>
        filtreStatut ? f.statut === filtreStatut : true,
      ),
    [factures.data, filtreStatut],
  );

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
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
      void queryClient.invalidateQueries({ queryKey: ['achats-a-facturer'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
      navigate(`/achats/factures/${f.id}`);
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Facture refusée.')),
  });

  if (!peutLire) return <p>Vous n’avez pas accès aux factures fournisseur.</p>;

  const receptionsFourn = fournisseurId
    ? parFournisseur.get(fournisseurId) ?? []
    : aFacturer.data ?? [];

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
        <>
          <div className="toolbar">
            <div>
              <label htmlFor="filtre-fa-statut">Statut</label>
              <select
                id="filtre-fa-statut"
                value={filtreStatut}
                onChange={(e) =>
                  setFiltreStatut(e.target.value as FactureFournisseurDto['statut'] | '')
                }
              >
                <option value="">Tous</option>
                {(Object.keys(STATUT) as FactureFournisseurDto['statut'][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUT[s]}
                  </option>
                ))}
              </select>
            </div>
            <p className="lead">
              {liste.length} facture(s)
              {filtreStatut ? ` · ${STATUT[filtreStatut]}` : ''}
            </p>
          </div>
          <ListPanel title="Factures">
            {factures.data.length === 0 ? (
              <EmptyState
                title="Aucune facture"
                description="Facturez des réceptions de stock déjà enregistrées."
              />
            ) : liste.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description="Aucune facture ne correspond à ce statut."
              />
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Fournisseur</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Échéance</th>
                      <th>Montant</th>
                      <th>Reste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((row) => (
                      <tr
                        key={row.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Ouvrir ${row.numero}`}
                        onClick={() => navigate(`/achats/factures/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/factures/${row.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{row.numero}</strong>
                          {row.referenceFournisseur ? (
                            <div className="kpi-hint" style={{ margin: 0 }}>
                              n° {row.referenceFournisseur}
                            </div>
                          ) : null}
                        </td>
                        <td>{row.fournisseur.nom}</td>
                        <td>
                          <span className={badge(row.statut)}>{STATUT[row.statut]}</span>
                        </td>
                        <td>{new Date(row.dateFacture).toLocaleDateString('fr-FR')}</td>
                        <td>
                          {row.dateEcheance
                            ? new Date(row.dateEcheance).toLocaleDateString('fr-FR')
                            : '—'}
                        </td>
                        <td className="money">{fmt(row.montant)} FCFA</td>
                        <td className="money">{fmt(row.resteAPayer)} FCFA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}

      {peutFacturer && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouvelle facture"
          size="lg"
        >
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
              <input
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
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
                              e.target.checked
                                ? [...prev, r.id]
                                : prev.filter((id) => id !== r.id),
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
    </div>
  );
}
