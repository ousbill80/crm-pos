import { Link } from 'react-router-dom';

const MAJ = '28 août 2026';

export default function CgvPage() {
  return (
    <article className="section legal-page">
      <header className="legal-head">
        <p className="legal-kicker">Informations légales</p>
        <h1>Conditions générales de vente</h1>
        <p className="legal-meta">MAJOR AUTO PARTS · Dernière mise à jour : {MAJ}</p>
      </header>

      <div className="legal-toc panel">
        <strong>Sommaire</strong>
        <ol>
          <li>
            <a href="#objet">Objet</a>
          </li>
          <li>
            <a href="#vendeur">Identité du vendeur</a>
          </li>
          <li>
            <a href="#produits">Produits &amp; disponibilité</a>
          </li>
          <li>
            <a href="#commande">Commande</a>
          </li>
          <li>
            <a href="#prix">Prix &amp; paiement</a>
          </li>
          <li>
            <a href="#livraison">Livraison &amp; retrait</a>
          </li>
          <li>
            <a href="#garantie">Garantie &amp; conformité</a>
          </li>
          <li>
            <a href="#responsabilite">Responsabilité</a>
          </li>
          <li>
            <a href="#compte">Compte client</a>
          </li>
          <li>
            <a href="#droit">Droit applicable</a>
          </li>
        </ol>
      </div>

      <section id="objet" className="legal-block">
        <h2>1. Objet</h2>
        <p>
          Les présentes Conditions Générales de Vente (CGV) régissent les ventes
          de pièces, accessoires et équipements automobiles réalisées via le site
          e-commerce MAJOR AUTO PARTS (ci-après « le Site ») au profit de tout
          client particulier ou professionnel (ci-après « le Client »).
        </p>
        <p>
          Toute commande implique l’acceptation sans réserve des présentes CGV.
          Les conditions particulières éventuellement indiquées sur une fiche
          produit (compatibilité, montage, stock) prévalent pour l’article
          concerné.
        </p>
      </section>

      <section id="vendeur" className="legal-block">
        <h2>2. Identité du vendeur</h2>
        <p>
          Les ventes sont proposées par <strong>MAJOR AUTO PARTS</strong>,
          enseigne de distribution de pièces et accessoires automobiles opérant
          un réseau showroom / boutiques en Côte d’Ivoire, et la boutique en
          ligne associée.
        </p>
        <ul>
          <li>Site : boutique en ligne MAJOR AUTO PARTS</li>
          <li>
            Modes de contact : formulaire compte client, suivi de commande,
            showroom
          </li>
          <li>Devise des transactions : Franc CFA (XOF)</li>
        </ul>
        <p className="muted">
          Les mentions légales complètes (RCCM, siège, contacts Direction)
          peuvent être complétées par la Direction avant diffusion commerciale
          définitive.
        </p>
      </section>

      <section id="produits" className="legal-block">
        <h2>3. Produits &amp; disponibilité</h2>
        <p>
          Les produits présentés sont des pièces et accessoires pour véhicules
          (toutes marques / modèles selon fiches). Les photographies et
          descriptifs sont fournis à titre indicatif ; de légères différences
          d’apparence peuvent exister sans affecter les caractéristiques
          essentielles.
        </p>
        <p>
          Les stocks affichés correspondent à la disponibilité du réseau /
          entrepôt web au moment de la consultation. Un article peut être
          indisponible entre la consultation et la validation du paiement ; dans
          ce cas, le Client est informé et la commande est annulée ou adaptée
          avec son accord, avec remboursement le cas échéant.
        </p>
        <p>
          Le Client est responsable de vérifier la compatibilité (référence,
          culot, dimensions, véhicule) avant commande. Un conseil atelier peut
          être sollicité en showroom.
        </p>
      </section>

      <section id="commande" className="legal-block">
        <h2>4. Commande</h2>
        <p>Le parcours de commande comprend notamment :</p>
        <ol>
          <li>Sélection des articles et quantités dans le panier</li>
          <li>
            Choix du mode de fulfillment : livraison à domicile / point ou
            retrait showroom (click &amp; collect)
          </li>
          <li>Renseignement des coordonnées et, le cas échéant, de l’adresse</li>
          <li>Choix du mode de règlement et paiement</li>
          <li>Confirmation et suivi via le lien fourni ou l’espace compte</li>
        </ol>
        <p>
          La vente est ferme après confirmation du paiement (prépayé) ou
          validation selon le mode choisi (ex. paiement au retrait lorsque
          proposé). Un e-mail ou SMS de confirmation peut être envoyé selon les
          paramètres du Site.
        </p>
      </section>

      <section id="prix" className="legal-block">
        <h2>5. Prix &amp; paiement</h2>
        <p>
          Les prix sont indiqués en FCFA, selon le mode d’affichage paramétré
          (HT ou TTC). Les frais de livraison éventuels sont calculés au
          checkout selon la zone.
        </p>
        <p>Moyens de paiement acceptés sur le Site (selon disponibilité) :</p>
        <ul>
          <li>Carte bancaire (via prestataire de paiement)</li>
          <li>Orange Money</li>
          <li>Wave</li>
          <li>Paiement au retrait showroom, lorsque proposé</li>
        </ul>
        <p>
          Le Client garantit disposer des autorisations nécessaires pour
          utiliser le moyen de paiement choisi. En cas d’échec ou de fraude
          suspectée, MAJOR AUTO PARTS peut suspendre la commande.
        </p>
      </section>

      <section id="livraison" className="legal-block">
        <h2>6. Livraison &amp; retrait</h2>
        <p>
          <strong>Livraison :</strong> effectuée dans les zones ouvertes au
          service (notamment Abidjan et zones paramétrées). Les délais sont
          indicatifs et démarrent après confirmation du paiement. Le Client
          doit fournir une adresse exacte et un numéro joignable.
        </p>
        <p>
          <strong>Retrait showroom :</strong> le Client est informé lorsque la
          commande est prête. Une pièce d’identité et le numéro de commande /
          QR peuvent être demandés. Les articles non retirés dans le délai
          communiqué peuvent être remis en stock après information du Client.
        </p>
        <p>
          Les risques sont transférés au Client à la remise (livraison ou
          retrait). Tout colis endommagé doit être signalé à la réception.
        </p>
      </section>

      <section id="garantie" className="legal-block">
        <h2>7. Garantie &amp; conformité</h2>
        <p>
          Les produits bénéficient de la garantie de conformité et, le cas
          échéant, de la garantie constructeur / fournisseur indiquée sur la
          fiche. Les défauts résultant d’un montage incorrect, d’une
          incompatibilité non vérifiée, d’une usure normale ou d’un usage
          non conforme sont exclus.
        </p>
        <p>
          Pour les retours et échanges, voir la page{' '}
          <Link to="/retours">Retours &amp; échanges</Link>.
        </p>
      </section>

      <section id="responsabilite" className="legal-block">
        <h2>8. Responsabilité</h2>
        <p>
          MAJOR AUTO PARTS met en œuvre les moyens raisonnables pour assurer
          la disponibilité du Site et l’exactitude des informations. Sa
          responsabilité ne saurait être engagée pour les dommages indirects,
          perte de données ou interruption liées à Internet, au prestataire de
          paiement ou à un cas de force majeure.
        </p>
        <p>
          Le montage des pièces est sous la responsabilité du Client ou de son
          atelier. Un mauvais montage peut entraîner l’exclusion de garantie.
        </p>
      </section>

      <section id="compte" className="legal-block">
        <h2>9. Compte client</h2>
        <p>
          La création d’un compte est facultative pour certaines commandes
          mais recommandée pour le suivi, les adresses et la fidélité. Le
          Client s’engage à fournir des informations exactes et à protéger ses
          identifiants. Voir aussi la{' '}
          <Link to="/confidentialite">Politique de confidentialité</Link>.
        </p>
      </section>

      <section id="droit" className="legal-block">
        <h2>10. Droit applicable</h2>
        <p>
          Les présentes CGV sont régies par le droit ivoirien. En cas de
          litige, une solution amiable sera recherchée ; à défaut, les
          tribunaux compétents de Côte d’Ivoire seront saisis.
        </p>
      </section>

      <p className="legal-foot">
        Questions : contactez le showroom ou utilisez l’espace{' '}
        <Link to="/compte">Mon compte</Link>.
      </p>
    </article>
  );
}
