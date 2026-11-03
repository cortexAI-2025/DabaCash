# Recette (acceptation manuelle)

À dérouler sur l'environnement de bêta, avec **des données fictives uniquement** (comptes `@demo.dabacash.test`, paiement Aslan en **sandbox**). Cocher chaque ligne ; consigner tout écart avec l'id de requête affiché dans l'erreur.

## A. Mise en route
- [ ] `GET /api/v1/health` → `ok` / `database: up`
- [ ] Connexion admin ; *Catalogue* : prix de référence saisis pour les modèles proposés à la vente
- [ ] Accueil : les chiffres affichés correspondent à la réalité (annonces, franchises, villes, ventes) — aucun chiffre inventé

## B. Client
- [ ] Inscription refusée avec mot de passe faible (< 10 car., sans chiffre) ; acceptée avec un mot de passe conforme ; le compte est `CUSTOMER`
- [ ] Mauvais mot de passe : message clair ; 5 échecs → message « trop de tentatives » ; l'admin peut déverrouiller
- [ ] Marketplace : recherche, filtres, pagination ; fiche produit sans aucun prix de rachat visible
- [ ] Commande **cash en magasin** → page « Commande enregistrée » ; visible dans *Mes commandes* ; **Annuler** libère le stock
- [ ] Double clic sur « Réserver » → **une seule** commande
- [ ] Commande **en ligne** (sandbox Aslan) → redirection, paiement fictif, retour : statut « confirmé » seulement après le webhook ; paiement abandonné : « non abouti », possibilité de réessayer
- [ ] Livraison à domicile : adresse et ville obligatoires, paiement en ligne imposé
- [ ] *Vendre* : estimation (ou message « indisponible » si pas de prix) ; IMEI invalide refusé ; demande envoyée ; visible dans *Mon compte* ; annulable tant qu'elle est en attente
- [ ] *Mon compte* : profil modifiable, notifications (compteur dans la barre), changement de mot de passe → déconnexion de tous les appareils, export JSON, suppression de compte (mot de passe demandé)
- [ ] Accès direct à `/admin`, `/dashboard` : refusé pour un client ; `/account`, `/orders` : redirigent vers la connexion si anonyme

## C. Franchise
- [ ] Inventaire : modifier prix/stock (stock < réservé refusé), archiver / remettre en vente
- [ ] Nouveau produit : prix entiers, prix de vente ≥ prix de rachat
- [ ] Rachats : accepter avec un prix ; écart > 50 % sans note refusé ; **Finaliser** après remise de l'appareil
- [ ] Une demande **signalée** est bloquée côté franchise avec un message explicite
- [ ] Commandes : Confirmer → Expédier → Livré ; Annuler libère le stock ; une commande **payée** ne s'annule pas par simple statut
- [ ] Statistiques : valeurs cohérentes avec les commandes

## D. Administrateur
- [ ] Utilisateurs : changer un rôle, désactiver (sessions fermées), pas d'auto-modification
- [ ] Franchises : création (propriétaire + mot de passe provisoire), suspension / réactivation, commission 0–50 %
- [ ] Fraude : valider ; confirmer (note obligatoire, option blocage IMEI) ; **rouvrir** une décision
- [ ] IMEI : recherche, blocage, déblocage
- [ ] Transactions : filtres, total des paiements réglés
- [ ] Audit : chaque action ci-dessus apparaît, avec son auteur
- [ ] Analytics : cohérents avec les commandes

## E. Transverses
- [ ] Téléphone (390 px) : aucune page ne défile horizontalement ; navigation au clavier ; libellés lus par un lecteur d'écran sur les formulaires
- [ ] Erreurs : API coupée → message « impossible de joindre le serveur » + bouton Réessayer, jamais une page blanche
- [ ] Aucun secret ni donnée personnelle dans la console du navigateur ni dans les journaux

## Critère de sortie de bêta fermée
Aucun écart bloquant ouvert ; les 3 premières semaines sans incident de sécurité ni de montant incohérent ; revue des risques de `RELEASE_NOTES.md` (« Avant d'ouvrir au public ») terminée.
