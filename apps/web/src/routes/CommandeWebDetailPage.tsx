import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import {
  LABEL_FULFILLMENT,
  LABEL_PSP,
  LABEL_REGLEMENT,
  LABEL_STATUT_CMD_WEB,
  ROLES_COMMANDES_WEB_ECRITURE,
  ROLES_CONVERSION_VENTE_WEB,
  aEncaisserAuRetrait,
  badgeStatutCmdWeb,
  bannerCommandeWeb,
  contactCommandeWeb,
  estClickCollect,
  etapesPourCommande,
  formatAdresseLivraison,
  fmtDateHeure,
  fmtFcfa,
  geoAdresseLivraison,
  indexEtapeActive,
  labelActionStatut,
  lienWhatsapp,
  nbArticles,
  nouvelleOperationId,
  peutConvertirVente,
  prochaineActionWorkflow,
  referenceCommandeWeb,
  transitionsMetier,
  type CommandeWebDetail,
} from '../lib/commandes-web-ui';

export default function CommandeWebDetailPage() {
  const { commandeId } = useParams<{ commandeId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [identiteOk, setIdentiteOk] = useState(false);
  const [articlesOk, setArticlesOk] = useState(false);
  const [qrOk, setQrOk] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);
  const [numeroSuivi, setNumeroSuivi] = useState('');

  const peutEcrire =
    user !== null && ROLES_COMMANDES_WEB_ECRITURE.includes(user.role);
  const peutConvertirRole =
    user !== null && ROLES_CONVERSION_VENTE_WEB.includes(user.role);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['commandes-web', commandeId],
    queryFn: () => apiFetch<CommandeWebDetail>(`/commandes-web/${commandeId}`),
    enabled: !!commandeId,
  });

  const statutMutation = useMutation({
    mutationFn: ({ statut, suivi }: { statut: string; suivi?: string }) =>
      apiFetch(`/commandes-web/${commandeId}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({
          statut,
          ...(suivi ? { numeroSuivi: suivi } : {}),
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commandes-web', commandeId] });
      void qc.invalidateQueries({ queryKey: ['commandes-web'] });
    },
  });

  const rembourser = useMutation({
    mutationFn: () =>
      apiFetch(`/commandes-web/${commandeId}/rembourser`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commandes-web', commandeId] });
      void qc.invalidateQueries({ queryKey: ['commandes-web'] });
    },
  });

  const convertir = useMutation({
    mutationFn: () =>
      apiFetch<{ venteId: string; commandeWebId: string }>(
        `/commandes-web/${commandeId}/convertir-vente`,
        {
          method: 'POST',
          body: JSON.stringify({ clientOperationId: nouvelleOperationId() }),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commandes-web', commandeId] });
      void qc.invalidateQueries({ queryKey: ['commandes-web'] });
    },
  });

  const remettreEtConvertir = useMutation({
    mutationFn: async () => {
      await apiFetch(`/commandes-web/${commandeId}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: 'REMISE' }),
      });
      return apiFetch<{ venteId: string }>(
        `/commandes-web/${commandeId}/convertir-vente`,
        {
          method: 'POST',
          body: JSON.stringify({ clientOperationId: nouvelleOperationId() }),
        },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commandes-web', commandeId] });
      void qc.invalidateQueries({ queryKey: ['commandes-web'] });
    },
  });

  async function copier(texte: string, cle: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(cle);
      window.setTimeout(() => setCopie(null), 1800);
    } catch {
      setCopie(null);
    }
  }

  if (isLoading) return <LoadingState label="Chargement de la commande…" />;
  if (isError || !data) {
    return (
      <div className="cmd-web-detail">
        <p>
          <Link to="/ventes/commandes-web">← File commandes web</Link>
        </p>
        <p role="alert">Commande introuvable ou accès refusé.</p>
      </div>
    );
  }

  const cmd = data;
  const contact = contactCommandeWeb(cmd);
  const clickCollect = estClickCollect(cmd);
  const etapes = etapesPourCommande(cmd);
  const etape = indexEtapeActive(cmd);
  const prochaine = prochaineActionWorkflow(cmd);
  const transitions = cmd.transitions ?? [];
  const metier = transitionsMetier(transitions);
  const annuler = transitions.includes('ANNULEE');
  const adresse = formatAdresseLivraison(cmd.adresseLivraisonJson);
  const geo = geoAdresseLivraison(cmd.adresseLivraisonJson);
  const wa = lienWhatsapp(contact.telephone);
  const checklistOk = identiteOk && articlesOk && qrOk;
  const peutRemettre = peutEcrire && transitions.includes('REMISE');
  const showConvert =
    peutConvertirRole && peutConvertirVente(cmd) && cmd.statut !== 'PRETE';
  const showRemettreEtVente = peutConvertirRole && peutRemettre && clickCollect;
  const banner = bannerCommandeWeb(cmd);
  const erreur =
    statutMutation.error ??
    rembourser.error ??
    convertir.error ??
    remettreEtConvertir.error;
  const telAdresse =
    typeof cmd.adresseLivraisonJson?.telephone === 'string'
      ? cmd.adresseLivraisonJson.telephone
      : null;

  function changerStatut(statut: string) {
    const suivi =
      statut === 'EXPEDIEE' ? numeroSuivi.trim() || undefined : undefined;
    const libelle = LABEL_STATUT_CMD_WEB[statut] ?? statut;
    if (
      window.confirm(
        `Passer la commande en « ${libelle} » ? Le client sera notifié par e-mail.`,
      )
    ) {
      statutMutation.mutate({ statut, suivi });
    }
  }

  function executerProchaine(opts?: { skipConfirm?: boolean }) {
    if (!prochaine || !peutEcrire) return;
    if (prochaine.convertirVente) {
      if (
        !opts?.skipConfirm &&
        !window.confirm('Créer la vente POS (session caisse ouverte) ?')
      ) {
        return;
      }
      if (cmd.statut === 'PRETE' && clickCollect) {
        if (!checklistOk) {
          window.alert(
            'Cochez les contrôles (identité, QR, articles) avant la remise.',
          );
          return;
        }
        remettreEtConvertir.mutate();
        return;
      }
      if (cmd.statut === 'PRETE') {
        changerStatut('REMISE');
        return;
      }
      convertir.mutate();
      return;
    }
    if (prochaine.statut === 'REMISE' && clickCollect && !checklistOk) {
      window.alert(
        'Cochez les contrôles (identité, QR, articles) avant la remise.',
      );
      return;
    }
    if (prochaine.statut) changerStatut(prochaine.statut);
  }

  function onClickEtape(targetIndex: number) {
    if (!peutEcrire) return;
    if (targetIndex === etape + 1) {
      executerProchaine();
    }
  }

  return (
    <div className="cmd-web-detail">
      <p className="cmd-web-back no-print">
        <Link to="/ventes/commandes-web">← File commandes web</Link>
      </p>

      <header className="client-workspace-hero">
        <div className="client-workspace-hero-main">
          <h1>Commande {referenceCommandeWeb(data.id)}</h1>
          <p className="client-workspace-hero-sub">
            {contact.nom}
            {contact.telephone ? ` · ${contact.telephone}` : ''}
            {contact.email ? ` · ${contact.email}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={badgeStatutCmdWeb(data.statut)}>
              {LABEL_STATUT_CMD_WEB[data.statut] ?? data.statut}
            </span>
            <span className="badge badge-info">
              {LABEL_FULFILLMENT[data.modeFulfillment] ?? data.modeFulfillment}
            </span>
            <span className="badge badge-neutral">
              {LABEL_REGLEMENT[data.modeReglement] ?? data.modeReglement}
            </span>
            {data.providerPsp && (
              <span className="badge badge-neutral">
                {LABEL_PSP[data.providerPsp] ?? data.providerPsp}
              </span>
            )}
            {data.conversionVente && (
              <span className="badge badge-ok">Vente POS créée</span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Créée</strong> {fmtDateHeure(data.createdAt)}
            </span>
            {data.payeeAt && (
              <span>
                <strong>Payée</strong> {fmtDateHeure(data.payeeAt)}
              </span>
            )}
            <span>
              <strong>Articles</strong> {nbArticles(data)}
            </span>
            <button
              type="button"
              className="btn-ghost fiche-client-copy"
              onClick={() => void copier(data.id, 'id')}
            >
              {copie === 'id' ? 'ID copié' : 'Copier l’ID'}
            </button>
          </div>
        </div>
        <div className="fiche-hero-stats">
          <div className="cmd-web-hero-montant">
            <span>Total TTC</span>
            <strong>{fmtFcfa(data.montantTotal)}</strong>
            {aEncaisserAuRetrait(data) && (
              <em>À encaisser au retrait</em>
            )}
          </div>
        </div>
      </header>

      <div className="cmd-web-toolbar no-print" role="toolbar" aria-label="Actions commande">
        {clickCollect && (
          <Link className="btn btn-primary" to="/ventes/commandes-web-scan">
            Scanner QR client
          </Link>
        )}
        {contact.telephone && (
          <a className="btn btn-secondary" href={`tel:${contact.telephone}`}>
            Appeler
          </a>
        )}
        {wa && (
          <a
            className="btn btn-secondary"
            href={wa}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
        {contact.email && (
          <a className="btn btn-secondary" href={`mailto:${contact.email}`}>
            E-mail
          </a>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => window.print()}
        >
          Imprimer
        </button>
      </div>

      {banner && (
        <div className={`cmd-web-banner cmd-web-banner-${banner.tone}`} role="status">
          <strong>{banner.title}</strong>
          <p>{banner.text}</p>
        </div>
      )}

      <ol className="cmd-web-stepper" aria-label="Workflow commande">
        {etapes.map((s, i) => {
          const fait = i < etape || (i === etape && Boolean(data.conversionVente));
          const actif = i === etape && !data.conversionVente;
          const prochain = i === etape + 1 && peutEcrire && Boolean(prochaine);
          const className = [
            fait ? 'fait' : '',
            actif ? 'actif' : '',
            prochain ? 'prochain' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={s.key} className={className || undefined}>
              {prochain ? (
                <button
                  type="button"
                  className="cmd-web-step-btn"
                  disabled={
                    statutMutation.isPending ||
                    convertir.isPending ||
                    remettreEtConvertir.isPending
                  }
                  onClick={() => onClickEtape(i)}
                  title={`Avancer vers « ${s.label} »`}
                >
                  <span>{i + 1}</span>
                  {s.label}
                </button>
              ) : (
                <>
                  <span>{fait && !actif ? '✓' : i + 1}</span>
                  {s.label}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {peutEcrire && prochaine && (
        <div className="cmd-web-next-cta no-print">
          <div>
            <strong>Prochaine étape : {prochaine.etapeLabel}</strong>
            <p className="muted">
              {prochaine.label}
              {prochaine.statut === 'REMISE' && clickCollect && !checklistOk
                ? ' — cochez d’abord les contrôles ci-dessous.'
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              statutMutation.isPending ||
              convertir.isPending ||
              remettreEtConvertir.isPending ||
              (prochaine.statut === 'REMISE' &&
                clickCollect &&
                !checklistOk) ||
              (prochaine.convertirVente &&
                data.statut === 'PRETE' &&
                clickCollect &&
                !checklistOk)
            }
            onClick={() => executerProchaine()}
          >
            {statutMutation.isPending ||
            convertir.isPending ||
            remettreEtConvertir.isPending
              ? 'Traitement…'
              : prochaine.label}
          </button>
        </div>
      )}

      <div className="cmd-web-grid">
        <ListPanel title={clickCollect ? 'Client & magasin de retrait' : 'Client & livraison'}>
          <dl className="cmd-web-dl">
            <div>
              <dt>Client</dt>
              <dd>
                {data.client ? (
                  <Link to={`/crm/clients/${data.client.id}`}>{contact.nom}</Link>
                ) : (
                  contact.nom
                )}
              </dd>
            </div>
            {contact.telephone && (
              <div>
                <dt>Téléphone</dt>
                <dd>
                  <a href={`tel:${contact.telephone}`}>{contact.telephone}</a>{' '}
                  <button
                    type="button"
                    className="btn-ghost fiche-client-copy"
                    onClick={() => void copier(contact.telephone!, 'tel')}
                  >
                    {copie === 'tel' ? 'Copié' : 'Copier'}
                  </button>
                </dd>
              </div>
            )}
            {contact.email && (
              <div>
                <dt>E-mail</dt>
                <dd>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </dd>
              </div>
            )}
            {data.boutiqueRetrait && (
              <div>
                <dt>Retrait</dt>
                <dd>
                  {data.boutiqueRetrait.nom}
                  <br />
                  <span className="muted">{data.boutiqueRetrait.adresse}</span>
                  {data.boutiqueRetrait.delaiRetraitHeures ? (
                    <>
                      <br />
                      <span className="muted">
                        Délai annoncé : {data.boutiqueRetrait.delaiRetraitHeures} h
                      </span>
                    </>
                  ) : null}
                </dd>
              </div>
            )}
            {data.zoneLivraison && (
              <div>
                <dt>Zone</dt>
                <dd>{data.zoneLivraison.libelle}</dd>
              </div>
            )}
            {adresse && (
              <div>
                <dt>Adresse</dt>
                <dd>
                  {adresse}
                  {telAdresse && telAdresse !== contact.telephone ? (
                    <>
                      <br />
                      <span className="muted">Tél. livraison : {telAdresse}</span>
                    </>
                  ) : null}
                </dd>
              </div>
            )}
            {data.numeroSuivi && (
              <div>
                <dt>N° suivi</dt>
                <dd>{data.numeroSuivi}</dd>
              </div>
            )}
            {data.entrepot && (
              <div>
                <dt>Entrepôt</dt>
                <dd>
                  {data.entrepot.nom} ({data.entrepot.code})
                </dd>
              </div>
            )}
            {data.noteClient && (
              <div>
                <dt>Note client</dt>
                <dd>{data.noteClient}</dd>
              </div>
            )}
            {data.expireAt && data.statut === 'EN_ATTENTE_PAIEMENT' && (
              <div>
                <dt>Expire</dt>
                <dd>{fmtDateHeure(data.expireAt)}</dd>
              </div>
            )}
          </dl>
          {geo && (
            <div className="cmd-web-map">
              <iframe
                title="Carte de livraison"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${geo.lng - 0.012}%2C${geo.lat - 0.008}%2C${geo.lng + 0.012}%2C${geo.lat + 0.008}&layer=mapnik&marker=${geo.lat}%2C${geo.lng}`}
              />
              <a
                href={`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=16/${geo.lat}/${geo.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir la carte
              </a>
            </div>
          )}
        </ListPanel>

        <ListPanel title={`Articles (${nbArticles(data)})`}>
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="num">Qté</th>
                  <th className="num">P.U. TTC</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.lignes ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.designationSnapshot}
                      {l.referenceSnapshot ? (
                        <div className="muted">{l.referenceSnapshot}</div>
                      ) : null}
                    </td>
                    <td className="num">{l.quantite}</td>
                    <td className="num">{fmtFcfa(l.prixUnitaireTtc)}</td>
                    <td className="num money">
                      {fmtFcfa(Number(l.prixUnitaireTtc) * l.quantite)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="cmd-web-dl" style={{ marginTop: '1rem' }}>
            {data.montantArticlesHt != null && (
              <div>
                <dt>Articles HT</dt>
                <dd>{fmtFcfa(data.montantArticlesHt)}</dd>
              </div>
            )}
            {data.montantTva != null && Number(data.montantTva) > 0 && (
              <div>
                <dt>TVA</dt>
                <dd>{fmtFcfa(data.montantTva)}</dd>
              </div>
            )}
            {data.fraisLivraison != null && Number(data.fraisLivraison) > 0 && (
              <div>
                <dt>Frais livraison</dt>
                <dd>{fmtFcfa(data.fraisLivraison)}</dd>
              </div>
            )}
            {data.remiseFidelite != null && Number(data.remiseFidelite) > 0 && (
              <div>
                <dt>Remise fidélité</dt>
                <dd>− {fmtFcfa(data.remiseFidelite)}</dd>
              </div>
            )}
            <div>
              <dt>Total TTC</dt>
              <dd>
                <strong>{fmtFcfa(data.montantTotal)}</strong>
              </dd>
            </div>
          </dl>
          {(data.paiements ?? []).length > 0 && (
            <>
              <h3>Paiements</h3>
              <ul>
                {data.paiements!.map((p, i) => (
                  <li key={i}>
                    {LABEL_PSP[p.provider] ?? p.provider} · {p.type} · {p.statut}
                    {p.montant ? ` · ${fmtFcfa(p.montant)}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.conversionVente && (
            <p>
              <span className="badge badge-ok">Vente POS</span>{' '}
              {data.conversionVente.venteId.slice(0, 8).toUpperCase()}
              {data.conversionVente.createdAt
                ? ` · ${fmtDateHeure(data.conversionVente.createdAt)}`
                : ''}
            </p>
          )}
        </ListPanel>

        <ListPanel
          title={
            clickCollect ? 'Traitement click & collect' : 'Traitement livraison'
          }
        >
          {clickCollect && data.suiviToken && (
            <div className="cmd-web-token no-print">
              <p>
                <strong>Token QR client</strong>
              </p>
              <code>{data.suiviToken}</code>
              <div className="table-actions" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copier(data.suiviToken!, 'qr')}
                >
                  {copie === 'qr' ? 'Copié' : 'Copier le token'}
                </button>
                <Link className="btn btn-ghost" to="/ventes/commandes-web-scan">
                  Ouvrir le scan POS
                </Link>
              </div>
            </div>
          )}

          {clickCollect && peutRemettre && (
            <fieldset className="cmd-web-checklist no-print">
              <legend>Contrôles avant remise</legend>
              <label>
                <input
                  type="checkbox"
                  checked={identiteOk}
                  onChange={(e) => setIdentiteOk(e.target.checked)}
                />{' '}
                Identité du client vérifiée (nom / téléphone)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={qrOk}
                  onChange={(e) => setQrOk(e.target.checked)}
                />{' '}
                QR / token de suivi concordant
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={articlesOk}
                  onChange={(e) => setArticlesOk(e.target.checked)}
                />{' '}
                Articles complets ({nbArticles(data)} pièce
                {nbArticles(data) > 1 ? 's' : ''})
              </label>
              {aEncaisserAuRetrait(data) && (
                <p className="muted">
                  Encaisser {fmtFcfa(data.montantTotal)} — session caisse ouverte
                  requise pour créer la vente.
                </p>
              )}
            </fieldset>
          )}

          {peutEcrire && transitions.includes('EXPEDIEE') && (
            <div className="no-print" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="cmd-web-suivi">N° de suivi (optionnel)</label>
              <input
                id="cmd-web-suivi"
                value={numeroSuivi}
                onChange={(e) => setNumeroSuivi(e.target.value)}
                placeholder={data.numeroSuivi || 'Référence interne / convoyeur'}
              />
            </div>
          )}

          <p className="muted no-print">
            {data.statut === 'EN_ATTENTE_PAIEMENT'
              ? 'Le paiement PSP passe automatiquement en « payée » via le webhook. N’utilisez la confirmation manuelle que si le client a déjà été débité.'
              : 'Chaque transition notifie le client par e-mail. Remise / livraison : fidélité + avis.'}
          </p>

          <div className="table-actions no-print" style={{ marginTop: '1rem' }}>
            {peutEcrire &&
              metier
                .filter((s) => !(showRemettreEtVente && s === 'REMISE'))
                .map((s) => {
                  const secondaire =
                    s === 'PAYEE' && data.statut === 'EN_ATTENTE_PAIEMENT';
                  return (
                    <button
                      key={s}
                      type="button"
                      className={
                        secondaire
                          ? 'btn btn-ghost'
                          : s === 'PRETE' ||
                              s === 'REMISE' ||
                              s === 'EXPEDIEE' ||
                              s === 'LIVREE' ||
                              s === 'PREPARATION'
                            ? 'btn btn-primary'
                            : 'btn'
                      }
                      disabled={
                        statutMutation.isPending ||
                        (s === 'REMISE' && clickCollect && !checklistOk)
                      }
                      onClick={() => changerStatut(s)}
                    >
                      {labelActionStatut(data.statut, s)}
                    </button>
                  );
                })}

            {showRemettreEtVente && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !checklistOk ||
                  remettreEtConvertir.isPending ||
                  convertir.isPending
                }
                onClick={() => {
                  if (
                    window.confirm(
                      aEncaisserAuRetrait(data)
                        ? `Remettre et créer la vente POS de ${fmtFcfa(data.montantTotal)} ?`
                        : 'Remettre au client et enregistrer la vente POS ?',
                    )
                  ) {
                    remettreEtConvertir.mutate();
                  }
                }}
              >
                {remettreEtConvertir.isPending
                  ? 'Traitement…'
                  : aEncaisserAuRetrait(data)
                    ? 'Remettre et encaisser (vente POS)'
                    : 'Remettre et créer la vente POS'}
              </button>
            )}

            {showConvert && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={convertir.isPending}
                onClick={() => {
                  if (window.confirm('Créer la vente POS (session caisse ouverte) ?')) {
                    convertir.mutate();
                  }
                }}
              >
                {convertir.isPending ? 'Conversion…' : 'Convertir en vente POS'}
              </button>
            )}

            {peutEcrire &&
              data.statut !== 'REMBOURSEE' &&
              data.modeReglement === 'PREPAYE_PSP' &&
              data.statut !== 'EN_ATTENTE_PAIEMENT' && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={rembourser.isPending}
                  onClick={() => {
                    if (window.confirm('Confirmer le remboursement PSP ?')) {
                      rembourser.mutate();
                    }
                  }}
                >
                  Rembourser
                </button>
              )}

            {peutEcrire && annuler && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={statutMutation.isPending}
                onClick={() => changerStatut('ANNULEE')}
              >
                Annuler la commande
              </button>
            )}
          </div>

          {convertir.isSuccess && convertir.data && (
            <p className="cmd-web-ok">
              Vente POS créée ({convertir.data.venteId.slice(0, 8).toUpperCase()}).
            </p>
          )}
          {remettreEtConvertir.isSuccess && remettreEtConvertir.data && (
            <p className="cmd-web-ok">
              Remise enregistrée — vente POS{' '}
              {remettreEtConvertir.data.venteId.slice(0, 8).toUpperCase()}.
            </p>
          )}
          {erreur && (
            <p role="alert" className="cmd-web-err">
              {messageDepuisApi(
                erreur,
                'Action refusée (transition, session caisse ou droits).',
              )}
            </p>
          )}
        </ListPanel>
      </div>
    </div>
  );
}
