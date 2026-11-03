# Déploiement

Cette procédure vise un **environnement de bêta/staging**. Le déploiement en production réelle n'a pas été effectué et reste une décision humaine (voir RELEASE_NOTES, « Avant d'ouvrir au public »).

## Topologie recommandée

```
navigateur ──HTTPS──▶ reverse proxy / CDN ──▶ web (Next.js, port 3000)
                                   └──────▶ api (NestJS, port 4000) ──▶ PostgreSQL
Aslan ──HTTPS webhook──▶ api  /api/v1/payments/aslan/webhook
```

- **Une seule instance d'API** pour la bêta (voir limite « rate limiting en mémoire » dans SECURITY.md).
- PostgreSQL géré, avec sauvegardes quotidiennes et restauration testée.
- TLS terminé au proxy ; `TRUST_PROXY=1` côté API.

## Première mise en ligne

1. **Secrets** dans le gestionnaire de secrets de l'hébergeur (jamais dans git) : `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -base64 48`, deux valeurs distinctes), `CORS_ORIGINS`, `WEB_URL`, et — pour le paiement — `ASLAN_SECRET_KEY` (**`sk_test_*` en bêta**), `ASLAN_WEBHOOK_SECRET`.
2. **Sauvegarde** de la base (même vide) avant toute migration.
3. **Build** : `npm ci && npm run build` (API : `dist/main.js` ; web : `NEXT_PUBLIC_API_URL` doit être défini **au build**).
4. **Migrations** : `npm run db:migrate --workspace=packages/database` (`prisma migrate deploy`, non interactif).
5. **Référentiel** : `npm run db:seed --workspace=packages/database`.
6. **Premier admin** : `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:create-admin --workspace=packages/database` (mot de passe saisi au moment de la commande, pas stocké).
7. **Prix de référence** : connectez-vous en admin → *Catalogue*, saisissez les prix de marché des modèles. Sans prix, pas d'estimation (réponse 422 volontaire).
8. **Démarrer** l'API (`node dist/main`) puis le web (`next start`). Ne **pas** exécuter `db:seed:demo` en production (refusé par le script).
9. **Vérifier** : `GET /api/v1/health` → `status: ok`, `database: up`. Puis dérouler [RECETTE.md](RECETTE.md).
10. **Aslan** : déclarer l'URL du webhook, confirmer qu'un paiement **sandbox** fictif passe de `PENDING` à `COMPLETED` (signature HMAC vérifiée, rejeu refusé).

## Mise à jour

1. Sauvegarde de la base.
2. Déployer le nouveau build ; appliquer `prisma migrate deploy` **avant** de démarrer la nouvelle API.
3. `GET /health`, puis un parcours de recette court (connexion, liste d'annonces, une commande cash fictive).

Les migrations sont **additives sauf la première bêta** (`beta_hardening` purge les sessions). Ne jamais utiliser `migrate reset` ni `db push` sur une base qui contient des données.

## Retour arrière (rollback)

| Situation | Action |
|---|---|
| Code défectueux, schéma inchangé | redéployer le build précédent (aucune action base) |
| Migration appliquée, code à annuler | redéployer le build précédent : les colonnes/tables ajoutées sont ignorées par l'ancien code, **sauf** les contraintes `CHECK` et la contrainte unique d'idempotence, qui peuvent rejeter d'anciens comportements. Si l'ancien code ne fonctionne pas : restaurer la sauvegarde pré-migration |
| Données corrompues | restauration PITR/sauvegarde ; les écritures faites depuis sont perdues : prévenir les testeurs |
| Secret compromis | rotation (voir ENVIRONMENT.md) ; toutes les sessions sont invalidées |

Aucune migration n'a de script « down » : la sauvegarde pré-migration **est** le retour arrière du schéma.

## Opérations courantes

- Journal d'accès : une ligne par requête (id de requête, méthode, chemin sans query string, statut, durée, utilisateur). Aucun corps de requête ni donnée personnelle.
- Un id de requête (`requestId`) est renvoyé dans toute erreur : demandez-le aux testeurs pour retrouver la ligne de log.
- Tâche planifiée : toutes les 10 minutes, annulation des commandes impayées expirées (2 h en ligne, 48 h cash) et libération du stock réservé.
