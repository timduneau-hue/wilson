// Wilson — le CRM à la voix (PLAN.md, section 2 quater).
//  - Questions au CRM de Timothée par son script (actions « crm_… », relayées au CRM avec son jeton) : les réponses
//    viennent des fonctions du CRM lui-même (fiche, historique, agenda, bilan, articles).
//  - Fiches gardées pour la journée (préchargées en mode voiture) : réponse immédiate.
//  - Écritures (C2) : rien sans confirmation. crm_noter prépare et renvoie le texte exact à relire ; l'écriture n'est
//    débloquée que par un « oui » de Timothée entendu APRÈS la relecture, ou par un appui sur « Oui » à l'écran.
//    Tâche → directement dans le CRM ; compte rendu, rendez-vous, note → brouillon à valider dans le CRM.
//  - Appeler (C4) : bouton vert avec le numéro (une page web n'a pas le droit de lancer un appel seule).

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, premier: 1 };
const pad = (n) => String(n).padStart(2, '0');
const plat = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ]/g, "'");
export const frDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const jourDit = (d) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const CACHE_KEY = 'wilson.crm.cache', PENDING_MS = 5 * 60000, CACHE_MS = 6 * 3600000;

// « demain », « jeudi », « le 30 », « 30/10 », « 30 octobre », « dans 2 semaines »… → Date (minuit) ou null.
// futur : une date sans année déjà passée est prise l'an prochain (tâche, rendez-vous) ; sinon dans le passé (compte rendu).
export function parseJour(txt, now = new Date(), { futur = true } = {}) {
  const t = plat(txt).replace(/[,.;]/g, ' ').replace(/\s+/g, ' ').trim(), auj = minuit(now);
  if (!t) return null;
  if (/apres[- ]?demain/.test(t)) return plus(auj, 2);
  if (/avant[- ]?hier/.test(t)) return plus(auj, -2);
  if (/\bdemain\b/.test(t)) return plus(auj, 1);
  if (/\bhier\b/.test(t)) return plus(auj, -1);
  if (/aujourd'?hui|ce jour|ce matin|cet apres-midi|ce soir|tout a l'heure/.test(t)) return auj;
  let m = /dans (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze) (jours?|semaines?|mois)/.exec(t);
  if (m) {
    const n = +m[1] || NOMBRES[m[1]] || 1;
    if (/^jour/.test(m[2])) return plus(auj, n);
    if (/^semaine/.test(m[2])) return plus(auj, 7 * n);
    return new Date(auj.getFullYear(), auj.getMonth() + n, auj.getDate());
  }
  if (/semaine prochaine/.test(t) && !/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.test(t)) return plus(auj, ((8 - auj.getDay()) % 7) || 7);
  m = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/.exec(t);
  if (m) return quand(+m[1], +m[2], m[3], auj, futur);
  m = /\b(\d{1,2}|1er|premier)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/.exec(t);
  if (m) return quand(/^\d+$/.test(m[1]) ? +m[1] : 1, MOIS.indexOf(m[2]) + 1, m[3], auj, futur);
  m = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.exec(t);
  if (m) {
    const w = JOURS.indexOf(m[1]); let n = (w - auj.getDay() + 7) % 7;
    if (futur) { if (n === 0) n = 7; if (/(semaine prochaine|en huit)/.test(t) && n < 7) n += 7; }
    else { n = n === 0 ? 0 : n - 7; if (/dernier/.test(t) && n === 0) n = -7; }
    return plus(auj, n);
  }
  m = /\b(?:le\s+)?(\d{1,2}|1er|premier)\b/.exec(t);
  if (m && /\ble\b/.test(t)) {
    const j = /^\d+$/.test(m[1]) ? +m[1] : 1;
    let d = new Date(auj.getFullYear(), auj.getMonth(), j);
    if (d.getDate() !== j) return null;
    if (futur && d < auj) d = new Date(auj.getFullYear(), auj.getMonth() + 1, j);
    if (!futur && d > auj) d = new Date(auj.getFullYear(), auj.getMonth() - 1, j);
    return d;
  }
  return null;
}
function quand(j, mo, an, auj, futur) {
  let y = an ? (+an < 100 ? 2000 + +an : +an) : auj.getFullYear();
  let d = new Date(y, mo - 1, j);
  if (d.getDate() !== j || d.getMonth() !== mo - 1) return null;
  if (!an && futur && d < plus(auj, -7)) d = new Date(y + 1, mo - 1, j);
  if (!an && !futur && d > auj) d = new Date(y - 1, mo - 1, j);
  return d;
}

// « 10h », « 14 h 30 », « 9h00 », « midi », « 10 heures et demie » → « 10h00 », « 14h30 »… ('' si aucune heure)
export function parseHeure(txt) {
  const t = plat(txt);
  if (/\bmidi\b/.test(t)) return '12h' + (/et demie/.test(t) ? '30' : '00');
  const m = /\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?/.exec(t);
  if (!m || +m[1] > 23) return '';
  let mn = m[2] ? +m[2] : /et demie/.test(t) ? 30 : /et quart/.test(t) ? 15 : 0;
  if (mn > 59) return '';
  return `${pad(+m[1])}h${pad(mn)}`;
}

// Un « oui » clair, sans « non », « attends », « change »… (le verrou des écritures, C2).
const OUI = /\b(oui|ouais|ouai|yes|vas[- ]?y|go|confirme|confirmer|je confirme|c'?est bon|c'?est ca|d'?accord|ok|okay|valide|enregistre|enregistre[sz]?|parfait|exact|exactement|tout a fait|bien sur|allez|nickel|impeccable)\b/;
const NON = /\b(non|pas|attends?|annule|annuler|stop|change|changer|modifie|modifier|corrige|corriger|faux|erreur|plutot|mais)\b/;
export function estOui(txt) { const t = plat(txt); return OUI.test(t) && !NON.test(t); }

// Ressemblance de noms dits à voix haute (même méthode que le CRM, section 53) : pour retrouver une fiche gardée.
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'chez', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'snc', 'ets',
  'etablissements', 'etablissement', 'ste', 'societe', 'groupe', 'monsieur', 'madame', 'mr', 'mme', 'm', 'client', 'mon', 'ma']);
export function mots(s) { return plat(String(s || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((m) => m && !VIDES.has(m)); }
export function phon(m) {
  let s = plat(String(m || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]/g, '');
  if (!s || /^\d+$/.test(s)) return s;
  return s.replace(/ph/g, 'f').replace(/sch|ch|sh/g, 'S').replace(/qu|ck|q/g, 'k')
    .replace(/gu(?=[eiy])/g, 'G').replace(/g(?=[eiy])/g, 'j').replace(/G/g, 'g')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/z/g, 's').replace(/h/g, '')
    .replace(/eau|au/g, 'o').replace(/ou/g, 'U').replace(/oi/g, 'wa')
    .replace(/(ai|ei)(?=[^n]|$)/g, 'e').replace(/(et|er|ez)$/g, 'e')
    .replace(/(ain|ein|in|un|im)(?=[^aeiouU]|$)/g, 'I')
    .replace(/(an|en)(?=[^aeiouU]|$)|(am|em)(?=[bp])/g, 'A')
    .replace(/on(?=[^aeiouU]|$)|om(?=[bp])/g, 'O')
    .replace(/(.)\1+/g, '$1').replace(/([^A-Z])[estdxp]$/, '$1');
}
export function jw(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length; if (!la || !lb) return 0;
  const fen = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1), ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) for (let j = Math.max(0, i - fen); j < Math.min(lb, i + fen + 1); j++) { if (mb[j] || a[i] !== b[j]) continue; ma[i] = mb[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) { if (!ma[i]) continue; while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let p = 0; while (p < Math.min(4, la, lb) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}
export function sim(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  const pa = phon(a), pb = phon(b);
  if (a.length >= 3 && b.length >= 3 && pa && pa === pb) return 0.93;
  let s = jw(a, b);
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) s = Math.max(s, 0.86);
  return pa.length >= 4 && pb.length >= 4 ? Math.max(s, jw(pa, pb) * 0.93) : s;
}
// Ressemblance entre ce qui a été dit et un client (société, contacts, ville) : 0 à 1.
export function ressemblance(q, c) {
  const qm = mots(q); if (!qm.length) return 0;
  const noms = [...mots(c.societe), ...(c.noms || []).flatMap(mots)], ville = mots(c.ville);
  let tot = 0, pds = 0;
  for (const w of qm) {
    let best = 0;
    for (const t of noms) best = Math.max(best, sim(w, t));
    for (const t of ville) best = Math.max(best, sim(w, t) * 0.9);
    if (best < 0.78) best = 0;
    const poids = Math.min(1, Math.max(0.4, w.length / 4));
    tot += best * poids; pds += poids;
  }
  return pds ? tot / pds : 0;
}

export const CRM_TOOLS = [
  { name: 'crm_client', behavior: 'BLOCKING',
    description: "Tout ce que le CRM de Timothée sait d'un client (société ou contact, même mal prononcé, avec la ville si elle aide) : contacts et téléphones, prochain rendez-vous, dernières visites, comptes rendus, tâches, chiffre d'affaires (exercice, mois en cours, comparaison avec l'an dernier), commandes, devis, articles achetés, réachats en retard, achats chez les concurrents, articles à proposer. Avant de l'appeler, dis « Je regarde dans le CRM… ».",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'le nom de la société ou du contact, tel que Timothée l\'a dit' } }, required: ['client'] } },
  { name: 'crm_agenda', behavior: 'BLOCKING',
    description: "Rendez-vous et tâches d'un jour dans le CRM (« qui je vois aujourd'hui », « ma journée de demain », « jeudi »).",
    parameters: { type: 'OBJECT', properties: { jour: { type: 'STRING', description: "aujourd'hui, demain, un jour de la semaine ou une date" } } } },
  { name: 'crm_bilan', behavior: 'BLOCKING',
    description: "Chiffre d'affaires de Timothée tous clients confondus : exercice à ce jour, mois en cours, comparaison avec l'an dernier, clients actifs, plus gros écarts." },
  { name: 'crm_produit', behavior: 'BLOCKING',
    description: "Catalogue et ventes : quels clients achètent un fabricant ou un article (question qui_achete), ou référence, prix et disponibilité d'un article (question infos).",
    parameters: { type: 'OBJECT', properties: { produit: { type: 'STRING', description: 'fabricant, référence ou désignation' }, question: { type: 'STRING', enum: ['qui_achete', 'infos'] } }, required: ['produit'] } },
  { name: 'appeler', behavior: 'BLOCKING',
    description: "Appeler un client : affiche sur l'écran un grand bouton vert avec son numéro ; Timothée appuie dessus pour lancer l'appel.",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'la société ou le contact' }, contact: { type: 'STRING', description: 'la personne à appeler, si elle est précisée' } }, required: ['client'] } },
  { name: 'crm_noter', behavior: 'BLOCKING',
    description: "Prépare une écriture dans le CRM : tache (un rappel à une date), compte_rendu (visite ou appel), rdv (prochain rendez-vous avec date et heure), note. RIEN n'est écrit : l'outil renvoie la phrase exacte à relire à Timothée. N'appelle crm_confirmer qu'après son « oui ».",
    parameters: { type: 'OBJECT', properties: {
      type: { type: 'STRING', enum: ['tache', 'compte_rendu', 'rdv', 'note'] },
      client: { type: 'STRING', description: 'le client concerné (vide pour une tâche personnelle)' },
      texte: { type: 'STRING', description: 'ce qu\'il a dit, mis au propre sans rien ajouter (vide pour un simple rendez-vous)' },
      date: { type: 'STRING', description: "tel qu'il l'a dit : « demain », « jeudi », « le 30 », « 30/10 »… (tâche : jour du rappel ; compte rendu : jour de l'échange, vide = aujourd'hui ; rdv : jour du rendez-vous)" },
      heure: { type: 'STRING', description: 'rendez-vous : « 10h00 »' },
      echange: { type: 'STRING', enum: ['visite', 'appel'], description: 'compte rendu : visite ou appel' } },
      required: ['type'] } },
  { name: 'crm_confirmer', behavior: 'BLOCKING',
    description: "Enregistre ce que crm_noter a préparé. À appeler SEULEMENT après un « oui » clair de Timothée à ta relecture ; s'il corrige, rappelle crm_noter." },
];
export const CRM_TOOL_NAMES = CRM_TOOLS.map((t) => t.name);

export class Crm {
  constructor(app) {
    this.app = app; this.cache = new Map(); this.pending = null; this.last = null; this.journee = null;
    this.state = ''; this.etat = null; this.call = null;
    this._load();
  }
  get on() { return !!this.app.settings.crm && this.app.remote.on; }
  log(m, priv) { this.app.log('CRM : ' + m, priv); }

  async ask(payload, signal) {
    const t0 = performance.now();
    const r = await this.app.remote.ask(payload, signal);
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    if (!r || r.ok === false) { this.state = 'refus : ' + ((r && r.erreur) || 'réponse vide'); this.log(`${payload.action} refusé en ${s} s : ${(r && r.erreur) || 'réponse vide'}`); }
    else { this.state = 'à jour'; this.log(`${payload.action} en ${s} s${r.ms ? ` (CRM ${(r.ms / 1000).toFixed(1)} s)` : ''}`); }
    return r || { ok: false, erreur: 'réponse vide' };
  }
  async status(force = false) {
    if (!this.on) return null;
    if (!force && this.etat && Date.now() - this.etat.at < 5 * 60000) return this.etat;
    try { const r = await this.ask({ action: 'crm_etat' }); this.etat = { at: Date.now(), ...r }; }
    catch (e) { this.etat = { at: Date.now(), ok: false, erreur: e.message }; }
    return this.etat;
  }

  // ---- fiches gardées pour la journée ----
  _load() {
    try {
      const o = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (o && o.jour === frDate(new Date())) for (const e of o.e || []) if (Date.now() - e.at < CACHE_MS) this.cache.set(e.cle, e);
    } catch (_) {}
  }
  _save() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ jour: frDate(new Date()), e: [...this.cache.values()].slice(-15) })); } catch (_) {}
  }
  _keep(r) {
    const e = { cle: r.cle, societe: r.societe, contact: r.contact, ville: r.ville || '', contacts: r.contacts || [], texte: r.texte, rdv: r.rdv || '', at: Date.now(),
      noms: [r.contact, ...(r.contacts || []).map((c) => c.nom)].filter(Boolean) };
    this.cache.delete(r.cle); this.cache.set(r.cle, e); this._save();
    this.last = e;
    return e;
  }
  // Fiche gardée qui correspond clairement à ce qui a été dit (sinon null : on demande au CRM).
  _fromCache(q) {
    if (!q) return null;
    const l = [...this.cache.values()].map((e) => ({ e, s: ressemblance(q, e) })).sort((a, b) => b.s - a.s);
    if (!l.length || l[0].s < 0.85 || (l[1] && l[1].s > l[0].s - 0.1)) return null;
    return l[0].e;
  }
  // « lui », « ce client », vide : le dernier client dont on a parlé.
  _isLast(q) { return !q || /^(lui|elle|ce client|cette societe|le meme|la meme|il|eux)$/i.test(plat(q).trim()); }

  async client({ client = '', cle = '' } = {}, signal) {
    if (!cle && this._isLast(client) && this.last) return { ok: true, e: this.last, cached: true };
    const hit = cle ? this.cache.get(cle) : this._fromCache(client);
    if (hit && Date.now() - hit.at < CACHE_MS) { this.last = hit; this.log(`fiche gardée : ${hit.societe}`); return { ok: true, e: hit, cached: true }; }
    const r = await this.ask(cle ? { action: 'crm_client', cle } : { action: 'crm_client', client }, signal);
    if (!r.ok) return r;
    if (!r.cle) return { ok: true, texte: r.texte, choix: r.choix || [] };            // inconnu ou plusieurs possibles
    return { ok: true, e: this._keep(r) };
  }
  async agenda(jour, signal) {
    const d = parseJour(jour || "aujourd'hui") || new Date();
    const auj = minuit(new Date());
    const j = +minuit(d) === +auj ? 'aujourdhui' : +minuit(d) === +plus(auj, 1) ? 'demain' : frDate(d);
    const r = await this.ask({ action: 'crm_journee', jour: j }, signal);
    if (r.ok && j === 'aujourdhui') this.journee = { at: Date.now(), ...r };
    return r;
  }
  bilan(signal) { return this.ask({ action: 'crm_bilan' }, signal); }
  produit(produit, question, signal) { return this.ask({ action: 'crm_produit', produit, question: question === 'infos' ? 'infos' : 'qui_achete' }, signal); }

  // Mode voiture : la journée et les fiches des rendez-vous du jour, chargées d'avance (C7).
  async prefetch() {
    if (!this.on || this._prefetching) return;
    this._prefetching = true; const t0 = performance.now();
    try {
      const j = await this.agenda("aujourd'hui");
      if (!j.ok) return;
      let n = 0;
      for (const r of (j.rdv || []).slice(0, 6)) {
        if (!this.app.car || !this.on) break;
        if (this.cache.has(r.cle) && Date.now() - this.cache.get(r.cle).at < CACHE_MS) continue;
        const c = await this.client({ cle: r.cle });
        if (c.ok && c.e) n++;
      }
      this.log(`journée préparée : ${(j.rdv || []).length} rendez-vous, ${n} fiche(s) chargée(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) { this.log('préparation de la journée impossible : ' + e.message); }
    finally { this._prefetching = false; }
  }

  // Résout un client pour écrire ou appeler : { e } (fiche), ou { texte, choix } à dire.
  async _resolve(client, signal) {
    if (this._isLast(client) && this.last) return { e: this.last };
    const r = await this.client({ client }, signal);
    if (!r.ok) return { texte: `Le CRM ne répond pas : ${r.erreur || 'erreur'}. Dis-le simplement.` };
    if (!r.e) return { texte: r.texte || 'Client introuvable.', choix: r.choix };
    return { e: r.e };
  }

  // ---- écritures (C2, C3) ----
  async prepare(a, signal) {
    const type = ['tache', 'compte_rendu', 'rdv', 'note'].includes(a.type) ? a.type : 'tache';
    let e = null;
    if (a.client || type !== 'tache') {
      const r = await this._resolve(a.client || '', signal);
      if (!r.e) return { ok: false, dire: r.texte };
      e = r.e;
    }
    const texte = String(a.texte || '').trim();
    if (type !== 'rdv' && !texte) return { ok: false, dire: 'Il manque le texte à noter : demande-lui ce qu\'il veut noter.' };
    // at / turn : moment et tour de parole de la préparation ; seul un « oui » dit APRÈS compte (verrou C2)
    const p = { type, cle: e ? e.cle : '', societe: e ? e.societe : '', contact: e ? e.contact : '', texte, at: performance.now(), atMs: Date.now(), turn: this.app._turnN || 0 };
    const qui = e ? `${e.societe}${e.contact ? ' (' + e.contact + ')' : ''}` : '';
    if (type === 'tache') {
      const d = a.date ? parseJour(a.date) : minuit(new Date());
      if (!d) return { ok: false, dire: `Je ne comprends pas la date « ${a.date} » : demande-lui le jour du rappel.` };
      p.date = frDate(d); p.relu = `Tâche pour le ${jourDit(d)}${qui ? ', ' + qui : ''} : « ${texte} ».`;
    } else if (type === 'rdv') {
      const d = parseJour(a.date || ''), h = parseHeure(a.heure || a.date || '');
      if (!d) return { ok: false, dire: 'Il manque le jour du rendez-vous : demande-le-lui.' };
      if (!h) return { ok: false, dire: 'Il manque l\'heure du rendez-vous : demande-la-lui.' };
      if (d < minuit(new Date())) return { ok: false, dire: 'Ce jour est déjà passé : redemande-lui la date du rendez-vous.' };
      p.date = frDate(d); p.heure = h; p.relu = `Rendez-vous avec ${p.contact || p.societe} (${p.societe}) le ${jourDit(d)} à ${h}.${texte ? ' Note : « ' + texte + ' ».' : ''}`;
    } else {
      const d = a.date ? parseJour(a.date, new Date(), { futur: false }) : null;
      if (a.date && !d) return { ok: false, dire: `Je ne comprends pas la date « ${a.date} » : demande-lui le jour de l'échange.` };
      if (d && d > minuit(new Date())) return { ok: false, dire: 'Un compte rendu ne peut pas être daté dans le futur : redemande la date.' };
      p.date = d ? frDate(d) : ''; p.echange = type === 'note' ? 'autre' : (a.echange === 'appel' ? 'appel' : 'visite');
      p.relu = type === 'note' ? `Note pour ${qui} : « ${texte} ».`
        : `Compte rendu ${p.echange === 'appel' ? 'd\'appel' : 'de visite'}${d ? ' du ' + jourDit(d) : ''}, ${qui} : « ${texte} ».`;
    }
    this.pending = p;
    this.log(`à confirmer : ${p.relu}`, true);
    if (this.app.showConfirm) this.app.showConfirm(p);
    return { ok: true, pending: p,
      dire: `Rien n'est encore écrit. Relis-lui exactement : « ${p.relu} » puis demande « Je l'enregistre ? ». N'appelle crm_confirmer qu'après son « oui » ; s'il corrige, rappelle crm_noter.` };
  }

  // Verrou : y a-t-il un « oui » de Timothée APRÈS la préparation ? heard : [{ t, text, n }] (ce qu'il a dit, horodaté ;
  // n = tour de parole du direct, -1 en mode économique). En direct, seul un tour postérieur à la préparation compte :
  // « OK, note que… » (la demande elle-même) ne vaut jamais confirmation.
  gate(heard, { tapped = false } = {}) {
    const p = this.pending;
    if (!p) return { ok: false, why: 'rien à enregistrer' };
    if (Date.now() - p.atMs > PENDING_MS) { this.pending = null; return { ok: false, why: 'préparation trop ancienne' }; }
    if (tapped) return { ok: true };
    const apres = (heard || []).filter((h) => (h.n == null || h.n < 0 ? h.t > p.at : h.n > p.turn) && String(h.text || '').trim());
    if (!apres.length) return { ok: false, why: 'pas de réponse de Timothée depuis la relecture' };
    const dit = apres[apres.length - 1].text;                 // sa DERNIÈRE réponse (« attends… » puis « oui, vas-y »)
    if (!estOui(dit)) return { ok: false, why: `pas de « oui » clair (« ${dit.slice(0, 80)} »)` };
    return { ok: true, dit };
  }

  async commit(signal) {
    const p = this.pending; if (!p) return { ok: false, dire: 'Il n\'y a rien à enregistrer.' };
    this.pending = null;
    if (this.app.hideCard) this.app.hideCard('confirm');
    const payload = p.type === 'tache'
      ? { action: 'crm_tache', texte: p.texte, date: p.date, cle: p.cle, confirme: true }
      : { action: 'crm_brouillon', type: p.type, cle: p.cle, texte: p.texte, date: p.date, heure: p.heure || '', echange: p.echange || '', confirme: true };
    const r = await this.ask(payload, signal);
    if (!r.ok) { this.pending = p; return { ok: false, dire: `Le CRM a refusé : ${r.erreur || 'erreur'}. Rien n'est écrit ; dis-le simplement.`, phrase: 'Le CRM a refusé : rien n\'est écrit.' }; }
    this.log(`enregistré : ${p.relu}`, true);
    const jour = p.date ? jourDit(new Date(+p.date.slice(6), +p.date.slice(3, 5) - 1, +p.date.slice(0, 2))) : '';
    return p.type === 'tache'
      ? { ok: true, dire: `C'est noté dans Mes tâches pour le ${jour}. Confirme-le en une phrase.`, phrase: `C'est noté dans tes tâches pour le ${jour}.` }
      : { ok: true, dire: 'C\'est prêt dans le CRM, dans Mes tâches, rubrique « Dicté à Wilson » : il le validera une fois garé, avec Enregistrer. Dis-le en une phrase.',
        phrase: 'C\'est prêt : tu le valideras dans le CRM, dans Mes tâches.' };
  }

  // ---- appeler (C4) ----
  async callTarget({ client = '', contact = '' } = {}, signal) {
    const r = await this._resolve(client, signal);
    if (!r.e) return { ok: false, dire: r.texte };
    const e = r.e, cs = (e.contacts || []).filter((c) => c.tel && String(c.tel).replace(/\D/g, '').length >= 9);
    let c = null;
    if (contact) c = cs.map((x) => ({ x, s: ressemblance(contact, { societe: '', noms: [x.nom] }) })).sort((a, b) => b.s - a.s).filter((y) => y.s >= 0.7).map((y) => y.x)[0] || null;
    if (!c) c = cs.find((x) => x.nom === e.contact) || cs[0];
    if (!c) return { ok: false, dire: `Le CRM n'a pas de numéro pour ${e.societe}. Dis-le simplement.` };
    const tel = String(c.tel).replace(/[^\d+]/g, '');
    this.call = { nom: c.nom, societe: e.societe, cle: c.cle || e.cle, tel, aff: String(c.tel).trim() };
    return { ok: true, target: this.call,
      dire: `Le bouton vert pour appeler ${c.nom} (${e.societe}) au ${String(c.tel).trim()} est affiché : dis-lui d'appuyer dessus pour lancer l'appel.` };
  }
}

// Texte d'un résultat du CRM pour Gemini : l'info, puis la consigne d'oral.
export function pourGemini(texte, voiture) {
  return `${texte}\nRéponds à sa question à partir de ces informations seulement (n'invente rien, ne lis pas tout) : ${voiture ? 'une ou deux phrases très courtes, il conduit' : 'une à trois phrases'}, montants arrondis, dates dites naturellement (« jeudi 30 octobre »).`;
}
