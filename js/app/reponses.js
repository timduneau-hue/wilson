// Wilson — méthodes de la classe App (js/app.js) : verrou de vérité (chiffres, sources), réponses à dire plus tard, fins de phrase de trop, doublons.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { Maison } from '../maison.js';
import { PROPRIO as PROPRIO_NOM } from '../questions.js';
import * as VP from '../voiture.js';
import { appli, MESSAGE_CALME_MS, QUESTION_CALME_MS, $, RE_CHIFFRE_CRM, RE_OBJECTIF_DIT, nombre, nombresDans, lireChiffres, dureeTexte, cleanSpeech, memeDebut } from './commun.js';

export class ReponsesMethodes {

  _majMaison() {
    if (!this.maison.on || this.enVoiture) return;
    this.maison.rafraichir().then(() => {
      if (this._maisonKo) { this.log(`Maison : de nouveau joignable (injoignable depuis ${dureeTexte(Date.now() - this._maisonKo.depuis)})`); this._maisonKo = null; }
    }).catch((e) => {
      const K = this._maisonKo, now = Date.now();
      if (!K) { this._maisonKo = { depuis: now, dit: now, n: 1 }; this.log('Maison : inventaire impossible (' + e.message + ')'); return; }
      K.n++;
      if (now - K.dit >= 3600000) {
        K.dit = now;
        const P = this.claude.pc, pc = P && P.vivant && Date.now() - this.claude.pcAt < 30 * 60000;
        this.log(`Maison : toujours injoignable depuis ${dureeTexte(now - K.depuis)} (${K.n} essais ; ${pc ? 'l\'ordinateur de la maison répond, lui : la machine virtuelle de Home Assistant n\'est sans doute pas démarrée' : 'ordinateur de la maison éteint ?'}) — ${e.message}`, !!pc);
      }
    });
  }

  // ---------- Chiffres : pas de chiffre du CRM sans source (journal du 05/11/26) ----------
  // 09h35:52 : « il te manque 3 clients pour ton objectif de 10 » sans avoir rien demandé au CRM ; 11h06:01 et 11h06:15 :
  // « 120 clients actifs », « l'objectif c'est 135 », pendant que l'analyste cherchait encore. Chaque chiffre qui a une
  // source est noté 8 h (résultats d'outils, consignes de l'appli, ce que Timothée a dit) ; un chiffre du CRM dit par
  // Wilson sans aucune source est aussitôt corrigé par lui-même (« je me suis trompé… »).
  _noteChiffres(t) {
    const s = String(t || '');
    if (!s || /^\[ATTENTION : tu viens de dire/.test(s)) return;
    const l = nombresDans(s); if (!l.length) return;
    const now = Date.now(), V = this._chiffres || (this._chiffres = lireChiffres());
    for (const n of l) { const i = V.findIndex((x) => x.n === n); if (i >= 0) V.splice(i, 1); V.push({ n, t: now }); }
    const lim = now - 8 * 3600000; while (V.length && (V.length > 300 || V[0].t < lim)) V.shift();
    clearTimeout(this._chiffresT); this._chiffresT = setTimeout(() => { try { localStorage.setItem('wilson.chiffres', JSON.stringify(V)); } catch (_) {} }, 2000);
  }
  // Un chiffre a une source : le même, à peu près le même s'il arrondit (« environ 12 000 € »), ou un écart, une somme ou
  // un pourcentage de deux chiffres connus (« il t'en manque 31 » = 50 − 19).
  _chiffreVu(n, approx) {
    // Journal du 11/11/26, 11h08:22 : « il reste 82 % de batterie » (la tablette, d'après sa propre consigne) pris pour un
    // chiffre inventé, et Wilson a dû dire « je me suis trompé ». La batterie de l'appareil a une source : l'appareil.
    if (this.battery && Math.abs(Math.round(this.battery.level * 100) - n) <= 1) return true;
    const V = (this._chiffres || (this._chiffres = lireChiffres())).map((x) => x.n);
    if (V.some((v) => Math.abs(v - n) < 1e-6)) return true;
    if (approx && V.some((v) => v > 0 && Math.abs(v - n) / v <= 0.15)) return true;
    const r = V.filter((v) => v >= 6 && !(v >= 1990 && v <= 2100)).slice(-80);
    for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) {
      if (i === j) continue;
      const a = r[i], b = r[j];
      if (Math.abs(Math.abs(a - b) - n) < 1e-6 || Math.abs(a + b - n) < 1e-6 || Math.abs((a / b) * 100 - n) < 1) return true;
    }
    return false;
  }
  _verifierChiffres(texte) {
    if (!this.crm.on || this.mode !== 'live' || !this.brain.open) return;
    const t = String(texte || ''), faux = [];
    const juger = (brut, mult, avant, autour, extrait) => {
      let n = nombre(brut); if (!isFinite(n)) return;
      if (mult) n *= 1000;
      const important = /objectif|manque|actifs/i.test(avant + ' ' + autour), compte = /^\d+\s*(clients?|commandes?|devis|rendez-vous|visites?|tâches?)\b/i.test(autour);
      if (!important && n <= (compte ? 12 : 5)) return;                   // « 8 tâches », « 2 rendez-vous » : il compte ce que le CRM a listé
      const approx = mult || n >= 1000 || /(environ|à peu près|presque|près de|autour de|un peu (plus|moins) de|plus de|moins de)\s*$/i.test(avant);
      const e = extrait.replace(/\s+/g, ' ').trim();
      if (!this._chiffreVu(n, approx) && !faux.includes(e)) faux.push(e);
    };
    for (const m of t.matchAll(RE_CHIFFRE_CRM)) juger(m[1], !!m[2], t.slice(Math.max(0, m.index - 40), m.index), t.slice(m.index, m.index + m[0].length + 25), m[0]);
    for (const m of t.matchAll(RE_OBJECTIF_DIT)) { const fin = m.index + m[0].length; juger(m[2], false, t.slice(Math.max(0, m.index - 10), fin - m[2].length), 'objectif', t.slice(m.index, fin)); }
    if (!faux.length) return;
    const now = performance.now();
    if (now - (this._chiffreFauxAt || -1e9) < 20000) { this.log(`Chiffre sans source (déjà corrigé il y a moins de 20 s) : « ${faux.join(' », « ')} »`); return; }
    this._chiffreFauxAt = now;
    const enCours = this._analyses && this._analyses.size;
    this.log(`Chiffre sans source : « ${faux.join(' », « ')} » — ni le CRM ni Timothée ne l'ont donné : je lui fais corriger`, true);
    this.brain.sendText(`[ATTENTION : tu viens de dire « ${faux[0]} », mais ce chiffre ne vient d'aucun résultat du CRM ni de ce que Timothée a dit : tu l'as inventé. Dis-lui tout de suite, en une phrase, que tu t'es trompé et que tu n'as pas ce chiffre${enCours ? ' : la recherche est en cours, tu le lui diras dès que tu l\'as' : ' ; propose de le chercher dans le CRM'}. N'invente aucune explication.]`);
  }

  // ---------- Réponse attendue (C11 bis) : jamais perdue ----------
  // Journal du 05/11/26, 11h04:22 : la réponse de l'analyste est arrivée à la seconde où la discussion se fermait (silence) :
  // envoyée dans une session qui se fermait, jamais dite ; « Wilson » 7 s après → « Oui ? », puis « j'ai un trou de mémoire ».
  // Elle reste « à dire » jusqu'à ce que Wilson l'ait vraiment dite (15 min au plus) : la discussion ne se ferme pas pendant
  // qu'il la dit, elle passe en premier à la discussion suivante, et en voiture il se réveille pour la dire.
  _aDireTexte(P, demande = '') {
    // Claude demande une précision (« Question : … », règle de Timothée du 16/11/26) : Wilson la pose, sans rien affirmer.
    const q = /^\s*Question\s*:\s*/i.exec(String(P.dire || ''));
    if (q) return `[Pour la recherche « ${P.question} », Claude a besoin d'une précision avant de répondre. Pose-lui seulement cette question, sans rien ajouter : « ${String(P.dire).slice(q[0].length).trim()} ». Avec sa réponse, rappelle question_difficile avec la question complète précisée.]`;
    const deb = `[La recherche ${P.ou == null ? 'dans le CRM ' : P.ou}que tu avais lancée pour la question « ${P.question} » est terminée (${P.s} s). Résultat : ${P.dire}`;
    return demande ? `${deb} Timothée vient de te dire : « ${demande} ». Donne-lui d'abord ce résultat, en commençant par « J'ai la réponse à ta question sur … » (quelques mots du sujet), puis réponds à ce qu'il vient de dire si c'est autre chose.]`
      : `${deb} Dis-la-lui maintenant, en commençant par « J'ai la réponse à ta question sur … » (quelques mots du sujet).]`;
  }
  _aDireEnvoyer(demande = '') {
    const P = this._aDire;
    if (!P || this.mode !== 'live' || !this.brain.open || this.state !== 'conversation') return false;
    if (Date.now() - P.at > 15 * 60000) { this.log(`Réponse à « ${P.question.slice(0, 60)} » jamais dite en 15 min : abandonnée`); this._aDire = null; return false; }
    if ((P.n || 0) >= 3) {                                                  // 3 envois sans qu'il la dise : la voix du téléphone la lit
      this.log('Réponse attendue envoyée 3 fois sans être dite : je la lis avec la voix de l\'appareil'); this._aDire = null; this._sayAfter(/^\s*Question\s*:/i.test(P.dire) ? String(P.dire).replace(/^\s*Question\s*:\s*/i, '') : `J'ai la réponse à ta question. ${P.dire}`); return true;
    }
    P.conv = this.convId; P.envoyeAt = performance.now(); P.n = (P.n || 0) + 1; P.relance = false;
    this._permettre(30000, 'réponse tardive'); this._resumedAt = performance.now(); this.lastActivity = performance.now();
    this.brain.sendText(this._aDireTexte(P, demande));
    const conv = this.convId;
    setTimeout(() => {                                                      // pas dite au bout de 8 s : une relance
      // Journal du 05/11/26, 19h22:56-19h23:16 : il la disait déjà (14 s de voix reçues, avec un trou) ; la relance envoyée
      // pendant un trou de la voix a coupé sa réponse, qu'il a reprise au milieu → « la liste des tâches était un cafouillis
      // complet ». Pas de relance tant qu'il parle ou qu'il a parlé depuis l'envoi : il est en train de la dire.
      if (this._aDire !== P || P.conv !== conv || conv !== this.convId || this.audio.playing || !this.brain.open || P.relance) return;
      if (this._liveTurn || (this._voixDepuis || 0) > P.envoyeAt) { this.log('Réponse attendue en train d\'être dite : pas de relance'); return; }
      P.relance = true; this.log('Réponse attendue pas encore dite : relance'); this._resumedAt = performance.now();
      this.brain.sendText(`[Donne-lui maintenant à voix haute la réponse à sa question « ${P.question} » : ${P.dire}]`);
    }, 8000);
    return true;
  }
  // Journal du 19/11/26, 16h08:41 (téléphone, en voiture) : deux réponses arrivées ensemble ; Google a coupé la première
  // après 1,2 s, sur « J'ai la réponse à ta question ». Cette seule annonce la marquait « dite » : la vraie réponse (les
  // chiffres du client) a été prise pour un doublon de l'annonce, et Timothée ne l'a jamais entendue. Une réponse coupée
  // par Google ne compte que si elle contient déjà le résultat (ses mots), pas pour sa seule annonce.
  _aDireDit(wilson, coupee = false) {
    const P = this._aDire; if (!P || P.conv !== this.convId) return;
    const n = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const w = n(wilson), mots = [...new Set(n(P.dire).split(/[^a-z0-9]+/).filter((m) => m.length >= 5 || /^\d+$/.test(m)))];
    const communs = mots.filter((m) => w.includes(m)).length;
    if ((!coupee && /j'ai la reponse|reponse a ta question/.test(w)) || (mots.length && communs >= Math.min(3, mots.length))) { this._aDire = null; this.log('Réponse attendue dite'); }
    else if (coupee) this.log('Réponse attendue coupée par Google avant le résultat : pas encore dite');
  }
  // De retour au premier plan (après le GPS, l'écran éteint) avec une réponse qui attend : en voiture, il la dit.
  _aDireAuRetour() {
    const P = this._aDire;
    if (!P || P.conv != null || !this.enVoiture) return;
    setTimeout(() => { if (this._aDire === P && P.conv == null && this.state === 'veille' && !this.phone && !document.hidden) { this.log('De retour au premier plan, une réponse du CRM attend : je la dis'); this.startConversation('reponse_tardive'); } }, 1500);
  }
  // Demande de Timothée du 18/11/26 (« c'est Wilson qui doit s'adapter à moi ») ; journal du 18/11/26, 09h31-11h49 (téléphone,
  // en voiture) : deux heures de discussions, et la question de Claude en attente jamais posée — la consigne seule (« à un
  // moment naturel ») ne suffisait pas, Gemini ne la posait jamais. C'est maintenant l'appli qui choisit le moment : Wilson a
  // répondu à sa dernière phrase sans attendre de réponse (pas de « ? » à la fin), aucun outil, recherche ni relecture du CRM
  // en attente, 5 s de calme, c'est bien Timothée et il le regarde (ou il est en voiture) → elle lui dicte la question,
  // une fois par discussion. Coupée, ou restée sans réponse : reposée comme avant (questions.js).
  _questionAuCalme(now, occupe) {
    const Q = this.questions, E = Q && Q.enCours, R = this._derniereReponse;
    if (!E || E.posee || E.conv !== this.convId || this._qCalme === this.convId) return;
    if (this.state !== 'conversation' || this.mode !== 'live' || !this.brain.open || this.paused || this.netWait || this.phone) return;
    if (occupe || this._apresOutil || this._liveTurn || this.audio.playing || this.voice.speaking || this._aDireEnCours(now)) return;
    if (this.crm && this.crm.pending) return;                                    // il doit d'abord répondre à la relecture
    if (!R || !this._heardAt || this._heardAt < (this._convAt || 0) || R.at < this._heardAt || this._parleDepuis) return;
    if (/\?\s*[»"]?\s*$/.test(R.texte)) return;                                 // Wilson attend sa réponse (« Oui ? », « Lequel ? »)
    const calme = now - Math.max(this.playEndAt || 0, R.at, this._heardAt);
    if (calme < QUESTION_CALME_MS) return;
    if ((this.audio.speaking || now - (this.audio.lastVoicedAt || 0) < 1500) && calme < 2 * QUESTION_CALME_MS) return;   // il parle (ou la route)
    if (this.famille._parle() !== PROPRIO_NOM) return;                           // à Timothée seulement
    if (!this._voitureBt && !this._gazing(now)) return;                          // R1 : à la maison, seulement s'il le regarde
    this._qCalme = this.convId;
    this.log(`Question de Claude [${E.id}] : sa demande est réglée, ${QUESTION_CALME_MS / 1000} s de calme : je la lui pose`);
    this._vvDicte(`[Dis-lui exactement, sans rien ajouter avant : « Au fait, Claude m'a demandé de te poser une question pour ma prochaine mise à jour : ${E.question} » Puis tais-toi et écoute sa réponse.]`);
  }
  // Journal du 18/11/26, 21h45:06 et 21h50:33 : Timothée reconnu regardait Wilson dans une discussion ouverte au regard, sans
  // rien lui demander ; le message qui l'attendait n'était promis que pour la première réponse de Wilson, jamais venue, et il
  // ne l'a pas eu. Tablette, direct : il est reconnu sûr, il le regarde (R1), rien n'est en cours (outil, réponse, voix), 3 s
  // de calme (5 s si sa dernière phrase est restée sans réponse, ou si Wilson attend une réponse) → l'appli le lui fait dire,
  // une fois par discussion. Pas dit (discussion finie avant) : « je réessaierai », comme avant.
  _messageAuCalme(now, occupe) {
    const F = this.famille, R = this._derniereReponse;
    if (!F || F.telephone || F.remise || this._mCalme === this.convId || !this.qui) return;
    if (this.state !== 'conversation' || this.mode !== 'live' || !this.brain.open || this.paused || this.netWait || this.phone) return;
    if (occupe || this._apresOutil || this._liveTurn || this.audio.playing || this.voice.speaking || this._aDireEnCours(now)) return;
    if (this.crm && this.crm.pending) return;
    if (this._vv && this._vv.n === this._turnN && this._vv.hold) return;                 // une réponse est retenue (verrou)
    if (this.audio.speaking || now - (this.audio.lastVoicedAt || 0) < 1500) return;      // quelqu'un parle
    const sansReponse = (this._heardAt || 0) > (this._convAt0 || 0) && (!R || R.at < this._heardAt);
    const attend = R && R.at >= (this._convAt0 || 0) && /\?\s*[»"]?\s*$/.test(R.texte);
    const calme = now - Math.max(this.playEndAt || 0, R ? R.at : 0, this._heardAt || 0, this._convAt0 || 0);
    if (calme < (sansReponse || attend ? QUESTION_CALME_MS : MESSAGE_CALME_MS)) return;
    const P = this.qui.qui(now);
    if (!P || !P.sur || !P.facing || now - P.at > 5000 || !(this.vision && this.vision.looking)) return;   // R1 : reconnu sûr, il le regarde (comme M3)
    if (!F.enAttente(P.nom).length) return;
    this._mCalme = this.convId;
    const texte = F.remettreEnDiscussion(P.nom, now);
    if (!texte) return;
    this._permettre(30000, 'message');
    this._vvDicte(texte);
  }
  _aDireEnCours(now = performance.now()) { const P = this._aDire; return !!(P && P.conv === this.convId && now - (P.envoyeAt || 0) < 25000); }
  // Pour la consigne de chaque discussion : la précédente vient de finir, une recherche tourne encore, une réponse attend.
  _contexteSuite() {
    const l = [], now = Date.now(), L = this.memory.log, der = L[L.length - 1];
    if (der && der.ts && now - der.ts < 10 * 60000) l.push(`Votre dernière discussion date d'il y a ${dureeTexte(now - der.ts)} (voir les derniers échanges) : si on te parle de « ma question », « tu te rappelles ? », « alors ? », « j'attends la réponse », c'est la suite de ces échanges.`);
    for (const A of (this._analyses || new Map()).values()) l.push(`Recherche dans le CRM en cours depuis ${dureeTexte(performance.now() - A.t0)} : « ${A.question} ». Tu n'as PAS encore le résultat : si on te le demande, dis que tu cherches encore et que tu le diras dès que tu l'as, sans donner aucun chiffre.`);
    if (this._aDire) l.push(`La réponse du CRM à la question « ${this._aDire.question} » est arrivée : elle va t'être donnée en message.`);
    const ec = this._ecranDit(); if (ec) l.push(ec);                         // remarque du 05/11/26, 14h41
    return l.join('\n');
  }
  _suiteRecente() {
    const L = this.memory.log, der = L[L.length - 1], dt = der && der.ts ? Date.now() - der.ts : Infinity;
    return dt < 5 * 60000 ? ` C'est la suite de votre discussion d'il y a ${dureeTexte(dt)}.` : '';
  }

  // Journal du 04/11/26, 11h48:37 : verrou refusé (« rien à enregistrer »), et Wilson dit « J'enregistre la tâche maintenant.
  // C'est bon » : rien n'était écrit. Toute phrase qui dit « enregistré » sans écriture confirmée par le CRM est corrigée.
  _enregistreFaux(t) {
    if (!this.crm.on || !this.brain.open || this.mode !== 'live') return;
    // (journal du 05/11/26, 15h58:24 : « C'est noté, j'ai ajouté la visite de Sylvain Motel » — rien n'avait été préparé)
    if (!/\b(c'est|ça y est|voilà|j'ai)\b[^.!?]{0,30}(enregistr|dans (tes|mes) tâches|dans le crm)|\bj'ai (bien )?(ajouté|indiqué|noté|mis|marqué) (la|ta|sa|une|le|ton|son) (visite|passage|compte[- ]rendu|rendez-vous|tâche|rdv)/i.test(t)) return;
    if (/\b(pas|jamais|rien)\b[^.!?]{0,20}enregistr|\?\s*$/i.test(t)) return;
    const D = this.crm.dernierEnregistre;
    if ((D && Date.now() - D.at < 90000) || (this.crm.queue && this.crm.queue.length)) return;
    const p = this.crm.pending;
    this.log(`Wilson a dit « enregistré » alors que le CRM n'a rien enregistré${p ? ` (préparé, pas confirmé : « ${p.relu.slice(0, 80)} »)` : ' (rien de préparé)'} : je le corrige`);
    this.brain.sendText(`[ATTENTION : rien n'est enregistré dans le CRM, le CRM ne l'a pas confirmé. Dis-le-lui tout de suite en une phrase, sans t'excuser longuement, puis ${p ? `relis-lui la phrase préparée (« ${p.relu} ») et demande « Je l'enregistre ? »` : 'prépare-le avec crm_noter et relis-le-lui'}.]`);
  }

  // ---------- Verrou de vérité (protocole voiture, PLAN 2 quinquies, V1-V7) ----------
  // Journal du 05/11/26, 15h53-15h58 : « Je regarde dans le CRM… » sans aucun outil, puis des contacts, une ville et un
  // enregistrement inventés. En voiture, pour une demande de travail, rien de ce que dit Gemini n'est joué tant qu'un outil
  // n'a pas rendu son résultat dans ce tour : ce qui précède est retenu (un bip dit qu'il cherche). Tour fini sans outil :
  // la réponse n'est jamais dite (sauf si elle n'affirme rien : « Pour quel client ? »), et il doit appeler l'outil ;
  // deuxième fois sans outil : l'appli pose elle-même la question à l'analyste du CRM.
  _vvTour() {
    if (!this._vv || this._vv.n !== this._turnN) {
      const H = this._vvHerite && this._vvHerite.n === this._turnN ? this._vvHerite : null;
      this._vv = { n: this._turnN, travail: !!H, hold: !!H, held: [], outil: false, user: H ? H.user : '', textOutil: 0, correction: null, pourquoi: H ? 'suite d\'une demande de travail' : '' };
    }
    return this._vv;
  }
  _noteSource(txt) {
    const a = this._sources || (this._sources = []);
    a.push({ t: Date.now(), txt: String(txt || '').slice(0, 6000) }); while (a.length > 60) a.shift();
    this._motsV = (this._motsV || 0) + 1;
  }
  // Les mots qui ont une source : résultats d'outils et du CRM (1 h), fiches gardées, ce que Timothée a dit, la mémoire.
  _sourcesMots() {
    const C = this.crm, cle = `${this._motsV || 0}:${C.cache.size}:${C.last ? C.last.cle + C.last.at : ''}`;
    if (!this._motsBase || this._motsBase.cle !== cle) {
      const now = Date.now(), S = (this._sources || []).filter((x) => now - x.t < 3600000).map((x) => x.txt);
      const fiches = [...C.cache.values()].map((e) => [e.societe, e.contact, e.ville, e.adresse, e.texte, ...(e.contacts || []).map((c) => c.nom || '')].join(' '));
      this._motsBase = { cle, mots: VP.motsDe([...S, ...fiches, this.memoire.pourConsigne() || ''].join(' \n ')) };
    }
    const mots = new Set(this._motsBase.mots);
    for (const w of VP.motsDe((this._heard || []).map((h) => h.text).join(' ') + ' ' + String(this.brain.inText || ''))) mots.add(w);
    return mots;
  }
  _vvRetenir(vv, pourquoi) {
    if (vv.hold) return;
    vv.hold = true; vv.pourquoi = pourquoi;
    this.log(`Verrou de vérité : ${pourquoi} — rien ne sera dit avant le résultat d'un outil`);
  }
  // Un outil a rendu son résultat (ou l'appli a donné un résultat / dicté la phrase) : ce qui suit peut être dit.
  _vvFonde(pourquoi) {
    if (!this._protocole) return;
    const vv = this._vvTour(); if (vv.outil) return;
    vv.outil = true; vv.textOutil = String(this.brain.outText || '').length;
    if (vv.held.length) this.log(`Verrou de vérité : avant ${pourquoi}, pas dit : « ${String(this.brain.outText || '').slice(0, 120)} »`);
    vv.held = [];
  }
  _vvFin(vv, user, wilson) {
    if (vv.correction) {
      const c = vv.correction; vv.correction = null;
      this._vvFonde('une correction');
      this.brain.sendText(`[ATTENTION : tu viens de citer « ${c.join(' », « ')} », qui n'est dans aucune réponse du CRM ni dans ce que Timothée a dit : tu l'as inventé, et ta phrase a été coupée. Dis-lui tout de suite « Pardon, je me suis trompé », puis redis seulement ce que dit le résultat du CRM.]`);
      return null;
    }
    // Demande de travail restée sans réponse ni outil (relance, fin forcée…) : le tour suivant reste verrouillé.
    if (vv.travail && !vv.outil && !wilson) this._vvHerite = { n: this._turnN, user: vv.user };
    if (!vv.hold || vv.outil || (!vv.held.length && !wilson)) return null;
    const mots = this._sourcesMots();
    // Journal du 20/11/26, 12h00:02 : « J'ai préparé la tâche suivante : « … ». Je l'enregistre ? » laissé passer (« réponse qui
    // n'affirme rien ») alors que crm_noter n'avait pas été appelé : ses deux « oui » n'ont rien enregistré. Une écriture
    // présentée comme prête, sans rien de préparé dans le CRM, n'est jamais dite : crm_noter est exigé.
    const brouillonFaux = this.crm.on && !this.crm.pending && VP.annonceBrouillon(wilson);
    if (brouillonFaux) this.log(`Verrou de vérité : écriture présentée comme prête (« ${wilson.slice(0, 80)} ») sans crm_noter : rien n'est préparé dans le CRM`, true);
    if (!brouillonFaux && !VP.sansFait(wilson, mots) && VP.repriseFondee(wilson, mots, (this._sources || []).filter((x) => Date.now() - x.t < 3600000).map((x) => x.txt))) {
      for (const [a, r] of vv.held) this.audio.play(a, r);
      if (vv.held.length) { this.lastActivity = performance.now(); this.log(`Verrou de vérité : reprise d'un résultat déjà reçu, dite (« ${wilson.slice(0, 100)} »)`, true); }
      vv.held = [];
      return null;
    }
    // Journal du 26/11/26, 09h17:38 : la tâche venait d'être enregistrée (« Oui » touché à l'écran) ; à « elle est enregistrée ? »,
    // « Oui, la tâche a bien été enregistrée… » a été retenu (« sans outil ») et crm_noter exigé : la même tâche repréparée.
    // Confirmer une écriture que le CRM vient vraiment de faire (5 min) est dit, sans chiffre ni nom venus d'ailleurs.
    const DE = this.crm.on && this.crm.dernierEnregistre;
    if (!brouillonFaux && DE && Date.now() - DE.at < 5 * 60000 && VP.confirmeEcriture(wilson)) {
      const motsDE = new Set([...mots, ...VP.motsDe(DE.relu)]), N = new Set(VP.nombresDe(DE.relu));
      if (VP.nombresDe(wilson).every((n) => N.has(n)) && !VP.nomsInventes(wilson, motsDE).length) {
        for (const [a, r] of vv.held) this.audio.play(a, r);
        if (vv.held.length) { this.lastActivity = performance.now(); this.log(`Verrou de vérité : il confirme l'écriture faite il y a ${Math.round((Date.now() - DE.at) / 1000)} s, dite (« ${wilson.slice(0, 100)} »)`, true); }
        vv.held = [];
        return null;
      }
    }
    // Journal du 19/11/26, 16h13:00 : il refusait qu'on écrive (« pas besoin de me rajouter une tâche ») ; « Pardon, je
    // n'ajoute rien » a été retenu, puis crm_noter exigé : un compte rendu en trop. Un « d'accord, je n'ajoute rien » est dit.
    if (!brouillonFaux && VP.refusEcriture(vv.user || user) && !VP.annonceEcritureFaite(wilson) && !VP.annonceGuidage(wilson) && !VP.annonceRecherche(wilson)) {
      for (const [a, r] of vv.held) this.audio.play(a, r);
      if (vv.held.length) { this.lastActivity = performance.now(); this.log(`Verrou de vérité : il ne veut rien faire écrire, réponse dite (« ${wilson.slice(0, 100)} »)`, true); }
      vv.held = [];
      return null;
    }
    if (!brouillonFaux && VP.sansFait(wilson, mots)) {
      const recu = vv.held.reduce((s, [a, r]) => s + a.length / (r || 24000), 0);
      for (const [a, r] of vv.held) this.audio.play(a, r);
      if (vv.held.length) { this.lastActivity = performance.now(); this.log(`Verrou de vérité : réponse qui n'affirme rien, dite (« ${wilson.slice(0, 80)} »)`); this._couperFinDeTrop(wilson, this._turnN - 1, recu); }
      vv.held = [];
      return null;
    }
    vv.held = [];
    this.log(`Verrou de vérité : réponse sans outil retenue, JAMAIS DITE — « ${wilson.slice(0, 160)} »`, true);
    this._vvHerite = { n: this._turnN, user: vv.user || user };
    this._vvForcer(vv.user || user, wilson);
    return 'jete';
  }
  _vvForcer(user, dit) {
    const now = performance.now(), k = VP.plat(user).slice(0, 80);
    const S = this._sansOutil && this._sansOutil.k === k && now - this._sansOutil.at < 120000 ? this._sansOutil : (this._sansOutil = { k, n: 0 });
    S.n++; S.at = now;
    const u = VP.plat(user);
    if (VP.refusEcriture(user)) {                          // il refuse qu'on écrive : aucun outil exigé (journal du 19/11/26, 16h13)
      this.log('Verrou de vérité : il ne veut rien faire écrire — aucun outil exigé', true);
      this._vvDicte('[Il ne veut rien faire écrire dans le CRM : n\'appelle aucun outil. Dis-lui seulement : « D\'accord, je n\'ajoute rien. »]');
      return;
    }
    // Journal du 20/11/26, 12h00:59 : « Je viens de te le dire. » (il parlait de la tâche que Wilson n'arrivait pas à
    // enregistrer) envoyé à l'analyste comme une question. Quand Wilson parlait d'écrire, c'est une écriture : crm_noter.
    const ecrit = VP.estEcriture(user) || VP.parleEcriture(dit);
    const quoi = VP.estItineraire(user) || VP.annonceGuidage(dit) ? 'itineraire avec le nom du client (rien n\'est lancé tant que l\'outil ne l\'a pas fait)'
      : ecrit ? 'crm_noter avec ce qu\'il t\'a dicté (rien n\'est préparé dans le CRM tant que crm_noter ne l\'a pas fait ; une visite : type compte_rendu, échange visite, texte « Visite » et les personnes vues), puis relis-lui la phrase préparée'
      : VP.questionContacts(user) ? 'crm_contacts avec le nom du client'
      : /contact|telephone|numero|adresse|fiche|derniere visite|qui (est|sont)/.test(u) ? 'crm_client avec le nom du client'
      : 'crm_question avec sa question complète';
    if (S.n === 1) {
      this.brain.sendText(`[Ta réponse (« ${String(dit || '').slice(0, 100)} ») n'a PAS été dite : tu n'as consulté aucun outil, elle n'était pas vérifiée. Timothée a dit : « ${String(user || '').slice(0, 220)} ». Appelle maintenant ${quoi}, sans rien dire avant. Sans résultat d'outil, tu ne sais rien. Si tu n'as pas compris sa demande, demande-lui simplement de la redire.]`);
      return;
    }
    if (ecrit || VP.estItineraire(user) || VP.annonceGuidage(dit) || !this.crm.on || !user) {
      this.log('Verrou de vérité : toujours aucun outil — je lui fais redemander');
      this._vvDicte('[Dis-lui seulement : « Je n\'ai pas réussi. Redis-moi le nom du client et ce que tu veux, s\'il te plaît. »]');
      return;
    }
    this.log('Verrou de vérité : deux fois sans outil — je pose moi-même sa question à l\'analyste du CRM', true);
    this._vvDicte('[Dis-lui seulement : « Je cherche dans le CRM, je te dis dès que j\'ai. » Rien d\'autre.]');
    this._analyseDirecte(user);
  }
  // Phrase dictée par l'appli : elle peut être dite telle quelle.
  _vvDicte(texte) { this._vvHerite = null; this._vvTour(); this._vvFonde('une phrase dictée'); this.brain.sendText(texte); }
  // L'appli pose elle-même la question à l'analyste du CRM ; la réponse arrive comme une réponse tardive (C11 bis).
  async _analyseDirecte(question) {
    const A = { id: 'auto-' + Date.now(), question: String(question || '').trim(), t0: performance.now(), conv: this.convId, gen: this._liveGen || 0, ctl: new AbortController(), cancelled: true, fond: true };
    this._analyses = this._analyses || new Map(); this._analyses.set(A.id, A);
    this.log(`Question au CRM (analyste, posée par l'appli) : « ${A.question.slice(0, 160)} »`, true);
    let res;
    try { res = await this._crmRun('crm_question', { question: A.question }, A.ctl.signal); }
    catch (e) { res = { echec: true, info: 'La recherche n\'a pas abouti.', dire: 'Je n\'ai pas réussi à trouver la réponse dans le CRM.' }; }
    finally { this._analyses.delete(A.id); }
    this._lateAnswer(A, res, Math.round((performance.now() - A.t0) / 1000));
  }
  // Pendant qu'il parle (après un outil, dans une demande de travail) : un nom qui ne vient de nulle part → coupé tout de suite.
  _vvNoms(vv, t) {
    if (vv.correction || !vv.outil || !(vv.travail || this._travailRecent())) return;
    const inv = VP.nomsInventes(String(t || '').slice(vv.textOutil), this._sourcesMots());
    if (!inv.length) return;
    vv.correction = inv;
    this.audio.flush(); this.discard = true; this.face.setTalk(0);
    this.log(`Verrou de vérité : « ${inv.join(' », « ')} » dit sans source (ni le CRM ni Timothée) : phrase coupée, je lui fais corriger`, true);
  }
  // Une simple réaction (« Voilà. », « Bah, c'est pas trop tôt. ») — sauf si c'est le nom d'un client ou d'un contact de l'annuaire.
  _reaction(t) {
    if (!VP.estReaction(t)) return false;
    const A = this.crm.annuaire;
    return !(A.pret && A.chercher(t, 1).some((x) => x.score >= 0.8));
  }
  // « Autre chose ? », « Tu as besoin d'autre chose ? » à la fin d'une réponse : interdit par Timothée (05/11, 06/11), revenu
  // le 12/11 malgré la consigne. La fin de la réponse est coupée avant d'être jouée (le reste est dit normalement).
  // Journal du 16/11/26 (téléphone, 09h58:58 et 09h59:43) : le texte de la question arrivait AVANT son son ; l'ancienne coupe
  // (« les 3 dernières secondes reçues ») effaçait donc la fin de la VRAIE phrase, puis jetait la question en arrivant.
  // Timothée : « tu finis pas tes phrases, ça coupe » (10h00:09), « en quoi j'ai pas fini ta phrase là ? » (09h59:13).
  // Désormais : la question occupe la même part du son que du texte (« De rien. » = 25 % du texte → 25 % du son) ;
  // le son qui arrive ensuite est mis de côté et joué jusqu'à ce point seulement (jamais au-delà de ce qui est sûr),
  // la coupe tombant si possible dans le silence entre les deux phrases.
  _couperFinDeTrop(t, tour = this._turnN, dejaRecu = null) {
    if (this._tropTour === tour) return;
    const txt = cleanSpeech(t), trop = VP.finDeTrop(txt);
    if (!trop) return;
    this._tropTour = tour;
    const L = Math.max(1, txt.length), frac = Math.max(0, Math.min(1, (txt.lastIndexOf(trop) >= 0 ? txt.lastIndexOf(trop) : L - trop.length) / L));
    if (dejaRecu != null) {                                // tout le son est déjà dans la file (réponse relâchée par le verrou de vérité)
      const ote = this.audio.couperFin(Math.max(0, dejaRecu * (1 - frac) - 0.1));
      this.log(`Question de trop à la fin de sa réponse (« ${trop} ») : ${ote ? `coupée avant d'être dite (${ote.toFixed(1)} s)` : 'trop tard pour la couper'}`, true);
      return;
    }
    const sec0 = this._liveTurn ? this._liveTurn.sec : 0;
    this._trop = { tour, frac, trop, held: [], heldSec: 0, joue: sec0, recu: sec0, fini: false, timer: 0 };
    clearInterval(this._tropIv);
    this._tropIv = setInterval(() => this._tropAvance(), 100);   // relâche ce qui est sûr, pour ne jamais laisser la voix en panne
    this._tropAvance();
  }
  // Son reçu après la question repérée : mis de côté (relâché par _tropAvance / _tropFin).
  _tropGarder(i16, rate) {
    const T = this._trop; if (!T || T.fini) return;
    const d = i16.length / (rate || 24000);
    T.held.push([i16, rate || 24000]); T.heldSec += d; T.recu += d; this.lastActivity = performance.now();
    clearTimeout(T.timer); T.timer = setTimeout(() => this._tropFin('plus de son'), 700);
  }
  // Joue le son mis de côté jusqu'à `jusqua` (secondes depuis le début de la réponse), en coupant le dernier morceau au besoin.
  _tropJouer(jusqua) {
    const T = this._trop;
    while (T.held.length && T.joue < jusqua - 0.005) {
      const [a, r] = T.held[0], d = a.length / r;
      if (T.joue + d <= jusqua) { this.audio.play(a, r); T.held.shift(); T.heldSec -= d; T.joue += d; if (this._liveTurn) this._liveTurn.sec += d; continue; }
      const n = Math.max(0, Math.floor((jusqua - T.joue) * r));
      if (n > 0) { this.audio.play(a.subarray(0, n), r); T.held[0] = [a.subarray(n), r]; T.heldSec -= n / r; T.joue += n / r; if (this._liveTurn) this._liveTurn.sec += n / r; }
      break;
    }
  }
  _tropAvance() {
    const T = this._trop;
    if (!T || T.fini) { clearInterval(this._tropIv); return; }
    if (this.discard || this.state !== 'conversation' || this._turnN !== T.tour) { this._tropFin('tour fini'); return; }
    // Ce qui est reçu n'est qu'une partie de la réponse : frac × reçu est toujours AVANT le début réel de la question.
    const ctx = this.audio.ctx, reste = ctx ? (this.audio.nextTime || 0) - ctx.currentTime : 0;
    if (reste < 0.35) this._tropJouer(T.frac * T.recu);
  }
  // Fin de la réponse (tour fini ou plus de son) : la longueur totale est connue, la coupe est placée.
  _tropFin(pourquoi) {
    const T = this._trop;
    if (!T || T.fini) return;
    T.fini = true; clearTimeout(T.timer); clearInterval(this._tropIv);
    if (this.discard || this.state !== 'conversation') { T.held = []; return; }
    let coupe = T.frac * T.recu + 0.1;                     // un peu de marge : mieux vaut finir la phrase
    // Le son de la réponse encore à jouer, en temps « depuis le début de la réponse » : en file, puis mis de côté.
    const segs = [], fin = this.audio.nextTime || 0;
    for (const q of this.audio.enFile ? this.audio.enFile() : []) segs.push({ t0: T.joue - (fin - q.debut), f: q.f, r: q.r });
    let t0 = T.joue; for (const [a, r] of T.held) { segs.push({ t0, f: a, r, i16: true }); t0 += a.length / r; }
    const silence = this._tropSilence(segs, coupe);
    if (silence != null) coupe = silence;
    // Remarque de Timothée du 25/11/26, 17h16 (« la dernière phrase a été coupée ») : le texte de la question arrive parfois
    // quand sa voix est déjà en train de la dire ; la couper là, c'était couper en plein mot. Déjà commencée : elle finit.
    const ctx = this.audio.ctx, enFileSec = ctx ? Math.max(0, (this.audio.nextTime || 0) - ctx.currentTime) : 0;
    if (coupe < T.joue - enFileSec - 0.02) {
      this._tropJouer(Infinity); T.held = []; T.heldSec = 0;
      this.log(`Question de trop à la fin de sa réponse (« ${T.trop} ») : trop tard pour la couper (déjà commencée : dite en entier, jamais coupée en plein mot)`, true);
      return;
    }
    let ote = 0;
    if (coupe < T.joue) ote = this.audio.couperFin(T.joue - coupe);   // le son était en avance sur le texte : fin déjà en file
    this._tropJouer(coupe);
    const jete = T.heldSec; T.held = []; T.heldSec = 0;
    this.log(`Question de trop à la fin de sa réponse (« ${T.trop} ») : ${ote + jete > 0.2 ? `coupée avant d'être dite (${(ote + jete).toFixed(1)} s), phrase d'avant dite en entier` : 'trop tard pour la couper'}`, true);
  }
  // Le silence le plus net (pause entre deux phrases) à moins de 0,5 s de la coupe estimée, dans le son mis de côté.
  _tropSilence(segs, cible) {
    if (!segs.length) return null;
    const r = segs[0].r, debut = segs[0].t0, n = segs.reduce((x, g) => x + g.f.length, 0);
    if (n < r * 0.3 || segs.some((g) => g.r !== r)) return null;
    const tout = new Float32Array(n); let p = 0;
    for (const g of segs) { if (g.i16) for (let i = 0; i < g.f.length; i++) tout[p + i] = g.f[i] / 32768; else tout.set(g.f, p); p += g.f.length; }
    const win = Math.round(r * 0.06), pas = Math.round(r * 0.02), nrj = [];
    for (let i = 0; i + win <= n; i += pas) { let x = 0; for (let j = i; j < i + win; j += 4) x += tout[j] * tout[j]; nrj.push([i, x]); }
    if (nrj.length < 5) return null;
    const tri = nrj.map((x) => x[1]).sort((x, y) => x - y), med = tri[tri.length >> 1];
    if (!(med > 1e-6)) return null;                      // surtout du silence : rien à départager
    let best = null;
    for (const [i, s] of nrj) {
      const t = debut + (i + win / 2) / r;
      if (t < cible - 0.3 || t > cible + 0.5 || s > med * 0.15) continue;   // plutôt après : ne pas manger la fin de la phrase
      if (!best || s < best.s || (s === best.s && Math.abs(t - cible) < Math.abs(best.t - cible))) best = { t, s };
    }
    return best ? best.t : null;
  }
  // Journal du 25/11/26, 20h39:50 (tablette) : « Allume la grande lumière. » → « C'est allumé. Au fait… » (sa réponse de 17h12
  // recopiée) sans aucun appel à maison_commande : rien n'était allumé. Une action de la maison dite faite sans aucun outil
  // depuis 15 s : il doit la faire pour de bon, tout de suite (une fois par demande).
  _maisonSansOutil(user, wilson) {
    if (!this.maison || !this.maison.on || !VP.demandeMaison(user) || !VP.annonceMaisonFaite(wilson)) return false;
    const now = performance.now();
    if (now - (this._toolAt || 0) < 15000 || now - (this._maisonForceAt || 0) < 30000) return false;
    this._maisonForceAt = now;
    this.log(`Maison : « ${wilson.slice(0, 60)} » dit sans avoir rien commandé (aucun outil) — je lui fais faire pour de bon`, true);
    this.brain.sendText(`[ATTENTION : tu viens de dire que c'était fait, mais tu n'as appelé AUCUN outil : RIEN n'a été fait dans la maison. Appelle maintenant maison_commande pour sa demande (« ${String(user).slice(0, 160)} »), sans rien dire avant, puis dis seulement le résultat en quelques mots.]`);
    return true;
  }
  _travailRecent() { return !!this._travailAt && this._travailConv === this.convId && performance.now() - this._travailAt < 120000; }   // même discussion, 2 min

  // Journal du 05/11/26, 14h36:27-14h36:32 : Wilson demande « Crézé à Saint-Jacques-de-la-Lande ou Violin ? », il « entend »
  // « Saint-Jacques-de-la-Lande » et affiche l'itinéraire vers Crézé ; Timothée : « Ah mais non, c'est pas ça ». Écho de sa
  // propre voix par les haut-parleurs de la voiture, ou vraie réponse ? Impossible à dire : on le note pour la prochaine fois.
  _echoPossible(entendu) {
    const D = (this._ditWilson || [])[this._ditWilson ? this._ditWilson.length - 1 : 0];
    if (!D || !entendu) return false;
    const n = (x) => ' ' + String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const u = n(entendu), w = n(D.text);
    return u.trim().split(' ').length >= 2 && w.includes(u) && performance.now() - Math.max(D.t, this.playEndAt || 0) < 8000;
  }
  // Réponse en double : même début que sa réponse précédente (moins de 45 s), sans que personne ait parlé entre les deux.
  // Une réponse précédente coupée par Google n'était pas finie : la reprendre n'est pas un doublon (19/11/26, 16h08:46).
  _estDoublon(t) {
    const D = this._derniereReponse;
    if (!D || D.coupee || this._parleDepuis || String(this.brain.inText || '').trim() || performance.now() - D.at > 45000) return false;
    if (!memeDebut(cleanSpeech(t), D.texte)) return false;
    this.log(`Réponse en double évitée : il redisait « ${D.texte.slice(0, 80)} »`);
    return true;
  }
}
