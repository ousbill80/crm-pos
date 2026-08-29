jest.mock('@caisse-crm/shared', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- factory jest.mock hoistée */
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const ts = require('typescript') as typeof import('typescript');
  const { Module } = require('node:module') as typeof import('node:module');
  /* eslint-enable @typescript-eslint/no-require-imports */
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
  mod._compile(outputText, sourcePath);
  return mod.exports as typeof import('@caisse-crm/shared');
});

import {
  ModeFulfillmentCommandeWeb,
  ModeReglementCommandeWeb,
  StatutCommandeWeb,
} from '@caisse-crm/shared';
import {
  statutApresCheckout,
  transitionCommandeWebAutorisee,
  transitionsCommandeWebAutorisees,
} from './commande-web-state-machine';

describe('commande-web-state-machine', () => {
  const prepaid = {
    modeReglement: ModeReglementCommandeWeb.PREPAYE_PSP,
    modeFulfillment: ModeFulfillmentCommandeWeb.LIVRAISON,
  };

  const differeRetrait = {
    modeReglement: ModeReglementCommandeWeb.PAIEMENT_RETRAIT,
    modeFulfillment: ModeFulfillmentCommandeWeb.RETRAIT_BOUTIQUE,
  };

  it('checkout prépayé → EN_ATTENTE_PAIEMENT', () => {
    expect(statutApresCheckout(ModeReglementCommandeWeb.PREPAYE_PSP)).toBe(
      StatutCommandeWeb.EN_ATTENTE_PAIEMENT,
    );
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PANIER,
        StatutCommandeWeb.EN_ATTENTE_PAIEMENT,
        prepaid,
      ),
    ).toBe(true);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PANIER,
        StatutCommandeWeb.PREPARATION,
        prepaid,
      ),
    ).toBe(false);
  });

  it('checkout différé → PREPARATION directe', () => {
    expect(statutApresCheckout(ModeReglementCommandeWeb.PAIEMENT_RETRAIT)).toBe(
      StatutCommandeWeb.PREPARATION,
    );
    expect(
      statutApresCheckout(ModeReglementCommandeWeb.PAIEMENT_LIVRAISON),
    ).toBe(StatutCommandeWeb.PREPARATION);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PANIER,
        StatutCommandeWeb.PREPARATION,
        differeRetrait,
      ),
    ).toBe(true);
  });

  it('webhook PSP → PAYEE → PREPARATION', () => {
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.EN_ATTENTE_PAIEMENT,
        StatutCommandeWeb.PAYEE,
        prepaid,
      ),
    ).toBe(true);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PAYEE,
        StatutCommandeWeb.PREPARATION,
        prepaid,
      ),
    ).toBe(true);
  });

  it('retrait : PREPARATION → PRETE → REMISE → PAYEE (différé)', () => {
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PREPARATION,
        StatutCommandeWeb.PRETE,
        differeRetrait,
      ),
    ).toBe(true);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PRETE,
        StatutCommandeWeb.REMISE,
        differeRetrait,
      ),
    ).toBe(true);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.REMISE,
        StatutCommandeWeb.PAYEE,
        differeRetrait,
      ),
    ).toBe(true);
  });

  it('livraison : PREPARATION → EXPEDIEE → LIVREE', () => {
    const ctx = {
      modeReglement: ModeReglementCommandeWeb.PAIEMENT_LIVRAISON,
      modeFulfillment: ModeFulfillmentCommandeWeb.LIVRAISON,
    };
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PREPARATION,
        StatutCommandeWeb.EXPEDIEE,
        ctx,
      ),
    ).toBe(true);
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.EXPEDIEE,
        StatutCommandeWeb.LIVREE,
        ctx,
      ),
    ).toBe(true);
  });

  it('refuse transition fulfillment incompatible', () => {
    expect(
      transitionCommandeWebAutorisee(
        StatutCommandeWeb.PREPARATION,
        StatutCommandeWeb.EXPEDIEE,
        differeRetrait,
      ),
    ).toBe(false);
  });

  it('liste transitions filtrées par contexte', () => {
    const transitions = transitionsCommandeWebAutorisees(
      StatutCommandeWeb.PANIER,
      differeRetrait,
    );
    expect(transitions).toContain(StatutCommandeWeb.PREPARATION);
    expect(transitions).not.toContain(StatutCommandeWeb.EN_ATTENTE_PAIEMENT);
  });
});
