// Wilson — cerveau : client Gemini Live (WebSocket), voix + vue + outils.

import { int16ToBase64, base64ToInt16 } from './audio.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const WS_ROOT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.';
const AUTH_RE = /api key|auth|token|credential|permission|unauthenticated|denied|401|403/i;

// Nettoie une clé collée sur mobile (espaces, retours à la ligne, guillemets, caractères invisibles).
export function cleanKey(k) { return (k || '').replace(/[\s ​-‍﻿"'«»`]/g, ''); }

// Vérifie la clé auprès de Google. Les deux formats sont acceptés : « AQ. » (depuis mai 2026) et « AIza » (ancien).
// ok: true = acceptée ; false = refusée ; null = impossible de vérifier (réseau).
export async function checkKey(raw) {
  const key = cleanKey(raw);
  if (!key) return { ok: false, why: 'vide' };
  if (/\.\.\.|…|\*/.test(key) || key.length < 30) return { ok: false, why: 'incomplete' };
  try {
    const r = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key }, cache: 'no-store' });
    if (r.ok) return { ok: true };
    let msg = '', reason = '';
    try { const j = await r.json(); msg = (j.error && j.error.message) || ''; reason = ((j.error && j.error.details) || []).map((d) => d.reason).filter(Boolean).join(' '); } catch (_) {}
    if (r.status === 429) return { ok: true, why: 'quota', msg };            // authentifiée, juste limitée
    return { ok: false, why: 'refused', status: r.status, msg, reason };
  } catch (e) { return { ok: null, why: 'network', msg: e.message }; }
}

// Jeton éphémère (méthode recommandée par Google pour les applis côté client) : la clé passe dans un en-tête.
async function ephemeralToken(key) {
  const now = Date.now();
  const r = await fetch(`${API}/auth_tokens`, {
    method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ uses: 1, expireTime: new Date(now + 30 * 60000).toISOString(), newSessionExpireTime: new Date(now + 2 * 60000).toISOString() }),
  });
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).error.message; } catch (_) {}
    const e = new Error(msg || `Jeton refusé (${r.status})`); e.auth = r.status === 401 || r.status === 403 || AUTH_RE.test(msg); throw e;
  }
  const j = await r.json(); if (!j.name) throw new Error('Jeton vide');
  return j.name;
}

const FALLBACK_MODELS = ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-preview-12-2025'];
const QUOTA_SKIP_MS = 6 * 3600000;    // un modèle refusé pour quota est essayé en dernier pendant 6 h (gagne ~2 s par essai inutile)

// Niveau 0 = tout ; 1 = sans options avancées ; 2 = le strict minimum pour parler.
// La recherche Google n'est plus l'outil intégré de Gemini Live (lent, « Let me check » en anglais, et resté bloqué
// le 23/10/26) : c'est l'outil « chercher », exécuté par l'appli (voir app.js, PLAN 6 bis).
// interrupts : Google coupe Wilson dès qu'il entend parler (coupure « directe ») ; sinon il finit sa phrase (« prudente »).
// proactive : false = Gemini répond à TOUT ce qu'il entend (il n'entend que ce qu'on lui dit en le regardant) ; sans ce réglage
// explicite, il jugeait souvent que la phrase n'était pas pour lui et restait muet (journal du 24/10/26, sans photo).
// extra : outils en plus (CRM à la voix, PLAN 2 quater), déclarés seulement quand le CRM est relié.
function buildSetup({ model, voice, system, level, handle, think, interrupts = false, proactive, extra = [] }) {
  const setup = {
    model: `models/${model}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    systemInstruction: { parts: [{ text: system }] },
    inputAudioTranscription: {}, outputAudioTranscription: {},
    sessionResumption: handle ? { handle } : {},
  };
  if (level <= 1) {
    setup.tools = [{ functionDeclarations: [...TOOLS[0].functionDeclarations, ...extra].map(({ behavior, ...f }) => (level === 0 ? { behavior, ...f } : f)) }];
    setup.realtimeInputConfig = { automaticActivityDetection: { prefixPaddingMs: 200, silenceDurationMs: 700 } };
  }
  // Gemini 2.5 « native audio » réfléchit par défaut avant de parler : plusieurs secondes de silence. On coupe la réflexion.
  if (think === false && level <= 1) setup.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  if (level === 0) {
    setup.generationConfig.mediaResolution = 'MEDIA_RESOLUTION_MEDIUM';   // photos rares (à la demande) : plus nettes
    setup.realtimeInputConfig.activityHandling = interrupts ? 'START_OF_ACTIVITY_INTERRUPTS' : 'NO_INTERRUPTION';
    setup.contextWindowCompression = { slidingWindow: {} };
    if (proactive === false) setup.proactivity = { proactiveAudio: false };
  }
  return setup;
}

// Nombre de connexions ouvertes aujourd'hui (affiché dans les réglages).
export function sessionsToday() {
  try { const o = JSON.parse(localStorage.getItem('wilson.sessions')); return o && o.d === new Date().toDateString() ? o.n : 0; } catch { return 0; }
}
function countSession() {
  try { localStorage.setItem('wilson.sessions', JSON.stringify({ d: new Date().toDateString(), n: sessionsToday() + 1 })); } catch (_) {}
}

// Nature d'un refus de connexion, pour savoir quoi réessayer.
function classify(e) {
  const m = (e && e.message) || '';
  if (/session (not found|history)|session handle|session.*expired/i.test(m)) return 'session';   // reprise impossible (journal du 25/10/26)
  if (e.auth || AUTH_RE.test(m)) return 'auth';
  if (/quota|exceeded|exhausted|rate.?limit|too many requests|429/i.test(m)) return 'quota';
  if (/not found|not supported for|is not available|overloaded|unavailable|high demand|503/i.test(m)) return 'model';
  if (e.code === 1007 || /invalid|unknown name|cannot find field|unsupported|not supported|non-empty|malformed|bad request|unexpected/i.test(m)) return 'config';
  return 'other';
}

export const EMOTIONS = ['neutre', 'joie', 'rire', 'triste', 'surprise', 'colere', 'curieux', 'reflexion',
  'tendresse', 'gene', 'confus', 'peur', 'fier', 'ennui', 'somnolent'];

export const TOOLS = [{
  functionDeclarations: [
    { name: 'exprimer_emotion', behavior: 'NON_BLOCKING',
      description: "Change l'expression de ton visage animé. Appelle-la dès que ton émotion change, sans jamais en parler.",
      parameters: { type: 'OBJECT', properties: {
        emotion: { type: 'STRING', enum: EMOTIONS },
        intensite: { type: 'NUMBER', description: 'de 0.3 (léger) à 1 (fort)' },
        geste: { type: 'STRING', enum: ['aucun', 'oui', 'non', 'clin_oeil', 'sautiller', 'pencher_la_tete'], description: 'petit mouvement de tête optionnel' } },
        required: ['emotion'] } },
    { name: 'memoriser', behavior: 'NON_BLOCKING',
      description: "Retient durablement une information que la famille te confie (prénoms, goûts, dates, habitudes, où sont rangées les choses, rendez-vous). Une phrase courte et autonome, avec les prénoms.",
      parameters: { type: 'OBJECT', properties: { fait: { type: 'STRING' } }, required: ['fait'] } },
    { name: 'oublier', behavior: 'BLOCKING',
      description: 'Efface les souvenirs qui correspondent à ce sujet, quand on te demande d\'oublier quelque chose.',
      parameters: { type: 'OBJECT', properties: { sujet: { type: 'STRING' } }, required: ['sujet'] } },
    { name: 'date_et_heure', behavior: 'BLOCKING',
      description: 'Donne la date et l\'heure exactes maintenant.' },
    { name: 'terminer_conversation', behavior: 'NON_BLOCKING',
      description: 'À appeler SEULEMENT quand on te dit clairement au revoir, bonne nuit, ou « merci, c\'est tout » : tu retournes en veille après ta réponse. Jamais sur un reproche ni une remarque (« tu ne réponds plus », « ne me parle pas comme ça ») : là, tu restes et tu écoutes.' },
    { name: 'regarder', behavior: 'BLOCKING',
      description: "Prend une photo nette avec la caméra quand on te demande de regarder : ce que tu vois, une couleur, lire un texte, un objet qu'on te montre, une tenue… Avant de l'appeler, dis « Je regarde… ». Tu ne vois RIEN sans cet outil.",
      parameters: { type: 'OBJECT', properties: { quoi: { type: 'STRING', description: 'ce qu\'on te demande de regarder' } } } },
    { name: 'chercher', behavior: 'BLOCKING',
      description: "Recherche sur Internet (Google) pour une information récente ou qui change : météo, actualité, sport, horaires, prix, programme télé, commerces, événements. Avant de l'appeler, dis en français une très courte phrase d'attente.",
      parameters: { type: 'OBJECT', properties: { question: { type: 'STRING', description: 'la question complète, avec le lieu et la date si utile' } }, required: ['question'] } },
  ],
}];

export class Brain {
  constructor() {
    this.ws = null; this.ready = false; this.handle = null; this.handlers = {};
    this.inText = ''; this.outText = ''; this._closing = false;
    this.authMode = null;          // 'key' ou 'token' : la méthode qui a marché, retenue pour la suite
    this.think = false;            // false : réflexion coupée (thinkingBudget 0) ; null : réglage refusé par le modèle
    this.proactive = false;        // false : « réponds à tout » demandé explicitement ; null : réglage refusé par le modèle
    this.refused = {};             // modèle → heure jusqu'à laquelle il passe en dernier (refusé pour quota)
    this._restore();
  }
  // Ce qui a marché est retenu même après un redémarrage : la 1re conversation ne perd plus ~4 s en essais refusés.
  _restore() {
    try {
      const o = JSON.parse(localStorage.getItem('wilson.live') || 'null');
      if (o) {
        this.modelUsed = o.model || null; this.level = o.level ?? null; this.authMode = o.auth || null; this.think = o.think === null ? null : false; this.refused = o.refused || {};
        // « réponds à tout » refusé par le modèle : on réessaie une fois par jour (Google fait évoluer ses modèles)
        this.proRefusAt = o.proRefusAt || 0;
        this.proactive = o.proactive === null && Date.now() - this.proRefusAt < 24 * 3600000 ? null : false;
      }
    } catch (_) {}
  }
  _save() {
    try { localStorage.setItem('wilson.live', JSON.stringify({ model: this.modelUsed, level: this.level, auth: this.authMode, think: this.think, proactive: this.proactive, proRefusAt: this.proRefusAt || 0, refused: this.refused })); } catch (_) {}
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  _emit(ev, ...a) { const f = this.handlers[ev]; if (f) try { f(...a); } catch (e) { console.error(ev, e); } }
  get open() { return this.ws && this.ws.readyState === 1 && this.ready; }

  // Connexion tolérante. On essaie, dans l'ordre :
  //  - la méthode d'identification (clé dans l'adresse, ou jeton éphémère) ;
  //  - le modèle choisi, puis un modèle de secours ;
  //  - la configuration complète, puis simplifiée, puis minimale si Google refuse un réglage.
  // La combinaison qui marche est retenue pour les conversations suivantes.
  async connect(opts) {
    const key = cleanKey(opts.key);
    const first = (arr, v) => (v != null && arr.includes(v) ? [v, ...arr.filter((x) => x !== v)] : arr);
    const auths = first(['key', 'token'], this.authMode);
    const now = Date.now();
    const all = first([...new Set([opts.model, ...FALLBACK_MODELS])], this.modelUsed);
    const models = [...all.filter((m) => !(this.refused[m] > now)), ...all.filter((m) => this.refused[m] > now)];   // refusés récemment : en dernier
    const levels = first([0, 1, 2], this.level);
    let last, authErr, serverErr, quotaErr, tries = 0, occupe = 0;
    auth: for (const mode of auths) {
      for (const model of models) {
        for (let li = 0; li < levels.length; li++) {
          const level = levels[li];
          if (++tries > 8) break auth;
          try {
            const url = mode === 'key'
              ? `${WS_ROOT}BidiGenerateContent?key=${encodeURIComponent(key)}`
              : `${WS_ROOT}BidiGenerateContentConstrained?access_token=${encodeURIComponent(await ephemeralToken(key))}`;
            const think = /2\.5/.test(model) ? this.think : undefined;
            await this._open(url, { ...opts, model, level, think, proactive: this.proactive });
            const changed = mode !== this.authMode || model !== this.modelUsed || level !== this.level;
            this.authMode = mode; this.modelUsed = model; this.level = level; delete this.refused[model]; this._save();
            if (changed) this._emit('log', `Gemini connecté : ${mode === 'key' ? 'clé' : 'jeton'}, ${model}, configuration ${['complète', 'simplifiée', 'minimale'][level]}${think === false ? ', sans réflexion préalable' : ''}`);
            return;
          } catch (e) {
            last = e; const kind = classify(e); if (e.code && !serverErr) serverErr = e;   // réponse réelle de Google
            this._emit('log', `Essai ${mode}/${model}/niv.${level} → ${kind} : ${e.message}`);
            // Google a perdu la session à reprendre (après « Internal error ») : nouvelle session, même modèle et même réglage.
            // Avant : 8 essais avec la poignée périmée, puis abandon de la discussion (journal du 25/10/26, 07h53).
            // Journal du 30/10/26, 23h21 : après une coupure (1006), Google croyait l'ancienne connexion encore ouverte
            // (« session is already connected to an existing client ») et la discussion s'arrêtait. On attend 2 s et on
            // réessaie ; si ça bloque encore, nouvelle session (la reprise est perdue, la discussion continue).
            if (/already connected/i.test(e.message) && occupe < 3) {
              occupe++;
              if (occupe >= 2 && this.handle) { this.handle = null; this._emit('log', 'Ancienne session encore ouverte chez Google : nouvelle session'); }
              else this._emit('log', 'Ancienne connexion pas encore fermée chez Google : nouvel essai dans 2 s');
              await new Promise((r) => setTimeout(r, 2000)); li--; tries--; continue;
            }
            if (kind === 'session') {
              if (this.handle) { this.handle = null; this._emit('log', 'Session perdue chez Google : nouvelle session'); li--; tries--; continue; }
              break auth;
            }
            if (kind === 'auth') { authErr = e; continue auth; }      // la clé ne passe pas ainsi : autre méthode
            if (kind === 'quota') { e.quota = true; e.model = model; quotaErr = quotaErr || e; this.refused[model] = Date.now() + QUOTA_SKIP_MS; this._save(); break; }   // quota du modèle : modèle de secours, rien d'autre
            if (kind === 'config' && /think/i.test(e.message) && this.think === false) { this.think = null; this._save(); li--; continue; }   // réglage de réflexion refusé : même niveau, sans lui
            if (kind === 'config' && /proactiv/i.test(e.message) && this.proactive === false) { this.proactive = null; this.proRefusAt = Date.now(); this._emit('log', 'Réglage « réponds à tout » refusé par le modèle : réessayé dans 24 h'); this._save(); li--; continue; }   // idem pour « réponds à tout »
            if (kind === 'config') continue;                         // un réglage refusé : configuration plus simple
            if (kind === 'model') break;                             // modèle indisponible : modèle de secours
            break auth;                                              // réseau, délai… : inutile d'insister
          }
        }
      }
      if (quotaErr) break;                       // le quota est par projet : changer de méthode ne sert à rien
    }
    throw authErr || quotaErr || serverErr || last;          // on signale la raison donnée par Google plutôt qu'un échec secondaire
  }
  // Les réponses « silencieuses » aux outils n'existent qu'avec la configuration complète du modèle 3.8.
  get canSchedule() { return this.level === 0 && /3\.8/.test(this.modelUsed || ''); }

  _open(url, { model, voice, system, resume = true, level = 0, think, interrupts, proactive, extra }) {
    countSession();
    return new Promise((resolve, reject) => {
      this._closing = false; this.ready = false;
      this.inText = ''; this.outText = '';          // un tour coupé par la fin de la discussion ne déborde pas sur la suivante
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('Délai de connexion dépassé (Google ne répond pas)')); try { ws.close(); } catch (_) {} }, 15000);
      ws.onopen = () => {
        const setup = buildSetup({ model, voice, system, level, think, interrupts, proactive, extra, handle: resume ? this.handle : null });
        ws.send(JSON.stringify({ setup }));
      };
      ws.onmessage = async (e) => {
        if (ws !== this.ws) return;                      // message d'une ancienne connexion
        let msg;
        try { msg = JSON.parse(typeof e.data === 'string' ? e.data : await (e.data.text ? e.data.text() : new Response(e.data).text())); }
        catch (err) { return; }
        if (msg.setupComplete !== undefined) { clearTimeout(timer); setupDone = true; this.ready = true; resolve(); this._emit('ready'); return; }
        this._handle(msg);
      };
      ws.onerror = () => this._emit('log', 'Erreur WebSocket');
      let setupDone = false;
      ws.onclose = (e) => {
        clearTimeout(timer);
        if (!setupDone) {
          const err = new Error(e.reason || `Connexion fermée par Google (code ${e.code})`); err.code = e.code;
          err.auth = AUTH_RE.test(e.reason || '') || (e.code === 1008 && !e.reason);
          reject(err);
        }
        if (ws !== this.ws) return;                      // ancienne connexion fermée volontairement
        this.ready = false;
        this._emit('closed', { code: e.code, reason: e.reason, expected: this._closing });
      };
    });
  }

  _handle(m) {
    if (m.sessionResumptionUpdate) { const u = m.sessionResumptionUpdate; if (u.resumable && u.newHandle) this.handle = u.newHandle; }
    if (m.goAway) this._emit('goaway', m.goAway.timeLeft);
    if (m.toolCall) this._emit('toolcall', m.toolCall.functionCalls || []);
    if (m.toolCallCancellation) this._emit('toolcancel', m.toolCallCancellation.ids || []);
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) { if (this.outText) this.outText += ' […]'; this._emit('interrupted'); }
    if (sc.inputTranscription && sc.inputTranscription.text) { this.inText += sc.inputTranscription.text; this._emit('heard', this.inText); }
    if (sc.outputTranscription && sc.outputTranscription.text) { this.outText += sc.outputTranscription.text; this._emit('said', this.outText); }
    if (sc.modelTurn && sc.modelTurn.parts) {
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData && p.inlineData.data && /audio/.test(p.inlineData.mimeType || 'audio')) {
          const rate = +(/rate=(\d+)/.exec(p.inlineData.mimeType || '') || [0, 24000])[1];
          this._emit('audio', base64ToInt16(p.inlineData.data), rate);
        }
      }
    }
    if (sc.turnComplete) {
      this._emit('turn', { user: this.inText.trim(), wilson: this.outText.trim() });
      this.inText = ''; this.outText = '';
    }
  }

  _send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  sendAudio(i16) { this._send({ realtimeInput: { audio: { data: int16ToBase64(i16), mimeType: 'audio/pcm;rate=16000' } } }); }
  sendImage(b64) { this._send({ realtimeInput: { video: { data: b64, mimeType: 'image/jpeg' } } }); }
  sendText(t) { this._send({ realtimeInput: { text: t } }); }
  audioStreamEnd() { this._send({ realtimeInput: { audioStreamEnd: true } }); }
  respond(responses) { this._send({ toolResponse: { functionResponses: responses } }); }
  close() { this._closing = true; this.ready = false; try { this.ws && this.ws.close(1000, 'fin'); } catch (_) {} this.ws = null; }
}
