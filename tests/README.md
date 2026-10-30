# Tests de Wilson

Tests de bout en bout dans Chromium (Playwright), avec faux micro, fausse caméra et Gemini simulé
(aucune clé ni requête réelle : la clé utilisée est un exemple factice).

```sh
pip install playwright && playwright install chromium   # une fois
./make_fixtures.sh                                       # fausses vidéos de caméra (.y4m) à partir des photos
python3 make_voix.py                                     # voix de synthèse pour l'oreille du mode voiture (espeak-ng + mbrola-fr1/fr4)
cd .. && python3 -m http.server 8765 --bind 127.0.0.1 &  # servir l'appli (dossier racine du dépôt)
cd tests && for t in e2e.py e2e_eco.py e2e_echo.py e2e_conn.py e2e_key.py e2e_update.py stream_unit.py e2e_gaze.py e2e_speed.py e2e_remote.py e2e_sound.py e2e_live_search.py e2e_attention.py e2e_sync.py e2e_vision_health.py e2e_crm.py e2e_car.py e2e_journal_2510.py e2e_route.py e2e_question.py e2e_maison.py e2e_adresse.py e2e_outils.py; do python3 $t; done
node apps_script_unit.js                                 # script Apps Script du journal, avec une fausse feuille
node oreille_unit.mjs                                    # oreille du mode voiture sur les voix de synthèse
node maison_unit.mjs                                     # module maison (faux Home Assistant)
```

| Fichier | Ce qui est vérifié |
|---|---|
| `e2e.py` | Mode direct (Gemini Live simulé) : réveil, parole, coupure, outils, réglages |
| `e2e_eco.py` | Mode économique (Gemini Flash simulé) : WAV, photo, lecture en flux, souvenirs, quota |
| `e2e_echo.py` | Écho : Wilson ne se réentend pas, ne se répète pas, télé en fond |
| `e2e_conn.py`, `e2e_key.py` | Connexion, clés `AQ.` / `AIza`, jeton éphémère, messages d'erreur |
| `e2e_update.py` | Mise à jour automatique (version.json) |
| `stream_unit.py` | Lecture du JSON en flux (1 200 cas) |
| `e2e_sound.py` | Son du direct : micro sans annulation d'écho (sinon « mode appel » sur Android), pas d'auto-coupure, délai du direct, son d'essai, coupure directe (micro rouvert), batterie signalée une fois |
| `e2e_vision_health.py` | Vision qui se répare (modèles réels) : repères en échec → repris sur le processeur ; analyse bloquée → relancée ; regard qui revient |
| `e2e_sync.py` | Mêmes réglages partout : copie par QR code / lien (téléphone → tablette), synchronisation par le script dans les deux sens, PC qui rejoint, réglages propres à l'appareil, script pas à jour |
| `e2e_attention.py` | Regard (R1, R3) : visage sans regard → rien ; 3 s sans regard → veille, micro coupé ; regardé → reprise instantanée ; fermeture après 12 s ; portrait |
| `e2e_live_search.py` | Mode direct : outil « chercher » (Flash-Lite + Google Search), délai maximal 9 s, relance si Gemini reste muet, recherche annulée |
| `e2e_remote.py` | Journal à distance : envoi des lignes, délais, bilan, phrases masquables, erreurs JS, coupure réseau, QR code, envoi au rechargement |
| `apps_script_unit.js` | `apps-script/journal.gs` sur une fausse feuille : plus récent en haut, délais, état, purge, page QR |
| `e2e_speed.py` | Rapidité (PLAN 6 bis) : envoi anticipé (confirmé / annulé), recherche en deux temps, relance si Google traîne, garde-fou de débit, schéma refusé, ancien réglage de réflexion |
| `e2e_gaze.py` | Écoute au regard : regardé + parole → réponse ; visage tourné → rien n'est envoyé |
| `vision_run.py` | Détection du regard seule sur chaque fausse vidéo (`python3 vision_run.py pos neg_turned …`) |
| `jank.py` | Fluidité de l'animation pendant l'analyse de la caméra |
| `e2e_crm.py` | CRM à la voix (PLAN 2 quater) : outils du direct, fiche gardée (nom mal prononcé), deux clients possibles, appel (bouton vert), verrou des écritures (la demande elle-même, « attends, non », puis « oui, vas-y »), brouillons, Oui/Non à l'écran, retour d'appel, même chemin en mode économique |
| `e2e_car.py` | Mode voiture sur un téléphone simulé : bouton, caméra coupée, journée préparée, oreille apprise, réveil par « Wilson, qui je vois demain ? » au micro (pas par « Il fait beau »), réponse retenue jusqu'à la transcription du nom, faux réveil rendormi, GPS |
| `e2e_journal_2510.py` | Corrections d'après le journal du 25/10/26 : caméra figée (regard périmé ignoré, discussion continue), session perdue chez Google (nouvelle session tout de suite), mode voiture en roulant sans couper la discussion, pas de retour tout seul 20 min après l'avoir quitté, positions imprécises ignorées |
| `e2e_route.py` | Sur la route (PLAN C8–C10), téléphone simulé : réseau bloqué ou coupé (discussion gardée, voix du téléphone, même session reprise, phrase dite pendant la coupure envoyée), abandon au bout du délai, réveil sans réseau, appel téléphonique (silence numérique : il se tait, aucun « oui » ne compte, reprise), écriture gardée sans réseau puis envoyée, écriture incertaine non renvoyée, nom de client approximatif, téléphone secoué, pas de relance pendant un outil |
| `e2e_question.py` | Moteur de questions (PLAN C11–C12) : l'analyste (Gemini simulé) lit la description du CRM, écrit une recherche que le CRM (simulé) exécute, puis répond ; tête qui réfléchit ; réponse affichée ; outil annulé → réponse par message ; discussion terminée → il se réveille pour la dire ; CRM pas encore à jour ; itinéraire (Google Maps, Waze) ; mode économique |
| `oreille_unit.mjs` | Oreille seule (Node) : apprentissage, phrases avec et sans le nom, bruit de voiture, autre voix, flux continu, temps de calcul |
| `apps_script_unit.js` (suite) | Relais du CRM : adresse absente, jeton transmis, CRM pas à jour, accès refusé, essaiCRM |

Les suites autres que `e2e_gaze.py`, `vision_run.py` et `jank.py` bloquent les modèles de vision (trop lents
sans carte graphique) : le regard y est simulé (`listenMode: 'toujours'` ou `vision.forceLook`).
| `e2e_maison.py`, `maison_unit.mjs` | La maison (PLAN 7 bis, D7) : outils maison_etat / maison_commande seulement si adresse + jeton, inventaire dans la consigne (sans prises cachées ni réglages), allumer, luminosité refusée sur prise, volume, appli Netflix (télécommande Android TV), radio (Radio Browser → Chromecast, pas de m3u8), clignoter (retour à l'état de départ), appareil introuvable, Tailscale éteint, jeton refusé, voie simple du mode économique |
| `e2e_adresse.py` | Voir ce qu'il fait, savoir à qui on parle (PLAN 7 ter) : pastille d'action (sablier, ✓, ✗), pas de relance pour « Louis, viens manger », une remarque en l'air ou plusieurs visages ; « oui / non » juste après sa réponse (relance) ; fin de discussion jamais sur un reproche ; « Wilson » du canapé (oreille, sans regard) : discussion ouverte, verrou du prénom, pas de veille ; reprise d'une discussion en veille |
| `e2e_outils.py` | Plus d'outils (PLAN 7 quater) : afficher (puces, étapes, image Wikipédia), fermer l'écran, minuteurs (affichés, sonnerie et voix, annuler), rappels (heure passée refusée, alarme), météo Open-Meteo (texte et carte), liste de courses Home Assistant, idées, remarques (G1), écran qui s'efface (90 s / 4 min), nouveautés de version.json (G3) |
