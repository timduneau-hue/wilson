// Wilson — la maison (PLAN.md, section 7 bis, D3) : une seule commande, « maison ».
// La phrase dite est envoyée à l'assistant de Home Assistant (en français), qui agit sur ses appareils (lumières, prises,
// télé, enceinte) et répond. Rien à coder appareil par appareil : on ajoute un appareil dans Home Assistant, Wilson le pilote.
// Home Assistant est joint par son adresse sécurisée Tailscale (https://….ts.net) ; le jeton d'accès est créé et collé par
// Timothée dans les réglages (jamais dans le dépôt).

export const MAISON_TOOL = {
  name: 'maison', behavior: 'BLOCKING',
  description: "Piloter ou interroger la maison (lumières, prises, télé, enceinte du salon) : transmet la demande telle qu'il l'a dite à Home Assistant, qui agit et répond. Exemples : « allume la grande lumière du salon », « éteins l'éclairage du balcon », « est-ce que la lumière jaune salon est allumée ? », « baisse le son de la télé ».",
  parameters: { type: 'OBJECT', properties: { demande: { type: 'STRING', description: 'la demande en français, complète (appareil et action)' } }, required: ['demande'] },
};

const TIMEOUT_MS = 15000;
const netErr = (e) => !navigator.onLine || (e && e.name === 'TypeError') || /Failed to fetch|NetworkError|Load failed/i.test(String((e && e.message) || ''));

export function cleanUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }

export class Maison {
  constructor({ settings, log = () => {} }) { this.settings = settings; this.log = log; }
  get url() { return cleanUrl(this.settings.haUrl); }
  get token() { return String(this.settings.haToken || '').trim(); }
  get on() { return !!(this.url && this.token); }

  async _fetch(path, { method = 'GET', body, signal } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
    try {
      const r = await fetch(this.url + path, { method, signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch (_) {}
      return { status: r.status, ok: r.ok, json: j };
    } finally { clearTimeout(t); }
  }

  // La demande → { ok, dire } : la phrase à dire (réponse de Home Assistant, ou l'explication du problème).
  async dire(demande, signal) {
    if (!this.on) return { ok: false, dire: "La maison n'est pas encore reliée : il faut l'adresse de Home Assistant et le jeton dans mes réglages." };
    const t0 = performance.now();
    try {
      const r = await this._fetch('/api/conversation/process', { method: 'POST', signal, body: { text: String(demande || '').trim(), language: 'fr' } });
      if (r.status === 401 || r.status === 403) return { ok: false, dire: "Home Assistant refuse mon jeton d'accès : il faut en recréer un et le recoller dans mes réglages." };
      if (!r.ok) return { ok: false, dire: `Home Assistant n'a pas pu traiter la demande (erreur ${r.status}).` };
      const res = (r.json && r.json.response) || {};
      const speech = (((res.speech || {}).plain || {}).speech || '').trim();
      const type = res.response_type || '';
      const cibles = ((res.data || {}).success || []).map((x) => x.name).filter(Boolean);
      this.log(`Maison : « ${demande} » → ${type} « ${speech} »${cibles.length ? ' [' + cibles.join(', ') + ']' : ''} (${((performance.now() - t0) / 1000).toFixed(1)} s)`, true);
      if (type === 'error') {
        const code = (res.data || {}).code || '';
        if (/no_valid_targets|no_intent_match/.test(code)) return { ok: false, dire: `Home Assistant n'a pas compris : « ${speech || 'demande inconnue'} ». Redis-le avec le nom exact de l'appareil.` };
        return { ok: false, dire: speech || 'Home Assistant a rencontré une erreur.' };
      }
      return { ok: true, dire: speech || 'C\'est fait.' };
    } catch (e) {
      if (e.name === 'AbortError' && signal && signal.aborted) throw e;
      this.log('Maison : ' + (e.message || e.name));
      if (e.name === 'AbortError') return { ok: false, dire: 'Home Assistant ne répond pas.' };
      return { ok: false, dire: netErr(e) ? "Je n'arrive pas à joindre la maison : vérifie que Tailscale est allumé sur cet appareil." : 'Home Assistant ne répond pas.' };
    }
  }

  // Vérification depuis les réglages : { ok, msg }.
  async verifier() {
    if (!this.url) return { ok: false, msg: "Il manque l'adresse de Home Assistant." };
    if (!/^https:\/\//.test(this.url)) return { ok: false, msg: "L'adresse doit commencer par https:// (celle de Tailscale, en .ts.net)." };
    if (!this.token) return { ok: false, msg: 'Il manque le jeton d\'accès.' };
    try {
      const r = await this._fetch('/api/');
      if (r.status === 401 || r.status === 403) return { ok: false, msg: 'Jeton refusé par Home Assistant.' };
      if (!r.ok) return { ok: false, msg: `Home Assistant répond avec une erreur ${r.status}.` };
      const c = await this._fetch('/api/config');
      return { ok: true, msg: `Maison reliée ✓ (${(c.json && c.json.location_name) || 'Home Assistant'} ${(c.json && c.json.version) || ''})` };
    } catch (e) {
      return { ok: false, msg: netErr(e) ? "Impossible de joindre Home Assistant : Tailscale est-il allumé sur cet appareil ? L'adresse est-elle la bonne ?" : 'Pas de réponse de Home Assistant.' };
    }
  }
}
