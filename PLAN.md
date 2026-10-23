# Wilson — plan directeur

Ce document est le « chef d'orchestre » : chaque module est validé contre ces règles.
Si un détail technique contredit une règle ci-dessous, c'est le détail qui change.

## 1. Ce que Wilson doit être

Un compagnon posé dans le salon, sur une Samsung Galaxy Tab S5e (SM-T720), branché et en Wi-Fi en permanence.
Un visage original (grands yeux expressifs sur fond noir) qui vit, écoute, regarde, répond et se souvient.

## 2. Règles de comportement (non négociables)

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| R1 | Il ne parle que si on s'adresse à lui : **on lui parle en le regardant**. | Caméra : orientation de la tête (yeux, nez) → « on me regarde » ; voix + regard = phrase pour Wilson. Plus de mot-clé « Wilson » (abandonné le 23/10/26 : trop lent sur la tablette). |
| R2 | La phrase est transmise en entier. | Mémoire tampon : le début de la phrase (avant que le regard soit confirmé) est inclus. |
| R3 | Pendant une discussion, on peut détourner les yeux un instant. | 8 s après sa réponse, un visage présent suffit ; ensuite il faut de nouveau le regarder. |
| R4 | Il se tait si on lui coupe la parole. | Toucher l'écran (fiable) ; coupure à la voix en option (l'écho de la tablette la rend risquée). |
| R5 | Il se tait si les gens parlent entre eux. | Pas de regard = pas d'écoute ; Gemini filtre en plus (« pour_moi ») ; 2 refus d'affilée → veille. |
| R6 | Il voit ce qu'on lui montre. | Une photo jointe à chaque phrase. |
| R7 | Il retient ce qu'on lui dit. | Souvenirs stockés sur la tablette, rappelés à chaque requête. |
| R8 | **Fluide** : visage sans à-coups, réponse ~1 à 2 s après la fin de la phrase. | Analyse de la caméra en arrière-plan (Web Worker, autre cœur) : l'animation ne se fige jamais ; processeur ou carte graphique choisi en mesurant sur la tablette ; fin de phrase détectée même avec la télé ; réponse lue dès la 1re phrase ; mode le plus rapide par défaut ; délais détaillés dans le journal. Budget de latence détaillé en section 6 bis. |
| R9 | Rien d'inutile ne quitte la maison. | Seules les phrases dites en le regardant partent vers Gemini. |
| R10 | L'écran ne s'abîme pas et ne s'éteint pas. | Anti-veille, veille sombre, visage qui dérive. |

Retour visuel : quand on le regarde, ses yeux s'ouvrent grand et l'écran s'éclaire → on sait qu'il écoute.

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

## 5. Choix techniques et pourquoi

- **Appli web installée (PWA)** plutôt qu'APK : pas d'outillage Android à installer, mise à jour en un clic, plein écran.
- **GitHub Pages** : gratuit, HTTPS (obligatoire pour micro et caméra).
- **Gemini 3.8 Live** : gratuit (palier gratuit), voix naturelle, vue, interruptions, outils, recherche Google.
  Attention : sur le palier gratuit, Google peut utiliser les échanges pour améliorer ses produits.
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

## 7. Lots suivants (prévus, pas dans ce lot)

1. Domotique via Home Assistant (lumières, télé, prises).
2. Alertes e-mail (intrusion, fumée) quand la maison est vide.
3. Reconnaissance des membres de la famille.

## 8. Reprise du projet (à lire en premier dans une nouvelle conversation)

État au 23/10/26 : **version 1.7.0** en ligne.

- **Où** : dépôt GitHub `timduneau-hue/wilson` (branche `main`) → publié sur https://timduneau-hue.github.io/wilson/ ;
  la tablette (Galaxy Tab S5e du salon) se met à jour toute seule (`version.json`, vérifié toutes les 20 min, rechargement en veille).
  Pour forcer : appui long sur le visage → « Relancer l'appli ».
- **Compte Gemini de Timothée** : aucun quota gratuit pour le direct (Gemini Live, « limite 0 ») → Wilson tourne en
  **mode économique** (Gemini Flash-Lite + voix de la tablette).
- **Règles de travail** : ne jamais saisir soi-même la clé API ou des identifiants (Timothée colle sa clé sur la tablette) ;
  dates jj/mm/aa, heures « 10h00 » ; sur un gros changement, mettre d'abord ce plan à jour, puis les détails.
- **Tests** : dossier `tests/` (voir `tests/README.md`), à relancer avant chaque publication.

Historique récent :
- 1.5.0 (23/10/26) — le mot « Wilson » (Vosk, trop lent sur la tablette) est remplacé par l'**écoute au regard**.
- 1.6.0 (23/10/26) — vision en arrière-plan (Web Worker) : visage fluide ; fin de phrase plus rapide, même avec la télé ;
  Gemini sait qu'on le regardait ; délais détaillés dans le journal (ligne « Délais »).
- 1.7.0 (23/10/26) — réponses plus rapides (section 6 bis) : envoi anticipé, réflexion jamais au réglage par défaut,
  recherche Google en deux temps, relance quand Google traîne, voix réchauffée ; ligne « Délais » plus complète.

En attente du retour de Timothée sur la 1.7.0 :
- les yeux sont-ils fluides ? les réponses assez rapides ? (capture de la ligne « Délais » du journal si c'est encore lent :
  elle dit où part le temps — fin de phrase, Google, voix de la tablette) ;
- il a écrit que « ça ne fonctionne pas comme je voudrais » : préciser ce qui ne va pas (réaction au regard, réponses
  intempestives, coupures…).
