# Audit technique et fonctionnel — état initial

Date : 2026-11-03 · Base auditée : `claude/dabacash-platform-build-pi4DQ` @ `40db383` · Méthode : **exécution**, pas lecture seule.

Règle suivie : une fonctionnalité n'est classée « fonctionnelle » que si elle a été **exercée** (API démarrée sur une base PostgreSQL réelle, requêtes réelles). Le code qui existe sans avoir été exécuté n'est pas compté.

## 1. Architecture constatée

| Couche | Technologie | Remarque |
|---|---|---|
| Monorepo | npm workspaces + Turborepo | `apps/api`, `apps/web`, `packages/database` |
| API | NestJS 10, REST `/api/v1`, Socket.IO | Prisma, JWT + refresh, RBAC (3 rôles) |
| Base | PostgreSQL via Prisma 5 | 2 migrations, 17 modèles |
| Web | Next.js 14 (App Router), Tailwind, React Query | Export statique pour l'APK Capacitor |
| Paiement | Aslan (aslan.ma) | Page hébergée + webhook signé |
| CI | GitHub Actions : `ci.yml`, `build-apk.yml` | Typage + tests unitaires uniquement |
| Branches | une seule : `claude/dabacash-platform-build-pi4DQ` (branche par défaut). **Pas de `main`.** | 0 PR ouverte |

Profils existants : `CUSTOMER`, `FRANCHISE_OWNER` (un seul propriétaire par franchise), `ADMIN`. Il n'existe pas de « vendeur » distinct, ni de comptes employés rattachés à une franchise.

## 2. Classement

### Fonctionnel (vérifié par exécution)

| Élément | Preuve |
|---|---|
| Catalogue public : recherche, filtres, tri, pagination, filtre par ville | 29 vérifications API |
| Règle de prix (`computeEstimate`), déterministe | tests unitaires |
| Paiement Aslan : session hébergée, centimes, clé d'idempotence, webhook signé HMAC (fenêtre anti-rejeu 5 min), règlement idempotent | scénario complet contre faux serveur Aslan |
| Commandes : verrou de stock, réservation, machine d'états, libération, commission | 22 vérifications |
| Rachat : appariement par ville / plus proche franchise, score de fraude à signaux, revue admin | 37 vérifications |
| Flux de stock temps réel (Socket.IO), notifications base + email | 17 vérifications |
| Analytics admin vs valeurs calculées à la main | 37 vérifications |
| Migrations appliquées sur base vide | `migrate deploy` + diff sans dérive |

### Défectueux (confirmé par sonde d'exploitation, sortie brute ci-dessous)

| # | Gravité | Défaut | Preuve |
|---|---|---|---|
| A1 | **Critique** | N'importe qui s'inscrit avec `role: "ADMIN"` | `register=201 role=ADMIN /admin/stats=200` |
| A2 | **Critique** | `PATCH /users/me` accepte `role` (élévation de privilège) | `role=ADMIN` après la requête |
| A3 | **Critique** | Tout utilisateur connecté lit **n'importe quelle commande** (IDOR, email client exposé) | `status=200 leaks=youssef@…` |
| A4 | **Critique** | Idem pour les demandes de rachat | `status=200 leaks=youssef@…` |
| A5 | Haute | Aucune limite de tentatives de connexion (25 essais, 25×401) | `statuses=401` |
| A6 | Haute | Un compte désactivé peut encore se connecter | `status=200` |
| A7 | Haute | Jetons de rafraîchissement stockés **en clair** en base | `8 JWTs readable` |
| I4 | Haute | CORS ouvert (`Access-Control-Allow-Origin: *`) | `acao=*` |
| D4 | Haute | Mise à jour franchise par l'admin : champs arbitraires, commission à 500 % | `commissionRate=5` |
| C1 | Haute | Deux décisions simultanées sur un rachat réussissent toutes deux | `statuses=200,200` |
| C2 | Haute | Double-clic = deux commandes identiques | `statuses=201,201` |
| D2 | Moyenne | Profil franchise public : `commissionRate`, `ownerId` | exposés |
| D1 | Moyenne | Annonce archivée toujours lisible publiquement | `status=200 ARCHIVED` |
| D3 | Moyenne | `/pricing/estimate` (anonyme) écrit en base à chaque appel | `+20 rows / 20 calls` |
| V1 | Moyenne | Panier vide → HTTP 500 | `status=500` |
| V2 | Moyenne | Taille de page non bornée (`limit=100000`) | honoré |
| V4 | Moyenne | Adresse de livraison = JSON arbitraire | `status=201` |
| I1 | Moyenne | Swagger UI exposé sans authentification | `status=200` |
| I2 | Moyenne | Aucun en-tête de sécurité, `X-Powered-By: Express` | — |
| I3 | Basse | Identifiant inconnu → 500 au lieu de 404 | `status=500` |
| I5 | Basse | Pas de point de santé | `404` |

Constatés ensuite, en écrivant les tests (non vus par les sondes) :
- le **prix de rachat payé par la franchise** (sa marge) était exposé dans toutes les annonces publiques et dans les commandes du client ;
- la réponse à la **création** d'un rachat renvoyait au client son score de fraude et les raisons du signalement ;
- le filtre d'erreurs transformait les erreurs HTTP de `body-parser` (413, JSON invalide) en 500.

Autres défauts constatés :
- **Identifiants administrateur codés en dur dans le dépôt** (ancien `seed.ts`).
- `npm audit` : **20 vulnérabilités** (1 critique, 8 hautes, 11 modérées) — essentiellement des dénis de service dans Next 14 et Nest 10.
- Lint déclaré (`npm run lint`) mais **aucune configuration ESLint** : il ne pouvait pas s'exécuter.
- CI : les erreurs de typage étaient masquées (`|| true`) avant le dernier correctif.

Sortie brute de la sonde (état initial) : `docs/audit/exploits-baseline.txt`.

### Incomplet

| Domaine | Manque |
|---|---|
| Client | Pas de page profil, d'historique de rachats, de détail/suivi de commande, de centre de notifications, de changement de mot de passe, d'export/suppression des données. Tunnel de vente sans IMEI ni adresse d'enlèvement. |
| Franchise | Pas de surcharge de prix à la décision, pas de finalisation de rachat, pas d'édition de produit (prix/stock), analytics limités aux 10 dernières ventes, commandes sans pagination ni toutes les transitions. |
| Admin | Seul un bouton de statut de franchise. Pas de gestion des utilisateurs/rôles, de création de franchise, de catalogue de prix, de transactions, de journal d'audit, de contrôle IMEI. |
| Web | Pas de limites d'erreur (error boundaries) ; **chiffres marketing inventés** sur l'accueil (« 12 000 appareils vendus », « 98 % »…). |
| Tests | 15 tests unitaires, aucun test d'intégration, aucun test de concurrence. |
| Docs | Aucune (pas de README). |

### Absent

Journal d'audit · limitation de débit · verrouillage de compte · changement de mot de passe · export et suppression des données personnelles · liste de blocage IMEI · administration du catalogue de prix · endpoint de santé · validation de l'environnement · clés d'idempotence · remboursement via l'API Aslan · téléversement de photos · comptes employés par franchise · Redis · WhatsApp / Google Maps · lot « Phase 2 » (analyse d'image IA, optimisation de prix, logistique) — ce dernier est **hors périmètre bêta** par décision du cahier des charges initial.

## 3. Ce qui n'est pas vérifiable ici

- **Aslan réel** : aucune clé disponible, tout a été testé contre un faux serveur qui reproduit la documentation publique. Le format exact des charges utiles de webhook n'est pas documenté publiquement ; la lecture est défensive.
- **Resend réel** : idem, testé contre un faux serveur.
- **Build APK signé** : jamais exécuté avec de vrais secrets de signature.
- **Dernier run GitHub Actions** : les journaux CI ne sont pas accessibles depuis cet environnement.

## 4. État final (après la finalisation bêta)

Branche `feature/dabacash-v1-beta-finalization`. Détail des chiffres : [TESTING.md](TESTING.md).

| Élément de l'état initial | Statut final | Preuve |
|---|---|---|
| A1–A7, I4, D4, C1, C2 (critiques et hautes) | **Corrigés** | sondes rejouées en tests d'intégration ; 15 protections retirées une à une, toutes détectées |
| D1–D3, V1, V2, V4, I1–I3, I5 (moyens et bas) | **Corrigés** | tests `validation`, `security`, `production`, `smoke` |
| Fuites découvertes ensuite (prix de rachat, champs de fraude, 413→500) | **Corrigées** | tests `security`, `buyback`, `validation` |
| Identifiants admin codés en dur | **Supprimés** ; admin créé par script depuis l'environnement ; démo isolée et refusée en production | `packages/database/prisma/*` |
| `npm audit` 20 vulnérabilités (1 critique, 8 hautes) | **Production : 0.** Reste 24 avis dev-only (outil de build APK, chaîne ESLint) | SECURITY.md, limite 8 |
| Lint inexistant | ESLint API (0 erreur) et web (0 erreur) | CI |
| CI : typage + 15 tests unitaires | CI : migrations + dérive, typage, lint, 25 unitaires, **273 d'intégration**, builds web + APK, audit | `.github/workflows/ci.yml` |
| Client incomplet | **Ajouté** : *Mon compte* (profil, notifications, rachats, mot de passe, export, suppression), annulation de commande, IMEI et adresse d'enlèvement | `/account`, `/sell` |
| Franchise incomplet | **Ajouté** : surcharge de prix encadrée, finalisation, édition prix/stock, archivage, toutes les transitions, analytics sur période | `/dashboard/*` |
| Admin incomplet | **Ajouté** : utilisateurs et rôles, création de franchise, catalogue/prix, transactions, audit, IMEI, fraude réversible | `/admin/*` |
| Web : erreurs et chiffres inventés | Pages d'erreur et 404 ; chiffres d'accueil lus depuis l'API ; texte « IA » remplacé par une description honnête de l'estimateur | `HeroSection`, `PriceEstimator` |
| Docs : aucune | README, INSTALL, ENVIRONMENT, DEPLOY (avec rollback), SECURITY, RECETTE, TESTING, RELEASE_NOTES | `docs/` |

Ce qui **reste** (voir RELEASE_NOTES.md) : cookies de session lisibles par JS, rate limiting mono-instance, montants en `Float`, pas de remboursement ni de téléversement de photos, pas de comptes employés, intégrations Aslan/Resend jamais validées en réel, textes juridiques à rédiger, APK signé non testé.
