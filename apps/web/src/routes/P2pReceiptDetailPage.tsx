import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Boxes, CircleDollarSign, FilePlus2, PackageX, ShieldCheck } from 'lucide-react';
import { apiDownload, apiFetch, messageDepuisApi } from '../lib/api';
import { fmtDateHeure, fmtFcfa } from '../lib/achats-ui';
import { hasP2pRole, operationId, p2pApi, type P2pEvidence } from '../lib/p2p';
import type { EntrepotDto } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';

type Dialog = 'qualite' | 'cout' | 'putaway' | 'retour' | 'facture' | null;

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function P2pReceiptDetailPage() {
  const { receptionId } = useParams<{ receptionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const reception = useQuery({
    queryKey: ['p2p-receptions', receptionId],
    queryFn: () => p2pApi.reception(receptionId!),
    enabled: Boolean(receptionId),
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: dialog === 'putaway' || dialog === 'retour',
  });

  function done() {
    setDialog(null);
    setErreur(null);
    void client.invalidateQueries({ queryKey: ['p2p-receptions'] });
  }
  function failed(error: unknown) { setErreur(messageDepuisApi(error, 'Action refusée.')); }

  if (!receptionId) return <p role="alert">Réception introuvable.</p>;
  if (reception.isLoading) return <LoadingState label="Chargement de la réception…" />;
  if (reception.isError || !reception.data) return <p role="alert">Impossible de charger cette réception.</p>;
  const r = reception.data;
  const accepted = r.lignes.filter((l) => (l.decisionQualite?.quantiteAcceptee ?? 0) > 0);
  const peutFacturerP2p =
    hasP2pRole(user?.role, 'rapprochement') &&
    r.statut === 'MISE_EN_STOCK' &&
    accepted.length > 0;
  return (
    <div className="client-workspace p2p-module">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/receptions')}>← Réceptions</button>
        <div className="client-workspace-toolbar-actions">
          <Link to={`/achats/commandes/${r.commande.id}`}>Commande {r.commande.numero}</Link>
          {r.statut === 'QUANTITATIVE' && hasP2pRole(user?.role, 'qualite') && <button className="btn-primary" type="button" onClick={() => setDialog('qualite')}>Décider la qualité</button>}
          {r.statut === 'QUALITE_VALIDEE' && hasP2pRole(user?.role, 'logistique') && <button type="button" onClick={() => setDialog('cout')}>Allouer un coût</button>}
          {r.statut === 'QUALITE_VALIDEE' && hasP2pRole(user?.role, 'qualite') && <button className="btn-primary" type="button" onClick={() => setDialog('putaway')}>Mettre en stock</button>}
          {r.decisionQualite && hasP2pRole(user?.role, 'qualite') && <button type="button" onClick={() => setDialog('retour')}>Préparer un retour</button>}
          {peutFacturerP2p && (
            <button className="btn-primary" type="button" onClick={() => setDialog('facture')}>
              <FilePlus2 size={14} aria-hidden /> Facturer (3 voies)
            </button>
          )}
        </div>
      </div>
      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>REC</div>
        <div className="client-workspace-hero-main">
          <h1>{r.numero}</h1>
          <p>{r.fournisseur.nom} · {fmtDateHeure(r.dateReception)}</p>
          <div className="client-workspace-chips">
            <span className={r.statut === 'MISE_EN_STOCK' ? 'badge badge-ok' : 'badge badge-warning'}>{r.statut.replaceAll('_', ' ')}</span>
            <span className="badge">Quarantaine {r.emplacementQuarantaine.code}</span>
          </div>
        </div>
      </header>

      <section className="kpi-grid dash-kpi-grid">
        <article className="kpi-card dash-kpi"><ShieldCheck size={16} /><div className="kpi-label">Contrôle</div><div className="kpi-value">{r.decisionQualite ? 'Fait' : 'À faire'}</div><div className="kpi-hint">Opérateur distinct du réceptionnaire</div></article>
        <article className="kpi-card dash-kpi"><CircleDollarSign size={16} /><div className="kpi-label">Charges allouées</div><div className="kpi-value">{fmtFcfa(r.charges.reduce((sum, c) => sum + Number(c.montant), 0))}</div><div className="kpi-hint">{r.charges.length} charge(s)</div></article>
        <article className="kpi-card dash-kpi"><Boxes size={16} /><div className="kpi-label">Putaway</div><div className="kpi-value">{r.miseEnStock ? 'Fait' : 'En attente'}</div><div className="kpi-hint">Stock physique après qualité</div></article>
        <article className="kpi-card dash-kpi"><PackageX size={16} /><div className="kpi-label">Retours</div><div className="kpi-value">{r.retours.length}</div><div className="kpi-hint">Avoirs attendus tracés</div></article>
      </section>

      <section className="panel p2p-section">
        <h2>Lignes réceptionnées</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Produit</th><th>Commandé</th><th>Reçu</th><th>Accepté</th><th>Rejeté</th><th>Écart / motif</th></tr></thead>
          <tbody>{r.lignes.map((line) => <tr key={line.id}>
            <td><strong>{line.produit.designation}</strong><small>{line.produit.reference ?? 'Sans référence'}</small></td>
            <td>{line.quantiteCommandee}</td><td>{line.quantiteRecue}</td><td>{line.decisionQualite?.quantiteAcceptee ?? '—'}</td><td>{line.decisionQualite?.quantiteRejetee ?? '—'}</td>
            <td>{line.decisionQualite?.motifRejet ?? line.motifEcart ?? '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="p2p-two-columns">
        <EvidencePanel
          receiptId={r.id}
          proofs={r.preuves}
          canUpload={hasP2pRole(user?.role, 'evidenceEcriture')}
          onUploaded={done}
        />
        <article className="panel"><h2>Coûts, mise en stock & retours</h2>
          <ul className="p2p-event-list">
            {r.charges.map((c) => <li key={c.id}><strong>{c.libelle}</strong><span>{fmtFcfa(c.montant)} · {c.methode}</span></li>)}
            {r.miseEnStock && <li><strong>Mise en stock</strong><span>{r.miseEnStock.lignes.length} ligne(s)</span></li>}
            {r.retours.map((retour) => <li key={retour.id}><strong>{retour.numero}</strong><span>{retour.statut} · {retour.motif}</span></li>)}
          </ul>
          {peutFacturerP2p && (
            <p className="lead" style={{ marginTop: '1rem' }}>
              Qualité et putaway terminés — vous pouvez émettre une facture avec match trois voies (BC · réception · qualité).
            </p>
          )}
        </article>
      </section>

      {dialog === 'qualite' && <QualityModal receipt={r} onClose={() => setDialog(null)} onDone={done} onError={failed} error={erreur} />}
      {dialog === 'cout' && <CostModal id={r.id} onClose={() => setDialog(null)} onDone={done} onError={failed} error={erreur} />}
      {dialog === 'putaway' && <PutawayModal id={r.id} lines={accepted} entrepots={(entrepots.data ?? []).filter((e) => e.usage === 'STOCK' && !e.virtuel)} onClose={() => setDialog(null)} onDone={done} onError={failed} error={erreur} />}
      {dialog === 'retour' && <ReturnModal id={r.id} lines={r.lignes.filter((l) => l.decisionQualite)} entrepots={entrepots.data ?? []} onClose={() => setDialog(null)} onDone={done} onError={failed} error={erreur} />}
      {dialog === 'facture' && (
        <InvoiceP2pModal
          receipt={r}
          onClose={() => setDialog(null)}
          onError={failed}
          error={erreur}
          onCreated={(factureId) => {
            done();
            void client.invalidateQueries({ queryKey: ['achats-factures'] });
            navigate(`/achats/factures/${factureId}`);
          }}
        />
      )}
    </div>
  );
}

type ModalBase = { onClose: () => void; onDone: () => void; onError: (error: unknown) => void; error: string | null };

function EvidencePanel({
  receiptId,
  proofs,
  canUpload,
  onUploaded,
}: {
  receiptId: string;
  proofs: Awaited<ReturnType<typeof p2pApi.reception>>['preuves'];
  canUpload: boolean;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<'RECEIPT' | 'QUALITY'>('RECEIPT');
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Array<P2pEvidence & { fileName: string }>>([]);
  const upload = useMutation({
    mutationFn: () => p2pApi.uploadEvidence(type, receiptId, file!),
    onSuccess: (evidence) => {
      setUploaded((current) => [...current, { ...evidence, fileName: file?.name ?? `preuve-${evidence.id}` }]);
      setFile(null);
      setError(null);
      onUploaded();
    },
    onError: (reason) => setError(messageDepuisApi(reason, 'Téléversement refusé.')),
  });
  async function download(id: string, name: string) {
    try {
      await apiDownload(`/achats/evidences/${id}/download`, name);
    } catch (reason) {
      setError(messageDepuisApi(reason, 'Téléchargement refusé.'));
    }
  }
  return <article className="panel">
    <h2>Preuves & traçabilité</h2>
    {proofs.length === 0 && uploaded.length === 0 ? <p className="lead">Aucune preuve jointe.</p> : <ul>
      {proofs.map((proof) => <li key={proof.id}><a href={proof.uri} target="_blank" rel="noreferrer">{proof.nomFichier}</a> · {proof.type}</li>)}
      {uploaded.map((proof) => <li key={proof.id}><button type="button" className="btn-link" onClick={() => void download(proof.id, proof.fileName)}>Télécharger {proof.fileName}</button> · {proof.type} · empreinte {proof.empreinteSha256.slice(0, 12)}…</li>)}
    </ul>}
    {canUpload && <form onSubmit={(event) => { event.preventDefault(); upload.mutate(); }}>
      <label>Nature de la preuve<select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="RECEIPT">Réception</option><option value="QUALITY">Qualité</option></select></label>
      <label>Fichier<input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={!file || upload.isPending}>{upload.isPending ? 'Téléversement…' : 'Joindre la preuve'}</button>
    </form>}
  </article>;
}

function QualityModal({ receipt, ...base }: ModalBase & { receipt: Awaited<ReturnType<typeof p2pApi.reception>> }) {
  const [values, setValues] = useState(() => Object.fromEntries(receipt.lignes.map((l) => [l.id, { accepted: l.quantiteRecue, rejected: 0, reason: '' }])));
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/achats/receptions/${receipt.id}/qualite`, { method: 'POST', body: JSON.stringify({ clientOperationId: operationId(), lignes: receipt.lignes.map((l) => ({ ligneReceptionId: l.id, quantiteAcceptee: values[l.id].accepted, quantiteRejetee: values[l.id].rejected, motifRejet: values[l.id].reason || undefined })) }) }),
    onSuccess: base.onDone, onError: base.onError,
  });
  return <Modal open title="Décision qualité" size="lg" onClose={base.onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
    <div className="table-wrap"><table><thead><tr><th>Produit</th><th>Reçu</th><th>Accepté</th><th>Rejeté</th><th>Motif rejet</th></tr></thead><tbody>{receipt.lignes.map((l) => <tr key={l.id}><td>{l.produit.designation}</td><td>{l.quantiteRecue}</td><td><input aria-label={`Accepté ${l.produit.designation}`} type="number" min="0" max={l.quantiteRecue} value={values[l.id].accepted} onChange={(e) => { const accepted = Number(e.target.value); setValues((v) => ({ ...v, [l.id]: { ...v[l.id], accepted, rejected: l.quantiteRecue - accepted } })); }} /></td><td>{values[l.id].rejected}</td><td><input aria-label={`Motif ${l.produit.designation}`} value={values[l.id].reason} onChange={(e) => setValues((v) => ({ ...v, [l.id]: { ...v[l.id], reason: e.target.value } }))} required={values[l.id].rejected > 0} /></td></tr>)}</tbody></table></div>
    {base.error && <p role="alert">{base.error}</p>}<Actions pending={mutation.isPending} onClose={base.onClose} />
  </form></Modal>;
}

function CostModal({ id, ...base }: ModalBase & { id: string }) {
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState('VALEUR');
  const mutation = useMutation({ mutationFn: () => apiFetch(`/achats/receptions/${id}/couts`, { method: 'POST', body: JSON.stringify({ clientOperationId: operationId(), libelle, montant: Number(montant), methode }) }), onSuccess: base.onDone, onError: base.onError });
  return <Modal open title="Allouer un coût réel" onClose={base.onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}><label>Libellé<input value={libelle} onChange={(e) => setLibelle(e.target.value)} required /></label><label>Montant<input type="number" min="0" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} required /></label><label>Méthode<select value={methode} onChange={(e) => setMethode(e.target.value)}><option value="VALEUR">Valeur</option><option value="QUANTITE">Quantité</option></select></label>{base.error && <p role="alert">{base.error}</p>}<Actions pending={mutation.isPending} onClose={base.onClose} /></form></Modal>;
}

function PutawayModal({ id, lines, entrepots, ...base }: ModalBase & { id: string; lines: Array<{ decisionQualite: { id: string } | null; produit: { designation: string } }>; entrepots: EntrepotDto[] }) {
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const mutation = useMutation({ mutationFn: () => apiFetch(`/achats/receptions/${id}/putaway`, { method: 'POST', body: JSON.stringify({ clientOperationId: operationId(), lignes: lines.map((l) => ({ ligneQualiteId: l.decisionQualite!.id, destinationId: destinations[l.decisionQualite!.id] })) }) }), onSuccess: base.onDone, onError: base.onError });
  return <Modal open title="Mise en stock physique" onClose={base.onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>{lines.map((l) => <label key={l.decisionQualite!.id}>{l.produit.designation}<select required value={destinations[l.decisionQualite!.id] ?? ''} onChange={(e) => setDestinations((d) => ({ ...d, [l.decisionQualite!.id]: e.target.value }))}><option value="">Destination STOCK…</option>{entrepots.map((entrepot) => <option key={entrepot.id} value={entrepot.id}>{entrepot.code} — {entrepot.nom}</option>)}</select></label>)}{base.error && <p role="alert">{base.error}</p>}<Actions pending={mutation.isPending} onClose={base.onClose} /></form></Modal>;
}

function ReturnModal({ id, lines, entrepots, ...base }: ModalBase & { id: string; lines: Array<{ decisionQualite: { id: string; quantiteRejetee: number } | null; produit: { designation: string } }>; entrepots: EntrepotDto[] }) {
  const eligible = lines.filter((l) => (l.decisionQualite?.quantiteRejetee ?? 0) > 0);
  const [motif, setMotif] = useState('');
  const [sourceId, setSourceId] = useState('');
  const mutation = useMutation({ mutationFn: () => apiFetch(`/achats/receptions/${id}/retours`, { method: 'POST', body: JSON.stringify({ clientOperationId: operationId(), motif, avoirAttendu: true, lignes: eligible.map((l) => ({ ligneQualiteId: l.decisionQualite!.id, quantite: l.decisionQualite!.quantiteRejetee, depuisStock: false, sourceId })) }) }), onSuccess: base.onDone, onError: base.onError });
  return <Modal open title="Préparer un retour fournisseur" onClose={base.onClose}><form onSubmit={(e: FormEvent) => { e.preventDefault(); mutation.mutate(); }}><p className="lead">{eligible.length ? `${eligible.length} ligne(s) rejetée(s) seront retournées.` : 'Aucune quantité rejetée disponible.'}</p><label>Motif<textarea value={motif} onChange={(e) => setMotif(e.target.value)} required /></label><label>Emplacement source<select value={sourceId} onChange={(e) => setSourceId(e.target.value)} required><option value="">Sélectionner…</option>{entrepots.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nom}</option>)}</select></label>{base.error && <p role="alert">{base.error}</p>}<Actions pending={mutation.isPending || !eligible.length} onClose={base.onClose} /></form></Modal>;
}

function InvoiceP2pModal({
  receipt,
  onClose,
  onError,
  error,
  onCreated,
}: {
  receipt: Awaited<ReturnType<typeof p2pApi.reception>>;
  onClose: () => void;
  onError: (error: unknown) => void;
  error: string | null;
  onCreated: (factureId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [reference, setReference] = useState('');
  const [dateDocument, setDateDocument] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const lignes = receipt.lignes.filter(
    (line) => (line.decisionQualite?.quantiteAcceptee ?? 0) > 0 && line.decisionQualite,
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Joignez le PDF ou le scan de la facture fournisseur.');
      const hashSha256 = await sha256File(file);
      return p2pApi.createFactureP2p({
        clientOperationId: operationId(),
        fournisseurId: receipt.fournisseur.id,
        referenceFournisseur: reference.trim(),
        dateDocument,
        devise: receipt.commande.devise || 'XOF',
        tauxChangeSnapshot: '1',
        document: {
          hashSha256,
          nomFichier: file.name,
          mimeType: file.type || 'application/octet-stream',
          tailleOctets: file.size,
          uri: `facture://${receipt.id}/${file.name}`,
        },
        lignes: lignes.map((line) => ({
          ligneCommandeId: line.ligneCommandeId,
          ligneQualiteId: line.decisionQualite!.id,
          quantite: line.decisionQualite!.quantiteAcceptee,
          prixUnitaire: line.prixUnitaireSnapshot,
        })),
      });
    },
    onSuccess: (created) => onCreated(created.id),
    onError,
  });
  return (
    <Modal open title="Facture trois voies" size="lg" onClose={onClose}>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="lead">
          Match BC · réception · qualité. {lignes.length} ligne(s) acceptée(s) de {receipt.commande.numero}.
        </p>
        <label>
          Référence fournisseur
          <input value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={80} />
        </label>
        <label>
          Date document
          <input type="date" value={dateDocument} onChange={(e) => setDateDocument(e.target.value)} required />
        </label>
        <label>
          Pièce (PDF / scan)
          <input
            type="file"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Actions pending={mutation.isPending || lignes.length === 0} onClose={onClose} />
      </form>
    </Modal>
  );
}

function Actions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return <div className="table-actions"><button type="button" onClick={onClose}>Annuler</button><button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Enregistrement…' : 'Confirmer'}</button></div>;
}
