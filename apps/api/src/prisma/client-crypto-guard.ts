// Chiffrement transparent des champs sensibles de Client (§6.7). Le delegate
// Prisma `client` est enveloppé dans un Proxy qui chiffre `contact` et
// `adresse` avant toute écriture (create/update) et les déchiffre après
// toute lecture (create/update/findUnique/findFirst/findMany), afin que le
// reste de l'application (services, DTO, frontend) continue de manipuler du
// texte en clair sans jamais y penser — seule la colonne en base contient le
// ciphertext.
//
// Même contrainte que ledger-guard.ts : Prisma 6 n'expose plus $use, donc
// l'interception se fait par Proxy sur le delegate plutôt que par middleware
// ou Client Extension.

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  chiffrerNullable,
  dechiffrerNullable,
  hasherContact,
} from './field-crypto';

type ClientDelegate = PrismaClient['client'];

const CHAMPS_CHIFFRES = ['contact', 'adresse'] as const;

function chiffrerDonnees(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return data;
  const copie: Record<string, unknown> = {
    ...(data as Record<string, unknown>),
  };
  for (const champ of CHAMPS_CHIFFRES) {
    if (Object.prototype.hasOwnProperty.call(copie, champ)) {
      const valeur = copie[champ];
      if (
        valeur === null ||
        valeur === undefined ||
        typeof valeur === 'string'
      ) {
        if (champ === 'contact') {
          copie.contactHash =
            typeof valeur === 'string' && valeur.trim().length > 0
              ? hasherContact(valeur)
              : null;
        }
        copie[champ] = chiffrerNullable(valeur);
      }
    }
  }
  return copie;
}

function dechiffrerLigne<T>(ligne: T): T {
  if (ligne === null || typeof ligne !== 'object') return ligne;
  const copie = ligne as Record<string, unknown>;
  for (const champ of CHAMPS_CHIFFRES) {
    if (Object.prototype.hasOwnProperty.call(copie, champ)) {
      const valeur = copie[champ];
      if (valeur === null || typeof valeur === 'string') {
        copie[champ] = dechiffrerNullable(valeur);
      }
    }
  }
  return copie as T;
}

export function guardClientDelegate(delegate: ClientDelegate): ClientDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (prop === 'create') {
        return async (args: Prisma.ClientCreateArgs) => {
          const result = await target.create({
            ...args,
            data: chiffrerDonnees(args.data) as Prisma.ClientCreateArgs['data'],
          });
          return dechiffrerLigne(result);
        };
      }

      if (prop === 'update') {
        return async (args: Prisma.ClientUpdateArgs) => {
          const result = await target.update({
            ...args,
            data: chiffrerDonnees(args.data) as Prisma.ClientUpdateArgs['data'],
          });
          return dechiffrerLigne(result);
        };
      }

      if (prop === 'findUnique') {
        return async (args: Prisma.ClientFindUniqueArgs) => {
          const result = await target.findUnique(args);
          return result === null ? result : dechiffrerLigne(result);
        };
      }

      if (prop === 'findFirst') {
        return async (args?: Prisma.ClientFindFirstArgs) => {
          const result = await target.findFirst(args);
          return result === null ? result : dechiffrerLigne(result);
        };
      }

      if (prop === 'findMany') {
        return async (args?: Prisma.ClientFindManyArgs) => {
          const result = await target.findMany(args);
          return result.map((ligne) => dechiffrerLigne(ligne));
        };
      }

      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export function guardClientTransactionClient<T extends object>(tx: T): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'client') {
        return guardClientDelegate(
          Reflect.get(target, prop, receiver) as ClientDelegate,
        );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}
