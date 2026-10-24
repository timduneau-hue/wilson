# Wilson

Compagnon du salon pour tablette Android (pensé pour la Samsung Galaxy Tab S5e, SM-T720) :
un visage animé qui voit quand on le regarde, écoute, répond et se souvient.

- **Ouvrir** : la page GitHub Pages de ce dépôt, dans Chrome sur la tablette, puis « Ajouter à l'écran d'accueil ».
- **Réglages** : appui long (1,5 s) sur le visage.
- **Parler** : le regarder et lui parler (inutile de dire son nom) — ou toucher le visage.
- **Le couper** : toucher l'écran.
- **En voiture** (téléphone) : bouton voiture en haut à gauche, ou tout seul en roulant ; Wilson se réveille quand on dit « Wilson ».
- **CRM** (facultatif) : questions sur les clients, appels, tâches et brouillons, par le script du propriétaire (voir PLAN.md, 2 quater).

Fonctionnement et règles : voir [PLAN.md](PLAN.md).

## Confidentialité
- En veille, tout reste sur la tablette : la détection du regard est locale (MediaPipe).
  Seules les phrases dites en regardant Wilson sont envoyées.
- Pendant une conversation, le son et une image de la caméra partent vers Gemini (Google).
  Sur le palier gratuit de l'API Gemini, Google peut utiliser ces échanges pour améliorer ses produits.
- La clé API, les souvenirs et le journal restent dans le stockage local de la tablette.
- Réglages communs à tous les appareils : copiés par un lien (partie « # », jamais envoyée au serveur), puis synchronisés
  par le script Apps Script du propriétaire (propriétés du script, dans son compte Google).
- CRM (facultatif) : les questions passent par le script Apps Script du propriétaire, qui interroge son CRM avec son
  propre jeton (le CRM reste en accès « Moi uniquement »). Les fiches utiles sont gardées sur l'appareil pour la journée.
  Rien n'est écrit dans le CRM sans confirmation ; les comptes rendus, rendez-vous et notes y arrivent en brouillon.
- Mode voiture : l'oreille qui reconnaît « Wilson » tourne sur le téléphone ; ses empreintes de voix restent dessus.
- Journal à distance (facultatif) : si l'adresse d'un script Apps Script est indiquée, le journal, les délais et l'état
  de la tablette partent dans une feuille Google du propriétaire (les phrases échangées peuvent être exclues dans les réglages).

## Composants tiers
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 1.1.1 — Apache-2.0 (`vendor/mediapipe/`, version script classique pour le Web Worker)
- [MediaPipe Face Detection](https://www.npmjs.com/package/@mediapipe/face_detection) (modèle longue portée) — Apache-2.0 (`vendor/face_detection/`)
- Modèle MediaPipe Face Landmarker (`face_landmarker.task`) — Apache-2.0 (`vendor/models/`)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (Kazuhiko Arase) — MIT (`vendor/qrcode/`) : QR code de copie des réglages
