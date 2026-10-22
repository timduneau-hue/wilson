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
      description: 'Donne la date et l\'heure exactes maintenant.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'terminer_conversation', behavior: 'NON_BLOCKING',
      description: 'À appeler quand on te dit au revoir, bonne nuit, ou « merci, c\'est tout » : tu retournes en veille après ta réponse.',
      parameters: { type: 'OBJECT', properties: {} } },
  ],
}, { googleSearch: {} }];

export class Brain {
  constructor() {
    this.ws = null; this.ready = false; this.handle = null; this.handlers = {};
    this.inText = ''; this.outText = ''; this._closing = false;
    this.authMode = null;          // 'key' ou 'token' : la méthode qui a marché, retenue pour la suite
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  _emit(ev, ...a) { const f = this.handlers[ev]; if (f) try { f(...a); } catch (e) { console.error(ev, e); } }
  get open() { return this.ws && this.ws.readyState === 1 && this.ready; }

  // Deux façons de se connecter : clé dans l'adresse, ou jeton éphémère obtenu avec la clé.
  // On essaie la méthode qui a déjà marché, sinon les deux à la suite.
  async connect(opts) {
    const key = cleanKey(opts.key);
    const order = this.authMode === 'token' ? ['token', 'key'] : ['key', 'token'];
    let last, authErr;
    for (const mode of order) {
      try {
        const url = mode === 'key'
          ? `${WS_ROOT}BidiGenerateContent?key=${encodeURIComponent(key)}`
          : `${WS_ROOT}BidiGenerateContentConstrained?access_token=${encodeURIComponent(await ephemeralToken(key))}`;
        await this._open(url, opts);
        if (this.authMode !== mode) this._emit('log', `Connexion Gemini par ${mode === 'key' ? 'clé' : 'jeton éphémère'}`);
        this.authMode = mode; return;
      } catch (e) {
        last = e; if (e.auth) authErr = e;
        this._emit('log', `Méthode « ${mode} » : ${e.message}`);
        if (!e.auth) break;                     // pas un problème d'identification : inutile d'essayer l'autre méthode
      }
    }
    throw authErr || last;                      // si l'une des méthodes a refusé la clé, c'est ce qu'on signale
  }

  _open(url, { model, voice, system, resume = true }) {
    return new Promise((resolve, reject) => {
      this._closing = false; this.ready = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('Délai de connexion dépassé')); try { ws.close(); } catch (_) {} }, 10000);
      ws.onopen = () => {
        const setup = {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            mediaResolution: 'MEDIA_RESOLUTION_LOW',
          },
          systemInstruction: { parts: [{ text: system }] },
          tools: TOOLS,
          realtimeInputConfig: {
            automaticActivityDetection: { prefixPaddingMs: 200, silenceDurationMs: 700 },
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          },
          inputAudioTranscription: {}, outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: resume && this.handle ? { handle: this.handle } : {},
        };
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
          const err = new Error(e.reason || `Connexion refusée (${e.code})`);
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
