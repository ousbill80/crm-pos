import { NiveauFidelite, SegmentClient } from '@caisse-crm/shared';
import type { Insight } from './types';

// Interprétations ancrées sur le tableau de bord client existant (§6.6) —
// jamais de seuil monétaire inventé, uniquement les notions déjà définies
// (paliers de fidélité) ou des faits directement dérivés des données.
export function insightTotalDepense(totalDepense: string, nombreAchats: number): Insight {
  return {
    title: 'Total dépensé',
    interpretation:
      nombreAchats > 0
        ? `${totalDepense} FCFA cumulés sur ${nombreAchats} achat(s), tous points de vente confondus (fiche client consolidée réseau).`
        : "Aucun achat enregistré pour ce client pour l'instant.",
    severity: 'info',
  };
}

export function insightNombreAchats(nombreAchats: number): Insight {
  return {
    title: "Nombre d'achats",
    interpretation: `${nombreAchats} achat(s) enregistré(s) pour ce client sur l'ensemble du réseau.`,
    recommendation:
      nombreAchats === 0
        ? 'Rattacher les prochaines ventes de ce client à sa fiche pour construire son historique.'
        : undefined,
    severity: nombreAchats === 0 ? 'neutral' : 'info',
  };
}

export function insightDernierAchat(dateDernierAchat: string | null): Insight {
  if (!dateDernierAchat) {
    return {
      title: 'Dernier achat',
      interpretation: "Ce client n'a encore aucun achat rattaché à sa fiche.",
      severity: 'neutral',
    };
  }
  const jours = Math.floor((Date.now() - new Date(dateDernierAchat).getTime()) / 86_400_000);
  return {
    title: 'Dernier achat',
    interpretation: `Il y a ${jours} jour(s), le ${new Date(dateDernierAchat).toLocaleDateString()}.`,
    severity: 'info',
  };
}

export function insightFidelite(niveau: string, pointsCumules: number): Insight {
  const libelles: Record<string, string> = {
    [NiveauFidelite.BRONZE]: "palier d'entrée du programme de fidélité",
    [NiveauFidelite.ARGENT]: 'palier intermédiaire',
    [NiveauFidelite.OR]: 'palier le plus élevé — client fidèle à forte valeur',
  };
  return {
    title: 'Fidélité',
    interpretation: `Palier ${niveau} avec ${pointsCumules} point(s) cumulés — ${libelles[niveau] ?? 'palier personnalisé'}.`,
    recommendation:
      niveau === NiveauFidelite.OR
        ? 'Prioriser ce client dans les campagnes CRM ciblées sur le palier OR.'
        : undefined,
    severity: 'info',
  };
}

// --- Création de fiche (§6.6) — champs du formulaire « Nouveau client » ---

export function insightFicheReseau(): Insight {
  return {
    title: 'Fiche client unique',
    interpretation:
      'Une seule fiche pour tout le réseau : l’historique d’achats sera visible depuis n’importe quelle boutique. Le rattachement à une vente reste optionnel (vente anonyme toujours possible).',
    recommendation:
      'Saisir au moins un contact (téléphone ou e-mail) pour pouvoir cibler ce client dans les campagnes.',
    severity: 'info',
  };
}

export function insightContactClient(contact: string): Insight {
  const vide = contact.trim().length === 0;
  return {
    title: 'Contact',
    interpretation: vide
      ? 'Champ optionnel. Sans contact, la fiche existe mais les campagnes CRM et relances ne pourront pas joindre ce client.'
      : `Contact renseigné : « ${contact.trim()} ». Utilisé pour les campagnes et la recherche dans le fichier CRM.`,
    recommendation: vide
      ? 'Privilégier un numéro mobile ou un e-mail joignable, unique sur le réseau si possible.'
      : undefined,
    severity: vide ? 'neutral' : 'ok',
  };
}

export function insightAdresseClient(adresse: string): Insight {
  const vide = adresse.trim().length === 0;
  return {
    title: 'Adresse',
    interpretation: vide
      ? 'Champ optionnel. Utile pour les livraisons et le suivi commercial de proximité.'
      : `Adresse renseignée : « ${adresse.trim()} ».`,
    severity: vide ? 'neutral' : 'ok',
  };
}

export function insightDateNaissanceClient(dateNaissance: string): Insight {
  if (!dateNaissance) {
    return {
      title: 'Date de naissance',
      interpretation:
        'Optionnelle. Utile pour les campagnes d’anniversaire et la personnalisation CRM — non exigée pour créer la fiche.',
      severity: 'neutral',
    };
  }
  const d = new Date(dateNaissance);
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - d.getFullYear();
  const m = aujourdhui.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && aujourdhui.getDate() < d.getDate())) age -= 1;
  if (Number.isNaN(age) || age < 0 || age > 120) {
    return {
      title: 'Date de naissance',
      interpretation: 'La date saisie semble incohérente.',
      recommendation: 'Vérifier le format AAAA-MM-JJ avant d’enregistrer.',
      severity: 'warning',
    };
  }
  return {
    title: 'Date de naissance',
    interpretation: `Âge estimé : ${age} an(s). La date servira aux campagnes d’anniversaire si le consentement marketing est accordé.`,
    severity: 'info',
  };
}

export function insightConsentementMarketing(accorde: boolean): Insight {
  return {
    title: 'Consentement marketing',
    interpretation: accorde
      ? 'Le client autorise les communications commerciales (campagnes SMS/e-mail ciblées, §6.6). Le consentement est tracé sur la fiche.'
      : 'Sans consentement, la fiche et l’historique d’achats restent disponibles, mais ce client ne doit pas être inclus dans les campagnes marketing.',
    recommendation: accorde
      ? undefined
      : 'Ne cocher que si le client a donné son accord explicite — obligatoire pour les campagnes ciblées.',
    severity: accorde ? 'ok' : 'info',
  };
}


export function insightSeuilFideliteArgent(seuil: number): Insight {
  return {
    title: 'Seuil Argent',
    interpretation: `Palier intermédiaire dès ${seuil} point(s) cumulés. Tout client en dessous reste Bronze.`,
    recommendation:
      'Aligner ce seuil sur la fréquence d’achat moyenne du réseau — recalcul automatique à chaque crédit de points.',
    severity: 'info',
  };
}

export function insightSeuilFideliteOr(seuil: number, seuilArgent: number): Insight {
  const ok = seuil > seuilArgent;
  return {
    title: 'Seuil Or',
    interpretation: ok
      ? `Palier le plus élevé dès ${seuil} point(s). Les clients entre ${seuilArgent} et ${seuil - 1} pts restent Argent.`
      : `Doit être strictement supérieur au seuil Argent (${seuilArgent}).`,
    recommendation: ok
      ? 'Clients Or : prioriser dans les campagnes CRM ciblées sur le palier le plus élevé.'
      : 'Augmenter le seuil Or avant enregistrement.',
    severity: ok ? 'info' : 'warning',
  };
}

export function insightSeuilSegmentRegulier(seuil: number): Insight {
  return {
    title: 'Seuil Régulier',
    interpretation: `Segment Régulier dès ${seuil} vente(s) rattachée(s) à la fiche client sur le réseau.`,
    recommendation:
      'Recalculer les segments après modification (page Segmentation) pour appliquer les nouveaux seuils au fichier existant.',
    severity: 'info',
  };
}

export function insightSeuilSegmentVip(seuil: number, seuilRegulier: number): Insight {
  const ok = seuil > seuilRegulier;
  return {
    title: 'Seuil VIP',
    interpretation: ok
      ? `Segment VIP dès ${seuil} vente(s). Entre ${seuilRegulier} et ${seuil - 1} ventes → Régulier.`
      : `Doit être strictement supérieur au seuil Régulier (${seuilRegulier}).`,
    recommendation: ok
      ? 'Les VIP sont le cœur de cible des campagnes à forte valeur.'
      : 'Augmenter le seuil VIP avant enregistrement.',
    severity: ok ? 'info' : 'warning',
  };
}

export function insightCreditFideliteAuto(): Insight {
  return {
    title: 'Crédit automatique POS',
    interpretation:
      'À l’encaissement d’une vente avec client rattaché : 1 point par tranche de 1 000 FCFA du montant total (arrondi à l’inférieur).',
    recommendation:
      'Les paliers Bronze / Argent / Or se recalculent immédiatement après chaque crédit de points.',
    severity: 'info',
  };
}

// --- Page Fidélité (§6.6) — tableau de bord des paliers ---

export function insightAdherentsFidelite(total: number): Insight {
  return {
    title: 'Adhérents fidélité',
    interpretation:
      total > 0
        ? `${total} client(s) disposent d'un compte fidélité actif sur le périmètre affiché.`
        : "Aucun compte fidélité sur ce périmètre — les points se créent au premier crédit (vente rattachée).",
    severity: total > 0 ? 'info' : 'neutral',
  };
}

export function insightPalierFideliteKpi(niveau: string, count: number, total: number): Insight {
  const libelles: Record<string, string> = {
    [NiveauFidelite.BRONZE]: "palier d'entrée, dès l'inscription au programme",
    [NiveauFidelite.ARGENT]: 'palier intermédiaire, seuil de points paramétrable',
    [NiveauFidelite.OR]: 'palier le plus élevé — clients à prioriser dans les campagnes',
  };
  return {
    title: `Palier ${niveau}`,
    interpretation: `${count} client(s) au palier ${niveau} sur ${total} adhérent(s) — ${libelles[niveau] ?? 'palier personnalisé'}.`,
    recommendation:
      niveau === NiveauFidelite.OR
        ? 'Cliquer pour filtrer la liste sur ce palier, ou cibler une campagne dédiée.'
        : undefined,
    severity: 'info',
  };
}

export function insightPointsCumulesReseau(points: number): Insight {
  return {
    title: 'Points cumulés',
    interpretation: `${points.toLocaleString('fr-FR')} point(s) cumulés au total sur le périmètre affiché (1 point par tranche de 1 000 FCFA encaissée, crédit automatique POS — §6.6).`,
    severity: 'info',
  };
}

// --- Page Segmentation (§6.6) — segments paramétrables ---

export function insightSegmentKpi(segment: string, count: number, total: number): Insight {
  const libelles: Record<string, string> = {
    [SegmentClient.VIP]: 'nombre de ventes rattachées au-dessus du seuil VIP',
    [SegmentClient.REGULIER]: 'nombre de ventes rattachées au-dessus du seuil Régulier',
    [SegmentClient.NOUVEAU]: 'peu ou pas de ventes rattachées à la fiche',
  };
  return {
    title: `Segment ${labelSegmentFr(segment)}`,
    interpretation: `${count} client(s) sur ${total} — segment déterminé automatiquement selon ${libelles[segment] ?? 'les seuils paramétrés'}.`,
    recommendation:
      segment === SegmentClient.VIP
        ? 'Cliquer pour filtrer la liste, ou cibler ce segment dans une campagne.'
        : undefined,
    severity: 'info',
  };
}

export function insightSegmentClient(segment: string): Insight {
  const libelles: Record<string, string> = {
    [SegmentClient.VIP]: 'Segment haute valeur — nombre de ventes rattachées au-dessus du seuil VIP.',
    [SegmentClient.REGULIER]: 'Achats répétés sur le réseau, en dessous du seuil VIP.',
    [SegmentClient.NOUVEAU]: 'Peu ou pas de ventes rattachées à la fiche pour le moment.',
  };
  return {
    title: `Segment ${labelSegmentFr(segment)}`,
    interpretation:
      libelles[segment] ?? 'Segment calculé automatiquement selon les seuils paramétrés (§6.6).',
    severity: 'info',
  };
}

export function insightRecalculSegment(): Insight {
  return {
    title: 'Recalcul du segment',
    interpretation:
      'Recalcule le segment de ce client à partir du nombre de ventes actuellement rattachées à sa fiche et des seuils Régulier / VIP paramétrés.',
    recommendation:
      'À utiliser après une modification des seuils, ou si le segment affiché semble périmé.',
    severity: 'info',
  };
}

function labelSegmentFr(s: string): string {
  if (s === SegmentClient.VIP) return 'VIP';
  if (s === SegmentClient.REGULIER) return 'Régulier';
  if (s === SegmentClient.NOUVEAU) return 'Nouveau';
  return s;
}

// --- Page Pilotage CRM (§6.6) — tableau de bord réseau ---

export function insightClientsReseauPilotage(total: number): Insight {
  return {
    title: 'Clients',
    interpretation: `${total} fiche(s) client consolidée(s) sur tout le réseau — historique d'achats visible depuis n'importe quelle boutique.`,
    severity: 'info',
  };
}

export function insightCaIdentifieAnonyme(
  caIdentifie: number,
  caAnonyme: number,
  ticketsIdentifies: number,
  ticketsAnonymes: number,
): Insight {
  const total = caIdentifie + caAnonyme;
  const pct = total > 0 ? Math.round((caIdentifie / total) * 100) : 0;
  return {
    title: 'CA identifié vs anonyme',
    interpretation:
      total > 0
        ? `${pct} % du chiffre d'affaires est rattaché à une fiche client (${ticketsIdentifies} ticket(s) identifié(s) contre ${ticketsAnonymes} anonyme(s)). Le rattachement client reste optionnel — la vente anonyme est toujours possible (§6.6).`
        : "Aucune vente enregistrée pour l'instant.",
    recommendation:
      total > 0 && pct < 50
        ? 'Encourager le rattachement client en caisse pour enrichir le fichier CRM et cibler les campagnes.'
        : undefined,
    severity: 'info',
  };
}

export function insightCampagnesPilotage(count: number): Insight {
  return {
    title: 'Campagnes',
    interpretation:
      count > 0
        ? `${count} campagne(s) les plus récentes affichées ci-dessous — cliquer pour voir le détail complet.`
        : "Aucune campagne créée pour l'instant.",
    severity: count > 0 ? 'info' : 'neutral',
  };
}

// --- Page Interactions CRM (§6.6) — journal réseau et par fiche client ---

export function insightJournalReseauTotal(totalApi: number, totalItems: number): Insight {
  return {
    title: 'Journal réseau',
    interpretation:
      totalApi > totalItems
        ? `${totalApi} interaction(s) au total sur le réseau — répartition par canal calculée sur un échantillon des ${totalItems} plus récentes.`
        : `${totalApi} interaction(s) au total sur le réseau (appels, SMS, WhatsApp, visites, e-mails, campagnes).`,
    severity: 'info',
  };
}

export function insightCanalInteractionKpi(
  libelleCanal: string,
  hint: string,
  count: number,
  total: number,
): Insight {
  return {
    title: libelleCanal,
    interpretation:
      total > 0
        ? `${count} interaction(s) sur ${total} via ce canal — ${hint.toLowerCase()}.`
        : `${hint} — aucune interaction enregistrée sur ce canal pour l'instant.`,
    recommendation: 'Cliquer pour filtrer le journal réseau sur ce canal.',
    severity: 'info',
  };
}

export function insightInteractionsClient(count: number): Insight {
  return {
    title: 'Interactions client',
    interpretation:
      count > 0
        ? `${count} interaction(s) enregistrée(s) sur la fiche de ce client (tous canaux confondus).`
        : "Aucune interaction enregistrée pour ce client — le premier appel, SMS ou visite s'ajoutera au journal.",
    severity: count > 0 ? 'info' : 'neutral',
  };
}

export function insightTypeClient(typeClient: string): Insight {
  if (typeClient === 'MORALE') {
    return {
      title: 'Personne morale',
      interpretation:
        'Fiche entreprise / association : la raison sociale identifie le client sur tout le réseau. L’interlocuteur est optionnel.',
      recommendation:
        'Renseigner un contact professionnel pour les campagnes et le suivi commercial.',
      severity: 'info',
    };
  }
  return {
    title: 'Personne physique',
    interpretation:
      'Fiche particulier : nom et prénom obligatoires. La date de naissance reste optionnelle (campagnes d’anniversaire).',
    severity: 'info',
  };
}
