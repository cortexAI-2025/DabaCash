# DabaCash

Marketplace d'électronique d'occasion et réseau de franchises au Maroc : rachat d'appareils (estimation indicative + examen par une franchise), revente en ligne ou en magasin, paiement en ligne via Aslan, back-office administrateur.

> **État : V1 bêta fermée.** Ce dépôt est prêt pour une bêta avec de vrais testeurs mais **sans transactions réelles tant que les points listés dans [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) (« Avant d'ouvrir au public ») ne sont pas traités**. L'application n'est pas présentée comme conforme à une réglementation : voir [docs/SECURITY.md](docs/SECURITY.md).

## Architecture

| Dossier | Contenu |
|---|---|
| `apps/api` | API NestJS 12 — REST `/api/v1`, Socket.IO (`/inventory`), JWT + refresh tournant, RBAC, tâches planifiées |
| `apps/web` | Next.js 16 (App Router), Tailwind, React Query. Export statique pour l'APK Android (Capacitor) |
| `packages/database` | Schéma Prisma 5, migrations SQL, scripts de données (référentiel, admin, démo) |
| `packages/shared` | Types partagés |
| `docs/` | Audit initial, installation, déploiement, sécurité, recette, tests, notes de version |

Rôles : `CUSTOMER`, `FRANCHISE_OWNER` (un propriétaire par franchise), `ADMIN`. Le rôle est toujours relu en base à chaque requête.

## Démarrage rapide (développement)

Prérequis : Node ≥ 22, PostgreSQL ≥ 14 (testé sur 16).

```bash
cp .env.example .env            # puis renseigner DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npm ci
npm run db:generate
npm run build --workspace=packages/database    # l'API importe packages/database/dist
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run db:seed --workspace=packages/database          # villes + modèles (sans prix)
DEMO_PASSWORD='Choisissez-un-mdp-1' npm run db:seed:demo --workspace=packages/database   # données fictives
npm run dev                      # API :4000, web :3000
```

Détails et variables : [docs/INSTALL.md](docs/INSTALL.md), [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Vérifier

```bash
npm run type-check && npm run lint
npm test --workspace=apps/api                 # unitaires
npm run test:e2e --workspace=apps/api         # intégration : application complète + vraie base PostgreSQL
```

Résultats détaillés et méthode : [docs/TESTING.md](docs/TESTING.md). Procédure d'acceptation manuelle : [docs/RECETTE.md](docs/RECETTE.md).

## Documentation

- [docs/AUDIT.md](docs/AUDIT.md) — état initial, défauts confirmés par exécution, correctifs
- [docs/INSTALL.md](docs/INSTALL.md) · [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) · [docs/DEPLOY.md](docs/DEPLOY.md)
- [docs/SECURITY.md](docs/SECURITY.md) — contrôles, limites connues, données personnelles
- [docs/RECETTE.md](docs/RECETTE.md) · [docs/TESTING.md](docs/TESTING.md) · [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)
