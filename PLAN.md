# Wilson — plan directeur

Ce document est le « chef d'orchestre » : chaque module est validé contre ces règles.
Si un détail technique contredit une règle ci-dessous, c'est le détail qui change.

## 1. Ce que Wilson doit être

Un compagnon posé dans le salon, sur une Samsung Galaxy Tab S5e (SM-T720), branché et en Wi-Fi en permanence.
Un visage original (grands yeux expressifs sur fond noir) qui vit, écoute, regarde, répond et se souvient.

## 2. Règles de comportement (non négociables)

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| R1 | Il ne parle que si on s'adresse à lui. | Oreille locale : rien ne part vers Gemini tant que « Wilson » n'est pas entendu. |
| R2 | Son nom réveille la conversation, même placé en fin de phrase. | Mémoire tampon de 4 s : la phrase entière (avant et après le nom) est transmise. |
| R3 | Une fois la discussion engagée, inutile de répéter son nom. | Fenêtre de conversation ouverte tant que l'échange vit (20 s de silence par défaut). |
| R4 | Il se tait si on lui coupe la parole. | Détection locale de la voix pendant qu'il parle → coupure immédiate du son ; Gemini abandonne sa réponse. |
| R5 | Il se tait si les gens parlent entre eux. | Gemini Live « proactive audio » (toujours actif sur gemini-3.8-live) + consigne système. |
| R6 | Il voit ce qu'on lui montre. | Caméra frontale : images envoyées seulement pendant la conversation, quand quelqu'un parle. |
| R7 | Il retient ce qu'on lui dit. | Outil « memoriser » → souvenirs stockés sur la tablette, rappelés à chaque conversation. |
| R8 | Fluide et esthétique. | Animation continue (ressorts), pas de texte à l'écran par défaut, réglages cachés (appui long). |
| R9 | Rien d'inutile ne quitte la maison. | Veille 100 % locale ; quota Gemini consommé uniquement pendant les conversations. |
| R10 | L'écran ne s'abîme pas et ne s'éteint pas. | Anti-veille (Wake Lock), veille quasi noire sur AMOLED, visage qui dérive lentement (anti-marquage). |

## 3. Les états (machine à états unique, dans `app.js`)

```
            visage détecté / bruit            « Wilson »
   DODO  ───────────────────────▶  VEILLE  ─────────────▶  ÉVEIL (connexion Gemini, tampon audio)
    ▲   ◀── personne depuis 10 min ──  ▲                        │ prêt
    │                                  │                        ▼
    └──── nuit + personne ─────────────┴── 20 s de silence ── CONVERSATION ◀─┐
                                                                │ il parle   │ fin de réponse
                                                                ▼            │
                                                              PAROLE ────────┘
                                                                │ on le coupe → silence immédiat
```

- **DODO** : yeux fermés, ~8 % de luminosité, oreille active.
- **VEILLE** : yeux mi-clos qui suivent les personnes, ~25 % de luminosité, oreille active.
- **ÉVEIL** : yeux grands ouverts, pleine luminosité, connexion à Gemini, envoi du tampon.
- **CONVERSATION** : micro + caméra vers Gemini ; Wilson écoute et décide de répondre.
- **PAROLE** : la bouche suit la voix ; une voix humaine forte le coupe.

## 4. Modules (les « sous-traitants »)

| Fichier | Rôle | Dépend de |
|---------|------|-----------|
| `js/app.js` | Machine à états, chef d'orchestre | tous |
| `js/face.js` | Visage : dessin, émotions, regard, lèvres | — |
| `js/audio.js` | Micro (16 kHz), tampon, niveau de voix, lecture 24 kHz | Web Audio |
| `js/ear.js` | Oreille locale « Wilson » | Vosk (`vendor/vosk.js`, modèle FR) |
| `js/brain.js` | Client Gemini Live (WebSocket) — cerveau « direct » | clé API Gemini |
| `js/eco.js` | Cerveau « économique » : phrase enregistrée + photo → Gemini Flash → réponse JSON | clé API Gemini |
| `js/voice.js` | Voix de la tablette (synthèse vocale) pour le mode économique | navigateur |
| `js/faces/*.js` | Styles de visage : Lumière, Bouille, Rétro, Miel | `face.js` |
| `js/vision.js` | Caméra, suivi des visages, images pour Gemini | MediaPipe (repli : détection de mouvement) |
| `js/memory.js` | Souvenirs et petit journal des échanges | localStorage |
| `js/sensors.js` | Toucher, mouvement de la tablette, batterie, réseau | API du navigateur |
| `js/settings.js` | Écran de réglages et premier lancement | — |

## 5. Choix techniques et pourquoi

- **Appli web installée (PWA)** plutôt qu'APK : pas d'outillage Android à installer, mise à jour en un clic, plein écran.
- **GitHub Pages** : gratuit, HTTPS (obligatoire pour micro et caméra).
- **Gemini 3.8 Live** : gratuit (palier gratuit), voix naturelle, vue, interruptions, outils, recherche Google.
  Attention : sur le palier gratuit, Google peut utiliser les échanges pour améliorer ses produits.
- **Vosk hors ligne** pour le nom : aucune donnée envoyée en veille, aucun quota consommé.
- **La clé API** n'est jamais dans le code publié : elle est saisie sur la tablette et reste dessus.

## 6. Deux cerveaux (réglage « Cerveau »)

- **Direct** (Gemini Live) : voix naturelle, coupure instantanée, flux continu. Peut être sans quota gratuit selon le compte.
- **Économique** (Gemini Flash + voix de la tablette) : une requête par phrase, recherche Google comprise, réponse en JSON
  (`entendu`, `pour_moi`, `reponse`, `emotion`, `geste`, `memoriser`, `oublier`, `fin`). Mêmes règles R1 à R10.
- **Automatique** (défaut) : direct si possible ; si Google refuse pour quota, bascule en économique sans perdre la phrase,
  et retient le refus jusqu'à la remise à zéro (minuit heure du Pacifique).

## 7. Lots suivants (prévus, pas dans ce lot)

1. Domotique via Home Assistant (lumières, télé, prises).
2. Alertes e-mail (intrusion, fumée) quand la maison est vide.
3. Reconnaissance des membres de la famille.
