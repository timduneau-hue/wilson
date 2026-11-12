// Wilson — la maison (PLAN.md, section 7 bis, D3 et D7).
// C'est Wilson (Gemini) qui comprend ce qu'on lui dit, pas les phrases toutes faites de Home Assistant :
//  - il reçoit dans sa consigne l'inventaire de la maison (noms, pièces, types, possibilités, état), relu régulièrement ;
//  - il pilote avec deux outils : maison_etat (état détaillé) et maison_commande (un appareil + une action prise dans une
//    liste sûre : allumer, éteindre, luminosité, volume, lecture, appli de la télé, radio, clignoter…) ;
//  - demande floue → il pose une question courte ; demande claire → il agit.
// Home Assistant est joint par son adresse sécurisée Tailscale (https://….ts.net) ; le jeton d'accès est créé et collé par
// Timothée dans les réglages (jamais dans le dépôt). Le mode économique garde la voie simple : la phrase est envoyée à
// l'assistant de Home Assistant (dire()).

const ACTIONS = ['allumer', 'eteindre', 'basculer', 'luminosite', 'volume', 'volume_plus', 'volume_moins', 'muet', 'son',
  'lecture', 'pause', 'stop', 'suivant', 'precedent', 'appli', 'radio', 'source', 'clignoter', 'temperature'];

export const MAISON_TOOLS = [
  { name: 'maison_etat', behavior: 'BLOCKING',
    description: "État actuel de la maison : chaque appareil (lumières, télé, enceinte…) avec sa pièce, s'il est allumé, sa luminosité, son volume, ce qu'il joue. À appeler pour répondre à « qu'est-ce qui est allumé ? », « la télé est allumée ? », ou avant d'agir si tu as un doute.",
    parameters: { type: 'OBJECT', properties: { appareils: { type: 'ARRAY', items: { type: 'STRING' }, description: 'identifiants (light.xxx…) ou noms ; vide = toute la maison' } } } },
  { name: 'maison_commande', behavior: 'BLOCKING',
    description: "Agit sur UN appareil de la maison. Plusieurs appareils (« les lumières du salon ») : un appel par appareil. Actions : allumer, eteindre, basculer, luminosite (valeur 0 à 100), volume (0 à 100), volume_plus / volume_moins (valeur = nombre de crans, 2 par défaut), muet, son (remettre le son), lecture, pause, stop, suivant, precedent, appli (valeur = Netflix, YouTube, Prime Video ou France TV : allume la télé si besoin et ouvre l'appli), radio (valeur = nom de la station, ex. France Inter, Nostalgie, RTL : la diffuse sur l'enceinte ou sur la télé), source (valeur = entrée), clignoter (valeur = nombre de clignotements, 5 par défaut), temperature (valeur en °C : chauffage ou clim, par exemple celle de la voiture ; l'allume aussi). « Chauffe la voiture » (règle de Timothée) : allumer le « Chauffage de la voiture » SANS valeur = chauffage à fond + dégivrages avant et arrière, en un seul appel ; « mets la voiture à 20 » : temperature. La voiture met jusqu'à une minute et peut refuser (clé restée dedans…) : dis « je lance le chauffage, je te dis si la voiture refuse », jamais qu'il fait déjà chaud ; sa réponse te sera donnée en message.",
    parameters: { type: 'OBJECT', properties: {
      appareil: { type: 'STRING', description: "l'identifiant de l'inventaire (light.grande_lumiere_salon…), ou son nom" },
      action: { type: 'STRING', enum: ACTIONS },
      valeur: { type: 'STRING', description: 'selon l\'action (nombre, appli, station, entrée) ; vide sinon' } }, required: ['appareil', 'action'] } },
];
export const MAISON_TOOL_NAMES = MAISON_TOOLS.map((t) => t.name);

// Ancien outil (une phrase pour l'assistant de Home Assistant), gardé pour le mode économique.
export const MAISON_TOOL = {
  name: 'maison', behavior: 'BLOCKING',
  description: "Transmet une demande en français à l'assistant de Home Assistant.",
  parameters: { type: 'OBJECT', properties: { demande: { type: 'STRING' } }, required: ['demande'] },
};

// Applis de la télé (Android TV) : nom dit → lien qui ouvre l'appli (vérifié sur la télé Sony le 30/10/26) et son paquet.
// Le nom du paquet seul ne marche pas avec cette télé ; Disney+, Arte, Canal+, TF1+, Spotify n'y sont pas installées.
const APPLIS = [
  [/netflix/, 'https://www.netflix.com/title', 'com.netflix.ninja', 'Netflix'],
  [/youtube/, 'https://www.youtube.com', 'com.google.android.youtube.tv', 'YouTube'],
  [/prime|amazon/, 'https://app.primevideo.com', 'com.amazon.amazonvideo.livingroom', 'Prime Video'],
  [/france ?tv|france ?2|france ?3|francetv|france ?5/, 'https://www.france.tv', 'fr.francetv.pluzz', 'France TV'],
];
const TYPE = { light: 'lumière', switch: 'prise', media_player: 'lecteur', remote: 'télécommande', script: 'raccourci', scene: 'ambiance', cover: 'volet', fan: 'ventilateur', input_boolean: 'interrupteur', climate: 'chauffage et clim' };
const ETAT = { on: 'allumé', off: 'éteint', playing: 'en lecture', paused: 'en pause', idle: 'allumé (rien en cours)', standby: 'en veille', unavailable: 'injoignable', unknown: 'inconnu', buffering: 'chargement', open: 'ouvert', closed: 'fermé', auto: 'en marche', heat: 'chauffe', cool: 'refroidit', heat_cool: 'en marche', fan_only: 'ventilation seule', dry: 'déshumidifie' };
const PLAY_MEDIA = 512;
const TIMEOUT_MS = 15000;
// Remarque de Timothée du 30/10/26, 18h02:44 : « l'ordinateur doit être allumé pour commander les appareils » (Home
// Assistant tourne sur le PC de la maison) ; journal du 01/11/26, 19h16 : il disait seulement « Home Assistant ne répond pas ».
export const HA_MUET = "Home Assistant ne répond pas : l'ordinateur de la maison est sans doute éteint (il doit être allumé pour que je commande les appareils).";
const HA_INJOIGNABLE = "Impossible de joindre la maison : l'ordinateur de la maison est peut-être éteint (il doit être allumé), ou Tailscale n'est pas allumé sur cet appareil.";
// Journal du 07/11/26, 09h20 → 11/11 : Home Assistant injoignable des jours entiers alors que le PC de la maison répondait
// (relais Claude vivant) : c'est sa machine virtuelle qui n'était pas démarrée, pas l'ordinateur qui était éteint.
export const HA_VM = "Home Assistant ne répond pas, alors que l'ordinateur de la maison est allumé : c'est sans doute sa machine virtuelle (Home Assistant) qui n'est pas démarrée sur l'ordinateur.";
// Journal du 06/11/26, 08h26:33 : une lumière n'a pas répondu en 15 s (« signal is aborted without reason ») alors que les
// autres répondaient en 1 à 4 s, et Wilson a dit « l'ordinateur de la maison est sans doute éteint ».
const HA_LENT = "Home Assistant a mis trop de temps à répondre pour cet appareil (il répond pour les autres) : la commande est peut-être passée quand même.";
const SERVICE_MS = 25000;
const netErr = (e) => !navigator.onLine || (e && e.name === 'TypeError') || /Failed to fetch|NetworkError|Load failed/i.test(String((e && e.message) || ''));
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function cleanUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }

// Les refus de la voiture, en français (messages du module MG iSMART).
export function motVoiture(detail) {
  const d = String(detail || '');
  if (/key is detected inside/i.test(d)) return "la voiture refuse : elle détecte la clé à l'intérieur. Il faut sortir la clé de la voiture, puis redemander.";
  if (/\b401\b|logged out|token|authenticat/i.test(d)) return "le lien avec la voiture est coupé pour un quart d'heure (l'appli MG a été ouverte sur le téléphone) : redemande dans un moment.";
  if (/door|porte/i.test(d)) return 'la voiture refuse : une porte est ouverte.';
  if (/battery|soc|power/i.test(d)) return 'la voiture refuse : sa batterie est trop faible.';
  return `la voiture a refusé (${d.replace(/return code: \d+, message: /, '').slice(0, 120) || 'sans raison donnée'}).`;
}

export class Maison {
  // pcVivant : () => Promise<bool>, l'ordinateur de la maison répond-il (relais Claude) ? Pour dire la vraie panne.
  constructor({ settings, log = () => {}, pcVivant = async () => false }) { this.settings = settings; this.log = log; this.pcVivant = pcVivant; this.inv = null; this.invAt = 0; this._blink = null; this.okAt = 0; }
  get url() { return cleanUrl(this.settings.haUrl); }
  get token() { return String(this.settings.haToken || '').trim(); }
  get on() { return !!(this.url && this.token); }

  async _fetch(path, { method = 'GET', body, signal, text = false, ms = TIMEOUT_MS } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
    try {
      const r = await fetch(this.url + path, { method, signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = text ? await r.text() : await r.json(); } catch (_) {}
      if (r.ok) this.okAt = Date.now();
      return { status: r.status, ok: r.ok, json: j };
    } finally { clearTimeout(t); }
  }
  _service(domain, service, data, signal) { return this._fetch(`/api/services/${domain}/${service}`, { method: 'POST', body: data, signal, ms: SERVICE_MS }); }
  // La phrase qui dit la vraie panne : appareil lent (les autres répondent), machine virtuelle arrêtée (le PC répond), ou PC éteint.
  async diag(err) {
    if (err && (err.status === 401 || err.status === 403)) return "Home Assistant refuse le jeton d'accès : il faut en recréer un et le recoller dans les réglages.";
    if (err && err.name === 'AbortError' && Date.now() - this.okAt < 120000) return HA_LENT;   // trop long, mais il répond pour les autres
    let pc = false;
    try { pc = await Promise.race([Promise.resolve(this.pcVivant()), new Promise((ok) => setTimeout(() => ok(false), 6000))]); } catch (_) {}
    if (pc) return HA_VM;
    return netErr(err) ? HA_INJOIGNABLE : HA_MUET;
  }

  // ---------- La voiture répond-elle ? ----------
  // La voiture refuse parfois (11/11/26, 11h09:31 : « The key is detected inside the vehicle ») ou le module est déconnecté
  // (11h10:45 : appli MG ouverte sur le téléphone) : le module le dit par son entité « command error ». On la guette 80 s.
  async suiviVoiture(depuis, { chauffage = false, signal } = {}) {
    const all = await this._fetch('/api/states', { signal });
    if (!all.ok || !Array.isArray(all.json)) return null;
    const err = all.json.find((x) => /^event\..*command_error$/.test(x.entity_id)), clim = all.json.find((x) => /^sensor\..*remote_climate_state$/.test(x.entity_id));
    for (let i = 0; i < 10; i++) {
      await sleep(i ? 8000 : 4000);
      if (err) {
        const x = await this._etatDe(err.entity_id, signal).catch(() => null), t = x && Date.parse(x.state);
        if (t && t >= depuis) return { ok: false, texte: motVoiture((x.attributes || {}).detail) };
      }
      if (chauffage && clim) { const c = await this._etatDe(clim.entity_id, signal).catch(() => null); if (c && c.state && !/^(off|unknown|unavailable)$/.test(c.state)) return { ok: true, texte: 'la voiture confirme : le chauffage est en route.' }; }
    }
    return null;
  }

  // ---------- Inventaire ----------
  // Appareils pilotables : états (/api/states) + pièce et « caché » (un modèle de Home Assistant). Les interrupteurs de
  // réglage (LED, arrêt automatique, mise à jour) et les prises cachées (devenues des lumières) sont écartés.
  async rafraichir(signal) {
    if (!this.on) return null;
    const [st, tp] = await Promise.all([this._fetch('/api/states', { signal }),
      this._fetch('/api/template', { method: 'POST', signal, text: true, body: { template:
        "{% set cast = integration_entities('cast') %}{% for s in states if s.domain in ['light','switch','media_player','remote','script','scene','cover','fan','input_boolean','climate'] %}{{ s.entity_id }}|{{ area_name(s.entity_id) or '' }}|{{ is_hidden_entity(s.entity_id) }}|{{ s.entity_id in cast }}\n{% endfor %}" } })]);
    if (!st.ok || !Array.isArray(st.json)) throw Object.assign(new Error('états illisibles (' + st.status + ')'), { status: st.status });
    // Unité des températures de Home Assistant (11/11/26 : il était réglé en °F, la consigne de la voiture affichait « 72 »).
    if (!this.unitesAt || Date.now() - this.unitesAt > 3600000) {
      const c = await this._fetch('/api/config', { signal }).catch(() => null);
      if (c && c.ok && c.json) { this.uniteF = /F/.test(((c.json.unit_system || {}).temperature) || ''); this.unitesAt = Date.now(); }
    }
    const meta = {};
    for (const l of String(tp.json || '').split('\n')) { const [id, piece, cache, cast] = l.split('|'); if (id) meta[id.trim()] = { piece: (piece || '').trim(), cache: /true/i.test(cache || ''), cast: /true/i.test(cast || '') }; }
    this.inv = st.json.filter((e) => {
      const d = e.entity_id.split('.')[0], m = meta[e.entity_id] || {}, nom = (e.attributes || {}).friendly_name || '';
      if (!TYPE[d] || m.cache) return false;
      if (d === 'switch' && /led|automatique|mise a jour|mise à jour|verrou|child/i.test(nom)) return false;
      if (d === 'switch' && /\bcharging\b|find my car|gateway/i.test(nom)) return false;   // voiture (MG iSMART) : jamais couper la charge ni klaxonner par erreur (« éteins tout »)
      return true;
    }).map((e) => ({ id: e.entity_id, domaine: e.entity_id.split('.')[0], nom: (e.attributes || {}).friendly_name || e.entity_id, piece: (meta[e.entity_id] || {}).piece || '', cast: !!(meta[e.entity_id] || {}).cast, etat: e.state, a: e.attributes || {} }));
    this.invAt = Date.now();
    return this.inv;
  }
  async _inv(signal, maxAge = 60000) { if (!this.inv || Date.now() - this.invAt > maxAge) await this.rafraichir(signal); return this.inv || []; }

  // Températures : Wilson parle en °C ; Home Assistant peut être réglé en °F.
  // e : une entité dont les bornes sont encore en °F alors que Home Assistant est passé en °C (11/11/26, 11h09 : bornes 61 à 82
  // gardées après le changement d'unité ; Home Assistant attendait pourtant des °C).
  _enC(t, e) { const f = this.uniteF || !!(e && e.domaine === 'climate' && e.a.min_temp > 40); return t == null ? t : f ? Math.round((t - 32) / 1.8) : t; }
  _voiture(e) { return /voiture/.test(norm(`${e.nom} ${e.id}`)); }
  _versHA(c) { return this.uniteF ? Math.round(c * 1.8 + 32) : c; }
  _decrire(e, detail = false) {
    const a = e.a, bits = [ETAT[e.etat] || e.etat];
    if (e.domaine === 'light' && e.etat === 'on' && a.brightness != null) bits.push(`luminosité ${Math.round(a.brightness / 2.55)} %`);
    if (e.domaine === 'media_player') {
      if (a.volume_level != null) bits.push(`volume ${Math.round(a.volume_level * 100)} %${a.is_volume_muted ? ' (muet)' : ''}`);
      if (a.app_name) bits.push(`appli ${a.app_name}`);
      if (a.media_title) bits.push(`joue « ${String(a.media_title).slice(0, 60)} »`);
      if (detail && a.source) bits.push(`entrée ${a.source}`);
    }
    if (e.domaine === 'remote' && a.current_activity) bits.push(`appli ${a.current_activity}`);
    if (e.domaine === 'climate') {
      if (a.temperature != null) bits.push(`réglé à ${this._enC(a.temperature, e)} °C`);
      if (a.current_temperature != null) bits.push(`il fait ${this._enC(a.current_temperature, e)} °C dedans`);
    }
    return bits.join(', ');
  }
  _possible(e) {
    if (e.domaine === 'light') return e.a.supported_color_modes && !e.a.supported_color_modes.every((m) => m === 'onoff') ? 'allumer, éteindre, luminosité' : 'allumer, éteindre';
    if (e.domaine === 'media_player') {
      const f = e.a.supported_features || 0;
      return ['allumer, éteindre, volume, lecture, pause', e.cast && f & PLAY_MEDIA ? 'radio' : '', !e.cast && /tele|tv/.test(norm(e.nom)) ? 'appli' : ''].filter(Boolean).join(', ');
    }
    if (e.domaine === 'script' || e.domaine === 'scene') return 'allumer (lance)';
    if (e.domaine === 'remote') return 'appli';
    if (e.domaine === 'climate') return `${this._voiture(e) ? 'allumer (sans valeur : à fond + dégivrages)' : 'allumer'}, éteindre, temperature (${e.a.min_temp != null ? this._enC(e.a.min_temp, e) + ' à ' + this._enC(e.a.max_temp, e) + ' °C' : 'en °C'})`;
    return 'allumer, éteindre';
  }
  // Pour la consigne de Wilson : une ligne par appareil.
  texteInventaire() {
    if (!this.inv || !this.inv.length) return '';
    return this.inv.filter((e) => e.domaine !== 'remote' && !/^script\.reveil/.test(e.id)).map((e) => `- ${e.nom} [${e.id}] : ${TYPE[e.domaine]}${e.piece ? ', ' + e.piece : ''} ; ${this._possible(e)} ; actuellement ${this._decrire(e)}`).join('\n');
  }

  _trouver(inv, q) {
    const s = String(q || '').trim(); if (!s) return null;
    const exact = inv.find((e) => e.id === s); if (exact) return exact;
    const n = norm(s.replace(/^[a-z_]+\./, (m) => (inv.some((e) => e.id.startsWith(m)) ? '' : m)));
    return inv.find((e) => norm(e.nom) === n) || inv.find((e) => norm(e.nom).includes(n) || n.includes(norm(e.nom))) || null;
  }

  // Ce qu'on affiche pendant l'action (E1) : « Grande lumière salon : j'allume… ».
  enCours({ appareil, action, valeur } = {}) {
    const e = this.inv && this._trouver(this.inv, appareil), nom = e ? e.nom : String(appareil || '').replace(/^[a-z_]+\./, '').replace(/_/g, ' ');
    const v = String(valeur || '').trim();
    const VERBE = { allumer: "j'allume", eteindre: "j'éteins", basculer: 'je bascule', luminosite: `luminosité ${v || '50'} %`, volume: `volume ${v || '30'} %`,
      volume_plus: 'je monte le son', volume_moins: 'je baisse le son', muet: 'je coupe le son', son: 'je remets le son', lecture: 'lecture', pause: 'pause',
      stop: 'stop', suivant: 'suivant', precedent: 'précédent', appli: `j'ouvre ${v}`, radio: `je mets ${v}`, source: `entrée ${v}`, clignoter: 'je fais clignoter' };
    return `${nom} : ${VERBE[action] || action}…`;
  }

  // ---------- Outils ----------
  async etat(appareils = [], signal) {
    const inv = await this._inv(signal, 3000);
    const l = (appareils && appareils.length ? appareils.map((q) => this._trouver(inv, q)).filter(Boolean) : inv.filter((e) => e.domaine !== 'remote' && e.domaine !== 'script'));
    if (!l.length) return 'Aucun appareil ne correspond. Appareils : ' + inv.map((e) => e.nom).join(', ');
    return l.map((e) => `${e.nom}${e.piece ? ' (' + e.piece + ')' : ''} : ${this._decrire(e, true)}`).join(' ; ');
  }

  // { appareil, action, valeur } → { ok, info } (info : pour Gemini, qui le dit à sa façon).
  async commande({ appareil, action, valeur = '' }, signal) {
    if (!this.on) return { ok: false, info: "La maison n'est pas reliée (adresse ou jeton manquant dans les réglages)." };
    const t0 = performance.now();
    try {
      const inv = await this._inv(signal);
      const e = this._trouver(inv, appareil);
      if (!e) return { ok: false, info: `Appareil « ${appareil} » introuvable. Appareils : ${inv.filter((x) => x.domaine !== 'remote').map((x) => `${x.nom} [${x.id}]`).join(', ')}. Choisis le bon, ou demande-lui lequel si c'est ambigu.` };
      const r = await this._agir(e, action, String(valeur || '').trim(), inv, signal);
      this.log(`Maison : ${action}${valeur ? ' « ' + valeur + ' »' : ''} → ${e.nom} : ${r.ok ? 'ok' : 'échec'} — ${r.info} (${((performance.now() - t0) / 1000).toFixed(1)} s)`, true);
      return r;
    } catch (err) {
      if (err.name === 'AbortError' && signal && signal.aborted) throw err;
      this.log('Maison : ' + (err.message || err.name));
      return { ok: false, info: await this.diag(err) };
    }
  }

  // Journal du 05/11/26, 20h18:52 : « allumer → Lumière jaune salon : ok — Lumière jaune salon : éteint » (Gemini avait
  // envoyé « allumer » et « éteindre » en même temps). Une lumière ou une prise qui n'est pas dans l'état demandé après la
  // commande : échec, dit tel quel (jamais « c'est allumé » quand c'est éteint).
  // Journal du 11/11/26 (18h44:47, 20h58:53, 21h16:55, 21h18:22 ; remarques de Timothée de 20h59:35 et 21h00:45) : « allumer →
  // ok — éteint » revenait encore : l'inventaire range l'état dans `etat`, la vérification lisait `state` (toujours vide).
  _verifie(e, allume, info) {
    if (e.domaine !== 'light' && e.domaine !== 'switch') return { ok: true, info };
    const n = (this.inv || []).find((x) => x.id === e.id), st = n && n.etat;
    if (!st || st === 'unavailable' || st === 'unknown') return { ok: true, info };
    if (allume ? st === 'off' : st === 'on') return { ok: false, info: `${info} (commande envoyée, mais Home Assistant indique que ${e.nom} est resté${allume ? ' éteint' : ' allumé'} : ne dis surtout pas que c'est fait ; dis-lui que ça n'a pas marché)` };
    return { ok: true, info };
  }

  async _agir(e, action, valeur, inv, signal) {
    const id = e.id, d = e.domaine, num = (v, def) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : def; };
    const svc = async (domain, service, data = {}) => {
      const r = await this._service(domain, service, { entity_id: data.entity_id || id, ...data }, signal);
      if (r.status === 401 || r.status === 403) { const er = new Error('jeton'); er.status = 401; throw er; }
      if (!r.ok) throw Object.assign(new Error(`Home Assistant a refusé (${r.status}${r.json && r.json.message ? ' : ' + r.json.message : ''})`), { refus: true });
      return r;
    };
    const apres = async (cible = e, attendu) => {
      if (attendu && cible.domaine === 'media_player') await this._attendre(cible.id, (x) => attendu(x.state), 8000);   // une télé met quelques secondes
      else if (attendu && (cible.domaine === 'light' || cible.domaine === 'switch')) { await sleep(400); await this._attendre(cible.id, (x) => attendu(x.state), 3500); }   // une prise Wi-Fi met parfois 2-3 s à dire son nouvel état
      else await sleep(900);
      await this.rafraichir(signal).catch(() => {}); const n = (this.inv || []).find((x) => x.id === cible.id) || cible; return `${n.nom} : ${this._decrire(n, true)}`;
    };
    const onoff = ['light', 'switch', 'media_player', 'fan', 'input_boolean', 'remote'].includes(d) ? d : null;
    // Remarque de Timothée du 11/11/26, 21h02:14 (« tu l'as fait clignoter et ça l'a fait bugger ») : une autre commande sur
    // l'appareil qui clignote arrête le clignotement, sans le remettre ensuite dans son état de départ.
    if (this._blink && this._blink.id === id && action !== 'clignoter') { this._blink.stop = this._blink.annule = true; this._blink = null; }
    // Prise ou lumière « injoignable » (journal du 30/10/26 : la prise du balcon ne répondait plus) : on relance sa
    // liaison dans Home Assistant, une fois, avant de dire qu'elle ne répond pas.
    if ((d === 'light' || d === 'switch') && action !== 'clignoter') {
      const x = await this._etatDe(id).catch(() => null);
      if (x && x.state === 'unavailable' && !(await this._relancer(e))) return { ok: false, info: `${e.nom} ne répond pas : la prise a sans doute perdu le Wi-Fi. Il faut la débrancher puis la rebrancher ; si ça revient souvent, elle est trop loin de la box.` };
    }
    try {
      // Chauffage ou clim (la voiture par le module MG iSMART de Home Assistant, demande du 11/11/26) : la commande part vers
      // la voiture, qui met jusqu'à une minute à répondre ; l'appli guette ensuite sa réponse (suiviVoiture) et la dit.
      const voiture = this._voiture(e), suite = voiture ? ' La voiture met jusqu\'à une minute ; je te dirai si elle refuse.' : '';
      if (d === 'climate' && ['allumer', 'eteindre', 'basculer', 'temperature'].includes(action)) {
        const modes = e.a.hvac_modes || [], marche = ['auto', 'heat_cool', 'heat', 'cool'].find((m) => modes.includes(m)) || 'auto';
        const lo = e.a.min_temp != null ? this._enC(e.a.min_temp, e) : 16, hi = e.a.max_temp != null ? this._enC(e.a.max_temp, e) : 30;
        const t = num(valeur, NaN);
        const degivrages = voiture ? inv.filter((x) => x.domaine === 'switch' && this._voiture(x) && /degivr/.test(norm(x.nom + ' ' + x.id))) : [];
        const tous = async (svcNom) => { const faits = []; for (const x of degivrages) { await sleep(1500); await svc('switch', svcNom, { entity_id: x.id }); faits.push(x.nom); } return faits; };
        if (action === 'eteindre' || (action === 'basculer' && e.etat !== 'off')) {
          await svc('climate', 'set_hvac_mode', { hvac_mode: 'off' });
          const f = await tous('turn_off');
          return { ok: true, voiture, info: `${e.nom} : arrêt demandé${f.length ? ` (et ${f.join(', ')})` : ''}.${suite}` };
        }
        // Règle de Timothée du 11/11/26, 11h13 : « le matin, quand je lui dis fais chauffer la voiture, il faut mettre le
        // chauffage à fond et lancer les dégivrages, le reste je m'en fous » : allumer sans température = à fond + dégivrages.
        if (voiture && action !== 'temperature' && !Number.isFinite(t)) {
          await svc('climate', 'set_temperature', { temperature: this._versHA(hi), hvac_mode: marche });
          const f = await tous('turn_on');
          return { ok: true, voiture, info: `${e.nom} : à fond (${hi} °C) demandé${f.length ? `, ainsi que ${f.join(' et ')}` : ''}.${suite}` };
        }
        if (Number.isFinite(t)) {
          const c = Math.max(lo, Math.min(hi, Math.round(t)));
          await svc('climate', 'set_temperature', { temperature: this._versHA(c), hvac_mode: marche });
          return { ok: true, voiture, info: `${e.nom} : mise en marche demandée, à ${c} °C${c !== Math.round(t) ? ` (${lo} à ${hi} °C possibles)` : ''}.${suite}` };
        }
        if (action === 'temperature') return { ok: false, info: 'Il manque la température : demande-lui combien de degrés.' };
        await svc('climate', 'set_hvac_mode', { hvac_mode: marche });
        return { ok: true, voiture, info: `${e.nom} : mise en marche demandée${e.a.temperature != null ? `, à ${this._enC(e.a.temperature, e)} °C` : ''}.${suite}` };
      }
      // Interrupteur de la voiture (dégivrage) : l'état ne change qu'au retour de la voiture (11/11/26, 11h10 : « allumé »
      // annoncé, puis « éteint » affiché tout de suite) → « demandé », et la réponse de la voiture suivra.
      if (voiture && d === 'switch' && ['allumer', 'eteindre'].includes(action)) {
        await svc('switch', action === 'allumer' ? 'turn_on' : 'turn_off');
        return { ok: true, voiture, info: `${e.nom} : ${action === 'allumer' ? 'mise en marche demandée' : 'arrêt demandé'}.${suite}` };
      }
      switch (action) {
        case 'allumer':
          if (d === 'script' || d === 'scene') { await svc(d, 'turn_on'); return { ok: true, info: `${e.nom} lancé.` }; }
          if ((d === 'media_player' || d === 'remote') && !(await this._reveiller(e, inv, svc))) return { ok: false, info: this.TELE_COUPEE };
          if (d === 'cover') { await svc('cover', 'open_cover'); return { ok: true, info: await apres() }; }
          await svc(onoff || 'homeassistant', 'turn_on'); return this._verifie(e, true, await apres(e, (x) => x !== 'off' && x !== 'unavailable'));
        case 'eteindre':
          if (d === 'cover') { await svc('cover', 'close_cover'); return { ok: true, info: await apres() }; }
          if (d === 'script') { await svc('script', 'turn_off'); return { ok: true, info: `${e.nom} arrêté.` }; }
          await svc(onoff || 'homeassistant', 'turn_off'); return this._verifie(e, false, await apres(e, (x) => x === 'off' || x === 'standby'));
        case 'basculer': await svc(onoff || 'homeassistant', 'toggle'); return { ok: true, info: await apres() };
        case 'luminosite':
          if (d !== 'light') return { ok: false, info: `${e.nom} n'est pas une lumière.` };
          if (e.a.supported_color_modes && e.a.supported_color_modes.every((m) => m === 'onoff')) return { ok: false, info: `${e.nom} est branchée sur une prise : on peut seulement l'allumer ou l'éteindre, pas régler sa luminosité.` };
          await svc('light', 'turn_on', { brightness_pct: Math.max(1, Math.min(100, Math.round(num(valeur, 50)))) }); return { ok: true, info: await apres() };
        case 'volume':
          if (d !== 'media_player') return { ok: false, info: `${e.nom} n'a pas de volume.` };
          await svc('media_player', 'volume_set', { volume_level: Math.max(0, Math.min(100, num(valeur, 30))) / 100 }); return { ok: true, info: await apres() };
        case 'volume_plus': case 'volume_moins': {
          if (d !== 'media_player') return { ok: false, info: `${e.nom} n'a pas de volume.` };
          const n = Math.max(1, Math.min(10, Math.round(num(valeur, 2))));
          for (let i = 0; i < n; i++) { await svc('media_player', action === 'volume_plus' ? 'volume_up' : 'volume_down'); await sleep(250); }
          return { ok: true, info: await apres() };
        }
        case 'muet': case 'son': await svc('media_player', 'volume_mute', { is_volume_muted: action === 'muet' }); return { ok: true, info: await apres() };
        case 'lecture': await svc('media_player', 'media_play'); return { ok: true, info: await apres() };
        case 'pause': await svc('media_player', 'media_pause'); return { ok: true, info: await apres() };
        case 'stop': await svc('media_player', 'media_stop'); return { ok: true, info: await apres() };
        case 'suivant': await svc('media_player', 'media_next_track'); return { ok: true, info: await apres() };
        case 'precedent': await svc('media_player', 'media_previous_track'); return { ok: true, info: await apres() };
        case 'source': await svc('media_player', 'select_source', { source: valeur }); return { ok: true, info: await apres() };
        case 'appli': return await this._appli(e, valeur, inv, svc);
        case 'radio': return await this._radio(e, valeur, inv, svc, apres);
        case 'clignoter': return this._clignoter(e, Math.max(1, Math.min(15, Math.round(num(valeur, 5)))));
        default: return { ok: false, info: `Action « ${action} » inconnue.` };
      }
    } catch (err) {
      if (err.refus) return { ok: false, info: err.message + '. Cette action n\'est sans doute pas possible sur cet appareil.' };
      throw err;
    }
  }

  // Appli sur la télé : la télécommande Android TV ouvre le lien de l'appli ; on vérifie que l'appli est bien à l'écran.
  async _appli(e, valeur, inv, svc) {
    const v = norm(valeur);
    const app = APPLIS.find(([re]) => re.test(v));
    const remote = e.domaine === 'remote' ? e : inv.find((x) => x.domaine === 'remote' && (!e.piece || x.piece === e.piece)) || inv.find((x) => x.domaine === 'remote');
    if (!app) return { ok: false, info: `L'appli « ${valeur} » n'est pas installée sur la télé, ou je ne sais pas l'ouvrir. Applis possibles : ${APPLIS.map((x) => x[3]).join(', ')}.` };
    if (!remote) return { ok: false, info: 'Je ne trouve pas la télécommande de la télé dans Home Assistant.' };
    if (!(await this._reveiller(remote, inv, svc))) return { ok: false, info: this.TELE_COUPEE };
    let r = await this._etatDe(remote.id);
    if (!r || r.state !== 'on') {                                                    // télé éteinte : on l'allume, puis on attend qu'elle réponde
      await svc('remote', 'turn_on', { entity_id: remote.id });
      r = await this._attendre(remote.id, (x) => x.state === 'on', 15000);
      if (!r || r.state !== 'on') return { ok: false, info: "La télé ne s'est pas allumée à temps : réessaie dans quelques secondes." };
      await sleep(3000);                                                             // elle vient de démarrer : laisser l'accueil s'afficher
    }
    await svc('remote', 'turn_on', { entity_id: remote.id, activity: app[1] });
    const fin = await this._attendre(remote.id, (x) => (x.attributes || {}).current_activity === app[2], 8000);
    if (fin && (fin.attributes || {}).current_activity === app[2]) return { ok: true, info: `${app[3]} est ouvert sur la télé.` };
    const vu = fin && (fin.attributes || {}).current_activity;
    if (vu && vu !== app[2] && !/launcher/.test(vu)) await svc('remote', 'send_command', { entity_id: remote.id, command: 'HOME' }).catch(() => {});
    return { ok: false, info: `La télé n'a pas ouvert ${app[3]} (écran actuel : ${vu || 'inconnu'}).` };
  }
  // Télé en veille profonde (réseau coupé, « injoignable ») : réveil par le réseau (script « Réveil télé » de Home Assistant,
  // paquet Wake-on-LAN), puis on attend qu'elle réponde. false si elle reste injoignable.
  get TELE_COUPEE() { return "La télé est en veille profonde, coupée du réseau : je ne peux pas l'allumer. Dis-lui de l'allumer à la télécommande ; pour que je puisse le faire la prochaine fois, il faut activer « Démarrage à distance » dans les réglages réseau de la télé."; }
  async _reveiller(e, inv, svc) {
    const x = await this._etatDe(e.id).catch(() => null);
    if (x && x.state !== 'unavailable') return true;
    const sc = inv.find((y) => y.domaine === 'script' && /^script\.reveil/.test(y.id));
    if (!sc) return false;
    this.log(`Maison : ${e.nom} injoignable → ${sc.nom}`);
    await svc('script', 'turn_on', { entity_id: sc.id }).catch(() => {});
    const r = await this._attendre(e.id, (y) => y.state !== 'unavailable', 25000);
    return !!(r && r.state !== 'unavailable');
  }
  async _relancer(e) {
    const t = await this._fetch('/api/template', { method: 'POST', text: true, body: { template:
      `{% set l = namespace(v=[]) %}{% for x in device_entities(device_id('${e.id}')) or [] %}{% set c = config_entry_id(x) %}{% if c and c not in l.v %}{% set l.v = l.v + [c] %}{% endif %}{% endfor %}{{ l.v | join(',') }}` } }).catch(() => null);
    const ids = String((t && t.json) || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.length) return false;
    this.log(`Maison : ${e.nom} injoignable → je relance sa liaison`);
    for (const c of ids) await this._fetch(`/api/config/config_entries/entry/${c}/reload`, { method: 'POST' }).catch(() => {});
    const r = await this._attendre(e.id, (y) => y.state !== 'unavailable', 12000);
    return !!(r && r.state !== 'unavailable');
  }
  async _etatDe(id, signal) { const r = await this._fetch('/api/states/' + id, { signal }); return r.ok ? r.json : null; }
  async _attendre(id, cond, ms) {
    const fin = Date.now() + ms; let x = null;
    while (Date.now() < fin) { x = await this._etatDe(id).catch(() => null); if (x && cond(x)) return x; await sleep(700); }
    return x;
  }

  // Radio : Radio Browser (annuaire libre et gratuit) → flux diffusé sur un lecteur qui sait jouer un lien (enceinte, Chromecast).
  async _radio(e, valeur, inv, svc, apres) {
    if (!valeur) return { ok: false, info: 'Quelle radio ? (demande-lui le nom de la station)' };
    let cible = e;
    const lit = (x) => x.domaine === 'media_player' && x.cast && ((x.a.supported_features || 0) & PLAY_MEDIA);   // Chromecast / Google Home
    if (!lit(e)) {
      const lecteurs = inv.filter(lit);
      cible = lecteurs.find((x) => /tele|tv|chromecast/i.test(norm(x.nom)) && /tele|tv/.test(norm(e.nom))) || lecteurs.find((x) => !e.piece || x.piece === e.piece) || lecteurs[0];
      if (!cible) return { ok: false, info: 'Aucun appareil de la maison ne peut diffuser la radio.' };
    }
    const q = encodeURIComponent(valeur.replace(/^radio\s+/i, ''));
    const r = await fetch(`https://all.api.radio-browser.info/json/stations/search?name=${q}&limit=12&hidebroken=true&order=clickcount&reverse=true`);
    const l = r.ok ? await r.json() : [];
    const ok = l.filter((s) => s.url_resolved && /^https?:/.test(s.url_resolved));
    const score = (s) => (s.countrycode === 'FR' ? 4 : 0) + (/^https:/.test(s.url_resolved) ? 2 : 0) + (/mp3|aac/i.test(s.codec) ? 2 : 0) - (/m3u8/.test(s.url_resolved) ? 3 : 0);
    const st = ok.sort((a, b) => score(b) - score(a))[0];
    if (!st) return { ok: false, info: `Station « ${valeur} » introuvable. Demande-lui de préciser le nom.` };
    await svc('media_player', 'play_media', { entity_id: cible.id, media_content_id: st.url_resolved, media_content_type: 'music' });
    return { ok: true, info: `${st.name.trim()} sur ${cible.nom}. ${await apres(cible)}` };
  }

  // Clignoter : bascule n fois (1 s), puis remet l'état de départ. En arrière-plan : la réponse part tout de suite.
  // Journal du 11/11/26, 20h59-21h02 : l'éclairage du balcon (prise Wi-Fi) n'a pas clignoté, puis ne répondait plus à temps ;
  // l'état de départ venait de l'inventaire (parfois en retard). Désormais : état relu juste avant, une prise (switch) bascule
  // toutes les 2 s et 3 fois au plus, et le retour à l'état de départ est vérifié (une fois de plus s'il le faut).
  _clignoter(e, n) {
    if (!['light', 'switch'].includes(e.domaine)) return { ok: false, info: `${e.nom} ne peut pas clignoter.` };
    if (this._blink) this._blink.stop = true;
    const prise = e.domaine === 'switch', pas = prise ? 2000 : 1000; if (prise) n = Math.min(n, 3);
    const job = { stop: false, id: e.id }; this._blink = job;
    (async () => {
      const x = await this._etatDe(e.id).catch(() => null);
      const depart = x && (x.state === 'on' || x.state === 'off') ? x.state : e.etat;
      for (let i = 0; i < n * 2 && !job.stop; i++) { await this._service(e.domaine, 'toggle', { entity_id: e.id }).catch(() => {}); await sleep(pas); }
      if (job.annule) return;                                                   // une autre commande a pris la main
      const remettre = () => this._service(e.domaine, depart === 'on' ? 'turn_on' : 'turn_off', { entity_id: e.id }).catch(() => {});
      await remettre();
      const y = await this._attendre(e.id, (z) => z.state === depart, 3000);
      if (!job.annule && y && y.state !== depart && y.state !== 'unavailable') { await remettre(); if (this.log) this.log(`Maison : ${e.nom} pas revenu ${depart === 'on' ? 'allumé' : 'éteint'} après le clignotement : commande renvoyée`); }
      if (this._blink === job) this._blink = null;
    })();
    return { ok: true, info: `${e.nom} clignote ${n} fois, puis revient comme avant.` };
  }

  // ---------- Voie simple (mode économique) : la phrase à l'assistant de Home Assistant ----------
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
        const raccourci = await this._raccourci(demande, signal).catch(() => null);      // « lance Netflix »
        if (raccourci) return raccourci;
        const code = (res.data || {}).code || '';
        const appareils = await this.appareils(signal).catch(() => '');
        if (/no_valid_targets|no_intent_match/.test(code)) return { ok: false, dire: `Home Assistant n'a pas compris : « ${speech || 'demande inconnue'} ». Redis-le avec le nom exact de l'appareil.`, appareils };
        return { ok: false, dire: speech || 'Home Assistant a rencontré une erreur.', appareils };
      }
      return { ok: true, dire: speech || 'C\'est fait.' };
    } catch (e) {
      if (e.name === 'AbortError' && signal && signal.aborted) throw e;
      this.log('Maison : ' + (e.message || e.name));
      return { ok: false, dire: await this.diag(e) };
    }
  }

  async _raccourci(demande, signal) {
    const d = ' ' + norm(demande) + ' ';
    if (/ (eteins|eteint|arrete|coupe|stop) /.test(d)) return null;
    const inv = await this._inv(signal);
    const app = APPLIS.find(([re]) => re.test(d)), remote = inv.find((x) => x.domaine === 'remote');
    const sc = inv.filter((x) => x.domaine === 'script' && norm(x.nom) && d.includes(' ' + norm(x.nom) + ' ')).sort((a, b) => norm(b.nom).length - norm(a.nom).length)[0];
    if (!sc && !(app && remote)) return null;
    const t = sc ? await this._service('script', 'turn_on', { entity_id: sc.id }, signal) : await this._service('remote', 'turn_on', { entity_id: remote.id, activity: app[1] }, signal);
    const nom = sc ? sc.nom : app[3];
    this.log(`Maison : « ${demande} » → raccourci ${nom} (${t.status})`, true);
    return t.ok ? { ok: true, dire: `C'est lancé : ${nom}.` } : { ok: false, dire: `Je n'ai pas pu lancer ${nom} (erreur ${t.status}).` };
  }

  async appareils(signal) {
    const inv = await this._inv(signal, 3000);
    return inv.filter((e) => e.domaine !== 'remote').slice(0, 40).map((e) => `${e.nom} : ${this._decrire(e)}`).join(' ; ');
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
      const inv = await this.rafraichir().catch(() => null);
      return { ok: true, msg: `Maison reliée ✓ (${(c.json && c.json.location_name) || 'Home Assistant'} ${(c.json && c.json.version) || ''}${inv ? `, ${inv.filter((e) => e.domaine !== 'remote' && e.domaine !== 'script').length} appareils` : ''})` };
    } catch (e) {
      return { ok: false, msg: netErr(e) ? "Impossible de joindre Home Assistant : Tailscale est-il allumé sur cet appareil ? L'adresse est-elle la bonne ?" : 'Pas de réponse de Home Assistant.' };
    }
  }
}
