import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { fmtDateHeure } from '../lib/achats-ui';
import { insightBonStatut } from '../lib/insights/stocks';
import type { BonStockDto } from '../lib/types';

const ETAPES_STEPPER: Array<{ key: 'BROUILLON' | 'PRET' | 'FAIT'; label: string }> = [
  { key: 'BROUILLON', label: 'Brouillon' },
  { key: 'PRET', label: 'Prêt' },
  { key: 'FAIT', label: 'Fait' },
];

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

const ROLES_PILOTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_FAIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const TYPE_LABEL: Record<BonStockDto['type'], string> = {
  RECEPTION: 'Réception',
  LIVRAISON: 'Livraison',
  TRANSFERT_INTERNE: 'Transfert interne',
  REBUT: 'Rebut',
};

const STATUT_LABEL: Record<BonStockDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  PRET: 'Prêt',
  FAIT: 'Fait',
  ANNULE: 'Annulé',
};

const STATUT_BADGE: Record<BonStockDto['statut'], string> = {
  BROUILLON: 'badge',
  PRET: 'badge badge-warning',
  FAIT: 'badge badge-ok',
  ANNULE: 'badge badge-neutral',
};

function messageErreur(err: unknown): string {
  if (!(err instanceof Error)) return 'Une erreur est survenue.';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
  } catch {
    /* raw */
  }
  return err.message;
}

export function BonStockDetailPage() {
  const { bonId } = useParams<{ bonId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutPiloter = user !== null && ROLES_PILOTE.includes(user.role);
  const peutValider = user !== null && ROLES_FAIT.includes(user.role);

  const detail = useQuery({
    queryKey: ['stocks', 'bons', bonId],
    queryFn: () => apiFetch<BonStockDto>(`/stocks/bons/${bonId}`),
    enabled: peutLire && Boolean(bonId),
  });

  const actionBon = useMutation({
    mutationFn: (action: 'pret' | 'valider' | 'annuler') =>
      apiFetch<BonStockDto>(`/stocks/bons/${bonId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocks'] });
    },
  });

  if (!bonId) return <p role="alert">Bon introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux opérations de stock.</p>;
  if (detail.isLoading) return <LoadingState label="Chargement du bon..." />;
  if (detail.isError || !detail.data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks/operations')}>
          ← Opérations
        </button>
        <p role="alert">Impossible de charger ce bon (introuvable ou hors périmètre).</p>
      </div>
    );
  }

  const b = detail.data;

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks/operations')}>
          ← Opérations
        </button>
        <div className="client-workspace-toolbar-actions">
          {peutPiloter && b.statut === 'BROUILLON' ? (
            <button type="button" onClick={() => actionBon.mutate('pret')} disabled={actionBon.isPending}>
              Mettre en prêt
            </button>
          ) : null}
          {peutValider && b.statut === 'PRET' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (
                  window.confirm(
                    `Valider le bon ${b.numero} ? Cette action pose les écritures de stock et n'est plus modifiable.`,
                  )
                ) {
                  actionBon.mutate('valider');
                }
              }}
              disabled={actionBon.isPending}
            >
              Valider (Fait)
            </button>
          ) : null}
          {peutValider && (b.statut === 'BROUILLON' || b.statut === 'PRET') ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Annuler le bon ${b.numero} ? Cette action est définitive.`)) {
                  actionBon.mutate('annuler');
                }
              }}
              disabled={actionBon.isPending}
            >
              Annuler
            </button>
          ) : null}
        </div>
      </div>

      {actionBon.isError ? <p role="alert">{messageErreur(actionBon.error)}</p> : null}

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          <ClipboardList size={28} />
        </div>
        <div className="client-workspace-hero-main">
          <h1>{b.numero}</h1>
          <p className="client-workspace-hero-sub">{TYPE_LABEL[b.type]}</p>
          <div className="client-workspace-chips">
            <span className={STATUT_BADGE[b.statut]}>{STATUT_LABEL[b.statut]}</span>
            <InfoTooltip insight={insightBonStatut(b.statut, b.type)} />
          </div>
          <div className="bon-stepper" aria-label="Avancement du bon">
            {ETAPES_STEPPER.map((etape, i) => {
              const pointAnnulation = b.datePret ? 1 : 0;
              const activeIndex =
                b.statut === 'ANNULE'
                  ? pointAnnulation
                  : b.statut === 'FAIT'
                    ? 2
                    : ETAPES_STEPPER.findIndex((e) => e.key === b.statut);
              const cls =
                b.statut === 'FAIT'
                  ? 'done'
                  : b.statut === 'ANNULE'
                    ? i < activeIndex
                      ? 'done'
                      : i === activeIndex
                        ? 'annule'
                        : ''
                    : i < activeIndex
                      ? 'done'
                      : i === activeIndex
                        ? 'actif'
                        : '';
              const contenu = cls === 'done' ? '✓' : cls === 'annule' ? '✕' : String(i + 1);
              return (
                <Fragment key={etape.key}>
                  {i > 0 ? (
                    <span className={i <= activeIndex ? 'bon-stepper-line done' : 'bon-stepper-line'} />
                  ) : null}
                  <div className={cls ? `bon-stepper-step ${cls}` : 'bon-stepper-step'}>
                    <span className="bon-stepper-dot">{contenu}</span>
                    <span>{etape.label}</span>
                  </div>
                </Fragment>
              );
            })}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Créé</strong> {fmtDateHeure(b.dateCreation)}
            </span>
            {b.initiateur ? (
              <span>
                <strong>Par</strong> {b.initiateur.prenom} {b.initiateur.nom}
              </span>
            ) : null}
            {b.datePret ? (
              <span>
                <strong>Prêt</strong> {fmtDateHeure(b.datePret)}
              </span>
            ) : null}
            {b.dateFait ? (
              <span>
                <strong>Fait</strong> {fmtDateHeure(b.dateFait)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="lead">
        Le stock vendable ne bouge qu’au statut Fait. Ce n’est pas une validation de caisse
        (§6.4).
      </p>

      <dl className="clients-dl">
        <div>
          <dt>Source</dt>
          <dd>
            {b.entrepotSource ? (
              <Link to={`/stocks/entrepots/${b.entrepotSource.id}`}>
                {b.entrepotSource.nom} ({b.entrepotSource.code})
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>
            {b.entrepotDest ? (
              <Link to={`/stocks/entrepots/${b.entrepotDest.id}`}>
                {b.entrepotDest.nom} ({b.entrepotDest.code})
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        {b.notes ? (
          <div>
            <dt>Notes</dt>
            <dd>{b.notes}</dd>
          </div>
        ) : null}
      </dl>

      <section className="client-workspace-section">
        <h2>Lignes</h2>
        <div className="clients-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Qté</th>
                <th>Ok</th>
                <th>Rebut</th>
                <th>Lot</th>
              </tr>
            </thead>
            <tbody>
              {b.lignes.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link className="link-button" to={`/produits/${l.produitId}`}>
                      {l.designation}
                    </Link>
                    {l.reference ? (
                      <div className="produit-ref">{l.reference}</div>
                    ) : null}
                  </td>
                  <td>{l.quantite}</td>
                  <td>{l.quantiteOk ?? '—'}</td>
                  <td>{l.quantiteRebut ?? '—'}</td>
                  <td>{l.numeroLot ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
