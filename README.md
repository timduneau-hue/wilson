# Wilson

Compagnon du salon pour tablette Android (pensé pour la Samsung Galaxy Tab S5e, SM-T720) :
un visage animé qui écoute son prénom, regarde, répond et se souvient.

- **Ouvrir** : la page GitHub Pages de ce dépôt, dans Chrome sur la tablette, puis « Ajouter à l'écran d'accueil ».
- **Réglages** : appui long (1,5 s) sur le visage.
- **Parler** : « Wilson, … » — ou toucher le visage.

Fonctionnement et règles : voir [PLAN.md](PLAN.md).

## Confidentialité
- En veille, tout reste sur la tablette : la reconnaissance du prénom est locale (Vosk).
- Pendant une conversation, le son et quelques images de la caméra partent vers Gemini Live (Google).
  Sur le palier gratuit de l'API Gemini, Google peut utiliser ces échanges pour améliorer ses produits.
- La clé API, les souvenirs et le journal restent dans le stockage local de la tablette.

## Composants tiers
- [vosk-browser](https://github.com/ccoreilly/vosk-browser) — Apache-2.0 (`vendor/vosk.js`)
- Modèle Vosk français `vosk-model-small-fr-pguyot-0.3` — CC BY-NC-SA 4.0 (`model/`, voir `model/README-modele.md`) : usage personnel non commercial
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) — Apache-2.0 (`vendor/mediapipe/`)
