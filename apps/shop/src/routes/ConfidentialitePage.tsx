import { Link } from 'react-router-dom';

const MAJ = '28 août 2026';

export default function ConfidentialitePage() {
  return (
    <article className="section legal-page">
      <header className="legal-head">
        <p className="legal-kicker">Informations légales</p>
        <h1>Politique de confidentialité</h1>
        <p className="legal-meta">MAJOR AUTO PARTS · Dernière mise à jour : {MAJ}</p>
      </header>

      <div className="legal-toc panel">
        <strong>Sommaire</strong>
        <ol>
          <li>
            <a href="#responsable">Responsable du traitement</a>
          </li>
          <li>
            <a href="#donnees">Données collectées</a>
          </li>
          <li>
            <a href="#finalites">Finalités</a>
          </li>
          <li>
            <a href="#base">Base légale</a>
          </li>
          <li>
            <a href="#destinataires">Destinataires</a>
          </li>
          <li>
            <a href="#conservation">Conservation</a>
          </li>
          <li>
            <a href="#securite">Sécurité</a>
          </li>
          <li>
            <a href="#cookies">Cookies &amp; traceurs</a>
          </li>
          <li>
            <a href="#droits">Vos droits</a>
          </li>
          <li>
            <a href="#contact">Contact</a>
          </li>
        </ol>
      </div>

      <section id="responsable" className="legal-block">
        <h2>1. Responsable du traitement</h2>
        <p>
          Les données personnelles collectées via le Site sont traitées par{' '}
          <strong>MAJOR AUTO PARTS</strong> dans le cadre de l’exploitation de
          la boutique en ligne, du click &amp; collect et du suivi des
          commandes.
        </p>
      </section>

      <section id="donnees" className="legal-block">
        <h2>2. Données collectées</h2>
        <p>Selon votre usage du Site, nous pouvons collecter :</p>
        <ul>
          <li>
            <strong>Identité &amp; contact :</strong> nom, prénom, e-mail,
            téléphone
          </li>
          <li>
            <strong>Compte :</strong> identifiants (mot de passe hashé),
            préférences, adresses de livraison
          </li>
          <li>
            <strong>Commandes :</strong> articles, montants, mode de
            fulfillment, statut, historique
          </li>
          <li>
            <strong>Paiement :</strong> les données de carte / mobile money
            sont traitées par les prestataires de paiement ; MAJOR AUTO PARTS
            ne stocke pas les numéros complets de carte
          </li>
          <li>
            <strong>Navigation :</strong> identifiant de session boutique,
            pages vues, recherches, ajouts panier (personnalisation &amp;
            statistiques d’audience agrégées)
          </li>
          <li>
            <strong>Localisation :</strong> uniquement si vous utilisez la
            carte / géolocalisation pour une adresse de livraison, avec votre
            action
          </li>
        </ul>
      </section>

      <section id="finalites" className="legal-block">
        <h2>3. Finalités</h2>
        <ul>
          <li>Traiter et livrer / préparer vos commandes</li>
          <li>Gérer votre compte, adresses et suivi</li>
          <li>Assurer le service client et le SAV</li>
          <li>
            Personnaliser les suggestions de produits (« Pour vous ») selon
            votre navigation
          </li>
          <li>Prévenir la fraude et sécuriser le Site</li>
          <li>
            Établir des statistiques anonymisées d’amélioration (funnel,
            conversion)
          </li>
          <li>
            Programme de fidélité / parrainage lorsque vous y participez
          </li>
        </ul>
      </section>

      <section id="base" className="legal-block">
        <h2>4. Base légale</h2>
        <p>Les traitements reposent selon les cas sur :</p>
        <ul>
          <li>l’exécution du contrat de vente ;</li>
          <li>votre consentement (ex. géolocalisation, certains cookies) ;</li>
          <li>
            l’intérêt légitime (sécurité, amélioration du service,
            personnalisation non intrusive) ;
          </li>
          <li>les obligations légales comptables et fiscales.</li>
        </ul>
      </section>

      <section id="destinataires" className="legal-block">
        <h2>5. Destinataires</h2>
        <p>Les données sont accessibles, dans la limite du nécessaire :</p>
        <ul>
          <li>équipes MAJOR AUTO PARTS (vente, préparation, SAV, SI) ;</li>
          <li>
            prestataires techniques (hébergement, paiement Wave / Orange Money
            / carte) ;
          </li>
          <li>transporteurs / convoyeurs pour la livraison ;</li>
          <li>autorités si obligation légale.</li>
        </ul>
        <p>
          Nous ne vendons pas vos données personnelles à des tiers à des fins
          publicitaires.
        </p>
      </section>

      <section id="conservation" className="legal-block">
        <h2>6. Conservation</h2>
        <ul>
          <li>
            Données de compte : tant que le compte est actif, puis archivage /
            suppression selon délais légaux
          </li>
          <li>
            Commandes &amp; facturation : durée légale de conservation
            comptable
          </li>
          <li>
            Événements de navigation (session) : durée limitée, typiquement
            quelques semaines à mois, pour personnalisation et statistiques
          </li>
        </ul>
      </section>

      <section id="securite" className="legal-block">
        <h2>7. Sécurité</h2>
        <p>
          Les mots de passe sont stockés sous forme hashée. Les échanges
          sensibles passent par des canaux sécurisés (TLS). L’accès aux
          données internes est restreint par rôles. Aucun système n’étant
          infaillible, le Client doit également protéger ses identifiants.
        </p>
      </section>

      <section id="cookies" className="legal-block">
        <h2>8. Cookies &amp; traceurs</h2>
        <p>Le Site utilise notamment :</p>
        <ul>
          <li>
            cookies / stockage technique indispensables (panier, session,
            authentification) ;
          </li>
          <li>
            un identifiant de session local pour la personnalisation et les
            statistiques de parcours ;
          </li>
          <li>
            éventuellement un bandeau d’installation PWA (préférences
            locales).
          </li>
        </ul>
        <p>
          Vous pouvez limiter certains stockages via les paramètres de votre
          navigateur ; le panier ou la connexion peuvent alors être impactés.
        </p>
      </section>

      <section id="droits" className="legal-block">
        <h2>9. Vos droits</h2>
        <p>
          Conformément à la réglementation applicable en Côte d’Ivoire en
          matière de protection des données, vous pouvez demander l’accès, la
          rectification, la mise à jour ou la suppression de vos données
          personnelles, sous réserve des obligations légales de conservation.
        </p>
        <p>
          Pour exercer vos droits : utilisez l’espace{' '}
          <Link to="/compte">Mon compte</Link> ou contactez le showroom en
          justifiant de votre identité.
        </p>
      </section>

      <section id="contact" className="legal-block">
        <h2>10. Contact</h2>
        <p>
          Pour toute question relative à cette politique : MAJOR AUTO PARTS —
          service client / showroom. Les{' '}
          <Link to="/cgv">CGV</Link> et la page{' '}
          <Link to="/retours">Retours</Link> complètent le cadre contractuel.
        </p>
      </section>
    </article>
  );
}
