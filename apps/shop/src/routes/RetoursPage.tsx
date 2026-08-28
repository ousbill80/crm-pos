import { Link } from 'react-router-dom';

const MAJ = '28 août 2026';

export default function RetoursPage() {
  return (
    <article className="section legal-page">
      <header className="legal-head">
        <p className="legal-kicker">Service client</p>
        <h1>Retours &amp; échanges</h1>
        <p className="legal-meta">MAJOR AUTO PARTS · Dernière mise à jour : {MAJ}</p>
      </header>

      <div className="legal-intro panel">
        <p>
          Nous souhaitons que chaque pièce corresponde à votre véhicule. Cette
          page décrit les conditions de retour, d’échange et de remboursement
          pour les commandes passées sur la boutique en ligne MAJOR AUTO PARTS.
        </p>
      </div>

      <section className="legal-block">
        <h2>1. Délai</h2>
        <p>
          Vous disposez de <strong>7 jours calendaires</strong> à compter de la
          date de livraison ou de retrait showroom pour demander un retour ou
          un échange, sauf exceptions ci-dessous.
        </p>
      </section>

      <section className="legal-block">
        <h2>2. Conditions d’acceptation</h2>
        <p>Le retour est accepté si :</p>
        <ul>
          <li>
            l’article est neuf, non monté, non installé, dans son emballage
            d’origine avec accessoires et notices ;
          </li>
          <li>aucune trace d’usage, de peinture, de perçage ou de modification ;</li>
          <li>
            la demande est formulée via le suivi de commande, l’espace compte
            ou le showroom, avec le numéro de commande ;
          </li>
          <li>la preuve d’achat (commande MAJOR) est fournie.</li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>3. Cas exclus</h2>
        <ul>
          <li>
            Pièces électriques / électroniques ouvertes hors défaut de
            fabrication avéré (scellés rompus)
          </li>
          <li>
            Articles sur-mesure, commandés spécialement, ou coupés / adaptés
            (housses, câblages spécifiques, etc.)
          </li>
          <li>
            Produits endommagés par un mauvais montage ou une incompatibilité
            non vérifiée avant achat
          </li>
          <li>
            Consommables entamés (filtres utilisés, liquides ouverts, etc.)
          </li>
          <li>Promotions « ventes fermes » clairement indiquées comme telles</li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>4. Défaut, erreur ou casse à la réception</h2>
        <p>
          Si le produit reçu est défectueux, non conforme à la commande, ou
          endommagé à l’ouverture du colis :
        </p>
        <ol>
          <li>
            Signalez-le <strong>sous 48 heures</strong> après réception /
            retrait, avec photos ;
          </li>
          <li>
            Ne montez pas la pièce — un montage peut faire perdre le droit au
            remplacement ;
          </li>
          <li>
            MAJOR AUTO PARTS propose l’échange, le avoir, ou le remboursement
            selon stock et nature du défaut.
          </li>
        </ol>
      </section>

      <section className="legal-block">
        <h2>5. Comment procéder</h2>
        <ol>
          <li>
            Connectez-vous à <Link to="/compte">Mon compte</Link> ou utilisez
            votre lien de suivi ;
          </li>
          <li>
            Contactez le showroom / service client en indiquant le numéro de
            commande et le motif ;
          </li>
          <li>
            Attendez la validation du retour (adresse de dépôt, bon de
            retour) ;
          </li>
          <li>
            Rapportez l’article en showroom ou suivez les instructions de
            renvoi communiquées.
          </li>
        </ol>
        <p>
          Les frais de renvoi sont à la charge du Client en cas de
          rétractation / changement d’avis. Ils sont pris en charge par MAJOR
          AUTO PARTS en cas d’erreur de préparation ou de défaut avéré.
        </p>
      </section>

      <section className="legal-block">
        <h2>6. Remboursement</h2>
        <p>
          Après contrôle qualité de l’article retourné, le remboursement du
          prix des produits acceptés est effectué sur le moyen de paiement
          d’origine (carte, Wave, Orange Money) ou en avoir showroom, sous{' '}
          <strong>7 à 14 jours ouvrés</strong> selon le prestataire.
        </p>
        <p>
          Les frais de livraison initiaux ne sont remboursés que si la
          totalité de la commande est retournée pour erreur / défaut imputable
          à MAJOR AUTO PARTS.
        </p>
      </section>

      <section className="legal-block">
        <h2>7. Échange</h2>
        <p>
          Un échange contre une référence compatible peut être proposé selon
          stock. Un éventuel complément de prix ou un remboursement partiel
          sera calculé au moment de l’échange.
        </p>
      </section>

      <section className="legal-block">
        <h2>8. Garantie après montage</h2>
        <p>
          Une fois montée dans les règles de l’art, une pièce peut relever de
          la garantie constructeur / fournisseur (voir fiche produit et{' '}
          <Link to="/cgv">CGV</Link>). Conservez la facture et les preuves
          d’installation. Les vices cachés et non-conformités sont traités au
          cas par cas en showroom.
        </p>
      </section>

      <section className="legal-block">
        <h2>9. Contact</h2>
        <p>
          Service retours MAJOR AUTO PARTS — via showroom, suivi de commande
          ou <Link to="/compte">espace client</Link>. Politique de{' '}
          <Link to="/confidentialite">confidentialité</Link> applicable au
          traitement de vos demandes.
        </p>
      </section>
    </article>
  );
}
