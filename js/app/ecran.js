// Wilson — méthodes de la classe App (js/app.js) : cartes à l’écran (itinéraire, réponse, appel, confirmation), appels téléphoniques, photo.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { deviceName } from '../remote.js';
import { appli, pont, $, esc } from './commun.js';

export class EcranMethodes {

  // Cartes à l'écran : bouton d'appel (C4), confirmation d'une écriture (C2), itinéraire (C12), réponse de l'analyste (C11).
  showRoute(t) {
    const el = $('cards');
    el.innerHTML = `<div class="card route" data-kind="route"><div class="card-t">Itinéraire</div><div class="card-n">${esc(t.societe)}</div><div class="card-s">${esc(t.adresse)}</div>`
      + `<div class="card-b"><a class="card-go route" href="${esc(t.maps)}" target="_blank" rel="noopener">Y aller</a><a class="card-go waze" href="${esc(t.waze)}" target="_blank" rel="noopener">Waze</a><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('.card-go').forEach((x) => x.addEventListener('click', (ev) => {
      if (appli()) { ev.preventDefault(); this.log(`GPS (appli) vers ${t.societe} : ${pont('naviguer', t.adresse || '', t.societe || '')}`, true); this.hideCard('route'); return; }   // A3 : la discussion continue
      this._goRoute(t);
    }));
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('route'), 120000);
    this._ecran = { kind: 'route', societe: t.societe, cle: t.cle || '', douteux: !!t.douteux, at: Date.now(), turn: this._turnN };
    this._itiTurn = this._turnN;
    this.log(`Bouton d'itinéraire affiché : ${t.societe}${t.douteux ? ' (choisi dans une liste de clients possibles)' : ''}`, true);
  }
  // Remarque de Timothée du 05/11/26, 14h41 (« le bouton d'itinéraire ne s'est pas mis à jour quand j'ai changé de client ;
  // que tu te rendes compte de ce qui est affiché ») : ce qui est à l'écran, en une phrase, pour Gemini.
  _ecranDit() {
    const E = this._ecran, el = $('cards'), c = el && !el.hidden && el.firstElementChild;
    const l = [];
    if (E && c && c.dataset.kind === E.kind) {
      if (E.kind === 'route') l.push(`le bouton d'itinéraire vers ${E.societe}`);
      else if (E.kind === 'call') l.push(`le bouton vert pour appeler ${E.nom} (${E.societe})`);
      else if (E.kind === 'answer') l.push('la carte « Réponse du CRM »');
      else if (E.kind === 'confirm') l.push('la confirmation d\'une écriture dans le CRM (Oui / Non)');
    }
    if (this.outils && this.outils.ouvert) l.push(`le panneau « ${String((this.outils._dernier && this.outils._dernier.titre) || 'texte').slice(0, 60)} »`);
    return l.length ? `À l'écran en ce moment : ${l.join(' et ')}.` : '';
  }
  // Le bouton d'itinéraire suit le client (14h36-14h38 : bouton pour CREZE, choisi dans la liste proposée pour « entreprise
  // Galet » ; puis GALLAIS SARL retrouvé, Wilson disait « j'affiche l'itinéraire » et le bouton restait sur CREZE).
  // Appelé quand une fiche vient d'être trouvée. Renvoie la phrase à ajouter au résultat de l'outil pour Gemini.
  async _boutonSuit(e, signal) {
    const E = this._ecran, el = $('cards'), c = el && !el.hidden && el.firstElementChild;
    if (!e || !E || !c || c.dataset.kind !== E.kind || (E.kind !== 'route' && E.kind !== 'call')) return '';
    const meme = (E.cle && e.cle && E.cle === e.cle) || String(E.societe).toLowerCase() === String(e.societe).toLowerCase();
    if (meme) return '';
    if (E.kind === 'route' && E.douteux && Date.now() - E.at < 5 * 60000) {
      const r = await this.crm.routeTarget({ client: this.crm.last === e ? '' : e.societe }, signal).catch(() => null);   // '' : la fiche qu'on vient de trouver
      if (r && r.ok) {
        this.log(`Bouton d'itinéraire : ${E.societe} (choisi dans une liste) remplacé par ${r.target.societe}, le client retrouvé ensuite`, true);
        this.showRoute(r.target);
        return `(Le bouton d'itinéraire à l'écran était pour ${E.societe}, pris dans la liste ; il est maintenant pour ${r.target.societe}. Dis-le-lui en quelques mots.)`;
      }
    }
    return E.kind === 'route' ? `(À l'écran : le bouton d'itinéraire vers ${E.societe}, pas vers ${e.societe}. S'il veut aller chez ${e.societe}, appelle itineraire pour ${e.societe}.)`
      : `(À l'écran : le bouton pour appeler ${E.nom} (${E.societe}), pas ${e.societe}. S'il veut appeler ${e.societe}, appelle appeler pour ${e.societe}.)`;
  }
  // Il dit « j'affiche l'itinéraire » (ou « le bouton pour l'appeler ») sans avoir appelé l'outil dans ce tour (14h38:09) :
  // l'appli l'affiche elle-même pour le dernier client trouvé, si l'écran ne le montre pas déjà.
  async _afficheSansOutil(wilson) {
    if (!this.crm || !this.crm.on) return;
    const phrases = String(wilson || '').split(/(?<=[.!?…])\s+/);
    const dit = (re) => phrases.some((p) => re.test(p) && !/\?\s*$/.test(p) && !/\b(pas|plus|jamais|veux|voulez|souhaites|dois-je|faut-il)\b/i.test(p));
    const iti = dit(/\bj'affiche\b[^.!?]{0,40}\b(itin[ée]raire|gps|trajet|chemin|bouton pour (y )?aller)|\bje (te |t'|vous )?(mets|lance|affiche) (l'itin[ée]raire|le gps|le trajet)/i);
    const tel = !iti && dit(/\bj'affiche\b[^.!?]{0,40}\b(num[ée]ro|bouton (vert|pour (l'|les )?appeler))/i);
    if (!iti && !tel) return;
    if ((iti ? this._itiTurn : this._appelTurn) === this._turnN - 1) return;          // l'outil a bien été appelé dans ce tour
    const e = this.crm.last, E = this._ecran, el = $('cards'), c = el && !el.hidden && el.firstElementChild;
    if (!e) { this.log(`Il a dit « j'affiche ${iti ? 'l\'itinéraire' : 'le numéro'} » sans outil, et aucun client trouvé : rien affiché`, true); return; }
    if (E && c && c.dataset.kind === (iti ? 'route' : 'call') && ((E.cle && E.cle === e.cle) || E.societe === e.societe)) return;   // déjà à l'écran
    const r = await (iti ? this.crm.routeTarget({ client: '' }) : this.crm.callTarget({ client: '' })).catch((x) => ({ ok: false, dire: x.message }));   // '' : le dernier client trouvé
    this.log(`Il a dit « j'affiche ${iti ? 'l\'itinéraire' : 'le numéro'} » sans appeler l'outil : ${r.ok ? `bouton affiché par l'appli pour ${e.societe}` : `impossible (${String(r.dire || '').slice(0, 80)})`}`, true);
    if (r.ok) { if (iti) this.showRoute(r.target); else this.showCall(r.target); }
  }
  _goRoute(t) {
    this.log(`GPS ouvert vers ${t.societe}`, true);
    this.hideCard('route');
    setTimeout(() => { if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('itinéraire'); }, 400);
  }
  // Action en cours (E1) : pastille sous le visage. kind : run (sablier), ok (vert), ko (rouge). Renvoie un jeton pour finir.
  pill(text, kind = 'run', ms = 0, garder = 0) {   // garder : id d'une pastille encore affichée, dont on change seulement le texte
    const el = $('pill'); if (!el) return 0;
    const id = garder && this._pillId === garder ? garder : (this._pillId = (this._pillId || 0) + 1);
    el.className = 'pill ' + kind; el.innerHTML = `<span class="pi"></span><span class="pt">${esc(String(text).slice(0, 90))}</span>`; el.hidden = false;
    clearTimeout(this._pillT);
    const dur = ms || (kind === 'run' ? 60000 : kind === 'ok' ? 3500 : 6000);
    this._pillT = setTimeout(() => { if (this._pillId === id) el.hidden = true; }, dur);
    return id;
  }
  pillEnd(id, ok, text) {
    if (id && this._pillId !== id) return;                                // une autre action a pris la place
    if (text) this.pill(text, ok ? 'ok' : 'ko'); else { const el = $('pill'); if (el) el.hidden = true; }
  }
  _court(t) { const x = String(t || '').split(/(?<=[.!?])\s/)[0].replace(/\s*\(.*?\)\s*/g, ' ').trim(); return x.length > 80 ? x.slice(0, 78) + '…' : x; }

  showAnswer(q, texte) {
    const el = $('cards'), c = el.firstElementChild;
    if (c && c.dataset.kind !== 'answer') return;                        // un bouton d'appel ou une confirmation reste à l'écran
    el.innerHTML = `<div class="card answer" data-kind="answer"><div class="card-t">Réponse du CRM</div><div class="card-q">${esc(q)}</div><div class="card-r">${esc(texte)}</div>`
      + `<div class="card-b"><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('answer'), 5 * 60000);
    this._ecran = { kind: 'answer', at: Date.now() };
  }
  // Cartes à l'écran : bouton d'appel (C4), confirmation d'une écriture (C2).
  showCall(t) {
    const el = $('cards');
    el.innerHTML = `<div class="card call" data-kind="call"><div class="card-t">Appeler</div><div class="card-n">${esc(t.nom)}</div><div class="card-s">${esc(t.societe)} · ${esc(t.aff)}</div>`
      + `<div class="card-b"><a class="card-go" href="tel:${esc(t.tel)}">Appeler</a><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    // Remarque du 20/11/26, 11h57 (« que l'écran revienne sur Wilson après le bouton d'appel, comme pour le GPS ») : le lien
    // tel: ouvrait le composeur du téléphone, avec un 2e bouton « Appeler » qui restait à l'écran. Dans l'appli, c'est le
    // pont qui appelle (tout de suite, l'appel passe dans la voiture) puis ramène Wilson devant ; sans pont : le lien, comme
    // avant (et _suivreAppel ramène Wilson dès que l'appel part). Correction restée bloquée le 20/11/26, reprise en 1.45.25.
    el.querySelector('.card-go').addEventListener('click', (ev) => {
      const A = appli();
      if (A && typeof A.appeler === 'function') { ev.preventDefault(); this.log(`Appel (appli) vers ${t.nom} : ${pont('appeler', t.tel || '', t.nom || '')}`, true); }
      this._calling(t);
    });
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('call'), 120000);
    this._ecran = { kind: 'call', societe: t.societe, cle: t.cle || '', nom: t.nom, at: Date.now() }; this._appelTurn = this._turnN;
    this.log(`Bouton d'appel affiché : ${t.nom} (${t.societe})`, true);
  }
  showConfirm(p) {
    const el = $('cards');
    el.innerHTML = `<div class="card confirm" data-kind="confirm"><div class="card-t">À enregistrer dans le CRM ?</div><div class="card-r">${esc(p.relu)}</div>`
      + `<div class="card-b"><button class="card-ok" type="button">Oui, enregistre</button><button class="card-x" type="button">Non</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-ok').addEventListener('click', () => this._confirmTap());
    el.querySelector('.card-x').addEventListener('click', () => this._refuseTap());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('confirm'), 5 * 60000);
    this._ecran = { kind: 'confirm', at: Date.now() };
  }
  hideCard(kind) {
    const el = $('cards'), c = el.firstElementChild;
    if (!c || (kind && c.dataset.kind !== kind)) return;
    el.innerHTML = ''; el.hidden = true; this._ecran = null;
  }
  async _confirmTap() {
    if (!this.crm.gate(null, { tapped: true }).ok) { this.hideCard('confirm'); return; }
    this.log('Écriture confirmée en touchant « Oui » à l\'écran');
    let r;
    try { r = await this.crm.commit(); } catch (e) { r = { dire: `Le CRM ne répond pas (${e.message}) : rien n'est écrit, dis-le simplement.`, phrase: 'Le CRM ne répond pas : rien n\'est écrit.' }; }
    this._permettre(30000, 'bouton Oui');
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Timothée a confirmé en touchant « Oui » sur l'écran. ${r.dire}]`);
    else if (r.phrase) this._say(r.phrase);
  }
  _refuseTap() {
    this.crm.pending = null; this.hideCard('confirm'); this.log('Écriture annulée à l\'écran');
    this._permettre(30000, 'bouton Non');
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText('[Timothée a touché « Non » : rien n\'est enregistré. Demande-lui en une phrase ce qu\'il faut changer.]');
  }
  // Appel lancé : Wilson se tait ; au retour, il propose le compte rendu de l'appel.
  _calling(t) {
    this.log(`Appel lancé vers ${t.nom} (${t.societe})`, true);
    this._callAfter = { ...t, at: Date.now() };
    this.hideCard('call');
    setTimeout(() => { if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('appel'); }, 400);
    this._suivreAppel();
  }
  // Remarque du 20/11/26 (voiture) : après le bouton d'appel, le téléphone restait sur l'écran d'appel au lieu de revenir au
  // visage, comme après le GPS. Dans l'appli Android, la page n'est jamais mise en pause : elle ne voyait ni le départ ni la
  // fin de l'appel. Elle suit maintenant le mode du son d'Android : appel parti → Wilson revient devant (l'appel continue
  // dans la voiture) ; appel fini → il propose le compte rendu (_backFromCall).
  _suivreAppel() {
    clearInterval(this._appelSuivi); this._appelSuivi = 0;
    if (!appli() || typeof appli().revenir !== 'function' || typeof appli().etatSon !== 'function') return;
    // Journal du 24/11/26, 17h38:19 (voiture) : un seul relevé hors appel a suffi à dire « Appel fini après 75 s », alors que
    // l'appel continuait (17h38:21 : « mode appel, canal appel Bluetooth OUVERT », micro repris 58 s par le téléphone). La
    // proposition du compte rendu est partie en plein appel et s'est perdue. La fin n'est retenue qu'après 3 relevés de suite.
    const t0 = Date.now(); let parti = 0, hors = 0;
    const enAppel = () => /mode (appel|communication)|lecture APPEL/.test(String(pont('etatSon') || ''));
    const fin = () => { clearInterval(this._appelSuivi); this._appelSuivi = 0; };
    this._appelSuivi = setInterval(() => {
      const ec = enAppel(), dt = Date.now() - t0;
      hors = ec ? 0 : hors + 1;
      if (parti && !ec && hors < 3) return;                     // peut-être un instant hors appel : on revérifie
      if (!parti && ec) {
        parti = Date.now();
        this.log('Appel parti : je reviens à l\'écran (l\'appel continue dans la voiture)', true);
        setTimeout(() => pont('revenir'), 1500);
      } else if (parti && !ec) {
        fin(); this.log(`Appel fini après ${Math.round((Date.now() - parti) / 1000) - 2} s`, true);
        if (pont('premierPlan') === false) pont('revenir');
        this._backFromCall();
      } else if ((!parti && dt > 90000) || dt > 2 * 3600000) {
        fin(); if (!parti) this.log('Appel pas parti en 90 s : je ne reviens pas tout seul à l\'écran');
      }
    }, 1000);
  }
  // « Wilson » dit plusieurs fois en voiture, aucune réaction (04/11/26, 17h40 : « même s'il y a un problème réseau ou
  // autre chose, il faut que je sois au courant ») : le journal s'arrête à 17h22:57, plus rien du téléphone ensuite. Une page
  // web cachée (écran éteint, autre appli devant) n'entend plus rien et ne peut rien dire. Désormais, en voiture :
  //  - au moment où il passe en arrière-plan : petit son « dodo » seulement ;
  //  - au retour, après plus d'une minute : il dit combien de temps il n'a rien entendu ;
  //  - micro muet plus de 5 s alors qu'il est à l'écran (micro pris, son suspendu) : il le dit tout de suite et relance le son.
  _sourdDebut(pourquoi) {
    if (!this._voitureBt || !this.started || this._sourd) return;
    this._sourd = { at: Date.now(), pourquoi };
    this.log(`Sourd : ${pourquoi} — je ne t'entends plus jusqu'à ce que tu me rouvres`, true);
    try { this.audio.tone('dodo'); } catch (_) {}            // un petit son seulement (17h57 : « tu parles tout seul »)
    try { this.remote.flush({ beacon: true }); } catch (_) {}
  }
  _sourdFin() {
    const S = this._sourd; if (!S) return;
    this._sourd = null;
    const s = Math.round((Date.now() - S.at) / 1000);
    this.log(`Sourd pendant ${s} s (${S.pourquoi}) : je t'entends de nouveau`, true);
    const micro = S.pourquoi.startsWith('micro');           // micro : il a prévenu, il dit aussi que c'est revenu
    if (!this._voitureBt) return;
    // Journal du 05/11/26, 16h01:33-16h01:42 (« quand je reviens, il y a deux voix qui parlent en même temps ») : au retour du
    // GPS, la voix du téléphone disait « J'étais en arrière-plan pendant 3 minutes… » pendant que Wilson reprenait la
    // discussion coupée par l'appel. Retour d'arrière-plan : un petit son seulement, plus aucune phrase.
    if (!micro) { try { this.audio.tone('revenu'); } catch (_) {} return; }
    const duree = s < 90 ? `${s} secondes` : `${Math.round(s / 60)} minutes`;
    const phrase = micro ? `Je ne t'entendais plus depuis ${duree}, mon micro était coupé. C'est revenu, je t'écoute.`
      : `J'étais en arrière-plan pendant ${duree} : je ne t'entendais pas. C'est bon, je t'écoute de nouveau.`;
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Dis-lui exactement : « ${phrase} »]`);
    else this._sayAfter(phrase);
  }
  // Remarque de Timothée du 06/11/26, 08h57 : en voiture, le micro n'est ouvert que pendant une discussion (il touche l'écran
  // pour réveiller Wilson, le retouche pour l'endormir) ; en veille, il est fermé. Hors de la voiture, il reste ouvert.
  _micVoiture() {
    const A = this.audio; if (!A || !A.ctx || !this.started) return;
    const fermer = this._voitureBt && (this.state === 'veille' || this.state === 'dodo') && !this.settingsOpen && !this._earTest && !this.phone;
    if (fermer && !A.micPaused) { A.pauseMic('voiture, en veille : rouvert quand tu touches l\'écran'); this._sourd = null; }
    else if (!fermer && A.micPaused) A.resumeMic(this._voitureBt ? 'réveil' : 'plus en voiture').catch((e) => this.log('Micro impossible à rouvrir : ' + e.message));
  }
  _sourdGarde() {
    this._micVoiture();
    if (!this._voitureBt || !this.started || document.hidden || this.phone || this.settingsOpen || this.audio.micPaused) { if (this.audio && this.audio.micPaused) this._capAt = performance.now(); return; }
    const now = performance.now(), muet = now - (this._capAt || now);
    if (!this._sourd && this._capAt && muet > 5000 && now - (this._shownAt || 0) > 5000) {
      this._sourd = { at: Date.now() - Math.round(muet), pourquoi: 'micro muet (aucun son reçu depuis ' + Math.round(muet / 1000) + ' s)' };
      this.log(`Sourd : ${this._sourd.pourquoi} — son : ${this.audio.ctx ? this.audio.ctx.state : '?'}`, true);
      this.audio.resume().catch(() => {});
      const avis = "Attention, je ne t'entends plus : mon micro est coupé. J'essaie de le relancer.";
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Dis-lui exactement : « ${avis} »]`);   // une seule voix
      else if (!this.audio.playing) { try { this.voice.speak(avis); } catch (_) {} }
    } else if (this._sourd && this._sourd.pourquoi.startsWith('micro') && muet < 1000) this._sourdFin();
  }
  // Une fenêtre à laquelle il doit répondre (carte « Oui / Non », bouton d'itinéraire ou d'appel, réglages) : le toucher ne
  // l'endort pas.
  _fenetreOuverte() {
    const c = document.querySelector('#cards .card');
    if (c && !c.hidden && !c.closest('[hidden]') && c.getClientRects().length) return c.querySelector('.card-ok') ? 'une validation (Oui / Non)' : 'un bouton (' + (c.className.replace(/\bcard\b/, '').trim() || 'carte') + ')';
    if (this.settingsOpen) return 'les réglages';
    if (this.crm && this.crm.pending) return 'un enregistrement à valider';
    return '';
  }
  _backFromCall() {
    const c = this._callAfter; if (!c) return;
    const dt = Date.now() - c.at;
    if (dt < 8000) return;                       // l'appel n'est pas encore parti (ou annulé tout de suite)
    this._callAfter = null;
    if (dt > 2 * 3600000 || !this.crm.on) return;
    this._lastCall = c;
    this.log(`Retour d'appel après ${Math.round(dt / 1000)} s : je propose le compte rendu`);
    setTimeout(() => { if (this.state === 'veille' || this.state === 'dodo') this.startConversation('apres_appel'); }, 1200);
  }
  // Journal du 24/11/26, 17h39:22-17h39:38 (voiture) : Wilson s'est réveillé pour proposer le compte rendu de l'appel ; Timothée a
  // touché l'écran 2 s après, avant qu'il ait parlé : discussion finie, et au toucher suivant (« Oui, tu allais dire quelque
  // chose ? ») Wilson a répondu « Non, je t'écoute ». Ce qu'il allait proposer est gardé 3 min et donné au toucher suivant.
  _propAppelNote(reason) { this._propAppel = { reason, call: reason === 'apres_appel' ? (this._lastCall || null) : null, conv: this.convId, at: Date.now() }; }
  _propAppelGardee() {
    const PA = this._propAppel; if (!PA || PA.conv != null) return null;
    this._propAppel = null;
    return Date.now() - PA.at < 3 * 60000 ? PA : null;
  }
  _propAppelTexte(PA) {
    const nom = PA.call && PA.call.nom ? ` avec ${PA.call.nom}${PA.call.societe ? ' (' + PA.call.societe + ')' : ''}` : '';
    const quoi = PA.reason === 'apres_appel' ? `lui demander s'il veut te dicter le compte rendu de son appel${nom}`
      : `lui proposer de reprendre là où vous en étiez, après la coupure du téléphone${this.crm.on ? ' (et de noter un compte rendu si c\'était l\'appel d\'un client)' : ''}`;
    this.log('Toucher : ce que j\'allais lui proposer après l\'appel est donné à Gemini');
    return `[Timothée vient de toucher l'écran pour te parler. Juste avant, tu allais ${quoi}, mais il a touché l'écran avant que tu aies parlé. Dis seulement « Oui ? » et écoute. S'il te demande ce que tu allais dire, ou s'il n'a rien de précis à te demander, propose-le-lui en une phrase.]`;
  }
  _apresAppelTexte() {
    const c = this._lastCall || {};
    return `[Timothée vient de raccrocher avec ${c.nom || 'un client'}${c.societe ? ' (' + c.societe + ')' : ''}. Demande-lui en une phrase s'il veut te dicter le compte rendu de l'appel ; s'il le fait, prépare-le comme compte rendu d'appel.]`;
  }

  // ---------- appel reçu pendant une discussion (C9) ----------
  // Le téléphone prend le micro : Wilson se tait, la discussion est mise de côté (son fil est gardé), aucun « oui » ne peut
  // confirmer une écriture pendant l'appel. Micro rendu : Wilson reprend la discussion.
  _phoneStart(why) {
    if (deviceName() !== 'téléphone') { this.log(`Micro : ${why} (pas un téléphone : rien de changé)`); return; }
    if (this.phone) return;
    const conv = this.state === 'conversation' || this.state === 'eveil';
    this.phone = { at: Date.now(), why, conv, handle: conv && this.mode === 'live' ? this.brain.handle : null, net: !!this.netWait };
    this.log(`Micro pris par le téléphone (${why}) : appel en cours ? Je me tais${conv ? ', discussion mise de côté' : ''}`);
    this.discard = true; if (this.audio.playing) this.audio.flush(); this.voice.cancel();
    if (this.crm.pending) this.crm.pending.call = true;
    if (conv) this.endConversation('appel téléphonique');
    if (this.netWait) { clearTimeout(this.netWait.timer); this.netWait = null; }
    this.badge('Appel en cours : je me tais', 8000);
  }
  _phoneEnd(why) {
    const P = this.phone; if (!P) return;
    this.phone = null;
    const s = (Date.now() - P.at) / 1000, p = this.crm.pending;
    this.log(`Micro rendu (${why}) après ${Math.round(s)} s${s >= 8 ? ' : fin de l\'appel' : ''}`);
    // une écriture en attente doit être relue de nouveau : aucun « oui » d'avant (ou de pendant) l'appel ne compte
    if (p && p.call) { p.call = false; p.at = performance.now(); p.atMs = Date.now(); p.turn = this._turnN; }
    if (this._callAfter) { this._backFromCall(); return; }            // appel lancé par Wilson : il propose le compte rendu
    // Journal du 24/11/26, 17h38:22-17h39:22 : la proposition du compte rendu (appel lancé par Wilson) a été coupée par le
    // téléphone avant d'être dite ; au retour, elle était devenue « on reprend où on en était ? », sans le nom du client.
    const PA = this._propAppel;
    if (PA && PA.conv == null && PA.reason === 'apres_appel' && s >= 8 && s <= 2 * 3600) {
      this._propAppel = null; if (PA.call) this._lastCall = PA.call;
      this.log('Fin de l\'appel : je repropose le compte rendu');
      this.startConversation('apres_appel'); return;
    }
    if (!P.conv || s > 2 * 3600) return;
    this._afterCall = { s, pending: !!p };
    this.startConversation(s >= 8 ? 'apres_appel_entrant' : 'reprise', { handle: P.handle });
  }
  _apresAppelEntrantTexte() {
    const A = this._afterCall || {}, p = this.crm.pending;
    return `[Votre discussion a été coupée ${A.s >= 90 ? Math.round(A.s / 60) + ' min' : Math.round(A.s || 0) + ' s'} : le téléphone a pris le micro, sans doute pour un appel, et c'est fini. Dis en une phrase très courte que tu es là et propose de reprendre là où vous en étiez (rappelle le sujet en quelques mots)${this.crm.on ? ' ; si c\'était l\'appel d\'un client, propose aussi de noter un compte rendu' : ''}.${p ? ` Une écriture attendait sa confirmation : relis-la (« ${p.relu} ») et redemande « Je l'enregistre ? » ; seul un nouveau « oui » compte.` : ''}]`;
  }

  // Photo nette, prise à la demande (R6) : plus grande et plus nette que les anciennes images automatiques.
  _photo() {
    if (!this.vision) return null;
    const img = this.vision.snapshot(0.85, 1024);
    if (img) { this._imgN = (this._imgN || 0) + 1; this._photos = (this._photos || 0) + 1; }
    return img;
  }
}
