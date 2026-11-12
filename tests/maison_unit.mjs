// Test de js/maison.js avec un faux Home Assistant (fetch simulé).
import { Maison, MAISON_TOOL, motVoiture } from '../js/maison.js';
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
// Chauffage de la voiture (module MG iSMART de Home Assistant, 11/11/26) : entité climate (modes off / auto)
{
  const appels = [];
  const etats = [
    { entity_id: 'climate.mg_zs_vehicle_climate', state: 'off', attributes: { friendly_name: 'MG ZS Vehicle climate', hvac_modes: ['off', 'auto'], min_temp: 17, max_temp: 33, temperature: 22 } },
    { entity_id: 'switch.mg_zs_charging', state: 'on', attributes: { friendly_name: 'MG ZS Charging' } },
    { entity_id: 'switch.mg_zs_front_window_defroster_heating', state: 'off', attributes: { friendly_name: 'MG ZS Front window defroster heating' } },
  ];
  const f0 = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    if (url.endsWith('/api/states')) return { status: 200, ok: true, json: async () => etats };
    if (url.endsWith('/api/template')) return { status: 200, ok: true, text: async () => etats.map((e) => `${e.entity_id}||False|False`).join('\n') };
    if (url.includes('/api/services/')) { appels.push([url.split('/api/services/')[1], JSON.parse(o.body)]); return { status: 200, ok: true, json: async () => [] }; }
    return { status: 404, ok: false, json: async () => ({}) };
  };
  const v = new Maison({ settings: { haUrl: 'https://ha.exemple.ts.net', haToken: 'bon' } });
  const inv = await v.rafraichir();
  t(inv.some((e) => e.id === 'climate.mg_zs_vehicle_climate') && !inv.some((e) => /charging/.test(e.id)) && inv.some((e) => /defroster/.test(e.id)), 'voiture : chauffage dans l\'inventaire, interrupteur de charge écarté : ' + inv.map((e) => e.id).join(', '));
  t(/chauffage et clim/.test(v.texteInventaire()) && /17 à 33 °C/.test(v.texteInventaire()), 'voiture : consigne « chauffage et clim, temperature (17 à 33 °C) »');
  let r = await v.commande({ appareil: 'climate.mg_zs_vehicle_climate', action: 'temperature', valeur: '21' });
  t(r.ok && appels[0][0] === 'climate/set_temperature' && appels[0][1].temperature === 21 && appels[0][1].hvac_mode === 'auto' && /21 °C/.test(r.info), 'voiture : « chauffe à 21 » → set_temperature 21, mode auto : ' + JSON.stringify(appels[0]));
  r = await v.commande({ appareil: 'climate.mg_zs_vehicle_climate', action: 'temperature', valeur: '40' });
  t(r.ok && appels[1][1].temperature === 33 && /17 à 33/.test(r.info), 'voiture : 40 °C ramené à 33 (le maximum)');
  r = await v.commande({ appareil: 'climate.mg_zs_vehicle_climate', action: 'allumer' });
  t(r.ok && appels[2][0] === 'climate/set_hvac_mode' && appels[2][1].hvac_mode === 'auto', 'voiture : allumer → mode auto');
  r = await v.commande({ appareil: 'climate.mg_zs_vehicle_climate', action: 'eteindre' });
  t(r.ok && appels[3][1].hvac_mode === 'off', 'voiture : éteindre → off');
  // Home Assistant réglé en °F (11/11/26) : Wilson parle en °C et convertit
  etats[0].attributes = { friendly_name: 'Chauffage de la voiture', hvac_modes: ['off', 'auto'], min_temp: 61, max_temp: 82, temperature: 72 };
  const f1 = globalThis.fetch;
  globalThis.fetch = async (url, o) => url.endsWith('/api/config') ? { status: 200, ok: true, json: async () => ({ unit_system: { temperature: '°F' } }) } : f1(url, o);
  const w = new Maison({ settings: { haUrl: 'https://ha.exemple.ts.net', haToken: 'bon' } });
  await w.rafraichir();
  t(w.uniteF && /16 à 28 °C/.test(w.texteInventaire()) && /réglé à 22 °C/.test(w.texteInventaire()), 'HA en °F : la consigne dit « 16 à 28 °C, réglé à 22 °C » : ' + w.texteInventaire());
  const n0 = appels.length;
  r = await w.commande({ appareil: 'climate.mg_zs_vehicle_climate', action: 'temperature', valeur: '21' });
  t(r.ok && appels[n0][1].temperature === 70 && /21 °C/.test(r.info), 'HA en °F : « 21 degrés » → 70 °F envoyés : ' + JSON.stringify(appels[n0]));
  // « Chauffe la voiture » (règle du 11/11/26, 11h13) : à fond + dégivrages ; bornes restées en °F alors que HA est en °C
  const voit = [
    { entity_id: 'climate.voiture_chauffage', state: 'off', attributes: { friendly_name: 'Chauffage de la voiture', hvac_modes: ['off', 'auto'], min_temp: 61, max_temp: 82, temperature: 72 } },
    { entity_id: 'switch.voiture_degivrage_avant', state: 'off', attributes: { friendly_name: 'Dégivrage du pare-brise de la voiture' } },
    { entity_id: 'switch.voiture_degivrage_arriere', state: 'off', attributes: { friendly_name: 'Dégivrage de la lunette arrière de la voiture' } },
    { entity_id: 'light.salon', state: 'off', attributes: { friendly_name: 'Lumière du salon' } },
  ];
  globalThis.fetch = async (url, o) => {
    if (url.endsWith('/api/config')) return { status: 200, ok: true, json: async () => ({ unit_system: { temperature: '°C' } }) };
    if (url.endsWith('/api/states')) return { status: 200, ok: true, json: async () => voit };
    if (url.endsWith('/api/template')) return { status: 200, ok: true, text: async () => voit.map((e) => `${e.entity_id}||False|False`).join('\n') };
    if (url.includes('/api/services/')) { appels.push([url.split('/api/services/')[1], JSON.parse(o.body)]); return { status: 200, ok: true, json: async () => [] }; }
    return { status: 404, ok: false, json: async () => ({}) };
  };
  const m2 = new Maison({ settings: { haUrl: 'https://ha.exemple.ts.net', haToken: 'bon' } });
  await m2.rafraichir();
  t(/16 à 28 °C/.test(m2.texteInventaire()) && /réglé à 22 °C/.test(m2.texteInventaire()) && /à fond \+ dégivrages/.test(m2.texteInventaire()), 'voiture : bornes restées en °F (61-82) lues 16 à 28 °C : ' + m2.texteInventaire());
  const n1 = appels.length;
  r = await m2.commande({ appareil: 'climate.voiture_chauffage', action: 'allumer' });
  const faits = appels.slice(n1).map((a) => a[0] + ' ' + (a[1].entity_id || '') + (a[1].temperature != null ? ' ' + a[1].temperature : ''));
  t(r.ok && r.voiture && faits[0] === 'climate/set_temperature climate.voiture_chauffage 28' && faits.includes('switch/turn_on switch.voiture_degivrage_avant') && faits.includes('switch/turn_on switch.voiture_degivrage_arriere') && !faits.some((f) => /salon/.test(f)) && /je te dirai si elle refuse/.test(r.info),
    '« chauffe la voiture » : à fond (28 °C, en °C) + 2 dégivrages : ' + JSON.stringify(faits));
  const n2 = appels.length;
  r = await m2.commande({ appareil: 'switch.voiture_degivrage_avant', action: 'allumer' });
  t(r.ok && r.voiture && /mise en marche demandée/.test(r.info) && !/éteint/.test(r.info), 'dégivrage de la voiture : « demandé », pas « éteint » (11h10) : ' + r.info);
  r = await m2.commande({ appareil: 'climate.voiture_chauffage', action: 'eteindre' });
  t(r.ok && appels.slice(n2).some((a) => a[0] === 'climate/set_hvac_mode' && a[1].hvac_mode === 'off') && appels.slice(n2).some((a) => a[0] === 'switch/turn_off'), 'éteindre le chauffage de la voiture coupe aussi les dégivrages');
  t(/clé à l'intérieur/.test(motVoiture('return code: 8, message: The key is detected inside the vehicle. Please adjust and try again.(64)')) && /appli MG/.test(motVoiture('return code: 401, message: {"code":401}')), 'refus de la voiture traduits (clé dedans, appli MG ouverte)');
  globalThis.fetch = f0;
}
// Journal du 11/11/26 (18h44:47, 20h58:53, 21h16:55, 21h18:22) : « allumer → ok — éteint ». La lumière qui reste éteinte
// est un échec ; une prise Wi-Fi qui met 2 s à dire son nouvel état est attendue ; le clignotement s'arrête si on lui
// redonne un ordre (remarque de 21h02:14) et une prise clignote 3 fois au plus, toutes les 2 s.
{
  const L = { entity_id: 'switch.balcon', state: 'off', attributes: { friendly_name: 'Éclairage balcon' } };
  let marche = false, retard = 0, appelsB = [];
  const f0 = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    if (url.endsWith('/api/config')) return { status: 200, ok: true, json: async () => ({}) };
    if (url.endsWith('/api/states')) return { status: 200, ok: true, json: async () => [L] };
    if (url.includes('/api/states/')) return { status: 200, ok: true, json: async () => L };
    if (url.endsWith('/api/template')) return { status: 200, ok: true, text: async () => 'switch.balcon|Balcon|False|False' };
    if (url.includes('/api/services/')) {
      const svc = url.split('/api/services/')[1]; appelsB.push([svc, Date.now()]);
      if (marche) { const v = /turn_on/.test(svc) ? 'on' : /turn_off/.test(svc) ? 'off' : /toggle/.test(svc) ? (L.state === 'on' ? 'off' : 'on') : L.state; if (retard) setTimeout(() => { L.state = v; }, retard); else L.state = v; }
      return { status: 200, ok: true, json: async () => [] };
    }
    return { status: 404, ok: false, json: async () => ({}) };
  };
  const b = new Maison({ settings: { haUrl: 'https://ha.exemple.ts.net', haToken: 'bon' } });
  await b.rafraichir();
  let r = await b.commande({ appareil: 'switch.balcon', action: 'allumer' });
  t(!r.ok && /resté éteint/.test(r.info) && /ne dis surtout pas que c'est fait/.test(r.info), 'lumière restée éteinte après « allumer » : échec, jamais « ok — éteint » (11/11/26) : ' + r.info);
  marche = true; retard = 1500; L.state = 'off';
  r = await b.commande({ appareil: 'switch.balcon', action: 'allumer' });
  t(r.ok && /Éclairage balcon : allumé/.test(r.info), 'prise Wi-Fi qui dit son nouvel état 1,5 s plus tard : attendue, « allumé » : ' + r.info);
  retard = 0; L.state = 'on'; appelsB = [];
  r = await b.commande({ appareil: 'switch.balcon', action: 'clignoter', valeur: '5' });
  t(r.ok && /clignote 3 fois/.test(r.info), 'prise : 3 clignotements au plus : ' + r.info);
  await new Promise((z) => setTimeout(z, 2500));
  t(appelsB.length === 2 && appelsB[1][1] - appelsB[0][1] >= 1900, 'prise : une bascule toutes les 2 s : ' + JSON.stringify(appelsB));
  r = await b.commande({ appareil: 'switch.balcon', action: 'eteindre' });
  const n0 = appelsB.length;
  await new Promise((z) => setTimeout(z, 3000));
  t(r.ok && L.state === 'off' && appelsB.length === n0, 'éteindre pendant le clignotement : il s\'arrête et ne rallume pas la lampe ensuite : ' + JSON.stringify(appelsB.slice(n0)) + ' ' + L.state);
  globalThis.fetch = f0;
}
console.log(`${ok}/${ok + ko} OK`); process.exit(ko ? 1 : 0);
