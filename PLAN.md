# Wilson — plan directeur

Ce document est le « chef d'orchestre » : chaque module est validé contre ces règles.
Si un détail technique contredit une règle ci-dessous, c'est le détail qui change.

## 1. Ce que Wilson doit être

Un compagnon posé dans le salon, sur une Samsung Galaxy Tab S5e (SM-T720), branché et en Wi-Fi en permanence.
Un visage original (grands yeux expressifs sur fond noir ; **visage « Miel »**, choix de Timothée confirmé le 01/11/26) qui vit, écoute, regarde, répond et se souvient.

## 2. Règles de comportement (non négociables)

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| R1 | Il ne parle que si on s'adresse à lui : **on lui parle en le regardant**. C'est le **regard** qui compte, pas la simple présence d'un visage (un visage seul : il te suit des yeux, écran tamisé, il n'écoute pas). **Règle de Timothée du 01/11/26 : il ne répond, n'agit (maison, CRM, photo…) et n'engage la conversation que s'il est SÛR que les yeux de la personne le regardent.** | Caméra : orientation de la tête + yeux. Regard **confirmé** seulement si : yeux ouverts, tournés vers lui, sur au moins 3 analyses de suite et 0,6 s (un coup d'œil, une image furtive ou un faux visage ne suffisent plus). Une réponse ou un outil n'est permis que si, depuis sa dernière réponse, une phrase a été dite **pendant** que le regard était confirmé ; sinon la réponse est retenue (rien dit, rien fait) et le journal l'écrit (« Réponse retenue »). Toucher l'écran, les boutons Oui/Non, la suite d'une demande permise (recherche, CRM) restent permis ; les minuteurs et rappels qu'on lui a demandés sonnent quand même. Plus de mot-clé « Wilson » à la maison (sauf case « prenomMaison »). **Exception (accord de Timothée du 03/11/26) : téléphone relié à la voiture** (un micro Bluetooth est présent, Android Auto) : pas besoin de le regarder, il conduit ; réveil en disant « Wilson » (oreille du téléphone confirmée par Gemini) ou d'un coup d'œil, réponses sans regard, pas de veille après 3 s, veille après 45 s sans lui parler. Uniquement sur le téléphone : la tablette garde la règle du regard. |
| R2 | La phrase est transmise en entier. | Mémoire tampon : le début de la phrase (avant que le regard soit confirmé) est inclus. |
| R3 | Pendant une discussion, on peut détourner les yeux **3 s** ; au-delà, il se met en veille ; dès qu'on le regarde de nouveau, il se réactive. | Règle de Timothée (24/10/26). Plus de 3 s sans regard (hors moments où il parle ou cherche) → veille : yeux mi-clos, écran tamisé, micro coupé vers Gemini. Regardé de nouveau dans les 12 s (« Fin de conversation après ») → reprise **instantanée** de la discussion (la session Gemini est gardée, le début de la phrase est transmis). Au-delà, la discussion est fermée ; regarder + parler la rouvre. Tant qu'on le regarde, il reste à l'écoute (60 s de silence au plus). Depuis le 01/11/26 (R1) : pendant ces 3 s la discussion reste ouverte, mais une phrase dite sans le regarder n'a pas de réponse (même un « oui » juste après sa question : il faut le regarder). |
| R4 | Il se tait si on lui coupe la parole. | Toucher l'écran (fiable). Coupure « prudente » (défaut) : micro sans annulation d'écho, Wilson n'écoute pas pendant qu'il parle. Coupure à la voix (« directe ») en option : annulation d'écho, mais sur Android le son passe alors en « mode appel » (plus faible, écouteur sur un téléphone). |
| R5 | Il se tait si les gens parlent entre eux. | Pas de regard = pas d'écoute ; Gemini filtre en plus (« pour_moi ») ; 2 refus d'affilée → veille. |
| R6 | Il voit ce qu'on lui montre, **seulement quand on le lui demande**. | Règle de Timothée (24/10/26) : aucune photo envoyée d'office. Quand on lui demande de regarder (une couleur, un objet, lire, « regarde ça »…), il dit « Je regarde… » et prend **une photo nette** (1 024 px, qualité moyenne côté Google) : outil « regarder » en direct, champ « regarder » + 2e requête avec la photo en économique. La caméra reste allumée pour le regard, analysé sur l'appareil. |
| R7 | Il retient ce qu'on lui dit. | Souvenirs stockés sur la tablette, rappelés à chaque requête. |
| R8 | **Fluide** : visage sans à-coups, réponse ~1 à 2 s après la fin de la phrase. | Analyse de la caméra en arrière-plan (Web Worker, autre cœur) : l'animation ne se fige jamais ; processeur ou carte graphique choisi en mesurant sur la tablette ; fin de phrase détectée même avec la télé ; réponse lue dès la 1re phrase ; mode le plus rapide par défaut ; délais détaillés dans le journal. Budget de latence détaillé en section 6 bis. |
| R9 | Rien d'inutile ne quitte la maison. | Seules les phrases dites en le regardant partent vers Gemini ; aucune image sauf demande (R6). Le journal à distance va dans la feuille Google de Timothée (son compte), phrases échangées désactivables. |
| R10 | L'écran ne s'abîme pas et ne s'éteint pas. | Anti-veille, veille sombre, visage qui dérive. |

Retour visuel : quand on le regarde, ses yeux s'ouvrent grand et l'écran s'éclaire → on sait qu'il écoute.

## 2 bis. Écran et orientation

- Portrait et paysage, téléphone et tablette : l'appli suit la rotation de l'appareil (manifeste « any », verrouillage
  levé en plein écran) ; le visage s'agrandit pour occuper la largeur en portrait ; les réglages passent sur une colonne.

## 2 ter. Une seule configuration pour tous les appareils (règle de Timothée, 24/10/26)

Les réglages sont **les mêmes partout** (téléphone, tablette, PC) ; la configuration de référence est celle du téléphone.
- **Copier sur un nouvel appareil** : Réglages → « Mes appareils » → « Copier mes réglages sur un autre appareil » affiche un
  QR code et un lien (partage Android, Quick Share, message à soi-même). Sur l'autre appareil, l'appareil photo du système
  (ou un clic sur le lien) ouvre Wilson qui importe tout (clé, voix, ville, script…). Le lien porte les réglages dans la
  partie « # » de l'adresse : elle ne quitte jamais l'appareil (GitHub ne la reçoit pas) et elle est effacée après import.
- **Ensuite, synchronisation automatique** par le script de Timothée (actions `reglages_lire` / `reglages_ecrire`, stockage
  dans les propriétés du script, pas dans la feuille) : chaque changement est envoyé, chaque appareil relit au démarrage et
  toutes les 10 min ; le plus récent gagne.
- **Restent propres à chaque appareil** : calibrage du regard, sens du regard (miroir), voix de la tablette du mode
  économique (les voix installées diffèrent d'un appareil à l'autre).

## 2 quater. Le CRM à la voix et le mode voiture (choix de Timothée, 24/10/26)

But : **en voiture, en allant chez un client**, poser des questions sur son CRM et avoir des réponses précises.
Timothée accepte que les données du CRM passent par Gemini (palier gratuit).

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| C1 | **Les réponses viennent du CRM lui-même**, jamais d'une copie. | Wilson → script de Wilson → application Web du CRM (accès « Moi uniquement » inchangé, appel avec le jeton de Timothée) → les fonctions du CRM (fiche, historique, CA, devis, comptes rendus, tâches, agenda, articles). Mêmes chiffres qu'à l'écran. |
| C2 | **Rien ne s'écrit dans le CRM sans confirmation.** | Verrou dans le code de l'appli, pas seulement une consigne à Gemini : Wilson relit mot pour mot, l'écriture n'est débloquée que par un « oui » de Timothée entendu **après** la relecture (ou un appui sur « Oui » à l'écran). |
| C3 | **Tâches** : le « oui » suffit. **Comptes rendus, RDV, notes** : brouillons à valider dans le CRM. | Tâche → `api_tacheAjouter` du CRM. Le reste → onglet masqué « WILSON A VALIDER » ; dans Mes tâches, rubrique « Dicté à Wilson » (sur tous les appareils) : « Reprendre dans la fiche » ouvre la fiche **pré-remplie**, Timothée vérifie et touche Enregistrer → tout le circuit habituel du CRM (Negos, journal des visites, agenda, mails au client selon ses règles, jamais le week-end). Une note devient un compte rendu de type « Autre » (le CRM n'a plus de champ Notes). |
| C4 | **Appeler un client.** | Wilson trouve le contact et affiche un grand bouton vert ; un appui ouvre le numéro dans le téléphone (une page web n'a pas le droit de lancer un appel seule) ; pendant l'appel Wilson se tait, au retour il propose un compte rendu d'appel. |
| C5 | **En voiture, pas besoin de regarder l'écran.** | Mode voiture : caméra coupée, réveil quand on dit **« Wilson »** (oreille locale apprise sur la voix de Timothée, rien n'est envoyé tant qu'il ne l'a pas dit), puis la discussion continue sans le nom ; veille après 1 min de silence. Réponses très courtes, l'essentiel d'abord. Entrée : bouton à l'écran, ou toute seule en roulant (GPS, téléphone seulement). |
| C6 | Pas de fausse alerte de la radio. | 2e vérification : la phrase transcrite par Gemini doit contenir « Wilson », sinon il se tait et se rendort. |
| C7 | Rapide. | Au passage en mode voiture, les fiches des RDV du jour sont chargées d'avance ; sinon Wilson dit « je regarde dans le CRM… » le temps de la réponse (1 à 5 s). |

Android Auto (à partir du 27/10/26) : une appli web ne s'affiche pas sur l'écran de la voiture ; Wilson reste sur le
téléphone, le son passe par la voiture. Comportement exact à vérifier dans le journal.

Sur la route (demande de Timothée, 25/10/26 : « parfois il n'y a plus de réseau, avec le Bluetooth on entend très mal,
je peux recevoir des appels pendant que je parle à Wilson ») :

| # | Règle | Comment c'est garanti |
|---|-------|-----------------------|
| C8 | **Réseau coupé : la discussion n'est pas perdue.** | Coupure (connexion fermée, ou téléphone hors ligne) → deux notes descendantes + « Je n'ai plus de réseau, je reprends dès qu'il revient » (voix du téléphone, qui marche sans Internet), une seule fois. Wilson réessaie (tout de suite quand le réseau revient, sinon 2, 4, 8, puis toutes les 15 s) pendant 3 min en voiture (1 min ailleurs), en reprenant la même session (même fil). La dernière phrase dite pendant la coupure (6 s au plus) est gardée et envoyée dès le retour : il y répond. Retour → deux notes montantes. Au-delà : veille, « je me mets en veille ». Réveillé sans réseau en voiture : « Pas de réseau pour l'instant », et la phrase qui l'a réveillé part dès le retour. |
| C8 bis | Écriture confirmée mais pas de réseau. | Elle est gardée sur le téléphone et envoyée seule au retour du réseau (sa confirmation est déjà donnée) ; Wilson le dit (« pas encore enregistré, je le fais dès que le réseau revient », puis « c'est enregistré »). Si le CRM n'a pas répondu à temps, Wilson ne sait pas si c'est passé : il le dit, rien n'est renvoyé (pas de doublon). Lecture impossible : fiche ou journée gardée sur le téléphone, avec son heure. |
| C9 | **Appel téléphonique pendant une discussion.** | Le téléphone prend le micro (Wilson ne reçoit plus que du silence numérique, ou le micro est « coupé ») → Wilson se tait aussitôt, la discussion est mise de côté (son fil est gardé), aucune confirmation d'écriture n'est possible pendant l'appel. Micro rendu → si l'appel a duré plus de 8 s, Wilson reprend : « On reprend ? » (et propose un compte rendu si c'était un client) ; une écriture en attente est relue de nouveau avant tout « oui ». Téléphone seulement (la tablette n'a pas d'appels). |
| C10 | **Son mauvais (Bluetooth, bruit) : il fait confirmer.** | Consigne à Gemini : demande bizarre, incomplète, hors sujet, nom, chiffre ou date douteux → il reformule ce qu'il a compris et demande « c'est bien ça ? » au lieu de deviner ; rien compris → « tu peux répéter ? ». Client retrouvé à partir d'un nom approximatif → il commence par le nom du client trouvé, pour qu'on puisse le corriger. Conversation au téléphone avec quelqu'un d'autre → il se tait. |
| C11 | **Il répond à toutes les questions sur le CRM, quel que soit le temps** (choix de Timothée, 25/10/26 : « les questions peuvent être infinies », gratuit, pas de clé payante ; Claude avec son forfait Pro est exclu : pas d'accès pour les programmes, et Anthropic interdit d'utiliser un forfait hors de Claude). | **Moteur de questions** : outil `crm_question` (la question complète). Wilson dit « Je cherche l'information… », tête qui réfléchit pendant toute la recherche. Un « analyste » (Gemini gratuit, avec réflexion) reçoit la description des tableaux du CRM (`crm_schema`) et écrit des recherches (`crm_requete` : table, filtres, regroupement, totaux, tri, limite) ; le CRM les exécute **en lecture seule** sur ses feuilles (lignes de commandes et de devis de l'extraction Negos — mêmes chiffres que l'écran —, clients, devis à relancer, tâches, comptes rendus, visites, veille) ; plusieurs étapes si besoin (8 au plus, 10 min au plus), puis la réponse. Les outils rapides (fiche, journée, bilan) restent pour les questions simples. |
| C11 bis | Réponse longue à venir. | Si la discussion s'est terminée entre-temps, Wilson se réveille pour la dire dès qu'il l'a (« J'ai la réponse à ta question sur… ») et l'affiche à l'écran ; pendant un appel, il attend la fin de l'appel. |
| C12 | **Itinéraire vers le client.** | « Emmène-moi chez AD2M » : adresse de la fiche (colonne LOCALISATION) → grand bouton qui ouvre le GPS (Google Maps, ou Waze) ; un appui suffit (une page web ne peut pas l'ouvrir seule). |
| C13 | Réponses du CRM plus rapides, jamais en double. | Côté CRM : fiche, journée (5 min) et bilan (30 min) gardés en mémoire, oubliés dès qu'une écriture a lieu (Wilson ou l'écran du CRM) ; une écriture renvoyée après une coupure (même identifiant) n'est jamais enregistrée deux fois. |

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
| `js/audio.js` | Micro (16 kHz), tampon, niveau de voix, lecture 24 kHz ; micro pris par le téléphone (silence numérique, piste coupée : C9), micro rouvert s'il s'arrête (Bluetooth), notes « réseau perdu / revenu » | Web Audio |
| `js/brain.js` | Client Gemini Live (WebSocket) — cerveau « direct » | clé API Gemini |
| `js/eco.js` | Cerveau « économique » : phrase enregistrée + photo → Gemini Flash → réponse JSON (schéma imposé, recherche en deux temps, relance) | clé API Gemini |
| `js/voice.js` | Voix de la tablette (synthèse vocale) pour le mode économique | navigateur |
| `js/faces/*.js` | Styles de visage : Lumière, Bouille, Rétro, Miel | `face.js` |
| `js/vision.js` | Caméra, **regard** (tête + yeux → « on me regarde »), photo à la demande pour Gemini | `vision-worker.js` |
| `js/vision-worker.js` | En arrière-plan : visages jusqu'à ~4 m, repères fins, lumière, mouvement | MediaPipe Face Detection (longue portée) + Face Landmarker (repli : mouvement) |
| `js/memory.js` | Souvenirs et petit journal des échanges | localStorage |
| `js/sensors.js` | Toucher, mouvement de la tablette, batterie, réseau | API du navigateur |
| `js/settings.js` | Écran de réglages et premier lancement | — |
| `js/remote.js` | Journal à distance : journal, délais et bilan → feuille Google « Wilson — journal » (lue par Claude) ; lecture du QR code | `apps-script/journal.gs` |
| `apps-script/journal.gs` | Script Apps Script de Timothée (application Web) : range le journal dans la feuille ; recherche Internet par Tavily (clé dans le script) ; réglages communs (propriétés du script) | Google Sheets, Tavily |
| `js/sync.js` | Mêmes réglages partout : lien de copie (#reglages=…), synchronisation par le script | `remote.js` |
| `js/analyste.js` | Moteur de questions (C11) : Gemini gratuit lit la description des tableaux du CRM, écrit des recherches (lecture seule) exécutées par le CRM, plusieurs étapes, puis la réponse orale | `crm.js` (actions `crm_schema`, `crm_requete` du CRM, section 54) |
| `js/crm.js` | CRM à la voix : questions au CRM par le script, fiches gardées pour la journée, dates dites (« jeudi », « demain 10h »), verrou de confirmation des écritures, bouton d'appel | `remote.js`, CRM (`WebApp_autonome.gs`, action `doPost` → `wilson`) |
| `js/oreille.js` | Oreille locale du mode voiture : reconnaît « Wilson » dit par Timothée (empreintes de sa voix, comparaison DTW), sur l'appareil | `audio.js` |

## 5. Choix techniques et pourquoi

- **Appli web installée (PWA)** plutôt qu'APK : pas d'outillage Android à installer, mise à jour en un clic, plein écran.
- **GitHub Pages** : gratuit, HTTPS (obligatoire pour micro et caméra).
- **Gemini 3.8 Live** : gratuit (palier gratuit), voix naturelle, vue, interruptions, outils, recherche Google.
  Attention : sur le palier gratuit, Google peut utiliser les échanges pour améliorer ses produits.
- **Micro sans annulation d'écho par défaut** : sur Android, l'annulation d'écho bascule tout le son de la page en
  « mode appel » (volume d'appel, écouteur d'un téléphone) — la voix du mode direct était inaudible (23/10/26).
  La voix de la tablette (mode économique) n'est pas touchée : c'est un autre programme (le moteur de synthèse vocale).
- **Appel téléphonique détecté par le micro** (C9) : une page web ne voit pas les appels ; mais pendant un appel Android
  ne lui donne plus que des zéros (silence numérique), alors qu'un vrai micro a toujours un peu de souffle. 1,2 s de zéros
  = micro pris. Seulement sur le téléphone (la tablette n'a pas d'appels). À confirmer dans le journal au premier appel.
- **Réseau** (C8) : `navigator.onLine` ne suffit pas sur la route (le téléphone se croit souvent « en ligne » sans données) ;
  la coupure est aussi déduite d'une connexion fermée, d'un délai dépassé, ou du son du micro qui s'accumule sans partir.
- **Regard calculé sur la tablette** (MediaPipe) : aucune donnée envoyée en veille, aucun quota consommé.
  Le mot-clé « Wilson » (Vosk) a été retiré le 23/10/26 : il ralentissait trop la tablette.
  En voiture (1.13.0), le regard n'est pas possible : une **oreille légère** reconnaît « Wilson » sans modèle à télécharger.
  Timothée dit 5 fois « Wilson » (Réglages → Mode voiture) ; ses empreintes (coefficients MFCC, 100–3 800 Hz pour
  supporter le micro Bluetooth de la voiture) sont comparées à chaque début de phrase (DTW), quelques millisecondes de calcul.
- **CRM** : le CRM reste en accès « Moi uniquement » ; le script de Wilson l'appelle avec le jeton de Timothée
  (`ScriptApp.getOAuthToken()`, portée Drive). Aucune donnée du CRM dans le dépôt public.
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

1. **Domotique via Home Assistant** — en cours (25/10/26), voir 7 bis.
2. Alertes e-mail (intrusion, fumée) quand la maison est vide.
3. Reconnaissance des membres de la famille.

## 7 bis. Domotique : Home Assistant (demande de Timothée, 25/10/26)

« Je ne veux pas avoir à tout reprogrammer » ; gratuit ; Claude fait les démarches depuis le PC de la maison.
Constat du 25/10/26 : aucun Home Assistant sur le réseau (box Free, 192.168.1.x ; seul un appareil Google Cast répond, en
192.168.1.44) ; Timothée pense ne pas l'avoir installé. Lumières, télé et prises sont dans Google Home.

| # | Règle | Comment |
|---|-------|---------|
| D1 | Home Assistant gratuit, toujours allumé. | Home Assistant OS (image officielle) dans une machine virtuelle VirtualBox sur le PC de la maison (Windows 64 bits, 12 cœurs), réseau « pont » (adresse sur la box), démarrage automatique avec Windows ; le PC ne se met jamais en veille (réglage fait par Timothée). |
| D2 | Pas de reprogrammation des appareils. | Ce que Home Assistant découvre seul (Google Cast, télés, prises connues) est ajouté tel quel ; le reste passe par l'intégration « Google Assistant SDK » : Home Assistant transmet la phrase à Google, c'est Google Home qui exécute (limites : pas toujours de confirmation, pas de routines). |
| D3 | Wilson pilote la maison avec une seule commande. | Outil `maison` : la phrase dite est envoyée à l'assistant de Home Assistant (français), qui agit sur ses appareils ou la passe à Google. Rien à coder appareil par appareil. |
| D4 | Wilson joint Home Assistant partout (maison, voiture). | Adresse https gratuite par Tailscale (variante à choisir : privée, avec l'appli Tailscale sur téléphone et tablette ; ou publique, protégée par le mot de passe de Home Assistant). Nabu Casa écarté (payant). |
| D5 | Sécurité. | Compte Home Assistant créé par Timothée ; jeton d'accès créé et collé par lui dans Wilson (jamais dans le dépôt) ; comptes Google Cloud / Tailscale : consentements donnés par lui. |
| D6 | Accès de Claude au PC. | Extension Claude dans Chrome (en place le 25/10/26) + appli Claude de bureau avec « Computer use » (pour VirtualBox) ; téléchargements seulement avec l'accord de Timothée ; fenêtres d'administrateur Windows validées par lui. |
| D7 | Wilson comprend la maison (demande du 29/10/26 : « on peut dire à peu près tout et n'importe quoi […] Wilson doit comprendre ou poser des questions »). | C'est Gemini (Wilson) qui comprend, pas les phrases toutes faites de Home Assistant : il reçoit l'inventaire de la maison (noms, pièces, types, possibilités, état) et pilote avec deux outils — `maison_etat` (état détaillé) et `maison_commande` (appareil + action parmi une liste sûre : allumer, éteindre, luminosité, volume, muet, lecture/pause/suivant, appli de la télé, radio, clignoter…). Radio : Radio Browser (gratuit) → diffusée sur l'enceinte ou la télé (Chromecast). Demande floue (quelle lampe, quelle radio, quel appareil) → une question courte ; demande claire → il agit sans demander. Toute nouvelle chose ajoutée dans Home Assistant apparaît seule dans l'inventaire. |

Avancement (25/10/26, 14h55) :
- Fait : VirtualBox 7.2.22 installé ; image Home Assistant OS 18.3 ; machine virtuelle « HomeAssistant » créée et démarrée par
  le script `Téléchargements\Installer Home Assistant.bat` (→ `installer-home-assistant.ps1`, rejouable : il complète ce qui
  manque et écrit `installation-home-assistant.log`) — EFI, 3 Go, 2 cœurs, disque 32 Go, pont sur la Wi-Fi (Realtek
  RTL8822BE), MAC 08:00:27:BC:8E:6E ; relancée à chaque ouverture de session (`Démarrage\Home Assistant.cmd`).
- Home Assistant répond sur http://homeassistant.local:8123 ; le DNS de la box bloquait le premier téléchargement →
  DNS Cloudflare choisi dans l'écran de préparation ; téléchargement de Home Assistant Core en cours (20 min ou plus).
- Incident 25/10 : VirtualBox passait par Hyper-V (NEM, « Intégrité de la mémoire » active) → la machine se figeait
  (jusqu'à 42 min). Timothée a désactivé l'Intégrité de la mémoire et redémarré : VT-x direct (VBox.log), 2 Go de
  mémoire, horloge UTC (script `Redemarrer Home Assistant.bat`, arrêt propre sans forcer). Prêt pour l'accueil à 18h33.
- 29/10/26 : compte créé par Timothée (« Timothée DUNEAU », admin ; lieu « Maison », Europe/Paris, fr). **Adresse :
  http://homeassistant.local (port 80, plus 8123)**, IP 192.168.1.65. Après un arrêt de Windows la machine était restée
  éteinte → nouveau script `VirtualBox VMs\HomeAssistant\home-assistant.ps1` (+ `Redemarrer Home Assistant.bat`) :
  démarrage auto à l'ouverture de session (30 s d'attente, reprise d'un état sauvegardé sinon abandon), redémarrage propre,
  journal `home-assistant.log`, alerte si VirtualBox repasse par Hyper-V.
  29/10/26 : lanceur de démarrage remplacé par `Démarrage\Home Assistant.vbs` (aucune fenêtre) ; l'ancien `.cmd` est
  supprimé par le script au démarrage suivant (la fenêtre noire apparaît une dernière fois).
- Appareils : Google Cast (enceinte « salon », télé) ; télé Sony KD-55XF9005 appairée en Android TV Remote (code PIN
  donné par Timothée) → `media_player.tele_2`, `remote.tele`. Découverts, non ajoutés : Freebox (bouton à presser),
  Bravia, DLNA, UPnP. Assistant de conversation en français OK (« quelle heure est-il » → « Il est 20:50 »).
- Prises (29/10/26) : 2 TP-Link Tapo P100 (logiciel chiffré « TPAP » → Timothée a activé « Compatibilité tierce » dans
  Tapo et changé son mot de passe Tapo, saisi par lui) : `switch.eclairage_balcon` (192.168.1.187, pièce Balcon),
  `switch.lumiere_jaune_salon` (192.168.1.176, « lumières louis » dans Tapo, pièce Salon) ; 1 On-Earz OECO_PG02
  (Tuya/Smart Life, ESP 192.168.1.108, réinitialisée puis réinstallée par Timothée) ajoutée par l'intégration Tuya
  (code utilisateur + QR code) : `switch.grande_lumiere_salon` (alias « Grande lumière salon »). Noms = ceux de
  Google Home ; toutes exposées à l'assistant, questions d'état OK.
- Accès sécurisé (29/10/26) : compte Tailscale de Timothée ; module Tailscale installé dans Home Assistant, « share
  Home Assistant : serve » (privé, réservé aux appareils de Timothée qui ont l'appli Tailscale) → **adresse
  https://homeassistant.tail531e59.ts.net** (certificat obtenu). Réglages HTTP de Home Assistant (désormais dans
  Paramètres → Réseau → Serveur HTTP, plus dans configuration.yaml) : X-Forwarded-For + proxy de confiance 127.0.0.1,
  origine CORS https://timduneau-hue.github.io. Module « File editor » installé (lecture/écriture de la configuration).
- **Wilson 1.16.0** : outil `maison` (js/maison.js) → `POST /api/conversation/process` (fr, jeton) ; réglages « Maison »
  (adresse + jeton d'accès, synchronisés entre appareils comme la clé, jamais dans le dépôt) + bouton « Vérifier la
  maison » ; mode économique : champ « maison ». Tests `e2e_maison.py` (13/13), `maison_unit.mjs` (12/12).
- 29/10/26 22h55 : **maison reliée sur la tablette** (Tailscale sur la tablette, jeton « Wilson » créé et collé par
  Timothée ; identifiant Home Assistant `tim49`, mot de passe changé par lui). Les réglages Maison se recopient sur les
  autres appareils par la synchronisation.
- Essai réel 29/10/26 23h (journal) : « lumière jaune salon » OK ; « allume les lumières », « l'éclairage du balcon »
  refusés (les prises étaient des interrupteurs, pas des lumières) ; « Netflix sur la télé » refusé ; Wilson insistait pour
  un « nom exact ». Corrigé : prises converties en lumières (aide « Switch as X ») `light.grande_lumiere_salon`,
  `light.lumiere_jaune_salon`, `light.eclairage_balcon` (alias), télé Android TV = `media_player.television` « Télé »
  (la télé Cast en double n'est plus exposée), enceinte = `media_player.enceinte_salon` ; scripts `script.netflix`,
  `script.youtube`, `script.prime_video` (remote.turn_on activité sur `remote.tele`) → « allume Netflix ». **1.16.1** :
  en cas d'échec, l'outil renvoie la liste des appareils et leur état (Gemini réessaie seul, répond aux questions d'état) ;
  consigne « ne harcèle pas pour un nom exact ».
- Essai 29/10/26 23h10 (1.16.1) : lumières et télé (allumer/éteindre) OK ; « allume Netflix » refusé (l'assistant de Home
  Assistant ne trouve pas les scripts par leur nom) ; nom « Grande lumière salon Prise 1 » corrigé. **1.16.2** : si
  l'assistant échoue et que la demande nomme un script (Netflix, YouTube, Prime Video), Wilson le lance lui-même
  (`/api/services/script/turn_on`), jamais sur « éteins / arrête ». Faire clignoter une lumière : pas fait (abandonné par
  Timothée).
- **1.17.0 (29/10/26, D7)** : Wilson comprend lui-même la maison. Inventaire lu dans Home Assistant (états + modèle :
  pièce, caché, Chromecast) au démarrage, toutes les 10 min et après un changement de réglage, mis dans sa consigne ;
  outils `maison_etat` et `maison_commande` (allumer, éteindre, basculer, luminosité — refusée sur une lampe branchée
  sur prise —, volume, volume ±, muet, lecture/pause/stop/suivant/précédent, source, appli de la télé par la télécommande
  Android TV, radio par Radio Browser sur un Chromecast/Google Home, clignoter puis retour à l'état de départ). Consigne :
  demande claire → agir sans confirmation ; floue → une question courte avec les choix ; contexte (« éteins-la »,
  « le salon »). Le mode économique garde la voie simple (assistant de Home Assistant + raccourcis). Télé Cast renommée
  « Télé (Chromecast) », télécommande « Télécommande télé ». Tests `e2e_maison.py` 23/23.
- Reste : Tailscale sur le téléphone (VPN permanent) ; nouvel essai à la voix (radio, Netflix) ; Freebox et Google Home (enceinte) en
  option ; message « proactivity » refusé par gemini-3.8-live (déjà réessayé 24 h plus tard, sans gêne).
- Reste : appareils découverts ; Google Assistant SDK ; Tailscale (D4) ; jeton ;
  outil `maison` dans Wilson ; ouverture de session Windows automatique (sinon la machine ne redémarre qu'après connexion).

## 7 ter. Voir ce qu'il fait, savoir à qui on parle (demande de Timothée, 29/10/26)

« Quand Wilson fait quelque chose, qu'on puisse le voir […] parfois on regarde à côté et d'autres personnes parlent […] et
il répond […] parfois nous dans le canapé, pas en face de Wilson […] sans ôter la réactivité : qu'il réponde du tac au tac. »

| # | Règle | Comment |
|---|-------|---------|
| E1 | On voit l'action en cours et son résultat. | Pastille sous le visage dès que l'outil part (« Grande lumière salon : j'allume… », « Je cherche dans le CRM… »), puis ✓ vert (résultat) ou ✗ rouge (problème) quelques secondes ; visage « réflexion » pendant, oui de la tête si c'est fait, non sinon. Même chose en mode économique. |
| E2 | Regardé, il ne répond pas à ce qui ne lui est pas adressé. | Rien ne change dans la réactivité (le regard ouvre toujours l'écoute tout de suite) ; c'est la décision de répondre qui devient plus fine : consigne « d'habitude c'est pour toi, mais pas si la phrase commence par le prénom d'un autre (« Louis, viens manger »), si les gens se parlent entre eux, au téléphone » ; la relance « on te parlait » n'est plus envoyée que pour une vraie demande (question, verbe à l'impératif, « Wilson », « tu ») et jamais quand plusieurs visages sont devant la tablette. |
| E3 | Du canapé, sans le regarder : « Wilson, baisse le son ». | L'oreille du mode voiture (son prénom, appris sur la voix de Timothée) écoute aussi à la maison quand personne ne le regarde ; « presque » → second avis de Gemini (20 par heure au plus). La réponse est retenue tant que « Wilson » n'est pas confirmé dans la transcription (même verrou qu'en voiture). Une discussion ouverte par le prénom ne demande pas de le regarder : elle se ferme après le silence habituel. En veille faute de regard, « Wilson » la reprend. |

Fait le 29/10/26 (**1.18.0**) : pastille `#pill` (maison, CRM, recherche, analyste ; mode économique compris) ; consigne
« d'habitude c'est pour toi… tais-toi complètement si… » ; relance limitée par `_semblePourMoi` (prénom de Wilson, « tu »,
question, salutation, verbe de demande ; jamais si la phrase commence par un autre prénom — prénoms tirés de « Qui vit
ici ») et jamais avec plusieurs visages ; oreille à la maison quand personne ne le regarde, verrou du prénom, `_byName`
(pas de veille faute de regard), « Wilson » reprend une discussion en veille. Il faut que l'oreille soit apprise
(Réglages → CRM et voiture → 5 fois « Wilson »). Tests `e2e_adresse.py` 15/15.

Journal du 30/10/26 matin (**1.18.1**) :
- Netflix ne s'ouvrait pas : la télé Sony n'ouvre pas une appli par son nom de paquet, seulement par son lien
  (vérifié : Netflix https://www.netflix.com/title, YouTube https://www.youtube.com, Prime Video https://app.primevideo.com,
  France TV https://www.france.tv ; Disney+, Arte, Canal+, TF1+, Spotify absentes de la télé). L'action appli allume la télé
  si besoin, attend qu'elle réponde, ouvre le lien et vérifie l'appli à l'écran (sinon échec dit, retour à l'accueil).
  Scripts Home Assistant netflix/youtube/prime_video passés aux liens. Allumer/éteindre une télé : on attend le
  changement d'état (jusqu'à 8 s) avant de répondre.
- « Avec le siège pupitre, tu sais » (famille, pas pour lui) → Gemini avait pris une photo et ouvert la fiche « Kevin ».
  Garde-fou : photo et outils client (fiche, itinéraire, appel) refusés si rien dans les 25 dernières secondes de
  transcription ne les demande ; Gemini reçoit « ne fais rien et ne dis rien ».
- « Hier, tu m'as dit… » pris pour un prénom (pas de relance) : seuls les prénoms de « Qui vit ici » et les petits noms
  (loulou, maman, papa, chéri…) en tête de phrase comptent.

Journal du 30/10/26, 9h (**1.18.2**) : l'oreille apprise, à la maison, se réveillait sur la télé et la famille (15 réveils
pour rien en 8 min, écarts 50 à 77 pour une limite de 111) et répondait « Bonjour ! » à « Bon » (verrou ouvert faute de
transcription). Désormais à la maison l'oreille ne fait que proposer : Gemini Flash-Lite écoute les 3,5 dernières
secondes et confirme « Wilson » avant tout réveil (40 vérifications par heure au plus) ; rien ne s'affiche sinon.
Le verrou de transcription reste pour la voiture seulement.

Journal du 30/10/26, 9h20 (**1.18.3**) :
- « Allumer la lumière jaune » répété 5 fois du canapé : Gemini refusait des appels réels (« non ») et le son de loin,
  envoyé à la discussion, était mal transcrit (« elle est le meilleur genou Wilson »). Désormais on attend la fin de la
  phrase, Gemini Flash-Lite écoute toute la phrase (8 s au plus) et rend { appel, demande } ; la demande part en texte à la
  discussion (« On vient de te parler de loin : … »). Pendant une discussion ouverte par le prénom, l'oreille continue
  d'écouter : « Wilson, éteins… » repart aussitôt en texte.
- Télé « injoignable » : la Sony coupe son réseau en veille (Wi-Fi) ; le Wake-on-LAN (intégration `wake_on_lan` ajoutée,
  script `script.reveil_tele`, MAC 48:5F:99:16:00:AF) ne la réveille pas. Il faut activer **« Démarrage à distance »**
  sur la télé (Timothée). Wilson l'explique au lieu de dire seulement « injoignable ».

Journal du 30/10/26, 9h40 (**1.18.4**) : à la maison, l'oreille propose un faux « Wilson » toutes les quelques secondes
pendant les discussions en famille (écarts 40 à 98, comme les vrais appels : elle ne sait pas trier seule) ; les 40
vérifications de l'heure étaient épuisées en 15 min. Désormais : 8 s de calme après un « non » de Gemini, réserve de 6
vérifications rechargée d'une par minute (60/h, 400/jour au plus). La tablette était encore en 1.18.2 (mise à jour à
l'arrêt suivant).

**1.19.0 (30/10/26)** : apprentissage du prénom guidé à la voix (demande de Timothée) : Wilson dit « Dis Wilson », écoute,
« Merci, change de place », patiente 5 s, 8 fois ; puis 15 s sans son nom (conversation, télé) découpées en morceaux de
2 s pour placer la limite au-dessus des bruits de la maison (Réglages → CRM et voiture → Apprendre mon nom).

Apprentissage guidé du 30/10/26 10h08 : écarts de ses « Wilson » 61 à 87, bruits de la maison 62 → l'oreille locale
(empreintes + DTW) ne sait pas distinguer le prénom des voix de la maison ; elle ne sert qu'à proposer. Et Gemini,
interrogé « est-ce qu'on appelle Wilson ? », répondait non à de vrais appels (10h11-10h12). **1.19.1** : Gemini transcrit
seulement la phrase ; l'appli cherche le prénom (et ses déformations : Ouilsonne, Willson…) dans le texte
(`prenomDans`, eco.js) ; le journal note ce que Gemini a entendu ; calme de 3 s après un « non » (8 s empêchait de
répéter).

Journal du 30/10/26, 10h20-10h27 (**1.19.3**) : le prénom du canapé marche (« Allume la lumière du balcon, Wilson »,
« Euh Wilson, il est quelle heure ? » compris du premier coup). Reste : réserve vidée par des sons sans paroles
(transcription vide → ne coûte plus) et par l'oreille pendant les discussions (coupée : le direct entend déjà tout) ;
« texte » vide mal relu ; prise du balcon (192.168.1.187) injoignable depuis 10h26 (Tapo : erreur interne puis plus de
réponse, probablement le Wi-Fi du balcon) → l'outil relance la liaison de l'appareil dans Home Assistant (rechargement
de ses intégrations) et sinon dit de débrancher/rebrancher la prise.

## 7 quater. Plus d'outils (demande de Timothée, 30/10/26)

« Ajoute plus de fonctions à Wilson qui peuvent être utiles […] afficher à l'écran des choses qu'on lui demande, mais pas
seulement : il faut qu'il soit plus outillé. » Tout reste gratuit, sans nouvelle clé, et rien ne part ailleurs que chez
Google, Home Assistant ou des services publics sans compte.

| # | Outil | Ce qu'il fait |
|---|-------|---------------|
| F1 | `afficher` | Grand écran par-dessus le visage : titre, texte, liste à puces ou étapes numérotées, et une image cherchée sur Wikipédia (« montre-moi un koala », « affiche la recette », « écris-moi la liste »). Fermé d'un toucher, par « ferme l'écran » (`fermer_ecran`) ou au bout de quelques minutes. Wilson dit l'essentiel à voix haute et met le détail à l'écran. |
| F2 | `minuteur` | « Mets un minuteur de 10 minutes pour les pâtes » : compte à rebours visible en haut de l'écran (plusieurs à la fois), sonnerie et voix de la tablette à la fin, même en veille ; annuler, liste. Gardés si l'appli redémarre. |
| F3 | `rappel` | « Rappelle-moi à 18h de sortir les poubelles » : à l'heure dite, sonnerie, phrase dite et carte à l'écran (tablette allumée). Annuler, liste. |
| F4 | `meteo` | Météo actuelle et des prochains jours (Open-Meteo, gratuit, sans clé), ville des réglages par défaut ; carte à l'écran (jours, températures, pluie). Plus besoin de recherche Internet pour la météo. |
| F5 | `courses` | Liste de courses de Home Assistant (partagée avec son appli) : ajouter, retirer, cocher, lire, afficher. Sans Home Assistant : liste gardée sur l'appareil. |

| F6 | `idees` | « Note cette idée », « qu'est-ce que j'ai noté ? », « envoie-moi mes idées » : document Google « Wilson — mes idées » dans son Drive, par le script « Wilson journal » (nouveau fichier `apps-script/idees.gs` + une ligne dans doPost, nouvelle version à déployer, autorisations Docs et e-mail données par Timothée) ; e-mail à son propre compte (aucune adresse dans le code). Tant que le script n'est pas à jour : idées gardées sur la tablette (envoyées au document ensuite) et bouton « Envoyer par e-mail » à l'écran. |

Mode économique : ces outils restent au mode direct (le mode économique est un secours) ; à voir plus tard.
Fait le 30/10/26 (**1.20.0**) : `js/outils.js`, écran `#ecran`, minuteurs `#minuteurs` ; tests `e2e_outils.py` 19/19.

Journal du 30/10/26, 10h50-10h55 (**1.20.1**) : outils de l'écran utilisés (panda, montgolfière, lave-vaisselle). Prénom
en veille : « il est quelle heure, Wilson ? » transcrit « … où il sonne ? » → refusé. La consigne de transcription dit
que le prénom est souvent au début ou à la fin et donne ses déformations ; `prenomDans` reconnaît « où il sonne »,
« ouil son », « vil son »… ; la demande transmise prévient qu'elle peut être approximative. Images : d'abord l'article
du même nom (« vaisselle »), puis la recherche (avait donné « Marche en avant »).

Journal du 30/10/26, 11h (**1.21.0**) : demande « noter des idées dans un fichier et me l'envoyer » → outil `idees` (F6).
« Éteins la lumière » avec une seule lumière allumée : il demandait laquelle → consigne : si une seule est allumée, c'est
elle.

Journal du 30/10/26, 11h20-11h33 (**1.22.0**) : « ne me parle plus ainsi, tu ne réponds plus à mes questions » → il s'est
mis en veille (terminer_conversation) : désormais seulement sur un vrai au revoir, jamais sur un reproche. « Oui, il va
faire chaud. » juste après sa question était bloqué (« pas une demande pour lui ») → dans les 20 s qui suivent sa réponse,
tout est pour lui (sauf une phrase qui commence par le prénom de quelqu'un d'autre). Écran : s'efface tout seul après
90 s (4 min pour un long texte, 45 s pour une simple image).

Journal du 30/10/26, 11h34-11h48 (**1.22.1**) : « il dit oui sans que j'aie rien demandé, il a éteint la lumière du
salon alors que je n'ai rien dit ». Six réveils sur un « Wilson » que personne n'avait dit (la consigne de transcription
« un mot qui ressemble est presque toujours Wilson », ajoutée pour le canapé, le lui faisait entendre dans le bruit),
suivis d'un « Oui ? » ; et à 11h48, la télé (« … tu peux l'éteindre ? Hélas, pas de voix de fond, nous avons échoué… »)
a fait éteindre la grande lumière. Désormais : la transcription dit si elle est sûre du prénom (`nom_sur`) et si la voix
vient de la télé (`tele`) ; `jugerAppel` refuse la télé, « Wilson » tout seul pas sûr, et un long enchaînement de phrases
pas sûr ; « Wilson » tout seul ne fait plus dire « Oui ? » (petite note, pastille « Je t'écoute… », il se rendort sans un
mot après 8 s de silence) ; une demande de loin vague (« l'éteindre ») ou douteuse est confirmée avant d'agir sur la
maison. Vu aussi : réflexion dite en anglais (« I need to check why the TV… ») → consigne : jamais de réflexion à voix
haute, toujours en français.

## 7 quinquies. Wilson s'améliore tout seul (demande de Timothée, 30/10/26)

« Je voudrais que Wilson s'améliore au fur et à mesure des discussions et des remarques qu'on lui fait, et se mette à jour
tout seul. » Wilson ne peut pas réécrire son propre programme pendant qu'il tourne (et ce serait dangereux) ; c'est Claude
qui le fait, automatiquement, chaque nuit :

| # | Quoi | Comment |
|---|------|---------|
| G1 | Remarques | Outil `remarque` : quand Timothée dit « c'est un bug », « tu devrais… », « ne fais plus ça », Wilson la met au propre et l'écrit dans le journal (ligne « REMARQUE DE TIMOTHÉE : … », gardée aussi sur la tablette). Il dit que c'est noté pour sa prochaine mise à jour. |
| G2 | Maintenance de la semaine | Tâche planifiée Claude, **une fois par semaine, le lundi vers 2h47** (heure de Paris ; chaque nuit jusqu'au 01/11/26, changé à la demande de Timothée) : lit le journal depuis la maintenance précédente (remarques en premier, puis erreurs, silences, relances, échecs d'outils), corrige le code de ce dépôt, ajoute un test pour chaque correction, lance tous les tests, monte la version, note la correction ici, publie. La tablette se met à jour toute seule en veille. |
| G3 | Ce qui a changé | `version.json` porte `date` et `nouveautes` (phrase à la 2e personne pour Wilson). À la 1re discussion après la mise à jour, Wilson le dit en une phrase ; ensuite seulement si on le lui demande. |

Garde-fous de la maintenance de nuit : rien publié si un test échoue ; pas de nouvelle grosse fonction, pas de changement
du CRM (écriture), des clés, des jetons ni de l'adresse du script sans l'accord de Timothée (proposé dans le résumé à la
place) ; jamais de clé, adresse de script, e-mail ou donnée client dans le dépôt public ; le script Apps Script et Home
Assistant ne sont pas modifiés la nuit ; nuit sans rien de nouveau dans le journal → rien publié.

Maintenance de nuit du 31/10/26 (**1.22.2**) : journal du 30/10/26, 18h45-23h22 (pas de ligne « REMARQUE DE TIMOTHÉE »).
- 22h43-22h45 : « Wilson, c'est bizarre, je vois plus tes pupilles », « bizarre tes yeux tout blancs sans couleur »,
  « pour les mises à jour de ce soir, tu intègres cette information » → « C'est noté, je prends cela en compte pour ma
  prochaine mise à jour », mais l'outil `remarque` n'avait pas été appelé (rien dans le journal), et il avait inventé
  « c'est une mise à jour de mon visage animé ». Désormais : consigne « jamais « c'est noté » sans remarque, pas
  d'explication inventée sur ton fonctionnement » ; et s'il dit que c'est noté pour sa mise à jour sans l'outil, l'appli
  note elle-même la remarque avec les dernières phrases entendues (`_remarqueOubliee`). Le visage n'a pas changé depuis
  la 1.20.0 : cause des yeux blancs pas trouvée (question posée à Timothée).
- 23h06-23h21 : « Merci Wilson, de rien, voilà » (soirée entre amis) a ouvert une discussion par le prénom, restée
  ouverte 15 min (les voix autour la prolongeaient) jusqu'à une coupure réseau. Désormais, ouverte par le prénom et pas
  regardée : 45 s sans qu'il parle ni qu'on le rappelle → veille (`BYNAME_IDLE_MS`).
- 22h50 et 22h56 : « Gemini entend « Here is the JSON requested: » » → la transcription de loin lit le JSON même précédé
  d'une phrase ou coupé (`lireAppel` dans `eco.js`) ; une simple phrase d'annonce compte comme « rien entendu ».
- 22h56-22h58 : 12 vérifications de l'oreille en 90 s malgré « retry in 52s » (quota gratuit, 5 par minute) et « high
  demand » → l'oreille attend le délai demandé par Google (2 min au plus), ou 20 s s'il est surchargé.
- Vu en lançant les tests : l'outil `fermer_ecran` avait des paramètres vides (refusés par un serveur strict,
  `tests/e2e_conn.py` était rouge) → déclaré sans paramètres.
- Pas corrigé la nuit, proposé à Timothée : réponse en anglais (22h39) et reconnexion refusée (23h21) → accepté le 31/10/26
  (« oui qu'il puisse se reconnecter tout seul et oui pas d'anglais »), fait en **1.22.3** :
  - 22h39, « To hear your thoughts on something specific, just let me know. » : consigne « jamais en anglais » ; et si sa
    réponse est en anglais (plusieurs mots anglais courants, presque aucun français : `enAnglais`), l'appli lui demande de
    la redire tout de suite en français (une fois par 15 s).
  - 23h21, « Connexion fermée (1006) » puis « session is already connected to an existing client » → « Reconnexion
    impossible » : `brain.connect` attend 2 s et réessaie la même session ; si Google la croit encore ouverte, nouvelle
    session (la discussion continue).

Maintenance de nuit du 01/11/26 (**1.22.4**) : journal du 31/10/26, 09h44-11h11.
- Remarque de Timothée (10h39:56) : « Améliorer la détection du nom à distance et se concentrer uniquement sur le regard
  lorsque l'utilisateur me regarde » (« Quand on est quelque part dans la pièce, que ça fonctionne pas » ; puis 10h40:33
  « Oui, donc tu ne te réveilles pas quand je t'appelle. Uniquement quand je te regarde. OK. »). Cas précis trouvé :
  10h43:59 « Regardé de nouveau », 10h44:01 « Gemini entend « Euh... Wilson, tu me reçois ? » → oui, « Wilson » (pas
  certain) » → « Wilson se tait », et Timothée a dû répéter « Tu m'entends ? ». La phrase, dite pendant la courte veille
  faute de regard, partait « de loin, sans te regarder, pas certain » alors qu'il le regardait de nouveau. Désormais :
  regardé quand la demande arrive → transmise « dite en te regardant, c'est pour toi » (`_texteRegarde`) ; s'il reste muet
  sur cette demande, relance une fois (`_demandeTexte`).
- Pas codé (ambigu ou trop gros), proposé à Timothée : (1) mieux entendre « Wilson » de loin (l'oreille demande l'avis de
  Gemini toutes les 8 s environ, presque toujours pour rien : il faudrait réapprendre ses « Wilson » de loin, à la maison) ;
  ou au contraire (2) ne plus réveiller Wilson à la voix, seulement au regard ; (3) 10h00:58-10h01:11 « je t'avais
  demandé de noter des choses hier » → il a cherché dans les idées et les souvenirs, pas dans les remarques : lui donner
  la liste de ses remarques.
- Accord de Timothée du 01/11/26 (« proposition 2 et 3 retenu »), fait en **1.23.0** :
  - (2) à la maison, réveil seulement au regard : l'oreille ne guette plus « Wilson » hors voiture, sauf si la case
    « À la maison, me réveiller aussi quand on dit « Wilson » sans me regarder » est cochée (réglage commun `prenomMaison`,
    décoché par défaut ; Réglages → CRM et voiture). En voiture, rien ne change.
  - (3) outil `mes_remarques` : relit les 10 dernières remarques gardées sur l'appareil, datées (sans les notes ajoutées
    par l'appli) ; consigne : « ce qu'il t'a fait noter ou demandé de changer » → mes_remarques, pas idees.
  - (1) mieux entendre « Wilson » de loin : pas retenu.
- Demande de Timothée du 01/11/26 : « supprime le mode voiture aussi », fait en **1.24.0** : plus de bouton voiture sur le
  téléphone, plus de case « mode voiture tout seul en roulant » ni de bouton « Mode voiture maintenant » dans les réglages
  (rubrique renommée « CRM et prénom »), GPS plus suivi ; bilan « Mode voiture : supprimé ». Le code reste en sommeil
  (`VOITURE = false` dans `app.js`), toujours vérifié par `e2e_car.py` et `e2e_route.py` qui l'allument directement, pour
  pouvoir le remettre si Timothée le redemande. Le CRM à la voix reste (à la maison).
- Vu aussi, sans correction : relances « juste après sa réponse » (09h59-10h01, le modèle refuse le réglage de
  proactivité, la relance rattrape en 1,5 à 2 s) ; Netflix lancé en 10,7 s (lenteur de Home Assistant).

Demande de Timothée du 01/11/26, 21h56 (**1.25.0**) : « il ne doit répondre ou engager la conversation que s'il est sûr que
les yeux de l'interlocuteur le regardent » (le réveil au prénom était déjà coupé depuis la 1.23.0) ; « à un moment il a
parlé alors que personne n'était devant la caméra ». Journal du 01/11/26, 18h47-20h51 :
- 19h13:06-19h13:16 : discussion ouverte « au regard », puis « C'est sans commentaire Hudson. » → « D'accord, je reste à ta
  disposition. » ; 19h13:29-19h13:33 : « I have to go » → « D'accord, je te souhaite une bonne fin de journée » ; aussi
  18h49:03 « la base » → « Oui, je t'écoute » et 18h55:24 « le bain » → « Je n'ai pas bien compris », chaque fois juste
  après un « regardé de nouveau ». Phrases de télé ou de pièce, réponses données sans que personne ne parle à Wilson.
- 19h36-20h51 : une vingtaine de « Conversation ouverte (regard) » sans rien entendu, fermées 3 s plus tard.
Causes trouvées dans le code : (1) une seule analyse « regarde » (pas confirmée) suffisait 1,5 s pour ouvrir la discussion
(`_addressed` lisait `lookAt`) ; (2) le regard était « confirmé » après 2 analyses (0,25 s à 8 images/s), yeux mi-clos
compris (paupières jusqu'à 80 %) ; (3) une fois la discussion ouverte, tout ce que le micro entendait partait vers Gemini
pendant les 3 s de grâce, et Gemini décidait seul de répondre — l'appli ne vérifiait pas qu'on le regardait pendant la phrase.
Corrigé :
- `vision.js` : regard confirmé seulement après 3 analyses ET 0,6 s, paupières ≤ 55 % ; `sureAt` = dernier regard confirmé
  (seul utilisé par l'appli) ; `lookInfo` (visages, taille, angles, paupières, durée) écrit au journal à chaque ouverture
  (« Regard confirmé : … ») ; repères du visage à confiance 0,5 (0,3 avant) contre les faux visages.
- `app.js` : verrou de réponse (`_reponsePermise`) : chaque morceau de voix envoyé est compté avec ou sans regard confirmé ;
  une réponse n'est jouée et un outil n'est exécuté que si, depuis sa dernière réponse, une phrase a été dite en le regardant
  (≥ 0,16 s de voix pendant le regard confirmé). Sinon « Réponse retenue » (rien joué, rien en sous-titre, ce qu'il aurait dit
  au journal, pas de relance) et l'outil reçoit « ne fais rien et ne dis rien ». Permis sans regard : toucher l'écran, boutons
  Oui/Non (30 s), suite d'un outil permis (jusqu'à ce que son résultat soit dit), réponse tardive. Mode économique : phrase
  ignorée si elle n'a pas été dite en le regardant. Onglet État : « Réponses retenues ». Préenregistrement 1,6 s (au lieu de
  1,2) pour ne pas perdre le début de la phrase avec la confirmation plus longue.
- Minuteurs et rappels demandés sonnent toujours (c'est lui qui les a demandés).
- Test `e2e_regard_sur.py` (19 vérifications).
- À surveiller dans le journal : « Regard confirmé : … » au moment d'une ouverture non voulue (nombre de visages, taille,
  angles) dira d'où vient le faux regard (télé, photo, reflet) ; et si de vraies phrases sont « retenues » (regard trop strict
  de loin), assouplir.

Décisions de Timothée du 01/11/26, 22h39 (**1.25.1**) : (1) mode voiture supprimé (confirmé ; fait en 1.24.0, le code
reste en sommeil) ; (2) le visage est **Miel** : visage par défaut, et tout appareil resté sur l'ancien défaut « Lumière »
passe à Miel (réglage daté, envoyé aux autres appareils par la synchronisation ; un autre choix est respecté) ;
(3) l'analyse automatique des bugs passe **à une fois par semaine** (tâche « Wilson — maintenance de la semaine », lundi vers
2h47, journal lu par paquets depuis la maintenance précédente, toutes les remarques de la semaine traitées et citées) ;
(4) les remarques faites à Wilson vont bien au journal : ligne « REMARQUE DE TIMOTHÉE : … » (ex. 01/11/26 18h50:01 « Quand tu
affiches des photos, je veux que ça dure 5 secondes. »), lue en premier par la maintenance. Test : `e2e_regard_sur.py`
(visage Miel et passage depuis Lumière).

Maintenance de la semaine du 02/11/26 (**1.25.2**) : journal du 31/10/26, 11h11 au 01/11/26, 20h51 (rien après : dernier bilan
de la tablette le 01/11/26 à 20h51, en 1.24.0, batterie 71 % **non branchée** ; les 1.25.0 et 1.25.1 n'ont encore jamais tourné).
- Remarque de Timothée du 01/11/26, 18h50:01 : « Quand tu affiches des photos, je veux que ça dure 5 secondes. » (après l'affiche
  du film « Flo » montrée à 18h49:31, restée 45 s par-dessus le visage). Désormais une photo seule à l'écran (image sans texte)
  s'efface au bout de 5 s (`PHOTO_MS` dans `outils.js`) ; les cartes de texte gardent 90 s / 4 min.
- Remarque de Timothée du 30/10/26, 18h02:44 (pas traitée par les maintenances précédentes) : « Prendre en compte le fait que
  l'ordinateur doit être allumé pour commander les appareils » (« C'est parce que mon ordinateur est éteint », Home Assistant
  tourne sur le PC de la maison) ; encore le 01/11/26, 19h16:20 : « Je ne peux pas allumer la télé car Home Assistant ne répond
  pas en ce moment » (inventaire impossible toutes les 10 min, « signal is aborted without reason »). Désormais, Home Assistant
  muet → « l'ordinateur de la maison est sans doute éteint (il doit être allumé pour que je commande les appareils) » ;
  injoignable → ordinateur peut-être éteint, ou Tailscale (`HA_MUET`, `HA_INJOIGNABLE` dans `maison.js`).
- Le reste du 01/11/26 (réponses données sans regard, ouvertures à vide) avait déjà été corrigé en 1.25.0.
- Tests : `e2e_outils.py` (photo seule 5 s), `e2e_maison.py` et `maison_unit.mjs` (ordinateur éteint).

Demande de Timothée du 03/11/26, 08h51 (**1.25.3**) : en voiture (téléphone relié en Bluetooth / Android Auto, sans le mode
voiture), pas de son de Wilson dans les haut-parleurs, alors que le volume du téléphone indique « Bluetooth » ; voiture
éteinte, le son sort du téléphone ; à la maison (tablette), aucun problème. Journal du 02/11/26, 16h43 (téléphone) :
« Voix du direct : 17.2 s reçues, niveau de sortie max 100 % » puis « Tu peux répéter, s'il te plaît, parce que j'ai pas
entendu la réponse » : la voix était bien jouée par l'appli. Cause probable : Chrome prenait le micro Bluetooth de la voiture
(« mains libres ») ; pour s'en servir Android ouvre le canal « appel » du Bluetooth et y envoie tout le son de la page ; la
voiture ne joue ce canal que pendant un vrai appel. Corrigé dans `audio.js` : quand un micro Bluetooth est présent, Wilson
ouvre le micro **du téléphone** (deviceId exact, « Speakerphone » sur Chrome Android) ; au premier démarrage (noms des micros
pas encore connus) il recommence une fois ; si la voiture se connecte ou se déconnecte pendant qu'il tourne, le micro est
rouvert. Le journal dit quel micro est utilisé (« Micro prêt — … micro « Speakerphone » (micro Bluetooth présent, évité) »,
« appareils audio changés : … ») et l'onglet État aussi (ligne « Son »). Test `e2e_bluetooth.py`.
À vérifier au prochain trajet dans le journal. Si le son ne sort toujours pas, plan B : jouer la voix par le lecteur
multimédia du navigateur (balise audio) pour que la voiture la traite comme de la musique.

Accord de Timothée du 03/11/26, 09h07 (**1.26.0**) : « oui, absolument, mais uniquement quand je suis sur le téléphone, et
en mode voiture, quand il est branché à Android Auto ». Journal du 02/11/26, 16h43:02 (téléphone, en voiture) : « Réponse
retenue : personne ne me regardait vraiment » sur une question qu'il posait en conduisant ; 16h44:36 : outil `remarque`
refusé pour la même raison. Désormais (`_voitureBt` dans `app.js`) : téléphone + micro Bluetooth présent → verrou du regard
levé, oreille « Wilson » active (circuit `_nomMaison` : l'oreille propose, Gemini Flash-Lite confirme), pas de veille au bout
de 3 s, discussion fermée après 45 s sans qu'il parle ni qu'on l'appelle (radio), 60 s de silence au plus ; journal
« Voiture : téléphone relié en Bluetooth… » et « Voiture : plus de Bluetooth… ». Ce n'est pas l'ancien mode voiture (pas de
bouton, caméra toujours allumée, rien ne démarre en roulant). Oreille du téléphone apprise le 27/10/26 (limite 146,7).
Test `e2e_bluetooth.py` (18 vérifications, dont tablette avec Bluetooth : R1 entière).

Demande de Timothée du 04/11/26, 08h42 (**1.26.1**) : « je le vois parler mais je n'entends rien, peu importe la source
utilisée depuis la voiture ». Journal du 03/11/26, 09h24-09h26 (téléphone, 1.26.0) : micro « Speakerphone » (micro
Bluetooth présent, évité) — la 1.25.3 a bien pris le micro du téléphone — et pourtant « Tu m'entends Wilson ? » → réponse
jouée (3,7 s), puis « Et ben non, tu m'entends pas. » : la cause n'était pas (seulement) le micro. Cause retenue : le son
Web Audio ne demande pas la main sur l'audio d'Android (« audio focus ») ; Android Auto n'ouvre son canal « musique » que
pour une appli qui la demande (un lecteur), et comme tout le son du téléphone part vers la voiture, rien ne sort. Corrigé
dans `audio.js` (`mediaHold`) : en voiture (`_voitureBt`), pendant une discussion et 8 s après, une balise audio joue en
boucle un son inaudible (souffle à ±2/32 768, 10 s) avec Media Session « Wilson » : Chrome demande la main comme pour une
musique, la voiture ouvre son canal et la voix y passe ; la radio se coupe pendant la discussion et reprend après. Boutons
pause / stop du volant → fin de discussion. Si Chrome refuse la lecture (faute de geste), le journal le dit et un toucher
la relance. Journal : « lecteur multimédia en route… » / « arrêté » ; onglet État, ligne « Son ». Test `e2e_bluetooth.py`
(23 vérifications). À vérifier au prochain trajet. Si toujours muet, plan C : faire passer la voix elle-même par la balise
audio (flux de la page vers la balise), au lieu du son Web Audio.

Demande de Timothée du 04/11/26, 10h53 (« vérifie le journal de Wilson et corrige les bugs ») (**1.26.2**). Journal du
04/11/26, 10h00-10h50 (téléphone en voiture, 1.26.1, Gemini **3.1 Flash Live**). Le son en voiture marche enfin (« je
t'entends parfaitement », 10h02 : la 1.26.1 est validée). Remarques de Timothée lues : 10h06 (réapprendre « Wilson » en
voiture : fait par lui à 10h09), 10h13:17, 10h13:52, 10h16:23, 10h44:43, 10h45:47.
- **Réponses en double** (remarque de 10h44 « pas besoin de répéter deux fois la même phrase » ; 10h16 « on dirait que tu
  t'endors ») : la même réponse jouée 2 ou 3 fois à ~5 s (10h33, 10h44-10h45, 10h49). Cause : Gemini 3.1 Flash Live n'a que
  des outils **synchrones** (doc Google : « Asynchronous function calling is not yet supported ») ; après l'outil du visage
  (`exprimer_emotion`, appelé presque à chaque phrase) il reprenait la parole et redisait tout ; un tour muet avec un outil
  déclenchait en plus une relance → deux réponses ; il disait même « response:exprimer_emotion » et « try{ ». Corrigé :
  sur les modèles sans outils en arrière-plan (`asyncTools` dans `brain.js` : tout sauf 3.8 et 2.5), plus d'outil du visage
  (ni sa consigne, ni `behavior`) : l'expression suit le texte de sa réponse (`emotionDuTexte`) ; tout outil compte comme
  « la réponse viendra avec le résultat » (pas de relance) ; garde-fou : une réponse qui commence comme la précédente
  (20 lettres, phrase d'attente « Je regarde… » ôtée, moins de 45 s), sans que personne ait parlé entre les deux, est
  coupée (journal « Réponse en double évitée »). Texte parasite ôté du journal et des sous-titres.
- **crm_confirmer de trop** (10h49:37-38, « Ça y est, c'est enregistré » redit deux fois) : déjà enregistré il y a moins de
  2 min → « ne redis rien » (`dernierEnregistre` dans `crm.js`).
- **Prévenir et faire patienter** (remarque de 10h13:17 : « dis “je regarde et je te tiens au courant”, et une animation ou
  un bruit pour savoir que tu réfléchis, je ne te regarde pas en voiture » ; jusqu'à 32 s de silence à 10h12) : consigne
  « avant toute recherche, dis que tu regardes » ; en voiture, petit « tic-tac » doux (deux notes, toutes les 2,5 s) tant
  qu'une recherche, le CRM ou l'analyste travaille (pas sur la tablette, où le visage réfléchit).
- **Briefings** (remarque de 10h13:52 : « une analyse poussée des ventes, des devis et des échanges, pas un résumé de
  quelques secondes ; tu es mon coach commercial ») : « fais-moi un briefing », « prépare mon rendez-vous » → crm_question
  demande un BRIEFING COMPLET ; l'analyste cherche tout (commandes de l'exercice et du précédent par famille, dernières
  commandes, devis à relancer, comptes rendus, tâches, veille) et répond en 6 à 10 phrases de coach, même en voiture
  (seule réponse longue permise) ; Wilson la dit en entier.
- Divers : « Wilson se tait » n'est plus écrit quand il attend simplement le résultat d'un outil ; délai « 90,7 s » (phrase
  ancienne, après un essai de voix) plus compté.
- Test `e2e_doublon.py` (23 vérifications).
- Question de Timothée (même message) : laisser Claude prendre le relais pour les demandes complexes. Piloter claude.ai
  par un programme n'est pas permis (accès automatisé : API seulement) ; proposé une « boîte aux demandes » traitée par une
  tâche planifiée (pas en temps réel). **Abandonné par Timothée le 04/11/26, 11h06** (« oublie les tâches complexes pour
  Claude ») : Wilson reste seul (Gemini + analyste du CRM).

Demande de Timothée du 04/11/26, 11h53 (« revérifie le journal ; complète-le, des bugs ne sont pas relevés ; je l'appelle en
voiture et il ne répond pas ; il fait des recherches et je ne sais pas ce qu'il fait ») (**1.26.3**). Journal du 04/11/26,
11h29-11h52 (téléphone en voiture, 1.26.2). Il a aussi renoncé à l'API Claude (trop cher) : rien de payant.
- **Tâche Karine Viola jamais enregistrée** (remarque de 11h48:52) : 11h45:53 `crm_noter` annulé par Google parce qu'il parlait
  encore (« Recherche annulée », l'outil était abandonné) ; Wilson a dit « je prépare la tâche » sans rien préparer, puis à
  11h48:37, verrou refusé (« rien à enregistrer »), « J'enregistre la tâche maintenant. C'est bon » : FAUX. Désormais les outils
  du CRM ne sont jamais abandonnés (ni par une annulation de Google, ni par la fin de la discussion) : ils vont au bout et Gemini
  reçoit le résultat en message (« [Résultat de crm_noter …] ») ; toute réponse qui dit « enregistré », « dans tes tâches », « dans
  le CRM » sans écriture confirmée par le CRM depuis 90 s est corrigée tout de suite (`_enregistreFaux`, journal « Wilson a dit
  « enregistré » alors que le CRM n'a rien enregistré »).
- **Appelé en voiture sans réponse** (11h31 et 11h47 : « Wilson » tout seul → rien, rendormi 8 s après) : en voiture il répond
  « Oui ? » et attend 20 s. Réveillé avec sa demande et resté muet (11h49:54) : relance aussi en voiture (avant, seulement si on
  le regardait). Muet après un outil sur Gemini 3.1 (11h50:59, 11h51:37, l'outil « remarque ») : chien de garde, relance une fois
  5 s après un résultat d'outil resté sans réponse (sauf « ne dis rien »). « Remarque » : il dit seulement « C'est noté. » et
  continue (remarque de 11h51:35 : noter sans rester bloqué).
- **« Tu te mets en veille alors que je parle »** (remarque de 11h50:59) : en voiture, ce que Timothée dit compte aussi ; 60 s
  de calme (Wilson et lui) avant la veille, et un petit son descendant quand il se rendort.
- **Grésillements** (remarque de 11h32:26, toutes les voix) : sur téléphone, sortie son en tampon « lecture » (8-12 ms de
  latence avant), avance de 0,18 s au début d'une réponse ; en voiture pendant la discussion, caméra à 2 analyses/s et visage à
  30 images/s (16 images/s mesurées : téléphone saturé). Les trous dans la voix (réseau en retard) sont comptés au journal. À
  vérifier au prochain trajet.
- **Journal plus complet** : chaque résultat d'outil rendu à Gemini (« Outil X → Gemini : « … » »), chaque consigne que l'appli
  lui glisse (« Consigne à Gemini : … »), les outils annulés par Google (nom), le chien de garde, les faux enregistrements,
  l'oreille marquée « voiture » ou « maison », la fin de discussion avec le temps depuis la dernière parole de chacun, les trous
  de la voix ; délai « 34,1 s » (phrase d'avant l'ouverture) plus compté.
- **Recherche dans le CRM en arrière-plan** (question de Timothée du 04/11/26, 12h19 : « il peut travailler en arrière-plan et
  me répondre sur ce qu'il fait ? ») : sur Gemini 3.1 (outils synchrones), `crm_question` rend tout de suite « je cherche, je te
  tiens au courant » : la discussion continue ; points d'avancement en quelques mots (au plus toutes les 12 s, seulement si
  personne ne parle) ; la réponse arrive en message dès qu'elle est prête (« J'ai la réponse à ta question sur … »), ou le
  réveille si la discussion est finie. Sur 3.8 (outils en arrière-plan natifs), rien ne change.
- Test `e2e_voiture_0411.py` (21 vérifications) ; `e2e_bluetooth.py` passé à la règle des 60 s.

Demande de Timothée du 04/11/26, 17h02 (« il n'a pas démarré au son de ma voix dans la voiture, il a fallu que je le
regarde ») (**1.26.4**). Journal du 04/11/26, 16h57-17h01 (téléphone relié à la voiture, 1.26.3) ; remarque de 17h00:26.
- **8 « Wilson » reconnus, aucun réveil, rien au journal** : l'état donnait « dernières phrases : 110.74✓ 83.86✓ … 65.21✓ »
  (tous sous la limite 167.3), et seule une vérification par Gemini est revenue, à 16h59:56, vide (« Gemini entend « » »),
  alors qu'il était déjà réveillé au regard (16h59:38). La vérification n'avait pas de délai maximal : avec le réseau mobile
  elle restait bloquée, et pendant ce temps tous les « Wilson » suivants étaient ignorés sans un mot. Désormais : délai
  maximal 4 s en voiture (8 s à la maison) ; en voiture, vérification trop lente ou impossible → il se réveille quand même,
  Gemini reçoit la phrase et la consigne « Oui ? si c'était seulement son nom, rien si c'était la radio » ; sans réseau, il
  se réveille (message « pas d'Internet » habituel) ; chaque « Wilson » ignoré pendant une vérification est noté au journal.
- Le second avis (« presque » reconnu) et le journal de chaque phrase de l'oreille ne marchaient que dans l'ancien mode
  voiture (supprimé le 01/11/26) : remis en route pour le téléphone relié à la voiture (journal : seulement les phrases
  proches de « Wilson », la radio ne remplit pas la feuille), second avis avec délai maximal de 4 s.
- Test `e2e_oreille_0411.py` (9 vérifications).

Demandes de Timothée du 04/11/26, 17h25 (**1.26.5**, avec la 1.26.4 qui n'avait pas encore été publiée). Journal du 04/11/26,
13h25 et 17h17-17h22 (téléphone relié à la voiture).
- **Écran : du texte seulement s'il le demande** (« si je te demande rien, tu l'affiches pas » ; journal 13h25 : « Recherche
  CRM » affiché de lui-même pendant une recherche, « je m'en fous de ça »). `afficher` avec du texte vérifie ce qu'il a dit ces
  25 dernières secondes (« montre », « affiche », « par écrit », « écris », « à l'écran », « fais-moi voir », « je veux voir ») ;
  sinon rien n'est affiché et Gemini doit le dire à voix haute. Plus de carte « Réponse du CRM » d'office, plus de liste de
  courses ni d'idées affichée parce qu'elle est longue (seulement sur « affiche »). Consigne du direct réécrite.
- **Photos, météo : 5 s par défaut**, puis l'écran se vide ; nouvel outil `reafficher` (« réaffiche la photo, j'ai pas eu le
  temps de voir ») : ce qui vient d'être montré revient 60 s, ou la durée qu'il dit. Texte demandé : 90 s (4 min s'il est
  long), fermable. Sonnerie, appel, itinéraire, confirmation d'écriture : inchangés (ce sont des boutons).
- **« Ses dernières commandes » = les articles** (17h17 : il voulait ce qu'ils ont acheté, Wilson a donné la date et le
  montant, puis une recherche à part) : consigne du direct → `crm_question` tout de suite (« les articles des dernières
  commandes de X », sans passer par la fiche, 23 s de gagnées) ; consigne de l'analyste → articles et quantités d'abord.
- **Recherches plus sûres et plus rapides** : la description des tableaux du CRM (`crm_schema`, 3 à 4 s) est gardée la
  journée sur l'appareil, même après un redémarrage ; chaque lecture du CRM a un délai maximal (requête de l'analyste 60 s,
  fiche/journée/bilan 45 s) : une requête bloquée sur le réseau mobile (17h18 : recherche partie, jamais revenue) compte
  comme une coupure, l'analyste attend puis la relance. Les écritures n'ont pas de délai (jamais renvoyées deux fois).
- **Tâches : 8 annoncées, 5 dans le CRM** (17h20-17h22) : les 3 en trop sont les sujets « À voir au prochain RDV » créés le
  jour même dans le CRM (feuille RAPPELS_TIM, statut « rdv », sans date) : `crm_journee` du CRM les compte comme des tâches
  du jour. Correction **côté CRM** (`WebApp_autonome.gs`, crm_journee et crm_client : les écarter des tâches, les donner
  à part dans la fiche du client sous « À voir au prochain RDV ») : à faire dans l'éditeur Apps Script depuis le PC de
  Timothée (Chrome injoignable le 04/11/26 à 17h30).
- **« Wilson » appelé au moins 5 fois en voiture, aucune réaction** (17h40 : « même s'il y a un problème réseau ou autre
  chose, il faut que je sois au courant ») : le journal du téléphone s'arrête à 17h22:57 (fin d'une discussion), plus rien
  ensuite, pas même le pouls de l'onglet État : l'appli ne tournait plus (écran éteint ou autre appli devant : Chrome met la
  page en pause, elle n'entend ni ne parle) ou n'avait plus du tout de réseau (les lignes seraient alors arrivées au retour).
  **Garde « sourd »** (téléphone relié à la voiture seulement) : au passage en arrière-plan, petit son + « je passe en
  arrière-plan, je ne t'entends plus » (tant que Chrome le laisse parler) et journal envoyé tout de suite ; au retour, il dit
  combien de temps il n'a rien entendu ; micro muet plus de 5 s à l'écran : il le dit et relance le son, puis annonce qu'il
  entend de nouveau. Avec la 1.26.4 : un « Wilson » entendu ne reste plus jamais sans réponse quand le réseau traîne.
  Test `e2e_sourd_0411.py` (7 vérifications).
- Test `e2e_crm_0411.py` (7 vérifications) ; `e2e_outils.py` et `e2e_question.py` passés à la nouvelle règle de l'écran.

## 8. Reprise du projet (à lire en premier dans une nouvelle conversation)

État au 04/11/26 : **version 1.26.5** en ligne (en voiture, il prévient quand il ne t'entend plus ; écran : texte seulement sur demande, photos et météo 5 s, « réaffiche » ; dernières commandes = articles ; recherches CRM gardées et protégées des blocages) ; 1.26.4 (en voiture, « Wilson » réveille même si le réseau traîne : vérification limitée à 4 s, second avis et journal de l'oreille remis en route) ; 1.26.3 (outils du CRM jamais abandonnés, faux « enregistré » corrigé, voiture : « Oui ? », relances, son plus stable, journal plus complet) ; 1.26.2 (plus de réponses en double sur Gemini 3.1 Flash Live, son de réflexion en voiture, briefings complets) ; 1.26.1 (en voiture, lecteur multimédia pour qu'Android Auto joue la voix : validé le 04/11/26) ; 1.26.0 (téléphone relié à la voiture : réveil par « Wilson », réponses sans regard ; son en voiture par le micro du téléphone) ; 1.25.3 ; 1.25.2 (maintenance de la semaine : photo seule affichée 5 s ; « l'ordinateur de la maison est sans doute éteint ») ; 1.25.1 (visage Miel ; maintenance automatique une fois par semaine) ; 1.25.0 (il ne répond et n'agit que s'il est sûr qu'on le regarde, R1 du 01/11/26) ; avant : 1.24.0 (mode voiture supprimé à la demande de Timothée) (maintenance de nuit automatique, section 7 quinquies) (la maison par Home Assistant, section 7 bis) ; avant : (CRM à la voix et mode voiture, section 2 quater ; sur la route C8 à C10 ; moteur de questions et itinéraire C11 à C13 — côté CRM, fichier `WebApp_autonome.gs` à recoller par Timothée).

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
- 1.10.2 (24/10/26) — d'après le journal de 10h32 : 1re phrase encore ignorée (« Salut Wilson… tu réponds ? ») → relance
  automatique quand une vraie phrase reste sans réponse ; Google signalait des interruptions sans que personne ne parle
  (autour des recherches) → en coupure prudente, la fin déjà reçue est jouée ; plus d'images envoyées pendant qu'il parle ;
  délai mesuré aussi dehors (dernier mot transcrit) ; relance après recherche à 6 s ; « ... » compté comme silence.
  Idée proposée à Timothée : photo nette « à la demande » (outil regarder) pour lire un texte ou voir un détail.
- 1.11.0 (24/10/26) — à la demande de Timothée : plus aucune photo envoyée d'office (R6). Photo nette (1 024 px, résolution
  moyenne) seulement quand on demande à Wilson de regarder : outil « regarder » en direct, champ « regarder » + 2e requête
  en économique. Bilan : ligne « Photos » (nombre prises depuis le démarrage).
- 1.12.0 (24/10/26) — mêmes réglages sur tous les appareils (section 2 ter) : « Copier mes réglages sur un autre appareil »
  (QR code à scanner avec l'appareil photo, ou lien partagé), puis synchronisation par le script (actions reglages_lire /
  reglages_ecrire : Timothée doit recoller `apps-script/journal.gs` et déployer une nouvelle version). Timothée n'arrivait
  pas à scanner le QR code du script avec la tablette (lecteur intégré à Wilson, caméra frontale) : la copie passe
  désormais par l'appareil photo du système.
  Retour (journal 11h35–11h42) : copie vers la tablette ✓, script mis à jour ✓ (« Réglages communs : à jour »), photo à la
  demande ✓ (« tasse » vue, couleur mal jugée : noire au lieu de bleue), recherche Tavily ✓.
- 1.12.1 (24/10/26) — d'après ce journal : sans photos, Gemini restait muet après presque chaque réponse de Wilson
  (la relance rattrapait, avec du retard) → proactivité coupée explicitement (`proactivity.proactiveAudio: false` :
  il répond à tout ce qu'il entend ; repli sans ce réglage si le modèle le refuse) ; « Salut », « Coucou »… seuls
  méritent une réponse (relance) ; délai mesuré malgré un tour muet (plus de « ? »).
- 1.12.2 (24/10/26) — tablette « figée, seuls les yeux clignotent » (11h50) : après le passage des repères du regard sur la
  carte graphique, plus aucun regard détecté (« regard 13 ms », « on le regarde : non »), donc plus d'éveil. La vision se
  répare seule : repères en échec à répétition → repris sur le processeur (retenu pour l'appareil : `wilson.vision.cpu`) ;
  détection des visages en panne sur la carte graphique → processeur ; analyse muette 8 s → relancée. Noté dans le
  journal et le bilan (« relancée n fois, n réparation(s) »).

- 1.13.0 (24/10/26) — **CRM à la voix et mode voiture** (section 2 quater), à la demande de Timothée (« en voiture, en allant
  chez un client, poser des questions et avoir des réponses précises » ; « rien ne s'écrit dans le CRM sans confirmation »).
  Ses choix : réveil en disant « Wilson » ; tâches → son « oui » suffit ; comptes rendus, RDV, notes → brouillons à valider
  dans le CRM ; Bluetooth aujourd'hui, Android Auto à partir du 27/10/26. Côté Wilson : `js/crm.js` (outils crm_client,
  crm_agenda, crm_bilan, crm_produit, appeler, crm_noter, crm_confirmer ; champ « crm » en mode économique ; verrou par tour
  de parole), `js/oreille.js` (empreintes MFCC + DTW, seuil placé entre ses « Wilson » et une phrase sans le nom ; « presque »
  → second avis de Gemini Flash-Lite, 20 par heure au plus), mode voiture (bouton, GPS), réponse retenue jusqu'à la
  transcription du nom. Corrigé au passage : réglages coupés à droite en portrait (grille trop large depuis 1.10.0) ;
  transcription d'un tour coupé qui débordait sur la discussion suivante.
  **Côté CRM** (fichiers complets remis à Timothée, pas dans ce dépôt) : `WebApp_autonome.gs` section 53 « WILSON » (`doPost`
  → `wilson(d)` : crm_etat, crm_trouver, crm_client, crm_journee, crm_bilan, crm_produit, crm_tache, crm_brouillon ; noms
  dits à voix haute retrouvés par mots + clé phonétique + Jaro-Winkler + ville ; onglet masqué « WILSON A VALIDER »),
  `api_mesTaches` renvoie les brouillons, `api_saveClient` marque fait le brouillon repris ; `Index.html` : rubrique
  « Dicté à Wilson » en tête de Mes tâches (tous appareils), « Reprendre dans la fiche » pré-remplit la fiche.
  Script de Wilson : ligne `CRM_URL` (adresse du CRM), relais `crm_…` avec `ScriptApp.getOAuthToken()`, `essaiCRM`.

- 1.13.1 (25/10/26) — d'après le journal du téléphone (07h46–08h04, premier essai du CRM : relié ✓, fiches, journée et
  bilan lus ✓, tâches écrites après « Oui » ✓, verrou ✓, carte d'appel ✓) :
  - caméra figée au retour d'arrière-plan (plus aucune image, regard resté sur « oui ») → « plus regardé / regardé » toutes
    les 3 s pendant 10 min : un regard sans nouvelle image depuis 2,5 s ne compte plus (`vision.stale`), et la caméra est
    rouverte au bout de 5 s sans image (10 fois au plus, noté dans le journal) ;
  - après « Internal error » de Google, la reprise de session était refusée (« session not found ») et Wilson essayait
    8 modèles/réglages puis abandonnait → nouvelle session tout de suite ;
  - mode voiture déclenché en roulant au milieu d'une discussion : la discussion était coupée → elle continue ; quitté à la
    main, il ne revient pas tout seul avant 20 min ; vitesse calculée seulement sur des positions précises (≤ 25 m) et
    nettement éloignées, 8 s de suite au-dessus de 22 km/h (avant : fausses vitesses à l'intérieur) ;
  - tâche dictée sans jour → mise au jour même : il demande maintenant « pour quand ? » ;
  - il disait « c'est noté » avant la confirmation du CRM → consigne : « J'enregistre… » puis confirmation ; transcription
    parfois en anglais/espagnol/russe (français mal compris) → il répond en français et fait répéter ;
  - réglage « réponds à tout » refusé une fois par le modèle → retenu pour toujours ; maintenant réessayé après 24 h.
  Pas changé : délais du CRM (≈ 3 s par appel au script, 6 à 9 s pour un gros historique ou le bilan) — à surveiller.

- 1.14.0 (25/10/26) — **sur la route** (C8 à C10), à la demande de Timothée (« parfois il n'y a plus de réseau, avec le
  Bluetooth on entend très mal, je peux recevoir des appels pendant que je parle à Wilson ») : réseau coupé → discussion
  gardée, il le dit avec la voix du téléphone, réessaie 3 min en voiture en reprenant la même session, et répond à la phrase
  dite pendant la coupure ; réveillé sans réseau → il répond au retour ; écriture confirmée sans réseau → envoyée seule au
  retour (identifiant joint pour un futur anti-doublon côté CRM) ; journée et bilan gardés (10 et 15 min) et repris sans
  réseau ; appel téléphonique → il se tait, discussion mise de côté, aucun « oui » ne compte, puis « On reprend ? » ;
  son mauvais → il reformule et fait confirmer, cite d'abord le client retrouvé à partir d'un nom approximatif.
  D'après le journal du téléphone (09h12–10h25) : plus de « Oulà, ça a bougé ! » quand on bouge le téléphone ; plus de
  relance pendant qu'un outil travaille ; durée du CRM notée sur la bonne réponse ; consigne : ne pas reconstituer un détail
  absent de la réponse du CRM (il avait décrit le contenu d'une commande que le dossier ne donne pas).
  Vu aussi (pas un bug de Wilson) : « devis à relancer », « CA de juillet 2025 », « liste des clients qui ont commandé »,
  « détail d'une commande », « adresse pour le GPS » ne sont pas dans les réponses du CRM → ajouts côté CRM proposés.

- 1.15.0 (25/10/26) — **toutes les questions sur le CRM** (C11 à C13), à la demande de Timothée (« Wilson doit pouvoir
  répondre à toutes les questions, peu importe le temps », tête qui réfléchit, « je recherche l'information… », gratuit ;
  passer par son forfait Claude Pro n'est pas possible : pas d'accès pour les programmes, et Anthropic interdit d'utiliser un
  forfait hors de Claude). Ses choix : moteur de questions ; tête qui réfléchit + « Je cherche… » (pas de « je cherche
  encore », pas de compteur) ; réponse dite dès qu'elle arrive, même discussion terminée, et affichée ; en plus : itinéraire,
  CRM plus rapide, anti-doublon. Wilson : `js/analyste.js`, outils `crm_question` et `itineraire` (direct et économique),
  carte « Réponse du CRM », carte d'itinéraire (Google Maps, Waze). CRM (`WebApp_autonome.gs`, section 54, à recoller) :
  `crm_schema`, `crm_requete` (tables commandes, devis, devis_a_relancer, clients, taches, comptes_rendus, visites, veille ;
  filtres, regroupements, calculs, « avoir », tri, limite), adresse dans la fiche, fiche/journée/bilan gardés en mémoire
  (oubliés à chaque écriture), anti-doublon par identifiant.

En attente :
- **Timothée (1.15.0)** : coller le nouveau `WebApp_autonome.gs` dans le CRM (Index.html inchangé), puis Déployer → Gérer
  les déploiements → nouvelle version. Sans ça, Wilson répond « le CRM n'a pas encore le moteur de questions ».
- À lire dans le journal (1.15.0) : « Question au CRM (analyste) », « Analyste, étape n : … », « Analyste : réponse en n s,
  n étape(s) … (modèle) », « Réponse à … arrivée après n s » ; quotas : « Analyste : … quota » (modèle suivant).
- **À lire dans le journal (1.14.0)** : « Micro pris par le téléphone (silence numérique | micro coupé…) » puis « Micro rendu
  … fin de l'appel » au premier appel reçu (si rien n'apparaît pendant un appel, la détection ne marche pas sur son
  téléphone) ; « Réseau coupé (…) », « Phrase gardée pendant la coupure », « Réseau revenu après n s », « Réseau bloqué » ;
  « Audio : appareils audio changés (Bluetooth ?) », « Audio : micro arrêté par le système : je le rouvre ».
- **Mise en place par Timothée (1.13.0)** : CRM et script faits le 25/10/26 (journal : « CRM : relié »). Reste : téléphone →
  Réglages → CRM et voiture → « Apprendre mon nom » (dans la voiture, moteur allumé) — pas encore fait au 25/10.
- Idées proposées à Timothée le 25/10/26 (à faire seulement s'il les choisit) : itinéraire vers le client (il faut l'adresse
  de la fiche → petit ajout côté CRM), « classer un devis » à la voix, préparer un e-mail au client (brouillon).
- Lire dans le journal : lignes « CRM : … en x s », « Oreille : phrase de …, écart …, limite … » (réglage de l'oreille),
  « Nom vérifié », « Pas mon nom », « Écriture REFUSÉE par le verrou ». Onglet État : lignes CRM, Mode voiture, Oreille.
- Android Auto (27/10/26) : vérifier son, micro et réveil au nom.
- Journal à distance en place depuis le 23/10/26 : lire la feuille avant de poser des questions à Timothée ;
- son du mode direct confirmé audible en 1.8.1 (36 s jouées, Timothée a répondu) ;
- vérifier dans le journal que la recherche passe par Tavily (« Recherche Tavily faite ») après `essaiRecherche` ; onglet État → « Recherche Internet » ;
- les yeux sont-ils fluides ? les réponses assez rapides ? (onglets Délais et État de la feuille, plus besoin de capture) ;
- il a écrit que « ça ne fonctionne pas comme je voudrais » : préciser ce qui ne va pas (réaction au regard, réponses
  intempestives, coupures…).
