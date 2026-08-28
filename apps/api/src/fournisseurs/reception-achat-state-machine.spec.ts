import { BadRequestException } from '@nestjs/common';

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
  const sourcePath = path.resolve(
    __dirname,
    '../../../../packages/shared/src/enums.ts',
  );
  const { outputText } = ts.transpileModule(
    fs.readFileSync(sourcePath, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );
  const mod = new Module(sourcePath) as InstanceType<typeof Module> & {
    _compile(content: string, filename: string): unknown;
  };
  mod.filename = sourcePath;
  mod.paths = (
    Module as unknown as { _nodeModulePaths(from: string): string[] }
  )._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(outputText, sourcePath);
  return mod.exports as unknown;
});

import { StatutReceptionAchat } from '@caisse-crm/shared';
import { ReceptionAchatStateMachine } from './reception-achat-state-machine';

describe('ReceptionAchatStateMachine', () => {
  const machine = new ReceptionAchatStateMachine();

  it.each([
    [StatutReceptionAchat.QUANTITATIVE, StatutReceptionAchat.QUALITE_VALIDEE],
    [StatutReceptionAchat.QUALITE_VALIDEE, StatutReceptionAchat.MISE_EN_STOCK],
  ])('autorise %s → %s', (depuis, vers) => {
    expect(() => machine.assertTransition(depuis, vers)).not.toThrow();
  });

  it('interdit de créditer le stock avant la décision qualité', () => {
    expect(() =>
      machine.assertTransition(
        StatutReceptionAchat.QUANTITATIVE,
        StatutReceptionAchat.MISE_EN_STOCK,
      ),
    ).toThrow(BadRequestException);
  });

  it('rend la mise en stock terminale', () => {
    expect(() =>
      machine.assertTransition(
        StatutReceptionAchat.MISE_EN_STOCK,
        StatutReceptionAchat.QUALITE_VALIDEE,
      ),
    ).toThrow(BadRequestException);
  });
});
