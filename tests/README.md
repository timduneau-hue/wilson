# Tests de Wilson

Tests de bout en bout dans Chromium (Playwright), avec faux micro, fausse caméra et Gemini simulé
(aucune clé ni requête réelle : la clé utilisée est un exemple factice).

```sh
pip install playwright && playwright install chromium   # une fois
./make_fixtures.sh                                       # fausses vidéos de caméra (.y4m) à partir des photos
cd .. && python3 -m http.server 8765 --bind 127.0.0.1 &  # servir l'appli (dossier racine du dépôt)
cd tests && for t in e2e.py e2e_eco.py e2e_echo.py e2e_conn.py e2e_key.py e2e_update.py stream_unit.py e2e_gaze.py e2e_speed.py e2e_remote.py; do python3 $t; done
node apps_script_unit.js                                 # script Apps Script du journal, avec une fausse feuille
```

| Fichier | Ce qui est vérifié |
|---|---|
| `e2e.py` | Mode direct (Gemini Live simulé) : réveil, parole, coupure, outils, réglages |
| `e2e_eco.py` | Mode économique (Gemini Flash simulé) : WAV, photo, lecture en flux, souvenirs, quota |
| `e2e_echo.py` | Écho : Wilson ne se réentend pas, ne se répète pas, télé en fond |
| `e2e_conn.py`, `e2e_key.py` | Connexion, clés `AQ.` / `AIza`, jeton éphémère, messages d'erreur |
| `e2e_update.py` | Mise à jour automatique (version.json) |
| `stream_unit.py` | Lecture du JSON en flux (1 200 cas) |
| `e2e_remote.py` | Journal à distance : envoi des lignes, délais, bilan, phrases masquables, erreurs JS, coupure réseau, QR code, envoi au rechargement |
| `apps_script_unit.js` | `apps-script/journal.gs` sur une fausse feuille : plus récent en haut, délais, état, purge, page QR |
| `e2e_speed.py` | Rapidité (PLAN 6 bis) : envoi anticipé (confirmé / annulé), recherche en deux temps, relance si Google traîne, garde-fou de débit, schéma refusé, ancien réglage de réflexion |
| `e2e_gaze.py` | Écoute au regard : regardé + parole → réponse ; visage tourné → rien n'est envoyé |
| `vision_run.py` | Détection du regard seule sur chaque fausse vidéo (`python3 vision_run.py pos neg_turned …`) |
| `jank.py` | Fluidité de l'animation pendant l'analyse de la caméra |

Les suites autres que `e2e_gaze.py`, `vision_run.py` et `jank.py` bloquent les modèles de vision (trop lents
sans carte graphique) : le regard y est simulé (`listenMode: 'toujours'` ou `vision.forceLook`).
