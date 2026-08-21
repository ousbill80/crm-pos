import { BadRequestException } from '@nestjs/common';
import type { StatutTransaction as StatutTransactionType } from '@caisse-crm/shared';

// ---------------------------------------------------------------------------
// Contournement d'un défaut d'infrastructure préexistant (hors périmètre de
// ce module — voir rapport de fin de tâche) : `packages/shared` est un
// package ESM (`"type": "module"`) et `apps/api/tsconfig.json` utilise
// `"module": "nodenext"`, qui préserve la syntaxe `export` ESM lors de la
// compilation de `packages/shared/src/enums.ts` même sous Jest (CommonJS).
// Le jeu de tests d'intégration (`apps/api/test/jest-e2e.json`) contourne
// déjà ce problème via `moduleNameMapper` + une configuration `ts-jest`
// dédiée ; la configuration `jest` de `apps/api/package.json` (tests
// unitaires) n'a pas cette configuration et est hors du périmètre autorisé
// de cette tâche (uniquement `apps/api/src/transactions/`, `apps/api/test/`
// et `apps/api/src/app.module.ts`).
//
// Pour ne pas dépendre d'une modification de configuration hors périmètre
// tout en respectant la consigne « ne jamais redéfinir » les constantes de
// `packages/shared/src/enums.ts`, ce fichier charge et transpile le
// fichier source RÉEL à l'exécution (aucune valeur recopiée à la main) et
// l'injecte via `jest.mock`, qui intercepte aussi bien l'import du test que
// l'import transitif fait par `TransactionStateMachineService` lui-même.
jest.mock('@caisse-crm/shared', () => {
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

// L'import ci-dessous est intercepté par jest.mock() ci-dessus, qui renvoie
// les valeurs RÉELLES de packages/shared/src/enums.ts (transpilées depuis le
// fichier source authentique, jamais recopiées à la main).
import { StatutTransaction } from '@caisse-crm/shared';
import { TransactionStateMachineService } from './transaction-state-machine.service';

type Statut = StatutTransactionType;

// Test unitaire pur (aucune DB nécessaire) de la machine à états §6.4 :
//   INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE
//                                          -> LITIGE -> VALIDEE (régularisation)
describe('TransactionStateMachineService', () => {
  let service: TransactionStateMachineService;

  beforeEach(() => {
    service = new TransactionStateMachineService();
  });

  describe('transitions légales', () => {
    it.each([
      [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
      [StatutTransaction.EN_TRANSIT, StatutTransaction.RECEPTIONNEE],
      [StatutTransaction.RECEPTIONNEE, StatutTransaction.VALIDEE],
      [StatutTransaction.RECEPTIONNEE, StatutTransaction.LITIGE],
      [StatutTransaction.LITIGE, StatutTransaction.VALIDEE],
    ])('autorise %s -> %s', (depuis: Statut, vers: Statut) => {
      expect(() =>
        service.assertTransitionAutorisee(depuis, vers),
      ).not.toThrow();
    });
  });

  describe('transitions illégales', () => {
    it.each([
      [StatutTransaction.INITIEE, StatutTransaction.RECEPTIONNEE],
      [StatutTransaction.INITIEE, StatutTransaction.VALIDEE],
      [StatutTransaction.INITIEE, StatutTransaction.LITIGE],
      [StatutTransaction.EN_TRANSIT, StatutTransaction.INITIEE],
      [StatutTransaction.EN_TRANSIT, StatutTransaction.VALIDEE],
      [StatutTransaction.EN_TRANSIT, StatutTransaction.LITIGE],
      [StatutTransaction.RECEPTIONNEE, StatutTransaction.EN_TRANSIT],
      [StatutTransaction.RECEPTIONNEE, StatutTransaction.INITIEE],
      [StatutTransaction.VALIDEE, StatutTransaction.LITIGE],
      [StatutTransaction.VALIDEE, StatutTransaction.RECEPTIONNEE],
      [StatutTransaction.LITIGE, StatutTransaction.RECEPTIONNEE],
      [StatutTransaction.LITIGE, StatutTransaction.EN_TRANSIT],
      [StatutTransaction.LITIGE, StatutTransaction.INITIEE],
    ])('rejette %s -> %s', (depuis: Statut, vers: Statut) => {
      expect(() => service.assertTransitionAutorisee(depuis, vers)).toThrow(
        BadRequestException,
      );
    });
  });

  it('VALIDEE est terminal ; LITIGE n’autorise que VALIDEE (régularisation)', () => {
    expect(service.transitionsPermises(StatutTransaction.VALIDEE)).toEqual([]);
    expect(service.transitionsPermises(StatutTransaction.LITIGE)).toEqual([
      StatutTransaction.VALIDEE,
    ]);
  });
});
