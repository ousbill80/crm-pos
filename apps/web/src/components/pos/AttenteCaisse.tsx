import { useEffect } from 'react';
import { Pause, Printer, X } from 'lucide-react';
import { InfoTooltip } from '../InfoTooltip';
import { insightCommandeEnAttente } from '../../lib/insights/pos';
import {
  MOTIFS_ATTENTE,
  formatDureeAttente,
  formatNumeroAttente,
  holdsFifo,
  labelMotif,
  montantHold,
  nbArticlesHold,
  type CommandeEnAttente,
  type MotifAttente,
} from '../../lib/offline/pos-holds';
import type { ClientDto } from '../../lib/types';

function formatMontant(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR');
}

export function nomClientPos(client: ClientDto | null | undefined): string {
  if (!client) return '';
  return `${client.prenom ?? ''} ${client.nom}`.trim();
}

export function PosNotice({
  message,
  onFermer,
}: {
  message: string;
  onFermer: () => void;
}) {
  return (
    <div className="pos-modal-backdrop" onClick={onFermer} role="presentation">
      <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h2>Caisse</h2>
        <p>{message}</p>
        <div className="pos-receipt-actions">
          <button type="button" className="pos-btn-primary" onClick={onFermer}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function PosConfirm({
  titre,
  message,
  confirmer,
  danger,
  onConfirmer,
  onAnnuler,
}: {
  titre: string;
  message: string;
  confirmer: string;
  danger?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <div className="pos-modal-backdrop" onClick={onAnnuler} role="presentation">
      <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h2>{titre}</h2>
        <p>{message}</p>
        <div className="pos-receipt-actions">
          <button type="button" onClick={onAnnuler}>
            Annuler
          </button>
          <button
            type="button"
            className={danger ? 'pos-btn-danger' : 'pos-btn-primary'}
            data-testid="pos-confirm-ok"
            onClick={onConfirmer}
          >
            {confirmer}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ParkDialog({
  nbArticles,
  montant,
  libelle,
  motif,
  imprimerCoupon,
  onLibelle,
  onMotif,
  onImprimerCoupon,
  onConfirmer,
  onAnnuler,
}: {
  nbArticles: number;
  montant: number;
  libelle: string;
  motif: MotifAttente;
  imprimerCoupon: boolean;
  onLibelle: (v: string) => void;
  onMotif: (m: MotifAttente) => void;
  onImprimerCoupon: (v: boolean) => void;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <div
      className="pos-modal-backdrop"
      data-testid="pos-park-dialog"
      onClick={onAnnuler}
      role="presentation"
    >
      <div
        className="pos-modal pos-modal-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="park-title"
      >
        <h2 id="park-title">Mettre en attente</h2>
        <p className="pos-park-recap">
          {nbArticles} article(s) · {formatMontant(montant)} FCFA
          <InfoTooltip insight={insightCommandeEnAttente(1)} />
        </p>
        <p className="pos-park-hint">
          Le client suivant passe. Rien n’est encaissé. Donnez un nom pour
          retrouver le ticket dans la file.
        </p>
        <div className="pos-park-motifs" role="group" aria-label="Motif">
          {MOTIFS_ATTENTE.map((m) => (
            <button
              key={m.id}
              type="button"
              className={motif === m.id ? 'is-active' : undefined}
              onClick={() => onMotif(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label htmlFor="park-libelle">Nom ou rappel (afficheur file)</label>
        <input
          id="park-libelle"
          value={libelle}
          onChange={(e) => onLibelle(e.target.value)}
          placeholder="Ex. Mme Diallo, oubli CB…"
          autoComplete="off"
          autoFocus
        />
        <label className="pos-park-print">
          <input
            type="checkbox"
            data-testid="pos-park-print"
            checked={imprimerCoupon}
            onChange={(e) => onImprimerCoupon(e.target.checked)}
          />
          Imprimer un coupon de reprise pour le client
        </label>
        <div className="pos-receipt-actions">
          <button type="button" onClick={onAnnuler}>
            Annuler
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            data-testid="pos-park-confirm"
            onClick={onConfirmer}
          >
            <Pause size={16} />
            Parquer et client suivant
          </button>
        </div>
      </div>
    </div>
  );
}

export function FileAttenteCaisse({
  holds,
  clients,
  now,
  onReprendre,
  onAbandonner,
  onImprimer,
  onFermer,
}: {
  holds: CommandeEnAttente[];
  clients: ClientDto[];
  now: number;
  onReprendre: (id: string) => void;
  onAbandonner: (id: string) => void;
  onImprimer: (id: string) => void;
  onFermer: () => void;
}) {
  const file = holdsFifo(holds);

  return (
    <div
      className="pos-modal-backdrop"
      data-testid="pos-file-dialog"
      onClick={onFermer}
      role="presentation"
    >
      <div
        className="pos-modal pos-modal-wide pos-file-attente"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="file-title"
      >
        <div className="pos-file-head">
          <h2 id="file-title">
            File d’attente
            <InfoTooltip insight={insightCommandeEnAttente(holds.length)} />
          </h2>
          <button type="button" onClick={onFermer} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        {file.length === 0 ? (
          <p className="pos-empty">Aucun ticket parqué.</p>
        ) : (
          <ul className="pos-file-list">
            {file.map((h) => {
              const client = clients.find((c) => c.id === h.clientId) ?? null;
              const nom = h.libelle || nomClientPos(client) || `N° ${formatNumeroAttente(h.numero)}`;
              const extra = h.panier
                .slice(0, 3)
                .map((l) => `${l.designation} ×${l.quantite}`)
                .join(' · ');
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    className="pos-file-card"
                    data-testid={`pos-file-reprendre-${h.numero}`}
                    onClick={() => onReprendre(h.id)}
                  >
                    <span className="pos-file-num">{formatNumeroAttente(h.numero)}</span>
                    <span className="pos-file-body">
                      <strong>{nom}</strong>
                      <small>
                        {labelMotif(h.motif)} · {nbArticlesHold(h.panier)} art. ·{' '}
                        {formatDureeAttente(h.createdAt, now)}
                      </small>
                      {extra && <small className="pos-file-items">{extra}</small>}
                    </span>
                    <span className="money">{formatMontant(montantHold(h.panier))}</span>
                  </button>
                  <div className="pos-file-actions">
                    <button type="button" onClick={() => onImprimer(h.id)} title="Coupon de reprise">
                      <Printer size={16} />
                    </button>
                    <button
                      type="button"
                      className="pos-hold-drop"
                      data-testid={`pos-file-abandon-${h.numero}`}
                      onClick={() => onAbandonner(h.id)}
                      aria-label={`Abandonner n° ${formatNumeroAttente(h.numero)}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="pos-file-foot">Toucher une carte pour reprendre — plus ancien en haut.</p>
      </div>
    </div>
  );
}

export function CouponAttente({
  hold,
  boutiqueNom,
  client,
  onSuite,
}: {
  hold: CommandeEnAttente;
  boutiqueNom?: string;
  client: ClientDto | null;
  onSuite: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="pos-receipt">
      <div className="pos-receipt-card ticket pos-coupon-attente">
        <div className="pos-receipt-brand">CaissePOS</div>
        {boutiqueNom && <p className="pos-receipt-shop">{boutiqueNom}</p>}
        <p className="pos-coupon-kicker">Coupon de reprise — ce n’est pas un ticket de caisse</p>
        <h2>N° {formatNumeroAttente(hold.numero)}</h2>
        <p className="pos-receipt-meta">
          {new Date(hold.createdAt).toLocaleString('fr-FR')}
        </p>
        <p className="pos-coupon-name">
          {hold.libelle || nomClientPos(client) || 'Client'}
        </p>
        <p className="pos-receipt-meta">{labelMotif(hold.motif)}</p>
        <ul>
          {hold.panier.map((l) => (
            <li key={l.produitId}>
              <span>
                {l.designation} ×{l.quantite}
              </span>
              <span className="money">
                {formatMontant(Number(l.prixUnitaire) * l.quantite - l.remise)}
              </span>
            </li>
          ))}
        </ul>
        <p className="pos-receipt-total money">
          {formatMontant(montantHold(hold.panier))} FCFA
        </p>
        <p className="pos-coupon-note">
          Présentez ce coupon à la même caisse. Aucun paiement n’a été enregistré.
        </p>
        <div className="pos-receipt-actions no-print">
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimer
          </button>
          <button type="button" className="pos-btn-primary" onClick={onSuite}>
            Client suivant
          </button>
        </div>
      </div>
    </div>
  );
}

export function RailAttente({
  holds,
  now,
  onOuvrirFile,
  onReprendre,
}: {
  holds: CommandeEnAttente[];
  now: number;
  onOuvrirFile: () => void;
  onReprendre: (id: string) => void;
}) {
  if (holds.length === 0) return null;
  const file = holdsFifo(holds);
  const visibles = file.slice(0, 3);
  const reste = file.length - visibles.length;

  return (
    <div className="pos-holds-rail">
      {visibles.map((h) => (
        <button
          key={h.id}
          type="button"
          className="pos-hold-chip"
          onClick={() => onReprendre(h.id)}
          title={`Reprendre n° ${formatNumeroAttente(h.numero)}`}
        >
          <span className="pos-file-num pos-file-num-sm">
            {formatNumeroAttente(h.numero)}
          </span>
          <span>
            {h.libelle}
            <small>
              {formatMontant(montantHold(h.panier))} · {formatDureeAttente(h.createdAt, now)}
            </small>
          </span>
        </button>
      ))}
      <button type="button" className="pos-hold-more" onClick={onOuvrirFile}>
        {reste > 0 ? `+${reste} · file` : 'File'}
      </button>
    </div>
  );
}
