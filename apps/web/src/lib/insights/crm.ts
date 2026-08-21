import { NiveauFidelite } from '@caisse-crm/shared';
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
