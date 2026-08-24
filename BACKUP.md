# Sauvegarde et continuité — PostgreSQL

Couvre §6.7 du cahier des charges (« sauvegarde régulière, procédure de
restauration testée, plan de continuité »).

## Objectifs (RTO / RPO)

- **RPO (perte de données maximale tolérée) : 24 heures.** Une sauvegarde
  complète est prise une fois par jour (voir planification ci-dessous).
- **RTO (délai de reprise) : 1 heure.** Restaurer une sauvegarde `pg_dump`
  au format custom via `pg_restore` sur une base vide prend quelques minutes
  pour un volume de données courant ; l'heure inclut la remise en service de
  la stack applicative (`docker compose up`).

Ces cibles doivent être révisées si le volume de données augmente
significativement (le temps de restauration croît avec la taille de la
base).

## Sauvegarde

```
COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod scripts/backup-postgres.sh
```

En développement (`docker-compose.yml`) :

```
scripts/backup-postgres.sh
```

- Prend un dump `pg_dump -Fc` (format custom, compressé) de la base du
  service `db` défini dans `docker-compose.yml`, dans `./backups/`.
- Nom de fichier : `<base>_<horodatage UTC>.dump`.
- Applique une rotation : les archives de plus de `RETENTION_DAYS` jours
  (14 par défaut) sont supprimées automatiquement.
- Variables d'environnement disponibles : `POSTGRES_SERVICE`,
  `POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_DIR`, `RETENTION_DAYS`.

### Planification

À exécuter une fois par jour hors heures d'ouverture (ex. cron `0 3 * * *`
sur l'hôte qui exécute `docker compose`), avec les archives copiées ensuite
vers un stockage hors du serveur applicatif (ex. objet distant / NAS) — le
script ne fait que produire l'archive locale, le transfert hors site est une
étape d'exploitation à brancher en aval (`rsync`/upload après chaque
exécution).

## Restauration

```
scripts/restore-postgres.sh <fichier.dump> [--target-db NOM]
```

- **Opération destructive** : la base cible est supprimée puis recréée
  avant restauration. Une confirmation explicite (taper `RESTAURER`) est
  exigée avant toute action.
- Sans `--target-db`, restaure vers la base de production configurée
  (`POSTGRES_DB`, `caisse_crm` par défaut) — à réserver à un incident réel.
- Avec `--target-db <nom>`, restaure vers une base distincte (ex. base de
  test) sans toucher à la base de production : c'est la procédure à utiliser
  pour **tester** une sauvegarde avant de lui faire confiance.

## Procédure testée

Cette procédure a été exécutée de bout en bout (sauvegarde réelle → restauration
sur une base de test → comparaison des données) lors de la mise en place de
ces scripts : une table de vérification a été créée avec des données de
test, sauvegardée avec `backup-postgres.sh`, puis restaurée avec
`restore-postgres.sh --target-db` vers une base de test distincte ; le
contenu restauré était identique à l'original. La base et la table de test
ont ensuite été supprimées.

### Reproduire le test (recommandé à intervalles réguliers)

```bash
docker compose up -d db
scripts/backup-postgres.sh
scripts/restore-postgres.sh ./backups/<fichier.dump> --target-db caisse_crm_test_restore
# Comparer les données restaurées à l'original, puis nettoyer :
docker compose exec -T db psql -U caisse -d postgres -c 'DROP DATABASE caisse_crm_test_restore;'
```

## Périmètre

- Ces scripts couvrent uniquement la base PostgreSQL (données applicatives).
- Le code applicatif est versionné dans Git — pas de sauvegarde séparée
  nécessaire pour ce périmètre.
