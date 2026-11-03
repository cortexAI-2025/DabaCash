# Variables d'environnement

Modèle : [`.env.example`](../.env.example). **Aucun secret n'est stocké dans le dépôt.** En production, les valeurs sont fournies par la plateforme d'hébergement (secrets), pas par un fichier.

L'API **refuse de démarrer** (message explicite) si la configuration est dangereuse. Règles appliquées au démarrage :

| Règle | Où |
|---|---|
| `DATABASE_URL` présent | toujours |
| `JWT_SECRET` et `JWT_REFRESH_SECRET` : ≥ 32 caractères, différents, pas de valeur « exemple/password/changeme » | toujours |
| `BCRYPT_ROUNDS` entier entre 4 et 15 (défaut 12) ; ≥ 10 | 4–15 toujours ; ≥ 10 en production |
| `CORS_ORIGINS` renseigné, sans `*` | production |
| `THROTTLE_DISABLED` ≠ `true` | production |
| `WEB_URL` en `https://` (si renseignée) | production |
| `ASLAN_WEBHOOK_SECRET` si clé `sk_live_*` | production |

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | oui | connexion PostgreSQL (Prisma) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | oui | signature access (15 min) / refresh (7 j) |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | non | durées |
| `BCRYPT_ROUNDS` | non | coût du hachage des mots de passe |
| `API_PORT` | non (4000) | port d'écoute |
| `CORS_ORIGINS` | prod | origines web autorisées |
| `TRUST_PROXY` | si proxy | sauts de confiance pour `X-Forwarded-For` (nécessaire pour un rate limiting par vraie IP) |
| `ENABLE_SWAGGER` | non | `/docs` : actif hors prod, opt-in en prod |
| `THROTTLE_LIMIT` | non (120) | requêtes/minute/IP ; les routes sensibles ont des limites plus strictes |
| `WEB_URL` | prod | URLs de retour Aslan |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | web | **compilées dans le bundle** : à définir au build |
| `ASLAN_SECRET_KEY`, `ASLAN_WEBHOOK_SECRET`, `ASLAN_API_URL` | pour le paiement en ligne | sans clé, le paiement en ligne est indisponible (le cash en magasin fonctionne) |
| `EMAIL_FROM`, `RESEND_API_KEY` | non | emails « au mieux » : un échec d'envoi n'annule jamais une opération |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | script | `db:create-admin` uniquement |
| `DEMO_PASSWORD`, `ALLOW_DEMO_SEED` | script | `db:seed:demo` uniquement |

## Rotation d'un secret

- `JWT_SECRET` / `JWT_REFRESH_SECRET` : changer la valeur et redémarrer invalide **toutes** les sessions (les utilisateurs se reconnectent).
- `ASLAN_WEBHOOK_SECRET` : changer d'abord côté Aslan et côté API dans la même fenêtre de maintenance ; entre les deux, les webhooks sont rejetés (le statut est rattrapé par le polling du retour de paiement et le balayeur d'expiration).
