// Wilson — plus d'outils (PLAN.md, section 7 quater) : afficher à l'écran, minuteurs, rappels, météo, liste de courses.
// Tout est gratuit et sans nouvelle clé : Wikipédia (images), Open-Meteo (météo), Home Assistant (liste de courses).

const S = { type: 'STRING' }, N = { type: 'NUMBER' };
export const OUTILS = [
  { name: 'afficher', behavior: 'BLOCKING',
    description: "Montre quelque chose sur le grand écran de la tablette, par-dessus ton visage : une recette, une liste, des étapes, une explication, un mot à épeler, des chiffres, ou une image (« montre-moi un koala », « affiche la recette », « écris-le »). Utilise-le aussi quand une réponse est longue ou pratique à lire (recette, liste, itinéraire en étapes) : dis seulement l'essentiel à voix haute.",
    parameters: { type: 'OBJECT', properties: {
      titre: S,
      texte: { type: 'STRING', description: 'le contenu ; une ligne par élément ; « - » au début pour une puce, « 1. » pour une étape' },
      image: { type: 'STRING', description: "ce qu'il faut illustrer par une photo (cherchée sur Wikipédia), ex. « koala », « tour Eiffel » ; vide sinon" } }, required: ['titre'] } },
  { name: 'fermer_ecran', behavior: 'BLOCKING', description: "Ferme ce qui est affiché à l'écran." },   // sans paramètres : un objet vide est refusé par Google (tests/e2e_conn.py)
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
  { name: 'remarque', behavior: 'BLOCKING',
    description: "Remarque de Timothée sur ton fonctionnement, pour ta prochaine mise à jour (un bug, une fonction qui manque, une façon de répondre à changer) : texte = sa remarque mise au propre, avec le contexte utile.",
    parameters: { type: 'OBJECT', properties: { texte: S }, required: ['texte'] } },
];
export const OUTILS_NAMES = OUTILS.map((t) => t.name);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const pad = (n) => String(n).padStart(2, '0');
const KEY_M = 'wilson.minuteurs', KEY_R = 'wilson.rappels', KEY_C = 'wilson.courses', KEY_I = 'wilson.idees';
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

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
      case 'minuteur': return this.minuteur(a);
      case 'rappel': return this.rappel(a);
      case 'meteo': return this.meteo(a);
      case 'courses': return this.courses(a);
      case 'idees': return this.idees(a);
      case 'remarque': return this.remarque(a);
      default: return 'Outil inconnu.';
    }
  }

  // ---------- F1 : l'écran ----------
  _montrer(html, { titre = '', large = false, ms = 90000 } = {}) {   // demande du 30/10/26 : l'écran s'efface tout seul
    const el = $('ecran'); if (!el) return;
    el.innerHTML = `<div class="ecran-in${large ? ' large' : ''}"><div class="ecran-h"><div class="ecran-t">${esc(titre)}</div><button class="ecran-x" type="button" aria-label="Fermer">×</button></div><div class="ecran-b">${html}</div></div>`;
    el.hidden = false;
    el.querySelector('.ecran-x').addEventListener('click', () => this.fermer());
    clearTimeout(this._ecranT); this._ecranMs = ms; this._ecranT = setTimeout(() => this.fermer(), ms);
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
    let img = null;
    if (image) img = await this._image(image).catch(() => null);
    const html = (img ? `<figure class="ecran-img"><img src="${esc(img.src)}" alt="${esc(img.titre)}"><figcaption>${esc(img.titre)} — Wikipédia</figcaption></figure>` : '') + this._texteHtml(texte);
    if (!html) return "Rien à afficher : il faut un texte ou une image.";
    const lignes = String(texte || '').split(/\n+/).filter((l) => l.trim()).length;
    this._montrer(html, { titre, large: !!img && !texte, ms: lignes > 8 ? 4 * 60000 : img && !texte ? 45000 : 90000 });
    this.log(`Écran : « ${String(titre).slice(0, 60)} »${img ? ' + image ' + img.titre : image ? ' (image introuvable)' : ''}`, true);
    return `Affiché à l'écran${image && !img ? ` (sans image : rien trouvé pour « ${image} »)` : img ? ` avec une photo de « ${img.titre} »` : ''}. Ne relis pas tout : dis l'essentiel en une phrase.`;
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
    this._montrer(`<p class="alarme">${esc(phrase)}</p><p class="fine">Touche l'écran pour arrêter.</p>`, { titre, ms: 10 * 60000 });
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
      return `Rappel noté pour ${jour} à ${this._heure(t)} : « ${r.texte} ». (La tablette doit rester allumée.)`;
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
    this._montrer(html, { titre: `Météo — ${lieu.name}` });
    this.log(`Météo : ${lieu.name}, ${Math.round(c.temperature_2m)}°, ${motC}`, true);
    return `Météo à ${lieu.name} (affichée à l'écran). Maintenant : ${Math.round(c.temperature_2m)}°, ${motC}, ressenti ${Math.round(c.apparent_temperature)}°, vent ${Math.round(c.wind_speed_10m)} km/h ; risque de pluie dans les 12 heures : ${maxH} %. `
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
    if (action === 'afficher' || reste.length > 6) {
      this._montrer(`<ul class="courses">${reste.map((x) => `<li>${esc(x.name)}</li>`).join('')}${coches.map((x) => `<li class="fait">${esc(x.name)}</li>`).join('')}</ul>${L.items.length ? '' : '<p>La liste est vide.</p>'}`, { titre: '🛒 Liste de courses' });
    }
    if (!reste.length) return 'La liste de courses est vide.';
    return `Liste de courses (${reste.length}) : ${reste.map((x) => x.name).join(', ')}.${action === 'afficher' || reste.length > 6 ? ' Elle est affichée à l\'écran.' : ''}`;
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
    if (action === 'afficher' || liste.length > 5) this._montrer(`<ul>${liste.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${lien ? '<p class="fine">Dans le document Google « Wilson — mes idées ».</p>' : ''}`, { titre: '💡 Mes idées' });
    return `Ses idées (${liste.length}, la plus récente en dernier) : ${liste.slice(-10).join(' ; ')}.${action === 'afficher' || liste.length > 5 ? ' Affichées à l\'écran.' : ''}`;
  }

  // ---------- F7 : remarques pour la prochaine mise à jour (lues chaque nuit par Claude dans le journal) ----------
  remarque({ texte = '' }) {
    const t = String(texte).trim(); if (!t) return 'Quelle remarque ?';
    this.log(`REMARQUE DE TIMOTHÉE : ${t}`, true);
    const l = lire('wilson.remarques', []); l.push({ t: Date.now(), texte: t }); ecrire('wilson.remarques', l.slice(-50));
    return 'Remarque notée : elle sera lue pour ta prochaine mise à jour (chaque nuit). Dis-le simplement, en une phrase.';
  }

  // Pour la consigne : ce qui est en cours.
  resume() {
    const now = Date.now(), l = [];
    if (this.minuteurs.length) l.push('Minuteurs en cours : ' + this.minuteurs.map((m) => `${m.nom || 'minuteur'} (reste ${this._duree(Math.round((m.fin - now) / 1000))})`).join(', ') + '.');
    if (this.rappels.length) l.push('Rappels prévus : ' + this.rappels.map((r) => `${this._heure(r.quand)} ${r.texte}`).join(', ') + '.');
    return l.join(' ');
  }
}
