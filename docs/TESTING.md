# Tests

Principe : une fonctionnalité n'est « vérifiée » que si un test **exécuté** l'a prouvé. Les chiffres ci-dessous proviennent de l'exécution finale du 2026-11-03 sur la branche `feature/dabacash-v1-beta-finalization`.

## Résultats

| Vérification | Commande | Résultat |
|---|---|---|
| Typage API | `npm run type-check --workspace=apps/api` | 0 erreur |
| Typage web | `npm run type-check --workspace=apps/web` | 0 erreur |
| Lint API | `npm run lint --workspace=apps/api` | 0 erreur, 15 avertissements (`any` explicites) |
| Lint web | `npm run lint --workspace=apps/web` | 0 erreur, 2 avertissements (API `watch()` de react-hook-form ; navigation `window.location` vers l'URL de paiement externe) |
| Tests unitaires API | `npm test --workspace=apps/api` | **25 / 25** (≈ 5 s) |
| Tests d'intégration API | `npm run test:e2e --workspace=apps/api` | **273 / 273** (≈ 76 s) |
| Migrations sur base vide et sur base peuplée | `prisma migrate deploy` | OK ; `prisma migrate diff --exit-code` : aucune dérive |
| Build API | `nest build` | OK |
| Build web (production) | `next build` | OK — 32 pages |
| Build web (export statique APK) | `NEXT_PUBLIC_IS_MOBILE=true next build` | OK — `out/` généré |
| Parcours navigateur (Chromium, 1280 px et 390 px) | `apps/web/e2e/smoke.cjs` | **49 / 49** |
| `npm audit --omit=dev` | | 0 vulnérabilité |
| `npm audit` (complet) | | 24 avis, **tous dev-only** (détail dans SECURITY.md, limite 8) |

Mise à jour du 5 novembre : les workflows API/web et audit sont verts sur `6863a2f` (run 42014261224) ; les 49 vérifications navigateur sont désormais exécutées en CI sur une pile jetable (run 42014261413). L’APK debug a été construit et sa signature v1/v2 vérifiée (run 42014252175). Voir [LIVRAISON_BETA_2026-11-05.md](LIVRAISON_BETA_2026-11-05.md).

Non vérifiés : paiements Aslan et emails Resend **réels**, APK **release signé avec une clé durable**, installation et parcours sur appareil physique, hébergement opérationnel de la bêta.

## Comment les tests d'intégration fonctionnent

Chaque fichier `apps/api/test/*.e2e.spec.ts` démarre l'**application NestJS complète** dans le processus de test, contre une **vraie base PostgreSQL** (`DATABASE_URL`, base jetable), avec de **faux serveurs HTTP** locaux pour Aslan (création de session, signature de webhook) et Resend. Aucun appel réseau externe, aucune clé réelle. Les fichiers tournent séquentiellement (`--test-concurrency=1`), un processus par fichier.

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/dabacash_test DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run test:e2e --workspace=apps/api
```

## Ce que couvrent les suites

| Suite | Sujet |
|---|---|
| `auth` | inscription (rôle refusé), connexion, verrouillage, rotation et réutilisation du refresh token, déconnexion, mot de passe |
| `security` | IDOR commandes/rachats, escalade de rôle, endpoints admin interdits, fuite de champs sensibles, CORS |
| `validation` | DTO stricts, bornes de pagination, entiers invalides, champs inconnus |
| `orders` | état machine, stock/réservation, annulation, idempotence, expiration |
| `payments` | session Aslan, signature et rejeu du webhook, règlement idempotent, retour navigateur non fiable |
| `buyback` | création, appariement, estimation, revue, surcharge de prix > 50 %, fraude (cacher/suspendre/confirmer/rouvrir), blocage IMEI |
| `concurrency` | commandes parallèles sur le dernier stock, webhook vs annulation vs expiration, double clic (idempotence) |
| `admin` | utilisateurs/rôles, franchises (création atomique), catalogue et historique de prix, audit, analytics |
| `throttle` | limites de débit effectives (activées dans cette suite) |
| `production` | l'API refuse de démarrer avec une configuration dangereuse ; en-têtes de sécurité |
| `constraints` | contraintes `CHECK` de la base atteintes directement en SQL |
| `smoke` | santé, parcours minimal |
| unitaires | client Aslan, service de notifications (échappement), score de fraude, validation d'environnement |

## Contrôle de la pertinence des tests (mutation manuelle)

Pour vérifier que les tests détectent réellement une régression, 15 protections ont été **retirées une par une** du code (autorisation d'une route, verrou de ligne, vérification de signature, hachage du refresh token, filtre `select` des vues publiques, contrainte d'idempotence, etc.), la suite concernée relancée, puis le code rétabli. **Les 15 mutations ont été détectées** par au moins un test (une première version de l'essai « rôle à l'inscription » avait visé la mauvaise couche et a été refaite). Ce contrôle a été fait à la main ; le script d'injection n'est pas versionné.

## Défauts révélés par les tests eux-mêmes (et corrigés)

Prix de rachat exposé dans les annonces publiques et les commandes clients ; champs de fraude renvoyés à la création d'une demande ; erreur 413 transformée en 500 ; l'estimation anonyme écrivait en base ; entiers invalides remplacés silencieusement par une valeur par défaut. Côté navigateur : inscription impossible avec un téléphone vide, texte de paiement erroné pour le cash en magasin, débordement mobile de `/sell`, ancien serveur résiduel servant des fichiers périmés (artefact d'environnement, pas du produit).

## Lacunes de test connues

- Pas de tests automatisés du **composant** web (React) en CI : le front est couvert par le typage, le lint, le build et le script navigateur ci-dessus (automatisé par `.github/workflows/browser.yml` sur une pile locale jetable).
- Pas de test de charge ni de test avec plusieurs instances d'API.
- Pas de test d'accessibilité automatisé (axe) ; les libellés/ARIA ont été corrigés à la main et vérifiés par le script navigateur seulement pour les parcours principaux.
