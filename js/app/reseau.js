// Wilson — méthodes de la classe App (js/app.js) : réseau coupé, reconnexion, phrase gardée pendant la coupure.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { OUTILS_VOITURE, $, shorten, isNetErr } from './commun.js';

export class ReseauMethodes {

  async _reconnect(why) {
    if (this._reconnecting || this.netWait) return; this._reconnecting = true;
    this.log(`Reconnexion (${why})`);
    const handle = this.brain.handle;
    this.brain.close(); this.brain.handle = handle;
    try {
      await this._connectLive();
    } catch (e) {
      this.log('Reconnexion impossible : ' + e.message);
      this._reconnecting = false;
      // Réseau coupé (C8) : la discussion attend le retour du réseau au lieu de s'arrêter.
      if (this.state === 'conversation' && isNetErr(e)) { if (!this.brain.handle) this.brain.handle = handle; return this._netLost('connexion perdue'); }
      this.endConversation('coupure');
    }
    this._reconnecting = false;
  }
  _connectLive() {
    return this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), resume: true, interrupts: this.settings.bargeIn === 'directe', extra: this._extraTools(), garder: this._voitureBt ? OUTILS_VOITURE : null });
  }

  // ---------- réseau coupé sur la route (C8) ----------
  // La discussion est gardée ; il le dit une fois (voix du téléphone, qui marche sans Internet) et réessaie : tout de suite
  // quand le téléphone retrouve le réseau, sinon 2, 4, 8 puis toutes les 15 s, pendant 3 min en voiture (1 min ailleurs).
  // extra.start : réveillé sans réseau (la conversation n'a pas commencé) ; extra.eco : requête du mode économique à renvoyer.
  _netLost(why, extra = {}) {
    const now = Date.now();
    let W = this.netWait;
    if (!W) {
      const max = this.enVoiture ? 180000 : 60000;
      W = this.netWait = { since: now, until: now + max, n: 0, why, phrase: null, phraseAt: 0, timer: null, mode: this.mode };
      this.log(`Réseau coupé (${why}) : ${extra.start ? 'je réponds dès qu\'il revient' : 'discussion gardée'}, nouvel essai pendant ${max / 60000} min`);
      this.audio.tone('perdu'); this.face.setEmotion('confus', 4000); this.badge('Plus de réseau — je réessaie', 8000, true);
      // dit une fois (pas à chaque micro-coupure d'un réseau faible : une fois par minute au plus), après la fin de ce qu'il disait
      if ((this.enVoiture || this.state === 'conversation' || extra.start) && (extra.start || now - (this._netToldAt || 0) > 60000)) {
        W.toldAt = this._netToldAt = now;
        this._sayAfter(extra.start ? 'Pas de réseau pour l\'instant, je te réponds dès qu\'il revient.' : 'Je n\'ai plus de réseau, je reprends dès qu\'il revient.');
      }
    } else if (extra.start && now - (W.toldAt || 0) > 8000) { W.toldAt = now; this._say('Toujours pas de réseau, je te réponds dès qu\'il revient.'); }
    if (extra.start) { W.start = extra.start; W.mode = null; }
    if (extra.eco) { W.eco = extra.eco; W.mode = 'eco'; }
    if (this.mode === 'live' && this.brain.handle) W.handle = this.brain.handle;
    if (this.mode === 'live') this.brain.close();
    this._netSchedule();
  }
  // Voix du téléphone, une fois que la voix de Gemini déjà reçue a fini de sortir (pas deux voix en même temps).
  _sayAfter(text, n = 0) { if (this.audio.playing && n < 40) setTimeout(() => this._sayAfter(text, n + 1), 250); else this._say(text); }
  _netSchedule(ms) {
    const W = this.netWait; if (!W) return;
    clearTimeout(W.timer);
    W.timer = setTimeout(() => this._netRetry(), ms ?? ([2000, 4000, 8000][W.n] || 15000));
  }
  async _netRetry() {
    const W = this.netWait; if (!W || W.busy || this.phone) return;
    if (Date.now() > W.until) return this._netGiveUp();
    W.n++;
    if (!navigator.onLine) return this._netSchedule();            // toujours hors ligne : on attendra l'événement « en ligne »
    W.busy = true;
    try {
      if (W.start) {                                              // réveillé sans réseau : on redémarre la discussion avec sa phrase
        const S = W.start; this._wakePcm = S.pcm || null;
        await this.startConversation(S.reason, { handle: S.handle });
      } else if (W.mode === 'eco') {
        const req = W.eco; W.eco = null;
        if (req && this.ecoState) { req.ctl = new AbortController(); this._ecoSend(req); }
        else this._netBack();
      } else if (this.state === 'conversation') {
        this.brain.handle = W.handle || this.brain.handle;
        await this._connectLive();
        this._netBack();
      } else { this.netWait = null; clearTimeout(W.timer); }
    } catch (e) {
      this.log(`Réseau : nouvel essai raté (${shorten(e.message)})`);
      if (this.netWait === W) { if (isNetErr(e)) this._netSchedule(); else { this.netWait = null; this.endConversation('coupure'); } }
    } finally { W.busy = false; }
  }
  // C'est reparti : deux notes montantes ; la dernière phrase dite pendant la coupure part tout de suite (il y répond).
  _netBack() {
    const W = this.netWait; if (!W) return;
    this.netWait = null; clearTimeout(W.timer);
    const s = Math.round((Date.now() - W.since) / 1000), phrase = W.phrase && Date.now() - W.phraseAt < 60000 ? W.phrase : null;
    this.log(`Réseau revenu après ${s} s : ${W.start ? 'la discussion commence' : 'la discussion reprend'}${phrase && this.mode === 'live' ? ' (la phrase dite pendant la coupure est envoyée)' : ''}`);
    this.audio.tone('revenu'); this.face.setEmotion('joie', 2000);
    if (this.mode === 'live' && this.brain.open && !W.start) {
      if (phrase) for (let i = 0; i < phrase.length; i += 3200) this.brain.sendAudio(phrase.subarray(i, i + 3200));
      else this.brain.sendText('[Le réseau vient de revenir après une coupure : dis seulement « C\'est reparti, je t\'écoute. »]');
    }
    this.lastActivity = performance.now();
    this.crm.flushQueue();
  }
  _netGiveUp() {
    const W = this.netWait; if (!W) return;
    this.netWait = null; clearTimeout(W.timer);
    this.log(`Toujours pas de réseau après ${Math.round((Date.now() - W.since) / 1000)} s : veille`);
    this._netEndedAt = Date.now();
    if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('réseau');
    if (this.enVoiture) this._say(`Toujours pas de réseau, je me mets en veille : ${this.car && this.oreille.ready ? 'redis « Wilson »' : 'touche l\'écran'} quand il reviendra.`);
  }
  // Pendant la coupure : la dernière phrase dite (6 s au plus) est gardée, pas l'écho de sa propre voix.
  _netKeepPhrase() {
    const W = this.netWait; if (!W || W.start || this.state !== 'conversation' || this.mode !== 'live') return;
    const now = performance.now(), t0 = this._speechStartAt || now;
    if (this.voice.speaking || t0 < (this.playEndAt || 0) + 300 || !this._addressed(now)) return;
    W.phrase = this.audio.recent(Math.min(6000, now - t0 + 700)); W.phraseAt = Date.now();
    this.log(`Phrase gardée pendant la coupure (${(W.phrase.length / 16000).toFixed(1)} s)`);
  }
}
