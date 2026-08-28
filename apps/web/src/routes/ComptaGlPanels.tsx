import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { fmtDate, fmtFcfa } from '../lib/achats-ui';
import {
  CLASSES_SYSCOHADA,
  classeSyscohada,
  moneyClass,
} from '../lib/compta-reports';
import {
  insightFactureCharge,
  insightFileEcritures,
  insightNaturesDepense,
  insightPlanComptes,
  insightSaisieOd,
  insightBilan,
  insightCompteResultat,
  insightTva,
  insightLettrage,
  insightStorno,
} from '../lib/insights/compta';
import {
  hasP2pRole,
  operationId,
  p2pApi,
  SOURCE_COMPTABLE_LABELS,
  type CompteComptable,
  type FileEcriture,
  type StatementPack,
  type VatReturn,
} from '../lib/p2p';
import type { FournisseurDto, SocieteDto } from '../lib/types';
import { EmptyState } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { BookOpen, Scale } from 'lucide-react';

function ComptaWhy({ children }: { children: ReactNode }) {
  return <p className="compta-why">{children}</p>;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

type OdLigneDraft = {
  key: string;
  compteId: string;
  debit: string;
  credit: string;
};

function nouvelleLigneOd(): OdLigneDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `l-${Date.now()}-${Math.random()}`,
    compteId: '',
    debit: '',
    credit: '',
  };
}

function montantLigne(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ComptaPlanPanel({
  societeId,
  role,
}: {
  societeId: string;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const [numero, setNumero] = useState('');
  const [intitule, setIntitule] = useState('');
  const [natureCode, setNatureCode] = useState('');
  const [natureLibelle, setNatureLibelle] = useState('');
  const [natureCompteId, setNatureCompteId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [classeFiltre, setClasseFiltre] = useState<string>('ALL');
  const [statutFiltre, setStatutFiltre] = useState<'ALL' | 'ACTIF' | 'INACTIF'>('ALL');
  const [natureQ, setNatureQ] = useState('');
  const accounts = useQuery({
    queryKey: ['p2p-accounts', societeId],
    queryFn: () => p2pApi.accounts(societeId),
  });
  const natures = useQuery({
    queryKey: ['p2p-natures', societeId],
    queryFn: () => p2pApi.naturesDepense(societeId),
  });
  const create = useMutation({
    mutationFn: () => p2pApi.createAccount({ societeId, numero, intitule }),
    onSuccess: () => {
      setNumero('');
      setIntitule('');
      setError(null);
      void client.invalidateQueries({ queryKey: ['p2p-accounts'] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Création du compte refusée.')),
  });
  const createNature = useMutation({
    mutationFn: () =>
      p2pApi.createNatureDepense({
        societeId,
        code: natureCode,
        libelle: natureLibelle,
        compteId: natureCompteId,
      }),
    onSuccess: () => {
      setNatureCode('');
      setNatureLibelle('');
      setNatureCompteId('');
      setError(null);
      void client.invalidateQueries({ queryKey: ['p2p-natures'] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Création de la nature refusée.')),
  });

  const items = accounts.data ?? [];
  const counts = useMemo(() => {
    const byClasse: Record<string, number> = {};
    let actifs = 0;
    let inactifs = 0;
    for (const row of items) {
      const c = classeSyscohada(row.numero);
      byClasse[c] = (byClasse[c] ?? 0) + 1;
      if (row.actif) actifs += 1;
      else inactifs += 1;
    }
    return { total: items.length, actifs, inactifs, byClasse };
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((row) => {
        if (classeFiltre !== 'ALL' && classeSyscohada(row.numero) !== classeFiltre) return false;
        if (statutFiltre === 'ACTIF' && !row.actif) return false;
        if (statutFiltre === 'INACTIF' && row.actif) return false;
        if (!needle) return true;
        return (
          row.numero.toLowerCase().includes(needle) ||
          row.intitule.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.numero.localeCompare(b.numero, 'fr'));
  }, [items, q, classeFiltre, statutFiltre]);

  const groups = useMemo(() => {
    const map = new Map<string, CompteComptable[]>();
    for (const row of filtered) {
      const c = classeSyscohada(row.numero);
      const list = map.get(c) ?? [];
      list.push(row);
      map.set(c, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([classe, rows]) => ({
        classe,
        libelle: CLASSES_SYSCOHADA[classe] ?? 'Autres',
        rows,
      }));
  }, [filtered]);

  const naturesFiltrees = useMemo(() => {
    const needle = natureQ.trim().toLowerCase();
    const rows = natures.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.libelle.toLowerCase().includes(needle) ||
        row.compte.numero.includes(needle),
    );
  }, [natures.data, natureQ]);

  const classesPresentes = useMemo(
    () =>
      Object.keys(CLASSES_SYSCOHADA).filter((c) => (counts.byClasse[c] ?? 0) > 0),
    [counts.byClasse],
  );

  return (
    <>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Plan de comptes <InfoTooltip insight={insightPlanComptes(counts.total)} />
            </h2>
            <p className="lead">
              Plan SYSCOHADA opérationnel (classes 1–7). Marchandises : 31 / 408
              FNP / 603 CMV. Le RAF ajoute les comptes manquants (1 à 8 chiffres).
              Un numéro déjà mouvementé ne change plus.
            </p>
          </div>
        </div>
        <section className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <BookOpen size={16} />
            <div className="kpi-label">
              Comptes <InfoTooltip insight={insightPlanComptes(counts.total)} />
            </div>
            <div className="kpi-value">{counts.total}</div>
            <div className="kpi-hint">
              {counts.actifs} actif(s) · {counts.inactifs} inactif(s)
            </div>
          </article>
          {classesPresentes.map((c) => (
            <article
              key={c}
              className={`kpi-card dash-kpi${classeFiltre === c ? ' actif' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setClasseFiltre((prev) => (prev === c ? 'ALL' : c))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setClasseFiltre((prev) => (prev === c ? 'ALL' : c));
                }
              }}
            >
              <div className="kpi-label">Classe {c}</div>
              <div className="kpi-value">{counts.byClasse[c] ?? 0}</div>
              <div className="kpi-hint">{CLASSES_SYSCOHADA[c]}</div>
            </article>
          ))}
        </section>
        <div className="p2p-inline-fields no-print">
          <label className="compta-paiements-search">
            Rechercher
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="N° ou intitulé…"
              aria-label="Rechercher un compte"
            />
          </label>
          <nav className="compta-journal-chips" aria-label="Filtrer par statut">
            {(
              [
                ['ALL', 'Tous'],
                ['ACTIF', 'Actifs'],
                ['INACTIF', 'Inactifs'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={statutFiltre === value ? 'actif' : undefined}
                onClick={() => setStatutFiltre(value)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        {accounts.isLoading && <LoadingState label="Chargement du plan…" />}
        {accounts.isError && <p role="alert">Impossible de charger les comptes.</p>}
        {accounts.data && filtered.length === 0 && (
          <EmptyState title="Aucun compte" description="Ajustez la recherche ou le filtre de classe." />
        )}
        {accounts.data && filtered.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Intitulé</th>
                  <th>Rattaché à</th>
                  <th>Classe</th>
                  <th>Statut</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.classe}>
                  <tr className="compta-account-head">
                    <th colSpan={5}>
                      Classe {group.classe} · {group.libelle} ({group.rows.length})
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{row.numero}</td>
                      <td>{row.intitule}</td>
                      <td className="mono">{row.parent?.numero ?? '—'}</td>
                      <td>{group.classe}</td>
                      <td>
                        <span className={row.actif ? 'badge badge-ok' : 'badge'}>
                          {row.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        {canWrite && (
          <form
            className="p2p-inline-fields"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <label>
              Numéro
              <input value={numero} onChange={(e) => setNumero(e.target.value)} required maxLength={8} placeholder="613" />
            </label>
            <label>
              Intitulé
              <input value={intitule} onChange={(e) => setIntitule(e.target.value)} required maxLength={160} placeholder="Locations" />
            </label>
            <button className="btn-primary" type="submit" disabled={create.isPending}>
              Ajouter
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </section>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Natures de dépense (6xx) <InfoTooltip insight={insightNaturesDepense()} />
            </h2>
            <p className="lead">Imputation des factures de charges (loyers, transport, honoraires).</p>
          </div>
          <label className="compta-paiements-search">
            Rechercher
            <input
              value={natureQ}
              onChange={(e) => setNatureQ(e.target.value)}
              placeholder="Code, libellé, compte…"
              aria-label="Rechercher une nature"
            />
          </label>
        </div>
        {natures.isLoading && <LoadingState label="Chargement des natures…" />}
        {natures.data?.length === 0 && <EmptyState title="Aucune nature" description="Seed ou création RAF requise." />}
        {natures.data && natures.data.length > 0 && naturesFiltrees.length === 0 && (
          <EmptyState title="Aucune nature" description="Aucun résultat pour cette recherche." />
        )}
        {naturesFiltrees.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Libellé</th>
                  <th>Compte</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {naturesFiltrees.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.code}</td>
                    <td>{row.libelle}</td>
                    <td>
                      {row.compte.numero} · {row.compte.intitule}
                    </td>
                    <td>
                      <span className={row.actif ? 'badge badge-ok' : 'badge'}>
                        {row.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && (
          <form
            className="p2p-inline-fields"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createNature.mutate();
            }}
          >
            <label>
              Code
              <input value={natureCode} onChange={(e) => setNatureCode(e.target.value)} required maxLength={20} placeholder="LOYER" />
            </label>
            <label>
              Libellé
              <input value={natureLibelle} onChange={(e) => setNatureLibelle(e.target.value)} required maxLength={120} placeholder="Loyers" />
            </label>
            <label>
              Compte 6xx
              <select value={natureCompteId} onChange={(e) => setNatureCompteId(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {(accounts.data ?? [])
                  .filter((row) => row.actif && row.numero.startsWith('6'))
                  .map((row) => (
                    <option key={row.id} value={row.id}>{row.numero} · {row.intitule}</option>
                  ))}
              </select>
            </label>
            <button className="btn-primary" type="submit" disabled={createNature.isPending}>
              Ajouter une nature
            </button>
          </form>
        )}
      </section>
    </>
  );
}

export function ComptaOdPanel({
  societe,
  role,
}: {
  societe: SocieteDto;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const accounts = useQuery({
    queryKey: ['p2p-accounts', societe.id],
    queryFn: () => p2pApi.accounts(societe.id),
  });
  const [libelle, setLibelle] = useState('');
  const [dateComptable, setDateComptable] = useState(isoToday());
  const [reference, setReference] = useState('');
  const [lignes, setLignes] = useState<OdLigneDraft[]>([
    nouvelleLigneOd(),
    nouvelleLigneOd(),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [stornoId, setStornoId] = useState('');
  const [stornoPiece, setStornoPiece] = useState('');
  const [stornoLibelle, setStornoLibelle] = useState('');

  const totaux = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const ligne of lignes) {
      debit += montantLigne(ligne.debit);
      credit += montantLigne(ligne.credit);
    }
    return { debit, credit, ecart: Math.round((debit - credit) * 100) / 100 };
  }, [lignes]);

  const od = useMutation({
    mutationFn: () => {
      const payload = lignes
        .filter((l) => l.compteId && (montantLigne(l.debit) > 0 || montantLigne(l.credit) > 0))
        .map((l) => ({
          compteId: l.compteId,
          debit: montantLigne(l.debit),
          credit: montantLigne(l.credit),
        }));
      if (payload.length < 2) {
        throw new Error('Ajoutez au moins deux lignes renseignées.');
      }
      if (Math.abs(totaux.ecart) > 0.009) {
        throw new Error('L’écriture doit être équilibrée (débit = crédit).');
      }
      for (const l of payload) {
        if (l.debit > 0 && l.credit > 0) {
          throw new Error('Une ligne ne peut pas être à la fois en débit et en crédit.');
        }
      }
      if (reference.trim().length < 3) {
        throw new Error(
          'Indiquez la référence de la pièce justificative (note interne, PV, décision). SYSCOHADA : pas d’écriture sans pièce.',
        );
      }
      return p2pApi.postOd({
        societeId: societe.id,
        clientOperationId: operationId(),
        dateComptable,
        referencePiece: reference.trim(),
        libelle: libelle.trim(),
        lignes: payload,
      });
    },
    onSuccess: () => {
      setLibelle('');
      setReference('');
      setLignes([nouvelleLigneOd(), nouvelleLigneOd()]);
      setError(null);
      setOkMsg('Écriture OD comptabilisée.');
      void client.invalidateQueries({ queryKey: ['p2p-report'] });
      void client.invalidateQueries({ queryKey: ['p2p-journals'] });
    },
    onError: (err) => {
      setOkMsg(null);
      setError(messageDepuisApi(err, 'OD refusée.'));
    },
  });

  const storno = useMutation({
    mutationFn: () =>
      p2pApi.stornoEntry(stornoId.trim(), {
        societeId: societe.id,
        clientOperationId: operationId(),
        referencePiece: stornoPiece.trim(),
        libelle: stornoLibelle.trim() || undefined,
      }),
    onSuccess: () => {
      setStornoId('');
      setStornoPiece('');
      setStornoLibelle('');
      setError(null);
      setOkMsg('Storno comptabilisé (OD compensatoire).');
      void client.invalidateQueries({ queryKey: ['p2p-report'] });
      void client.invalidateQueries({ queryKey: ['p2p-journals'] });
    },
    onError: (err) => {
      setOkMsg(null);
      setError(messageDepuisApi(err, 'Storno refusé.'));
    },
  });

  const actifs = (accounts.data ?? []).filter((row) => row.actif);

  function updateLigne(key: string, patch: Partial<OdLigneDraft>) {
    setLignes((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  if (!canWrite) {
    return (
      <section className="panel p2p-section">
        <p className="lead">Seul le RAF peut saisir une opération diverse.</p>
      </section>
    );
  }

  return (
    <section className="panel p2p-section compta-od-form">
      <ComptaWhy>
        Journal OD — écriture manuelle multi-lignes. Débit = crédit. Pièce justificative
        obligatoire (référence interne). Ce n’est pas une facture fournisseur.{' '}
        <InfoTooltip insight={insightSaisieOd()} />
      </ComptaWhy>
      <div className="dash-panel-head">
        <div>
          <h2>
            Opération diverse <InfoTooltip insight={insightSaisieOd()} />
          </h2>
          <p className="lead">
            Journal OD — une pièce justificative, plusieurs lignes. La référence de pièce
            (note interne, PV, décision) est obligatoire. Ce n’est pas une facture
            fournisseur.
          </p>
        </div>
        <Link className="btn btn-secondary" to="/finance/comptabilite?rapport=charges">
          Factures de charge →
        </Link>
      </div>

      <form
        className="compta-od"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          setOkMsg(null);
          od.mutate();
        }}
      >
        <div className="compta-od-head">
          <label>
            Date comptable
            <input
              type="date"
              value={dateComptable}
              onChange={(e) => setDateComptable(e.target.value)}
              required
            />
          </label>
          <label>
            Journal
            <input value="OD · Opérations diverses" readOnly disabled />
          </label>
          <label>
            Référence pièce
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. NI-2026-014"
              required
              minLength={3}
              maxLength={40}
              aria-required="true"
            />
          </label>
          <label className="compta-od-libelle">
            Libellé
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              required
              minLength={2}
              placeholder="Objet de l’écriture"
            />
          </label>
        </div>

        <div className="table-wrap">
          <table className="compta-od-lines">
            <thead>
              <tr>
                <th>Compte</th>
                <th className="money">Débit</th>
                <th className="money">Crédit</th>
                <th className="sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={ligne.key}>
                  <td>
                    <select
                      value={ligne.compteId}
                      onChange={(e) => updateLigne(ligne.key, { compteId: e.target.value })}
                      aria-label={`Compte ligne ${index + 1}`}
                    >
                      <option value="">Compte…</option>
                      {actifs.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.numero} · {row.intitule}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={ligne.debit}
                      onChange={(e) =>
                        updateLigne(ligne.key, {
                          debit: e.target.value,
                          credit: e.target.value ? '' : ligne.credit,
                        })
                      }
                      aria-label={`Débit ligne ${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={ligne.credit}
                      onChange={(e) =>
                        updateLigne(ligne.key, {
                          credit: e.target.value,
                          debit: e.target.value ? '' : ligne.debit,
                        })
                      }
                      aria-label={`Crédit ligne ${index + 1}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={lignes.length <= 2}
                      onClick={() =>
                        setLignes((rows) => rows.filter((row) => row.key !== ligne.key))
                      }
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Totaux</th>
                <th className="money">{fmtFcfa(totaux.debit)}</th>
                <th className="money">{fmtFcfa(totaux.credit)}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="compta-od-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setLignes((rows) => [...rows, nouvelleLigneOd()])}
          >
            Ajouter une ligne
          </button>
          <p
            className={
              Math.abs(totaux.ecart) < 0.01 ? 'compta-od-balance ok' : 'compta-od-balance warn'
            }
            role="status"
          >
            {Math.abs(totaux.ecart) < 0.01
              ? 'Écriture équilibrée'
              : `Écart ${fmtFcfa(Math.abs(totaux.ecart))} — à équilibrer`}
          </p>
          <button
            className="btn-primary"
            type="submit"
            disabled={od.isPending || Math.abs(totaux.ecart) >= 0.01}
          >
            {od.isPending ? 'Comptabilisation…' : 'Comptabiliser'}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {okMsg && <p className="cmd-web-ok" role="status">{okMsg}</p>}
      </form>

      <form
        className="compta-od"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          setOkMsg(null);
          storno.mutate();
        }}
      >
        <h3>
          Storno <InfoTooltip insight={insightStorno()} />
        </h3>
        <p className="lead">
          Inverse une écriture déjà postée par une OD compensatoire. Pièce justificative
          obligatoire. Le grand livre n’est jamais modifié rétroactivement.
        </p>
        <div className="compta-od-head">
          <label>
            Identifiant de l’écriture
            <input
              value={stornoId}
              onChange={(e) => setStornoId(e.target.value)}
              required
              placeholder="UUID de la pièce à contre-passer"
            />
          </label>
          <label>
            Référence pièce
            <input
              value={stornoPiece}
              onChange={(e) => setStornoPiece(e.target.value)}
              required
              minLength={3}
              maxLength={40}
              placeholder="NI-STORNO-001"
            />
          </label>
          <label>
            Libellé
            <input
              value={stornoLibelle}
              onChange={(e) => setStornoLibelle(e.target.value)}
              placeholder="Storno pièce d’origine"
            />
          </label>
        </div>
        <div className="compta-od-footer">
          <button className="btn-primary" type="submit" disabled={storno.isPending}>
            {storno.isPending ? 'Comptabilisation…' : 'Comptabiliser le storno'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ComptaLettragePanel({
  societeId,
  role,
}: {
  societeId: string;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const [compte, setCompte] = useState<'401' | '411'>('401');
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const open = useQuery({
    queryKey: ['p2p-lettering', societeId, compte],
    queryFn: () => p2pApi.openLettering(societeId, compte),
  });

  const totaux = useMemo(() => {
    const rows = (open.data ?? []).filter((row) => selected.includes(row.id));
    const debit = rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = rows.reduce((sum, row) => sum + Number(row.credit), 0);
    return { debit, credit, ecart: Math.round((debit - credit) * 100) / 100 };
  }, [open.data, selected]);

  const letter = useMutation({
    mutationFn: () =>
      p2pApi.letterLines({
        societeId,
        clientOperationId: operationId(),
        code: code.trim().toUpperCase(),
        ligneIds: selected,
      }),
    onSuccess: (result) => {
      setSelected([]);
      setCode('');
      setError(null);
      setOkMsg(`Lettrage ${result.code} posé.`);
      void client.invalidateQueries({ queryKey: ['p2p-lettering'] });
      void client.invalidateQueries({ queryKey: ['p2p-report'] });
    },
    onError: (err) => {
      setOkMsg(null);
      setError(messageDepuisApi(err, 'Lettrage refusé.'));
    },
  });

  function toggle(id: string) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  return (
    <section className="panel p2p-section">
      <div className="dash-panel-head">
        <div>
          <h2>
            Lettrage {compte} <InfoTooltip insight={insightLettrage()} />
          </h2>
          <p className="lead">
            Lignes ouvertes du même tiers, débit = crédit. Le code posé est immuable.
          </p>
        </div>
      </div>
      <nav className="compta-journal-chips" aria-label="Compte à lettrer">
        {(['401', '411'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={compte === value ? 'actif' : undefined}
            onClick={() => {
              setCompte(value);
              setSelected([]);
            }}
          >
            {value === '401' ? 'Fournisseurs 401' : 'Clients 411'}
          </button>
        ))}
      </nav>
      {open.isLoading && <LoadingState label="Chargement des lignes ouvertes…" />}
      {open.isError && <p role="alert">Les lignes ouvertes n’ont pas pu être chargées.</p>}
      {(open.data?.length ?? 0) === 0 && !open.isLoading && (
        <EmptyState
          title="Aucune ligne ouverte"
          description="Les pièces lettrées à l’encaissement / paiement n’apparaissent plus ici."
        />
      )}
      {(open.data?.length ?? 0) > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {canWrite && <th />}
                <th>Pièce</th>
                <th>Date</th>
                <th>Tiers</th>
                <th>Débit</th>
                <th>Crédit</th>
              </tr>
            </thead>
            <tbody>
              {(open.data ?? []).map((row) => (
                <tr key={row.id}>
                  {canWrite && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`Sélectionner ${row.ecriture.numero}`}
                      />
                    </td>
                  )}
                  <td>
                    {row.ecriture.numero}
                    <div className="muted">{row.ecriture.libelle}</div>
                  </td>
                  <td>{fmtDate(row.ecriture.dateComptable)}</td>
                  <td>
                    {compte === '401'
                      ? (row.fournisseurNom ?? '—')
                      : [row.client?.prenom, row.client?.nom].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className={moneyClass(Number(row.debit))}>{fmtFcfa(Number(row.debit))}</td>
                  <td className={moneyClass(Number(row.credit))}>{fmtFcfa(Number(row.credit))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <form
          className="compta-od-footer"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            letter.mutate();
          }}
        >
          <label>
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="A1"
              required
              pattern="[A-Z0-9]{1,12}"
            />
          </label>
          <p
            className={Math.abs(totaux.ecart) < 0.01 ? 'compta-od-balance ok' : 'compta-od-balance warn'}
            role="status"
          >
            {selected.length} ligne(s) · écart {fmtFcfa(Math.abs(totaux.ecart))}
          </p>
          <button
            className="btn-primary"
            type="submit"
            disabled={letter.isPending || selected.length < 2 || Math.abs(totaux.ecart) >= 0.01}
          >
            {letter.isPending ? 'Lettrage…' : 'Lettrer'}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {okMsg && <p className="cmd-web-ok" role="status">{okMsg}</p>}
    </section>
  );
}

/** Facture fournisseur de charge (6xx) — menu Achats, pas le journal OD. */
export function ComptaChargesPanel({
  societe,
  role,
}: {
  societe: SocieteDto;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const natures = useQuery({
    queryKey: ['p2p-natures', societe.id],
    queryFn: () => p2pApi.naturesDepense(societe.id),
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled: canWrite,
  });
  const [dateDocument, setDateDocument] = useState(isoToday());
  const [fournisseurId, setFournisseurId] = useState('');
  const [natureId, setNatureId] = useState('');
  const [libelleLigne, setLibelleLigne] = useState('');
  const [referenceFournisseur, setReferenceFournisseur] = useState('');
  const [chargeMontant, setChargeMontant] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const charge = useMutation({
    mutationFn: () =>
      p2pApi.createChargeInvoice({
        societeId: societe.id,
        fournisseurId,
        clientOperationId: operationId(),
        dateDocument,
        referenceFournisseur: referenceFournisseur.trim() || undefined,
        lignes: [
          {
            natureDepenseId: natureId,
            quantite: 1,
            prixUnitaireHt: Number(chargeMontant),
            libelle: libelleLigne.trim() || undefined,
          },
        ],
      }),
    onSuccess: (res) => {
      setChargeMontant('');
      setLibelleLigne('');
      setReferenceFournisseur('');
      setError(null);
      setCreatedId(res.id);
      void client.invalidateQueries({ queryKey: ['factures-fournisseur'] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Facture de charge refusée.')),
  });

  if (!canWrite) {
    return (
      <section className="panel p2p-section">
        <p className="lead">Seul le RAF enregistre une facture de charge.</p>
      </section>
    );
  }

  return (
    <section className="panel p2p-section">
      <ComptaWhy>
        Pièce fournisseur hors marchandises (loyer, transport, honoraires…). Elle alimente le
        journal des achats (401 / 6xx), pas le journal OD.{' '}
        <InfoTooltip insight={insightFactureCharge()} />
      </ComptaWhy>
      <div className="dash-panel-head">
        <div>
          <h2>
            Facture de charge <InfoTooltip insight={insightFactureCharge()} />
          </h2>
          <p className="lead">
            Pièce fournisseur hors marchandises (loyer, transport, honoraires…). Puis
            comptabilisation au journal des achats — pas une OD.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-secondary" to="/achats/factures">
            Liste des factures
          </Link>
          <Link className="btn btn-secondary" to="/finance/comptabilite?rapport=od">
            Saisie OD →
          </Link>
        </div>
      </div>
      <form
        className="compta-charge-form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setCreatedId(null);
          charge.mutate();
        }}
      >
        <div className="compta-od-head">
          <label>
            Date document
            <input
              type="date"
              value={dateDocument}
              onChange={(e) => setDateDocument(e.target.value)}
              required
            />
          </label>
          <label>
            Fournisseur
            <select
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
              required
            >
              <option value="">Sélectionner…</option>
              {(fournisseurs.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            Réf. fournisseur
            <input
              value={referenceFournisseur}
              onChange={(e) => setReferenceFournisseur(e.target.value)}
              placeholder="N° facture"
            />
          </label>
          <label>
            Nature de dépense
            <select value={natureId} onChange={(e) => setNatureId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {(natures.data ?? [])
                .filter((row) => row.actif)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.libelle ?? row.compte.numero} → {row.compte.numero}
                  </option>
                ))}
            </select>
          </label>
          <label className="compta-od-libelle">
            Libellé ligne
            <input
              value={libelleLigne}
              onChange={(e) => setLibelleLigne(e.target.value)}
              placeholder="Ex. Loyer mars 2026"
            />
          </label>
          <label>
            Montant HT
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={chargeMontant}
              onChange={(e) => setChargeMontant(e.target.value)}
              required
            />
          </label>
        </div>
        <div className="compta-od-footer">
          <p className="muted">
            Après enregistrement, ouvrez la facture pour la comptabiliser (401 / 6xx).
          </p>
          <button className="btn-primary" type="submit" disabled={charge.isPending}>
            {charge.isPending ? 'Enregistrement…' : 'Enregistrer la facture'}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {createdId && (
          <p className="cmd-web-ok" role="status">
            Facture créée.{' '}
            <Link to={`/achats/factures/${createdId}`}>Ouvrir la pièce</Link>
          </p>
        )}
      </form>
    </section>
  );
}

function StatementTable({
  rows,
  caption,
  showTotal,
}: {
  rows: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
  caption: string;
  showTotal?: number;
}) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th>Compte</th>
            <th>Intitulé</th>
            <th>Débit</th>
            <th>Crédit</th>
            <th>Solde</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>Aucun mouvement sur cette section.</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.numero}>
              <td className="mono">{row.numero}</td>
              <td>{row.intitule}</td>
              <td className="money">{fmtFcfa(row.debit)}</td>
              <td className="money">{fmtFcfa(row.credit)}</td>
              <td className={moneyClass(Number(row.solde))}>{fmtFcfa(row.solde)}</td>
            </tr>
          ))}
        </tbody>
        {showTotal !== undefined && (
          <tfoot>
            <tr>
              <th colSpan={4}>Total {caption.toLowerCase()}</th>
              <th className={moneyClass(showTotal)}>{fmtFcfa(showTotal)}</th>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function ComptaEtatsPanel({
  societeId,
  du,
  au,
}: {
  societeId: string;
  du: string;
  au: string;
}) {
  const pack = useQuery({
    queryKey: ['p2p-bilan', societeId, du, au],
    queryFn: () => p2pApi.report<StatementPack>('bilan', societeId, du, au),
  });
  if (pack.isLoading) return <LoadingState label="Chargement des états SYSCOHADA…" />;
  if (pack.isError || !pack.data) return <p role="alert">Impossible de charger le bilan / compte de résultat.</p>;
  const { bilan, compteResultat } = pack.data;
  const actif = Number(bilan.totalActif);
  const passif = Number(bilan.totalPassif);
  const ecartBilan = Math.abs(actif - passif);
  const charges = Number(compteResultat.totalCharges);
  const produits = Number(compteResultat.totalProduits);
  const resultat = Number(compteResultat.resultat);

  return (
    <>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Bilan{' '}
              <InfoTooltip insight={insightBilan(bilan.equilibre, actif, passif)} />
            </h2>
            <p className="lead">
              Classes 1–5 · le résultat de période (classes 6/7) est reporté en RN
              pour l’équilibre · {fmtDate(du)} – {fmtDate(au)}
              {bilan.equilibre ? ' · équilibre' : ' · écart à contrôler'}
            </p>
            <p className="compta-norme" role="note">
              États SYSCOHADA — support de clôture, pas une liasse de dépôt légal.{' '}
              <Link to="/finance/comptabilite?rapport=liasse">Ouvrir la liasse (masses officielles)</Link>
            </p>
          </div>
        </div>
        <section className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <Scale size={16} />
            <div className="kpi-label">
              Actif <InfoTooltip insight={insightBilan(bilan.equilibre, actif, passif)} />
            </div>
            <div className="kpi-value">{fmtFcfa(actif)}</div>
            <div className="kpi-hint">{bilan.actif.length} ligne(s)</div>
          </article>
          <article className="kpi-card dash-kpi">
            <BookOpen size={16} />
            <div className="kpi-label">Passif</div>
            <div className="kpi-value">{fmtFcfa(passif)}</div>
            <div className="kpi-hint">{bilan.passif.length} ligne(s)</div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">Écart</div>
            <div className="kpi-value">{fmtFcfa(ecartBilan)}</div>
            <div className="kpi-hint">
              {bilan.equilibre ? (
                <span className="badge badge-ok">Équilibré</span>
              ) : (
                <span className="badge badge-warning">À contrôler</span>
              )}
            </div>
          </article>
        </section>
        <div className="compta-etats-grid">
          <div>
            <h3>Actif</h3>
            <StatementTable rows={bilan.actif} caption="Actif" showTotal={actif} />
          </div>
          <div>
            <h3>Passif</h3>
            <StatementTable rows={bilan.passif} caption="Passif" showTotal={passif} />
          </div>
        </div>
      </section>
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Compte de résultat{' '}
              <InfoTooltip
                insight={insightCompteResultat(compteResultat.benefice, resultat)}
              />
            </h2>
            <p className="lead">
              Classes 6 et 7 · {fmtDate(du)} – {fmtDate(au)}
            </p>
          </div>
        </div>
        <section className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">Charges (6)</div>
            <div className="kpi-value">{fmtFcfa(charges)}</div>
            <div className="kpi-hint">{compteResultat.charges.length} compte(s)</div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">Produits (7)</div>
            <div className="kpi-value">{fmtFcfa(produits)}</div>
            <div className="kpi-hint">{compteResultat.produits.length} compte(s)</div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">
              Résultat{' '}
              <InfoTooltip
                insight={insightCompteResultat(compteResultat.benefice, resultat)}
              />
            </div>
            <div className="kpi-value">{fmtFcfa(resultat)}</div>
            <div className="kpi-hint">
              {compteResultat.benefice ? (
                <span className="badge badge-ok">Bénéfice</span>
              ) : (
                <span className="badge badge-warning">Perte</span>
              )}
            </div>
          </article>
        </section>
        <div className="compta-etats-grid">
          <div>
            <h3>Charges (classe 6)</h3>
            <StatementTable rows={compteResultat.charges} caption="Charges" showTotal={charges} />
          </div>
          <div>
            <h3>Produits (classe 7)</h3>
            <StatementTable
              rows={compteResultat.produits}
              caption="Produits"
              showTotal={produits}
            />
          </div>
        </div>
      </section>
    </>
  );
}

export function ComptaTvaPanel({
  societeId,
  du,
  au,
}: {
  societeId: string;
  du: string;
  au: string;
}) {
  const vat = useQuery({
    queryKey: ['p2p-tva', societeId, du, au],
    queryFn: () => p2pApi.report<VatReturn>('tva', societeId, du, au),
  });
  if (vat.isLoading) return <LoadingState label="Chargement de l’état TVA…" />;
  if (vat.isError || !vat.data) return <p role="alert">Impossible de charger l’état TVA.</p>;
  const deductible = Number(vat.data.deductible);
  const collectee = Number(vat.data.collectee);
  const net = Number(vat.data.netAPayer);
  return (
    <section className="panel p2p-section">
      <ComptaWhy>
        Lecture des soldes <strong>4452</strong> (récupérable) et <strong>4457</strong> (collectée)
        sur la période. Ce n’est pas une déclaration fiscale complète (pas de taxes annexes hors
        ces comptes). <InfoTooltip insight={insightTva(net, vat.data.creditTva, deductible, collectee)} />
      </ComptaWhy>
      <div className="dash-panel-head">
        <div>
          <h2>
            État TVA{' '}
            <InfoTooltip insight={insightTva(net, vat.data.creditTva, deductible, collectee)} />
          </h2>
          <p className="lead">
            {fmtDate(du)} – {fmtDate(au)} · comptes 4452 / 4457
          </p>
        </div>
      </div>
      <section className="kpi-grid dash-kpi-grid">
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">Récupérable 4452</div>
          <div className="kpi-value">{fmtFcfa(deductible)}</div>
          <div className="kpi-hint">TVA sur achats / charges</div>
        </article>
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">Collectée 4457</div>
          <div className="kpi-value">{fmtFcfa(collectee)}</div>
          <div className="kpi-hint">TVA sur ventes</div>
        </article>
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">
            {vat.data.creditTva ? 'Crédit de TVA' : 'Net à payer'}{' '}
            <InfoTooltip insight={insightTva(net, vat.data.creditTva, deductible, collectee)} />
          </div>
          <div className="kpi-value">{fmtFcfa(Math.abs(net))}</div>
          <div className="kpi-hint">
            {vat.data.creditTva ? (
              <span className="badge badge-ok">Crédit</span>
            ) : net > 0.01 ? (
              <span className="badge badge-warning">À déclarer</span>
            ) : (
              <span className="badge badge-ok">Nul</span>
            )}
          </div>
        </article>
      </section>
      <StatementTable rows={vat.data.lignes} caption="Comptes TVA" />
    </section>
  );
}

export function ComptaFilePanel({
  societeId,
  role,
}: {
  societeId: string;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const [filtre, setFiltre] = useState<'ALL' | FileEcriture['statut']>('ALL');
  const [flushMsg, setFlushMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const queue = useQuery({
    queryKey: ['p2p-file', societeId],
    queryFn: () => p2pApi.postingQueue(societeId),
  });
  const flush = useMutation({
    mutationFn: () => p2pApi.flushQueue(societeId),
    onSuccess: (rows) => {
      void client.invalidateQueries({ queryKey: ['p2p-file'] });
      const ok = rows.filter((r) => r.statut === 'POSTEE').length;
      const ko = rows.filter((r) => r.statut === 'ERREUR').length;
      setFlushMsg(
        rows.length === 0
          ? 'Rien à rejouer.'
          : `Rejeu terminé : ${ok} postée(s), ${ko} en erreur.`,
      );
    },
  });
  const backfill = useMutation({
    mutationFn: () => p2pApi.backfillSales(societeId),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['p2p-file'] });
      void client.invalidateQueries({ queryKey: ['p2p-journals'] });
      setFlushMsg(
        `Rattrapage : ${result.ventes} vente(s), ${result.retours} retour(s), ${result.commandesWeb} commande(s) web. File restante : ${result.file}.`,
      );
    },
    onError: (err: unknown) => {
      setFlushMsg(messageDepuisApi(err, 'Rattrapage des ventes refusé.'));
    },
  });
  const items = queue.data ?? [];
  const counts = useMemo(() => {
    return {
      attente: items.filter((r) => r.statut === 'EN_ATTENTE').length,
      erreur: items.filter((r) => r.statut === 'ERREUR').length,
      postee: items.filter((r) => r.statut === 'POSTEE').length,
    };
  }, [items]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (filtre !== 'ALL' && r.statut !== filtre) return false;
      if (!needle) return true;
      const source = (SOURCE_COMPTABLE_LABELS[r.sourceType] ?? r.sourceType).toLowerCase();
      return (
        source.includes(needle) ||
        r.sourceId.toLowerCase().includes(needle) ||
        (r.motif ?? '').toLowerCase().includes(needle) ||
        r.statut.toLowerCase().includes(needle)
      );
    });
  }, [items, filtre, q]);

  return (
    <section className="panel p2p-section">
      <ComptaWhy>
        Pièces bloquées (période fermée, mapping manquant, échec). Une écriture déjà validée n’est
        jamais réécrite. <InfoTooltip insight={insightFileEcritures(counts.attente, counts.erreur)} />
      </ComptaWhy>
      <div className="dash-panel-head">
        <div>
          <h2>
            File d’écritures{' '}
            <InfoTooltip insight={insightFileEcritures(counts.attente, counts.erreur)} />
          </h2>
          <p className="lead">
            Pièces en file d’attente : période fermée, mapping manquant, ou échec de posting.
            Le RAF rejoue la file ; une écriture déjà validée n’est jamais réécrite.
          </p>
        </div>
        {canWrite && (
          <div className="p2p-action-grid">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFlushMsg(null);
                flush.mutate();
              }}
              disabled={flush.isPending || (counts.attente === 0 && counts.erreur === 0)}
            >
              {flush.isPending ? 'Rejeu…' : 'Rejouer la file'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFlushMsg(null);
                backfill.mutate();
              }}
              disabled={backfill.isPending}
            >
              {backfill.isPending ? 'Rattrapage…' : 'Rattraper les ventes'}
            </button>
          </div>
        )}
      </div>
      <section className="kpi-grid dash-kpi-grid">
        <article
          className={`kpi-card dash-kpi${filtre === 'EN_ATTENTE' ? ' actif' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setFiltre((f) => (f === 'EN_ATTENTE' ? 'ALL' : 'EN_ATTENTE'))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFiltre((f) => (f === 'EN_ATTENTE' ? 'ALL' : 'EN_ATTENTE'));
            }
          }}
        >
          <div className="kpi-label">
            En attente <InfoTooltip insight={insightFileEcritures(counts.attente, counts.erreur)} />
          </div>
          <div className="kpi-value">{counts.attente}</div>
          <div className="kpi-hint">À rejouer dès que la période est ouverte</div>
        </article>
        <article
          className={`kpi-card dash-kpi${filtre === 'ERREUR' ? ' actif' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setFiltre((f) => (f === 'ERREUR' ? 'ALL' : 'ERREUR'))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFiltre((f) => (f === 'ERREUR' ? 'ALL' : 'ERREUR'));
            }
          }}
        >
          <div className="kpi-label">Erreurs</div>
          <div className="kpi-value">{counts.erreur}</div>
          <div className="kpi-hint">Motif affiché — corriger le mapping / la période</div>
        </article>
        <article
          className={`kpi-card dash-kpi${filtre === 'POSTEE' ? ' actif' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setFiltre((f) => (f === 'POSTEE' ? 'ALL' : 'POSTEE'))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFiltre((f) => (f === 'POSTEE' ? 'ALL' : 'POSTEE'));
            }
          }}
        >
          <div className="kpi-label">Postées</div>
          <div className="kpi-value">{counts.postee}</div>
          <div className="kpi-hint">Historique récent de la file</div>
        </article>
      </section>
      <div className="p2p-inline-fields no-print">
        <label className="compta-paiements-search">
          Rechercher
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Source, motif, réf…"
            aria-label="Rechercher dans la file"
          />
        </label>
      </div>
      <nav className="compta-journal-chips" aria-label="Filtrer la file">
        {(
          [
            ['ALL', 'Toutes'],
            ['EN_ATTENTE', 'En attente'],
            ['ERREUR', 'Erreurs'],
            ['POSTEE', 'Postées'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filtre === value ? 'actif' : undefined}
            onClick={() => setFiltre(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {flushMsg && (
        <p className="cmd-web-ok" role="status">
          {flushMsg}
        </p>
      )}
      {queue.isLoading && <LoadingState label="Chargement de la file…" />}
      {queue.isError && <p role="alert">Impossible de charger la file d’écritures.</p>}
      {visible.length === 0 && !queue.isLoading && (
        <EmptyState
          title={filtre === 'ALL' && !q.trim() ? 'File vide' : 'Aucun élément sur ce filtre'}
          description={
            filtre === 'ERREUR'
              ? 'Aucune erreur en file. Si un posting échoue, le motif s’affichera ici.'
              : 'Aucune pièce en attente. Les ventes POS / commandes web bloquées apparaîtront ici.'
          }
        />
      )}
      {visible.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Réf. pièce</th>
                <th>Date comptable</th>
                <th>Créée</th>
                <th>Statut</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row: FileEcriture) => (
                <tr key={row.id}>
                  <td>{SOURCE_COMPTABLE_LABELS[row.sourceType] ?? row.sourceType}</td>
                  <td className="mono">{row.sourceId.slice(0, 8).toUpperCase()}</td>
                  <td>{fmtDate(row.dateComptable)}</td>
                  <td>{row.dateCreation ? fmtDate(row.dateCreation) : '—'}</td>
                  <td>
                    <span
                      className={
                        row.statut === 'POSTEE'
                          ? 'badge badge-ok'
                          : row.statut === 'ERREUR'
                            ? 'badge badge-critical'
                            : 'badge badge-warning'
                      }
                    >
                      {row.statut.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>{row.motif ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
