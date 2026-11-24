// Wilson — méthodes de la classe App (js/app.js) : mode économique (phrase enregistrée → Gemini Flash → voix de la tablette), quotas, essai de connexion.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { sentenceCut, sayable, warmUp } from '../eco.js';
import { nomDit } from '../oreille.js';
import { Maison } from '../maison.js';
import { ANALYSE_MAX_MS } from '../analyste.js';
import { demandeEnCours } from '../memoire.js';
import { appli, SEG_VU_MIN, ECO_SILENCE_MS, ECO_SPEC_MS, ECO_TAIL_MS, $, quotaInfo, trimSilence, shorten, isNetErr, concat } from './commun.js';

export class EcoMethodes {

  // ---------- mode économique ----------
  // Chaque phrase est enregistrée jusqu'au silence, puis envoyée (avec une photo) à Gemini Flash ; la réponse est lue par la tablette.
  _startEco(reason, chunks) {
    this.mode = 'eco'; this.eco.setSpeed(this.settings.ecoSpeed); this.voice.voiceName = this.settings.ecoVoice || '';
    if (performance.now() - (this.lastAnswerAt || -1e9) > 5 * 60000) this.eco.reset();     // on garde le fil de la discussion 5 min
    this.pending = null;
    const now = performance.now();
    this.ecoState = { cap: null, busy: false, queue: [], ignored: 0 };
    warmUp(this.settings.apiKey);
    this.setState('conversation'); this.lastActivity = now;
    this.log(`Conversation ouverte en mode économique (${reason})`);
    if ((reason === 'prenom' || reason === 'regard') && chunks.length) {
      const len = chunks.reduce((a, c) => a + c.length, 0);
      this.ecoState.cap = { chunks: chunks.slice(), len, lastVoice: now, wake: reason === 'prenom', voiced: 3, looked: 1, gazed: reason === 'regard' ? SEG_VU_MIN : 0, peak: this.audio.db };
    } else if (reason === 'test') this._ecoSend({ text: '[Présente-toi en une phrase, avec chaleur.]' });
    else if (reason === 'toucher') this._say(['Oui ?', "Je t'écoute.", 'Oui, dis-moi ?'][Math.floor(Math.random() * 3)]);
    else if (reason === 'apres_appel') this._ecoSend({ text: this._apresAppelTexte() });
    else if (reason === 'apres_appel_entrant') this._ecoSend({ text: this._apresAppelEntrantTexte() });
    else if (reason === 'reponse_tardive' && this._lateSay) { this._aDire = null; this._say(this._lateSay); }
    if (this.netWait && this.netWait.start) this._netBack();
  }

  _ecoFrame(i16) {
    const E = this.ecoState, now = performance.now();
    if (!E) return;
    if (this.voice.speaking) return;                       // il parle : seule la détection de coupure écoute (voir _wireAudio)
    if (now - this.playEndAt < ECO_TAIL_MS) return;        // fin de sa propre voix (écho)
    if (this.paused && !E.cap) return;                     // plus regardé : il n'écoute plus (R3)
    if (E.cap) {
      const C = E.cap, db = this.audio.db;
      C.chunks.push(i16); C.len += i16.length;
      // Fin de phrase : silence, OU voix nettement plus faible que celle de la personne (télé, bruit de fond) → on n'attend pas.
      C.peak = Math.max(db, (C.peak == null ? db : C.peak) - 0.05);
      if (now - this.audio.lastVoicedAt < 60 && db > C.peak - 15) {
        C.lastVoice = now; C.voiced = (C.voiced || 0) + 1;
        if (this._addressed(now)) C.looked = (C.looked || 0) + 1;
        if (this._gazing(now)) C.gazed = (C.gazed || 0) + 1;
      }
      // La personne a repris après l'envoi anticipé : on l'annule, la phrase continue d'être enregistrée (R2).
      if (C.spec && C.lastVoice > C.spec.endAt) this._specCancel(C);
      const quiet = now - C.lastVoice;
      if (quiet > ECO_SILENCE_MS || C.len > 16000 * 12) {
        E.cap = null;
        if (C.spec) this._specConfirm(C.spec);                     // la réponse est déjà en route : Wilson peut parler
        else { const req = this._ecoPrepare(C); if (req) this._ecoSend(req); }
      } else if (quiet > ECO_SPEC_MS && !C.spec && (C.specN || 0) < 2 && !E.busy && this.eco.canExtra()) {
        // Envoi anticipé (PLAN 6 bis) : la phrase part dès un court silence ; Wilson ne parlera qu'à la fin confirmée.
        C.specN = (C.specN || 0) + 1;
        const req = this._ecoPrepare(C, true);
        if (req) { C.spec = req; this._ecoSend(req); }
      }
    } else if (this.audio.speaking && now - this.audio.lastVoicedAt < 60 && this._addressed(now)) {   // voix présente maintenant, et pour lui
      // Juste après sa réponse, la personne a pu commencer à parler pendant la garde anti-écho : on reprend un peu plus loin.
      const pre = this.audio.recent(now - this.playEndAt < ECO_TAIL_MS + 400 ? 900 : 450);
      E.cap = { chunks: [pre], len: pre.length, lastVoice: now, looked: 1, gazed: this._gazing(now) ? 1 : 0, peak: this.audio.db };
    }
  }

  // Prépare l'envoi d'une phrase enregistrée (null si ce n'est qu'un bruit ou si personne ne le regardait).
  _ecoPrepare(cap, spec = false) {
    const raw = concat(cap.chunks);
    let audio = trimSilence(raw, this.audio.floor);
    if (!audio && cap.wake) audio = raw.subarray(Math.max(0, raw.length - 16000 * 6));   // l'oreille a entendu « Wilson » : on envoie quand même
    if (!audio) { if (!spec) this.log('Rien d\'audible, phrase ignorée'); return null; }
    if (!cap.wake && (audio.length < 16000 * 0.5 || (cap.voiced || 0) < 15)) return null;  // trop court : un bruit
    if (!cap.wake && !cap.looked) return null;                                              // personne ne le regardait
    // R1 (règle de Timothée du 01/11/26) : il ne répond que si la phrase a été dite en le regardant (regard confirmé).
    if (!cap.wake && this._verrouRegard && (cap.gazed || 0) < SEG_VU_MIN && !(performance.now() < (this._permisJusqua || 0))) {
      if (!spec) this.log(`Phrase ignorée : personne ne me regardait vraiment pendant la phrase (${this._etatRegard()})`);
      return null;
    }
    // Indication pour Gemini : on le regardait (réponds), ou simple suite de la discussion (réponds seulement si c'est clair).
    const pol = this.settings.listenMode || 'regard';
    const hint = pol !== 'regard' || cap.wake ? '' : cap.gazed ? 'La personne te regardait en disant cela : elle te parle, réponds-lui (pour_moi true) sauf si on n\'entend que ta propre voix ou rien d\'intelligible.'
      : 'Phrase dite juste après ta réponse, sans te regarder : réponds seulement si c\'est clairement la suite de votre échange.';
    return { audio, endAt: cap.lastVoice, hint, spec, wake: !!cap.wake, ctl: new AbortController() };
  }

  // Envoi anticipé : la personne a repris → la requête est annulée (rien n'a été dit, rien n'est retenu).
  _specCancel(C) {
    const r = C.spec; C.spec = null; if (!r) return;
    r.cancelled = true; r.ctl.abort(); if (r.gateFail) r.gateFail();
    this.face.clearEmotion();
  }
  // Fin de phrase confirmée : la réponse préparée peut être dite.
  _specConfirm(r) { r.confirmed = true; if (r.gateOk) r.gateOk(); }

  async _ecoSend(req) {
    const E = this.ecoState; if (!E) return;
    if (E.busy) { if (!req.spec) E.queue.push(req); return; }
    E.busy = true; const conv = this.convId;
    if (!req.ctl) req.ctl = new AbortController();
    this.face.setEmotion('reflexion', 30000, 0.6);
    const tSend = performance.now(); let answered = false;
    let sess = null, emoSet = false, notForMe = false, tFirst = 0, tNet = 0, repeated = false, timing = null, held = null;
    const speakChunk = (chunk) => {
      chunk = sayable(chunk);
      if (!chunk || repeated) return;
      if (!sess && this._isRepeat(chunk)) { repeated = true; this.log('Répétition de ma réponse précédente évitée'); return; }
      if (!sess) { sess = this._startSpeech(); tFirst = performance.now(); if (!emoSet) this.face.clearEmotion(); }
      sess.push(chunk);
    };
    // Envoi anticipé : la réponse se prépare pendant qu'on vérifie que la phrase est finie ; Wilson ne parle qu'après.
    // Voiture, phrase qui a réveillé Wilson : rien n'est dit avant d'avoir vérifié que le nom y est (C6).
    const live = () => (!req.spec || req.confirmed) && !(req.wake && this.car);
    // Lecture en flux : Wilson commence à parler dès la première phrase écrite.
    const reader = (st) => (pr) => {
      if (!tNet) tNet = performance.now();
      if (conv !== this.convId) return;
      if (!live()) { held = [st, pr]; return; }
      if (pr.pourMoi === false) { notForMe = true; return; }
      if (pr.emotion && !emoSet) { emoSet = true; if (pr.emotion !== 'neutre') this.face.setEmotion(pr.emotion, 6500, 0.9); else this.face.clearEmotion(); }
      const txt = pr.reponse || '';
      const cut = pr.closed ? txt.length : sentenceCut(txt, st.spoken);
      if (cut > st.spoken) { speakChunk(txt.slice(st.spoken, cut).trim()); st.spoken = cut; }
      if ((this.settings.subtitles || this.car) && txt) $('subtitle').textContent = txt.slice(0, 220);
    };
    const st1 = { spoken: 0 }, onPartial = reader(st1);
    let gate = null;
    if (req.spec && !req.confirmed) {
      gate = new Promise((ok, ko) => {
        req.gateOk = () => { ok(); if (held) { const [s, p] = held; held = null; reader(s)(p); } };
        req.gateFail = () => { const e = new Error('Annulé'); e.name = 'AbortError'; ko(e); };
      });
      gate.catch(() => {});
    }
    const ms = (t) => ((t - (req.endAt || tSend)) / 1000).toFixed(1);
    try {
      // R6 : aucune photo d'office ; si Wilson doit regarder, il le dit (« regarder ») et une 2e requête part avec la photo.
      const out = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), audio: req.audio, text: req.text, hint: req.hint, onPartial, signal: req.ctl.signal, crm: this.crm.on, maison: this.maison.on });
      if (gate) await gate;                                  // envoi anticipé : fin de phrase confirmée (sinon : annulé)
      if (conv !== this.convId) return;
      if (this.netWait) this._netBack();                     // Google a répondu : le réseau est revenu
      this.eco.commit(out, req.text);
      out.reponse = sayable(out.reponse);
      let said = out.reponse, last = out, tSearch = 0;
      if (req.wake && this.car && out.entendu && !nomDit(out.entendu)) {
        this.log(`Pas mon nom dans « ${out.entendu.slice(0, 100)} » : je me tais et je me rendors`, true);
        out.pourMoi = false; setTimeout(() => conv === this.convId && this.endConversation('pas mon nom'), 200);
      }
      if (out.pourMoi && out.entendu) this._noteHeard(out.entendu, true);
      if (!out.pourMoi || notForMe || repeated || (!out.reponse && !out.chercher && !out.regarder && !out.crm)) {
        if (!emoSet) this.face.clearEmotion();
        E.ignored++;
        this.log(`Pas pour moi (${E.ignored}) : « ${out.entendu.slice(0, 80)} » (${ms(performance.now())} s, ${out.model})`, true);
        if (sess) sess.end();
        // Bruits, télé, conversations entre vous : au 2e d'affilée, Wilson retourne en veille.
        if (E.ignored >= 2 && !sess) { setTimeout(() => conv === this.convId && this.endConversation('pas pour moi'), 200); }
      } else {
        E.ignored = 0; answered = true; this.lastAnswerAt = performance.now();
        if (!sess && out.reponse) speakChunk(out.reponse);          // réponse hors format : on la dit d'un bloc
        this._applyEco(out, emoSet);
        // 2e temps (vue) : on lui demande de regarder → photo nette, puis la vraie réponse.
        const photo = out.regarder ? this._photo() : null;
        if (out.regarder && conv === this.convId) {
          emoSet = false;
          if (!photo) speakChunk("Ma caméra est coupée, je ne peux pas regarder.");
          else {
            this.log('Photo prise à la demande (mode économique)', true); this.face.play('tilt');
            const st3 = { spoken: 0 };
            try {
              const out3 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), image: photo, signal: req.ctl.signal, onPartial: reader(st3),
                text: `[Photo prise à l'instant, comme demandé. Question : « ${out.entendu || '(voir plus haut)'} ». Regarde la photo et réponds au format JSON demandé ; regarder doit être false.]` });
              if (conv !== this.convId) return;
              this.eco.commit(out3, '[Photo prise à la demande]');
              out3.reponse = sayable(out3.reponse);
              if (!st3.spoken) speakChunk(out3.reponse || "Je ne vois pas bien, désolé.");
              this._applyEco(out3, emoSet);
              said = [said, out3.reponse].filter(Boolean).join(' '); last = out3; out.fin = out.fin || out3.fin;
            } catch (e) { if (e.name === 'AbortError') throw e; this.log('Photo : ' + e.message); speakChunk("Je n'arrive pas à regarder pour le moment."); }
          }
        }
        // 2e temps : une info récente est nécessaire → recherche Google pendant que Wilson dit sa phrase d'attente.
        if (out.chercher && (this.remote.on || !this.eco.noSearch) && conv === this.convId) {
          this.log(`Recherche : « ${out.chercher} »`, true);
          tSearch = performance.now(); emoSet = false;
          if (!sess) this.face.setEmotion('reflexion', 30000, 0.6);
          const st2 = { spoken: 0 };
          if (this.remote.on) {                                   // Tavily par le script (gratuit), Gemini en secours
            try {
              const txt = await this._lookup(`${out.entendu || ''} (${out.chercher})`, req.ctl.signal, tSearch);
              if (conv !== this.convId) return;
              speakChunk(txt); this.eco.commit({ raw: { reponse: txt }, entendu: '' }, `[Recherche : ${out.chercher}]`);
              said = [said, txt].filter(Boolean).join(' ');
            } catch (e) { if (e.name === 'AbortError') throw e; speakChunk("Je n'arrive pas à trouver l'information pour le moment."); }
          } else try {
            const out2 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco-search'), search: true, signal: req.ctl.signal, onPartial: reader(st2),
              text: `[Question : « ${out.entendu || '(voir l\'enregistrement précédent)'} ». Recherche Google à faire : « ${out.chercher} ». Réponds au format JSON demandé.]` });
            if (conv !== this.convId) return;
            this.eco.commit(out2, `[Recherche Google : ${out.chercher}]`);
            out2.reponse = sayable(out2.reponse);
            if (!st2.spoken) speakChunk(out2.reponse || "Je n'ai rien trouvé de sûr, désolé.");
            this._applyEco(out2, emoSet);
            said = [said, out2.reponse].filter(Boolean).join(' '); last = out2; out.fin = out.fin || out2.fin;
          } catch (e) {
            if (e.name === 'AbortError') throw e;
            this.log('Recherche impossible : ' + e.message);
            try { speakChunk(await this._lookup(`${out.entendu || ''} (${out.chercher})`, req.ctl.signal)); }
            catch (e2) { if (e2.name === 'AbortError') throw e2; speakChunk("Je n'arrive pas à trouver l'information pour le moment."); }
          }
        }
        // 2e temps : le CRM (PLAN 2 quater). Wilson a dit sa phrase d'attente ; l'appli interroge le CRM.
        if (out.crm && conv === this.convId) {
          const nom = { client: 'crm_client', agenda: 'crm_agenda', bilan: 'crm_bilan', produit: 'crm_produit', question: 'crm_question', itineraire: 'itineraire', appeler: 'appeler', noter: 'crm_noter', confirmer: 'crm_confirmer' }[out.crm.outil];
          if (nom) {
            tSearch = tSearch || performance.now(); emoSet = false;
            if (!sess && !['crm_noter', 'crm_confirmer', 'appeler', 'itineraire'].includes(nom)) this.face.setEmotion('reflexion', nom === 'crm_question' ? ANALYSE_MAX_MS : 30000, 0.6);
            this.log(`CRM (économique) : ${out.crm.outil} ${JSON.stringify(out.crm).slice(0, 160)}`, true);
            let res;
            try { res = await this._crmRun(nom, out.crm, req.ctl.signal, { heard: [{ t: performance.now(), text: out.entendu }] }); }
            catch (e) { if (e.name === 'AbortError') throw e; res = { dire: "Je n'arrive pas à joindre le CRM pour le moment." }; }
            if (conv !== this.convId) return;
            if (res.dire) {
              speakChunk(res.dire); said = [said, res.dire].filter(Boolean).join(' ');
              this.eco.commit({ raw: { reponse: res.dire }, entendu: '' }, `[CRM : ${out.crm.outil}]`);
            } else {
              const st4 = { spoken: 0 };
              const out4 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), signal: req.ctl.signal, onPartial: reader(st4),
                text: `[Question : « ${out.entendu || '(voir plus haut)'} ». Réponse du CRM :\n${res.info}\nRéponds au format JSON demandé.]` });
              if (conv !== this.convId) return;
              this.eco.commit(out4, `[CRM : ${out.crm.outil}]`);
              out4.reponse = sayable(out4.reponse);
              if (!st4.spoken) speakChunk(out4.reponse || "Le CRM ne m'a rien donné de clair.");
              this._applyEco(out4, emoSet);
              said = [said, out4.reponse].filter(Boolean).join(' '); last = out4; out.fin = out.fin || out4.fin;
            }
          }
        }
        // La maison (PLAN 7 bis) : Home Assistant agit et répond ; sa phrase est dite telle quelle.
        if (out.maison && this.maison.on && conv === this.convId) {
          tSearch = tSearch || performance.now();
          let res; const pid = this.pill('Maison : ' + this._court(out.maison) + '…');
          try { res = await this.maison.dire(out.maison, req.ctl.signal); }
          catch (e) { if (e.name === 'AbortError') throw e; res = { ok: false, dire: 'Home Assistant ne répond pas.' }; }
          if (conv !== this.convId) return;
          this.pillEnd(pid, res.ok, this._court(res.dire)); this.face.play(res.ok ? 'nod' : 'shake');
          speakChunk(res.dire); said = [said, res.dire].filter(Boolean).join(' ');
          this.eco.commit({ raw: { reponse: res.dire }, entendu: '' }, `[Maison : ${out.maison}]`);
        }
        this.log(`« ${out.entendu.slice(0, 90)} » → ${said.slice(0, 110)}`, true);
        // Délais mesurés depuis la fin de la phrase (dernier son de voix) : où part le temps.
        const tAll = performance.now();
        const sec = (t) => (t ? Math.round((t - (req.endAt || tSend)) / 100) / 10 : null);
        timing = () => this.remote.mesure({ envoi: sec(tSend), google: sec(tNet), phrase1: sec(tFirst), voix: this.voice.startedAt ? sec(this.voice.startedAt) : null,
          complet: sec(tAll), modele: out.model, reflexion: out.think || 'par défaut', relance: !!(out.hedged || last.hedged),
          recherche: tSearch ? Math.round((tAll - tSearch) / 100) / 10 : null, anticipe: !!req.spec, phrase: req.audio ? Math.round(req.audio.length / 1600) / 10 : null });
        const logTiming = () => this.log(`Délais : envoi ${ms(tSend)} s${req.spec ? ' (anticipé)' : ''} · Google ${ms(tNet || tAll)} s · 1re phrase ${ms(tFirst || tAll)} s · voix ${this.voice.startedAt ? ms(this.voice.startedAt) + ' s' : '—'} · complet ${ms(tAll)} s`
          + ` (${out.model}, réflexion ${out.think || 'par défaut'}${out.hedged ? ', relancée' : ''}${tSearch ? `, recherche ${((tAll - tSearch) / 1000).toFixed(1)} s${last.hedged ? ' relancée' : ''}` : ''}, phrase de ${req.audio ? (req.audio.length / 16000).toFixed(1) + ' s' : '—'})`);
        const mesure = timing; timing = () => { logTiming(); mesure(); };
        this.memory.addExchange(out.entendu, said, this.famille._parle());
        this.famille.dit(said); this.questions.dit(said, conv);
        this._lastReply = said;
        if (this.settings.subtitles || this.car) $('subtitle').textContent = said.slice(0, 220);
      }
      if (sess) { sess.end(); await this._endSpeech(sess, said); }
      if (timing) timing();
      if (conv !== this.convId) return;
      if (out.fin) setTimeout(() => conv === this.convId && this.endConversation('au revoir'), 600);
    } catch (e) {
      if (sess) sess.cancel();
      if (e.name === 'AbortError' || req.cancelled) { if (req.cancelled) this.log('Envoi anticipé annulé : la phrase continuait'); return; }
      if (conv !== this.convId) return;
      this.face.clearEmotion(); this.log('Mode économique : ' + e.message);
      if (e.quota) {
        this._ecoQuotaPause(e.message);
        this.badge(this.ecoQuotaMsg, 15000, true); this.face.setEmotion('gene', 4000); this.endConversation('quota');
      } else if (e.auth) {
        this.badge('Google refuse ma clé — appui long sur moi, puis « Vérifier la clé »', 15000, true); this.endConversation('clé');
      } else if (isNetErr(e) && req.audio) {
        // Pas de réseau (C8) : la phrase est gardée et renvoyée dès qu'il revient.
        this._netLost('pas de réseau (mode économique)', { eco: { ...req, spec: false, confirmed: true, ctl: null } });
      } else {
        this.face.setEmotion('confus', 3000);
        this.badge(`Je n'arrive pas à réfléchir : ${shorten(e.message)}`, 10000, true);
      }
    } finally {
      E.busy = false; if (answered) this.lastActivity = performance.now();
      const next = E.queue.shift();
      if (next && conv === this.convId) this._ecoSend(next);
    }
  }

  // Effets d'une réponse : émotion (si pas déjà montrée pendant l'écriture), souvenirs, geste.
  _applyEco(out, emoShown) {
    if (!emoShown && out.emotion) { if (out.emotion !== 'neutre') this.face.setEmotion(out.emotion, 6500, 0.9); else this.face.clearEmotion(); }
    for (const f of out.memoriser) { if (this.memoire.ajouter(f, { qui: this.famille._parle(), origine: 'demandé' })) this.log('Retenu (demandé) : ' + f, true); }
    if (out.oublier && demandeEnCours(out.oublier)) this.log(`Oublier « ${out.oublier} » : c'est sa demande en cours qu'il laisse tomber, aucun souvenir effacé`, true);
    else if (out.oublier) { const g = this.memoire.oublier(out.oublier); this.log(`Oublier « ${out.oublier} » : ${g.length}${g.length ? ' (' + g.join(' ; ') + ')' : ''}`, true); }
    const g = { oui: 'nod', non: 'shake', sautiller: 'bounce', pencher_la_tete: 'tilt' }[out.geste];
    if (g) this.face.play(g); if (out.geste === 'clin_oeil') this.face.doWink(1);
    if (out.memoriser.length && !g) this.face.play('nod');
  }

  _startSpeech() {
    this.barge.n = 0; this.barge.echo = Math.max(-60, this.audio.db);
    this.lastActivity = performance.now(); this._cutAt = 0;
    return this.voice.stream();
  }
  _isRepeat(chunk) {
    const n = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const c = n(chunk), last = n(this._lastReply);
    return c.length >= 15 && last.includes(c);
  }
  async _endSpeech(sess, text) {
    try { await sess.done; }
    catch (e) {
      this.log('Voix : ' + (e.code || e));
      if (e.code === 'not-allowed') {
        this.badge('Touche-moi une fois pour que je puisse parler à voix haute', 10000, true);
        const st = $('subtitle'); st.hidden = false; st.textContent = (text || '').slice(0, 220);
        setTimeout(() => { st.hidden = !this.settings.subtitles; }, 8000);
      }
    }
    // Coupé par la famille : garde courte (la personne continue de parler) ; sinon garde complète contre l'écho.
    this.playEndAt = this._cutAt ? this._cutAt - (ECO_TAIL_MS - 300) : performance.now();
    this.lastActivity = performance.now(); this.face.setTalk(0);
    if (!this._cutAt && this.questions) this.questions.finiDeParler();   // question de Claude dite jusqu'au bout (18/11/26)
  }

  async _say(text) {
    const sess = this._startSpeech(); sess.push(text); sess.end();
    await this._endSpeech(sess, text);
  }

  // Quota gratuit épuisé : pause jusqu'au délai indiqué par Google, sinon jusqu'à la remise à zéro quotidienne
  // (minuit heure du Pacifique, soit 9h00 en France l'été, 8h00 l'hiver).
  _quotaPause(msg) {
    const q = quotaInfo(msg, 'mes modèles vocaux en direct');
    this.quotaUntil = q.until; this.quotaMsg = q.txt; this.quotaRaw = msg; this.log('Quota direct : ' + q.txt + ' — Google : ' + msg);
    // Retenu même après un redémarrage (pour cette clé) : inutile de retenter le direct avant la remise à zéro.
    try { localStorage.setItem('wilson.quota', JSON.stringify({ k: this.settings.apiKey.slice(-8), until: q.until, txt: q.txt })); } catch (_) {}
  }
  _loadQuota() {
    try {
      const o = JSON.parse(localStorage.getItem('wilson.quota'));
      if (o && o.k === this.settings.apiKey.slice(-8) && o.until > Date.now()) { this.quotaUntil = o.until; this.quotaMsg = o.txt; this.log('Direct en pause (quota) jusqu\'à la remise à zéro'); }
    } catch (_) {}
  }
  _ecoQuotaPause(msg) {
    const q = quotaInfo(msg, 'le mode économique');
    this.ecoQuotaUntil = q.until; this.ecoQuotaMsg = q.txt; this.log('Quota économique : ' + q.txt + ' — Google : ' + msg);
  }

  // Diagnostic : vérifie le cerveau (direct puis, si besoin, mode économique), sans parler.
  async testConnection() {
    if (this.state === 'eveil' || this.state === 'conversation') return { ok: true, msg: 'Déjà en conversation' };
    this.quotaUntil = 0; this.ecoQuotaUntil = 0;
    const want = this.settings.brainMode || 'auto', lines = []; let ok = false, auth = false;
    if (want !== 'eco') {
      try {
        await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), interrupts: this.settings.bargeIn === 'directe' });
        const b = this.brain; this.brain.close(); ok = true;
        lines.push(`Direct ✓ (${b.modelUsed}, configuration ${['complète', 'simplifiée', 'minimale'][b.level]})`);
      } catch (e) {
        if (e.quota) this._quotaPause(e.message); auth = !!e.auth;
        lines.push(`Direct impossible${e.quota ? ' (quota)' : ''} : « ${e.message} »`);
      }
    }
    if (!auth && (want === 'eco' || (want === 'auto' && !ok))) {
      try {
        const out = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), text: '[Test de connexion : réponds en JSON avec pour_moi true et reponse "OK".]' });
        this.eco.reset(); ok = true;
        lines.push(`Mode économique ✓ (${out.model}) — Wilson répondra avec la voix de la tablette`);
      } catch (e) {
        if (e.quota) this._ecoQuotaPause(e.message); auth = auth || !!e.auth;
        lines.push(`Mode économique impossible${e.quota ? ' (quota)' : ''} : « ${e.message} »`);
      }
    }
    return { ok, auth, msg: lines.join(' · ') };
  }
}
