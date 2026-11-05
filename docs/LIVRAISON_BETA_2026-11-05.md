# Livraison technique DabaCash V1 bêta — 5 novembre 2026

## Références
- PR de finalisation V1 : https://github.com/cortexAI-2025/DabaCash/pull/1 (non fusionnée).
- Complément Android et navigateur : https://github.com/cortexAI-2025/DabaCash/pull/2 (non fusionnée).
- Commit applicatif et workflows vérifiés : `6863a2fb8c0088516c7d660c3e7186fa6238fbab`.
- Branche : `release/beta-android-20261105`. Ce rapport est ajouté ensuite dans un commit documentaire.

## Corrections livrées
- Workflow Android : installation depuis le lockfile, erreurs TypeScript bloquantes, copie des ressources sans masquage d'erreur.
- Blocage reproduit : le run 42013926647 échouait sur `sdkmanager: command not found`. Le workflow recherche maintenant son exécutable dans le SDK installé, accepte les licences puis installe les composants requis.
- Vérification des signatures APK avec apksigner et conservation de SHA-256. Un artefact absent fait échouer l'upload.
- Nom de fichier release manuel indépendant du nom de branche (qui peut contenir des slashs). Le chemin release reste non exercé.
- Recette Chromium automatisée avec vraie API NestJS, PostgreSQL jetable, web compilé, comptes fictifs et secrets éphémères. Aucune clé Aslan ou Resend.
- Le script navigateur refuse une cible distante ; ce refus a été exécuté localement avec un hôte distant et code de sortie 2.

## Résultats exécutés
| Contrôle | Résultat | Preuve |
|---|---|---|
| CI API/web et audit dépendances production | 3 jobs SUCCESS | https://github.com/cortexAI-2025/DabaCash/actions/runs/42014261224 |
| Unitaires API | 25/25, 0 échec | Job 127201095248 |
| Intégration API, vraie base | 273/273, 0 échec | Même job |
| Typage, lint, migrations, dérive, builds | Étapes SUCCESS | Même run CI |
| Chromium : client, franchise, admin, mobile 390 px | 49/49 | https://github.com/cortexAI-2025/DabaCash/actions/runs/42014261413 |
| Export web, APK debug, analyse APK | 3 jobs SUCCESS | https://github.com/cortexAI-2025/DabaCash/actions/runs/42014252175 |
| Signature debug | v1 et v2 vérifiées | Job 127201243296 |
| Intégrité après téléchargement | Archive puis APK comparés à leurs SHA-256 | Vérification locale des octets téléchargés |

Les contrôles locaux de cette passe portent sur YAML, syntaxe des scripts shell/JavaScript, refus d'hôte distant et intégrité de l'APK. Les compilations et les suites complètes ont été exécutées sur GitHub Actions, pas présentées comme une nouvelle installation locale.

## APK livré
- Fichier : `DabaCash-V1-beta-Android.apk`, 5 839 722 octets (environ 5,57 Mio).
- Type : **debug**, certificat Android Debug (ce n'est pas une signature de publication durable).
- SHA-256 APK : `735062e2d649031cf1f3ca8003933f14b1ffac2d3f6185bc9061da0b95db195c`.
- SHA-256 archive : `723a35db1a2fffc64e59f2c02680d179a80d4a9ca8e67f8e3bbe9a0be33ec1dd`.
- Artefact GitHub : 13408353207. Expiration annoncée : 19 novembre 2026.
- URL d'API effectivement présente dans le bundle : `https://api.dabacash.ma`.
- Installation et exécution sur Samsung Galaxy A14 : **non exécutées**.

## Verdicts et reste à faire
- **Technique en environnement isolé : GO** pour les parcours couverts ci-dessus.
- **APK : construit, signature et intégrité vérifiées**, test sur téléphone restant.
- **Bêta hébergée : non validée.** L'accès à `/api/v1/health` de l'API compilée dans l'APK n'a pas pu être validé depuis cet environnement (réponse 503 via le proxy). Ce résultat ne permet pas d'attribuer la panne au serveur. Aucun projet nommé DabaCash n'apparaît dans l'inventaire Railway consulté ; aucun déploiement n'a été créé.
- **Ouverture publique : NO-GO**, conformément à RELEASE_NOTES.md : recette Aslan sandbox et emails, hébergement/base et restauration, signature durable et test appareil, revue sécurité et pages juridiques restent à finaliser.
- Ne pas prendre la réussite des parcours locaux pour une preuve de fonctionnement du backend distant. Pour une bêta utilisable sur téléphone : connecter un backend de recette avec données fictives, autoriser l'origine Capacitor nécessaire, vérifier sa santé et refaire une connexion et une réservation cash depuis l'appareil.
- Aucune fusion, migration distante, publication, modification de production ou transaction réelle.
