// Wilson — sa mémoire (PLAN.md, section 7 septies, S ; demande de Timothée du 05/11/26) : comme Claude avec ses conversations,
// il retient ce qui est utile — pas tout et n'importe quoi.
//  - après chaque discussion, une « passe de mémoire » (une requête Gemini courte, en arrière-plan) relit l'échange et décide
//    s'il y a quelque chose à retenir, à corriger ou à oublier ; la plupart du temps : rien ;
//  - « retiens que… », « oublie… » : tout de suite (outils memoriser / oublier, champs du mode économique) ;
//  - rangée dans l'onglet « Mémoire » de la feuille du journal (apps-script/famille.gs, actions mem_…) : la même sur la tablette
//    et le téléphone, et Timothée peut y corriger ou effacer une ligne à la main. Une copie reste sur l'appareil : sans réseau
//    ou sans script à jour, Wilson s'en sert et envoie ce qui attend dès que possible ;
//  - remplace les anciennes rubriques « Souvenirs » et « Qui vit ici » des réglages (reprises une fois, origine « ancien »).

const K = 'wilson.memoire', K_ATT = 'wilson.memoire.attente', K_MIGRE = 'wilson.memoire.migre', K_VIEUX = 'wilson.facts';
export const CATEGORIES = ['consignes', 'famille', 'santé', 'dates', 'goûts', 'habitudes', 'maison', 'projets', 'travail', 'autre'];
const SYNC_MS = 20 * 60000;       // relecture de la feuille (Timothée a pu y corriger une ligne)
const MAX_LOCAL = 400, MAX_AJOUTS = 4, CONSIGNE_MAX = 6000;

const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('le la les de du des un une et a au aux en est son sa ses mon ma mes ton ta tes il elle on qui que je tu nous vous ils elles ce cette pour par sur dans avec pas plus tres'.split(' '));
export const mots = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 300);
const nouvelId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n) => String(n).padStart(2, '0');
const jour = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };
const PAS_PRENOM = new Set(['Wilson', 'Les', 'Le', 'La', 'Il', 'Elle', 'Ils', 'Elles', 'Leur', 'Leurs', 'Son', 'Sa', 'Ses', 'Un', 'Une', 'Des', 'Chez', 'Pour', 'Avec', 'Quand', 'Tous', 'Toute', 'Tout', 'Qui', 'Maison', 'Mamie', 'Papi']);

// Ce que la passe de mémoire doit retenir… et surtout ne pas retenir.
export const CONSIGNE_PASSE = `Tu es la mémoire de Wilson, le compagnon de la famille de Timothée (une tablette dans le salon, et le téléphone de Timothée). Tu relis une discussion qui vient de se terminer et tu décides ce qui mérite d'être retenu pour longtemps, comme un ami attentif — pas comme un enregistreur.

À retenir, seulement si c'est dit clairement par la famille dans la discussion :
- qui vit ici et les proches : prénoms, liens, âges, animaux (« Louis est le fils de Timothée et Camille ») ;
- les goûts, les envies, ce qu'on n'aime pas ;
- les dates qui reviennent (anniversaires, fêtes de famille) ;
- les habitudes et l'organisation de la maison (horaires, qui fait quoi, où sont rangées les choses) ;
- les projets et décisions qui compteront encore dans plusieurs semaines ;
- comment la famille veut que Wilson se comporte avec elle (« appelle-moi Tim », « ne me parle pas le matin avant mon café ») ;
- comment prononcer un nom (une personne, un client, une ville) quand quelqu'un corrige Wilson (« Kerhervé, ça se dit Ker-èr-vé ») : catégorie travail pour un client, avec la ville s'il l'a dite ;
- une information de santé seulement si elle sert au quotidien et qu'elle est dite clairement (une allergie, un régime) ; l'argent et les sujets intimes, seulement si on demande à Wilson de les retenir.

À NE PAS retenir :
- les bavardages, les salutations, les demandes ponctuelles (météo, recherche, minuteur, lumière, musique, une photo), tout ce qui ne servira plus dans une semaine ;
- ce qui est déjà rangé ailleurs : les rendez-vous (agenda), les messages laissés à quelqu'un, les clients, commandes et chiffres du CRM de Timothée, ses remarques sur le fonctionnement de Wilson (déjà notées pour ses mises à jour) ;
- ce que Wilson a dit, supposé ou deviné lui-même ; ce que dit la télé, la radio ou quelqu'un au téléphone ;
- les codes, mots de passe, numéros de carte ou de compte, adresses e-mail ;
- ce qu'on a demandé d'oublier.

Regarde d'abord les souvenirs existants (avec leur id) : si l'information y est déjà, ne la répète pas. Si elle le contredit ou le précise, mets l'id de l'ancien dans "oublier" et la nouvelle version dans "ajouter". Si quelqu'un demande d'oublier quelque chose, mets les ids concernés dans "oublier". Un souvenir marqué « demandé » (la famille a demandé à Wilson de le retenir) ne va JAMAIS dans "oublier", sauf si la discussion demande clairement de l'oublier ou le corrige.
Chaque souvenir : une phrase courte, autonome et précise, au présent, avec les prénoms (jamais « il », « je » ou « moi ») : « Camille n'aime pas la coriandre. » Une date dite de façon relative (« samedi prochain », « dans quinze jours ») s'écrit en clair (« le 14/11/26 »), à partir du jour de la discussion. "qui" = le ou les prénoms concernés (ou « famille »). Au plus ${MAX_AJOUTS} ajouts.
Petit ménage (au plus 2 par discussion, dans "oublier") : si deux souvenirs existants disent la même chose (« Le parapluie rouge est dans l'entrée. » et « Le parapluie est rangé dans l'entrée. »), oublie le moins précis ; un souvenir marqué « ancien » qui ne vaut que pour un moment (« Le son est bon aujourd'hui. ») ou qui n'a pas de sens (« Les gens sont là avec l'utilisateur. ») s'oublie aussi. Jamais un souvenir « demandé ».
La plupart des discussions ne contiennent rien à retenir : c'est normal, réponds alors avec des listes vides.`;

export const SCHEMA_PASSE = {
  type: 'OBJECT',
  properties: {
    ajouter: { type: 'ARRAY', items: { type: 'OBJECT', properties: { texte: { type: 'STRING' }, categorie: { type: 'STRING', enum: CATEGORIES }, qui: { type: 'STRING' } }, required: ['texte', 'categorie'] } },
    oublier: { type: 'ARRAY', items: { type: 'STRING' } },
    reponses: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, reponse: { type: 'STRING' } }, required: ['id', 'reponse'] } },
  },
  required: ['ajouter', 'oublier'],
};

export class Memoire {
  constructor(app) {
    this.app = app;
    this.items = lire(K, []).filter((x) => x && x.id && x.texte);
    this.att = lire(K_ATT, null) || { ajouter: [], oublier: [] };
    this.etat = ''; this._syncAt = 0; this._sync = null; this._timer = null;
    this.passes = 0; this.retenus = 0; this.derniere = '';
    this._migrer();
    setInterval(() => { if (this.remote && this.remote.on && Date.now() - this._syncAt > (this._attente() ? 60000 : SYNC_MS)) this.synchroniser(); }, 60000);
  }
  get remote() { return this.app.remote; }
  log(m, priv) { this.app.log(m, priv); }
  _attente() { return this.att.ajouter.length + this.att.oublier.length; }
  _sauver() {
    if (this.att.ajouter.length > MAX_LOCAL) this.att.ajouter = this.att.ajouter.slice(-MAX_LOCAL);
    if (this.att.oublier.length > 200) this.att.oublier = this.att.oublier.slice(-200);
    ecrire(K, this.items.slice(-MAX_LOCAL)); ecrire(K_ATT, this.att);
  }
  _bientot(ms = 3000) { clearTimeout(this._timer); this._timer = setTimeout(() => this.synchroniser(), ms); }

  // Les anciens « Souvenirs » (wilson.facts) et « Qui vit ici » (réglage home) : repris une fois, puis l'ancienne liste est effacée.
  _migrer() {
    try { if (localStorage.getItem(K_MIGRE)) return; } catch (_) { return; }
    const vieux = lire(K_VIEUX, []), home = propre((this.app.settings || {}).home);
    let n = 0;
    if (home) { if (this._ajouter(`À la maison : ${home}`, { cat: 'famille', qui: 'famille', origine: 'ancien' })) n++; }
    for (const f of Array.isArray(vieux) ? vieux : []) {
      const d = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(f && f.date || ''), t = d ? new Date(2000 + +d[3], +d[2] - 1, +d[1]).getTime() : Date.now();
      if (f && this._ajouter(f.text, { cat: 'autre', origine: 'ancien', t })) n++;
    }
    try { localStorage.setItem(K_MIGRE, String(Date.now())); localStorage.removeItem(K_VIEUX); } catch (_) {}
    if (n) { this._sauver(); setTimeout(() => this.log(`Mémoire : ${n} ancien(s) souvenir(s) repris (rubriques « Souvenirs » et « Qui vit ici »)`), 0); }
  }

  // ---------- ajouter, oublier ----------
  // Une phrase qui en reformule une autre la remplace (pas de doublons).
  _ajouter(texte, { cat = 'autre', qui = '', origine = 'demandé', t = Date.now() } = {}) {
    texte = propre(texte); if (!texte || texte.length < 4) return null;
    const n = norm(texte), w = new Set(mots(texte));
    if (this.items.some((f) => norm(f.texte) === n)) return null;   // déjà su, mot pour mot
    const proches = this.items.filter((f) => {
      const fw = mots(f.texte);
      return fw.length && w.size && fw.filter((x) => w.has(x)).length / Math.max(fw.length, w.size) > 0.75;
    });
    for (const p of proches) this._retirer(p.id);
    const it = { id: nouvelId(), cat: CATEGORIES.includes(cat) ? cat : 'autre', texte, qui: propre(qui).slice(0, 40), t, origine };
    this.items.push(it); this.att.ajouter.push(it);
    return it;
  }
  _retirer(id) {
    const i = this.items.findIndex((x) => x.id === id); if (i < 0) return null;
    const [it] = this.items.splice(i, 1), j = this.att.ajouter.findIndex((x) => x.id === id);
    if (j >= 0) this.att.ajouter.splice(j, 1); else this.att.oublier.push(id);   // pas encore envoyé : il suffit de ne pas l'envoyer
    return it;
  }
  ajouter(texte, o = {}) {
    const it = this._ajouter(texte, o); if (!it) return null;
    this._sauver(); this._bientot();
    return it;
  }
  // « Oublie que… » : les souvenirs qui parlent de ce sujet.
  oublier(sujet) {
    const q = mots(sujet), ns = norm(sujet); if (!q.length) return [];
    const partis = this.items.filter((f) => {
      const fw = new Set(mots(f.texte)), hit = q.filter((x) => fw.has(x)).length;
      return hit / q.length >= 0.6 || (ns.length > 3 && norm(f.texte).includes(ns));
    }).map((f) => this._retirer(f.id)).filter(Boolean);
    if (partis.length) { this._sauver(); this._bientot(); }
    return partis.map((f) => f.texte);
  }
  oublierIds(ids) {
    const partis = (ids || []).map((id) => this._retirer(String(id))).filter(Boolean);
    if (partis.length) { this._sauver(); this._bientot(); }
    return partis.map((f) => f.texte);
  }

  // ---------- la feuille (onglet « Mémoire ») ----------
  async synchroniser() {
    if (!this.remote || !this.remote.on) return false;
    if (this._sync) return this._sync;
    this._sync = (async () => {
      const envoi = { ajouter: this.att.ajouter.slice(0, 30), oublier: this.att.oublier.slice(0, 100) };
      const r = await this.remote.ask(envoi.ajouter.length || envoi.oublier.length ? { action: 'mem_ecrire', ...envoi } : { action: 'mem_lire' });
      this._syncAt = Date.now();
      if (!r || !r.ok || !Array.isArray(r.souvenirs)) {
        const e = String(r && r.erreur || 'réponse inattendue');
        this.etat = /action inconnue/.test(e) ? 'script pas encore à jour (mémoire gardée sur l\'appareil)' : 'erreur : ' + e;
        return false;
      }
      const envoyes = new Set(envoi.ajouter.map((x) => x.id));
      this.att.ajouter = this.att.ajouter.filter((x) => !envoyes.has(x.id));
      this.att.oublier = this.att.oublier.filter((x) => !envoi.oublier.includes(x));
      const loin = r.souvenirs.filter((x) => x && x.id && x.texte && !this.att.oublier.includes(x.id))
        .map((x) => ({ id: x.id, cat: CATEGORIES.includes(String(x.cat || '').trim().toLowerCase()) ? String(x.cat).trim().toLowerCase() : 'autre', texte: propre(x.texte), qui: x.qui || '', t: +x.t || 0, origine: x.origine || '' }));
      const ids = new Set(loin.map((x) => x.id));
      this.items = [...loin, ...this.att.ajouter.filter((x) => !ids.has(x.id))];
      this._sauver();
      this.etat = 'ok';
      if (r.refuses) this.log(`Mémoire pleine : ${r.refuses} souvenir(s) non gardé(s) — il faut en effacer dans l'onglet « Mémoire »`);
      if (this._attente()) this._bientot(2000);   // plus de 30 en attente : la suite
      return true;
    })().catch((e) => { this.etat = 'erreur : ' + (e.message || e); return false; }).finally(() => { this._sync = null; });
    return this._sync;
  }

  // ---------- pour la consigne de Gemini ----------
  pourConsigne(max = CONSIGNE_MAX) {
    if (!this.items.length) return '';
    const rang = (c) => { const i = CATEGORIES.indexOf(c); return i < 0 ? 99 : i; };
    const tri = [...this.items].sort((a, b) => rang(a.cat) - rang(b.cat) || (b.t || 0) - (a.t || 0));
    const out = []; let n = 0, cat = null;
    for (const it of tri) {
      const l = `${it.cat !== cat ? `${it.cat === 'autre' ? 'Divers' : it.cat[0].toUpperCase() + it.cat.slice(1)} :\n` : ''}- ${it.texte}${it.t ? ` (${jour(it.t)})` : ''}`;
      if (n + l.length > max) break;
      out.push(l); n += l.length + 1; cat = it.cat;
    }
    return out.join('\n');
  }
  // Les prénoms connus (pour reconnaître « Louis, viens manger » : ce n'est pas pour Wilson).
  prenoms() {
    const s = new Set();
    for (const it of this.items) {
      for (const p of String(it.qui || '').split(/[,;/&]| et /)) { const x = p.trim(); if (/^[A-ZÉÈÀÂÎÔ][a-zéèêëàâîïôöûüç-]{2,}$/.test(x) && !PAS_PRENOM.has(x)) s.add(x); }
      if (it.cat === 'famille') for (const m of it.texte.match(/\b[A-ZÉÈÀÂÎÔ][a-zéèêëàâîïôöûüç-]{2,}\b/g) || []) if (!PAS_PRENOM.has(m)) s.add(m);
    }
    return [...s];
  }
  decrire() { return `${this.items.length} souvenir(s)${this._attente() ? `, ${this._attente()} changement(s) à envoyer` : ''}${this.etat && this.etat !== 'ok' ? ` — ${this.etat}` : ''}${this.passes ? ` · ${this.passes} discussion(s) relue(s), ${this.retenus} retenu(s)` : ''}`; }

  // ---------- la passe de mémoire, après une discussion ----------
  // echanges : [{ user, wilson, qui, t }] ; questions : celles de Claude posées à Timothée pendant la discussion ([{ id, question }]).
  // → { ajoutes, oublies, reponses } ou null (rien à relire).
  async passe({ echanges = [], questions = [], ou = '', signal } = {}) {
    const key = this.app.settings && this.app.settings.apiKey, eco = this.app.eco;
    if (!key || !eco || !eco.texteJson) return null;
    const dit = echanges.map((e) => String(e.user || '').trim()).filter(Boolean).join(' ');
    if (dit.length < 15 && !questions.length) return null;   // « merci », « bonne nuit » : rien à relire
    let texte = echanges.map((e) => [e.user ? `${e.qui || 'Quelqu\'un'} : ${e.user}` : '', e.wilson ? `Wilson : ${e.wilson}` : ''].filter(Boolean).join('\n')).join('\n');
    if (texte.length > 9000) texte = '…\n' + texte.slice(-9000);
    const souv = this.items.length ? this.items.slice(-150).map((x) => `[${x.id}] (${x.cat}${x.qui ? ', ' + x.qui : ''}${x.origine === 'demandé' ? ', demandé' : x.origine === 'ancien' ? ', ancien' : ''}) ${x.texte}`).join('\n') : '(aucun)';
    const qs = questions.length ? `\n\nQuestions que Claude (celui qui prépare les mises à jour de Wilson) a fait poser à Timothée pendant cette discussion :\n${questions.map((q) => `[${q.id}] « ${q.question} »`).join('\n')}\nSi TIMOTHÉE (lui seulement, pas Camille ni quelqu'un d'autre) y a répondu, mets sa réponse dans "reponses" : {id, reponse = ce qu'il a répondu, mis au propre, sans rien inventer}. Ces réponses ne vont pas dans "ajouter". S'il n'a pas répondu ou a dit « plus tard », rien.` : '';
    const msg = `Souvenirs actuels :\n${souv}${qs}\n\nLa discussion (${jour(Date.now())}${ou ? ', ' + ou : ''}) :\n${texte}`;
    const { json, model } = await eco.texteJson({ key, system: CONSIGNE_PASSE, text: msg, schema: SCHEMA_PASSE, signal });
    this.passes++;
    // Journal du 05/11/26, 11h03:15 : ce que la famille avait demandé de retenir 2 min plus tôt a été « oublié » par la passe
    // (jugé ponctuel). Un souvenir demandé n'est oublié que si quelqu'un a demandé de l'oublier ou l'a corrigé dans la discussion.
    const demandeOubli = /oubli|efface|supprim|retire|enl[eè]ve|c'est faux|plus vrai|corrig/i.test(dit);
    const proteges = [];
    const idsOubli = (json.oublier || []).filter((id) => {
      const x = this.items.find((y) => y.id === id); if (!x) return false;
      if (x.origine === 'demandé' && !demandeOubli) { proteges.push(x.texte); return false; }
      return true;
    });
    // Nuit du 06/11/26 : la passe fait aussi un peu de ménage (doublons, souvenirs du moment), mais jamais en masse : sans
    // demande d'oubli, pas plus d'oublis que d'ajouts (remplacements) + 2.
    const maxOubli = (json.ajouter || []).slice(0, MAX_AJOUTS).length + 2;
    if (!demandeOubli && idsOubli.length > maxOubli) { this.log(`Mémoire : oubli limité à ${maxOubli} (${idsOubli.length} proposés, personne n'a demandé d'oublier)`); idsOubli.length = maxOubli; }
    if (proteges.length) this.log(`Mémoire : gardé (demandé par la famille, personne n'a demandé de l'oublier) « ${proteges.join(' », « ')} »`);
    const oublies = this.oublierIds(idsOubli);
    const ajoutes = [];
    for (const a of (json.ajouter || []).slice(0, MAX_AJOUTS)) {
      const it = this._ajouter(a.texte, { cat: a.categorie, qui: a.qui, origine: 'discussion' });
      if (it) ajoutes.push(it.texte);
    }
    if (ajoutes.length) { this.retenus += ajoutes.length; this._sauver(); this._bientot(); }
    const ids = new Set(questions.map((q) => q.id));
    const reponses = (json.reponses || []).filter((r) => r && ids.has(r.id) && String(r.reponse || '').trim());
    this.derniere = ajoutes.length || oublies.length ? `${ajoutes.length} retenu(s), ${oublies.length} oublié(s)` : 'rien à retenir';
    this.log(`Mémoire (${model}) : ${ajoutes.length ? ajoutes.map((t) => `retenu « ${t} »`).join(' ; ') : 'rien de neuf à retenir'}${oublies.length ? ` ; oublié « ${oublies.join(' », « ')} »` : ''}`, true);
    return { ajoutes, oublies, reponses };
  }
}
