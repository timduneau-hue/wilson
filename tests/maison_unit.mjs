// Test de js/maison.js avec un faux Home Assistant (fetch simulé).
import { Maison, MAISON_TOOL } from '../js/maison.js';
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
let ok = 0, ko = 0; const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC : ' + m); } };
const calls = [];
globalThis.fetch = async (url, o) => {
  calls.push({ url, o });
  const auth = o.headers.Authorization;
  if (auth !== 'Bearer bon') return { status: 401, ok: false, json: async () => ({ message: 'no' }) };
  if (url.endsWith('/api/')) return { status: 200, ok: true, json: async () => ({ message: 'API running.' }) };
  if (url.endsWith('/api/config')) return { status: 200, ok: true, json: async () => ({ location_name: 'Maison', version: '2026.10.4' }) };
  const b = JSON.parse(o.body);
  if (/grande lumière/.test(b.text)) return { status: 200, ok: true, json: async () => ({ response: { response_type: 'action_done', speech: { plain: { speech: 'Allumé' } }, data: { success: [{ name: 'Grande lumière salon' }] } } }) };
  if (/réseau/.test(b.text)) throw new TypeError('Failed to fetch');
  if (/lent/.test(b.text)) { const e = new Error('signal is aborted without reason'); e.name = 'AbortError'; throw e; }
  return { status: 200, ok: true, json: async () => ({ response: { response_type: 'error', speech: { plain: { speech: "Désolé, je ne connais pas d'appareil" } }, data: { code: 'no_valid_targets' } } }) };
};
const logs = []; const s = { haUrl: 'https://ha.exemple.ts.net/', haToken: 'bon' };
const m = new Maison({ settings: s, log: (x) => logs.push(x) });
t(m.on && m.url === 'https://ha.exemple.ts.net', 'url nettoyée');
let r = await m.dire('allume la grande lumière du salon');
t(r.ok && r.dire === 'Allumé', 'action faite : ' + JSON.stringify(r));
t(calls[0].url === 'https://ha.exemple.ts.net/api/conversation/process' && JSON.parse(calls[0].o.body).language === 'fr', 'appel conversation fr');
r = await m.dire('allume le frigo'); t(!r.ok && /pas compris/.test(r.dire), 'appareil inconnu : ' + r.dire);
r = await m.dire('test réseau'); t(!r.ok && /Tailscale/.test(r.dire) && /ordinateur/.test(r.dire), 'réseau : ' + r.dire);
r = await m.dire('test lent'); t(!r.ok && /trop de temps/.test(r.dire) && !/éteint/.test(r.dire), 'délai dépassé alors que les autres appareils répondent (06/11/26, 08h26:33) : pas « éteint » : ' + r.dire);
m.okAt = 0; r = await m.dire('test lent'); t(!r.ok && /ordinateur de la maison est sans doute éteint/.test(r.dire), 'délai dépassé, rien ne répond (PC éteint, remarque du 30/10/26) : ' + r.dire);
m.pcVivant = async () => true; r = await m.dire('test réseau'); t(!r.ok && /machine virtuelle/.test(r.dire) && /allumé/.test(r.dire), 'injoignable mais le PC répond (07/11/26 → 11/11/26) : machine virtuelle : ' + r.dire);
m.pcVivant = async () => new Promise(() => {}); const t0 = Date.now(); r = await m.dire('test réseau'); t(/Tailscale/.test(r.dire) && Date.now() - t0 < 8000, 'PC qui ne dit rien : 6 s au plus, puis le message habituel');
m.pcVivant = async () => false;
t((await m.verifier()).ok, 'vérifier ok');
s.haToken = 'mauvais'; r = await m.dire('allume la grande lumière'); t(!r.ok && /jeton/.test(r.dire), 'jeton refusé');
t(!(await m.verifier()).ok, 'vérifier jeton refusé');
s.haUrl = 'http://homeassistant.local'; t(/https/.test((await m.verifier()).msg), 'http refusé');
s.haToken = ''; t(!m.on, 'pas relié sans jeton'); r = await m.dire('x'); t(!r.ok && /réglages/.test(r.dire), 'message réglages');
t(MAISON_TOOL.name === 'maison' && MAISON_TOOL.parameters.required[0] === 'demande', 'outil');
console.log(`${ok}/${ok + ko} OK`); process.exit(ko ? 1 : 0);
