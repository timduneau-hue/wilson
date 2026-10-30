// Wilson — cerveau du mode économique : une phrase enregistrée (+ une photo) → Gemini Flash → réponse JSON.
// Utilisé quand le modèle vocal en direct (Gemini Live) n'a pas de quota. Une requête par phrase.
//
// Rapidité (PLAN.md, section 6 bis) :
//  - 1re requête SANS outil, JSON garanti par un schéma : pas de recherche Google lancée « au cas où » ;
//  - si une info récente est nécessaire, le modèle remplit « chercher » et dit une phrase d'attente ;
//    une 2e requête (texte seul, avec Google Search) donne la vraie réponse ;
//  - réflexion « minimal » puis « low » : jamais le réglage par défaut (réflexion maximale sur les Gemini 3) sauf en dernier recours ;
//  - relance : si Google n'a pas écrit un mot après ~2 s, la même requête repart ; la première qui répond gagne.

import { cleanKey } from './brain.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Les quotas gratuits sont par modèle : les Gemini 2.5 servent de secours si les 3.x sont épuisés (refus vu le 23/10/26).
export const ECO_MODELS = {
  rapide: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  reflechi: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
};
export const HEDGE_MS = 2200;          // sans premier mot après ce délai : la requête est relancée en parallèle
export const HEDGE_SEARCH_MS = 7000;   // idem pour la requête avec recherche Google (plus longue par nature)
export const EXTRA_MAX = 10;           // garde-fou palier gratuit : pas de requête « en plus » au-delà de 10 par minute
const FMT = 2;                         // version des réglages retenus (1.7.0 : nouvel ordre de réflexion)

const EMOTIONS = ['neutre', 'joie', 'rire', 'triste', 'surprise', 'colere', 'curieux', 'reflexion', 'tendresse', 'gene', 'confus', 'peur', 'fier', 'ennui', 'somnolent'];
const GESTES = ['aucun', 'oui', 'non', 'clin_oeil', 'sautiller', 'pencher_la_tete'];
const ORDER = ['pour_moi', 'chercher', 'regarder', 'emotion', 'reponse', 'geste', 'memoriser', 'oublier', 'fin', 'entendu'];

// L'ordre des champs compte : la réponse arrive tôt pour que Wilson commence à parler avant la fin de l'écriture
// (« chercher » juste avant, la transcription à la fin).
export const ECO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pour_moi: { type: 'BOOLEAN' },
    chercher: { type: 'STRING' },
    regarder: { type: 'BOOLEAN' },
    emotion: { type: 'STRING', enum: EMOTIONS },
    reponse: { type: 'STRING' },
    geste: { type: 'STRING', enum: GESTES },
    memoriser: { type: 'ARRAY', items: { type: 'STRING' } },
    oublier: { type: 'STRING' },
    fin: { type: 'BOOLEAN' },
    entendu: { type: 'STRING' },
  },
  required: ORDER,
  propertyOrdering: ORDER,
};

// CRM à la voix (PLAN 2 quater) : un champ « crm » en plus, seulement quand le CRM est relié.
const CRM_OUTILS = ['aucun', 'client', 'agenda', 'bilan', 'produit', 'question', 'itineraire', 'appeler', 'noter', 'confirmer'];
const CRM_ORDER = ['outil', 'client', 'contact', 'jour', 'produit', 'question', 'demande', 'type', 'texte', 'date', 'heure', 'echange'];
const ORDER_CRM = ['pour_moi', 'chercher', 'regarder', 'crm', 'emotion', 'reponse', 'geste', 'memoriser', 'oublier', 'fin', 'entendu'];
// La maison (PLAN 7 bis) : un champ « maison » (la demande pour Home Assistant), seulement quand la maison est reliée.
export function ecoSchema(crm = false, maison = false) {
  if (!crm && !maison) return ECO_SCHEMA;
  const S = (d) => ({ type: 'STRING', ...(d ? { enum: d } : {}) });
  const props = { ...ECO_SCHEMA.properties };
  if (crm) props.crm = { type: 'OBJECT', required: ['outil'], propertyOrdering: CRM_ORDER, properties: {
    outil: S(CRM_OUTILS), client: S(), contact: S(), jour: S(), produit: S(), question: S(['qui_achete', 'infos']), demande: S(),
    type: S(['tache', 'compte_rendu', 'rdv', 'note']), texte: S(), date: S(), heure: S(), echange: S(['visite', 'appel']) } };
  if (maison) props.maison = S();
  const order = (crm ? ORDER_CRM : ORDER).slice();
  if (maison) order.splice(order.indexOf('emotion'), 0, 'maison');
  return { ...ECO_SCHEMA, properties: props, required: order.filter((k) => k !== 'crm'), propertyOrdering: order };
}

// Consigne de format. search : 2e requête (recherche Google) ; canSearch : la recherche est-elle possible ? crm : CRM relié.
export function ecoFormat({ search = false, canSearch = true, crm = false, maison = false } = {}) {
  const head = search
    ? `MODE ÉCONOMIQUE — RECHERCHE : fais une recherche Google pour répondre à la dernière question de la conversation, puis réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec ces champs DANS CET ORDRE EXACT :`
    : `MODE ÉCONOMIQUE — tu reçois l'enregistrement audio de ce qui vient d'être dit dans le salon (et parfois une photo de ce que tu vois, ou une consigne écrite entre crochets).
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec ces champs DANS CET ORDRE EXACT :`;
  const chercher = search ? '' : canSearch
    ? ` "chercher": "requête Google courte, SEULEMENT si la réponse dépend d'une information récente ou qui change (météo, actualité, sport, horaires, prix, programme télé, commerce, événement) ; sinon vide. Tout le reste : réponds directement, c'est bien plus rapide",\n`
    : ` "chercher": "" (toujours vide : tu n'as pas accès à Internet en ce moment ; si l'information a pu changer, dis-le simplement),\n`;
  const reponse = search
    ? 'ta réponse à partir de la recherche, en français oral, une à trois phrases courtes (commence par la plus courte), sans liens, adresses web ni symboles ; ne redis pas ta phrase d\'attente'
    : 'ce que tu dis à voix haute, en français oral, une à trois phrases courtes (commence par la plus courte : la tablette parle dès la première phrase), sans liens ni symboles ; vide si pour_moi est false'
      + (canSearch ? ' ; si chercher n\'est pas vide : SEULEMENT une courte phrase d\'attente naturelle (par exemple « Attends, je regarde. »), sans inventer la réponse' : '');
  return `${head}
{"pour_moi": ${search ? 'true' : 'true si la phrase s\'adresse à toi (on te regardait en la disant : c\'est en général le cas, ou la suite évidente de votre conversation), false si c\'est la télé, un bruit, une phrase coupée ou visiblement adressée à quelqu\'un d\'autre'},
${chercher}${search ? '' : ` "regarder": true SEULEMENT si on te demande de regarder ou de décrire quelque chose (ce que tu vois, une couleur, lire, un objet montré, une tenue…) et qu'aucune photo n'est jointe ; alors "reponse" = une très courte phrase d'attente (« Je regarde… »). Sinon false,\n`}${crm && !search ? ` "crm": {"outil": "aucun", sauf si la phrase porte sur le CRM de Timothée (ses clients, rendez-vous, tâches, devis, chiffres, articles), s'il faut appeler un client ou noter quelque chose : "client" (fiche d'un client : remplis "client" avec le nom dit), "agenda" ("jour" : aujourd'hui, demain, jeudi…), "bilan" (son chiffre d'affaires global), "produit" ("produit" et "question" qui_achete ou infos), "question" (TOUTE autre question sur ses données : chiffre passé, total, liste, détail, « qui », « combien », « quand », devis à relancer… ; "demande" = la question complète avec le client et la période ; un analyste cherche dans tout le CRM, "reponse" = « Je cherche l'information… »), "itineraire" ("client" : aller chez lui, un bouton GPS s'affiche), "appeler" ("client", "contact"), "noter" ("type" tache, compte_rendu, rdv ou note, "client", "texte" = ses mots mis au propre, "date", "heure", "echange" visite ou appel : RIEN n'est écrit, tu recevras la phrase à lui relire), "confirmer" (SEULEMENT s'il vient de répondre oui à ta relecture)} ; quand "outil" n'est pas "aucun", "reponse" = une très courte phrase d'attente (« Je regarde dans le CRM… »), ou vide pour noter et confirmer. Ne devine jamais un nom, un chiffre ou une date du CRM,\n` : ''}${maison && !search ? ` "maison": "vide, sauf si on te demande d'agir sur la maison ou son état (allumer, éteindre, lumières, prises, télé, son, « est-ce que … est allumé ») : alors la demande complète en français pour Home Assistant (« allume la grande lumière du salon ») ; "reponse" = vide (Home Assistant répondra)",\n` : ''} "emotion": "une émotion parmi ${EMOTIONS.join(', ')}",
 "reponse": "${reponse}",
 "geste": "${GESTES.join(', ')}",
 "memoriser": ["informations durables à retenir, phrases courtes et autonomes avec les prénoms"],
 "oublier": "sujet des souvenirs à effacer si on te le demande, sinon vide",
 "fin": true si on te dit au revoir, bonne nuit ou « merci, c'est tout »,
 "entendu": "${search ? '' : 'transcription fidèle de ce qui a été dit (vide si rien d\'intelligible)'}"}
Si tu ne dois rien dire : pour_moi false et reponse "" (vide). N'écris JAMAIS « silence », « … », ni de texte entre parenthèses, crochets ou astérisques : tout ce qui est dans "reponse" est lu à voix haute.
Après ta réponse, ne réponds que si la phrase t'est clairement adressée (une question ou une demande pour toi, ou la suite directe de ce que tu viens de dire). Télé, radio, bruit, gens qui parlent entre eux, phrase incomplète ou incompréhensible : pour_moi false. Dans le doute : pour_moi false.
Le micro peut reprendre ta propre voix (la fin de ta réponse précédente) : si l'enregistrement ne contient que tes propres paroles ou une répétition de ce que tu viens de dire, mets pour_moi à false. Ne répète jamais une réponse que tu viens de donner.
Quand tu mémorises quelque chose, confirme-le en quelques mots dans "reponse".`;
}
export const ECO_FORMAT = ecoFormat();

// Ouvre la connexion vers Google à l'avance (réveil) : la vraie requête gagne la poignée de main réseau.
export function warmUp(key) {
  try { fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': cleanKey(key) }, cache: 'no-store' }).catch(() => {}); } catch (_) {}
}

// Retire ce qui ne doit pas être lu (didascalies, « silence »…). Chaîne vide si rien à dire.
export function sayable(t) {
  t = (t || '').replace(/\([^)]*\)|\[[^\]]*\]|\*[^*]*\*/g, ' ').replace(/^\s*wilson\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (/^[\s.…!?,;:-]*(silence|chut|rien|pas de réponse|aucune réponse)?[\s.…!?,;:-]*$/i.test(t)) return '';
  return t;
}

const abortError = () => { try { return new DOMException('Annulé', 'AbortError'); } catch (_) { const e = new Error('Annulé'); e.name = 'AbortError'; return e; } };

export class EcoBrain {
  constructor() {
    this.history = []; this.modelUsed = null; this.thinking = 'minimal'; this.noSearch = false; this.noSchema = false;
    this.speed = 'rapide'; this.stream = true; this.sent = []; this.hedgeMs = HEDGE_MS; this.hedgeSearchMs = HEDGE_SEARCH_MS;
    // Modèles refusés pour quota : essayés en dernier pendant 6 h (pas de requêtes gaspillées à chaque phrase).
    try { this.refused = JSON.parse(localStorage.getItem('wilson.eco.refus') || '{}') || {}; } catch (_) { this.refused = {}; }
    this._restore();
  }
  reset() { this.history = []; }
  setSpeed(sp) { if (sp !== this.speed) { this.speed = ECO_MODELS[sp] ? sp : 'rapide'; this.modelUsed = null; this.thinking = 'minimal'; this._restore(); } }
  // Le modèle et le réglage qui ont marché sont retenus (même après un redémarrage) : pas d'essai inutile à la 1re phrase.
  _restore() {
    try {
      const o = JSON.parse(localStorage.getItem('wilson.eco') || 'null');
      if (o && o.speed === this.speed && (ECO_MODELS[this.speed] || []).includes(o.model)) {
        // Avant 1.7.0, un refus de « minimal » faisait retenir le réglage par défaut (réflexion maximale, lent) : on repart de « minimal ».
        const cur = o.f === FMT;
        this.modelUsed = o.model; this.thinking = cur ? (o.thinking ?? null) : 'minimal';
        this.noSearch = cur && !!o.noSearch; this.noSchema = cur && !!o.noSchema;
      }
    } catch (_) {}
  }
  _save() { try { localStorage.setItem('wilson.eco', JSON.stringify({ f: FMT, speed: this.speed, model: this.modelUsed, thinking: this.thinking, noSearch: this.noSearch, noSchema: this.noSchema })); } catch (_) {} }

  // Requêtes parties dans la dernière minute ; une requête « en plus » (anticipée, relance) n'est permise que sous le garde-fou.
  recent(ms = 60000) { const t = performance.now(); this.sent = this.sent.filter((x) => t - x < ms); return this.sent.length; }
  canExtra() { return this.recent() < EXTRA_MAX; }

  // Ce qui a été dit et répondu, gardé en texte (l'audio est lourd) pour la suite de la discussion.
  commit(out, text) {
    if (!out) return;
    this.history.push({ role: 'user', parts: [{ text: out.entendu ? `[Entendu] ${out.entendu}` : (text || '[bruit]') }] });
    this.history.push({ role: 'model', parts: [{ text: JSON.stringify(out.raw) }] });
    if (this.history.length > 24) this.history = this.history.slice(-24);
  }

  _thinkOrder() { return [this.thinking, 'minimal', 'low', null].filter((v, i, a) => a.indexOf(v) === i); }

  // web : outil Google Search joint (2e requête « recherche ») ; false = même format, sans Internet (quota de recherche épuisé, météo fournie…).
  _body({ system, contents, think, search, web = search, model = '', crm = false, maison = false }) {
    const schema = !search && !this.noSchema;
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(web && !this.noSearch ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: {
        temperature: 0.85, maxOutputTokens: 1024,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: ecoSchema(crm, maison) } : {}),
        // Gemini 2.5 : « thinkingBudget » (0 = pas de réflexion) ; Gemini 3 : « thinkingLevel ».
        ...(think ? { thinkingConfig: /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: think } } : {}),
      },
    };
  }

  // req : { audio: Int16Array 16 kHz, image: base64 jpeg, text, hint } ; onPartial({pourMoi, emotion, reponse, closed}) pendant l'écriture.
  // search : 2e requête, avec Google Search (texte seul). La réponse n'entre dans l'historique que par commit().
  async ask({ key, system, audio, image, text, hint, signal, onPartial, search = false, web = search, fresh = false, crm = false, maison = false }) {
    const parts = [];
    if (audio && audio.length) parts.push({ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } });
    if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    parts.push({ text: text || `[Enregistrement ci-dessus.${hint ? ' ' + hint : ''} Réponds au format JSON demandé.]` });
    const contents = [...(fresh ? [] : this.history.slice(-12)), { role: 'user', parts }];   // fresh : question isolée (outil « chercher »)
    const order = ECO_MODELS[this.speed] || ECO_MODELS.rapide, now = Date.now();
    const pref = this.modelUsed ? [this.modelUsed, ...order.filter((m) => m !== this.modelUsed)] : order;
    const models = [...pref.filter((m) => !(this.refused[m] > now)), ...pref.filter((m) => this.refused[m] > now)];
    const stream = this.stream && !!onPartial;
    const onText = stream ? (acc) => onPartial(partialReply(acc)) : null;
    const hedge = stream ? (search ? this.hedgeSearchMs : this.hedgeMs) : 0;
    let quotaErr = null, last = null;
    for (const model of models) {
      const thinks = this._thinkOrder(); let ti = 0;
      while (ti < thinks.length) {
        const think = thinks[ti];
        const res = await this._race(model, this._body({ system, contents, think, search, web, model, crm, maison }), key, signal, onText, hedge);
        if (res.ok) {
          if (this.refused[model]) { delete this.refused[model]; try { localStorage.setItem('wilson.eco.refus', JSON.stringify(this.refused)); } catch (_) {} }
          const out = res.txt != null ? parseText(res.txt) : parseReply(res.json);
          if (!stream && onPartial) onPartial({ pourMoi: out.pourMoi, emotion: out.emotion, reponse: out.reponse, closed: true });
          if (this.modelUsed !== model || this.thinking !== think) { this.modelUsed = model; this.thinking = think; this._save(); }
          Object.assign(out, { model, think, ttfb: res.ttfb, hedged: res.hedged, searched: !!res.grounded });
          return out;
        }
        const msg = res.msg || '';
        const err = new Error(msg || `Erreur ${res.status}`); err.status = res.status;
        if (res.network) { err.network = true; throw err; }
        if (res.status === 401 || res.status === 403) { err.auth = true; throw err; }
        if (res.status === 429 || /quota|exhausted|rate.?limit/i.test(msg)) {                                                 // modèle suivant
          err.quota = true; quotaErr = quotaErr || err; this.refused[model] = Date.now() + 6 * 3600000;
          try { localStorage.setItem('wilson.eco.refus', JSON.stringify(this.refused)); } catch (_) {}
          break;
        }
        if (res.status === 400 && /think/i.test(msg)) { last = err; ti++; continue; }                                                // réglage de réflexion refusé
        if (res.status === 400 && !search && !this.noSchema && /schema|mime|json|enum|propert/i.test(msg)) { this.noSchema = true; this._save(); last = err; continue; }   // JSON imposé refusé
        if (res.status === 400 && web && !this.noSearch && /tool|search|grounding/i.test(msg)) { this.noSearch = true; this._save(); last = err; continue; }         // recherche refusée
        if (res.status === 404 || /not found|not supported/i.test(msg)) { last = err; break; }
        if (res.status >= 500 || !res.status) { last = err; break; }
        throw err;
      }
    }
    throw quotaErr || last || new Error('Aucun modèle disponible');
  }

  // Second avis de l'oreille du mode voiture : la phrase commence-t-elle par « Wilson » ? (true / false ; requête courte)
  // À la maison (E3) : on fait transcrire la phrase (ce que les modèles font bien, même de loin) ; c'est l'appli qui cherche
  // le prénom dans le texte (journal du 30/10/26, 10h11 : « Gemini, est-ce qu'on appelle Wilson ? » répondait non à de vrais
  // appels). → { appel, demande, texte }.
  async appelDeLoin({ key, audio, signal }) {
    const order = ECO_MODELS.rapide, now = Date.now();
    const models = [...order.filter((m) => !(this.refused[m] > now)), ...order.filter((m) => this.refused[m] > now)].slice(0, 3);
    // Journal du 30/10/26, 11h34-11h48 : la consigne « un mot qui ressemble est presque toujours Wilson » lui faisait
    // entendre « Wilson » dans le bruit (6 « Oui ? » pour rien) et dans la télé (« … tu peux l'éteindre ? Hélas, pas de
    // voix de fond… » → lumière éteinte). Il dit maintenant s'il en est sûr et si c'est la télé.
    const question = "Transcris mot pour mot, en français, ce que dit la voix la plus proche dans cet enregistrement d'un salon (parfois de loin, télé ou radio possibles en fond). L'assistant de la maison s'appelle Wilson ; de loin on entend parfois « où il sonne », « vilson », « wil son » : écris alors « Wilson ». Mais n'écris « Wilson » que si une personne le prononce vraiment : un bruit, un souffle, un mot sans rapport ou un silence ne sont pas « Wilson » (dans le doute, écris ce que tu entends tel quel). Réponds en JSON : {\"texte\": \"…\", \"nom_sur\": true si tu es sûr qu'une personne de la pièce a dit « Wilson » (ou une déformation évidente), sinon false, \"tele\": true si cette voix vient de la télé ou de la radio (présentateur, film, publicité, chanson, plusieurs voix qui ne parlent pas à un assistant), sinon false}. Si personne ne parle : texte vide.";
    const schema = { type: 'OBJECT', properties: { texte: { type: 'STRING' }, nom_sur: { type: 'BOOLEAN' }, tele: { type: 'BOOLEAN' } }, required: ['texte', 'nom_sur', 'tele'] };
    let last = null;
    for (const model of models) {
      for (const think of [true, false]) {
        const body = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } }, { text: question }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json', responseSchema: schema, ...(think ? { thinkingConfig: /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' } } : {}) } };
        this.sent.push(performance.now());
        const res = await this._one(API + model + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
        if (res.ok) {
          const t = ((((res.json.candidates || [])[0] || {}).content || {}).parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join(' ');
          let o = null; try { o = JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (_) {}
          return jugerAppel(prenomDans(String(o ? (o.texte || '') : t).trim()), o || {});
        }
        last = res;
        if (res.status === 400 && /think/i.test(res.msg || '')) continue;
        break;
      }
    }
    throw new Error((last && last.msg) || 'pas de réponse');
  }

  async nomDit({ key, audio, signal }) {
    const order = ECO_MODELS.rapide, now = Date.now();
    const models = [...order.filter((m) => !(this.refused[m] > now)), ...order.filter((m) => this.refused[m] > now)].slice(0, 3);
    const question = "Écoute l'enregistrement. Est-ce que quelqu'un y appelle « Wilson » par son prénom (en général au début : « Wilson, … ») ? Réponds seulement par oui ou par non.";
    let last = null;
    for (const model of models) {
      for (const think of [true, false]) {
        const body = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } }, { text: question }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8, ...(think ? { thinkingConfig: /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' } } : {}) } };
        this.sent.push(performance.now());
        const res = await this._one(API + model + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
        if (res.ok) {
          const t = ((((res.json.candidates || [])[0] || {}).content || {}).parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join(' ');
          return /\boui\b/i.test(t);
        }
        last = res;
        if (res.status === 400 && /think/i.test(res.msg || '')) continue;
        break;
      }
    }
    throw new Error((last && last.msg) || 'pas de réponse');
  }

  // Une requête, relancée en parallèle si Google n'a encore rien écrit après hedgeMs ; la 1re qui écrit gagne, l'autre est annulée.
  // Résout { ok, txt|json, ttfb, hedged, grounded } ou { ok:false, status, msg, network } ; rejette (AbortError) si signal annule.
  _race(model, body, key, outer, onText, hedgeMs) {
    const url = API + model + (onText ? ':streamGenerateContent?alt=sse' : ':generateContent');
    const init = { method: 'POST', headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return new Promise((resolve, reject) => {
      const runs = [], t0 = performance.now(); let winner = null, done = false, timer = null;
      const finish = (fn, v) => {
        if (done) return; done = true; clearTimeout(timer);
        if (outer) outer.removeEventListener('abort', onAbort);
        for (const r of runs) if (r !== winner || fn === reject) r.ctl.abort();
        fn(v);
      };
      const onAbort = () => finish(reject, abortError());
      if (outer) { if (outer.aborted) { reject(abortError()); return; } outer.addEventListener('abort', onAbort); }
      const failed = () => {
        if (winner && winner.failed) return finish(resolve, winner.failed);          // la réponse a cassé en cours de route
        if (!winner && runs.every((r) => r.failed)) finish(resolve, runs[0].failed);   // tout ce qui est parti a échoué
      };
      const launch = () => {
        const run = { ctl: new AbortController(), failed: null, ttfb: 0 }; runs.push(run); this.sent.push(performance.now());
        const claim = () => {
          if (winner) return winner === run;
          winner = run; clearTimeout(timer);
          for (const o of runs) if (o !== run) o.ctl.abort();
          return true;
        };
        const text = onText ? (acc) => { if (!done && claim()) { if (!run.ttfb) run.ttfb = performance.now() - t0; onText(acc); } } : null;
        this._one(url, init, run.ctl.signal, text).then((res) => {
          if (done) return;
          if (!res.ok) { run.failed = res; return failed(); }
          if (!claim()) return;
          finish(resolve, { ...res, ttfb: run.ttfb || performance.now() - t0, hedged: runs.length > 1 });
        }).catch((e) => {
          if (done) return;
          run.failed = { ok: false, status: e.status || 0, msg: e.message || 'Erreur', aborted: e.name === 'AbortError' };
          failed();
        });
      };
      launch();
      if (hedgeMs) timer = setTimeout(() => { if (!winner && !done && this.canExtra()) launch(); }, hedgeMs);
    });
  }

  async _one(url, init, signal, onText) {
    let r;
    try { r = await fetch(url, { ...init, signal }); }
    catch (e) { if (e.name === 'AbortError') throw e; return { ok: false, status: 0, network: true, msg: 'Réseau : ' + e.message }; }
    if (r.ok) {
      if (onText && r.body) { const s = await readStream(r, onText); return { ok: true, txt: s.text, grounded: s.grounded }; }
      const j = await r.json();
      return { ok: true, json: j, grounded: !!((((j.candidates || [])[0] || {}).groundingMetadata || {}).webSearchQueries || []).length };
    }
    let msg = '';
    try {
      const t = await r.text();
      try {
        const er = JSON.parse(t).error || {}; msg = String(er.message || '').trim();
        // Quel quota exactement (requêtes du modèle, recherche Google…) et quand réessayer : écrit dans le journal.
        const det = er.details || [];
        const qf = det.find((d) => /QuotaFailure/.test(d['@type'] || '')), ri = det.find((d) => /RetryInfo/.test(d['@type'] || ''));
        if (qf && qf.violations) msg += ' [quota : ' + qf.violations.map((v) => `${v.quotaId || v.quotaMetric || '?'}${v.quotaValue != null ? `, limit: ${v.quotaValue}` : ''}`).join(' ; ') + ']';
        if (ri && ri.retryDelay) { const s = parseFloat(ri.retryDelay); if (s) msg += ` (retry in ${s}s)`; }
      } catch (_) { msg = t.slice(0, 300); }
    } catch (_) {}
    return { ok: false, status: r.status, msg: msg || `Erreur ${r.status}` };
  }
}

// Lit une réponse en flux (événements « data: {...} ») et rappelle onText avec le texte accumulé.
async function readStream(r, onText) {
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', acc = '', grounded = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let j; try { j = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
      if (j.error) throw Object.assign(new Error(j.error.message || 'Erreur'), { status: j.error.code || 500 });
      const cand = (j.candidates || [])[0] || {};
      if (cand.groundingMetadata && (cand.groundingMetadata.webSearchQueries || []).length) grounded = true;
      const t = ((cand.content || {}).parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      if (t) { acc += t; onText(acc); }
    }
    if (done) break;
  }
  return { text: acc, grounded };
}

// Lecture partielle d'un JSON en cours d'écriture : pour_moi, émotion et le début de la réponse.
export function partialReply(acc) {
  const pm = /"pour_moi"\s*:\s*(true|false)/.exec(acc);
  const em = /"emotion"\s*:\s*"([a-zA-Zéèê_]+)"/.exec(acc);
  const out = { pourMoi: pm ? pm[1] === 'true' : null, emotion: em ? em[1] : null, reponse: '', closed: false };
  const m = /"reponse"\s*:\s*"/.exec(acc);
  if (m) {
    let i = m.index + m[0].length, s = '';
    while (i < acc.length) {
      const c = acc[i];
      if (c === '\\') {
        if (i + 1 >= acc.length) break;
        const n = acc[i + 1];
        if (n === 'u') { if (i + 6 > acc.length) break; s += String.fromCharCode(parseInt(acc.slice(i + 2, i + 6), 16)); i += 6; continue; }
        s += n === 'n' ? ' ' : n === 't' ? ' ' : n; i += 2; continue;
      }
      if (c === '"') { out.closed = true; break; }
      s += c; i++;
    }
    out.reponse = s;
  }
  return out;
}

function parseText(txt) { return parseReply({ candidates: [{ content: { parts: [{ text: txt }] } }] }); }

export function parseReply(j) {
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const txt = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
  let o = null;
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) { try { o = JSON.parse(m[0]); } catch (_) { try { o = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch (_) {} } }
  if (!o) o = { entendu: '', pour_moi: true, reponse: txt.replace(/[{}"]/g, '').slice(0, 600), emotion: 'neutre' };
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).map((s) => s.trim()).filter(Boolean);
  return {
    raw: o,
    entendu: String(o.entendu || '').trim(),
    pourMoi: o.pour_moi !== false && o.pour_moi !== 'false',
    chercher: String(o.chercher || '').trim(),
    regarder: o.regarder === true || o.regarder === 'true',
    reponse: String(o.reponse || '').trim(),
    emotion: String(o.emotion || 'neutre'),
    geste: String(o.geste || 'aucun'),
    memoriser: arr(o.memoriser),
    oublier: String(o.oublier || '').trim(),
    fin: o.fin === true || o.fin === 'true',
    crm: o.crm && typeof o.crm === 'object' && o.crm.outil && o.crm.outil !== 'aucun' ? o.crm : null,
    maison: String(o.maison || '').trim(),
  };
}

// Encode un PCM 16 bits 16 kHz mono en WAV base64.
export function wavBase64(i16, rate = 16000) {
  const n = i16.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(i16);
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// Fin de la dernière phrase complète après « from » (ponctuation suivie d'un espace), ou d'un long morceau à une virgule.
export function sentenceCut(txt, from) {
  let cut = from;
  const re = /[.!?…](?=\s)/g; re.lastIndex = from; let m;
  while ((m = re.exec(txt))) cut = m.index + 1;
  if (cut === from) {
    // Pas encore de phrase complète : au tout début, on démarre dès une virgule (parole plus rapide) ; sinon sur un long morceau.
    const minLen = from === 0 ? 28 : 140;
    if (txt.length - from > minLen) { const c = txt.lastIndexOf(', '); if (c > from + (from === 0 ? 20 : 40)) cut = c + 1; }
  }
  return cut;
}

// Le prénom (et ses déformations à l'oreille) dans une phrase transcrite → { appel, demande, texte }.
// (journal du 30/10/26, 10h54 : « il est quelle heure, Wilson ? » transcrit « il est quelle heure où il sonne ? »)
const PRENOM = /(?:^|[^a-zà-ÿ])(wilson+e?|willson|wil+ ?son+e?|ouil+ ?son+e?|vil+ ?son+e?|whil?son|wilso|wilsonne|wilzon|uilson|wilsen|o[uù] il sonne?|oui+l+ ?son+e?)(?=$|[^a-zà-ÿ])/i;
// Après la transcription : est-ce vraiment un appel ? (journal du 30/10/26, 11h34-11h48)
//  - la voix vient de la télé → non ;
//  - « Wilson » tout seul, sans certitude → non (c'était presque toujours du bruit) ;
//  - un long morceau de phrases enchaînées (plus de 2 phrases ou de 22 mots après le prénom) sans certitude → la télé ;
//  - sinon oui, avec « doute » si Gemini n'était pas sûr : la demande ne sera pas exécutée sans confirmation.
export function jugerAppel(r, o = {}) {
  if (!r.appel) return r;
  const phrases = (r.demande.match(/[^.!?…]+[.!?…]*/g) || []).filter((x) => /[a-zà-ÿ]{2,}/i.test(x));
  const mots = r.demande.split(/\s+/).filter(Boolean).length;
  if (o.tele === true) return { ...r, appel: false, pourquoi: 'la télé' };
  const sur = o.nom_sur !== false;
  if (!sur && !r.demande) return { ...r, appel: false, pourquoi: 'pas sûr' };
  if (!sur && (phrases.length > 2 || mots > 22)) return { ...r, appel: false, pourquoi: 'trop long, sans doute la télé' };
  const demande = phrases.length > 2 ? phrases.slice(0, 2).join(' ').trim() : r.demande;
  return { ...r, demande, doute: !sur || phrases.length > 1 };
}

export function prenomDans(texte) {
  const t = String(texte || '').trim();
  if (!PRENOM.test(t)) return { appel: false, demande: '', texte: t };
  const demande = t.replace(new RegExp(PRENOM.source, 'gi'), ' ').replace(/^[\s,.!?;:-]*(hé|eh|oh|dis|allez)?[\s,.!?;:-]*/i, '').replace(/\s*,\s*([.!?]?)\s*$/, '$1').replace(/^(euh|bah|ben|bon)\s*[, ]\s*/i, '').replace(/\s+([.,!?])/g, '$1').replace(/\s+/g, ' ').trim();
  return { appel: true, demande: /[a-zà-ÿ]{2,}/i.test(demande) ? demande : '', texte: t };
}
