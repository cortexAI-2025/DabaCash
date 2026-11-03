# Installation

## Prérequis

- Node.js ≥ 22 (CI : 22) et npm ≥ 10
- PostgreSQL ≥ 14 (testé : 16)
- Pour l'APK : JDK 17 + Android SDK (voir `.github/workflows/build-apk.yml`, qui fait le build en CI)

## 1. Dépendances

```bash
npm ci            # le package-lock.json est versionné : installation reproductible
```

## 2. Base de données

Créez une base et un utilisateur dédiés, puis renseignez `DATABASE_URL` et `DIRECT_URL` (voir [ENVIRONMENT.md](ENVIRONMENT.md)).

```bash
npm run db:generate
cd packages/database
npx prisma migrate deploy                       # applique les 3 migrations
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code   # doit rendre 0 (aucune dérive)
```

> La migration `20261103000000_beta_hardening` commence par `DELETE FROM sessions;` : elle invalide toutes les sessions existantes (les refresh tokens sont désormais stockés hachés). Les utilisateurs devront se reconnecter.

## 3. Données

| Commande | Effet | Production |
|---|---|---|
| `npm run db:seed` | 10 villes + catalogue de modèles **sans prix** | oui |
| `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:create-admin` | crée/promeut le premier administrateur | oui |
| `DEMO_PASSWORD=… npm run db:seed:demo` | comptes et annonces **fictifs** (`@demo.dabacash.test`) | **refusé** sauf `ALLOW_DEMO_SEED=true` |

Un modèle sans prix de référence ne produit **aucune estimation** (réponse 422) : l'administrateur renseigne les prix dans *Admin → Catalogue*. Aucun prix n'est inventé par le système.

## 4. Lancer

```bash
npm run dev                                   # développement (turbo)
# ou, en production-like :
npm run build
npm run start --workspace=apps/api            # node dist/main
npm run start --workspace=apps/web            # next start
```

Santé : `GET http://localhost:4000/api/v1/health` → `{"status":"ok","database":"up",…}` (503 si la base est indisponible).

## 5. Application Android (APK)

`npm run build:mobile --workspace=apps/web` produit l'export statique `apps/web/out` ; `build-apk.yml` assemble l'APK avec Capacitor. La **signature de release** nécessite un keystore (voir `scripts/generate-keystore.sh`) stocké comme secret GitHub, jamais dans le dépôt. Le dernier build d'APK signé n'a pas été vérifié dans le cadre de cette livraison.
