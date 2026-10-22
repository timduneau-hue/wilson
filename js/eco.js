// Wilson — cerveau du mode économique : une phrase enregistrée (+ une photo) → Gemini Flash → réponse JSON.
// Utilisé quand le modèle vocal en direct (Gemini Live) n'a pas de quota. Une seule requête par phrase.

import { cleanKey } from './brain.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const ECO_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export const ECO_FORMAT = `MODE ÉCONOMIQUE — tu reçois l'enregistrement audio de ce qui vient d'être dit dans le salon (et parfois une photo de ce que tu vois, ou une consigne écrite entre crochets).
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec ces champs :
{"entendu": "transcription fidèle de ce qui a été dit (vide si rien d'intelligible)",
 "pour_moi": true si la phrase s'adresse à toi (ton prénom, ou la suite évidente de votre conversation), false si les gens parlent entre eux, au téléphone, si c'est la télé ou un bruit,
 "reponse": "ce que tu dis à voix haute, en français oral, une à trois phrases courtes, sans liens ni symboles ; vide si pour_moi est false",
 "emotion": "une émotion parmi neutre, joie, rire, triste, surprise, colere, curieux, reflexion, tendresse, gene, confus, peur, fier, ennui, somnolent",
 "geste": "aucun, oui, non, clin_oeil, sautiller ou pencher_la_tete",
 "memoriser": ["informations durables à retenir, phrases courtes et autonomes avec les prénoms"],
 "oublier": "sujet des souvenirs à effacer si on te le demande, sinon vide",
 "fin": true si on te dit au revoir, bonne nuit ou « merci, c'est tout »}
Quand tu mémorises quelque chose, confirme-le en quelques mots dans "reponse". Pour l'actualité, la météo, le sport, les horaires ou si tu n'es pas sûr, utilise la recherche Google avant de répondre.`;

export class EcoBrain {
  constructor() { this.history = []; this.modelUsed = null; this.thinking = 'minimal'; this.noSearch = false; }
  reset() { this.history = []; }

  // parts : { audio: Int16Array 16 kHz, image: base64 jpeg, text: string }
  async ask({ key, system, audio, image, text, signal }) {
    const parts = [];
    if (audio && audio.length) parts.push({ inlineData: { mimeType: 'audio/wav', data: wavBase64(audio) } });
    if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    parts.push({ text: text || '[Enregistrement ci-dessus. Réponds au format JSON demandé.]' });
    const contents = [...this.history.slice(-12), { role: 'user', parts }];
    const models = this.modelUsed ? [this.modelUsed, ...ECO_MODELS.filter((m) => m !== this.modelUsed)] : ECO_MODELS;
    let quotaErr = null, last = null;
    for (const model of models) {
      for (const think of [this.thinking, 'low', null].filter((v, i, a) => a.indexOf(v) === i)) {
        const body = {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(this.noSearch ? {} : { tools: [{ googleSearch: {} }] }),
          generationConfig: { temperature: 0.85, maxOutputTokens: 1024, ...(think ? { thinkingConfig: { thinkingLevel: think } } : {}) },
        };
        let r;
        try {
          r = await fetch(API + model + ':generateContent', {
            method: 'POST', signal, headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
        } catch (e) { if (e.name === 'AbortError') throw e; const err = new Error('Réseau : ' + e.message); err.network = true; throw err; }
        if (r.ok) {
          const j = await r.json();
          const out = parseReply(j);
          this.modelUsed = model; this.thinking = think;
          // Historique en texte seulement (l'audio est lourd) : ce qui a été entendu, puis la réponse.
          this.history.push({ role: 'user', parts: [{ text: out.entendu ? `[Entendu] ${out.entendu}` : (text || '[bruit]') }] });
          this.history.push({ role: 'model', parts: [{ text: JSON.stringify(out.raw) }] });
          out.model = model;
          return out;
        }
        let msg = ''; try { msg = (await r.json()).error.message || ''; } catch (_) {}
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
