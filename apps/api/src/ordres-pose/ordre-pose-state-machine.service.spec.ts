import { BadRequestException } from '@nestjs/common';
import type { StatutOrdrePose as StatutOrdrePoseType } from '@caisse-crm/shared';

// Même contournement que transaction-state-machine.service.spec.ts (voir ce
// fichier pour le détail) : `packages/shared` est ESM, Jest (config unitaire
// de apps/api) ne le transpile pas — on charge donc le fichier source réel
// à l'exécution plutôt que de recopier les valeurs à la main.
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

import { StatutOrdrePose } from '@caisse-crm/shared';
import { OrdrePoseStateMachineService } from './ordre-pose-state-machine.service';

type Statut = StatutOrdrePoseType;

// Test unitaire pur (aucune DB nécessaire) de la machine à états de
// l'OrdreDePose (extension pose/installation validée par l'utilisateur,
// hors MCD §6.5 d'origine) : EN_ATTENTE -> EN_COURS -> TERMINEE
//                                                    -> ANNULEE (depuis EN_ATTENTE ou EN_COURS)
describe('OrdrePoseStateMachineService', () => {
  let service: OrdrePoseStateMachineService;

  beforeEach(() => {
    service = new OrdrePoseStateMachineService();
  });

  describe('transitions légales', () => {
    it.each([
      [StatutOrdrePose.EN_ATTENTE, StatutOrdrePose.EN_COURS],
      [StatutOrdrePose.EN_ATTENTE, StatutOrdrePose.ANNULEE],
      [StatutOrdrePose.EN_COURS, StatutOrdrePose.TERMINEE],
      [StatutOrdrePose.EN_COURS, StatutOrdrePose.ANNULEE],
    ])('autorise %s -> %s', (depuis: Statut, vers: Statut) => {
      expect(() =>
        service.assertTransitionAutorisee(depuis, vers),
      ).not.toThrow();
    });
  });

  describe('transitions illégales', () => {
    it.each([
      [StatutOrdrePose.EN_ATTENTE, StatutOrdrePose.TERMINEE],
      [StatutOrdrePose.EN_COURS, StatutOrdrePose.EN_ATTENTE],
      [StatutOrdrePose.TERMINEE, StatutOrdrePose.EN_COURS],
      [StatutOrdrePose.TERMINEE, StatutOrdrePose.ANNULEE],
      [StatutOrdrePose.ANNULEE, StatutOrdrePose.EN_COURS],
      [StatutOrdrePose.ANNULEE, StatutOrdrePose.TERMINEE],
    ])('rejette %s -> %s', (depuis: Statut, vers: Statut) => {
      expect(() => service.assertTransitionAutorisee(depuis, vers)).toThrow(
        BadRequestException,
      );
    });
  });

  it('TERMINEE et ANNULEE sont terminaux (aucune transition possible)', () => {
    expect(service.transitionsPermises(StatutOrdrePose.TERMINEE)).toEqual([]);
    expect(service.transitionsPermises(StatutOrdrePose.ANNULEE)).toEqual([]);
  });
});
