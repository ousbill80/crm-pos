import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import {
  BookOpen,
  Building2,
  Landmark,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { apiDownload, messageDepuisApi } from '../lib/api';
import { fmtDate, fmtFcfa } from '../lib/achats-ui';
import { moneyClass } from '../lib/compta-reports';
import {
  insightImmos,
  insightLiasse,
  insightTft,
} from '../lib/insights/compta';
import {
  hasP2pRole,
  p2pApi,
  type ImmobilisationFiche,
  type LiasseLigne,
  type LiassePack,
} from '../lib/p2p';
import type { SocieteDto } from '../lib/types';
import { EmptyState } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';

export const MENTION_LIASSE_NON_DEPOT =
  'États SYSCOHADA — support de clôture, pas une liasse de dépôt légal.';

export function MentionLiasseNonDepot() {
  return (
    <p className="compta-norme" role="note">
      {MENTION_LIASSE_NON_DEPOT} AUDCIF · XOF · Côte d’Ivoire. Les 10 boutiques
      sont des centres d’exploitation du même grand livre — pas un groupe de
      sociétés.
    </p>
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function pct(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || Math.abs(total) < 0.005) {
    return '—';
  }
  return `${((100 * part) / total).toFixed(1)} %`;
}

function previewDotation(input: {
  brute: number;
  residuelle: number;
  dureeMois: number;
  cumul: number;
  deja: number;
}): number | null {
  const amortissable = input.brute - input.residuelle;
  if (amortissable <= 0 || input.dureeMois < 1) return null;
  const remainingMonths = input.dureeMois - input.deja;
  if (remainingMonths <= 0) return null;
  const remaining = amortissable - input.cumul;
  if (remaining <= 0) return null;
  if (remainingMonths === 1) return round2(remaining);
  return Math.min(round2(amortissable / input.dureeMois), remaining);
}

function csvCell(value: string) {
  if (/[;"\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function packToCsv(pack: LiassePack): string {
  const lines = [
    'Section;Code;Libelle;Montant',
    ...pack.bilan.actif.map(
      (row) => `Bilan actif;${row.code};${csvCell(row.libelle)};${row.montant}`,
    ),
    `Bilan actif;AZ;Total actif;${pack.bilan.totalActif}`,
    ...pack.bilan.passif.map(
      (row) => `Bilan passif;${row.code};${csvCell(row.libelle)};${row.montant}`,
    ),
    `Bilan passif;PZ;Total passif;${pack.bilan.totalPassif}`,
    ...pack.compteResultat.postes.map(
      (row) => `Compte de resultat;${row.code};${csvCell(row.libelle)};${row.montant}`,
    ),
    ...pack.tft.lignes.map(
      (row) => `TFT;${row.code};${csvCell(row.libelle)};${row.montant}`,
    ),
    `Notes;M;${csvCell(pack.mention)};`,
    `Notes;P;${csvCell(pack.perimetre.message)};`,
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LiasseTable({
  caption,
  rows,
  total,
  totalLabel,
  base,
  hideZero,
}: {
  caption: string;
  rows: LiasseLigne[];
  total?: string;
  totalLabel?: string;
  base?: number;
  hideZero?: boolean;
}) {
  const visible = hideZero
    ? rows.filter((row) => Math.abs(Number(row.montant)) >= 0.005)
    : rows;
  return (
    <div className="table-wrap">
      <table className="liasse-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th>Poste</th>
            <th>Libellé</th>
            <th className="num">Montant</th>
            {base != null && <th className="num">Poids</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.code} className={row.calcule ? 'liasse-row-calcule' : undefined}>
              <td>
                <span className="liasse-poste">{row.code}</span>
              </td>
              <td>
                {row.libelle}
                {row.calcule ? <span className="liasse-tag">calculé</span> : null}
              </td>
              <td className={moneyClass(Number(row.montant))}>{fmtFcfa(row.montant)}</td>
              {base != null && (
                <td className="num muted">{pct(Number(row.montant), base)}</td>
              )}
            </tr>
          ))}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr>
              <th colSpan={2}>{totalLabel ?? 'Total'}</th>
              <th className={moneyClass(Number(total))}>{fmtFcfa(total)}</th>
              {base != null && <th className="num">100 %</th>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MasseBar({
  rows,
  total,
}: {
  rows: LiasseLigne[];
  total: number;
}) {
  const parts = rows.filter(
    (row) => !row.calcule && Math.abs(Number(row.montant)) >= 0.005,
  );
  const denom = Math.abs(total) < 0.005 ? 1 : Math.abs(total);
  return (
    <div className="liasse-masse" aria-hidden="true">
      <div className="dash-bar-track liasse-masse-track">
        {parts.map((row) => (
          <span
            key={row.code}
            className={`liasse-masse-seg liasse-masse-${row.code.toLowerCase()}`}
            style={{ width: `${Math.min(100, (100 * Math.abs(Number(row.montant))) / denom)}%` }}
            title={`${row.code} ${row.libelle} ${fmtFcfa(row.montant)}`}
          />
        ))}
      </div>
      <ul className="liasse-masse-legend">
        {parts.map((row) => (
          <li key={row.code}>
            <span className={`liasse-swatch liasse-masse-${row.code.toLowerCase()}`} />
            {row.code} · {pct(Math.abs(Number(row.montant)), denom)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComptaLiassePanel({
  societeId,
  du,
  au,
}: {
  societeId: string;
  du: string;
  au: string;
}) {
  const [agregat, setAgregat] = useState(false);
  const [hideZero, setHideZero] = useState(true);
  const [section, setSection] = useState<'bilan' | 'cr' | 'tft' | 'notes'>('bilan');
  const pack = useQuery({
    queryKey: ['p2p-liasse', societeId, du, au, agregat],
    queryFn: () =>
      agregat ? p2pApi.liasseAgregat(du, au) : p2pApi.liasse(societeId, du, au),
  });
  const [exportErr, setExportErr] = useState<string | null>(null);

  if (pack.isLoading) return <LoadingState label="Chargement de la liasse SYSCOHADA…" />;
  if (pack.isError || !pack.data) {
    return <p role="alert">Impossible de charger la liasse SYSCOHADA.</p>;
  }
  const data: LiassePack = pack.data;
  const multi = data.perimetre.societeCount > 1;
  const actif = Number(data.bilan.totalActif);
  const resultat = Number(data.compteResultat.resultat);
  const ventes = Number(data.compteResultat.ventes);

  async function telechargerPdf() {
    setExportErr(null);
    try {
      const path = agregat
        ? `/achats/comptabilite/rapports/liasse-agregat/pdf?du=${du}&au=${au}`
        : `/achats/comptabilite/rapports/liasse/pdf?societeId=${societeId}&du=${du}&au=${au}`;
      await apiDownload(path, `liasse-syscohada-${du}-${au}.pdf`);
    } catch (err) {
      setExportErr(messageDepuisApi(err, 'Export PDF impossible.'));
    }
  }

  function telechargerCsv() {
    setExportErr(null);
    downloadText(
      `liasse-syscohada-${du}-${au}.csv`,
      packToCsv(data),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <>
      <MentionLiasseNonDepot />
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Liasse SYSCOHADA 2017{' '}
              <InfoTooltip
                insight={insightLiasse(data.bilan.equilibre, resultat, data.compteResultat.benefice)}
              />
            </h2>
            <p className="lead">
              {data.perimetre.message} · {fmtDate(du)} – {fmtDate(au)}
            </p>
          </div>
          <div className="p2p-inline-fields no-print">
            {multi && (
              <label className="liasse-toggle">
                <input
                  type="checkbox"
                  checked={agregat}
                  onChange={(e) => setAgregat(e.target.checked)}
                />{' '}
                Combiné simple (non consolidé)
              </label>
            )}
            <label className="liasse-toggle">
              <input
                type="checkbox"
                checked={hideZero}
                onChange={(e) => setHideZero(e.target.checked)}
              />{' '}
              Masquer les postes à 0
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => void telechargerPdf()}>
              PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={telechargerCsv}>
              CSV
            </button>
          </div>
        </div>
        {data.perimetre.mode === 'AGREGAT_NON_CONSOLIDE' && (
          <p className="compta-why" role="status">
            Agrégat non consolidé — éliminations intra-groupe non tenues. Pas de % de
            contrôle, d’écarts d’acquisition ni d’intérêts minoritaires.
          </p>
        )}
        {exportErr && <p role="alert">{exportErr}</p>}
        <nav className="compta-journal-chips no-print" aria-label="Sections de la liasse">
          {(
            [
              ['bilan', 'Bilan'],
              ['cr', 'Compte de résultat'],
              ['tft', 'TFT'],
              ['notes', 'Notes'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'actif' : undefined}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <section className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <Scale size={16} />
            <div className="kpi-label">
              Total actif <InfoTooltip insight={insightLiasse(data.bilan.equilibre, resultat, data.compteResultat.benefice)} />
            </div>
            <div className="kpi-value">{fmtFcfa(actif)}</div>
            <div className="kpi-hint">
              {data.bilan.equilibre ? (
                <span className="badge badge-ok">Équilibré</span>
              ) : (
                <span className="badge badge-warning">Écart à contrôler</span>
              )}
            </div>
          </article>
          <article className="kpi-card dash-kpi">
            <TrendingUp size={16} />
            <div className="kpi-label">Résultat</div>
            <div className={`kpi-value ${moneyClass(resultat)}`}>{fmtFcfa(resultat)}</div>
            <div className="kpi-hint">
              {data.compteResultat.benefice ? (
                <span className="badge badge-ok">Bénéfice</span>
              ) : (
                <span className="badge badge-warning">Perte</span>
              )}
            </div>
          </article>
          <article className="kpi-card dash-kpi">
            <Landmark size={16} />
            <div className="kpi-label">Marge commerciale</div>
            <div className="kpi-value">{fmtFcfa(data.compteResultat.margeCommerciale)}</div>
            <div className="kpi-hint">
              {pct(Number(data.compteResultat.margeCommerciale), ventes)} des ventes
            </div>
          </article>
          <article className="kpi-card dash-kpi">
            <Wallet size={16} />
            <div className="kpi-label">
              TFT <InfoTooltip insight={insightTft(data.tft.mode)} />
            </div>
            <div className="kpi-value">
              {data.tft.mode === 'N_SEULEMENT' ? 'N seulement' : 'N / N−1'}
            </div>
            <div className="kpi-hint">{data.tft.mention ?? 'Méthode indirecte'}</div>
          </article>
        </section>
        {(section === 'bilan') && (
          <div>
            <h3>Bilan — composition de l’actif</h3>
            <MasseBar rows={data.bilan.actif} total={actif} />
            <div className="compta-etats-grid">
              <div>
                <h3>Actif</h3>
                <LiasseTable
                  caption="Actif"
                  rows={data.bilan.actif}
                  total={data.bilan.totalActif}
                  totalLabel="Total actif"
                  base={actif}
                  hideZero={hideZero}
                />
              </div>
              <div>
                <h3>Passif</h3>
                <LiasseTable
                  caption="Passif"
                  rows={data.bilan.passif}
                  total={data.bilan.totalPassif}
                  totalLabel="Total passif"
                  base={Number(data.bilan.totalPassif)}
                  hideZero={hideZero}
                />
              </div>
            </div>
          </div>
        )}
      </section>
      {section === 'cr' && (
        <section className="panel p2p-section">
          <div className="dash-panel-head">
            <div>
              <h2>Compte de résultat (enchaînement retail)</h2>
              <p className="lead">
                Ventes 70 → achats / CMV 60–603 → marge → services 61/62 → VA / EBE
                approximés → résultat
              </p>
            </div>
          </div>
          <section className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Ventes</div>
              <div className="kpi-value">{fmtFcfa(data.compteResultat.ventes)}</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Achats / CMV</div>
              <div className="kpi-value">{fmtFcfa(data.compteResultat.achatsCmv)}</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">VA approximée</div>
              <div className="kpi-value">{fmtFcfa(data.compteResultat.valeurAjoutee)}</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">EBE approximé</div>
              <div className="kpi-value">{fmtFcfa(data.compteResultat.ebe)}</div>
              <div className="kpi-hint">Avant dotations 68</div>
            </article>
          </section>
          <LiasseTable
            caption="Compte de résultat"
            rows={data.compteResultat.postes}
            base={ventes}
            hideZero={hideZero}
          />
        </section>
      )}
      {section === 'tft' && (
        <section className="panel p2p-section">
          <div className="dash-panel-head">
            <div>
              <h2>
                Tableau des flux de trésorerie{' '}
                <InfoTooltip insight={insightTft(data.tft.mode)} />
              </h2>
              <p className="lead">
                {data.tft.mention ??
                  'Résultat ± variation du BFR (classes 3–4) ± variation de trésorerie (classe 5).'}
              </p>
            </div>
          </div>
          <LiasseTable caption="TFT" rows={data.tft.lignes} />
        </section>
      )}
      {section === 'notes' && (
        <section className="panel p2p-section">
          <div className="dash-panel-head">
            <div>
              <h2>Notes annexes opérationnelles</h2>
              <p className="lead">
                Quatre notes minimales — pas le recueil complet SYSCOHADA.
              </p>
            </div>
          </div>
          <div className="liasse-notes-grid">
            <article className="liasse-note">
              <h3>1. Méthodes</h3>
              <ul>
                {data.notes.methodes.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </article>
            <article className="liasse-note">
              <h3>2. Immobilisations</h3>
              <p>
                Source :{' '}
                {data.notes.immobilisations.source === 'registre'
                  ? 'registre des fiches'
                  : 'soldes 21 / 28 du grand livre'}
              </p>
              <dl className="liasse-dl">
                <div>
                  <dt>Brute</dt>
                  <dd>{fmtFcfa(data.notes.immobilisations.brute)}</dd>
                </div>
                <div>
                  <dt>Amortissements</dt>
                  <dd>{fmtFcfa(data.notes.immobilisations.amortissements)}</dd>
                </div>
                <div>
                  <dt>Nette</dt>
                  <dd>{fmtFcfa(data.notes.immobilisations.nette)}</dd>
                </div>
              </dl>
              <Link to="/finance/comptabilite?rapport=immos">Ouvrir le registre</Link>
            </article>
            <article className="liasse-note">
              <h3>3. Encours</h3>
              <dl className="liasse-dl">
                <div>
                  <dt>Fournisseurs 401</dt>
                  <dd>{fmtFcfa(data.notes.encours.fournisseurs401)}</dd>
                </div>
                <div>
                  <dt>Clients 411</dt>
                  <dd>{fmtFcfa(data.notes.encours.clients411)}</dd>
                </div>
              </dl>
              <p>
                <Link to="/finance/comptabilite?rapport=balance-agee-fournisseurs">Âgée 401</Link>
                {' · '}
                <Link to="/finance/comptabilite?rapport=balance-agee-clients">Âgée 411</Link>
              </p>
            </article>
            <article className="liasse-note">
              <h3>4. TVA</h3>
              <dl className="liasse-dl">
                <div>
                  <dt>4452 récupérable</dt>
                  <dd>{fmtFcfa(data.notes.tva.deductible)}</dd>
                </div>
                <div>
                  <dt>4457 collectée</dt>
                  <dd>{fmtFcfa(data.notes.tva.collectee)}</dd>
                </div>
                <div>
                  <dt>Net</dt>
                  <dd>{fmtFcfa(data.notes.tva.netAPayer)}</dd>
                </div>
              </dl>
              <Link to="/finance/comptabilite?rapport=tva">État TVA</Link>
            </article>
          </div>
        </section>
      )}
    </>
  );
}

function immoCumul(immo: ImmobilisationFiche) {
  return immo.dotations.reduce((sum, d) => sum + Number(d.montant), 0);
}

function immoNette(immo: ImmobilisationFiche) {
  return Number(immo.valeurBrute) - immoCumul(immo);
}

export function ComptaImmosPanel({
  societe,
  role,
}: {
  societe: SocieteDto;
  role?: RoleLibelle;
}) {
  const client = useQueryClient();
  const canWrite = hasP2pRole(role, 'comptabiliteEcriture');
  const canDotation = hasP2pRole(role, 'immoDotation');
  const list = useQuery({
    queryKey: ['p2p-immos', societe.id],
    queryFn: () => p2pApi.immobilisations(societe.id),
  });
  const accounts = useQuery({
    queryKey: ['p2p-accounts', societe.id],
    queryFn: () => p2pApi.accounts(societe.id),
  });
  const periods = useQuery({
    queryKey: ['p2p-periods', societe.id],
    queryFn: () => p2pApi.periods(societe.id),
  });
  const comptesImmo = useMemo(
    () =>
      (accounts.data ?? []).filter((c) => {
        const n = c.numero.replace(/\D/g, '');
        return c.actif && n.startsWith('2') && !n.startsWith('28');
      }),
    [accounts.data],
  );
  const periodesOuvertes = useMemo(
    () => (periods.data ?? []).filter((p) => !p.cloture && !p.exercice.cloture),
    [periods.data],
  );
  const [libelle, setLibelle] = useState('');
  const [dateMiseEnService, setDateMiseEnService] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [valeurBrute, setValeurBrute] = useState('');
  const [dureeMois, setDureeMois] = useState('36');
  const [valeurResiduelle, setValeurResiduelle] = useState('0');
  const [compteId, setCompteId] = useState('');
  const [periodeId, setPeriodeId] = useState('');
  const [filtre, setFiltre] = useState<'TOUS' | 'EN_SERVICE' | 'SORTI'>('EN_SERVICE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (periodeId || periodesOuvertes.length === 0) return;
    const now = new Date();
    const current =
      periodesOuvertes.find(
        (p) => new Date(p.dateDebut) <= now && now <= new Date(p.dateFin),
      ) ?? periodesOuvertes[0];
    if (current) setPeriodeId(current.id);
  }, [periodeId, periodesOuvertes]);

  useEffect(() => {
    if (compteId || comptesImmo.length === 0) return;
    const defaut = comptesImmo.find((c) => c.numero === '21') ?? comptesImmo[0];
    if (defaut) setCompteId(defaut.id);
  }, [compteId, comptesImmo]);

  const create = useMutation({
    mutationFn: () =>
      p2pApi.createImmobilisation({
        societeId: societe.id,
        compteId,
        libelle: libelle.trim(),
        dateMiseEnService,
        valeurBrute: Number(valeurBrute),
        dureeMois: Number(dureeMois),
        valeurResiduelle: Number(valeurResiduelle || 0),
      }),
    onSuccess: (created) => {
      setLibelle('');
      setValeurBrute('');
      setError(null);
      setOkMsg('Fiche d’immobilisation créée.');
      setSelectedId(created.id);
      void client.invalidateQueries({ queryKey: ['p2p-immos', societe.id] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Création de la fiche impossible.')),
  });

  const generer = useMutation({
    mutationFn: () => p2pApi.genererDotations(societe.id, periodeId),
    onSuccess: (data) => {
      const creees = data.dotations.filter((d) => d.creee).length;
      const deja = data.dotations.length - creees;
      setOkMsg(
        creees === 0
          ? `Aucune nouvelle pièce : ${deja} dotation(s) déjà postée(s) pour ${data.periode.code}.`
          : `${creees} pièce(s) OD 6813/28 pour ${data.periode.code}${deja ? ` · ${deja} déjà postée(s)` : ''}.`,
      );
      setError(null);
      void client.invalidateQueries({ queryKey: ['p2p-immos', societe.id] });
      void client.invalidateQueries({ queryKey: ['p2p-report'] });
      void client.invalidateQueries({ queryKey: ['p2p-liasse'] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Génération des dotations impossible.')),
  });

  const sortir = useMutation({
    mutationFn: (id: string) =>
      p2pApi.sortirImmobilisation(id, 'Sortie manuelle (OD hors module)'),
    onSuccess: () => {
      setOkMsg(
        'Fiche passée en SORTI — les dotations s’arrêtent. La plus/moins-value de cession se saisit en OD.',
      );
      void client.invalidateQueries({ queryKey: ['p2p-immos', societe.id] });
    },
    onError: (err) => setError(messageDepuisApi(err, 'Sortie de l’immobilisation impossible.')),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    create.mutate();
  }

  const items: ImmobilisationFiche[] = list.data ?? [];
  const filtered = items.filter((immo) =>
    filtre === 'TOUS' ? true : immo.statut === filtre,
  );
  const enService = items.filter((i) => i.statut === 'EN_SERVICE');
  const bruteTotale = enService.reduce((s, i) => s + Number(i.valeurBrute), 0);
  const cumulTotal = enService.reduce((s, i) => s + immoCumul(i), 0);
  const netteTotale = bruteTotale - cumulTotal;
  const selected = items.find((i) => i.id === selectedId) ?? filtered[0] ?? null;
  const previewCreate = previewDotation({
    brute: Number(valeurBrute),
    residuelle: Number(valeurResiduelle || 0),
    dureeMois: Number(dureeMois),
    cumul: 0,
    deja: 0,
  });
  const aDoter = enService.filter(
    (immo) =>
      periodeId &&
      !immo.dotations.some((d) => d.periode.id === periodeId) &&
      previewDotation({
        brute: Number(immo.valeurBrute),
        residuelle: Number(immo.valeurResiduelle),
        dureeMois: immo.dureeMois,
        cumul: immoCumul(immo),
        deja: immo.dotations.length,
      }) != null,
  );
  const periodeChoisie = periodesOuvertes.find((p) => p.id === periodeId);

  return (
    <>
      <MentionLiasseNonDepot />
      <section className="panel p2p-section">
        <div className="dash-panel-head">
          <div>
            <h2>
              Immobilisations{' '}
              <InfoTooltip insight={insightImmos(enService.length, netteTotale)} />
            </h2>
            <p className="lead">
              Linéaire mensuel · D <strong>6813</strong> / C <strong>28</strong> · journal OD.
              Pas de dégressif, pas de réévaluation, pas de calcul automatique de cession.
            </p>
          </div>
          <Link className="btn btn-secondary no-print" to="/finance/comptabilite?rapport=liasse">
            Voir dans la liasse
          </Link>
        </div>
        <section className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <Building2 size={16} />
            <div className="kpi-label">En service</div>
            <div className="kpi-value">{enService.length}</div>
            <div className="kpi-hint">
              {items.filter((i) => i.statut === 'SORTI').length} sorti(s)
            </div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">Valeur brute</div>
            <div className="kpi-value">{fmtFcfa(bruteTotale)}</div>
            <div className="kpi-hint">Fiches encore en service</div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="kpi-label">Cumul amorti</div>
            <div className="kpi-value">{fmtFcfa(cumulTotal)}</div>
            <div className="kpi-hint">Dotations déjà postées</div>
          </article>
          <article className="kpi-card dash-kpi">
            <BookOpen size={16} />
            <div className="kpi-label">Valeur nette</div>
            <div className="kpi-value">{fmtFcfa(netteTotale)}</div>
            <div className="kpi-hint">Brute − cumul 28</div>
          </article>
        </section>
        {error && <p role="alert">{error}</p>}
        {okMsg && (
          <p className="compta-why" role="status">
            {okMsg}
          </p>
        )}
        {canDotation && (
          <div className="immo-dotation-bar no-print">
            <label>
              Période ouverte
              <select
                value={periodeId}
                onChange={(e) => setPeriodeId(e.target.value)}
                aria-label="Période pour les dotations"
              >
                <option value="">Choisir…</option>
                {periodesOuvertes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {fmtDate(p.dateDebut)} – {fmtDate(p.dateFin)}
                  </option>
                ))}
              </select>
            </label>
            <p className="immo-dotation-preview">
              {periodeChoisie
                ? aDoter.length === 0
                  ? `Rien à doter pour ${periodeChoisie.code} (déjà posté ou aucune fiche).`
                  : `${aDoter.length} fiche(s) à doter pour ${periodeChoisie.code} · ${fmtFcfa(
                      aDoter.reduce(
                        (s, immo) =>
                          s +
                          (previewDotation({
                            brute: Number(immo.valeurBrute),
                            residuelle: Number(immo.valeurResiduelle),
                            dureeMois: immo.dureeMois,
                            cumul: immoCumul(immo),
                            deja: immo.dotations.length,
                          }) ?? 0),
                        0,
                      ),
                    )}`
                : 'Choisissez une période ouverte.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={!periodeId || generer.isPending || aDoter.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `Comptabiliser ${aDoter.length} dotation(s) ${periodeChoisie?.code ?? ''} (D 6813 / C 28) ? Un second lancement sera ignoré.`,
                  )
                ) {
                  generer.mutate();
                }
              }}
            >
              Générer les dotations du mois
            </button>
          </div>
        )}
        {canWrite && (
          <form className="immo-create no-print" onSubmit={onCreate}>
            <h3>Nouvelle fiche</h3>
            <div className="compta-od-head">
              <label className="compta-od-libelle">
                Libellé
                <input
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Ex. Agencement boutique Plateau"
                />
              </label>
              <label>
                Compte 2x (hors 28)
                <select
                  value={compteId}
                  onChange={(e) => setCompteId(e.target.value)}
                  required
                >
                  <option value="">Choisir…</option>
                  {comptesImmo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero} · {c.intitule}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mise en service
                <input
                  type="date"
                  value={dateMiseEnService}
                  onChange={(e) => setDateMiseEnService(e.target.value)}
                  required
                />
              </label>
              <label>
                Valeur brute (XOF)
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={valeurBrute}
                  onChange={(e) => setValeurBrute(e.target.value)}
                  required
                />
              </label>
              <label>
                Durée (mois)
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={dureeMois}
                  onChange={(e) => setDureeMois(e.target.value)}
                  required
                />
              </label>
              <label>
                Valeur résiduelle
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valeurResiduelle}
                  onChange={(e) => setValeurResiduelle(e.target.value)}
                />
              </label>
            </div>
            <p className="lead">
              {previewCreate != null && Number(valeurBrute) > 0
                ? `Dotation mensuelle : ${fmtFcfa(previewCreate)} · ${dureeMois} mois · dernier mois ajusté pour coller à l’amortissable.`
                : 'Saisissez une valeur brute et une durée pour voir la dotation mensuelle.'}
            </p>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Créer la fiche
            </button>
          </form>
        )}
        <nav className="compta-journal-chips" aria-label="Filtrer les fiches">
          {(
            [
              ['EN_SERVICE', 'En service'],
              ['SORTI', 'Sorties'],
              ['TOUS', 'Toutes'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filtre === id ? 'actif' : undefined}
              onClick={() => setFiltre(id)}
            >
              {label}
              {id !== 'TOUS'
                ? ` · ${items.filter((i) => i.statut === id).length}`
                : ` · ${items.length}`}
            </button>
          ))}
        </nav>
        {list.isLoading && <LoadingState label="Chargement du registre…" />}
        {list.isError && <p role="alert">Impossible de charger les immobilisations.</p>}
        {list.data && filtered.length === 0 && (
          <EmptyState
            title={filtre === 'EN_SERVICE' ? 'Aucune immobilisation en service' : 'Aucune fiche'}
            description={
              canWrite
                ? 'Créez une fiche sur le compte 21 (durée en mois). Les dotations du mois ouvert se lancent ensuite ci-dessus.'
                : 'Le RAF crée la fiche. Le DAF ou le RAF génère les dotations du mois ouvert.'
            }
          />
        )}
        {filtered.length > 0 && (
          <div className="immo-layout">
            <div className="table-wrap">
              <table className="immo-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Compte</th>
                    <th className="num">Nette</th>
                    <th>Avancement</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((immo) => {
                    const cumul = immoCumul(immo);
                    const amortissable =
                      Number(immo.valeurBrute) - Number(immo.valeurResiduelle);
                    const ratio =
                      amortissable > 0 ? Math.min(100, (100 * cumul) / amortissable) : 0;
                    return (
                      <tr
                        key={immo.id}
                        className={selected?.id === immo.id ? 'immo-row-actif' : undefined}
                        onClick={() => setSelectedId(immo.id)}
                      >
                        <td>
                          <button type="button" className="immo-row-btn">
                            {immo.libelle}
                          </button>
                        </td>
                        <td>
                          {immo.compte.numero}
                        </td>
                        <td className={moneyClass(immoNette(immo))}>
                          {fmtFcfa(immoNette(immo))}
                        </td>
                        <td>
                          <div className="dash-bar-track" title={`${ratio.toFixed(0)} % amorti`}>
                            <div className="dash-bar-fill" style={{ width: `${ratio}%` }} />
                          </div>
                          <span className="muted">
                            {immo.dotations.length}/{immo.dureeMois} mois
                          </span>
                        </td>
                        <td>
                          {immo.statut === 'EN_SERVICE' ? (
                            <span className="badge badge-ok">En service</span>
                          ) : (
                            <span className="badge">Sorti</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {selected && (
              <aside className="immo-fiche">
                <header>
                  <h3>{selected.libelle}</h3>
                  <p className="lead">
                    {selected.compte.numero} · {selected.compte.intitule} · mise en service{' '}
                    {fmtDate(selected.dateMiseEnService)}
                  </p>
                </header>
                <dl className="liasse-dl">
                  <div>
                    <dt>Brute</dt>
                    <dd>{fmtFcfa(selected.valeurBrute)}</dd>
                  </div>
                  <div>
                    <dt>Résiduelle</dt>
                    <dd>{fmtFcfa(selected.valeurResiduelle)}</dd>
                  </div>
                  <div>
                    <dt>Cumul amorti</dt>
                    <dd>{fmtFcfa(immoCumul(selected))}</dd>
                  </div>
                  <div>
                    <dt>Nette</dt>
                    <dd>{fmtFcfa(immoNette(selected))}</dd>
                  </div>
                  <div>
                    <dt>Durée</dt>
                    <dd>
                      {selected.dureeMois} mois · reste{' '}
                      {Math.max(0, selected.dureeMois - selected.dotations.length)}
                    </dd>
                  </div>
                  <div>
                    <dt>Prochaine dotation</dt>
                    <dd>
                      {selected.statut !== 'EN_SERVICE'
                        ? '—'
                        : fmtFcfa(
                            previewDotation({
                              brute: Number(selected.valeurBrute),
                              residuelle: Number(selected.valeurResiduelle),
                              dureeMois: selected.dureeMois,
                              cumul: immoCumul(selected),
                              deja: selected.dotations.length,
                            }) ?? 0,
                          )}
                    </dd>
                  </div>
                </dl>
                <h4>Pièces de dotation</h4>
                {selected.dotations.length === 0 ? (
                  <p className="lead">Aucune pièce. Générez le mois ouvert ci-dessus.</p>
                ) : (
                  <ul className="immo-dotations">
                    {selected.dotations.map((d) => (
                      <li key={d.id}>
                        <span>{d.periode.code}</span>
                        <span>{fmtFcfa(d.montant)}</span>
                        <Link to="/finance/comptabilite?rapport=grand-livre">
                          {d.ecriture.numero}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite && selected.statut === 'EN_SERVICE' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Marquer cette fiche SORTI ? Les dotations s’arrêtent. La plus/moins-value de cession se saisit manuellement en OD.',
                        )
                      ) {
                        sortir.mutate(selected.id);
                      }
                    }}
                  >
                    Sortir du service
                  </button>
                )}
              </aside>
            )}
          </div>
        )}
      </section>
    </>
  );
}
