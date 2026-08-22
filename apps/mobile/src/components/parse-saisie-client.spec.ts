import { describe, expect, it } from 'vitest';
import { parseSaisieClient } from './parse-saisie-client';

describe('parseSaisieClient (EntityFinder auto-create)', () => {
  it('découpe prénom + nom', () => {
    expect(parseSaisieClient('Aïssatou Diallo')).toEqual({
      prenom: 'Aïssatou',
      nom: 'Diallo',
    });
  });

  it('mot unique → prénom = nom', () => {
    expect(parseSaisieClient('Fatou')).toEqual({
      prenom: 'Fatou',
      nom: 'Fatou',
    });
  });

  it('téléphone → contact + fiche minimale', () => {
    expect(parseSaisieClient('77 123 45 67')).toEqual({
      prenom: 'Nouveau',
      nom: 'Client',
      contact: '771234567',
    });
  });
});
