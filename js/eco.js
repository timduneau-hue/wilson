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
export const ECO_MODELS = {
  rapide: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'],
  reflechi: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
};
export const HEDGE_MS = 2200;          // sans premier mot après ce délai : la requête est relancée en parallèle
export const HEDGE_SEARCH_MS = 7000;   // idem pour la requête avec recherche Google (plus longue par nature)
export const EXTRA_MAX = 10;           // garde-fou palier gratuit : pas de requête « en plus » au-delà de 10 par minute
const FMT = 2;                         // version des réglages retenus (1.7.0 : nouvel ordre de réflexion)

const EMOTIONS = ['neutre', 'joie', 'rire', 'triste', 'surprise', 'colere', 'curieux', 'reflexion', 'tendresse', 'gene', 'confus', 'peur', 'fier', 'ennui', 'somnolent'];
const GESTES = ['aucun', 'oui', 'non', 'clin_oeil', 'sautiller', 'pencher_la_tete'];
const ORDER = ['pour_moi', 'chercher', 'emotion', 'reponse', 'geste', 'memoriser', 'oublier', 'fin', 'entendu'];

// L'ordre des champs compte : la réponse arrive tôt pour que Wilson commence à parler avant la fin de l'écriture
// (« chercher » juste avant, la transcription à la fin).
export const ECO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pour_moi: { type: 'BOOLEAN' },
    chercher: { type: 'STRING' },
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

// Consigne de format. search : 2e requête (recherche Google) ; canSearch : la recherche est-elle possible ?
export function ecoFormat({ search = false, canSearch = true } = {}) {
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
${chercher} "emotion": "une émotion parmi ${EMOTIONS.join(', ')}",
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

  _body({ system, contents, think, search }) {
    const schema = !search && !this.noSchema;
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(search && !this.noSearch ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: {
        temperature: 0.85, maxOutputTokens: 1024,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: ECO_SCHEMA } : {}),
        ...(think ? { thinkingConfig: { thinkingLevel: think } } : {}),
      },
    };
  }

  // req : { audio: Int16Array 16 kHz, image: base64 jpeg, text, hint } ; onPartial({pourMoi, emotion, reponse, closed}) pendant l'écriture.
  // search : 2e requête, avec Google Search (texte seul). La réponse n'entre dans l'historique que par commit().
  async ask({ key, system, audio, image, text, hint, signal, onPartial, search = false, fresh = false }) {
    const parts = [];
    if (audio && audio.length) parts.push({ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } });
    if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    parts.push({ text: text || `[Enregistrement ci-dessus.${hint ? ' ' + hint : ''} Réponds au format JSON demandé.]` });
    const contents = [...(fresh ? [] : this.history.slice(-12)), { role: 'user', parts }];   // fresh : question isolée (outil « chercher »)
    const order = ECO_MODELS[this.speed] || ECO_MODELS.rapide;
    const models = this.modelUsed ? [this.modelUsed, ...order.filter((m) => m !== this.modelUsed)] : order;
    const stream = this.stream && !!onPartial;
    const onText = stream ? (acc) => onPartial(partialReply(acc)) : null;
    const hedge = stream ? (search ? this.hedgeSearchMs : this.hedgeMs) : 0;
    let quotaErr = null, last = null;
    for (const model of models) {
      const thinks = this._thinkOrder(); let ti = 0;
      while (ti < thinks.length) {
        const think = thinks[ti];
        const res = await this._race(model, this._body({ system, contents, think, search }), key, signal, onText, hedge);
        if (res.ok) {
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
        if (res.status === 429 || /quota|exhausted|rate.?limit/i.test(msg)) { err.quota = true; quotaErr = quotaErr || err; break; }   // modèle suivant
        if (res.status === 400 && /think/i.test(msg)) { last = err; ti++; continue; }                                                // réglage de réflexion refusé
        if (res.status === 400 && !search && !this.noSchema && /schema|mime|json|enum|propert/i.test(msg)) { this.noSchema = true; this._save(); last = err; continue; }   // JSON imposé refusé
        if (res.status === 400 && search && !this.noSearch && /tool|search|grounding/i.test(msg)) { this.noSearch = true; this._save(); last = err; continue; }         // recherche refusée
        if (res.status === 404 || /not found|not supported/i.test(msg)) { last = err; break; }
        if (res.status >= 500 || !res.status) { last = err; break; }
        throw err;
      }
    }
    throw quotaErr || last || new Error('Aucun modèle disponible');
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
    try { const t = await r.text(); try { msg = JSON.parse(t).error.message || ''; } catch (_) { msg = t.slice(0, 300); } } catch (_) {}
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
    reponse: String(o.reponse || '').trim(),
    emotion: String(o.emotion || 'neutre'),
    geste: String(o.geste || 'aucun'),
    memoriser: arr(o.memoriser),
    oublier: String(o.oublier || '').trim(),
    fin: o.fin === true || o.fin === 'true',
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
