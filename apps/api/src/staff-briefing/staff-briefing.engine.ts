import { RoleLibelle } from '@caisse-crm/shared';
import {
  buildSyscohadaStatements,
  netSolde,
  type TrialBalanceRow,
} from '../accounting-gl/syscohada-statements';
import {
  POSTES_CR,
  posteForAccount,
} from '../accounting-gl/syscohada-liasse';

export const TZ_BRIEFING = 'Africa/Abidjan';

export const ROLES_BRIEFING_SOIR: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

export const ROLES_BRIEFING_EXECUTIF: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RAF_COMPTABLE,
];

export const ROLES_RELANCE_CONNEXION: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.RESPONSABLE_CRM,
];

export const ROLES_CLOTURE_CAISSE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RAF_COMPTABLE,
];

/** Heure locale Abidjan après laquelle une session encore ouverte est hors service. */
export const HEURE_FIN_SERVICE_DEFAUT = 20;

/** `STAFF_CLOTURE_HEURE` vide ou invalide → 20h, jamais minuit par `Number('') === 0`. */
export function parseHeureFinService(raw: string | undefined | null): number {
  const s = raw?.trim() ?? '';
  if (s === '') return HEURE_FIN_SERVICE_DEFAUT;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n <= 23) return n;
  return HEURE_FIN_SERVICE_DEFAUT;
}

export const ROLES_ALERTE_SHOP: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.RESPONSABLE_CRM,
];

export type TypeBriefing =
  | 'SOIR'
  | 'HEBDO'
  | 'MOIS'
  | 'RELANCE_CONNEXION'
  | 'SHOP_INACTIF'
  | 'CLOTURE_CAISSE';

export type BoutiqueCa = {
  nom: string;
  ca: number;
  tickets: number;
};

export type MixPaiement = {
  mode: string;
  montant: number;
  tickets: number;
};

export type HorizonVentes = 'JOUR' | 'SEMAINE' | 'MOIS';

export type SnapshotVentes = {
  horizon: HorizonVentes;
  periodeLabel: string;
  caReseau: number;
  tickets: number;
  panierMoyen: number;
  parBoutique: BoutiqueCa[];
  caWeb: number;
  commandesWeb: number;
  panierMoyenWeb: number;
  caTotal: number;
  mixPaiement: MixPaiement[];
  litigesOuverts: number;
  versementsEnRetard: number;
  boutiquesActives: number;
  boutiquesTotal: number;
  caPrecedent: number;
  ticketsPrecedent: number;
};

export type SnapshotStocks = {
  valeurStock: number;
  ruptures: number;
  sousSeuil: number;
};

/** File de versements magasin → centrale, recalculée depuis le grand livre (§6.4). */
export type SnapshotFinance = {
  initiee: { n: number; montant: number };
  enTransit: { n: number; montant: number };
  receptionnee: { n: number; montant: number };
  valideePeriode: { n: number; montant: number };
  litige: { n: number; montant: number };
  versementsEnRetard: number;
};

export type LigneCompteGl = {
  numero: string;
  intitule: string;
  montant: number;
};

export type PosteCharge = {
  libelle: string;
  montant: number;
};

/** Compte de résultat SYSCOHADA (classes 6 / 7) + file et dettes fournisseur. */
export type SnapshotGl = {
  totalCharges: number;
  totalProduits: number;
  resultat: number;
  benefice: boolean;
  postesCharges: PosteCharge[];
  detailCharges: LigneCompteGl[];
  fileAttente: number;
  fileErreur: number;
  facturesFournisseurOuvertes: number;
  montantFacturesOuvertes: number;
  lotsPaiementAApprouver: number;
};

export function synthetiserCompteResultat(
  rows: TrialBalanceRow[],
  extras?: Partial<
    Pick<
      SnapshotGl,
      | 'fileAttente'
      | 'fileErreur'
      | 'facturesFournisseurOuvertes'
      | 'montantFacturesOuvertes'
      | 'lotsPaiementAApprouver'
    >
  >,
): SnapshotGl {
  const st = buildSyscohadaStatements(rows);
  const postesMap = new Map<string, PosteCharge>();
  for (const def of POSTES_CR) {
    if (def.nature !== 'charge') continue;
    postesMap.set(def.code, { libelle: def.libelle, montant: 0 });
  }
  for (const row of rows) {
    const poste = posteForAccount(row.numero, POSTES_CR);
    if (!poste || poste.nature !== 'charge') continue;
    const cur = postesMap.get(poste.code);
    if (cur) cur.montant += netSolde(row);
  }
  const ligne = (row: {
    numero: string;
    intitule: string;
    solde: string;
  }): LigneCompteGl => ({
    numero: row.numero,
    intitule: row.intitule,
    montant: Number(row.solde),
  });
  const detailCharges = st.compteResultat.charges
    .map(ligne)
    .filter((l) => Math.abs(l.montant) >= 0.005)
    .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant))
    .slice(0, 12);
  return {
    totalCharges: Number(st.compteResultat.totalCharges),
    totalProduits: Number(st.compteResultat.totalProduits),
    resultat: Number(st.compteResultat.resultat),
    benefice: st.compteResultat.benefice,
    postesCharges: [...postesMap.values()].filter(
      (p) => Math.abs(p.montant) >= 0.005,
    ),
    detailCharges,
    fileAttente: extras?.fileAttente ?? 0,
    fileErreur: extras?.fileErreur ?? 0,
    facturesFournisseurOuvertes: extras?.facturesFournisseurOuvertes ?? 0,
    montantFacturesOuvertes: extras?.montantFacturesOuvertes ?? 0,
    lotsPaiementAApprouver: extras?.lotsPaiementAApprouver ?? 0,
  };
}

export function chargesAffichees(gl: SnapshotGl): number {
  return gl.totalCharges;
}

export function produitsAffiches(gl: SnapshotGl): number {
  return -gl.totalProduits;
}

export type SnapshotShop = {
  shopActif: boolean;
  produitsVisibles: number;
  commandes7j: number;
  sessions7j: number;
};

export function jourCleAbidjan(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BRIEFING,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function debutJourAbidjan(d = new Date()): Date {
  return new Date(`${jourCleAbidjan(d)}T00:00:00.000Z`);
}

export function finJourAbidjan(d = new Date()): Date {
  return new Date(`${jourCleAbidjan(d)}T23:59:59.999Z`);
}

export function estDernierJourDuMois(d = new Date()): boolean {
  const jour = jourCleAbidjan(d);
  const lendemain = new Date(`${jour}T12:00:00.000Z`);
  lendemain.setUTCDate(lendemain.getUTCDate() + 1);
  return jourCleAbidjan(lendemain).slice(0, 7) !== jour.slice(0, 7);
}

export function cleSemaineIso(d = new Date()): string {
  const utc = new Date(`${jourCleAbidjan(d)}T12:00:00.000Z`);
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function inactifDepuisHeures(
  derniereConnexion: Date | null,
  maintenant: Date,
  seuilHeures: number,
): boolean {
  if (!derniereConnexion) return true;
  return maintenant.getTime() - derniereConnexion.getTime() >= seuilHeures * 3600_000;
}

export function shopNecessiteAttention(s: SnapshotShop): boolean {
  if (!s.shopActif) return false;
  if (s.produitsVisibles === 0) return true;
  return s.commandes7j === 0;
}

export function assemblerSnapshotVentes(
  input: Omit<
    SnapshotVentes,
    'panierMoyen' | 'panierMoyenWeb' | 'caTotal' | 'boutiquesActives'
  > &
    Partial<
      Pick<
        SnapshotVentes,
        'panierMoyen' | 'panierMoyenWeb' | 'caTotal' | 'boutiquesActives'
      >
    >,
): SnapshotVentes {
  return {
    horizon: input.horizon,
    periodeLabel: input.periodeLabel,
    caReseau: input.caReseau,
    tickets: input.tickets,
    parBoutique: input.parBoutique,
    caWeb: input.caWeb,
    commandesWeb: input.commandesWeb,
    mixPaiement: input.mixPaiement,
    litigesOuverts: input.litigesOuverts,
    versementsEnRetard: input.versementsEnRetard,
    boutiquesTotal: input.boutiquesTotal,
    caPrecedent: input.caPrecedent,
    ticketsPrecedent: input.ticketsPrecedent,
    panierMoyen: panierMoyen(input.caReseau, input.tickets),
    panierMoyenWeb: panierMoyen(input.caWeb, input.commandesWeb),
    caTotal: input.caReseau + input.caWeb,
    boutiquesActives: input.parBoutique.filter((b) => b.tickets > 0).length,
  };
}

export function classementBoutiques(parBoutique: BoutiqueCa[]): BoutiqueCa[] {
  return [...parBoutique].sort(
    (a, b) => b.ca - a.ca || b.tickets - a.tickets || a.nom.localeCompare(b.nom),
  );
}

export function partCa(boutique: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((boutique / total) * 10_000) / 100;
}

export function panierMoyen(ca: number, n: number): number {
  if (n <= 0) return 0;
  return Math.round(ca / n);
}

/** Variation en % ; `null` si la base précédente est nulle et l’actuel > 0. */
export function evolutionPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

export function libelleHorizon(h: HorizonVentes): string {
  if (h === 'SEMAINE') return 'semaine';
  if (h === 'MOIS') return 'mois';
  return 'journée';
}

export function libelleModePaiement(mode: string): string {
  if (mode === 'ESPECES') return 'Espèces';
  if (mode === 'CARTE') return 'Carte';
  if (mode === 'MOBILE_MONEY') return 'Mobile money';
  return mode;
}

export function pointsAttentionVentes(s: SnapshotVentes): string[] {
  const points: string[] = [];
  if (s.tickets === 0 && s.commandesWeb === 0) {
    points.push('Aucune vente magasin ni commande web sur la période.');
  }
  const silencieuses = s.parBoutique.filter((b) => b.tickets === 0).map((b) => b.nom);
  if (silencieuses.length > 0 && s.boutiquesTotal > 1) {
    points.push(
      `${silencieuses.length} magasin(s) sans ticket : ${silencieuses.join(', ')}.`,
    );
  }
  if (s.litigesOuverts > 0) {
    points.push(
      `${s.litigesOuverts} litige(s) de versement ouverts — à faire arbitrer par le Contrôle interne (§6.4).`,
    );
  }
  if (s.versementsEnRetard > 0) {
    points.push(
      `${s.versementsEnRetard} versement(s) magasin → centrale hors délai.`,
    );
  }
  if (s.caReseau > 0 && s.caWeb === 0 && s.commandesWeb === 0) {
    points.push(
      'Le CA est 100 % magasin : la boutique en ligne n’a pas encore encaissé sur la période.',
    );
  }
  const evo = evolutionPct(s.caTotal, s.caPrecedent);
  if (evo !== null && evo <= -20 && s.caPrecedent > 0) {
    points.push(
      `CA total en baisse de ${Math.abs(evo)} % par rapport à la période précédente.`,
    );
  }
  return points;
}

export function astucesShop(s: SnapshotShop, role: RoleLibelle): string[] {
  if (s.produitsVisibles === 0) {
    if (role === RoleLibelle.RESPONSABLE_SI) {
      return [
        'Activer visibleWeb et renseigner prixWeb / photo sur les références vendables.',
        'Vérifier ParametreShop (shop actif, entrepôt web, modes de paiement).',
      ];
    }
    return [
      'Le catalogue en ligne est vide : sans fiches visibles, aucun client ne peut commander.',
      'Demander au SI / catalogue de publier les best-sellers magasin (photo + prix web).',
    ];
  }
  if (role === RoleLibelle.RESPONSABLE_CRM) {
    return [
      'Mettre en avant le click & collect et Wave / Orange Money sur les fiches.',
      'Relancer les clients fidélité vers le site (lien parrainage déjà tracé, sans remise inventée).',
    ];
  }
  if (role === RoleLibelle.DAF) {
    return [
      'Chaque commande web payée entre dans le même grand livre que le POS — pas un circuit parallèle.',
      'Suivre le panier moyen et le taux de conversion (CRM → Croissance boutique).',
    ];
  }
  if (role === RoleLibelle.RESPONSABLE_SI) {
    return [
      'Contrôler slugs, images, stock entrepôt web et webhooks PSP.',
      'Le ranking accueil suit les ventes réelles 24 h / 7 j / 30 j.',
    ];
  }
  return [
    'La boutique en ligne est un 11e magasin : mêmes stocks, mêmes prix paramétrés.',
    'Ouvrir le CRM pour voir le funnel (visites → panier → commandes).',
  ];
}

export function messageRelance(
  role: RoleLibelle,
  heuresSansConnexion: number,
): { objet: string; accroche: string; pourquoi: string } {
  const jours = Math.max(2, Math.round(heuresSansConnexion / 24));
  switch (role) {
    case RoleLibelle.DIRECTION_GENERALE:
      return {
        objet: `Votre réseau a tourné ${jours} j sans votre connexion CRM`,
        accroche:
          'Les boutiques encaissent, les versements avancent, les litiges éventuels restent sans regard Direction.',
        pourquoi:
          'Une connexion quotidienne vous donne le CA par magasin, les écarts et la file web — sans déléguer la validation de caisse (§6.4).',
      };
    case RoleLibelle.DAF:
      return {
        objet: `Pilotage finance : ${jours} j sans connexion`,
        accroche:
          'Soldes de caisses, versements en transit et écarts se recalculent en continu depuis le grand livre.',
        pourquoi:
          'Le cockpit DAF (trésorerie, stocks valorisés, litiges) n’est à jour que si vous l’ouvrez — rien n’est figé dans un tableur.',
      };
    case RoleLibelle.CAISSIER_CENTRAL:
      return {
        objet: `Caisse centrale : ${jours} j sans réception / validation`,
        accroche:
          'Les versements magasin restent en transit tant que vous ne les réceptionnez pas — personne d’autre ne peut solder (§6.4).',
        pourquoi:
          'Seuls Caissier Central et DAF réceptionnent et valident. Une revue de la file (Initiée → Transit → Réceptionnée) débloque le réseau.',
      };
    case RoleLibelle.CONTROLEUR_INTERNE:
      return {
        objet: `Audit : ${jours} j sans passage sur le journal`,
        accroche:
          'Les tentatives d’accès et les litiges de versement s’accumulent en append-only.',
        pourquoi:
          'Votre rôle est lecture + arbitrage des litiges — une revue courte suffit, sans valider une caisse.',
      };
    case RoleLibelle.RESPONSABLE_SI:
      return {
        objet: `SI : ${jours} j sans revue de la boutique / des comptes`,
        accroche:
          'Shop, comptes, audit et paramètres restent sous votre responsabilité opérationnelle.',
        pourquoi:
          'Une connexion permet de voir les commandes web, les alertes d’accès et l’état du catalogue publié.',
      };
    case RoleLibelle.RESPONSABLE_CRM:
      return {
        objet: `CRM : ${jours} j sans animation client`,
        accroche:
          'Fiches réseau, fidélité et funnel boutique n’attendent pas une campagne pour exister.',
        pourquoi:
          'Ouvrez Clients / Croissance boutique pour voir visites, paniers et parrainages réels.',
      };
    default:
      return {
        objet: 'Votre espace CRM vous attend',
        accroche: 'Des faits métier ont été enregistrés pendant votre absence.',
        pourquoi: 'Connectez-vous pour consulter uniquement le périmètre de votre rôle.',
      };
  }
}

export function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export type SessionClotureVue = {
  id: string;
  statut: 'OUVERTE' | 'FERMEE';
  ouvertureDateHeure: Date;
  clotureDateHeure: Date | null;
  clotureTemoinId: string | null;
  boutiqueNom: string;
  caisseLibelle: string;
};

export type LigneDisciplineCloture = {
  nom: string;
  fermeesOk: number;
  fermeesSansTemoin: number;
  encoreOuvertes: number;
};

export type SnapshotCloture = {
  heureFinService: number;
  enRetard: SessionClotureVue[];
  bienFermees: SessionClotureVue[];
  parBoutique: LigneDisciplineCloture[];
};

export function heureAbidjan(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_BRIEFING,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h : 0;
}

export function serviceTermine(
  now: Date,
  heureFin = HEURE_FIN_SERVICE_DEFAUT,
): boolean {
  return heureAbidjan(now) >= heureFin;
}

/** Session encore ouverte après la fin de service, ou ouverte un jour précédent. */
export function sessionEnRetardCloture(
  s: SessionClotureVue,
  now: Date,
  heureFin = HEURE_FIN_SERVICE_DEFAUT,
): boolean {
  if (s.statut !== 'OUVERTE') return false;
  const jourOuv = jourCleAbidjan(s.ouvertureDateHeure);
  const jourNow = jourCleAbidjan(now);
  if (jourOuv < jourNow) return true;
  return jourOuv === jourNow && serviceTermine(now, heureFin);
}

export function clotureConforme(s: SessionClotureVue): boolean {
  return (
    s.statut === 'FERMEE' &&
    Boolean(s.clotureTemoinId) &&
    Boolean(s.clotureDateHeure)
  );
}

export function synthetiserCloture(
  sessions: SessionClotureVue[],
  now: Date,
  heureFin = HEURE_FIN_SERVICE_DEFAUT,
): SnapshotCloture {
  const enRetard = sessions.filter((s) =>
    sessionEnRetardCloture(s, now, heureFin),
  );
  const bienFermees = sessions.filter((s) => clotureConforme(s));
  const parMap = new Map<string, LigneDisciplineCloture>();
  const bump = (nom: string) => {
    const row = parMap.get(nom) ?? {
      nom,
      fermeesOk: 0,
      fermeesSansTemoin: 0,
      encoreOuvertes: 0,
    };
    parMap.set(nom, row);
    return row;
  };
  for (const s of sessions) {
    const row = bump(s.boutiqueNom);
    if (s.statut === 'OUVERTE') row.encoreOuvertes += 1;
    else if (clotureConforme(s)) row.fermeesOk += 1;
    else row.fermeesSansTemoin += 1;
  }
  const parBoutique = [...parMap.values()].sort(
    (a, b) =>
      b.fermeesOk - a.fermeesOk ||
      a.encoreOuvertes - b.encoreOuvertes ||
      a.nom.localeCompare(b.nom),
  );
  return { heureFinService: heureFin, enRetard, bienFermees, parBoutique };
}
