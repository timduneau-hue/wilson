// Wilson — cerveau du mode économique : une phrase enregistrée (+ une photo) → Gemini Flash → réponse JSON.
// Utilisé quand le modèle vocal en direct (Gemini Live) n'a pas de quota. Une seule requête par phrase.

import { cleanKey } from './brain.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const ECO_MODELS = {
  rapide: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'],
  reflechi: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
};

// L'ordre des champs compte : la réponse arrive en premier pour que Wilson commence à parler
// avant la fin de l'écriture (l'émotion juste avant, la transcription à la fin).
export const ECO_FORMAT = `MODE ÉCONOMIQUE — tu reçois l'enregistrement audio de ce qui vient d'être dit dans le salon (et parfois une photo de ce que tu vois, ou une consigne écrite entre crochets).
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec ces champs DANS CET ORDRE EXACT :
{"pour_moi": true si la phrase s'adresse à toi (ton prénom, ou la suite évidente de votre conversation), false si les gens parlent entre eux, au téléphone, si c'est la télé ou un bruit,
 "emotion": "une émotion parmi neutre, joie, rire, triste, surprise, colere, curieux, reflexion, tendresse, gene, confus, peur, fier, ennui, somnolent",
 "reponse": "ce que tu dis à voix haute, en français oral, une à trois phrases courtes, sans liens ni symboles ; vide si pour_moi est false",
 "geste": "aucun, oui, non, clin_oeil, sautiller ou pencher_la_tete",
 "memoriser": ["informations durables à retenir, phrases courtes et autonomes avec les prénoms"],
 "oublier": "sujet des souvenirs à effacer si on te le demande, sinon vide",
 "fin": true si on te dit au revoir, bonne nuit ou « merci, c'est tout »,
 "entendu": "transcription fidèle de ce qui a été dit (vide si rien d'intelligible)"}
Le micro peut reprendre ta propre voix (la fin de ta réponse précédente) : si l'enregistrement ne contient que tes propres paroles ou une répétition de ce que tu viens de dire, mets pour_moi à false. Ne répète jamais une réponse que tu viens de donner.
Quand tu mémorises quelque chose, confirme-le en quelques mots dans "reponse". Pour l'actualité, la météo, le sport, les horaires ou si tu n'es pas sûr, utilise la recherche Google avant de répondre.`;

export class EcoBrain {
  constructor() { this.history = []; this.modelUsed = null; this.thinking = 'minimal'; this.noSearch = false; this.speed = 'rapide'; this.stream = true; }
  reset() { this.history = []; }
  setSpeed(sp) { if (sp !== this.speed) { this.speed = ECO_MODELS[sp] ? sp : 'rapide'; this.modelUsed = null; this.thinking = 'minimal'; } }

  // req : { audio: Int16Array 16 kHz, image: base64 jpeg, text } ; onPartial({pourMoi, emotion, reponse, closed}) pendant l'écriture.
  async ask({ key, system, audio, image, text, signal, onPartial }) {
    const parts = [];
    if (audio && audio.length) parts.push({ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } });
    if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    parts.push({ text: text || '[Enregistrement ci-dessus. Réponds au format JSON demandé.]' });
    const contents = [...this.history.slice(-12), { role: 'user', parts }];
    const order = ECO_MODELS[this.speed] || ECO_MODELS.rapide;
    const models = this.modelUsed ? [this.modelUsed, ...order.filter((m) => m !== this.modelUsed)] : order;
    let quotaErr = null, last = null;
    for (const model of models) {
      for (const think of [this.thinking, 'low', null].filter((v, i, a) => a.indexOf(v) === i)) {
        const body = {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(this.noSearch ? {} : { tools: [{ googleSearch: {} }] }),
          generationConfig: { temperature: 0.85, maxOutputTokens: 1024, ...(think ? { thinkingConfig: { thinkingLevel: think } } : {}) },
        };
        const stream = this.stream && !!onPartial;
        const url = API + model + (stream ? ':streamGenerateContent?alt=sse' : ':generateContent');
        let r;
        try {
          r = await fetch(url, { method: 'POST', signal, headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } catch (e) { if (e.name === 'AbortError') throw e; const err = new Error('Réseau : ' + e.message); err.network = true; throw err; }
        if (r.ok) {
          let out;
          if (stream && r.body) {
            const txt = await readStream(r, (acc) => onPartial(partialReply(acc)));
            out = parseText(txt);
          } else {
            out = parseReply(await r.json());
            if (onPartial) onPartial({ pourMoi: out.pourMoi, emotion: out.emotion, reponse: out.reponse, closed: true });
          }
          this.modelUsed = model; this.thinking = think;
          // Historique en texte seulement (l'audio est lourd) : ce qui a été entendu, puis la réponse.
          this.history.push({ role: 'user', parts: [{ text: out.entendu ? `[Entendu] ${out.entendu}` : (text || '[bruit]') }] });
          this.history.push({ role: 'model', parts: [{ text: JSON.stringify(out.raw) }] });
          out.model = model;
          return out;
        }
        let msg = ''; try { msg = (await r.json()).error.message || ''; } catch (_) {}
        if (!msg && stream) { try { msg = (await r.text()).slice(0, 300); } catch (_) {} }
        const err = new Error(msg || `Erreur ${r.status}`); err.status = r.status;
        if (r.status === 401 || r.status === 403) { err.auth = true; throw err; }
        if (r.status === 429 || /quota|exhausted|rate.?limit/i.test(msg)) { err.quota = true; quotaErr = quotaErr || err; break; }   // modèle suivant
        if (r.status === 400 && /think/i.test(msg)) { last = err; continue; }                                                         // réglage de réflexion refusé
        if (r.status === 400 && /tool|search|grounding/i.test(msg) && !this.noSearch) { this.noSearch = true; last = err; continue; }   // recherche refusée : sans recherche
        if (r.status === 404 || /not found|not supported/i.test(msg)) { last = err; break; }
        if (r.status >= 500) { last = err; break; }
        throw err;
      }
    }
    throw quotaErr || last || new Error('Aucun modèle disponible');
  }
}

// Lit une réponse en flux (événements « data: {...} ») et rappelle onText avec le texte accumulé.
async function readStream(r, onText) {
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const j = JSON.parse(line.slice(5).trim());
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        const t = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
        if (t) { acc += t; onText(acc); }
        if (j.error) throw Object.assign(new Error(j.error.message || 'Erreur'), { status: j.error.code });
      } catch (e) { if (e.status) throw e; }
    }
    if (done) break;
  }
  return acc;
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
  if (cut === from && txt.length - from > 140) { const c = txt.lastIndexOf(', ', txt.length - 1); if (c > from + 40) cut = c + 1; }
  return cut;
}

