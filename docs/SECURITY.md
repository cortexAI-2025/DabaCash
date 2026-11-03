# Sécurité

> **Ce document décrit des contrôles techniques. Il ne constitue pas une attestation de conformité** (RGPD, loi 09-08 / CNDP, PCI-DSS, fiscalité, droit de la consommation ou autre). La qualification juridique et l'audit de sécurité externe restent à faire par des personnes compétentes avant une ouverture publique.

## Contrôles en place (tous couverts par des tests d'intégration — voir TESTING.md)

### Identité et sessions
- Inscription **toujours en `CUSTOMER`** : le champ `role` est refusé (DTO strict). Les rôles se changent uniquement via l'admin, avec journal d'audit, et un administrateur ne peut pas modifier son propre compte (il reste donc toujours au moins un administrateur).
- Mot de passe : 10–72 caractères, au moins une lettre et un chiffre ; haché bcrypt (≥ 10 tours en production).
- Verrouillage : 5 échecs consécutifs → compte verrouillé 15 min (réponse identique à un mauvais mot de passe ; temps constant pour un email inconnu, pas d'énumération de comptes). Déverrouillage manuel par l'admin.
- Jetons : access JWT 15 min ; refresh **à usage unique**, stocké **haché** (SHA-256), rotation à chaque usage ; **réutilisation détectée → toutes les sessions de l'utilisateur sont révoquées**. 10 sessions maximum par utilisateur.
- Changement de mot de passe, désactivation, suppression : toutes les sessions sont fermées.
- Le rôle est relu en base à chaque requête (un jeton ne permet pas de conserver un rôle retiré).

### Contrôle d'accès
- RBAC par garde sur chaque route ; routes admin protégées par un décorateur unique `@AdminOnly`.
- **Pas d'IDOR** : un client ne lit que ses commandes/rachats ; une franchise que les siens ; accès croisé → 404.
- Les prix d'achat, estimations de rachat, scores et motifs de fraude ne sont **jamais** exposés aux clients (vues par `select` explicite, pas de filtrage a posteriori).
- Une franchise ne peut ni se voir attribuer un rôle ni modifier sa commission.

### Intégrité des données et concurrence
- Verrou de ligne `SELECT … FOR UPDATE` pris **en premier** sur toute mutation de commande (action utilisateur, webhook de paiement, balayeur d'expiration) : pas d'entrelacement, pas d'interblocage.
- Transitions d'état conditionnelles ; réservation de stock sous verrou ; **idempotence** (`Idempotency-Key`, unique par client) sur création de commande et de demande de rachat.
- Contraintes `CHECK` en base (stock ≥ 0, réservé ≤ stock, commission 0–50 %, montants ≥ 0, quantités > 0) : même un bug applicatif ne peut pas les violer.
- Prix en dirhams entiers (exigence Aslan/NAPS) ; montants transmis à Aslan en centimes.

### Paiement (Aslan)
- Page de paiement **hébergée** : aucune donnée de carte ne transite ni n'est stockée par DabaCash.
- Webhook : signature HMAC vérifiée en temps constant, fenêtre anti-rejeu de 5 minutes, règlement idempotent. Le retour navigateur n'est **jamais** une preuve de paiement (la page de résultat interroge le statut tenu à jour par le webhook).
- Aucune clé réelle n'est utilisée dans les tests ni dans ce dépôt.

### Fraude (aide à la décision, jamais une sanction automatique)
- Score additif à signaux explicites (IMEI invalide/déjà en cours/bloqué, rafale de demandes, compte neuf + valeur élevée…). Au-delà du seuil la demande est **suspendue** (la franchise reçoit un 409) jusqu'à décision humaine d'un admin.
- Confirmer une fraude exige une **note**, annule la demande avec un email neutre au client, et est **réversible** (réouverture avec motif). L'ajout de l'IMEI à la liste de blocage est une option explicite, tracée.
- Aucun compte n'est suspendu ni supprimé automatiquement.

### Plateforme
- `helmet`, CORS strict par liste blanche (`CORS_ORIGINS`), limite de taille de corps (100 ko par défaut, 413 au-delà), `ValidationPipe` (liste blanche + refus des champs inconnus), filtre d'exceptions qui ne renvoie ni trace ni détail interne (id de requête seulement).
- Limitation de débit : global 120/min/IP ; inscription 10/h ; connexion 10/min ; refresh 30/min ; estimation 30/min ; export de données et suppression de compte 5/h ; changement de mot de passe 10/h.
- Validation de configuration au démarrage (voir ENVIRONMENT.md) : l'API refuse de démarrer avec un secret faible, un CORS ouvert ou le rate limiting désactivé en production.
- **Journal d'audit** en lecture seule pour les actions sensibles (rôles, activation, franchises, prix de référence, fraude, IMEI, mots de passe, connexions verrouillées), écrit **dans la même transaction** que l'action.
- Dépendances : `npm audit --omit=dev` = **0 vulnérabilité** (exécuté en CI avec seuil « high »).

## Données personnelles (principes appliqués)

| Sujet | Mise en œuvre |
|---|---|
| Minimisation | profil = nom, email, téléphone facultatif ; pas de pièce d'identité ; IMEI uniquement pour les demandes de rachat |
| Accès / portabilité | `GET /users/me/export` (JSON complet), bouton dans *Mon compte* |
| Effacement | `DELETE /users/me` (mot de passe requis) : **anonymisation** du profil, sessions fermées. Les commandes et traces d'audit sont conservées sous forme dépersonnalisée (obligations comptables/preuve) |
| Journaux | pas de corps de requête, pas de query string, pas de mots de passe ni jetons |
| Emails | échappés, « au mieux », sans donnée sensible ; l'email d'une fraude confirmée est volontairement neutre |

**À décider avant l'ouverture publique (hors périmètre technique)** : durées de conservation chiffrées, base légale et déclaration CNDP, mentions légales/CGU/politique de confidentialité (les pages existantes sont des **gabarits**, pas des textes validés), sous-traitants (hébergeur, Resend, Aslan).

## Limites connues (acceptées pour la bêta, à traiter ensuite)

1. **Jetons dans des cookies lisibles par JavaScript** (`js-cookie`, `SameSite=Strict`) : une faille XSS permettrait de les voler. Mitigations : `SameSite=Strict`, refresh à usage unique avec détection de réutilisation, contenu échappé par React, pas de `dangerouslySetInnerHTML`. Cible : cookies `HttpOnly` posés par l'API/BFF.
2. **Limitation de débit en mémoire** : valable pour **une seule instance** d'API ; plusieurs instances = limites non partagées (stockage Redis à prévoir). Dépend aussi de `TRUST_PROXY` correct.
3. **Montants stockés en `Float`** (affichage et règles en dirhams entiers, arrondi au centime) : à migrer vers `Decimal`/centimes entiers avant des volumes ou une comptabilité réels.
4. **Pas d'API de remboursement** : un remboursement se fait dans le tableau de bord Aslan ; `REFUNDED` est terminal et une commande payée ne peut pas être annulée par simple changement de statut.
5. **Pas de téléversement de photos** : URLs HTTPS saisies à la main (tableau de bord franchise) ; aucune image n'est stockée par DabaCash.
6. **Pas de comptes employés** d'une franchise (un propriétaire = un compte) ni d'authentification à deux facteurs, ni de réinitialisation de mot de passe par email, ni de vérification d'email.
7. **Pas de purge automatique** des sessions expirées et des anciennes notifications (tâche de maintenance à ajouter).
8. **Outils de développement** : `npm audit` complet signale 24 avis (1 critique, 1 élevé, 22 modérés), **tous hors dépendances de production** : `tar` via `@capacitor/cli` (outil de build de l'APK, exécuté en CI sur des archives de confiance) et la chaîne ESLint/NestJS CLI. Mise à jour majeure de Capacitor (6 → 7) à planifier avec un test d'APK.
9. **Intégrations réelles non vérifiées** ici : Aslan et Resend ont été testés contre des **faux serveurs** conformes à leur contrat documenté, pas contre les services réels.
