import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Landmark, Monitor, Printer, Store } from 'lucide-react';
import { RoleLibelle, StatutSessionCaisse, StatutTransaction, TypeCaisse } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightSoldeCaisse, insightTypeCaisse } from '../lib/insights/caisses';
import type { CaisseDto, MouvementCaisseDto, SessionCaisseDto, TransactionDto } from '../lib/types';

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

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function labelCaisse(c: CaisseDto): string {
  if (c.type === TypeCaisse.TIROIR) return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  if (c.type === TypeCaisse.MAGASIN) return c.libelle ?? 'Caisse magasin';
  return c.libelle ?? 'Caisse centrale';
}

function typeLabel(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'Centrale';
  if (type === TypeCaisse.MAGASIN) return 'Magasin';
  if (type === TypeCaisse.TIROIR) return 'Tiroir';
  return String(type);
}

function typeBadgeClass(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'badge badge-info';
  if (type === TypeCaisse.MAGASIN) return 'badge badge-ok';
  return 'badge badge-neutral';
}

function TypeIcon({ type }: { type: string }) {
  if (type === TypeCaisse.CENTRALE) return <Landmark size={28} />;
  if (type === TypeCaisse.MAGASIN) return <Store size={28} />;
  return <Monitor size={28} />;
}

export function CaisseDetailPage() {
  const { caisseId } = useParams<{ caisseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const [ligneId, setLigneId] = useState<string | null>(null);

  const caisseQ = useQuery({
    queryKey: ['caisses', caisseId],
    queryFn: () => apiFetch<CaisseDto>(`/caisses/${caisseId}`),
    enabled: peutLire && Boolean(caisseId),
  });
  const soldeQ = useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () => apiFetch<{ caisseId: string; solde: string }>(`/caisses/${caisseId}/solde`),
    enabled: peutLire && Boolean(caisseId),
  });
  const mvtsQ = useQuery({
    queryKey: ['caisses', caisseId, 'mouvements'],
    queryFn: () => apiFetch<MouvementCaisseDto[]>(`/caisses/${caisseId}/mouvements`),
    enabled: peutLire && Boolean(caisseId),
  });
  const txQ = useQuery({
    queryKey: ['transactions', { caisseId }],
    queryFn: () => apiFetch<TransactionDto[]>(`/transactions?caisseId=${caisseId}`),
    enabled: peutLire && Boolean(caisseId),
  });
  const sessionsQ = useQuery({
    queryKey: ['ventes', 'sessions'],
    queryFn: () => apiFetch<SessionCaisseDto[]>('/ventes/sessions'),
    enabled: peutLire && Boolean(caisseId),
  });

  if (!caisseId) return <p role="alert">Caisse introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux caisses.</p>;
  if (caisseQ.isLoading) return <LoadingState label="Chargement de la caisse..." />;
  if (caisseQ.isError || !caisseQ.data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/caisses')}>
          ← Caisses
        </button>
        <p role="alert">Impossible de charger cette caisse (introuvable ou hors périmètre).</p>
      </div>
    );
  }

  const c = caisseQ.data;
  const sessions = (sessionsQ.data ?? []).filter((s) => s.caisseId === caisseId);
  const pipeline = (txQ.data ?? []).filter((t) => t.statut !== StatutTransaction.VALIDEE);
  const ligne = (mvtsQ.data ?? []).find((m) => m.id === ligneId) ?? null;

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/caisses')}>
          ← Caisses
        </button>
        <div className="client-workspace-toolbar-actions">
          {c.type === TypeCaisse.MAGASIN ? (
            <Link className="btn-primary" to={`/transactions?caisseId=${c.id}`}>
              Versements
            </Link>
          ) : null}
          {c.type === TypeCaisse.TIROIR ? (
            <Link className="btn-primary" to="/pos">
              Ouvrir le POS
            </Link>
          ) : null}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          <TypeIcon type={c.type} />
        </div>
        <div className="client-workspace-hero-main">
          <h1>{labelCaisse(c)}</h1>
          <p className="client-workspace-hero-sub">
            Solde recalculé depuis le grand livre — jamais stocké.
          </p>
          <div className="client-workspace-chips">
            <span className={typeBadgeClass(c.type)}>{typeLabel(c.type)}</span>
            <InfoTooltip insight={insightTypeCaisse(c.type)} />
            {c.actif === false ? <span className="badge badge-warning">Inactif</span> : null}
          </div>
        </div>
      </header>

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Solde <InfoTooltip insight={insightSoldeCaisse(c.type)} />
          </div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {soldeQ.isLoading ? '…' : formatFcfa(soldeQ.data?.solde)}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Écritures validées</div>
          <div className="client-kpi-value">{mvtsQ.data?.length ?? '…'}</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">En cours §6.4</div>
          <div className="client-kpi-value">{pipeline.length}</div>
          <div className="client-kpi-hint">hors VALIDÉE — lecture, pas de validation ici</div>
        </article>
      </div>

      <section className="client-workspace-section">
        <h2>Sessions POS</h2>
        {sessionsQ.isLoading ? (
          <LoadingState label="Chargement des sessions..." />
        ) : sessions.length === 0 ? (
          <p className="lead">Aucune session sur cette caisse.</p>
        ) : (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ouverture</th>
                  <th>Statut</th>
                  <th>Fond initial</th>
                  <th>Clôture</th>
                  <th>Impression</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.ouvertureDateHeure).toLocaleString('fr-FR')}</td>
                    <td>
                      <span
                        className={
                          s.statut === StatutSessionCaisse.OUVERTE
                            ? 'badge badge-ok'
                            : 'badge badge-neutral'
                        }
                      >
                        {s.statut}
                      </span>
                    </td>
                    <td className="money">{formatFcfa(s.fondInitial)}</td>
                    <td>
                      {s.clotureDateHeure
                        ? new Date(s.clotureDateHeure).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() =>
                          void apiDownload(
                            `/ventes/sessions/${s.id}/cloture/pdf`,
                            `${s.statut === StatutSessionCaisse.FERMEE ? 'etat-z' : 'etat-x'}-${s.id}.pdf`,
                          )
                        }
                      >
                        <Printer size={14} />
                        {s.statut === StatutSessionCaisse.FERMEE ? 'État Z' : 'État X'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="client-workspace-section">
        <h2>
          <BookOpen size={16} /> Grand livre
        </h2>
        <p className="lead">Écritures VALIDÉES uniquement — append-only.</p>
        {mvtsQ.isLoading ? (
          <LoadingState label="Chargement du grand livre..." />
        ) : mvtsQ.isError ? (
          <p role="alert">Impossible de charger les mouvements.</p>
        ) : (mvtsQ.data ?? []).length === 0 ? (
          <p className="lead">Aucune écriture validée pour l’instant.</p>
        ) : (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Écriture</th>
                  <th>Crédit</th>
                  <th>Débit</th>
                  <th>Solde après</th>
                </tr>
              </thead>
              <tbody>
                {[...(mvtsQ.data ?? [])].reverse().map((m) => (
                  <tr
                    key={m.id}
                    className={ligneId === m.id ? 'produit-row produit-row-selected' : 'produit-row'}
                    onClick={() => setLigneId((id) => (id === m.id ? null : m.id))}
                  >
                    <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
                    <td>{m.libelle}</td>
                    <td className="money">{Number(m.credit) ? formatFcfa(m.credit) : ''}</td>
                    <td className="money">{Number(m.debit) ? formatFcfa(m.debit) : ''}</td>
                    <td className="money">{formatFcfa(m.soldeApres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ligne ? (
          <dl className="clients-dl">
            <div>
              <dt>Type</dt>
              <dd>{ligne.type}</dd>
            </div>
            <div>
              <dt>Initiateur</dt>
              <dd>
                {ligne.initiateur.prenom} {ligne.initiateur.nom} ({ligne.initiateur.login})
              </dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>
                <Link to={`/transactions/${ligne.id}`}>{ligne.id}</Link>
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      {pipeline.length > 0 ? (
        <section className="client-workspace-section">
          <h2>Circuit en cours</h2>
          <p className="lead">Les actions §6.4 (réceptionner / rapprocher) sont sur la fiche transaction.</p>
          <ul>
            {pipeline.map((t) => (
              <li key={t.id}>
                <Link to={`/transactions/${t.id}`}>
                  {t.statut} · {t.montant} FCFA · {new Date(t.dateHeure).toLocaleString('fr-FR')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
