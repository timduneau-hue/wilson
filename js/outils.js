// Wilson — plus d'outils (PLAN.md, section 7 quater) : afficher à l'écran, minuteurs, rappels, météo, liste de courses.
// Tout est gratuit et sans nouvelle clé : Wikipédia (images), Open-Meteo (météo), Home Assistant (liste de courses).

import { ecrireLocal } from './stockage.js';
import { deviceName } from './remote.js';

const S = { type: 'STRING' }, N = { type: 'NUMBER' };
export const OUTILS = [
  { name: 'afficher', behavior: 'BLOCKING',
    description: "Montre quelque chose sur l'écran, par-dessus ton visage. SEULEMENT quand on te le demande : « montre-moi », « affiche », « mets-le par écrit », « écris-le à l'écran », « fais-moi voir », ou une photo (« montre-moi un koala »). Jamais de toi-même : ni message d'attente, ni résultat de recherche, ni réponse longue (dis-la à voix haute). Une photo reste 5 s ; un texte demandé reste jusqu'à ce qu'on le ferme.",
    parameters: { type: 'OBJECT', properties: {
      titre: S,
      texte: { type: 'STRING', description: 'le contenu demandé ; une ligne par élément ; « - » au début pour une puce, « 1. » pour une étape' },
      image: { type: 'STRING', description: "ce qu'il faut illustrer par une photo (cherchée sur Wikipédia), ex. « koala », « tour Eiffel » ; vide sinon" } }, required: ['titre'] } },
  { name: 'fermer_ecran', behavior: 'BLOCKING', description: "Ferme ce qui est affiché à l'écran." },   // sans paramètres : un objet vide est refusé par Google (tests/e2e_conn.py)
  { name: 'reafficher', behavior: 'BLOCKING',   // demande de Timothée du 04/11/26 (« réaffiche la photo, j'ai pas eu le temps de voir »)
    description: "Réaffiche ce qui vient d'être montré (photo, météo, texte), plus longtemps : « réaffiche la photo », « remontre-moi la météo, j'ai pas eu le temps de voir ». Jamais pour « répète » ou « tu peux répéter ? » : là, redis simplement ta dernière phrase. duree_sec : combien de temps s'il le dit (60 s sinon).",
    parameters: { type: 'OBJECT', properties: { duree_sec: N } } },
  { name: 'minuteur', behavior: 'BLOCKING',
    description: "Minuteurs (compte à rebours visible, sonnerie à la fin) : lancer (duree_sec, nom facultatif : « pâtes »), annuler (nom, ou le dernier), liste.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['lancer', 'annuler', 'liste'] }, duree_sec: N, nom: S }, required: ['action'] } },
  { name: 'rappel', behavior: 'BLOCKING',
    description: "Rappels à une heure précise (« rappelle-moi à 18h de sortir les poubelles », « demain à 8h ») : ajouter (quand = date et heure locales au format 2026-10-30T18:00, texte), annuler (texte), liste. La tablette doit rester allumée.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['ajouter', 'annuler', 'liste'] }, quand: S, texte: S }, required: ['action'] } },
  { name: 'meteo', behavior: 'BLOCKING',
    description: "Météo actuelle et des prochains jours (jusqu'à 7), affichée à l'écran. ville vide = la maison.",
    parameters: { type: 'OBJECT', properties: { ville: S, jours: N } } },
  { name: 'courses', behavior: 'BLOCKING',
    description: "Liste de courses de la maison : ajouter (articles), retirer (articles), cocher (articles achetés), lire, afficher (à l'écran), vider (enlève les articles cochés).",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['ajouter', 'retirer', 'cocher', 'lire', 'afficher', 'vider'] }, articles: { type: 'ARRAY', items: S } }, required: ['action'] } },
  { name: 'idees', behavior: 'BLOCKING',
    description: "Ses idées (« note cette idée », « écris ça quelque part », « qu'est-ce que j'ai noté ? », « envoie-moi mes idées ») : noter (texte = l'idée mise au propre, sans rien inventer), lire (les dernières), afficher (à l'écran), envoyer (par e-mail à Timothée, avec le lien du document). Elles sont rangées dans le document Google « Wilson — mes idées » de son Drive.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['noter', 'lire', 'afficher', 'envoyer'] }, texte: S }, required: ['action'] } },
  { name: 'bourse', behavior: 'BLOCKING',   // demande de Timothée du 11/11/26 : « que Wilson ait accès à mon suivi bourse »
    description: "Son suivi bourse (feuille Google de son Drive, en lecture seule) : PEA chez Bourse Direct (capital versé, liquidités, date d'ouverture), chaque action (quantité, PRU, cours, variation du jour, valorisation, plus ou moins-value, limite de vente), totaux, historique quotidien (tout vendu frais déduits, écart avec le capital, gain net si retrait, statut du coussin) et son LDD. Pour TOUTE question sur sa bourse, son PEA, ses actions, ses plus-values, son LDD : appelle-le d'abord, tu n'en connais aucun chiffre par cœur. action : lire (par défaut), ou afficher s'il demande de le voir à l'écran.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['lire', 'afficher'] } } } },
  { name: 'mail_envoyer', behavior: 'BLOCKING',   // demande de Timothée du 11/11/26 (e-mails) : rien ne part sans son « oui »
    description: "Envoie le brouillon d'e-mail (Gmail personnel) que Claude vient de préparer avec l'outil mails. SEULEMENT après lui avoir relu le destinataire et le texte, lui avoir demandé « Je l'envoie ? » et avoir entendu son « oui » clair. action : envoyer ; annuler s'il dit non ou veut le changer (pour le changer, rappelle ensuite mails avec sa correction). Jamais pour la boîte pro : ses brouillons pro restent dans Outlook, il les envoie lui-même.",
    parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['envoyer', 'annuler'] } }, required: ['action'] } },
  { name: 'remarque', behavior: 'BLOCKING',
    description: "Remarque de Timothée sur ton fonctionnement, pour ta prochaine mise à jour (un bug, une fonction qui manque, une façon de répondre à changer) : texte = sa remarque mise au propre, avec le contexte utile. Une seule fois par remarque. Une correction qui vaut pour toujours (la prononciation d'un nom, la façon d'appeler quelqu'un) : appelle AUSSI memoriser, pour l'appliquer dès maintenant. Ensuite, dis seulement « C'est noté. », puis réponds au reste de ce qu'il a dit ou écoute la suite.",
    parameters: { type: 'OBJECT', properties: { texte: S }, required: ['texte'] } },
  { name: 'mes_remarques', behavior: 'BLOCKING',   // accord de Timothée du 01/11/26 (« je t'avais demandé de noter des choses hier »)
    description: "Relire les remarques que Timothée t'a faites pour tes mises à jour (« qu'est-ce que je t'ai demandé de changer ? », « tu te rappelles ce que je t'ai fait noter hier ? »), avec leur date." },
];
export const OUTILS_NAMES = OUTILS.map((t) => t.name);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const pad = (n) => String(n).padStart(2, '0');
const PHOTO_MS = 5000;   // photo seule à l'écran : 5 s (remarque de Timothée du 01/11/26)
// Règle de Timothée du 04/11/26 : photos, météo et autres images 5 s par défaut (« réaffiche » pour les revoir plus
// longtemps) ; du texte à l'écran seulement s'il le demande (« montre-moi », « affiche », « mets-le par écrit »).
const IMAGE_MS = 5000, REAFFICHE_MS = 60000;
const plat = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’ʼ]/g, "'");
export const DEMANDE_ECRAN = /(montr|affich|par ecrit|ecri[st]\b|ecrire|a l'?ecran|sur l'?ecran|sur ton ecran|fais(-| )?(moi )?voir|que je (le |la |les )?voie|je veux (le |la |les )?voir|fais-moi une liste|note(-le)? a l'ecran)/;
export const demandeEcran = (t) => DEMANDE_ECRAN.test(plat(t));
const KEY_M = 'wilson.minuteurs', KEY_R = 'wilson.rappels', KEY_C = 'wilson.courses', KEY_I = 'wilson.idees';
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
const ecrire = ecrireLocal;   // W18 : un échec est noté au journal (js/stockage.js)

// Codes météo WMO → mot et pictogramme.
const WMO = [[0, 'ensoleillé', '☀️'], [1, 'plutôt ensoleillé', '🌤️'], [2, 'nuageux', '⛅'], [3, 'couvert', '☁️'], [45, 'brouillard', '🌫️'], [48, 'brouillard givrant', '🌫️'],
  [51, 'bruine', '🌦️'], [53, 'bruine', '🌦️'], [55, 'bruine forte', '🌧️'], [61, 'pluie faible', '🌦️'], [63, 'pluie', '🌧️'], [65, 'forte pluie', '🌧️'],
  [66, 'pluie verglaçante', '🌧️'], [67, 'pluie verglaçante', '🌧️'], [71, 'neige faible', '🌨️'], [73, 'neige', '🌨️'], [75, 'forte neige', '❄️'], [77, 'grésil', '🌨️'],
  [80, 'averses', '🌦️'], [81, 'averses', '🌧️'], [82, 'fortes averses', '⛈️'], [85, 'averses de neige', '🌨️'], [86, 'averses de neige', '🌨️'], [95, 'orage', '⛈️'], [96, 'orage et grêle', '⛈️'], [99, 'orage et grêle', '⛈️']];
const wmo = (c) => WMO.find((w) => w[0] === c) || [c, 'temps variable', '🌡️'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export class Outils {
  constructor(app) {
    this.app = app;
    this.minuteurs = lire(KEY_M, []).filter((m) => m.fin > Date.now() - 60000);
    this.rappels = lire(KEY_R, []).filter((r) => r.quand > Date.now() - 3600000);
    this._sonne = null;
    setInterval(() => this._tic(), 1000);
    this._tic();
  }
  log(m, imp) { this.app.log(m, imp); }

  // Un appel d'outil → texte pour Gemini.
  async run(name, a = {}) {
    switch (name) {
      case 'afficher': return this.afficher(a);
      case 'fermer_ecran': this.fermer(); return 'Écran fermé.';
      case 'reafficher': return this.reafficher(a);
      case 'minuteur': return this.minuteur(a);
      case 'rappel': return this.rappel(a);
      case 'meteo': return this.meteo(a);
      case 'courses': return this.courses(a);
      case 'idees': return this.idees(a);
      case 'bourse': return this.bourse(a);
      case 'mail_envoyer': return this.mailEnvoyer(a);
      case 'remarque': return this.remarque(a);
      case 'mes_remarques': return this.mesRemarques();
      default: return 'Outil inconnu.';
    }
  }

  // ---------- F1 : l'écran ----------
  _montrer(html, { titre = '', large = false, ms = 90000, garder = true } = {}) {   // demande du 30/10/26 : l'écran s'efface tout seul
    const el = $('ecran'); if (!el) return;
    if (garder) this._dernier = { html, titre, large, ms };       // pour « réaffiche » (04/11/26)
    el.innerHTML = `<div class="ecran-in${large ? ' large' : ''}"><div class="ecran-h"><div class="ecran-t">${esc(titre)}</div><button class="ecran-x" type="button" aria-label="Fermer">×</button></div><div class="ecran-b">${html}</div></div>`;
    el.hidden = false;
    el.querySelector('.ecran-x').addEventListener('click', () => this.fermer());
    clearTimeout(this._ecranT); this._ecranMs = ms; this._ecranT = setTimeout(() => this.fermer(), ms);
  }
  reafficher({ duree_sec } = {}) {
    const D = this._dernier;
    if (!D) return "Rien à réafficher : rien n'a été montré depuis le démarrage. Dis-le simplement.";
    const ms = Math.min(600000, Math.max(5000, Math.round((Number(duree_sec) || 0) * 1000) || REAFFICHE_MS));
    this._montrer(D.html, { titre: D.titre, large: D.large, ms, garder: false });
    this.log(`Écran : réaffiché « ${String(D.titre).slice(0, 60)} » pendant ${Math.round(ms / 1000)} s`, true);
    return `Réaffiché à l'écran pendant ${Math.round(ms / 1000)} s. Dis seulement « Voilà. »`;
  }
  // A-t-il demandé à voir quelque chose à l'écran ? (ce qu'il a dit ces 25 dernières secondes ; la transcription arrive
  // parfois juste après l'appel de l'outil : on l'attend jusqu'à 1,5 s)
  async _demande() {
    const dit = () => (this.app._entenduRecent ? this.app._entenduRecent(25000) : '');
    for (let i = 0; i < 6 && !demandeEcran(dit()); i++) await new Promise((r) => setTimeout(r, 250));
    return demandeEcran(dit());
  }
  fermer() { const el = $('ecran'); if (el) { el.hidden = true; el.innerHTML = ''; } clearTimeout(this._ecranT); }
  get ouvert() { const el = $('ecran'); return !!(el && !el.hidden); }

  _texteHtml(t) {
    const lignes = String(t || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let html = '', liste = null;
    const fermer = () => { if (liste) { html += `</${liste}>`; liste = null; } };
    for (const l of lignes) {
      const p = l.match(/^[-•*]\s+(.*)$/), n = l.match(/^(\d+)[.)]\s+(.*)$/);
      if (p) { if (liste !== 'ul') { fermer(); html += '<ul>'; liste = 'ul'; } html += `<li>${esc(p[1])}</li>`; }
      else if (n) { if (liste !== 'ol') { fermer(); html += '<ol>'; liste = 'ol'; } html += `<li>${esc(n[2])}</li>`; }
      else { fermer(); html += `<p>${esc(l)}</p>`; }
    }
    fermer(); return html;
  }
  async afficher({ titre = '', texte = '', image = '' }) {
    // Règle de Timothée du 04/11/26 : « si je te demande rien, tu l'affiches pas » (journal, 13h25 : « Recherche CRM »
    // affiché de lui-même pendant une recherche, « je m'en fous de ça »). Le texte ne s'affiche que s'il l'a demandé.
    const demande = texte ? await this._demande() : true;
    if (texte && !demande) {
      this.log(`Écran : texte « ${String(titre).slice(0, 60)} » pas affiché (pas demandé)${image ? ', photo seule' : ''}`);
      texte = '';
      if (!image) return "Pas affiché : il ne t'a pas demandé de l'écrire à l'écran. Dis-le à voix haute, brièvement. Tu ne l'affiches que s'il te dit « montre-moi », « affiche » ou « mets-le par écrit ».";
    }
    let img = null;
    if (image) img = await this._image(image).catch(() => null);
    const html = (img ? `<figure class="ecran-img"><img src="${esc(img.src)}" alt="${esc(img.titre)}"><figcaption>${esc(img.titre)} — Wikipédia</figcaption></figure>` : '') + this._texteHtml(texte);
    if (!html) return image ? `Pas de photo trouvée pour « ${image} » : dis-le simplement.` : "Rien à afficher : il faut un texte ou une image.";
    const lignes = String(texte || '').split(/\n+/).filter((l) => l.trim()).length;
    // Photo : 5 s (remarques du 01/11/26 et du 04/11/26) ; texte demandé : 90 s, 4 min s'il est long.
    this._montrer(html, { titre, large: !!img && !texte, ms: !texte ? IMAGE_MS : lignes > 8 ? 4 * 60000 : 90000 });
    this.log(`Écran : « ${String(titre).slice(0, 60)} »${img ? ' + image ' + img.titre : image ? ' (image introuvable)' : ''}${texte ? '' : ' (5 s)'}`, true);
    return `Affiché à l'écran${image && !img ? ` (sans image : rien trouvé pour « ${image} »)` : img ? ` avec une photo de « ${img.titre} »` : ''}${texte ? '' : ', pendant 5 secondes (il peut te dire « réaffiche » pour la revoir plus longtemps)'}. Ne relis pas tout : dis l'essentiel en une phrase.`;
  }
  async _image(sujet) {
    // D'abord l'article qui porte ce nom (« vaisselle » → Vaisselle), sinon une recherche (journal du 30/10/26 : « la
    // vaisselle » avait donné la photo de l'article « Marche en avant »).
    const nom = String(sujet).trim().replace(/^(une?|la|le|les|l'|des|du)\s+/i, '');
    try {
      const r = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nom.charAt(0).toUpperCase() + nom.slice(1))}`);
      if (r.ok) { const j = await r.json(); if (j.type !== 'disambiguation' && j.thumbnail && j.thumbnail.source) return { src: (j.originalimage && j.originalimage.width <= 1600 ? j.originalimage.source : j.thumbnail.source), titre: j.title }; }
    } catch (_) {}
    const u = `https://fr.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(nom)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*`;
    const j = await fetch(u).then((r) => r.json());
    const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
    const p = pages.find((x) => x.thumbnail && x.thumbnail.source);
    return p ? { src: p.thumbnail.source, titre: p.title } : null;
  }

  // ---------- F2 : minuteurs ----------
  minuteur({ action, duree_sec, nom = '' }) {
    const now = Date.now();
    if (action === 'lancer') {
      const d = Math.round(Number(duree_sec) || 0);
      if (d < 3 || d > 24 * 3600) return 'Durée impossible : demande-lui combien de temps.';
      const m = { id: 'm' + now, nom: String(nom || '').trim(), fin: now + d * 1000, duree: d };
      this.minuteurs.push(m); this._sauver(); this._tic();
      this.log(`Minuteur lancé : ${m.nom || 'sans nom'}, ${this._duree(d)}`, true);
      return `Minuteur${m.nom ? ' « ' + m.nom + ' »' : ''} lancé pour ${this._duree(d)} (fin à ${this._heure(m.fin)}). Il est affiché en haut de l'écran.`;
    }
    if (action === 'annuler') {
      if (this._sonne) { this._arreterSonnerie(); return 'Sonnerie arrêtée.'; }
      if (!this.minuteurs.length) return 'Aucun minuteur en cours.';
      const n = norm(nom), m = (n && this.minuteurs.find((x) => norm(x.nom).includes(n))) || this.minuteurs[this.minuteurs.length - 1];
      this.minuteurs = this.minuteurs.filter((x) => x !== m); this._sauver(); this._tic();
      return `Minuteur${m.nom ? ' « ' + m.nom + ' »' : ''} annulé.`;
    }
    if (!this.minuteurs.length) return 'Aucun minuteur en cours.';
    return this.minuteurs.map((m) => `${m.nom || 'minuteur'} : reste ${this._duree(Math.round((m.fin - now) / 1000))}`).join(' ; ');
  }
  _sauver() { ecrire(KEY_M, this.minuteurs); ecrire(KEY_R, this.rappels); }
  _duree(s) {
    s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return [h ? `${h} h` : '', m ? `${m} min` : '', x && !h ? `${x} s` : ''].filter(Boolean).join(' ') || '0 s';
  }
  _heure(t) { const d = new Date(t); return `${d.getHours()}h${pad(d.getMinutes())}`; }

  // Chaque seconde : affichage des minuteurs, fin des minuteurs, rappels arrivés.
  _tic() {
    const now = Date.now(), el = $('minuteurs');
    for (const m of this.minuteurs.filter((x) => x.fin <= now)) {
      this.minuteurs = this.minuteurs.filter((x) => x !== m); this._sauver();
      this._sonner(`${m.nom ? 'Le minuteur « ' + m.nom + ' »' : 'Le minuteur'} est terminé !`, `⏰ ${m.nom || 'Minuteur'} : terminé`);
    }
    for (const r of this.rappels.filter((x) => x.quand <= now)) {
      this.rappels = this.rappels.filter((x) => x !== r); this._sauver();
      this._sonner(`Rappel : ${r.texte}`, `🔔 ${r.texte}`);
    }
    if (!el) return;
    if (!this.minuteurs.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = this.minuteurs.slice().sort((a, b) => a.fin - b.fin).map((m) => {
      const s = Math.max(0, Math.round((m.fin - now) / 1000)), h = Math.floor(s / 3600), mn = Math.floor((s % 3600) / 60), x = s % 60;
      return `<div class="mn"><span class="mn-t">${h ? h + ':' + pad(mn) : mn}:${pad(x)}</span>${m.nom ? `<span class="mn-n">${esc(m.nom)}</span>` : ''}</div>`;
    }).join('');
  }

  // Sonnerie (jusqu'à un toucher, « stop », ou 60 s), phrase dite par la voix de la tablette, carte à l'écran.
  _sonner(phrase, titre) {
    const app = this.app;
    this.log(`Alarme : ${phrase}`, true);
    this._montrer(`<p class="alarme">${esc(phrase)}</p><p class="fine">Touche l'écran pour arrêter.</p>`, { titre, ms: 10 * 60000, garder: false });
    const el = $('ecran'); if (el) el.addEventListener('click', () => this._arreterSonnerie(), { once: true });
    if (this._sonne) clearInterval(this._sonne.t);
    const t0 = Date.now();
    const bip = () => {
      const c = app.audio && app.audio.ctx; if (!c) return;
      try {
        const out = app.audio.out || c.destination, s = c.currentTime + 0.02;
        [880, 1175, 880, 1175].forEach((hz, i) => {
          const o = c.createOscillator(), g = c.createGain(), t = s + i * 0.22;
          o.frequency.value = hz; o.type = 'square'; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.21);
        });
      } catch (_) {}
    };
    bip();
    this._sonne = { t: setInterval(() => { if (Date.now() - t0 > 60000) this._arreterSonnerie(); else bip(); }, 2500) };
    if (app.state !== 'conversation' || !app.brain || !app.brain.open) setTimeout(() => { try { app.voice.speak(phrase); } catch (_) {} }, 1200);
    else try { app.brain.sendText(`[Alarme de la tablette : « ${phrase} ». Préviens-le en une phrase.]`); } catch (_) {}
    try { app.face.play('bounce'); app.face.setEmotion('surprise', 3000, 0.8); } catch (_) {}
  }
  _arreterSonnerie() { if (this._sonne) { clearInterval(this._sonne.t); this._sonne = null; this.log('Alarme arrêtée'); } }
  get sonne() { return !!this._sonne; }

  // ---------- F3 : rappels ----------
  rappel({ action, quand = '', texte = '' }) {
    const now = Date.now();
    if (action === 'ajouter') {
      const t = Date.parse(String(quand).replace(' ', 'T'));
      if (!texte) return 'Il manque ce qu\'il faut rappeler.';
      if (!Number.isFinite(t)) return "Heure incompréhensible : redemande l'heure (et le jour).";
      if (t < now - 60000) return 'Cette heure est déjà passée : demande-lui de préciser le jour.';
      const r = { id: 'r' + now, quand: t, texte: String(texte).trim() };
      this.rappels.push(r); this._sauver();
      const d = new Date(t), auj = new Date(), dem = new Date(Date.now() + 86400000);
      const jour = d.toDateString() === auj.toDateString() ? "aujourd'hui" : d.toDateString() === dem.toDateString() ? 'demain' : `${JOURS[d.getDay()]} ${d.getDate()}/${pad(d.getMonth() + 1)}`;
      this.log(`Rappel ajouté : ${jour} ${this._heure(t)} — ${r.texte}`, true);
      // Journal du 05/11/26, 09h41 (rappel dicté en voiture, sur le téléphone) : « La tablette doit rester allumée » était
      // faux ; il sonne sur l'appareil où il a été dicté, si Wilson y est ouvert à cette heure-là.
      const ici = deviceName() === 'téléphone' ? 'Il sonnera sur ce téléphone si Wilson y est ouvert à cette heure-là : dis-le-lui.' : 'La tablette doit rester allumée.';
      return `Rappel noté pour ${jour} à ${this._heure(t)} : « ${r.texte} ». (${ici})`;
    }
    if (action === 'annuler') {
      const n = norm(texte), r = this.rappels.find((x) => n && norm(x.texte).includes(n)) || (this.rappels.length === 1 ? this.rappels[0] : null);
      if (!r) return this.rappels.length ? `Lequel ? ${this.rappels.map((x) => x.texte).join(' ; ')}` : 'Aucun rappel.';
      this.rappels = this.rappels.filter((x) => x !== r); this._sauver();
      return `Rappel « ${r.texte} » annulé.`;
    }
    if (!this.rappels.length) return 'Aucun rappel prévu.';
    return this.rappels.slice().sort((a, b) => a.quand - b.quand).map((r) => `${new Date(r.quand).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} à ${this._heure(r.quand)} : ${r.texte}`).join(' ; ');
  }

  // ---------- F4 : météo ----------
  async meteo({ ville = '', jours = 3 }) {
    const nom = String(ville || this.app.settings.city || '').trim();
    if (!nom) return "Je ne connais pas la ville de la maison (Réglages → Ville) : demande-lui la ville.";
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr&countryCode=FR`).then((r) => r.json()).catch(() => null);
    const lieu = g && g.results && g.results[0] || (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr`).then((r) => r.json()).catch(() => ({}))).results?.[0];
    if (!lieu) return `Ville « ${nom} » introuvable.`;
    const n = Math.max(1, Math.min(7, Math.round(Number(jours) || 3)));
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&hourly=precipitation_probability&forecast_hours=12&timezone=Europe%2FParis&forecast_days=${n}`;
    const m = await fetch(u).then((r) => r.json());
    const c = m.current, d = m.daily, [, motC, icoC] = wmo(c.weather_code);
    const pluieH = (m.hourly && m.hourly.precipitation_probability || []).slice(0, 12), maxH = Math.max(0, ...pluieH);
    const jl = d.time.map((t, i) => {
      const dt = new Date(t + 'T12:00'), [, mot, ico] = wmo(d.weather_code[i]);
      return { nom: i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : JOURS[dt.getDay()].replace(/^./, (x) => x.toUpperCase()), mot, ico, max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), pluie: d.precipitation_probability_max[i] };
    });
    const html = `<div class="meteo-now"><span class="meteo-ico">${icoC}</span><span class="meteo-t">${Math.round(c.temperature_2m)}°</span><span class="meteo-m">${esc(motC)}<br><small>ressenti ${Math.round(c.apparent_temperature)}°, vent ${Math.round(c.wind_speed_10m)} km/h</small></span></div>`
      + `<div class="meteo-j">${jl.map((j) => `<div class="mj"><div class="mj-n">${esc(j.nom)}</div><div class="mj-i">${j.ico}</div><div class="mj-t">${j.max}° <small>${j.min}°</small></div><div class="mj-p">💧 ${j.pluie ?? '—'} %</div></div>`).join('')}</div>`;
    this._montrer(html, { titre: `Météo — ${lieu.name}`, ms: IMAGE_MS });   // 5 s (règle du 04/11/26)
    this.log(`Météo : ${lieu.name}, ${Math.round(c.temperature_2m)}°, ${motC}`, true);
    return `Météo à ${lieu.name} (affichée 5 s à l'écran ; « réaffiche » pour la revoir). Maintenant : ${Math.round(c.temperature_2m)}°, ${motC}, ressenti ${Math.round(c.apparent_temperature)}°, vent ${Math.round(c.wind_speed_10m)} km/h ; risque de pluie dans les 12 heures : ${maxH} %. `
      + jl.map((j) => `${j.nom} : ${j.mot}, ${j.min} à ${j.max}°, pluie ${j.pluie} %`).join(' ; ') + '. Résume à l\'oral en une ou deux phrases.';
  }

  // ---------- F5 : liste de courses (Home Assistant, sinon sur l'appareil) ----------
  async _liste() {
    const M = this.app.maison;
    if (M && M.on) {
      const r = await M._fetch('/api/shopping_list');
      if (r.ok && Array.isArray(r.json)) return { ha: true, items: r.json.map((x) => ({ id: x.id, name: x.name, complete: !!x.complete })) };
    }
    return { ha: false, items: lire(KEY_C, []) };
  }
  async courses({ action, articles = [] }) {
    const M = this.app.maison, L = await this._liste(), arts = (articles || []).map((x) => String(x).trim()).filter(Boolean);
    const trouve = (a) => L.items.find((x) => norm(x.name) === norm(a)) || L.items.find((x) => norm(x.name).includes(norm(a)) || norm(a).includes(norm(x.name)));
    const local = () => ecrire(KEY_C, L.items);
    if (action === 'ajouter') {
      if (!arts.length) return 'Quoi ajouter ?';
      for (const a of arts) {
        const deja = trouve(a);
        if (deja && !deja.complete) continue;
        if (L.ha) await M._fetch('/api/shopping_list/item', { method: 'POST', body: { name: a } });
        else L.items.push({ id: 'c' + Date.now() + Math.random(), name: a, complete: false });
      }
      if (!L.ha) local();
      return `Ajouté à la liste de courses : ${arts.join(', ')}.`;
    }
    if (action === 'retirer' || action === 'cocher') {
      const faits = [];
      for (const a of arts) {
        const x = trouve(a); if (!x) continue; faits.push(x.name);
        if (L.ha) await M._fetch(`/api/shopping_list/item/${x.id}`, { method: 'POST', body: { complete: true } });
        else x.complete = true;
      }
      if (L.ha && action === 'retirer' && faits.length) await M._fetch('/api/shopping_list/clear_completed', { method: 'POST' });
      if (!L.ha) { if (action === 'retirer') L.items = L.items.filter((x) => !faits.includes(x.name)); local(); }
      return faits.length ? `${action === 'retirer' ? 'Retiré' : 'Coché'} : ${faits.join(', ')}.` : `Pas trouvé dans la liste : ${arts.join(', ')}.`;
    }
    if (action === 'vider') {
      if (L.ha) await M._fetch('/api/shopping_list/clear_completed', { method: 'POST' });
      else { L.items = L.items.filter((x) => !x.complete); local(); }
      return 'Articles cochés enlevés de la liste.';
    }
    const reste = L.items.filter((x) => !x.complete), coches = L.items.filter((x) => x.complete);
    if (action === 'afficher') {                     // seulement s'il le demande (règle du 04/11/26)
      this._montrer(`<ul class="courses">${reste.map((x) => `<li>${esc(x.name)}</li>`).join('')}${coches.map((x) => `<li class="fait">${esc(x.name)}</li>`).join('')}</ul>${L.items.length ? '' : '<p>La liste est vide.</p>'}`, { titre: '🛒 Liste de courses' });
    }
    if (!reste.length) return 'La liste de courses est vide.';
    return `Liste de courses (${reste.length}) : ${reste.map((x) => x.name).join(', ')}.${action === 'afficher' ? ' Elle est affichée à l\'écran.' : ''}`;
  }

  // ---------- F7 : le suivi bourse (feuille Google de Timothée, lue par son script ; réservé à Timothée comme le CRM) ----------
  async bourse({ action = 'lire' } = {}) {
    const A = this.app, R = A.remote;
    const aut = typeof A._crmAutorise === 'function' ? A._crmAutorise() : { ok: false };
    if (!aut.ok) {
      this.log(`Bourse refusée : ${aut.qui ? `c'est ${aut.qui} qui me regarde` : 'je ne reconnais pas Timothée'} — réservée à Timothée`, true);
      return `REFUSÉ : sa bourse est privée, réservée à Timothée${aut.qui ? `, et c'est ${aut.qui} qui te regarde` : ', et tu ne reconnais pas son visage en ce moment'}. Dis seulement que c'est réservé à Timothée${aut.qui ? '' : ' et qu’il doit bien te regarder'} ; aucun chiffre.`;
    }
    if (!R || !R.on) return "Le script de Wilson n'est pas relié sur cet appareil (Réglages → Journal à distance) : je ne peux pas lire le suivi bourse. Dis-le simplement.";
    let r = this._bourse && Date.now() - this._bourse.t < 120000 ? this._bourse.r : null;   // 2 min : les cours bougent peu entre deux questions
    if (!r) {
      r = await R.ask({ action: 'bourse_etat' });
      if (r && r.ok) this._bourse = { t: Date.now(), r };
    }
    if (!r || !r.ok) {
      const e = String((r && r.erreur) || 'pas de réponse');
      this.log(`Bourse : ${e}`, true);
      return /action inconnue/.test(e) ? "Le suivi bourse n'est pas encore relié : le script de Wilson doit être mis à jour (fichier bourse.gs). Dis-le simplement."
        : `Le suivi bourse ne répond pas (${e}). Dis-le simplement.`;
    }
    if (action === 'afficher') this._montrer(`<pre style="white-space:pre-wrap;font:inherit;font-size:.8em">${esc(r.texte)}</pre>`, { titre: '📈 Suivi bourse', large: true });
    const voiture = !!A.enVoiture;
    return `${r.texte}

RÈGLES : réponds seulement à ce qu'il demande, avec les chiffres ci-dessus tels quels (arrondis à l'oral : « environ 1 750 euros », « moins 11 pour cent ») ; ne calcule rien de toi-même si le chiffre est déjà là ; ne récite pas tout${voiture ? ' ; il conduit : une ou deux phrases' : ''}. Le statut et les limites de vente sont ses propres règles : tu peux les rappeler. Tu ne donnes pas de conseil d'achat ou de vente ; pour une analyse poussée, il peut te la demander et tu la passes à question_difficile.${action === 'afficher' ? ' Le détail est affiché à l’écran.' : ''}`;
  }

  // ---------- F8 : envoyer le brouillon d'e-mail préparé par Claude (Gmail perso ; réservé à Timothée, après son « oui ») ----------
  // Le script n'envoie que le dernier brouillon préparé par le PC il y a moins de 30 min. Ici, deux gardes de plus : c'est bien
  // Timothée (visage, ou téléphone en voiture), et il vient de dire oui (ce que Wilson a entendu ces 25 dernières secondes).
  async mailEnvoyer({ action = 'envoyer' } = {}) {
    const A = this.app, R = A.remote;
    const aut = typeof A._crmAutorise === 'function' ? A._crmAutorise() : { ok: false };
    if (!aut.ok) { this.log('E-mail : envoi refusé (réservé à Timothée)', true); return 'REFUSÉ : ses e-mails sont réservés à Timothée, et tu ne le reconnais pas en ce moment. Dis-le simplement ; rien n\'est envoyé.'; }
    if (!R || !R.on) return "Le script de Wilson n'est pas relié sur cet appareil : rien n'est envoyé. Dis-le simplement.";
    if (action === 'annuler') { await R.ask({ action: 'mail_annuler' }).catch(() => null); this.log('E-mail : envoi annulé, le brouillon reste dans Gmail', true); return "Rien n'est envoyé : le brouillon reste dans ses brouillons Gmail. Dis-le en une phrase."; }
    const dit = () => plat(A._entenduRecent ? A._entenduRecent(25000) : '');
    const OUI = /\b(oui|ouais|vas-y|vas y|envoie|envoie-le|d'accord|ok|c'est bon|parfait)\b/;
    for (let i = 0; i < 6 && !OUI.test(dit()); i++) await new Promise((r) => setTimeout(r, 250));
    if (!OUI.test(dit())) { this.log(`E-mail : pas envoyé, pas de « oui » entendu (« ${dit().slice(-80)} »)`, true); return "PAS ENVOYÉ : tu n'as pas entendu son « oui ». Redemande-lui clairement « Je l'envoie ? » et rappelle cet outil seulement après sa réponse."; }
    const r = await R.ask({ action: 'mail_envoyer' }).catch((e) => ({ ok: false, erreur: e.message }));
    if (!r || !r.ok) { const e = String((r && r.erreur) || 'pas de réponse'); this.log(`E-mail : envoi impossible (${e})`, true); return `PAS ENVOYÉ : ${e}. Dis-le simplement, sans dire que c'est parti.`; }
    this.log(`E-mail envoyé à ${r.a} : « ${String(r.objet).slice(0, 80)} »`, true);
    return `E-mail envoyé à ${r.a} (objet : ${r.objet}). Confirme en une phrase courte, en disant le nom de la personne, pas son adresse.`;
  }

  // ---------- F6 : mes idées (document Google par le script de Timothée ; sinon gardées sur l'appareil) ----------
  async idees({ action, texte = '' }) {
    const R = this.app.remote, locales = lire(KEY_I, []);
    const parScript = async (payload) => {
      if (!R || !R.on) return null;
      const r = await R.ask(payload);
      if (r && !r.ok && /action inconnue/.test(r.erreur || '')) return null;               // script pas encore mis à jour
      return r;
    };
    // Les idées gardées sur l'appareil (script pas à jour ou pas de réseau) partent dès que possible.
    const vider = async () => { const rest = []; for (const x of lire(KEY_I, [])) { const r = await parScript({ action: 'idees_noter', texte: x.texte }).catch(() => null); if (!r || !r.ok) rest.push(x); } ecrire(KEY_I, rest); return rest; };
    if (action === 'noter') {
      const t = String(texte).trim(); if (!t) return "Quelle idée ? Demande-lui de la redire.";
      const r = await parScript({ action: 'idees_noter', texte: t }).catch(() => null);
      if (r && r.ok) { await vider(); this.log(`Idée notée dans le document : ${t.slice(0, 80)}`, true); return `Idée notée dans le document « Wilson — mes idées » (${r.n} idée(s) en tout). Confirme en une phrase courte.`; }
      locales.push({ texte: t, t: Date.now() }); ecrire(KEY_I, locales);
      this.log(`Idée gardée sur la tablette (script pas encore à jour) : ${t.slice(0, 80)}`, true);
      return `Idée gardée sur la tablette (${locales.length}) : le document Google n'est pas encore relié (le script de Wilson doit être mis à jour). Confirme simplement qu'elle est notée.`;
    }
    let liste = locales.map((x) => x.texte), lien = '';
    const r = await parScript({ action: 'idees_lire', n: 30 }).catch(() => null);
    if (r && r.ok) { liste = (r.idees || []).map((x) => x.replace(/\s+—\s+\d\d\/\d\d\/\d\d \d\dh\d\d$/, '')).concat(liste); lien = r.lien || ''; }
    if (action === 'envoyer') {
      const e = await parScript({ action: 'idees_envoyer' }).catch(() => null);
      if (e && e.ok) return `E-mail envoyé à Timothée avec ses ${e.n} idée(s) et le lien du document.`;
      if (!liste.length) return 'Aucune idée notée pour l\'instant.';
      const corps = encodeURIComponent('Mes idées notées par Wilson :\n\n' + liste.map((x) => '- ' + x).join('\n'));
      this._montrer(`<ul>${liste.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><a class="card-go" style="display:inline-flex;padding:0 22px" href="mailto:?subject=${encodeURIComponent('Mes idées (Wilson)')}&body=${corps}">✉️ Envoyer par e-mail</a></p>`, { titre: '💡 Mes idées' });
      return "Je ne peux pas encore envoyer l'e-mail moi-même (script de Wilson pas à jour) : un bouton « Envoyer par e-mail » est affiché à l'écran, il appuie dessus. Dis-le-lui.";
    }
    if (!liste.length) return 'Aucune idée notée pour l\'instant.';
    if (action === 'afficher') this._montrer(`<ul>${liste.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${lien ? '<p class="fine">Dans le document Google « Wilson — mes idées ».</p>' : ''}`, { titre: '💡 Mes idées' });
    return `Ses idées (${liste.length}, la plus récente en dernier) : ${liste.slice(-10).join(' ; ')}.${action === 'afficher' ? ' Affichées à l\'écran.' : ''}`;
  }

  // ---------- F7 : remarques pour la prochaine mise à jour (lues chaque nuit par Claude dans le journal) ----------
  remarque({ texte = '' }) {
    const t = String(texte).trim(); if (!t) return 'Quelle remarque ?';
    // Journal du 05/11/26 : la même remarque notée deux fois (09h37:45 et 09h37:46, outil annulé par Google puis rappelé ;
    // 09h44:02 puis 09h45:16) → une remarque identique dans les 10 min n'est pas notée de nouveau.
    const l = lire('wilson.remarques', []), cle = norm(t), now = Date.now();
    if (l.some((r) => r && now - r.t < 10 * 60000 && norm(r.texte) === cle)) { this.log(`Remarque déjà notée (pas de doublon) : ${t.slice(0, 80)}`); return "C'est noté."; }
    this.log(`REMARQUE DE TIMOTHÉE : ${t}`, true);
    l.push({ t: now, texte: t }); ecrire('wilson.remarques', l.slice(-50));
    // Remarque du 04/11/26, 11h51 : « noter mes remarques en arrière-plan, sans rester bloqué ni arrêter de m'écouter ».
    // 05/11/26, 09h46:11 : Gemini 3.1 a lu à voix haute le résultat « {result: Remarque notée. Dis « C'est noté. » (trois
    // mots)… » → le résultat est maintenant la phrase à dire elle-même ; la consigne est dans la description de l'outil.
    return "C'est noté.";
  }

  mesRemarques() {
    const l = lire('wilson.remarques', []).filter((r) => r && r.texte && !/^\(notée par l'appli/.test(r.texte)).slice(-10);
    if (!l.length) return 'Aucune remarque notée sur cet appareil.';
    const d = (t) => { const x = new Date(t); return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)} ${pad(x.getHours())}h${pad(x.getMinutes())}`; };
    return `Ses remarques pour tes mises à jour (${l.length}, la plus récente en dernier) : ${l.map((r) => `${d(r.t)} : ${r.texte}`).join(' ; ')}. Celles d'avant la dernière mise à jour ont pu être prises en compte (les nouveautés de ta mise à jour le disent). Résume-les simplement.`;
  }

  // Pour la consigne : ce qui est en cours.
  resume() {
    const now = Date.now(), l = [];
    if (this.minuteurs.length) l.push('Minuteurs en cours : ' + this.minuteurs.map((m) => `${m.nom || 'minuteur'} (reste ${this._duree(Math.round((m.fin - now) / 1000))})`).join(', ') + '.');
    if (this.rappels.length) l.push('Rappels prévus : ' + this.rappels.map((r) => `${this._heure(r.quand)} ${r.texte}`).join(', ') + '.');
    return l.join(' ');
  }
}
