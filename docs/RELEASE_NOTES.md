# Notes de version — V1 bêta (fermée)

## Résumé

Version de stabilisation : sécurisation de l'API (contrôle d'accès, sessions, concurrence, validation), complétion des parcours client / franchise / administrateur, tests d'intégration sur vraie base, CI renforcée, documentation d'exploitation. État initial et justification : [AUDIT.md](AUDIT.md).

## Principaux changements

**Sécurité** — inscription forcée en `CUSTOMER` ; contrôle d'accès par propriétaire sur commandes et rachats ; verrouillage de compte ; refresh tokens hachés, rotation et détection de réutilisation ; CORS strict, en-têtes `helmet`, limitation de débit ; validation d'environnement au démarrage ; journal d'audit transactionnel ; plus aucun identifiant codé en dur.

**Fiabilité** — verrou de ligne unique sur les commandes (utilisateur / webhook / expiration), transitions conditionnelles, idempotence des créations, contraintes `CHECK` en base, expiration automatique des commandes impayées (2 h en ligne, 48 h cash), erreurs normalisées avec id de requête, point de santé.

**Produit** — *Mon compte* (profil, notifications, rachats, mot de passe, export/suppression) ; tunnel de vente avec IMEI et adresse d'enlèvement ; franchise : prix final encadré, finalisation, édition de stock/prix, analytics ; admin : utilisateurs et rôles, création de franchise, catalogue de prix, transactions, audit, IMEI, fraude réversible ; pages d'erreur ; chiffres d'accueil réels.

**Technique** — NestJS 10 → 12, Next 14 → 16, zod 4, ESLint 9 ; `middleware.ts` → `proxy.ts` ; Node 22 en CI ; données de démonstration isolées des données de production.

## Changements incompatibles / à connaître pour la mise à jour

- Migration `20261103000000_beta_hardening` : **purge toutes les sessions** (tout le monde se reconnecte).
- Les réponses de liste sont désormais **paginées** : `{ items, pagination: { page, limit, total, totalPages, hasNext } }` (`limit` ≤ 50 sur les routes publiques).
- Prix en **dirhams entiers** (exigence Aslan/NAPS).
- `POST /orders` et `POST /buyback` acceptent l'en-tête `Idempotency-Key`.
- L'inscription n'accepte plus de champ `role`.
- Plus de prix par défaut : **un modèle sans prix de référence ne produit pas d'estimation** (422) tant que l'admin n'a pas saisi le prix.
- Variables d'environnement nouvelles ou renforcées : voir ENVIRONMENT.md (l'API refuse de démarrer si elles sont dangereuses).

## Limites connues

Voir [SECURITY.md](SECURITY.md) (« Limites connues ») et [TESTING.md](TESTING.md) (« Lacunes de test »).

## Avant d'ouvrir au public (hors bêta fermée) — décisions humaines requises

1. **Valider Aslan en réel** : paiement sandbox de bout en bout, format exact des webhooks, puis bascule `sk_live_*` par une personne habilitée. Rien de réel n'a été exécuté ici.
2. **Cadre juridique** : CGU, politique de confidentialité, mentions légales, conservation des données, déclaration CNDP, fiscalité de la revente/rachat. Les pages existantes sont des gabarits.
3. **Audit de sécurité externe** et test d'intrusion ; passage des cookies de session en `HttpOnly`.
4. **Passage à l'échelle** : rate limiting partagé (Redis) si plusieurs instances ; montants en `Decimal`/centimes ; sauvegardes et restauration **testées**.
5. **Processus** : qui traite les demandes signalées, les remboursements (Aslan), les litiges ; qui est d'astreinte.
6. **APK** : générer un keystore, stocker les secrets de signature dans GitHub, tester un APK signé sur appareil.
7. **Dépendances de build** : monter `@capacitor/cli` (6 → 7) avec test d'APK pour éliminer les avis dev-only.
