import { renderShopEmailHtml } from './shop-email.service';

describe('renderShopEmailHtml', () => {
  it('bienvenue_compte — contenu personnalisé sans référence commande', () => {
    const html = renderShopEmailHtml('bienvenue_compte', {
      prenom: 'Ousmane',
      compteUrl: 'https://www.majorautoparts.shop/compte',
      catalogueUrl: 'https://www.majorautoparts.shop/catalogue',
      codeParrainage: 'MA12AB34',
    });

    expect(html).toContain('Bienvenue, Ousmane');
    expect(html).toContain('Programme parrainage');
    expect(html).toContain('MA12AB34');
    expect(html).toContain('Découvrir le catalogue');
    expect(html).toContain('Accéder à mon compte');
    expect(html).not.toContain('Réf.');
  });

  it('mot_de_passe_oublie — affiche le mot de passe temporaire', () => {
    const html = renderShopEmailHtml('mot_de_passe_oublie', {
      temporaryPassword: 'abc123temp',
      compteUrl: 'https://www.majorautoparts.shop/compte',
    });

    expect(html).toContain('abc123temp');
    expect(html).not.toContain('Réf.');
  });
});
