// Wilson — méthodes de la classe App (js/app.js) : mode voiture, réveil par « Wilson », oreille, vitesse.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { deviceName } from '../remote.js';
import { Oreille } from '../oreille.js';
import { netErr } from '../crm.js';
import { VOITURE, NOM_DELAI_VOITURE_MS, NOM_DELAI_MAISON_MS, NOM_RELAIS_MS, NOM_SON_MAX_MS, huitK, PREVENIR_MS, $ } from './commun.js';

export class VoitureMethodes {

  // ---------- mode voiture (PLAN 2 quater, C5) ----------
  enterCar(why) {
    if (this.car) return;
    this.car = { why, at: Date.now() };
    this.log(`Mode voiture (${why}) : caméra coupée, réveil quand on dit « Wilson »${this.oreille.ready ? ` (oreille prête, limite ${this.oreille.limite.toFixed(1)})` : ' — oreille pas encore apprise : toucher l\'écran pour parler'}${this.state === 'conversation' ? ' ; la discussion en cours continue' : ''}`);
    // Une discussion en cours n'est plus coupée (journal du 25/10/26, 08h01) : elle continue, sans regard.
    if (this.vision) { this.vision.stop(); this.vision = null; }
    if (this.paused) this._resume();
    document.body.classList.add('car'); $('car').hidden = false; $('subtitle').hidden = false; $('subtitle').textContent = ''; $('badge').hidden = true;
    this._carHint(); this.oreille.reset();
    if (this.state === 'dodo') this.setState('veille');
    this.face.setMood('neutre'); this.face.setBrightness(0.45);
    this.crm.prefetch();
  }
  exitCar(why) {
    if (!this.car) return;
    // Quitté à la main : le GPS ne le remet pas tout seul pendant 20 min (on peut rouler comme passager, ou préférer le regard).
    if (why === 'bouton' || why === 'réglages') this._carOffAt = Date.now();
    this.log(`Fin du mode voiture (${why})`); this.car = null; this._gate = null;
    if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('fin du mode voiture');
    document.body.classList.remove('car'); $('car').hidden = true; $('subtitle').hidden = !this.settings.subtitles;
    if (this.settings.camera && !this.vision && this.started) this._startVision();
  }
  _carHint() { $('car-hint').textContent = this.oreille.ready ? 'Dis « Wilson » pour me parler' : 'Touche l\'écran pour me parler — apprends-moi ton nom : Réglages → CRM et prénom'; }

  // L'oreille a reconnu « Wilson » : réveil, avec le début de la phrase.
  _onName(d) {
    if (this.settingsOpen) return;
    if (!this.car) { if (this.state === 'veille' || (this.state === 'conversation' && this.paused)) this._nomMaison(d); return; }
    if (this.state !== 'veille') return;
    this.log(`Entendu « Wilson » (oreille : écart ${d.score.toFixed(1)}, limite ${d.limite.toFixed(1)})`);
    this.face.play('wake');
    this.startConversation('prenom');
  }
  // E3 (journal du 30/10/26) : à la maison, l'oreille ne fait que proposer. On attend la fin de la phrase, puis Gemini
  // Flash-Lite écoute toute la phrase (8 s au plus) : est-ce qu'on appelle « Wilson », et que lui demande-t-on ?
  // La demande est transmise en texte à la discussion (le son de loin, avec la télé, était souvent mal compris : il
  // fallait répéter 5 fois) ; rien ne s'affiche si ce n'était pas pour lui. 40 vérifications par heure au plus.
  async _nomMaison(d, debutImpose = null) {
    const voiture = this._voitureBt, lieu = voiture ? 'voiture' : 'maison';
    // Début de la phrase candidate : l'oreille dit depuis combien de temps elle a commencé.
    const debut = debutImpose != null ? debutImpose : performance.now() - Math.min(8000, ((d && d.duree) || 1.5) * 1000);
    // Journal du 04/11/26, 16h57-16h59 (téléphone dans la voiture) : 8 « Wilson » reconnus par l'oreille, aucun réveil.
    // Une vérification restée bloquée (réseau mobile, pas de délai maximal) faisait ignorer tous les suivants, sans un mot
    // au journal. Maintenant : chaque « Wilson » ignoré est noté, et la vérification a un délai maximal (plus bas).
    // 04/11/26, 17h53 : pendant une vérification, le candidat suivant est gardé et vérifié juste après.
    // 05/11/26 (journal 09h31-09h40 en voiture, « pourquoi il faut que je t'appelle trois fois ? ») : le candidat gardé
    // était remplacé par le suivant (radio, bruit de la route : une phrase toutes les 3 s), puis jeté sans un mot après
    // chaque « non », et quand il passait enfin, le son envoyé ne contenait plus sa phrase. Maintenant on garde le début
    // de la PREMIÈRE phrase en attente, et la vérification suivante envoie tout ce qui a été dit depuis (voir plus bas).
    if (this._nomEnCours) {
      const S = this._nomSuivant;
      this._nomSuivant = { d, debut: S ? Math.min(S.debut, debut) : debut };
      this.log(`Oreille (${lieu}) : « Wilson » possible (écart ${d.score.toFixed(1)}) pendant une vérification en cours depuis ${((performance.now() - (this._nomDepuis || 0)) / 1000).toFixed(0)} s : vérifié juste après${S ? ' (avec la phrase d\'avant)' : ''}`);
      return;
    }
    if (!this.settings.apiKey) return;
    // Sans réseau : jamais de réveil sur un simple candidat de l'oreille (presque toutes les phrases en sont, journal du
    // 04/11/26) ; en voiture, il le dit (une fois toutes les 5 min au plus) pour que Timothée sache qu'il ne l'entendra pas.
    if (!navigator.onLine) { if (voiture && this.state === 'veille') this._prevenirNom('pas de réseau'); return; }
    // Économie (journal du 30/10/26 : 40 vérifications épuisées en 15 min de discussions en famille, plus rien ensuite) :
    // une seule vérification à la fois, chacune couvrant tout ce qui a été dit depuis la précédente ; et une réserve de 10
    // vérifications qui se recharge d'une toutes les 40 s (400 par jour au plus). L'attente de 3 s après un « non » est
    // supprimée (05/11/26) : elle jetait le « Wilson » dit juste après. Seule reste l'attente que Google demande (quota).
    const now = Date.now();
    if (now < (this._nomCalme || 0)) {
      if (this._calmeDit !== this._nomCalme) { this._calmeDit = this._nomCalme; this.log(`Oreille (${lieu}) : Google demande d'attendre encore ${Math.ceil((this._nomCalme - now) / 1000)} s : « Wilson » pas vérifié`); }
      return;
    }
    const B = this._nomJetons || (this._nomJetons = { n: 10, t: now, jour: new Date().toDateString(), total: 0 });
    B.n = Math.min(10, B.n + (now - B.t) / 40000); B.t = now;          // réserve de 10, une de plus toutes les 40 s (journal 10h12 : 6 vidée en 3 min)
    if (B.jour !== new Date().toDateString()) { B.jour = new Date().toDateString(); B.total = 0; }
    if (B.n < 1 || B.total >= 400) { if (!this._avisPlein) { this._avisPlein = true; this.log(`Oreille (${lieu}) : réserve de vérifications vide, j'attends${voiture ? '' : ' (le regard marche toujours)'}`); } return; }
    B.n -= 1; B.total++; this._avisPlein = false; this._nomEnCours = true; this._nomDepuis = performance.now();
    let pcm = null, ctl = null, minuterie = null;
    try {
      const t0 = performance.now();                                    // fin de la phrase : 0,7 s de silence (4 s au plus)
      while (performance.now() - t0 < 4000 && (this.audio.speaking || performance.now() - this.audio.lastVoicedAt < 700)) await new Promise((r) => setTimeout(r, 100));
      // Le son envoyé (05/11/26) : du début de la phrase (de la première en attente) jusqu'à maintenant, sans ce que
      // Gemini a déjà entendu (1 s de recouvrement) ni la fin de sa propre voix (09h38:07 : « N'hésite pas si tu as besoin
      // de moi plus tard » vérifié) ; 1,2 s au moins, 12 s au plus (les dernières : c'est là qu'il répète « Wilson »).
      const fin = performance.now();
      let de = Math.max(debut - 300, (this._nomCouvert || 0) - 1000, (this.playEndAt || 0) + 700, fin - NOM_SON_MAX_MS);
      if (fin - de < 1200) de = fin - 1200;
      pcm = this.audio.recent(fin - de);
      // En voiture (réseau mobile) : son envoyé en 8 kHz, deux fois plus léger (la voix reste très lisible pour Gemini).
      const leger = voiture ? huitK(pcm) : pcm;
      // Délai maximal : 10 s en voiture, 8 s à la maison. Sans réponse après 3 s, un 2e modèle est interrogé en même temps.
      ctl = new AbortController(); minuterie = setTimeout(() => ctl.abort(), voiture ? NOM_DELAI_VOITURE_MS : NOM_DELAI_MAISON_MS);
      const r = await this.eco.appelDeLoin({ key: this.settings.apiKey, audio: leger, rate: voiture ? 8000 : 16000, signal: ctl.signal, hedgeMs: this.eco.canExtra() ? NOM_RELAIS_MS : 0 });
      clearTimeout(minuterie);
      this._nomCouvert = fin;                                           // ce son-là est entendu : la prochaine vérification part d'ici
      const duree = `${r.ms != null ? (r.ms / 1000).toFixed(1) + ' s, ' : ''}son de ${(pcm.length / 16000).toFixed(1)} s${r.model ? ', ' + r.model : ''}`;
      this.log(`Oreille (${lieu}) : écart ${d.score.toFixed(1)} → Gemini entend « ${(r.texte || '').slice(0, 120)} » → ${r.appel ? `oui, « Wilson »${r.doute ? ' (pas certain)' : ''}${r.demande ? ' — « ' + r.demande.slice(0, 100) + ' »' : ''}` : 'non' + (r.pourquoi ? ' (' + r.pourquoi + ')' : '')} (${duree})`, r.appel);
      if (!r.appel) { if (!r.texte && this._nomJetons) this._nomJetons.n = Math.min(10, this._nomJetons.n + 1); return; }   // rien d'intelligible : ne coûte rien
      if (this.settingsOpen) return;
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) {      // déjà en discussion : la demande part tout de suite
        this._byName = true; this._prenomAt = performance.now(); if (this.paused) this._resume();
        // Maintenance de nuit du 01/11/26 (journal du 31/10/26, 10h44 : « Euh... Wilson, tu me reçois ? » dit pendant
        // qu'il le regardait de nouveau → envoyé « de loin, pas certain », il s'est tu et Timothée a dû répéter) :
        // regardé quand la demande arrive → elle lui est adressée à coup sûr ; et s'il reste muet, relance une fois.
        const vu = this._gazing();
        if (r.demande) {
          if (!(this._aDire && this._aDire.conv !== this.convId && this._aDireEnvoyer(r.demande))) this.brain.sendText(vu ? this._texteRegarde(r.demande) : this._texteDeLoin(r.demande, r.doute));
          this._demandeTexte = { texte: r.demande, at: performance.now(), conv: this.convId, vu };
          this._noteHeard(r.demande, true);
        } else if (!vu) this._ecouteSeule();
        this.lastActivity = performance.now();
        return;
      }
      if (this.state !== 'veille') return;
      this._wakeText = r.demande ? this._texteDeLoin(r.demande, r.doute) : null; this._wakeDemande = r.demande || ''; this._wakePcm = new Int16Array(0);
      this.face.play('wake');
      // Remarque de Timothée du 05/11/26, 09h45 (« le petit bip bip, c'était bien ») : en voiture, il ne voit pas l'écran ;
      // une petite note dit tout de suite qu'il a été entendu. Jouée dès le « oui » de la vérification (le lecteur de la
      // voiture se met en route en éveil), et plus après la connexion à Google (une seconde de plus, en même temps que la réponse).
      const ouvre = this.startConversation('prenom');
      if (r.demande && voiture) setTimeout(() => { try { this.audio.tone('ecoute'); } catch (_) {} }, 300);
      await ouvre;
      if (!r.demande) this._ecouteSeule();
    } catch (e) {
      clearTimeout(minuterie);
      const lent = ctl && ctl.signal.aborted;
      this.log(`Oreille (${lieu}) : vérification ${lent ? `trop lente (plus de ${(voiture ? NOM_DELAI_VOITURE_MS : NOM_DELAI_MAISON_MS) / 1000} s)` : 'impossible (' + e.message + ')'} : pas de réveil`);
      // 1.26.4 se réveillait « quand même » en voiture : avec un réseau mobile lent, chaque bruit et chaque phrase de la
      // radio le réveillait (journal du 04/11/26, 17h53-17h55 : « tu parles tout seul »). Plus jamais de réveil sans « oui »
      // de Gemini ; en voiture, il prévient qu'il n'arrive pas à vérifier (une fois toutes les 5 min au plus).
      if (voiture && this.state === 'veille' && (lent || netErr(e))) this._prevenirNom(lent ? 'réseau trop lent' : 'pas de réseau');
      // Maintenance de nuit du 31/10/26 (journal du 30/10/26, 22h56-22h58 : 12 essais en 90 s malgré « retry in 52s »
      // et « high demand ») : on attend ce que Google demande (2 min au plus), ou 20 s s'il est surchargé.
      const m = /retry in ([\d.]+)\s*s/i.exec(e.message || '');
      const att = m ? Math.min(120, Math.ceil(+m[1])) : /high demand|overloaded|unavailable|503/i.test(e.message || '') ? 20 : 0;
      if (att) { this._nomCalme = Date.now() + att * 1000; this.log(`Oreille (maison) : Google demande d'attendre, prochaine vérification dans ${att} s`); }
    }
    finally {
      this._nomEnCours = false;
      const n = this._nomSuivant; this._nomSuivant = null;
      if (n && (this.state === 'veille' || (this.state === 'conversation' && this.paused))) setTimeout(() => this._nomMaison(n.d, n.debut), 0);
    }
  }
  // En voiture, la vérification de « Wilson » n'aboutit pas : il ne se réveille pas, mais le dit (voix du téléphone, sans
  // réseau), une fois toutes les 5 minutes au plus, pour que Timothée sache qu'il ne l'entendra pas.
  _prevenirNom(pourquoi) {
    const now = Date.now();
    if (now - (this._prevenuAt || 0) < PREVENIR_MS) { this.log(`Oreille (voiture) : ${pourquoi}, déjà prévenu il y a moins de 5 min`); return; }
    this._prevenuAt = now;
    this.log(`Oreille (voiture) : ${pourquoi} — je préviens Timothée que je ne peux pas vérifier s'il m'appelle`, true);
    try { this.audio.tone('ko'); } catch (_) {}
    try { this.voice.speak(pourquoi === 'pas de réseau' ? "Je n'ai pas de réseau : je ne peux pas savoir si tu m'appelles. Touche l'écran pour me parler." : "Le réseau est trop lent : je n'arrive pas à savoir si tu m'appelles. Si c'est le cas, touche l'écran."); } catch (_) {}
  }
  _texteRegarde(demande) {
    return `[On vient de te dire, en te regardant : « ${demande} ». C'est pour toi : réponds maintenant, à voix haute, brièvement. La transcription peut être approximative : si elle ne veut rien dire, demande de répéter.]`;
  }
  _texteDeLoin(demande, doute = false) {
    // En voiture (journal du 05/11/26 : « du canapé par exemple » envoyé à chaque réveil en voiture) : il conduit.
    if (this.enVoiture) return `[Timothée t'appelle en voiture (« Wilson, … ») : « ${demande} ». Réponds-lui maintenant, brièvement. Le son de la voiture est souvent mauvais : si la transcription ne veut rien dire, demande-lui de répéter ; si un nom de client ou un chiffre te semble douteux, fais-le confirmer avant d'agir.${this._suiteRecente()}]`;
    return `[On vient de te parler de loin, sans te regarder (« Wilson, … », du canapé par exemple) : « ${demande} ». Fais-le ou réponds maintenant, brièvement. La transcription peut être approximative (de loin, télé possible) : si elle ne veut rien dire, demande-lui de répéter. Si la demande est vague sur ce qu'il faut faire (« l'éteindre », « ça », « le mettre ») ou ${doute ? 'si elle est mêlée à d\'autres phrases (on n\'est pas sûr qu\'on t\'ait appelé)' : 'si elle semble venir de la télé'}, n'agis pas sur la maison : demande d'abord de quoi il s'agit (« Tu veux que j'éteigne la grande lumière ? »). Si c'est visiblement quelqu'un qui parle de toi à une autre personne, ne dis rien.]`;
  }
  // « Wilson » tout seul (journal du 30/10/26 : 6 « Oui ? » pour rien) : il ne dit plus rien. Une petite note et son
  // visage qui se réveille ; il écoute la suite, et se rendort sans un mot si personne ne parle dans les 8 s.
  _ecouteSeule() {
    const conv = this.convId, t0 = performance.now();
    try { this.audio.tone('ecoute'); } catch (_) {}
    // En voiture (journal du 04/11/26, 11h31 et 11h47 : « Wilson » → rien, rendormi 8 s après ; « j'ai cru que tu m'entendais
    // plus ») : il ne voit pas l'écran, Wilson répond « Oui ? » et attend 20 s.
    const voiture = this._voitureBt, attente = voiture ? 20000 : 8000;
    this.pill('Je t\'écoute…', 'run', attente);
    if (voiture && this.brain.open && this._aDire && this._aDireEnvoyer()) {
      // Journal du 05/11/26, 11h04:29 : il l'appelait pour avoir la réponse arrivée 7 s plus tôt ; Wilson disait « Oui ? ».
      this.log('« Wilson » tout seul, en voiture, une réponse du CRM attend : je la donne');
    } else if (voiture && this.brain.open) {
      this.log('« Wilson » tout seul, en voiture : je réponds « Oui ? » et j\'écoute 20 s');
      this.brain.sendText('[Timothée t\'appelle en voiture : dis seulement « Oui ? » et écoute la suite.]');
    } else this.log('« Wilson » tout seul : j\'écoute sans rien dire');
    setTimeout(() => {
      if (conv !== this.convId || this.state !== 'conversation' || (this._heardAt || 0) > t0 || this.audio.playing) return;
      this.log(`Appelé sans suite (rien entendu en ${attente / 1000} s) : je me rendors${voiture ? '' : ' sans rien dire'}`); this.endConversation('silence');
    }, attente);
  }

  // Chaque phrase entendue en voiture : son écart avec les empreintes (pour régler l'oreille d'après le journal).
  _oreilleLog(r) {
    // Téléphone relié à la voiture aussi (journal du 04/11/26 : rien n'était noté, impossible de voir ce que l'oreille entendait).
    // Seulement les phrases proches de « Wilson » (la radio ne remplit pas le journal).
    if (r.score === Infinity || (!this.car && !this._voitureBt) || (!r.oui && r.score > this.oreille.limite * 2)) return;
    this.log(`Oreille : phrase de ${r.duree.toFixed(1)} s, écart ${r.score.toFixed(1)} (limite ${this.oreille.limite.toFixed(1)})${r.oui ? ' → réveil' : r.score < this.oreille.presque ? ' → presque' : ''}`);
  }
  // Presque reconnu (bruit, voix fatiguée…) : second avis de Gemini Flash-Lite sur la phrase, 20 fois par heure au plus.
  async _secondAvis(d) {
    if (!(this.car || this._voitureBt) || this.state !== 'veille' || !navigator.onLine || !this.settings.apiKey) return;   // téléphone relié à la voiture aussi (04/11/26)
    const now = Date.now(); this._avis = (this._avis || []).filter((t) => now - t < 3600000);
    if (this._avis.length >= 20) return;
    this._avis.push(now);
    const pcm = this.audio.recent(Math.min(5000, (d.duree + 1.2) * 1000));
    try {
      const ctl = new AbortController(), m = setTimeout(() => ctl.abort(), NOM_DELAI_VOITURE_MS);
      const oui = await this.eco.nomDit({ key: this.settings.apiKey, audio: pcm, signal: ctl.signal }).finally(() => clearTimeout(m));
      this.log(`Oreille : presque (écart ${d.score.toFixed(1)}, limite ${d.limite.toFixed(1)}) → avis de Gemini : ${oui ? 'oui, mon nom' : 'non'}`);
      if (oui && (this.car || this._voitureBt) && this.state === 'veille') { this._wakePcm = pcm; this.face.play('wake'); this.startConversation('prenom'); }
    } catch (e) { this.log('Second avis impossible : ' + e.message); }
  }
  // Le nom est vérifié : la réponse retenue est jouée.
  _gateOpen(why) {
    const G = this._gate; if (!G || G.ok) return;
    G.ok = true; this.log(`Nom vérifié (${why})`);
    const buf = G.buf; G.buf = []; this._gate = null;
    for (const [i16, rate] of buf) this._liveAudio(i16, rate);
  }
  // En roulant (téléphone, GPS) : mode voiture tout seul ; garé depuis 4 min : fin (C5).
  _watchSpeed() {
    const want = VOITURE && !!this.settings.voitureAuto && deviceName() === 'téléphone' && !!navigator.geolocation;
    if (!want) { if (this._geo != null) { navigator.geolocation.clearWatch(this._geo); this._geo = null; } return; }
    if (this._geo != null) return;
    let fast = 0, fastSince = 0, slowSince = 0, prev = null;
    const dist = (a, b) => { const R = 6371000, r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * R; };
    this._geo = navigator.geolocation.watchPosition((p) => {
      const c = p.coords, here = { t: p.timestamp, lat: c.latitude, lon: c.longitude, acc: c.accuracy || 999 };
      let v = c.speed;
      // Vitesse donnée par le GPS ; à défaut, calculée entre deux positions PRÉCISES et nettement éloignées
      // (à l'intérieur, la position saute de dizaines de mètres : fausse vitesse, journal du 25/10/26).
      if (v == null || isNaN(v)) {
        v = null;
        if (prev && here.t - prev.t >= 2000) {
          const d = dist(prev, here), err = here.acc + prev.acc;
          if (here.acc <= 25 && prev.acc <= 25) v = d > 2 * err ? d / ((here.t - prev.t) / 1000) : 0;
          else if (d <= err) v = 0;                 // imprécis mais immobile : sert seulement à voir qu'on est garé
        }
      }
      // Garder l'ancienne position 2 s (les positions arrivent chaque seconde), sauf pour une plus précise.
      if (!prev || here.t - prev.t >= 2000 || (prev.acc > 25 && here.acc <= 25)) prev = here;
      if (v == null) return;                        // pas de mesure fiable : rien ne change
      this.speed = v;
      const libre = !this._carOffAt || Date.now() - this._carOffAt > 20 * 60000;
      if (v != null && v >= 6) {
        fast++; fastSince = fastSince || Date.now(); slowSince = 0;
        if (fast >= 3 && Date.now() - fastSince >= 8000 && !this.car && libre) this.enterCar('en roulant');
      }
      else {
        fast = 0; fastSince = 0;
        if (v != null && v < 1.5) {
          slowSince = slowSince || Date.now();
          if (this.car && this.car.why === 'en roulant' && Date.now() - slowSince > 4 * 60000 && this.state !== 'conversation') this.exitCar('garé depuis 4 min');
        } else slowSince = 0;
      }
    }, (e) => { if (!this._geoErr) this.log('GPS (mode voiture automatique) : ' + e.message); this._geoErr = e.message; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
}
