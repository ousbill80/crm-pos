# CLAUDE.md — Progiciel Caisses & CRM (Marché des Accessoires)

Ce document est la référence de contexte pour toute session Claude Code travaillant sur ce projet. Il fait autorité sur les règles métier, l'architecture et la méthode de développement. Toute session (y compris les sous-agents) doit le lire avant de coder.

## Source de vérité

Le cahier des charges (`Cahier_des_charges_Caisses_CRM.docx`) fait foi à **100%, sans complaisance**. Règles :

- Aucune fonctionnalité, statut ou règle de gestion du cahier des charges ne doit être simplifié, omis, ou approximé pour aller plus vite.
- En cas d'ambiguïté ou de vide dans le cahier des charges, **poser la question à l'utilisateur** — ne jamais improviser une règle métier financière ni supposer un comportement "raisonnable".
- Avant de considérer une fonctionnalité terminée, vérifier explicitement qu'elle couvre la section correspondante du cahier des charges et la citer (ex. « couvre §6.4 workflow des statuts ») dans le commit ou le résumé de fin de tâche.
- Le document `Plan_Structuration_Organisationnelle_Marche_Accessoires_1.docx` donne le contexte organisationnel réel (10 boutiques + Café-Market) qui doit utiliser ce progiciel — les rôles doivent rester mappables sur cet organigramme.

## Règles métier non négociables

### 1. Séparation des tâches (cœur du système)

Une caisse auxiliaire (boutique) peut **UNIQUEMENT** :
- encaisser une vente,
- initier un bordereau de versement / demande de sortie de fonds.

Une caisse auxiliaire **NE PEUT JAMAIS** valider, réceptionner ou solder une transaction. Ce n'est pas une règle d'interface : elle doit être **impossible à contourner côté backend/API**, y compris par un appel direct qui bypasserait le frontend. Seuls les rôles Caissier Central et DAF peuvent réceptionner/valider.

### 2. Machine à états des transactions (§6.4)

```
Initiée → En transit → Réceptionnée → Validée
                                    ↘ Litige (bloqué jusqu'à régularisation)
```

- `Initiée` : Caissier boutique / Responsable boutique.
- `En transit` : Responsable boutique / convoyeur.
- `Réceptionnée` : **Caissier Central uniquement**.
- `Validée` : **Caissier Central uniquement**, après rapprochement sans écart.
- `Litige` : déclenché par le Caissier Central lors du rapprochement, arbitré par le Contrôle interne.

Implémenter cette machine à états comme **un unique objet de domaine partagé** (pas de logique de transition dupliquée dans plusieurs services/contrôleurs). Toute transition non autorisée doit lever une erreur explicite et être journalisée — jamais échouer silencieusement ou être seulement empêchée par l'UI.

### 3. Rôles et habilitations (§4, §6.2)

| Rôle | Périmètre de données | Peut valider/réceptionner ? |
|---|---|---|
| Direction Générale | Réseau entier (consultation) | Non (validation seuils exceptionnels only) |
| DAF | Réseau entier | Oui (niveau 2) |
| Caissier Central / Trésorier | Réseau entier | Oui |
| Contrôleur interne / Auditeur | Réseau entier (lecture + audit) | Non |
| Superviseur de zone | Sa zone | Non |
| Responsable boutique | Sa boutique | Non (initiation seulement) |
| Caissier(ère) boutique | Sa boutique | Non (vente + initiation seulement) |
| Responsable SI | Admin système | N/A |
| Responsable Commercial/CRM | Module CRM complet | N/A |

Le RBAC doit être vérifié côté serveur sur **chaque** endpoint sensible (pas seulement affiché/masqué côté UI), avec un test dédié qui prouve que chaque rôle interdit reçoit un rejet explicite (403), pas juste une absence de bouton.

### 4. Modèle de données de référence (§6.5)

Entités du MCD à respecter comme base : `ZONE`, `BOUTIQUE`, `CAISSE`, `UTILISATEUR`, `ROLE`, `TRANSACTION_CAISSE`, `BORDEREAU_VERSEMENT`, `RECEPTION_VALIDATION`, `VENTE`, `PRODUIT`, `CLIENT` (CRM), `FIDELITE`, `INTERACTION_CRM`. Extensions possibles (stock avancé, multi-devises) mais jamais au détriment de ce socle.

### 5. Module CRM (§6.6)

- Fiche client unique consolidée réseau (historique d'achats visible depuis n'importe quelle boutique).
- Le rattachement client à une vente est **optionnel** — la vente anonyme doit toujours être possible.
- Segmentation paramétrable, programme de fidélité par paliers, campagnes ciblées, tableau de bord client.

### 6. Exigences non fonctionnelles (§6.7) — traitées comme fonctionnelles

- Authentification individuelle obligatoire ; mots de passe hashés (bcrypt). Les fiches client sont stockées en clair au repos (pas de chiffrement champ-à-champ) — transport TLS.
- Journal d'audit **horodaté et non modifiable** : les tables d'audit sont append-only (aucun UPDATE/DELETE autorisé, même côté admin).
- Mode hors-ligne en boutique : file d'ops POS idempotentes (IndexedDB web + SQLite mobile), sync auto à la reconnexion — pas tout le métier hors ligne.
- Ajout de boutique/zone sans reparamétrage lourd de l'application.
- Alertes automatiques : écart de caisse, versement non transmis dans le délai, tentative d'accès non autorisée.

## Architecture — principes non négociables

### Backend API-first, zéro donnée mockée

- **Aucune donnée mockée ou codée en dur, à aucun stade du développement**, y compris en local. Le frontend (web et mobile) consomme exclusivement l'API réelle contre une vraie base de données dès le premier commit.
- Ordre de construction imposé pour chaque fonctionnalité : modèle de données → migration → endpoint + tests d'intégration (DB réelle) → intégration frontend. Jamais l'inverse (pas de « UI d'abord avec mock, backend après »).
- Des jeux de données de démo (seeds réalistes en base) sont acceptables ; des mocks en mémoire ou fixtures JSON simulant l'API ne le sont pas.

### Grand livre append-only pour la trésorerie

- Le solde d'une caisse ne se stocke/modifie jamais directement (interdit : `UPDATE caisse SET solde = solde - x`). Il se **recalcule** à partir du journal immuable des `TRANSACTION_CAISSE`.
- Aucune ligne financière déjà validée n'est modifiable ou supprimable ; toute correction se fait par écriture compensatoire tracée, jamais par édition rétroactive.

## Stack technique (retenue — modifiable sur demande explicite)

Tant que ce choix n'est pas changé dans ce fichier, toute session code en cohérence avec lui.

- **Backend** : NestJS (TypeScript) + PostgreSQL + Prisma. NestJS pour la DI/guards qui portent naturellement le RBAC et la state machine comme services de domaine testables isolément.
- **API** : REST pour les opérations métier + WebSocket (statuts de transaction visibles en temps réel, §5.2) pour la diffusion des changements de statut aux boutiques/zones/Direction concernées.
- **Web** : React + TypeScript + Vite (caisse boutique web, tableaux de bord Direction/CRM).
- **Mobile** (caisse boutique mobile / POS terrain) : React Native, monorepo partagé avec le web (types, client API, logique de state machine) via pnpm workspaces / Turborepo.
- **Mode hors-ligne** : file d'attente d'opérations POS idempotentes horodatées — IndexedDB (Dexie) sur le web, SQLite (`expo-sqlite`) sur mobile — **pas WatermelonDB**, pas de CRM/reporting hors ligne. La synchronisation est un append côté serveur via les endpoints métier (`clientOperationId`) — cohérent avec le grand livre append-only (pas de résolution de conflit sur des updates).
- **Tests** : Jest (unit + intégration), Supertest (API), Testcontainers pour exécuter les tests d'intégration contre un vrai PostgreSQL éphémère (pas de DB mockée en test non plus — cohérence avec le principe « zéro mock »), Playwright pour l'E2E web.
- **CI** : lint + typecheck + tests unitaires + tests d'intégration (DB réelle) + migrations appliquées, bloquants avant merge.

## Pratiques de développement autonome avec Claude Code

- **Tests avant l'implémentation** pour toute règle métier sensible (transition d'état interdite, accès RBAC refusé) : écrire le test qui prouve que le cas interdit échoue, avant d'écrire le code qui l'empêche.
- **Plan validé avant code** pour chaque nouveau module ou règle métier significative (passer en mode Plan, obtenir l'accord explicite avant d'implémenter).
- **TaskCreate/TodoWrite** pour tout travail multi-étapes ; une tâche n'est marquée terminée qu'après exécution réelle de la suite de tests (jamais sur la base d'une supposition « ça devrait marcher »).
- **Pas de rétrécissement silencieux de périmètre** : si une règle du cahier des charges ne peut pas être implémentée telle quelle, s'arrêter et demander — ne jamais la simplifier discrètement.
- **Worktrees isolés** pour les refactors ou modules à risque, revue de diff avant fusion sur la branche principale.
- **Hooks** : lint + typecheck + tests unitaires bloquants avant chaque commit.
- **Definition of Done** par fonctionnalité : migration + endpoint + test RBAC + test de transition d'état + test d'intégration (DB réelle) + entrée d'audit vérifiée + référence à la section du cahier des charges couverte.

## Commandes (cibles, à instancier au scaffold initial)

```
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter api test            # unit + intégration (Testcontainers)
pnpm --filter api test:e2e
pnpm --filter web test
pnpm --filter web build
pnpm lint && pnpm typecheck
```
