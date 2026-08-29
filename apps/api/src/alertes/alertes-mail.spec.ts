import {
  renderMailDigestDaf,
  renderMailPointNonVerse,
  renderMailReceptionDaf,
} from './alertes-mail';

describe('mails alerte fonds', () => {
  it('point non versé nomme la boutique et le DAF', () => {
    const mail = renderMailPointNonVerse({
      boutique: 'Marcory',
      montant: '2000.00',
      ageHeures: 30,
      ctaUrl: 'https://crm.example/pos',
    });
    expect(mail.objet).toContain('Marcory');
    expect(mail.text).toContain('trésorerie principale');
    expect(mail.html).toContain('2000.00');
    expect(mail.html).toContain('DAF');
  });

  it('réception DAF pointe le transit', () => {
    const mail = renderMailReceptionDaf({
      boutique: 'Cocody',
      montant: '15000.00',
      ctaUrl: 'https://crm.example/transactions/x',
    });
    expect(mail.objet).toContain('Réception DAF');
    expect(mail.html).toContain('Cocody');
    expect(mail.html).toContain('Réceptionner');
  });

  it('digest DAF liste non transférés et à réceptionner', () => {
    const mail = renderMailDigestDaf({
      nonTransferes: [
        {
          boutique: 'A',
          montant: '1000',
          etape: 'Non transféré',
          age: '26 h',
        },
      ],
      aReceptionner: [
        {
          boutique: 'B',
          montant: '5000',
          etape: 'En transit',
          age: '2 h',
        },
      ],
      ctaUrl: 'https://crm.example/tresorerie/reception',
    });
    expect(mail.objet).toContain('2 point');
    expect(mail.html).toContain('Non transférés');
    expect(mail.html).toContain('réception DAF');
    expect(mail.text).toContain('A : 1000');
    expect(mail.text).toContain('B : 5000');
  });
});
