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

## 8. Reprise du projet (à lire en premier dans une nouvelle conversation)

État au 29/10/26 : **version 1.17.0** en ligne (la maison par Home Assistant, section 7 bis) ; avant : (CRM à la voix et mode voiture, section 2 quater ; sur la route C8 à C10 ; moteur de questions et itinéraire C11 à C13 — côté CRM, fichier `WebApp_autonome.gs` à recoller par Timothée).

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
