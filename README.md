# Wilson

Compagnon du salon pour tablette Android (pensé pour la Samsung Galaxy Tab S5e, SM-T720) :
un visage animé qui voit quand on le regarde, écoute, répond et se souvient.

- **Ouvrir** : la page GitHub Pages de ce dépôt, dans Chrome sur la tablette, puis « Ajouter à l'écran d'accueil ».
- **Réglages** : appui long (1,5 s) sur le visage.
- **Parler** : le regarder et lui parler (inutile de dire son nom) — ou toucher le visage.
- **Le couper** : toucher l'écran.

Fonctionnement et règles : voir [PLAN.md](PLAN.md).

## Confidentialité
- En veille, tout reste sur la tablette : la détection du regard est locale (MediaPipe).
  Seules les phrases dites en regardant Wilson sont envoyées.
- Pendant une conversation, le son et une image de la caméra partent vers Gemini (Google).
  Sur le palier gratuit de l'API Gemini, Google peut utiliser ces échanges pour améliorer ses produits.
- La clé API, les souvenirs et le journal restent dans le stockage local de la tablette.

## Composants tiers
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) — Apache-2.0 (`vendor/mediapipe/`)
- [MediaPipe Face Detection](https://www.npmjs.com/package/@mediapipe/face_detection) (modèle longue portée) — Apache-2.0 (`vendor/face_detection/`)
- Modèle MediaPipe Face Landmarker (`face_landmarker.task`) — Apache-2.0 (`vendor/models/`)
