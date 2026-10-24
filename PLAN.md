# Wilson — plan directeur

Ce document est le « chef d'orchestre » : chaque module est validé contre ces règles.
Si un détail technique contredit une règle ci-dessous, c'est le détail qui change.

## 1. Ce que Wilson doit être

Un compagnon posé dans le salon, sur une Samsung Galaxy Tab S5e (SM-T720), branché et en Wi-Fi en permanence.
Un visage original (grands yeux expressifs sur fond noir) qui vit, écoute, regarde, répond et se souvient.

## 2. Règles de comportement (non négociables)

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| R1 | Il ne parle que si on s'adresse à lui : **on lui parle en le regardant**. C'est le **regard** qui compte, pas la simple présence d'un visage (un visage seul : il te suit des yeux, écran tamisé, il n'écoute pas). | Caméra : orientation de la tête (yeux, nez) → « on me regarde » ; voix + regard = phrase pour Wilson. Plus de mot-clé « Wilson » (abandonné le 23/10/26 : trop lent sur la tablette). |
| R2 | La phrase est transmise en entier. | Mémoire tampon : le début de la phrase (avant que le regard soit confirmé) est inclus. |
| R3 | Pendant une discussion, on peut détourner les yeux **3 s** ; au-delà, il se met en veille ; dès qu'on le regarde de nouveau, il se réactive. | Règle de Timothée (24/10/26). Plus de 3 s sans regard (hors moments où il parle ou cherche) → veille : yeux mi-clos, écran tamisé, micro coupé vers Gemini. Regardé de nouveau dans les 12 s (« Fin de conversation après ») → reprise **instantanée** de la discussion (la session Gemini est gardée, le début de la phrase est transmis). Au-delà, la discussion est fermée ; regarder + parler la rouvre. Tant qu'on le regarde, il reste à l'écoute (60 s de silence au plus). |
| R4 | Il se tait si on lui coupe la parole. | Toucher l'écran (fiable). Coupure « prudente » (défaut) : micro sans annulation d'écho, Wilson n'écoute pas pendant qu'il parle. Coupure à la voix (« directe ») en option : annulation d'écho, mais sur Android le son passe alors en « mode appel » (plus faible, écouteur sur un téléphone). |
| R5 | Il se tait si les gens parlent entre eux. | Pas de regard = pas d'écoute ; Gemini filtre en plus (« pour_moi ») ; 2 refus d'affilée → veille. |
| R6 | Il voit ce qu'on lui montre. | Une photo jointe à chaque phrase. |
| R7 | Il retient ce qu'on lui dit. | Souvenirs stockés sur la tablette, rappelés à chaque requête. |
| R8 | **Fluide** : visage sans à-coups, réponse ~1 à 2 s après la fin de la phrase. | Analyse de la caméra en arrière-plan (Web Worker, autre cœur) : l'animation ne se fige jamais ; processeur ou carte graphique choisi en mesurant sur la tablette ; fin de phrase détectée même avec la télé ; réponse lue dès la 1re phrase ; mode le plus rapide par défaut ; délais détaillés dans le journal. Budget de latence détaillé en section 6 bis. |
| R9 | Rien d'inutile ne quitte la maison. | Seules les phrases dites en le regardant partent vers Gemini. Le journal à distance va dans la feuille Google de Timothée (son compte), phrases échangées désactivables. |
| R10 | L'écran ne s'abîme pas et ne s'éteint pas. | Anti-veille, veille sombre, visage qui dérive. |

Retour visuel : quand on le regarde, ses yeux s'ouvrent grand et l'écran s'éclaire → on sait qu'il écoute.

## 2 bis. Écran et orientation

- Portrait et paysage, téléphone et tablette : l'appli suit la rotation de l'appareil (manifeste « any », verrouillage
  levé en plein écran) ; le visage s'agrandit pour occuper la largeur en portrait ; les réglages passent sur une colonne.

## 3. Les états (machine à états unique, dans `app.js`)

```
            visage détecté / regard          voix + regard (ou toucher)
   DODO  ───────────────────────▶  VEILLE  ─────────────▶  ÉVEIL (tampon audio : début de phrase)
    ▲   ◀── personne depuis 10 min ──  ▲                        │ prêt
    │                                  │                        ▼
    └──── nuit + personne ─────────────┴── 12 s de silence ── CONVERSATION ◀─┐
                                                                │ il parle   │ fin de réponse
                                                                ▼            │
                                                              PAROLE ────────┘
                                                                │ on le coupe → silence immédiat
```

- **DODO** : yeux fermés, ~8 % de luminosité ; caméra au ralenti (3 images/s), se réveille dès qu'on le regarde.
- **VEILLE** : yeux mi-clos qui suivent les personnes ; quand on le regarde, yeux grands ouverts et écran éclairé (« je t'écoute »).
- **ÉVEIL** : connexion à Gemini (direct) ou envoi de la phrase (économique), début de phrase compris.
- **CONVERSATION** : seules les phrases dites en le regardant (ou juste après sa réponse) partent vers Gemini.
- **PAROLE** : la bouche suit la voix ; on le touche pour le couper (ou à la voix en mode « directe »).

## 4. Modules (les « sous-traitants »)

| Fichier | Rôle | Dépend de |
|---------|------|-----------|
| `js/app.js` | Machine à états, chef d'orchestre | tous |
| `js/face.js` | Visage : dessin, émotions, regard, lèvres | — |
| `js/audio.js` | Micro (16 kHz), tampon, niveau de voix, lecture 24 kHz | Web Audio |
| `js/brain.js` | Client Gemini Live (WebSocket) — cerveau « direct » | clé API Gemini |
| `js/eco.js` | Cerveau « économique » : phrase enregistrée + photo → Gemini Flash → réponse JSON (schéma imposé, recherche en deux temps, relance) | clé API Gemini |
| `js/voice.js` | Voix de la tablette (synthèse vocale) pour le mode économique | navigateur |
| `js/faces/*.js` | Styles de visage : Lumière, Bouille, Rétro, Miel | `face.js` |
| `js/vision.js` | Caméra, **regard** (tête + yeux → « on me regarde »), images pour Gemini | `vision-worker.js` |
| `js/vision-worker.js` | En arrière-plan : visages jusqu'à ~4 m, repères fins, lumière, mouvement | MediaPipe Face Detection (longue portée) + Face Landmarker (repli : mouvement) |
| `js/memory.js` | Souvenirs et petit journal des échanges | localStorage |
| `js/sensors.js` | Toucher, mouvement de la tablette, batterie, réseau | API du navigateur |
| `js/settings.js` | Écran de réglages et premier lancement | — |
| `js/remote.js` | Journal à distance : journal, délais et bilan → feuille Google « Wilson — journal » (lue par Claude) ; lecture du QR code | `apps-script/journal.gs` |
| `apps-script/journal.gs` | Script Apps Script de Timothée (application Web) : range le journal dans la feuille ; recherche Internet par Tavily (clé dans le script) | Google Sheets, Tavily |

## 5. Choix techniques et pourquoi

- **Appli web installée (PWA)** plutôt qu'APK : pas d'outillage Android à installer, mise à jour en un clic, plein écran.
- **GitHub Pages** : gratuit, HTTPS (obligatoire pour micro et caméra).
- **Gemini 3.8 Live** : gratuit (palier gratuit), voix naturelle, vue, interruptions, outils, recherche Google.
  Attention : sur le palier gratuit, Google peut utiliser les échanges pour améliorer ses produits.
- **Micro sans annulation d'écho par défaut** : sur Android, l'annulation d'écho bascule tout le son de la page en
  « mode appel » (volume d'appel, écouteur d'un téléphone) — la voix du mode direct était inaudible (23/10/26).
  La voix de la tablette (mode économique) n'est pas touchée : c'est un autre programme (le moteur de synthèse vocale).
- **Regard calculé sur la tablette** (MediaPipe) : aucune donnée envoyée en veille, aucun quota consommé.
  Le mot-clé « Wilson » (Vosk) a été retiré le 23/10/26 : il ralentissait trop la tablette.
- **La clé API** n'est jamais dans le code publié : elle est saisie sur la tablette et reste dessus.

## 6. Deux cerveaux (réglage « Cerveau »)

- **Direct** (Gemini Live) : voix naturelle, coupure instantanée, flux continu. Peut être sans quota gratuit selon le compte.
- **Économique** (Gemini Flash + voix de la tablette) : une requête par phrase, recherche Google comprise, réponse en JSON
  (`entendu`, `pour_moi`, `reponse`, `emotion`, `geste`, `memoriser`, `oublier`, `fin`). Mêmes règles R1 à R10.
- **Automatique** (défaut) : direct si possible ; si Google refuse pour quota, bascule en économique sans perdre la phrase,
  et retient le refus jusqu'à la remise à zéro (minuit heure du Pacifique), ou une semaine si Google indique « limite 0 ».

## 6 bis. Budget de latence du mode économique (R8)

Mesuré depuis la fin de la phrase (dernier son de voix) jusqu'au premier mot de Wilson. Objectif : **1 à 2 s**.

| Étape | Avant 1.7.0 | Levier (1.7.0) |
|-------|-------------|----------------|
| Silence de fin de phrase | 500 ms d'attente, puis envoi | **Envoi anticipé** dès 250 ms de silence ; annulé (et la phrase continue d'être enregistrée) si la personne reprend avant 500 ms. Wilson ne parle qu'une fois la fin confirmée. |
| Réflexion du modèle | « minimal » ; si refusé → réglage par défaut (réflexion **maximale** sur les Gemini 3, plusieurs secondes) | Ordre minimal → low → défaut en tout dernier recours ; réglage affiché dans la ligne « Délais ». |
| Recherche Google | Outil joint à chaque phrase : le modèle cherchait parfois sans raison (+2 à 5 s) | **Recherche en deux temps** : 1re requête sans outil (JSON garanti par un schéma) ; si une info récente est nécessaire, Wilson dit tout de suite « je regarde » et une 2e requête (texte seul) fait la recherche. |
| Lenteurs aléatoires de Google | Flash-Lite répond parfois en 15 à 20 s au lieu de 1 s (signalé par d'autres développeurs) | **Relance** : sans premier mot après 2,2 s, la même requête part une 2e fois ; la première qui répond gagne, l'autre est annulée. |
| Voix de la tablette | Moteur réveillé une seule fois au démarrage | Réveillé aussi quand on le regarde (au plus une fois par minute). |

Garde-fou quota : un envoi anticipé ou une relance ne part que si moins de 10 requêtes sont parties dans la dernière minute,
pour ne jamais provoquer un refus « trop de requêtes » du palier gratuit.

Mode direct (Gemini Live), constaté dans le journal le 23/10/26 (réponses à 4 à 9 s, puis blocage) et corrigé en 1.8.2 :

| Cause | Levier |
|-------|--------|
| ~4 s perdues à chaque démarrage à essayer deux modèles refusés (quota) | Modèle qui marche retenu sur la tablette ; modèle refusé pour quota essayé en dernier pendant 6 h. |
| Gemini 2.5 « native audio » réfléchit avant de parler | `thinkingBudget: 0` (réflexion coupée) ; si refusé, même configuration sans ce réglage. |
| Recherche intégrée de Gemini Live : « Let me check » en anglais, 8 à 15 s, puis bloquée après une coupure de connexion | Outil maison **« chercher »** : Wilson dit en français qu'il cherche l'information, l'appli interroge Gemini Flash-Lite + Google Search (texte, ~2 s), et Wilson répond **dès que l'info arrive** (filet de sécurité 30 s) ; relance si Gemini reste muet 10 s après le résultat ; recherche abandonnée si on le coupe. Règle de Timothée (23/10/26) : **pas d'outil spécial par sujet** (météo ou autre), une seule façon de chercher. |
| **Recherche Internet gratuite** : Google n'offre aucune recherche gratuite sur les Gemini 3, et ses Gemini 2.5 (500 recherches par jour) sont fermés aux nouvelles clés (vérifié le 23/10/26) | **Tavily** (1 000 recherches par mois, renouvelées, sans carte bancaire), interrogé par le script de Timothée (action « chercher » de `apps-script/journal.gs`, clé Tavily dans le script, jamais dans le dépôt). Ordre : Tavily → recherche Google de Gemini → réponse sans Internet. Le mode direct reçoit les infos brutes et les reformule ; le mode économique les fait formuler par Flash-Lite (sans Internet). |
| Recherche refusée par Google pour quota (météo du 23/10/26 : 429 sur les trois Flash 3.x) | Modèles de secours Gemini 2.5 (quotas gratuits séparés) ; modèle refusé essayé en dernier pendant 6 h ; si la recherche reste refusée, même question sans Internet (réponse prudente) et la recherche n'est plus retentée pendant 6 h ; détail exact du quota écrit dans le journal. |
| Écho de sa voix (micro sans annulation d'écho) pris pour une phrase (« . ») | Garde de 450 ms après sa voix avant de renvoyer le micro. |
| Délai mal mesuré (écho compté comme voix) | Délai mesuré depuis la dernière voix de la personne envoyée à Gemini ; suites de réponse non comptées. |

## 7. Lots suivants (prévus, pas dans ce lot)

1. Domotique via Home Assistant (lumières, télé, prises).
2. Alertes e-mail (intrusion, fumée) quand la maison est vide.
3. Reconnaissance des membres de la famille.

## 8. Reprise du projet (à lire en premier dans une nouvelle conversation)

État au 24/10/26 : **version 1.10.1** en ligne.

- **Où** : dépôt GitHub `timduneau-hue/wilson` (branche `main`) → publié sur https://timduneau-hue.github.io/wilson/ ;
  la tablette (Galaxy Tab S5e du salon) se met à jour toute seule (`version.json`, vérifié toutes les 20 min, rechargement en veille).
  Pour forcer : appui long sur le visage → « Relancer l'appli ».
- **Compte Gemini de Timothée** : le **direct fonctionne** avec `gemini-2.5-flash-native-audio-preview-12-2025`
  (constaté dans le journal le 23/10/26 ; `gemini-3.8-live` et `gemini-3.1-flash-live-preview` refusés pour quota).
  Mode économique (Gemini Flash-Lite + voix de la tablette) en secours si le direct est refusé.
- **Règles de travail** : ne jamais saisir soi-même la clé API ou des identifiants (Timothée colle sa clé sur la tablette) ;
  dates jj/mm/aa, heures « 10h00 » ; sur un gros changement, mettre d'abord ce plan à jour, puis les détails.
- **Tests** : dossier `tests/` (voir `tests/README.md`), à relancer avant chaque publication.
- **Journal à distance (à lire pour diagnostiquer, sans demander de capture)** : feuille Google **« Wilson — journal »**
  dans le Drive de Timothée (la trouver avec le connecteur Google Drive, recherche par titre). Plus récent en haut :
  - `Journal!A1:C300` : les dernières lignes du journal (erreurs JavaScript comprises, préfixe « Erreur : ») ;
  - `Délais!A1:L100` : une ligne par réponse (envoi, Google, 1re phrase, voix, complet, modèle, réflexion, relance, recherche) ;
  - `État!A1:B40` : dernier bilan (version, état, vision, images/s du visage, retard, batterie, quotas, navigateur) ;
    « Mis à jour » vieux de plus de 10 min = tablette éteinte, appli fermée ou hors ligne.
  Colonne B du journal = « version · appareil » (téléphone, tablette ou PC) : seuls les appareils où l'adresse du script a été
  saisie ou scannée envoient leur journal (et peuvent chercher sur Internet par Tavily).
  La tablette envoie toutes les 30 s par le script « Wilson journal » (code : `apps-script/journal.gs`, déployé par
  Timothée en application Web) ; l'adresse du script est saisie ou scannée (QR code) sur la tablette et n'est pas dans le dépôt.

Historique récent :
- 1.5.0 (23/10/26) — le mot « Wilson » (Vosk, trop lent sur la tablette) est remplacé par l'**écoute au regard**.
- 1.6.0 (23/10/26) — vision en arrière-plan (Web Worker) : visage fluide ; fin de phrase plus rapide, même avec la télé ;
  Gemini sait qu'on le regardait ; délais détaillés dans le journal (ligne « Délais »).
- 1.7.0 (23/10/26) — réponses plus rapides (section 6 bis) : envoi anticipé, réflexion jamais au réglage par défaut,
  recherche Google en deux temps, relance quand Google traîne, voix réchauffée ; ligne « Délais » plus complète.
- 1.8.0 (23/10/26) — journal à distance : journal, délais, erreurs et bilan de la tablette envoyés dans la feuille
  « Wilson — journal », que Claude lit lui-même. Réglages → « Journal à distance (pour Claude) ».
- 1.8.1 (23/10/26) — son du mode direct rétabli (micro sans annulation d'écho, voir section 5) ; Wilson ne se coupe plus
  lui-même ; délai du direct mesuré (onglet Délais, réflexion « direct ») ; bouton « Son d'essai » ; batterie signalée
  une seule fois. Le journal (État → Appareil) montrait un écran de téléphone : Timothée testait peut-être sur son téléphone.
- 1.8.2 (23/10/26) — mode direct plus rapide et jamais bloqué (section 6 bis, partie « Mode direct ») ; batterie non
  signalée sur un téléphone ; toujours en français. Retour de Timothée : « beaucoup mieux qu'avant ».
- 1.8.3 (23/10/26) — recherche : Wilson attend l'info au lieu d'abandonner à 9 s ; secours Gemini 2.5 si les 3.x refusent
  (quota) ; réponse sans Internet en dernier recours ; tutoiement imposé. Le direct tourne désormais avec gemini-3.8-live.
- 1.9.0 (23/10/26) — recherche Internet gratuite par Tavily via le script (voir section 6 bis). Timothée doit créer un compte
  Tavily, coller la clé dans le script, et déployer une nouvelle version (même adresse : rien à refaire sur la tablette).
- 24/10/26 : script mis à jour par Timothée, mais la recherche échoue (« Tavily injoignable : Failed to fetch », alors que le
  journal passe) → cause la plus probable : autorisation « service externe » (UrlFetchApp) jamais accordée. Remède : lancer
  `essaiRecherche` une fois dans l'éditeur et accepter. Le code du dépôt renvoie désormais l'erreur lisible (try/catch).
- 1.9.1 (24/10/26) — journal du direct : ce qu'il a entendu, « se tait » au lieu de « <no speech>{pause} », images envoyées
  et lumière ; appli en arrière-plan (téléphone) plus prise pour de la lenteur (faux « mode allégé ») ; tutoiement renforcé.
  Vu dans le journal : il a dit « je ne vois rien » à une demande sur une résistance (caméra frontale du téléphone ?) — à vérifier.
- 1.9.2 (24/10/26) — réglages réorganisés à la demande de Timothée : « Voix de Wilson » en premier (15 voix, bouton
  « Écouter cette voix »), « Cerveau » qui explique Gemini (parler) et Tavily (chercher) avec l'état de la recherche,
  le technique (modèle, mode économique, voix de la tablette, son d'essai) replié dans « Réglages avancés ».
- 1.10.0 (24/10/26) — le regard pilote tout (R1, R3) : 3 s sans regard → veille, regardé de nouveau → reprise
  instantanée (session gardée 12 s) ; portrait et paysage (rotation libre, visage à pleine largeur, réglages sur une colonne).
  Retour du 24/10/26 (journal) : Tavily ✓, règle du regard ✓.
- 1.10.1 (24/10/26) — d'après le journal : réponses tronquées puis « de quoi ? » (l'écho de sa voix, envoyé pendant un trou de
  sa réponse, faisait couper Wilson par Google) → micro coupé pendant tout son tour de parole, garde 700 ms, et Google ne
  coupe plus Wilson en coupure prudente (NO_INTERRUPTION) ; 1re phrase ignorée à chaque nouvelle discussion → consigne :
  avec l'écoute au regard, tout ce qu'il entend lui est adressé ; délais faussés (bruit compté comme voix, tours muets)
  → mesurés depuis la fin de phrase détectée, notés seulement s'il parle ; coupures par Google notées ; appareil
  (téléphone, tablette, PC) ajouté à chaque ligne du journal ; ville mémorisée quand on la donne.

En attente :
- Journal à distance en place depuis le 23/10/26 : lire la feuille avant de poser des questions à Timothée ;
- son du mode direct confirmé audible en 1.8.1 (36 s jouées, Timothée a répondu) ;
- vérifier dans le journal que la recherche passe par Tavily (« Recherche Tavily faite ») après `essaiRecherche` ; onglet État → « Recherche Internet » ;
- les yeux sont-ils fluides ? les réponses assez rapides ? (onglets Délais et État de la feuille, plus besoin de capture) ;
- il a écrit que « ça ne fonctionne pas comme je voudrais » : préciser ce qui ne va pas (réaction au regard, réponses
  intempestives, coupures…).
