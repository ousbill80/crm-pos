import type {
  RoleLibelle as RoleLibelleType,
  StatutCommandeAchat as StatutCommandeAchatType,
  StatutDemandeAchat as StatutDemandeAchatType,
} from '@caisse-crm/shared';

jest.mock('@caisse-crm/shared', () => {
  // Charge les constantes partagées réelles malgré le décalage ESM/CommonJS
  // préexistant entre le package shared et la configuration Jest de l'API.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ts = require('typescript') as typeof import('typescript');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Module } = require('node:module') as typeof import('node:module');

  const enumsPath = path.resolve(
    __dirname,
    '../../../../packages/shared/src/enums.ts',
  );
  const source = fs.readFileSync(enumsPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  interface ModuleWithInternals extends InstanceType<typeof Module> {
    _compile(content: string, filename: string): unknown;
  }
  interface ModuleConstructorWithInternals {
    _nodeModulePaths(from: string): string[];
  }

  const mod = new Module(enumsPath) as ModuleWithInternals;
  mod.filename = enumsPath;
  mod.paths = (
    Module as unknown as ModuleConstructorWithInternals
  )._nodeModulePaths(path.dirname(enumsPath));
  mod._compile(outputText, enumsPath);
  return mod.exports as unknown;
});

import {
  ROLES_VALIDATION_CAISSE_CENTRALE,
  RoleLibelle,
  StatutCommandeAchat,
  StatutDemandeAchat,
  TRANSITIONS_COMMANDE_ACHAT,
  TRANSITIONS_DEMANDE_ACHAT,
} from '@caisse-crm/shared';
import {
  ROLES_APPROBATION_COMMANDE_ACHAT,
  ROLES_COMPTABILISATION_FOURNISSEUR,
  ROLES_CONTROLE_QUALITE_RECEPTION,
  ROLES_FICHE_FOURNISSEUR,
  ROLES_PAIEMENT_FOURNISSEUR,
  ROLES_RECEPTION_STOCK,
  ROLES_SAISIE_COMMANDE_ACHAT,
  ROLES_SAISIE_FACTURE_FOURNISSEUR,
} from '../caisses/access-scope.constants';

type Role = RoleLibelleType;
type StatutCommande = StatutCommandeAchatType;
type StatutDemande = StatutDemandeAchatType;

describe('socle P2P partagé', () => {
  it('préserve les transitions historiques des commandes', () => {
    expect(TRANSITIONS_COMMANDE_ACHAT[StatutCommandeAchat.BROUILLON]).toEqual(
      expect.arrayContaining([
        StatutCommandeAchat.CONFIRMEE,
        StatutCommandeAchat.ANNULEE,
      ]),
    );
    expect(TRANSITIONS_COMMANDE_ACHAT[StatutCommandeAchat.CONFIRMEE]).toEqual(
      expect.arrayContaining([
        StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE,
        StatutCommandeAchat.RECEPTIONNEE,
      ]),
    );
  });

  it.each<[StatutDemande, StatutDemande]>([
    [StatutDemandeAchat.BROUILLON, StatutDemandeAchat.SOUMISE],
    [StatutDemandeAchat.SOUMISE, StatutDemandeAchat.APPROUVEE],
    [StatutDemandeAchat.SOUMISE, StatutDemandeAchat.REJETEE],
    [StatutDemandeAchat.APPROUVEE, StatutDemandeAchat.CONVERTIE],
    [StatutDemandeAchat.REJETEE, StatutDemandeAchat.BROUILLON],
  ])('autorise la demande %s → %s', (depuis, vers) => {
    expect(TRANSITIONS_DEMANDE_ACHAT[depuis]).toContain(vers);
  });

  it('interdit les sauts et rend les demandes finales terminales', () => {
    expect(
      TRANSITIONS_DEMANDE_ACHAT[StatutDemandeAchat.BROUILLON],
    ).not.toContain(StatutDemandeAchat.APPROUVEE);
    expect(TRANSITIONS_DEMANDE_ACHAT[StatutDemandeAchat.CONVERTIE]).toEqual([]);
    expect(TRANSITIONS_DEMANDE_ACHAT[StatutDemandeAchat.ANNULEE]).toEqual([]);
  });

  it.each<[StatutCommande, StatutCommande]>([
    [StatutCommandeAchat.SOUMISE_APPROBATION, StatutCommandeAchat.APPROUVEE],
    [StatutCommandeAchat.SOUMISE_APPROBATION, StatutCommandeAchat.REJETEE],
    [StatutCommandeAchat.REJETEE, StatutCommandeAchat.BROUILLON],
    [StatutCommandeAchat.APPROUVEE, StatutCommandeAchat.CONFIRMEE],
    [StatutCommandeAchat.APPROUVEE, StatutCommandeAchat.EN_PRODUCTION],
    [StatutCommandeAchat.EN_PRODUCTION, StatutCommandeAchat.EXPEDIEE],
    [StatutCommandeAchat.EXPEDIEE, StatutCommandeAchat.EN_TRANSIT],
    [StatutCommandeAchat.EN_TRANSIT, StatutCommandeAchat.EN_DOUANE],
    [StatutCommandeAchat.EN_DOUANE, StatutCommandeAchat.DEDOUANEE],
    [StatutCommandeAchat.DEDOUANEE, StatutCommandeAchat.CONFIRMEE],
  ])('autorise la commande P2P %s → %s', (depuis, vers) => {
    expect(TRANSITIONS_COMMANDE_ACHAT[depuis]).toContain(vers);
  });
});

describe('séparation des tâches P2P', () => {
  const nouveauxRoles: Role[] = [
    RoleLibelle.ACHATS,
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    RoleLibelle.QUALITE_STOCKS,
    RoleLibelle.RAF_COMPTABLE,
  ];

  it('n’accorde jamais la validation caisse §6.4 aux nouveaux rôles', () => {
    expect(
      nouveauxRoles.filter((role) =>
        ROLES_VALIDATION_CAISSE_CENTRALE.includes(role),
      ),
    ).toEqual([]);
  });

  it('sépare saisie achat, approbation, réception, qualité et comptabilité', () => {
    expect(ROLES_SAISIE_COMMANDE_ACHAT).toContain(RoleLibelle.ACHATS);
    expect(ROLES_APPROBATION_COMMANDE_ACHAT).not.toContain(RoleLibelle.ACHATS);
    expect(ROLES_RECEPTION_STOCK).toContain(
      RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    );
    expect(ROLES_CONTROLE_QUALITE_RECEPTION).toEqual(
      expect.arrayContaining([RoleLibelle.QUALITE_STOCKS]),
    );
    expect(ROLES_SAISIE_FACTURE_FOURNISSEUR).toContain(
      RoleLibelle.RAF_COMPTABLE,
    );
    expect(ROLES_COMPTABILISATION_FOURNISSEUR).toEqual(
      expect.arrayContaining([RoleLibelle.RAF_COMPTABLE]),
    );
  });

  it('réserve les paiements à la trésorerie et exclut tous les nouveaux rôles', () => {
    expect(
      nouveauxRoles.filter((role) => ROLES_PAIEMENT_FOURNISSEUR.includes(role)),
    ).toEqual([]);
  });

  it('limite la fiche fournisseur aux Achats parmi les nouveaux rôles', () => {
    expect(
      nouveauxRoles.filter((role) => ROLES_FICHE_FOURNISSEUR.includes(role)),
    ).toEqual([RoleLibelle.ACHATS]);
  });
});
