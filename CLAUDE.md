# Wilson — consignes pour Claude

Dépôt **public** (publié tel quel sur GitHub Pages) : jamais de clé, jeton, secret, adresse de script, adresse e-mail,
identifiant de feuille, souvenir ou propos de la famille, ni donnée client — ni dans le code, ni dans un commit, ni dans
le titre ou la description d'une demande. Les règles et l'état du projet sont dans le dépôt privé `wilson-notes`
(`ETAT.md` d'abord ; `PLAN.md` section par section, jamais en entier).

## Où est quoi

| Chemin | Rôle |
|---|---|
| `index.html`, `css/`, `manifest.webmanifest`, `sw.js` | la page, son style, l'appli installable, le cache hors ligne |
| `js/app.js` | chef d'orchestre (≈1 450 lignes) : démarrage, états, regard, conversation, branchement de Gemini et du micro, `_tick` |
| `js/app/*.js` | le reste des méthodes de la classe `App`, rangées par domaine (24/11/26) et ajoutées à `App.prototype` par `app.js` : `mode-eco`, `consignes` (consignes données à Gemini), `reseau`, `reponses` (verrou de vérité, réponses à dire plus tard), `outils-gemini`, `en-voiture`, `crm-et-outils`, `ecran` (cartes, appels) ; constantes et petites fonctions communes dans `commun.js`. Une méthode se trouve par `grep -n 'nomDeLaMethode(' js/app.js js/app/*.js` |
| `js/brain.js` / `js/eco.js` | Gemini Live (mode direct) / mode économique |
| `js/vision.js` + `vision-worker.js`, `js/qui.js` + `qui-worker.js`, `js/face.js` + `js/faces/` | regard, visages reconnus, dessin du visage (Miel) |
| `js/audio.js`, `js/worklets/`, `js/voice.js`, `js/oreille.js` | micro, voix de la tablette, « Wilson » reconnu en voiture |
| `js/crm.js`, `js/analyste.js`, `js/annuaire.js` | CRM à la voix, moteur de questions, annuaire sur l'appareil |
| `js/voiture.js`, `js/maison.js`, `js/outils.js` | protocole voiture, Home Assistant, autres outils |
| `js/famille.js`, `js/garde.js`, `js/memoire.js`, `js/questions.js`, `js/claude.js` | famille, garde, mémoire, questions de Claude, Claude du PC |
| `js/remote.js`, `js/sync.js`, `js/settings.js`, `js/stockage.js` | journal à distance, réglages partagés, écran de réglages |
| `apps-script/` | script Google de Wilson (déployé par le robot du dépôt `crm-boschat`) |
| `pc/` | relais Claude du PC de la maison (« l'atelier ») et ses consignes |
| `android/` | coque Android du téléphone |
| `vendor/` | bibliothèques tierces (ne pas modifier) |
| `tests/` | tests : `tests/README.md` dit ce que chacun vérifie |

## Avant de publier

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &   # à la racine du dépôt
tests/tout.sh                                    # tous les tests (ou : tests/tout.sh e2e_crm.py voiture_unit.mjs)
node pc/version.mjs x.y.z "nouveautés"           # monte la version (app.js, sw.js, version.json)
```

- Jamais de demande avec un test rouge. Ajouter ou adapter une vérification dans le test concerné.
- Branche + demande de modification vers `main`, jamais de push sur `main`, jamais de fusion par Claude : la
  « Publication automatique » fusionne quand « Vérifier » est vert. Toucher `.github/`, `pc/`, `apps-script/`,
  `android/`, `vendor/`, les workers ou la Content-Security-Policy est signalé « À surveiller » : seulement si nécessaire.
- Français, dates jj/mm/aa, heures « 10h00 ».
