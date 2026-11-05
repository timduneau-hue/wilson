// Wilson — la famille et la garde (PLAN.md, section 7 sexies) :
//  M — messages de la famille, remis à la bonne personne quand elle regarde Wilson (reconnue par qui.js) ;
//  G — garde de la maison : oreille de garde (garde.js), alertes par e-mail, ce qui s'est passé raconté au retour ;
//  outils `messages`, `visages`, `garde`.
// Messages et garde passent par le script de Timothée (apps-script/famille.gs) pour être partagés entre ses appareils ;
// sans script à jour, ils restent sur cet appareil.

import { OreilleGarde, NOMS, URGENT } from './garde.js';
import { deviceName } from './remote.js';
import { joliNom } from './qui.js';

const KEY_M = 'wilson.messages', KEY_G = 'wilson.garde', KEY_N = 'wilson.famille.noms';
const GARDER_MS = 14 * 24 * 3600000;
const AUTO_MS = 45 * 60000;          // G1 : garde automatique, personne vu depuis 45 min (hors nuit)
const VIDE_MS = 2 * 60000;           // garde demandée : la pièce doit être restée vide 2 min avant qu'un retour compte
const ALERTE_ECART_MS = 10 * 60000;  // G3 : une alerte du même genre toutes les 10 min au plus
const REMISE_ECART_MS = 2 * 60000;   // M3 : une tentative de remise toutes les 2 min au plus
const PROPRIO = 'Timothée';          // le téléphone est celui de Timothée
const TOUS = /^(tous|tout le monde|toute la famille|la famille|famille|everyone|nous|nous deux|nous tous|vous|vous deux|les deux|la maison)$/;
// Rappel « quand tu nous verras » (journal du 05/11/26, 11h01 : « dès que Wilson à la maison, sur la tablette, nous verra ce
// soir… ») : un message que la personne se laisse à elle-même (et à la famille), dit à la maison seulement, pas avant une heure.
// Le script déjà déployé ne garde que id, pour, de, texte, t, par : ces trois réglages voyagent aussi dans l'id
// (« r_<heure en base 36>_<m : maison, s : pour soi aussi>_… »), et un rappel pour soi part avec « de » vide pour qu'une
// tablette pas encore à jour (1.28.0, jusqu'à la mise à jour de la nuit) le remette aussi à celui qui l'a laissé.
export function metaMessage(m) {
  const r = /^r_([0-9a-z]*)_([a-z]*)_/.exec(String((m && m.id) || '')) || [];
  const apres = +(m && m.apres) || (r[1] ? parseInt(r[1], 36) : 0) || 0;
  return { apres, maison: !!((m && m.maison) || /m/.test(r[2] || '')), soi: !!((m && m.soi) || /s/.test(r[2] || '')) };
}

const S = { type: 'STRING' };
export const FAMILLE_TOOLS = [
  { name: 'messages', behavior: 'BLOCKING',
    description: "Messages de la famille (« dis à Marie que je rentre vers 20h », « laisse un mot à Louis », « j'ai des messages ? », « est-ce que Marie a eu mon message ? ») : deposer (pour = prénom du destinataire, ou « tous » ; de = qui le laisse ; texte = le message tel qu'il l'a dit, mis au propre, avec son sujet précis, sans rien inventer), lire (les messages de la personne qui te parle), statut (pour = le destinataire), annuler (pour). Wilson le remet lui-même quand le destinataire le regarde. Aussi pour un rappel « quand tu nous verras » (« rappelle-nous ce soir à la maison de… », « dis-le-moi quand je rentrerai ») : deposer avec aussi_pour_moi = true (la personne qui parle le recevra aussi), a_la_maison = true (dit seulement par la tablette du salon) et apres = l'heure à partir de laquelle le dire (format 2026-11-05T18:00 ; « ce soir » = 18:00 aujourd'hui).",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['deposer', 'lire', 'statut', 'annuler'] }, pour: S, de: S, texte: S,
      aussi_pour_moi: { type: 'BOOLEAN' }, a_la_maison: { type: 'BOOLEAN' }, apres: S }, required: ['action'] } },
  { name: 'visages', behavior: 'BLOCKING',
    description: "Les visages que tu reconnais : apprendre (« apprends mon visage, je suis Louis » : prenom ; la personne doit être seule devant toi et te regarder ; avant d'appeler, dis « Regarde-moi bien… »), oublier (prenom), liste, qui (qui te regarde en ce moment). Tout reste sur la tablette.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['apprendre', 'oublier', 'liste', 'qui'] }, prenom: S }, required: ['action'] } },
  { name: 'garde', behavior: 'BLOCKING',
    description: "Garde de la maison (« on part, surveille la maison », « on est rentrés », « la maison est sous garde ? ») : activer, arreter, etat. Pendant la garde tu écoutes les sons de la maison (fumée, verre brisé, alarme : e-mail à Timothée ; sonnette, chien : raconté au retour) et tu signales un visage inconnu.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['activer', 'arreter', 'etat'] } }, required: ['action'] } },
  { name: 'agenda', behavior: 'BLOCKING',   // demande de Timothée du 04/11/26, 21h26
    description: "L'agenda « Famille » (Google Agenda partagé de Timothée et Camille, en jaune : médecin des enfants, soirées, week-ends…). TOUT événement qu'on te demande de créer va dans cet agenda, que Timothée et Camille voient tous les deux (règle du 06/11/26) ; jamais ailleurs ; le CRM (crm_noter, rdv) seulement quand Timothée parle du CRM ou d'un compte rendu de visite, dans le doute l'agenda Famille. Quand tu ajoutes, dis que c'est dans l'agenda Famille. ajouter : si le créneau est déjà pris, rien n'est ajouté : tu le lui dis et tu demandes s'il veut l'ajouter quand même (alors rappelle ajouter avec quand_meme = true) ; titre court et clair (« Médecin Louis », « Soirée chez Paul », « Week-end chez mamie »), debut = date et heure locales au format 2026-11-12T10:00, ou la date seule 2026-11-14 avec journee = true pour un jour entier ; fin facultative (pour un week-end : le dernier jour) ; lieu facultatif. lire : du = premier jour (2026-11-14), jours = combien de jours (7 par défaut) — « qu'est-ce qu'on a ce week-end ? ». annuler : seulement ce que tu viens d'ajouter, si tu t'es trompé. Calcule les dates à partir d'aujourd'hui ; si le jour ou l'heure n'est pas clair, demande avant d'ajouter.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['ajouter', 'lire', 'annuler'] }, titre: S, debut: S, fin: S, journee: { type: 'BOOLEAN' }, lieu: S, du: S, jours: { type: 'NUMBER' }, quand_meme: { type: 'BOOLEAN', description: 'ajouter malgré ce qui est déjà prévu, seulement après son accord' } }, required: ['action'] } },
];
export const FAMILLE_TOOL_NAMES = FAMILLE_TOOLS.map((t) => t.name);
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourDit = (t) => { const d = new Date(t); return `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const JOUR_SEUL = /^\d{4}-\d{2}-\d{2}$/;

const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
export const norm = (x) => String(x || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
export const heure = (t) => { const d = new Date(t); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const quand = (t) => { const d = new Date(t), auj = new Date(); return d.toDateString() === auj.toDateString() ? `à ${heure(t)}` : `le ${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${heure(t)}`; };

export class Famille {
  constructor(app) {
    this.app = app;
    this.msgs = lire(KEY_M, []).filter((m) => m && Date.now() - m.t < GARDER_MS);
    this.nomsScript = lire(KEY_N, []);
    this.garde = lire(KEY_G, null) || { on: false, t: 0 };
    this.oreille = new OreilleGarde({ log: (m) => this.log(m), onEvenement: (e) => this._evenement(e) });
    this._lireAt = 0; this._remiseAt = 0; this.remise = null; this.promis = null; this.etatScript = '';
    this.alertesN = 0; this._alerteAt = {};
  }
  log(m, priv) { this.app.log(m, priv); }
  get telephone() { return deviceName() === 'téléphone'; }
  get qui() { return this.app.qui; }
  _sauver() { ecrire(KEY_M, this.msgs.filter((m) => Date.now() - m.t < GARDER_MS).slice(-60)); }
  _sauverGarde() { ecrire(KEY_G, { ...this.garde, evenements: (this.garde.evenements || []).slice(-40) }); }

  // Prénoms connus : visages appris sur cet appareil, et ceux de la tablette (par le script) sur les autres appareils.
  noms() {
    const l = [...(this.qui ? this.qui.liste() : []), ...this.nomsScript];
    return l.filter((n, i) => l.findIndex((x) => norm(x) === norm(n)) === i);
  }
  _destinataire(pour) {
    const p = norm(pour);
    if (!p) return null;
    if (TOUS.test(p)) return 'tous';
    const l = this.noms(), mots = p.split(/[\s,]+/);
    if (l.filter((n) => mots.includes(norm(n))).length > 1 || /\s(et|avec)\s/.test(p)) return 'tous';   // « Timothée et Camille », « Louis et moi »
    return l.find((n) => norm(n) === p) || l.find((n) => mots.includes(norm(n))) || null;
  }
  // Messages qui attendent cette personne (et ceux « pour tous »).
  // Un rappel « à la maison » n'est jamais dit par le téléphone ; aucun n'est dit avant son heure.
  enAttente(nom) {
    const n = norm(nom), now = Date.now();
    return this.msgs.filter((m) => {
      if (m.remis || m.annule || !(norm(m.pour) === n || m.pour === 'tous')) return false;
      const M = metaMessage(m);
      return (norm(m.de) !== n || M.soi) && !(M.apres && now < M.apres) && !(M.maison && this.telephone);
    });
  }
  // « de Camille », ou, pour un rappel laissé pour soi : « rappel laissé par Timothée ».
  _deQui(m) { return metaMessage(m).soi ? `rappel laissé par ${m.de || (m.par === 'téléphone' ? PROPRIO : 'la famille')} ${quand(m.t)}` : `de ${m.de || 'quelqu\'un de la famille'} (${quand(m.t)})`; }

  // ---------- partage par le script (M2) ----------
  async _script(payload) {
    const R = this.app.remote;
    if (!R || !R.on) return null;
    const r = await R.ask(payload).catch(() => null);
    if (r && !r.ok && /action inconnue/.test(r.erreur || '')) { this.etatScript = 'script pas encore à jour'; return null; }
    if (r && r.ok) this.etatScript = 'à jour';
    return r;
  }
  async synchroniser() {
    this._lireAt = performance.now();
    // Ce qui n'est pas encore parti (dépôts, remises, annulations faits sans script ou sans réseau).
    for (const m of this.msgs.filter((x) => x.local)) { const r = await this._script({ action: 'msg_deposer', msg: m }); if (r && r.ok) m.local = false; else break; }
    for (const m of this.msgs.filter((x) => x.remis && x.remisLocal && !x.local)) { const r = await this._script({ action: 'msg_remis', id: m.id, t: m.remis.t, a: m.remis.a }); if (r && r.ok) m.remisLocal = false; }
    for (const m of this.msgs.filter((x) => x.annule && x.annuleLocal && !x.local)) { const r = await this._script({ action: 'msg_annuler', id: m.id }); if (r && r.ok) m.annuleLocal = false; }
    const r = await this._script({ action: 'msg_lire', noms: this.telephone || !this.qui ? undefined : this.qui.liste(), appareil: deviceName() });
    if (!r || !r.ok) { this._sauver(); return false; }
    const locaux = this.msgs.filter((m) => m.local || m.remisLocal || m.annuleLocal);
    const vus = new Set((r.messages || []).map((m) => m.id));
    this.msgs = (r.messages || []).map((m) => { const L = locaux.find((x) => x.id === m.id); return L ? { ...m, ...(L.remis && !m.remis ? { remis: L.remis, remisLocal: true } : {}), ...(L.annule ? { annule: L.annule, annuleLocal: true } : {}) } : m; })
      .concat(locaux.filter((x) => !vus.has(x.id)));
    this._sauver();
    if (Array.isArray(r.noms)) { this.nomsScript = r.noms; ecrire(KEY_N, r.noms); }
    if (r.garde && (+r.garde.t || 0) > (this.garde.t || 0)) {                       // garde demandée sur un autre appareil
      const avant = this.garde.on;
      this.garde = { ...this.garde, on: !!r.garde.on, mode: r.garde.mode || 'demandee', t: r.garde.t, depuis: r.garde.on ? (avant ? this.garde.depuis : Date.now()) : 0, par: r.garde.par || '' };
      if (r.garde.on && !avant) { this.garde.evenements = []; this.garde.vide = 0; }
      this.log(`Garde ${r.garde.on ? 'activée' : 'arrêtée'} depuis un autre appareil (${r.garde.par || '?'})`);
      if (!r.garde.on && avant) this._finGarde('arrêtée depuis un autre appareil', { ecrire: false });
      this._sauverGarde();
    }
    return true;
  }

  // ---------- boucle (appelée chaque seconde par l'appli) ----------
  tick(now = performance.now()) {
    const A = this.app, v = A.vision;
    const periode = this.telephone ? 180000 : 60000;
    if (A.remote && A.remote.on && now - this._lireAt > periode && navigator.onLine) this.synchroniser().catch(() => {});
    // G1 : garde automatique (tablette seulement : un téléphone ne voit jamais personne, il est dans une poche).
    // Garde automatique : tablette du salon seulement (un téléphone est dans une poche, un PC peut être au bureau).
    if (deviceName() === 'tablette' && v && A.settings.gardeAuto !== false && !this.garde.on && !A._isNight() && A.started
      && now - (A.presenceAt || 0) > AUTO_MS) this.activer('auto', 'personne vu depuis 45 min');
    if (this.garde.on) {
      if (this.garde.mode === 'auto' && v && v.looking) { this.presence('quelqu\'un me regarde'); return; }   // G5 : la maison n'est plus vide
      if (!this.oreille.on && !this.telephone && A.started) this.oreille.start();
      if (v && !v.hasPerson) { if (!this._videDepuis) this._videDepuis = now; if (!this.garde.vide && now - this._videDepuis > VIDE_MS) { this.garde.vide = Date.now(); this._sauverGarde(); this.log('Garde : la pièce est vide'); } }
      else this._videDepuis = 0;
    } else if (this.oreille.on) this.oreille.stop();
    this._suivreRemise(now);
    if (!this.telephone) this._remettre(now);
  }
  feed(f32) { if (this.garde.on) this.oreille.feed(f32); }

  // ---------- M3 : remettre un message à la personne qui regarde Wilson ----------
  _remettre(now) {
    const A = this.app, v = A.vision, Q = this.qui;
    if (!v || !Q || this.remise || now - this._remiseAt < REMISE_ECART_MS) return;
    if (!['veille', 'dodo'].includes(A.state) || A.settingsOpen || A.phone || A.netWait || A._isNight() || A.speaking) return;
    const P = Q.qui(now);
    if (!P || !P.sur || !P.facing || !v.looking || now - P.at > 5000) return;
    const l = this.enAttente(P.nom);
    if (!l.length) return;
    this._remiseAt = now;
    this.remise = { ids: l.map((m) => m.id), nom: P.nom, at: now, conv: null };
    const texte = l.map((m) => `${this._deQui(m)} : « ${m.texte} »`).join(' ; ');
    this.log(`Message(s) pour ${P.nom} : il me regarde, je les lui dis (${l.length})`, true);
    A._messageText = `[${P.nom} vient de te regarder (reconnu à son visage). Tu as ${l.length > 1 ? l.length + ' messages' : 'un message'} pour ${P.nom === 'tous' ? 'la famille' : 'lui ou elle'} : ${texte}. Dis-le-lui maintenant, simplement, comme un ami qui transmet (« ${P.nom}, un message de … : … »), sans rien ajouter, puis écoute s'il veut répondre : tu peux déposer sa réponse avec l'outil messages.]`;
    A._messageSay = `${P.nom}, ${l.length > 1 ? 'des messages' : 'un message'} pour toi. ` + l.map((m) => (metaMessage(m).soi ? `Rappel : ${m.texte}` : `De ${m.de || 'la famille'} : ${m.texte}`)).join('. ');
    A.startConversation('message');
    this.remise.conv = A.convId;
  }
  // Remis seulement quand Wilson l'a vraiment dit : sa réponse reprend des mots du message (dit), ou la voix de la tablette l'a lu.
  _suivreRemise(now) {
    for (const k of ['remise', 'promis']) {
      const R = this[k]; if (!R) continue;
      if (R.lu && now > R.lu) { this._marquer(R.ids, R.nom); this[k] = null; }
      else if (now - R.at > 90000 || (R.conv != null && this.app.convId !== R.conv && !this.app.speaking)) { this.log(`Message pas encore dit à ${R.nom} : je réessaierai`); this[k] = null; }
    }
  }
  dit(texte) {
    const t = norm(texte);
    for (const k of ['remise', 'promis']) {
      const R = this[k]; if (!R) continue;
      const mots = this.msgs.filter((m) => R.ids.includes(m.id)).flatMap((m) => norm(m.texte).split(/[^a-z0-9]+/).filter((w) => w.length >= 5).concat(m.de ? [norm(m.de)] : []));
      if (/\bmessage/.test(t) || mots.some((w) => t.includes(w))) { this._marquer(R.ids, R.nom); this[k] = null; }
    }
  }
  _marquer(ids, nom) {
    const t = Date.now();
    for (const m of this.msgs.filter((x) => ids.includes(x.id))) { m.remis = { t, a: nom }; m.remisLocal = true; }
    this._sauver(); this.log(`Message(s) remis à ${nom} (${ids.length})`);
    if (this.app.remote && this.app.remote.on) this.synchroniser().catch(() => {});
  }

  // ---------- pour la consigne de Gemini ----------
  contexte(mode = 'live') {
    const l = [], noms = this.noms();
    const P = this.qui && !this.telephone ? this.qui.qui() : null;
    if (this.telephone) l.push(`Tu es sur le téléphone de ${PROPRIO} : c'est lui qui te parle.`);
    else if (P && P.sur) l.push(`La personne qui te regarde en ce moment : ${P.nom} (reconnu à son visage). Tu peux l'appeler par son prénom.`);
    else if (noms.length && P && P.inconnu) l.push('La personne qui te regarde n\'est pas reconnue : ne devine pas qui c\'est ; demande son prénom si c\'est utile.');
    else if (noms.length) l.push('Tu ne sais pas encore qui te regarde : ne devine pas un prénom.');
    if (noms.length) l.push(`Visages que tu reconnais : ${noms.join(', ')}.`);
    else l.push('Tu ne reconnais encore aucun visage : on peut te les apprendre (« apprends mon visage, je suis … » : outil visages).');
    const qui = this.telephone ? PROPRIO : P && P.sur ? P.nom : null;
    const att = qui ? this.enAttente(qui).filter((m) => !(this.remise && this.remise.ids.includes(m.id))) : [];   // déjà en cours de remise : pas deux fois
    if (att.length && mode === 'live') {
      l.push(`Messages pour ${qui} à lui dire au début de ta première réponse, en une phrase (« Au fait, un message de … : … ») : ${att.map((m) => `${this._deQui(m)} : « ${m.texte} »`).join(' ; ')}.`);
      this.promis = { ids: att.map((m) => m.id), nom: qui, at: performance.now(), conv: null };
      setTimeout(() => { if (this.promis) this.promis.conv = this.app.convId; }, 0);
    }
    if (this.garde.on) l.push(`La maison est sous garde (${this.garde.mode === 'auto' ? 'automatique : personne n\'était là' : 'demandée'} depuis ${heure(this.garde.depuis || Date.now())}).`);
    return l.join('\n');
  }

  // ---------- G : la garde ----------
  activer(mode = 'demandee', pourquoi = '') {
    if (this.garde.on && this.garde.mode === 'demandee') return false;
    const t = Date.now();
    this.garde = { on: true, mode, t, depuis: t, par: deviceName(), evenements: (this.garde.on ? this.garde.evenements : []) || [], vide: mode === 'auto' ? t : 0 };
    this._videDepuis = 0; this._sauverGarde();
    this.log(`Garde activée (${mode === 'auto' ? 'automatique' : 'demandée'}${pourquoi ? ' : ' + pourquoi : ''})`);
    this._script({ action: 'garde_ecrire', garde: { on: true, mode, t, par: deviceName() } }).catch(() => {});
    return true;
  }
  _finGarde(pourquoi, { ecrire = true } = {}) {
    if (!this.garde.on && ecrire) return null;
    const G = this.garde, ev = G.evenements || [], t = Date.now();
    this.garde = { on: false, t, evenements: [] }; this._sauverGarde(); this.oreille.stop();
    this.log(`Garde arrêtée (${pourquoi})${ev.length ? ` — ${ev.length} chose(s) notée(s)` : ''}`);
    if (ecrire) this._script({ action: 'garde_ecrire', garde: { on: false, t, par: deviceName() } }).catch(() => {});
    // G4 : ce qui s'est passé est raconté au retour, comme un message.
    if (ev.length) {
      const parGenre = {};
      for (const e of ev) (parGenre[e.genre] = parGenre[e.genre] || []).push(heure(e.t));
      const texte = 'Pendant votre absence : ' + Object.entries(parGenre).map(([g, hs]) => `${NOMS[g] || g} (${hs.slice(0, 4).join(', ')}${hs.length > 4 ? '…' : ''})`).join(' ; ') + '.';
      this.deposer({ pour: 'tous', de: 'Wilson', texte });
      return texte;
    }
    return '';
  }
  // Retour de la famille (G5) : un visage connu, sûr ; garde demandée : seulement après que la pièce est restée vide.
  quiChange(P) {
    if (!this.garde.on || !P) return;
    if (P.sur && (this.garde.mode === 'auto' || this.garde.vide)) { this._finGarde(`retour de ${P.nom}`); return; }
    if (P.inconnu && this.garde.mode === 'demandee' && this.garde.vide && this.noms().length) this._alerter({ genre: 'inconnu', t: Date.now(), score: P.d });
  }
  // Garde automatique : quelqu'un le regarde ou le touche → la maison n'est plus vide.
  presence(pourquoi) { if (this.garde.on && this.garde.mode === 'auto') this._finGarde(pourquoi); }

  _evenement(e) {
    if (!this.garde.on) return;
    this.log(`Garde : entendu ${NOMS[e.genre] || e.genre} (score ${e.score.toFixed(2)})`);
    (this.garde.evenements = this.garde.evenements || []).push({ genre: e.genre, t: e.t || Date.now() }); this._sauverGarde();
    if (URGENT.includes(e.genre)) this._alerter(e);
  }
  async _alerter(e) {
    const now = Date.now();
    if (now - (this._alerteAt[e.genre] || 0) < ALERTE_ECART_MS) return;
    this._alerteAt[e.genre] = now;
    if (e.genre === 'inconnu') { (this.garde.evenements = this.garde.evenements || []).push({ genre: 'inconnu', t: now }); this._sauverGarde(); }
    const A = this.app, photo = A.settings.gardePhoto !== false && A.vision ? A.vision.snapshot(0.8, 1024) : null;
    const texte = NOMS[e.genre] || e.genre;
    const details = e.genre === 'inconnu' ? 'Wilson voit un visage qu\'il ne connaît pas alors que la maison est sous garde.' : `Wilson a entendu : ${texte}.`;
    if (!A.remote || !A.remote.on) { this.log(`ALERTE (${texte}) : pas d'e-mail possible, le script n'est pas relié sur cet appareil`); return; }
    const r = await this._script({ action: 'alerte', genre: e.genre, texte, details, photo, t: e.t || now, appareil: deviceName() });
    this.alertesN++;
    this.log(r && r.ok ? (r.envoye ? `ALERTE envoyée par e-mail : ${texte}${photo ? ' (avec une photo)' : ''}` : `Alerte pas envoyée : ${r.raison}`) : `ALERTE (${texte}) : e-mail impossible (${r ? r.erreur || 'script pas à jour' : 'script injoignable'})`);
  }

  // ---------- M1 : déposer ----------
  deposer({ pour, de = '', texte, soi = false, maison = false, apres = 0 }) {
    const hasard = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const id = soi || maison || apres ? `r_${apres ? Math.round(apres).toString(36) : ''}_${maison ? 'm' : ''}${soi ? 's' : ''}_${hasard}` : hasard;
    const m = { id, pour, de: soi ? '' : de || '', texte: String(texte).trim().slice(0, 600), t: Date.now(), par: deviceName(), remis: null, local: true,
      ...(soi ? { soi: true, auteur: de || '' } : {}), ...(maison ? { maison: true } : {}), ...(apres ? { apres: Math.round(apres) } : {}) };
    this.msgs.push(m); this._sauver();
    const { local, ...envoye } = m;
    this._envoi = this._script({ action: 'msg_deposer', msg: envoye }).then((r) => { if (r && r.ok) { m.local = false; this._sauver(); return true; } return false; }).catch(() => false);
    return m;
  }

  // ---------- les outils ----------
  async run(name, a = {}, { onPas } = {}) {
    if (name === 'messages') return this._outilMessages(a);
    if (name === 'visages') return this._outilVisages(a, onPas);
    if (name === 'garde') return this._outilGarde(a);
    if (name === 'agenda') return this._outilAgenda(a);
    return 'Outil inconnu.';
  }
  _parle() { const P = this.qui && !this.telephone ? this.qui.qui() : null; return this.telephone ? PROPRIO : P && P.sur ? P.nom : ''; }
  async _outilMessages({ action, pour = '', de = '', texte = '', aussi_pour_moi = false, a_la_maison = false, apres = '' }) {
    if (this.app.remote && this.app.remote.on && performance.now() - this._lireAt > 15000) await this.synchroniser().catch(() => {});
    const qui = this._parle();
    if (action === 'deposer') {
      const t = String(texte).trim(); if (!t) return 'Quel message ? Demande-lui de le redire.';
      const dest = this._destinataire(pour), noms = this.noms();
      if (!dest && noms.length) return `Je ne reconnais pas « ${pour} » : les visages que je connais sont ${noms.join(', ')}. Demande-lui pour qui est le message (un de ces prénoms, ou « tout le monde »).`;
      const soi = !!aussi_pour_moi, maison = !!a_la_maison || soi;
      let apresT = 0;
      if (apres) {
        const d = new Date(String(apres).trim());
        if (isNaN(d)) return `Heure illisible (« ${apres} ») : redonne apres au format 2026-11-05T18:00.`;
        apresT = d.getTime(); if (apresT < Date.now() - 60000) apresT = 0;                // heure déjà passée : dès que possible
      }
      const m = this.deposer({ pour: dest || joliNom(pour), de: de || qui, texte: t, soi, maison, apres: apresT });
      this.log(`${soi ? 'Rappel « quand je vous verrai » déposé' : 'Message déposé'} pour ${m.pour}${de || qui ? ' de ' + (de || qui) : ''}${apresT ? ` (pas avant ${heure(apresT)})` : ''}${maison ? ' (à la maison)' : ''} : ${t.slice(0, 80)}`, true);
      const partage = await this._envoi;
      const aPartir = apresT ? ` à partir de ${apresT - Date.now() < 20 * 3600000 && new Date(apresT).getDate() === new Date().getDate() ? heure(apresT) : jourDit(apresT) + ' ' + heure(apresT)}` : '';
      const ou = soi ? `la tablette du salon vous le dira quand elle verra ${m.pour === 'tous' ? 'l\'un de vous' : m.pour}${aPartir}`
        : this.telephone ? `la tablette du salon le lui dira quand elle le verra${aPartir}` : `je le dirai à ${m.pour === 'tous' ? 'la première personne de la famille' : m.pour} quand ${m.pour === 'tous' ? 'elle' : 'il ou elle'} me regardera${aPartir}`;
      if (!dest) return `Message gardé pour « ${m.pour} », mais je ne reconnais encore aucun visage : pour que je le remette, il faut m'apprendre le visage de ${m.pour} (« Wilson, apprends mon visage »). Dis-le simplement.`;
      if (this.telephone && !partage) return 'Message gardé sur le téléphone seulement : le script de Wilson n\'est pas encore à jour, la tablette ne peut pas le recevoir. Dis-le simplement.';
      return `Message déposé : ${ou}. Confirme en une phrase courte.`;
    }
    if (action === 'lire') {
      if (!qui) return 'Je ne sais pas qui me parle (visage pas reconnu) : demande-lui son prénom, puis rappelle l\'outil avec pour = ce prénom.';
      const l = this.enAttente(pour ? (this._destinataire(pour) || pour) : qui);
      if (!l.length) return `Aucun message en attente pour ${qui}.`;
      this.promis = { ids: l.map((m) => m.id), nom: qui, at: performance.now(), conv: this.app.convId };
      return `Messages pour ${qui} : ${l.map((m) => `${this._deQui(m)} : « ${m.texte} »`).join(' ; ')}. Dis-les-lui simplement.`;
    }
    // Statut, annuler : les messages pour ce destinataire ; sans destinataire, ceux que la personne qui parle a laissés.
    const dest = this._destinataire(pour) || (pour ? joliNom(pour) : '');
    const auteur = (m) => m.de || m.auteur || (metaMessage(m).soi && m.par === 'téléphone' ? PROPRIO : '');
    const miens = this.msgs.filter((m) => (dest ? norm(m.pour) === norm(dest) : !qui || norm(auteur(m)) === norm(qui))).slice(-5);
    if (action === 'statut') {
      if (!miens.length) return `Aucun message récent${dest ? ' pour ' + dest : ''}.`;
      return miens.map((m) => `pour ${m.pour} (${quand(m.t)}) « ${m.texte.slice(0, 80)} » : ${m.annule ? 'annulé' : m.remis ? `remis ${quand(m.remis.t)}${m.remis.a && m.remis.a !== m.pour ? ' à ' + m.remis.a : ''}` : 'pas encore remis'}`).join(' ; ') + '.';
    }
    if (action === 'annuler') {
      const m = miens.filter((x) => !x.remis && !x.annule).pop();
      if (!m) return 'Aucun message en attente à annuler.';
      m.annule = Date.now(); m.annuleLocal = true; this._sauver(); this.synchroniser().catch(() => {});
      return `Message pour ${m.pour} annulé (« ${m.texte.slice(0, 60)} »).`;
    }
    return 'Action inconnue.';
  }
  async _outilVisages({ action, prenom = '' }, onPas) {
    const Q = this.qui;
    if (!Q) return 'Pas de caméra sur cet appareil : je ne peux pas reconnaître les visages ici.';
    if (action === 'liste') return Q.liste().length ? `Visages que je reconnais (sur cet appareil) : ${Q.liste().join(', ')}.` : 'Je ne reconnais encore aucun visage.';
    if (action === 'qui') { const P = Q.qui(); return P && P.sur ? `Je vois ${P.nom}.` : P && P.inconnu ? 'Je vois quelqu\'un que je ne connais pas.' : 'Je ne sais pas qui me regarde (pas assez sûr).'; }
    if (action === 'oublier') {
      const p = Q.trouver(prenom);
      if (!p) return `Je ne connais pas de visage nommé « ${prenom} ».`;
      Q.oublier(p.nom); this.synchroniser().catch(() => {});
      return `Visage de ${p.nom} oublié (effacé de la tablette). Confirme en une phrase.`;
    }
    if (action === 'apprendre') {
      if (this.telephone) return 'Les visages s\'apprennent sur la tablette du salon (la caméra du téléphone ne sert pas à ça). Dis-le simplement.';
      if (!this.app.vision) return 'La caméra est coupée : je ne peux pas apprendre un visage.';
      const nom = joliNom(prenom); if (!nom) return 'Quel prénom ? Demande-lui.';
      const r = await Q.apprendre(nom, { onPas });
      if (!r.ok) return `Apprentissage raté : ${r.raison} Dis-le-lui simplement et propose de recommencer.`;
      this.synchroniser().catch(() => {});
      return `Visage de ${r.nom} appris (${r.n} empreintes, gardées sur la tablette seulement)${r.encore ? ', en plus de ce que je connaissais déjà' : ''}. Dis-lui en une phrase que tu le reconnaîtras maintenant.`;
    }
    return 'Action inconnue.';
  }
  async _outilGarde({ action }) {
    if (action === 'etat') return this.decrire(true);
    if (action === 'activer') {
      if (this.telephone) {
        const r = await this._script({ action: 'garde_ecrire', garde: { on: true, mode: 'demandee', t: Date.now(), par: deviceName() } });
        return r && r.ok ? 'Garde demandée : la tablette du salon la prendra dans la minute (si elle est allumée). Confirme en une phrase.' : 'Impossible de prévenir la tablette d\'ici (script de Wilson pas à jour ou pas de réseau). Dis-le simplement.';
      }
      this.activer('demandee', 'demandée à la voix');
      return 'Garde activée : dès que la pièce sera vide, j\'écoute la maison (fumée, verre brisé, alarme : e-mail à Timothée ; le reste, je vous le raconterai) et je signale un visage inconnu. Elle s\'arrête quand je reconnais quelqu\'un de la famille. Confirme en une phrase courte, sans tout détailler.';
    }
    if (action === 'arreter') {
      if (this.telephone) { const r = await this._script({ action: 'garde_ecrire', garde: { on: false, t: Date.now(), par: deviceName() } }); return r && r.ok ? 'Garde arrêtée.' : 'Impossible de prévenir la tablette d\'ici.'; }
      if (!this.garde.on) return 'La garde n\'était pas activée.';
      const resume = this._finGarde('arrêtée à la voix');
      if (resume) { const m = this.msgs.find((x) => x.de === 'Wilson' && !x.remis && x.texte === resume); if (m) { m.remis = { t: Date.now(), a: this._parle() || 'famille' }; m.remisLocal = true; this._sauver(); } }
      return `Garde arrêtée.${resume ? ' ' + resume + ' Dis-le simplement.' : ' Rien de spécial pendant l\'absence.'}`;
    }
    return 'Action inconnue.';
  }

  // ---------- L'agenda « Famille » (Google Agenda partagé, par le script de Timothée) ----------
  async _outilAgenda({ action, titre = '', debut = '', fin = '', journee = false, lieu = '', du = '', jours = 7, quand_meme = false }) {
    const R = this.app.remote;
    if (!R || !R.on) return 'L\'agenda Famille passe par le script de Wilson, qui n\'est pas relié sur cet appareil. Dis-le simplement.';
    const pasPret = (r) => !r ? 'Le script ne répond pas (réseau ?). Dis-le simplement.'
      : /action inconnue/.test(r.erreur || '') ? 'Le script de Wilson n\'a pas encore la partie agenda (mise à jour à faire). Dis-le simplement.'
        : /introuvable/.test(r.erreur || '') && action !== 'annuler' ? 'L\'agenda « Famille » est introuvable dans le Google Agenda de Timothée. Dis-le simplement.'
          : /autoris|permission|Authorization/i.test(r.erreur || '') ? 'Le script n\'a pas encore l\'autorisation d\'utiliser Google Agenda (lancer « essaiAgenda » dans l\'éditeur). Dis-le simplement.'
            : `Impossible (${r.erreur || 'erreur'}). Dis-le simplement.`;
    if (action === 'lire') {
      const r = await R.ask({ action: 'agenda_lire', du: JOUR_SEUL.test(String(du).slice(0, 10)) ? String(du).slice(0, 10) : '', jours: Math.max(1, Math.min(62, Math.round(+jours || 7))) }).catch(() => null);
      if (!r || !r.ok) return pasPret(r);
      const l = r.evenements || [];
      if (!l.length) return `Rien dans l'agenda Famille${du ? ' sur cette période' : ' ces ' + (jours || 7) + ' prochains jours'}.`;
      return `Agenda Famille : ${l.map((e) => `${jourDit(e.debut)}${e.journee ? (e.fin - e.debut > 86400000 * 1.5 ? ` au ${jourDit(e.fin - 1000)}` : ' (toute la journée)') : ' ' + heure(e.debut)} : ${e.titre}${e.lieu ? ' (' + e.lieu + ')' : ''}`).join(' ; ')}. Dis l'essentiel, simplement.`;
    }
    if (action === 'ajouter') {
      const t = String(titre).trim(); if (!t) return 'Quel titre ? Demande-lui ce qu\'il faut noter.';
      const qui = this._parle(), d = String(debut).trim(), entier = !!journee || JOUR_SEUL.test(d);
      const p = { action: 'agenda_ajouter', titre: t, lieu: String(lieu || ''), note: `Ajouté par Wilson${qui ? ' pour ' + qui : ''} le ${quand(Date.now()).replace(/^à /, "aujourd'hui à ")}.` };
      let quandDit;
      if (entier) {
        const j1 = d.slice(0, 10), j2 = String(fin || '').slice(0, 10);
        if (!JOUR_SEUL.test(j1)) return 'Quel jour ? Demande-lui la date.';
        Object.assign(p, { journee: true, debut: j1, fin: JOUR_SEUL.test(j2) && j2 > j1 ? j2 : '' });
        quandDit = p.fin ? `du ${jourDit(new Date(j1 + 'T12:00'))} au ${jourDit(new Date(p.fin + 'T12:00'))}` : `${jourDit(new Date(j1 + 'T12:00'))}, toute la journée`;
        if (new Date(j1 + 'T23:59') < Date.now()) return `Le ${jourDit(new Date(j1 + 'T12:00'))} est déjà passé : vérifie la date avec lui avant d'ajouter.`;
      } else {
        const t1 = new Date(d.length === 16 ? d + ':00' : d);
        if (!d || isNaN(t1)) return 'Quel jour et à quelle heure ? Demande-lui.';
        if (+t1 < Date.now() - 3600000) return `Le ${jourDit(t1)} à ${heure(t1)} est déjà passé : vérifie la date avec lui avant d'ajouter.`;
        const t2 = fin ? new Date(String(fin).length === 16 ? fin + ':00' : fin) : null;
        Object.assign(p, { debut: +t1, fin: t2 && !isNaN(t2) && t2 > t1 ? +t2 : '' });
        quandDit = `${jourDit(t1)} à ${heure(t1)}`;
      }
      if (quand_meme === true || quand_meme === 'true') p.quand_meme = true;
      const r = await R.ask(p).catch(() => null);
      if (!r || !r.ok) return pasPret(r);
      // Déjà quelque chose de prévu (agenda Famille ou ses agendas à lui) : rien n'est ajouté, Wilson prévient (06/11/26).
      if (r.conflit) {
        const l = (r.conflits || []).slice(0, 4).map((e) => `« ${e.titre || 'sans titre'} »${e.journee ? ' (toute la journée)' : ` de ${heure(e.debut)} à ${heure(e.fin)}`}${e.agenda && norm(e.agenda) !== 'famille' ? ` (agenda ${e.agenda})` : ''}`);
        this.log(`Agenda Famille : « ${t} », ${quandDit} : déjà prévu ${l.join(', ')} → pas ajouté, on demande`, true);
        return `PAS AJOUTÉ : il y a déjà quelque chose de prévu ${entier ? 'ce jour-là' : 'à ce moment-là'} : ${l.join(' ; ')}. Préviens-le en une phrase (ce qui est prévu et l'heure) et demande s'il veut quand même ajouter « ${t} ». S'il dit oui : rappelle agenda (ajouter) avec les mêmes informations et quand_meme = true.`;
      }
      (this.ajouts = (this.ajouts || []).filter((x) => Date.now() - x.t < 86400000)).push({ id: r.id, titre: t, t: Date.now(), quandDit });
      this.log(`Agenda Famille : ajouté « ${t} », ${quandDit}`, true);
      return `Ajouté dans l'agenda Famille (Timothée et Camille le voient tous les deux) : « ${t} », ${quandDit}${lieu ? ', ' + lieu : ''}. Confirme en une phrase en redisant le jour et l'heure (il peut te demander d'annuler si c'est faux).`;
    }
    if (action === 'annuler') {
      const l = (this.ajouts || []).filter((x) => Date.now() - x.t < 86400000);
      const x = (titre ? l.filter((y) => norm(y.titre).includes(norm(titre)) || norm(titre).includes(norm(y.titre))) : l).pop();
      if (!x) return 'Je ne peux annuler que ce que je viens d\'ajouter (dans les dernières 24 heures) ; le reste se modifie dans Google Agenda. Dis-le simplement.';
      const r = await R.ask({ action: 'agenda_annuler', id: x.id }).catch(() => null);
      if (!r || !r.ok) return pasPret(r);
      this.ajouts = this.ajouts.filter((y) => y !== x);
      this.log(`Agenda Famille : annulé « ${x.titre} »`, true);
      return `Annulé : « ${x.titre} » (${x.quandDit}) n'est plus dans l'agenda Famille.`;
    }
    return 'Action inconnue.';
  }

  decrire(pourGemini = false) {
    const G = this.garde, ev = G.evenements || [];
    if (!G.on) return pourGemini ? 'La garde n\'est pas activée.' : `non${this.oreille.panne ? ' (oreille en panne : ' + this.oreille.panne + ')' : ''}`;
    const txt = `activée (${G.mode === 'auto' ? 'automatique' : 'demandée'}) depuis ${heure(G.depuis || Date.now())}${G.vide ? ', pièce vide' : ', la pièce n\'est pas encore vide'}${ev.length ? `, noté : ${ev.map((e) => `${NOMS[e.genre] || e.genre} à ${heure(e.t)}`).join(', ')}` : ', rien de noté'}`;
    return pourGemini ? `Garde ${txt}.` : `${txt}${this.oreille.on ? `, oreille ${this.oreille.ready ? `prête (${this.oreille.stats.n} analyses, ${Math.round(this.oreille.stats.ms)} ms)` : 'en chargement'}` : ''}${this.alertesN ? `, ${this.alertesN} alerte(s)` : ''}`;
  }
  decrireMessages() {
    const att = this.msgs.filter((m) => !m.remis && !m.annule);
    return `${att.length} en attente${att.length ? ' (pour ' + [...new Set(att.map((m) => m.pour))].join(', ') + ')' : ''}, ${this.msgs.filter((m) => m.remis).length} remis ; partage : ${this.app.remote && this.app.remote.on ? this.etatScript || 'pas encore vérifié' : 'pas de script'}`;
  }
}
