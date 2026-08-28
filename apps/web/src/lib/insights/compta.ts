import type { Insight } from './types';
import type { PaymentProposal } from '../p2p';
import { fmtFcfa } from '../achats-ui';
import type { AgingBucket } from '../compta-reports';

export function insightPaiementsCircuit(): Insight {
  return {
    title: 'Circuit de paiement fournisseur',
    interpretation:
      'Ce n’est pas la caisse boutique : on solde des factures déjà comptabilisées (401). Chaque lot suit RAF → DAF → DG (si seuil) → exécution, avec re-authentification sur les étapes sensibles.',
    recommendation:
      'Préparez un lot seulement si la facture est comptabilisée. N’exécutez jamais avant approbation DAF (ou DG si exception).',
    severity: 'info',
  };
}

export function insightPaiementsAApprouver(count: number, montant: number): Insight {
  if (count === 0) {
    return {
      title: 'À approuver (DAF)',
      interpretation: 'Aucun lot en statut « préparée ». Le DAF n’a rien à valider pour l’instant.',
      recommendation: 'Le RAF peut préparer une proposition depuis une facture d’achat comptabilisée.',
      severity: 'ok',
    };
  }
  return {
    title: 'À approuver (DAF)',
    interpretation: `${count} lot(s) · ${fmtFcfa(montant)} en attente d’approbation DAF. Sans cette étape, aucun paiement ne part.`,
    recommendation: 'Ouvrez un lot, vérifiez fournisseurs et montants, puis approuvez (mot de passe demandé).',
    severity: count > 5 ? 'warning' : 'info',
  };
}

export function insightPaiementsAExecuter(count: number, montant: number): Insight {
  if (count === 0) {
    return {
      title: 'À exécuter',
      interpretation:
        'Aucun lot approuvé en attente d’exécution. Les lots « seuil DG » ou « à exécuter » apparaîtront ici après validation.',
      severity: 'ok',
    };
  }
  return {
    title: 'À exécuter',
    interpretation: `${count} lot(s) · ${fmtFcfa(montant)} prêts à payer (approuvés DAF ou exception DG). L’exécution lettrera le grand livre.`,
    recommendation: 'Exécutez depuis le compte de trésorerie prévu, puis rapprochez le relevé bancaire.',
    severity: 'warning',
  };
}

export function insightPaiementsPayes(count: number, montant: number): Insight {
  return {
    title: 'Payés',
    interpretation:
      count === 0
        ? 'Aucun lot exécuté sur le filtre courant. Un paiement exécuté crée l’écriture et lettrage 401.'
        : `${count} lot(s) · ${fmtFcfa(montant)} déjà exécutés et lettrés au grand livre.`,
    recommendation:
      'Contrôlez le rapprochement bancaire pour confirmer que le débit banque correspond au lot.',
    severity: 'neutral',
  };
}

export function insightStatutProposition(statut: PaymentProposal['statut']): Insight {
  if (statut === 'PREPAREE') {
    return {
      title: 'À approuver (DAF)',
      interpretation: 'Lot préparé par le RAF. En attente de validation DAF — pas encore de sortie de fonds.',
      recommendation: 'Le DAF vérifie le compte, les factures et le montant avant d’approuver.',
      severity: 'info',
    };
  }
  if (statut === 'APPROUVEE') {
    return {
      title: 'Seuil DG',
      interpretation:
        'Le DAF a approuvé, mais le montant dépasse le seuil : la Direction Générale doit encore valider l’exception.',
      recommendation: 'Demandez l’approbation DG (exception). Ensuite seulement on peut exécuter.',
      severity: 'warning',
    };
  }
  if (statut === 'APPROUVEE_EXCEPTION') {
    return {
      title: 'À exécuter',
      interpretation: 'Lot entièrement approuvé. Prêt pour exécution (DAF ou caissier central) et lettrage.',
      recommendation: 'Exécutez avec la référence bancaire / mobile money, puis importez le relevé.',
      severity: 'warning',
    };
  }
  if (statut === 'EXECUTEE') {
    return {
      title: 'Payée',
      interpretation: 'Paiement passé au grand livre. La facture 401 est lettrée pour la part payée.',
      severity: 'ok',
    };
  }
  return {
    title: 'Annulée',
    interpretation: 'Ce lot n’est plus actif. Aucune exécution possible.',
    severity: 'neutral',
  };
}

export function insightActionPreparer(): Insight {
  return {
    title: 'Préparer une proposition',
    interpretation:
      'Réservé au RAF. Crée un lot (1+ factures + compte trésorerie + date prévue). N’écrit pas encore en banque.',
    recommendation: 'Choisissez des factures déjà comptabilisées, un seul compte de paiement, une référence claire.',
    severity: 'info',
  };
}

export function insightActionApprouver(): Insight {
  return {
    title: 'Approuver (DAF)',
    interpretation: 'Valide le lot après contrôle. Redemande le mot de passe (action sensible § séparation des tâches).',
    recommendation: 'Si le montant dépasse le seuil, passez par l’approbation exceptionnelle DG.',
    severity: 'info',
  };
}

export function insightActionExecuter(): Insight {
  return {
    title: 'Exécuter un paiement',
    interpretation:
      'Déclenche le paiement réel et l’écriture comptable. Impossible sur un lot non approuvé.',
    recommendation: 'Vérifiez le solde du compte trésorerie et la référence d’instruction avant de confirmer.',
    severity: 'warning',
  };
}

export function insightPeriodeComptable(): Insight {
  return {
    title: 'Période comptable',
    interpretation:
      'La période borne toutes les écritures (balance, grand livre, états). Une période clôturée refuse toute nouvelle pièce — le grand livre reste append-only.',
    recommendation:
      'Préférez une période ouverte du calendrier. Pour un contrôle ponctuel, utilisez Du/Au personnalisés.',
    severity: 'info',
  };
}

export function insightBalanceGenerale(debit: number, credit: number): Insight {
  const ecart = Math.abs(debit - credit);
  const ok = ecart < 0.015;
  return {
    title: 'Balance générale',
    interpretation: ok
      ? `Débits ${fmtFcfa(debit)} = crédits ${fmtFcfa(credit)}. La balance de la période est équilibrée.`
      : `Écart ${fmtFcfa(ecart)} entre débits et crédits. Une balance déséquilibrée signale une écriture incomplète ou un filtre trop étroit.`,
    recommendation: ok
      ? 'Imprimez ou exportez pour le dossier de clôture mensuelle.'
      : 'Vérifiez la file d’écritures et les OD récentes, puis recalculez sur la même période.',
    severity: ok ? 'ok' : 'critical',
  };
}

export function insightGrandLivre(): Insight {
  return {
    title: 'Grand livre',
    interpretation:
      'Mouvements compte par compte, journal par journal. Une écriture validée ne s’édite pas : toute correction passe par une écriture compensatoire.',
    recommendation: 'Filtrez par journal (Achats / Ventes / Caisse / Banque / OD) pour isoler un circuit métier.',
    severity: 'info',
  };
}

export function insightAgeeEncours(
  kind: '401' | '411',
  due: number,
  overdue: number,
): Insight {
  const label = kind === '401' ? 'fournisseurs (401)' : 'clients (411)';
  if (due < 0.01) {
    return {
      title: `Encours ${kind}`,
      interpretation: `Aucun encours ${label} non soldé à la date de fin. Soit tout est lettré, soit aucune pièce n’a été comptabilisée.`,
      recommendation:
        kind === '401'
          ? 'Vérifiez que les factures d’achat sont bien comptabilisées avant de préparer un paiement.'
          : 'Un ticket POS encaissé débite 411 puis est lettré ; l’encours 411 ne reste que si la créance n’est pas soldée.',
      severity: 'ok',
    };
  }
  const ratio = overdue / due;
  return {
    title: `Encours ${kind}`,
    interpretation: `${fmtFcfa(due)} non soldé · dont ${fmtFcfa(overdue)} échu (${Math.round(ratio * 100)} %).`,
    recommendation:
      kind === '401'
        ? 'Priorisez les propositions de paiement sur les tranches 61–90 j et +90 j.'
        : 'Relancez les créances échues ; le Contrôle peut croiser avec le CRM.',
    severity: ratio > 0.4 ? 'warning' : 'info',
  };
}

export function insightAgeeBucket(bucket: AgingBucket, montant: number): Insight {
  const labels: Record<AgingBucket, string> = {
    current: 'Non échu',
    d30: '0–30 jours',
    d60: '31–60 jours',
    d90: '61–90 jours',
    d90p: 'Plus de 90 jours',
  };
  return {
    title: labels[bucket],
    interpretation:
      montant < 0.01
        ? `Rien dans la tranche « ${labels[bucket]} » à la date de fin.`
        : `${fmtFcfa(montant)} dans la tranche « ${labels[bucket]} ».`,
    recommendation:
      bucket === 'd90p' || bucket === 'd90'
        ? 'Traitez en priorité : risque de litige / pénalités / trésorerie.'
        : 'Surveillez le glissement vers la tranche suivante à chaque clôture.',
    severity: bucket === 'd90p' ? 'critical' : bucket === 'd90' ? 'warning' : 'info',
  };
}

export function insightJournaux(): Insight {
  return {
    title: 'Journaux comptables',
    interpretation:
      'Cinq types SYSCOHADA : Achats (401), Ventes (701), Caisse (571), Banque (521), OD. Le code et le type sont figés après création.',
    recommendation: 'Filtrez un type à la fois. Une désactivation bloque les nouvelles écritures, jamais les pièces déjà passées.',
    severity: 'info',
  };
}

export function insightPlanComptes(nb: number): Insight {
  return {
    title: 'Plan de comptes',
    interpretation: `${nb} compte(s). Plan SYSCOHADA opérationnel (classes 1–7) — le RAF ajoute les numéros manquants (1 à 8 chiffres). Un numéro déjà mouvementé ne change plus.`,
    recommendation:
      'Classez par classe 1–8. Marchandises : 31 (stock), 408 (FNP), 603 (CMV). Créez les 6xx avant les natures de dépense.',
    severity: 'info',
  };
}

export function insightNaturesDepense(): Insight {
  return {
    title: 'Natures de dépense (6xx)',
    interpretation:
      'Imputation des factures de charge (loyer, transport, honoraires). Chaque nature pointe un compte 6xx du plan.',
    recommendation: 'Une nature inactive ne peut plus être choisie à la saisie, mais les pièces historiques restent lisibles.',
    severity: 'info',
  };
}

export function insightSaisieOd(): Insight {
  return {
    title: 'Opération diverse',
    interpretation:
      'Écriture manuelle multi-lignes sur le journal OD. Débit = crédit. SYSCOHADA : chaque OD repose sur une pièce interne (note, PV, décision) — pas une écriture sans origine.',
    recommendation:
      'Saisissez la référence de pièce (3 caractères min). Pour annuler une pièce déjà postée, utilisez Storno (OD compensatoire), jamais une modification rétroactive.',
    severity: 'info',
  };
}

export function insightFactureCharge(): Insight {
  return {
    title: 'Facture de charge 6xx',
    interpretation:
      'Pièce fournisseur hors marchandises. Elle alimente le journal des achats (401 / 6xx), pas le journal OD.',
    recommendation: 'Après enregistrement, ouvrez la facture pour la comptabiliser, puis payez via Propositions de paiement.',
    severity: 'info',
  };
}

export function insightBilan(equilibre: boolean, actif: number, passif: number): Insight {
  return {
    title: 'Bilan SYSCOHADA',
    interpretation: equilibre
      ? `Actif ${fmtFcfa(actif)} = Passif ${fmtFcfa(passif)}. Classes 1–5, plus le résultat de période (RN) tant que 6/7 ne sont pas soldés à la clôture.`
      : `Écart actif/passif : Actif ${fmtFcfa(actif)} · Passif ${fmtFcfa(passif)}. Vérifiez les OD et la file d’écritures.`,
    recommendation: equilibre
      ? 'Le compte de résultat (6/7) reste distinct ; à la clôture, le DAF solde 6/7 sur le 13.'
      : 'Vérifiez les OD et la file ; un écart après report du RN signale une pièce non équilibrée.',
    severity: equilibre ? 'ok' : 'warning',
  };
}

export function insightCompteResultat(benefice: boolean, resultat: number): Insight {
  return {
    title: 'Compte de résultat',
    interpretation: benefice
      ? `Bénéfice ${fmtFcfa(resultat)} (produits classe 7 − charges classe 6).`
      : `Perte ${fmtFcfa(Math.abs(resultat))} sur la période.`,
    recommendation: 'À la clôture d’exercice, le DAF solde 6/7 sur le compte 13 (résultat).',
    severity: benefice ? 'ok' : 'warning',
  };
}

export function insightTva(net: number, credit: boolean, deductible: number, collectee: number): Insight {
  return {
    title: 'État TVA (4452 / 4457)',
    interpretation: `Récupérable 4452 ${fmtFcfa(deductible)} · Collectée 4457 ${fmtFcfa(collectee)} · ${
      credit ? 'crédit de TVA' : 'net à payer'
    } ${fmtFcfa(Math.abs(net))}.`,
    recommendation: credit
      ? 'Reporter le crédit sur la déclaration suivante ou demander remboursement selon la procédure fiscale.'
      : 'Conciliez avec les factures d’achat (TVA récupérable) et les ventes (TVA collectée) de la période.',
    severity: credit ? 'info' : net > 0 ? 'warning' : 'ok',
  };
}

export function insightFileEcritures(attente: number, erreur: number): Insight {
  if (attente === 0 && erreur === 0) {
    return {
      title: 'File d’écritures',
      interpretation: 'File vide : aucune pièce bloquée (période fermée, mapping manquant ou échec).',
      severity: 'ok',
    };
  }
  return {
    title: 'File d’écritures',
    interpretation: `${attente} en attente · ${erreur} en erreur. Les ventes POS / commandes web / retours peuvent s’y empiler si la période est fermée.`,
    recommendation:
      erreur > 0
        ? 'Lisez le motif, corrigez le mapping ou rouvrez/ouvrez une période, puis « Rejouer la file ».'
        : 'Ouvrez une période active puis rejouez la file (RAF).',
    severity: erreur > 0 ? 'critical' : 'warning',
  };
}

export function insightBanque(): Insight {
  return {
    title: 'Rapprochement bancaire',
    interpretation:
      'Importez un relevé, puis rattachez chaque ligne à un mouvement de trésorerie / paiement exécuté. Ce n’est pas la caisse boutique (571).',
    recommendation: 'Exécutez d’abord les propositions de paiement, puis importez le relevé pour lettrer.',
    severity: 'info',
  };
}

export function insightBanqueLignes(count: number, montant: number): Insight {
  if (count === 0) {
    return {
      title: 'Lignes de relevé',
      interpretation: 'Aucune ligne non rapprochée : soit rien n’a été importé, soit tout est lettré.',
      recommendation: 'Importez le relevé du mois pour démarrer le rapprochement.',
      severity: 'ok',
    };
  }
  return {
    title: 'Lignes de relevé non rapprochées',
    interpretation: `${count} ligne(s) · ${fmtFcfa(montant)} encore sans mouvement de trésorerie.`,
    recommendation: 'Rapprochez chaque ligne à un paiement exécuté (même montant / devise).',
    severity: count > 20 ? 'warning' : 'info',
  };
}

export function insightBanqueMouvements(count: number, montant: number): Insight {
  if (count === 0) {
    return {
      title: 'Mouvements de trésorerie',
      interpretation: 'Aucun mouvement non lettré sur ce compte.',
      recommendation: 'Les paiements exécutés apparaîtront ici tant qu’ils ne sont pas rapprochés.',
      severity: 'ok',
    };
  }
  return {
    title: 'Mouvements non rapprochés',
    interpretation: `${count} mouvement(s) · ${fmtFcfa(montant)} sans ligne de relevé.`,
    recommendation: 'Vérifiez qu’un relevé couvrant ces dates a bien été importé.',
    severity: count > 20 ? 'warning' : 'info',
  };
}

export function insightClotureExercice(): Insight {
  return {
    title: 'Clôture d’exercice',
    interpretation:
      'Le DAF solde les classes 6 et 7 sur le compte 13, reporte 1–5 en à-nouveaux, ouvre l’exercice suivant. Irréversible.',
    recommendation: 'Clôturez d’abord toutes les périodes de l’exercice, videz la file, puis lancez la clôture.',
    severity: 'warning',
  };
}

export function insightCalendrierPeriodes(ouvertes: number): Insight {
  return {
    title: 'Calendrier comptable',
    interpretation:
      ouvertes === 0
        ? 'Aucune période ouverte : toute nouvelle écriture sera refusée ou mise en file.'
        : `${ouvertes} période(s) ouverte(s). Le RAF ouvre, le DAF clôture. Une clôture n’est jamais annulée.`,
    recommendation:
      ouvertes === 0
        ? 'Ouvrez immédiatement la période du mois en cours avant de comptabiliser.'
        : 'Sélectionnez cette période dans Balance / Grand livre pour imprimer le dossier mensuel.',
    severity: ouvertes === 0 ? 'critical' : 'info',
  };
}

export function insightLettrage(): Insight {
  return {
    title: 'Lettrage 401 / 411',
    interpretation:
      'Rattache des lignes ouvertes du même compte et du même tiers (fournisseur ou client) dont le débit égale le crédit. Le code posé est immuable.',
    recommendation:
      'Ne letrez que des lignes équilibrées. Un lettrage déjà posé ne se dépose pas : corrigez par storno puis nouveau lettrage.',
    severity: 'info',
  };
}

export function insightStorno(): Insight {
  return {
    title: 'Storno',
    interpretation:
      'OD compensatoire qui inverse une écriture déjà postée. Le grand livre reste append-only : aucune ligne historique n’est modifiée.',
    recommendation:
      'Indiquez la pièce justificative du storno (note, PV). On ne storno pas un storno.',
    severity: 'info',
  };
}

export function insightLiasse(equilibre: boolean, resultat: number, benefice: boolean): Insight {
  return {
    title: 'Liasse SYSCOHADA 2017',
    interpretation: equilibre
      ? `Masses officielles (pas seulement les classes 1–7). Résultat ${benefice ? 'bénéficiaire' : 'déficitaire'} ${fmtFcfa(Math.abs(resultat))}. Support de clôture pour le DAF / l’expert-comptable.`
      : `Écart actif/passif sur les masses SYSCOHADA. Résultat ${fmtFcfa(resultat)}.`,
    recommendation:
      'Ce n’est pas une liasse de dépôt DGI/RCCM. Transmettez le PDF à l’expert-comptable ; la déclaration fiscale se fait hors de l’outil.',
    severity: equilibre ? 'ok' : 'warning',
  };
}

export function insightTft(mode: 'INDIRECT_N_N1' | 'N_SEULEMENT'): Insight {
  return {
    title: 'Tableau des flux de trésorerie',
    interpretation:
      mode === 'N_SEULEMENT'
        ? 'Aucun mouvement sur la fenêtre N−1 : le TFT affiche les stocks N (BFR et trésorerie) sans variation.'
        : 'Méthode indirecte : résultat ± variation du BFR (classes 3–4) ± variation de trésorerie (classe 5).',
    recommendation:
      mode === 'N_SEULEMENT'
        ? 'Ouvrez un exercice N−1 (à-nouveaux) pour obtenir un TFT comparatif.'
        : 'Une variation de trésorerie qui ne « colle » pas au résultat + BFR vient des classes 1–2 (immos, capitaux).',
    severity: mode === 'N_SEULEMENT' ? 'info' : 'ok',
  };
}

export function insightImmos(enService: number, nette: number): Insight {
  return {
    title: 'Registre des immobilisations',
    interpretation:
      enService === 0
        ? 'Aucune fiche en service. Le tableau des immos de la liasse retombe alors sur les soldes 21 / 28 du grand livre.'
        : `${enService} fiche(s) en service · valeur nette ${fmtFcfa(nette)}. Dotation linéaire mensuelle D 6813 / C 28 sur le journal OD.`,
    recommendation:
      'Le RAF crée la fiche (durée en mois). Le DAF ou le RAF génère les dotations du mois ouvert — pièce idempotente, pas de dégressif ni de cession automatique.',
    severity: enService === 0 ? 'info' : 'ok',
  };
}
