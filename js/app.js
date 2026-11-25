// Wilson — chef d'orchestre. Une seule machine à états (voir PLAN.md) pilote tous les modules.
//   dodo ⇄ veille → (on le regarde en lui parlant) → conversation → veille
// Écoute au REGARD : une phrase n'est pour Wilson que si on le regarde en la disant (plus de mot-clé).

import { Face } from './face.js';
import { AudioIO } from './audio.js';
import { Brain } from './brain.js';
import { Vision } from './vision.js';
import { Memory } from './memory.js';
import { Sensors } from './sensors.js';
import { loadSettings, saveSettings, SettingsUI, DEFAULTS } from './settings.js';
import { SettingsSync, LOCAL_ONLY, takeSettingsFromHash, importerLienChiffre, mergeInto, shareable } from './sync.js';
import { Voice } from './voice.js';
import { EcoBrain, ecoFormat, sentenceCut, sayable, warmUp } from './eco.js';
import { RemoteLog, deviceName } from './remote.js';
import { Oreille, nomDit } from './oreille.js';
import { Crm, CRM_TOOLS, CRM_TOOL_NAMES, pourGemini, netErr, parseJour } from './crm.js';
import { Maison, MAISON_TOOLS, MAISON_TOOL_NAMES } from './maison.js';
import { Outils, OUTILS, OUTILS_NAMES } from './outils.js';
import { ANALYSE_MAX_MS, reglesCRM } from './analyste.js';
import { ClaudePC, CLAUDE_TOOL, MAIL_TOOL, phraseIndispo } from './claude.js';
import { Qui } from './qui.js';
import { Famille, FAMILLE_TOOLS, FAMILLE_TOOL_NAMES, FAMILLE_PAS_A_LUI } from './famille.js';
import { Reactions } from './reactions.js';
import { Memoire, demandeEnCours } from './memoire.js';
import { brancherStockage, bilanStockage } from './stockage.js';
import { Questions, QUESTION_TOOL, PROPRIO as PROPRIO_NOM } from './questions.js';
import * as VP from './voiture.js';
import { EcoMethodes } from './app/mode-eco.js';
import { ConsignesMethodes } from './app/consignes.js';
import { ReseauMethodes } from './app/reseau.js';
import { ReponsesMethodes } from './app/reponses.js';
import { OutilsMethodes } from './app/outils-gemini.js';
import { VoitureMethodes } from './app/en-voiture.js';
import { CrmMethodes } from './app/crm-et-outils.js';
import { EcranMethodes } from './app/ecran.js';
import { OUTILS_VOITURE, appli, pont, VOITURE_QUITTE_MS, RE_CONSIGNE_FONDEE, MAJ_VERIF_MS, PREROLL_MS, VISAGE_ATTENTE_MS, SEG_GAP_MS, SEG_VU_MIN, TAIL_MS, TAIL_NOAEC_MS, TURN_GATE_MS, LOOK_GRACE_MS, REGARD_DIALOGUE_MS, LOOKED_IDLE_MS, VOITURE, APRES_OUTIL_MS, ATTENTE_GOOGLE_MS, ATTENTE_EXPLIQUE_MS, MICRO_RETENU_MS, REPONDS_APRES_MS, LENT_APRES_FORCE_MS, CAR_IDLE_MS, BYNAME_IDLE_MS, NAME_GATE_MS, ECO_TAIL_MS, pad, $, enAnglais, cleanSpeech, emotionDuTexte, realPhrase, shorten, isNetErr, concat } from './app/commun.js';
export { emotionDuTexte, texteCompare, memeDebut } from './app/commun.js';

const VERSION = '1.45.32';

class App {
  constructor() {
    this.version = VERSION; this.logs = []; this.bootAt = Date.now();
    const imported = IMPORT_CHIFFRE || takeSettingsFromHash();     // « …#reglages=… » : réglages copiés depuis un autre appareil (PLAN 2 ter)
    this.settings = loadSettings();
    if (imported) {   // réglages absents du lien = valeur d'origine
      mergeInto(this.settings, { ...shareable(DEFAULTS), ...imported }); this.settings._t = 0; this.settings._sale = false; saveSettings(this.settings); this._imported = true;
    }
    this.remote = new RemoteLog(this);           // journal à distance (feuille Google lue par Claude)
    this.crm = new Crm(this);                    // CRM à la voix (PLAN 2 quater)
    this.claude = new ClaudePC(this);            // questions difficiles : Claude sur le PC de la maison (PLAN 10)
    this.maison = new Maison({ settings: this.settings, log: (m, imp) => this.log(m, imp),   // la maison (PLAN 7 bis)
      pcVivant: async () => { const p = this.claude.on ? await this.claude.etat(null).catch(() => null) : null; return !!(p && p.vivant); } });
    // Journal du 05/11/26 : « Maison : inventaire impossible » toutes les 10 min, toute la matinée (ordinateur de la maison
    // éteint), et au démarrage du téléphone en voiture. Noté une fois, puis une fois par heure tant que ça dure, et le retour ;
    // en voiture, pas d'inventaire (la maison ne se pilote pas de la route).
    setTimeout(() => this._majMaison(), 3000); setInterval(() => this._majMaison(), 10 * 60000);                // inventaire de la maison, relu toutes les 10 min
    this._heard = []; this._turnN = 0;           // ce que Timothée a dit, horodaté (verrou des écritures dans le CRM)
    this.car = null;                             // mode voiture (PLAN 2 quater, C5)
    this.oreille = new Oreille();                // reconnaît « Wilson » en voiture (empreintes de la voix de Timothée)
    this.oreille.sens = this.settings.oreilleSens || 'normal';
    this.oreille.onDetect = (d) => this._onName(d);
    this.oreille.onPresque = (d) => this._secondAvis(d);
    this.oreille.onSegment = (r) => this._oreilleLog(r);
    this.sync = new SettingsSync(this);          // mêmes réglages sur tous les appareils
    this.outils = null;                          // écran, minuteurs, rappels, météo, courses (PLAN 7 quater) : créé au démarrage
    // La famille (PLAN 7 sexies) : qui me regarde (visages appris sur cet appareil), messages, garde, réactions muettes.
    this.qui = new Qui({ log: (m) => this.log(m) });
    this.famille = new Famille(this);
    this.reactions = new Reactions(this);
    this.qui.onChange = (P) => { this.reactions.qui(P); this.famille.quiChange(P); };
    this._catchErrors();
    this.face = new Face($('face'), { style: this.settings.face });
    this.face.setMood('somnolent'); this.face.setBrightness(0.35);
    this.audio = new AudioIO(); this.brain = new Brain();
    { const r0 = this.brain.respond.bind(this.brain); this.brain.respond = (x) => { this._outilRepAt = performance.now(); return r0(x); }; }   // R1 : résultat d'outil rendu
    this.memory = new Memory(); this.vision = null;
    this.memoire = new Memoire(this);            // ce qu'il retient d'utile (onglet « Mémoire » de la feuille, PLAN 7 septies)
    this.questions = new Questions(this);        // les questions de Claude à Timothée (onglet « Questions »)
    this.sensors = new Sensors($('face'));
    this.voice = new Voice(); this.eco = new EcoBrain(); this.mode = null; this.ecoState = null;
    this.ui = new SettingsUI(this);
    this.state = 'demarrage'; this.started = false; this.continuous = false;
    this.pending = []; this.outBuf = []; this.outLen = 0;
    this.lastActivity = 0; this.lastUserSpeech = 0; this.lastFrame = 0; this.playEndAt = 0;
    this.discard = false; this.endAfterSpeech = false; this.barge = { n: 0, echo: -60 };
    this.presenceAt = performance.now(); this.battery = null; this.settingsOpen = false;
    brancherStockage((m) => this.log(m));   // W18 : écriture impossible dans le stockage de l'appareil → journal
    this._wireSensors(); this._wireBrain(); this._wireAudio();
    this.outils = new Outils(this);
    if ('serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => { this.swReg = r; }).catch((e) => this.log('SW : ' + e.message));
      // Nouvelle version installée : on recharge (seulement si une ancienne version tournait, et jamais en pleine conversation).
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) this._reloadWhenIdle('nouvelle version installée'); });
      // W14 retour arrière : l'appli dit « prête » au service worker quelques secondes après son démarrage ; sans ce signal à temps,
      // il resert la version précédente. Il dit aussi s'il vient de le faire (une seule fois au journal).
      navigator.serviceWorker.addEventListener('message', (e) => this._messageSw(e.data || {}));
      setTimeout(() => { this._swEnvoyer({ type: 'prete', version: VERSION }); this._swEnvoyer({ type: 'etat' }); }, 3000);
    }

    this._lireNouveautes();
    setInterval(() => this._checkUpdate(), MAJ_VERIF_MS); setTimeout(() => this._checkUpdate(), 60000);   // tout de suite (16/11/26)
    setInterval(() => this._tick(), 50);
    // Surveillance de la charge : si la tablette prend du retard, on allège l'animation (jamais de file d'attente qui s'allonge).
    let lastBeat = performance.now(); this.lag = 0; this._t0 = lastBeat;   // on ignore le démarrage (chargement des modèles)
    let lastDrawn = 0, slow = 0;
    setInterval(() => {
      const t = performance.now(), late = t - lastBeat - 1000; lastBeat = t;
      // Appli en arrière-plan ou écran éteint : le navigateur met les minuteries en pause. Ce n'est pas de la lenteur.
      if (document.hidden || t - (this._shownAt || 0) < 3000 || late > 10000) {
        if (late > 400) this.log(`Appli en arrière-plan ou écran éteint pendant ${Math.round(late / 1000)} s`);
        return;
      }
      this.lag = this.lag * 0.8 + Math.max(0, late) * 0.2;
      if (late > 400) this.log(`Tablette en retard de ${Math.round(late)} ms`);
      if (t - this._t0 > 30000 && this.lag > 150 && !this._light) { this._light = true; this.face.maxFpsLight = true; this.log('Mode allégé : animation à 30 images/s'); }
      // Images du visage réellement dessinées : si l'écran n'arrive pas à suivre, on dessine moins de pixels, puis moins d'images.
      const f = this.face, drawn = (f.drawn || 0) - lastDrawn; lastDrawn = f.drawn || 0;
      const want = 60 / (f.div || 1);
      this.drawFps = drawn;
      slow = !document.hidden && t - this._t0 > 20000 && drawn < want * 0.6 ? slow + 1 : 0;
      if (slow >= 5) {
        slow = 0;
        if (f.maxDpr > 1) { f.setMaxDpr(1); this.log(`Visage saccadé (${drawn} images/s) : dessin allégé (moins de pixels)`); }
        else if (!this._light) { this._light = true; f.maxFpsLight = true; this.log(`Visage saccadé (${drawn} images/s) : animation à 30 images/s`); }
      }
    }, 1000);
  }

  get speaking() { return this.audio.playing || this.voice.speaking; }

  // priv : la ligne contient ce que dit la famille (le journal à distance peut la masquer, voir réglages).
  log(m, priv = false) {
    const d = new Date(); this.logs.push(`${pad(d.getHours())}h${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${m}`); (this.logsT = this.logsT || []).push(d.getTime());
    if (this.logs.length > 200) { this.logs.shift(); this.logsT.shift(); }
    console.log('[Wilson]', m); if (this.settingsOpen && this.ui) this.ui.renderLog();
    if (this.remote) this.remote.line(m, priv);
  }

  // Erreurs JavaScript : notées dans le journal (et donc visibles à distance).
  _catchErrors() {
    let n = 0;
    const note = (msg) => { if (n++ < 50) this.log('Erreur : ' + String(msg).slice(0, 400)); };
    window.addEventListener('error', (e) => note(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    window.addEventListener('unhandledrejection', (e) => note('promesse : ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
    // La page se ferme ou passe en arrière-plan : ce qui attend part tout de suite.
    const bye = () => { if (Date.now() - (this._byeAt || 0) < 2000) return; this._byeAt = Date.now(); this.remote.flush({ beacon: true }); };
    window.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.hidden) bye(); });
  }

  // D5 : l'écran « santé » des réglages. Une ligne par point : { libelle, valeur, etat } avec etat = ok | warn | ko.
  santeLignes() {
    const now = Date.now(), s = this.settings, L = [], b = this.battery, r = this.remote;
    const min = (t) => Math.round((now - t) / 60000);
    L.push({ libelle: 'Version', valeur: `${VERSION}${this.swReg && this.swReg.waiting ? ' (une mise à jour attend le redémarrage)' : ''}`, etat: 'ok' });
    L.push({ libelle: 'Réseau', valeur: this.netWait ? `COUPURE depuis ${Math.round((now - this.netWait.since) / 1000)} s (${this.netWait.why})` : navigator.onLine ? 'en ligne' : 'hors ligne', etat: this.netWait || !navigator.onLine ? 'ko' : 'ok' });
    if (r && r.on) L.push({ libelle: 'Journal à distance', valeur: r.fails ? `${r.fails} envoi(s) raté(s) de suite` : r.sentAt ? `dernier envoi il y a ${min(r.sentAt)} min` : 'pas encore envoyé', etat: r.fails > 2 ? 'ko' : r.fails || (r.sentAt && min(r.sentAt) > 15) ? 'warn' : 'ok' });
    else L.push({ libelle: 'Journal à distance', valeur: 'non relié au script', etat: 'warn' });
    if (r && r.on && this.sync) L.push({ libelle: 'Réglages communs', valeur: this.sync.state || 'pas encore synchronisés', etat: /erreur|impossible|refus/i.test(this.sync.state || '') ? 'ko' : 'ok' });
    if (this.claude) { const t = this.claude.etatDit(); L.push({ libelle: 'Claude (PC de la maison)', valeur: t, etat: /absent|limite/i.test(t) ? 'warn' : /coupé|pas encore/i.test(t) ? 'warn' : 'ok' }); }
    const qd = this.quotaUntil && now < this.quotaUntil, qe = this.ecoQuotaUntil && now < this.ecoQuotaUntil;
    L.push({ libelle: 'Quotas Gemini', valeur: qd || qe ? `en pause : ${[qd ? 'direct (' + (this.quotaMsg || '') + ')' : '', qe ? 'économique (' + (this.ecoQuotaMsg || '') + ')' : ''].filter(Boolean).join(', ')}` : 'pas de pause', etat: qd || qe ? 'warn' : 'ok' });
    if (b) L.push({ libelle: 'Batterie', valeur: `${Math.round(b.level * 100)} %${b.charging ? ', branchée' : ', NON branchée'}`, etat: !b.charging && b.level < 0.2 ? 'ko' : !b.charging && b.level < 0.5 ? 'warn' : 'ok' });
    L.push({ libelle: 'Stockage de l\'appareil', valeur: bilanStockage.echecs ? `${bilanStockage.echecs} écriture(s) impossible(s), dernière : ${bilanStockage.derniere}` : 'sans problème', etat: bilanStockage.echecs ? 'ko' : 'ok' });
    const erreurs = this.logs.filter((l) => /erreur|impossible|échec|refus|indisponible/i.test(l));
    L.push({ libelle: 'Dernière erreur du journal', valeur: erreurs.length ? erreurs[erreurs.length - 1].slice(0, 160) : 'aucune depuis le démarrage', etat: erreurs.length ? 'warn' : 'ok' });
    L.push({ libelle: 'Démarré', valeur: `il y a ${min(this.bootAt) < 90 ? min(this.bootAt) + ' min' : Math.round(min(this.bootAt) / 60) + ' h'}`, etat: 'ok' });
    return L;
  }

  // Bilan de la tablette pour l'onglet « État » du journal à distance.
  bilan() {
    const v = this.vision, b = this.battery, s = this.settings, e = this.eco, now = Date.now();
    const d = (t) => { const x = new Date(t); return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)} ${pad(x.getHours())}h${pad(x.getMinutes())}`; };
    return {
      'Version': VERSION, 'Démarré le': d(this.bootAt), 'État': this.state, 'Cerveau en cours': this.mode || '—', 'Réglage cerveau': s.brainMode,
      'Écoute': `${s.listenMode}${this._gazeMode ? ' (regard actif : veille après 3 s sans regard)' : ''}${this.paused ? ', EN VEILLE (plus regardé)' : ''}`, 'Coupure': s.bargeIn, 'Fin de conversation': `${s.convTimeout} s`,
      'Réponses retenues (personne ne le regardait)': String(this._nRetenues || 0),
      'Vision': v ? `${v.mode}, regard ${v.gazeReady ? 'prêt' : v.modelsDone ? 'indisponible' : 'en chargement'} (${v.delegate === 'GPU' ? 'carte graphique' : 'processeur'}), analyse ${Math.round(v.stats.ms || 0)} ms (visages ${Math.round(v.stats.fd || 0)}, regard ${Math.round(v.stats.lm || 0)}), ${v.faces || 0} visage(s), on le regarde : ${v.looking ? 'oui' : 'non'}${v.errors.length ? ' — ' + v.errors.join(' · ') : ''}${v.restarts ? `, relancée ${v.restarts} fois` : ''}${v.fixes.length ? `, ${v.fixes.length} réparation(s)` : ''}` : 'caméra coupée',
      'Visage': `${this.drawFps || 0} images/s${this._light ? ', mode allégé' : ''}${this.face.maxDpr ? ', finesse ' + this.face.maxDpr : ''}`,
      'Retard de la tablette': `${Math.round(this.lag || 0)} ms`,
      'Son': this.audio.describe(),
      'Réponses du direct': this.brain.proactive === false ? 'répond à tout ce qu\'il entend (proactivité coupée)' : 'Gemini choisit à quoi répondre (réglage refusé par le modèle)',
      'Photos': `seulement à la demande — ${this._photos || 0} prise(s) depuis le démarrage`,
      'Batterie': b ? `${Math.round(b.level * 100)} %${b.charging ? ', branchée' : ', NON branchée'}` : '—',
      'Réseau': `${navigator.onLine ? 'en ligne' : 'hors ligne'}${this.netWait ? `, COUPURE en cours depuis ${Math.round((now - this.netWait.since) / 1000)} s (${this.netWait.why})` : ''}${this.phone ? ', appel téléphonique en cours' : ''}`,
      'Claude (PC de la maison)': this.claude ? this.claude.etatDit() : '—',
      'Recherche Internet': this.remote.on ? `Tavily par le script${this._searchState ? ' — dernière : ' + this._searchState : ''}` : 'Gemini seulement (pas de script)',
      'Mode économique': `${e.modelUsed || '—'}, réflexion ${e.thinking ?? 'par défaut'}${e.noSchema ? ', sans schéma' : ''}${e.noSearch ? ', sans recherche' : ''}, ${e.recent()} requête(s) dans la dernière minute`,
      'Quota direct': this.quotaUntil && now < this.quotaUntil ? `en pause : ${this.quotaMsg || ''}` : 'pas de pause',
      'Quota économique': this.ecoQuotaUntil && now < this.ecoQuotaUntil ? `en pause : ${this.ecoQuotaMsg || ''}` : 'pas de pause',
      'Voix de la tablette': `${s.ecoVoice || 'automatique'} (${this.voice.voices().length} voix françaises)`,
      'Mémoire': this.memoire.decrire(),
      'Questions de Claude': this.questions.decrire(),
      'Visages (sur cet appareil)': this.qui.decrire(),
      'Messages de la famille': this.famille.decrireMessages(),
      'Garde de la maison': this.famille.decrire(),
      'Réactions muettes': this.reactions.decrire(),
      'CRM': this.crm.on ? `relié — ${this.crm.state || 'pas encore interrogé'}${this.crm.cache.size ? `, ${this.crm.cache.size} fiche(s) gardée(s)` : ''}${this.crm.pending ? ', une écriture attend sa confirmation' : ''}${this.crm.queue.length ? `, ${this.crm.queue.length} écriture(s) confirmée(s) en attente du réseau` : ''}` : (this.settings.crm ? 'activé, mais pas de script sur cet appareil' : 'non relié'),
      'Appli Android': appli() ? `oui (appli ${pont('version')}), retour après le GPS : ${pont('peutRevenir') ? 'oui' : 'NON (autorisation « par-dessus les autres applis » manquante)'}, ${pont('premierPlan') === false ? 'derrière une autre appli' : 'à l\'écran'}, micro : ${this.audio && this.audio.natif ? 'celui de l\'appli (téléphone)' : 'celui de la page' + (+pont('version') < 3 ? ' (mets l\'appli à jour : même lien)' : '')}, mise à jour de l'appli : ${pont('majEtat') || 'à installer une dernière fois à la main (même lien), ensuite automatique'}` : 'non (navigateur)',
      'Protocole voiture': this._voitureBt ? `actif — caméra ${this.vision ? 'ALLUMÉE' : 'éteinte'}, verrou de vérité` : 'non (pas en voiture)',
      'Mode voiture': `${!VOITURE && !this.car ? 'supprimé' : this.car ? `oui (${this.car.why})` : 'non'}${VOITURE && this.settings.voitureAuto && deviceName() === 'téléphone' ? `, automatique en roulant${this._geoErr ? ' (GPS : ' + this._geoErr + ')' : this.speed != null ? `, vitesse ${Math.round(this.speed * 3.6)} km/h` : ''}` : ''}`,
      'Annuaire du CRM (sur cet appareil)': this.crm.on ? this.crm.etatAnnuaire() : '—',
      'Oreille (voiture)': this.oreille.ready ? `apprise, ${this.oreille.templates.length} empreintes, limite ${this.oreille.limite.toFixed(1)} (${this.oreille.sens})${this.oreille.last.length ? ' — dernières phrases : ' + this.oreille.last.slice(-8).map((x) => x.s + (x.oui ? '✓' : '')).join(' ') : ''}` : 'pas apprise',
      'Réglages communs': this.remote.on ? (this.sync.state || 'pas encore vérifiés') : 'pas de script : réglages propres à cet appareil',
      'Phrases échangées dans le journal': s.logContent === false ? 'masquées' : 'envoyées',
      'Écran': `${screen.width}×${screen.height}, densité ${devicePixelRatio}`,
      'Navigateur': navigator.userAgent,
    };
  }
  badge(text, ms = 5000, important = false) {
    const b = $('badge'), now = performance.now();
    if (!important && this._badgeImportantUntil > now) return;          // un message d'erreur reste lisible
    this._badgeImportantUntil = important ? now + ms : 0;
    b.textContent = text; b.hidden = false; clearTimeout(this._bt); this._bt = setTimeout(() => (b.hidden = true), ms);
  }

  // ---------- démarrage ----------
  boot() {
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    this.start(false);
  }

  async start(fromGesture) {
    if (this.started) { await this.audio.resume(); this._hideWake(); return; }
    this.started = true;
    try {
      await this.audio.start({ aec: this.settings.bargeIn === 'directe' });
      this.log(`Micro prêt — son : ${this.audio.describe()}`);
    } catch (e) {
      this.started = false; this.log('Micro refusé : ' + e.message);
      this.face.setEmotion('triste', 6000); this.badge("J'ai besoin du micro pour t'entendre", 8000); this._showWake(); return;
    }
    // Remarque de Timothée du 05/11/26, 15h54 (« en mode voiture, ça sert à rien d'activer la caméra ») : pas de caméra en voiture.
    if (this.settings.camera && !this._voitureBt) await this._startVision();
    else if (this._voitureBt) this.log('Voiture : caméra éteinte');
    this.sensors.startMotion(); this.sensors.startBattery();
    this._watchSpeed();
    this._wakeLock(); document.addEventListener('visibilitychange', () => { if (!document.hidden) { this._shownAt = performance.now(); this._wakeLock(); this.audio.resume(); this._backFromCall(); this._sourdFin(); this._aDireAuRetour(); } else this._sourdDebut('appli en arrière-plan ou écran éteint'); });
    setInterval(() => this._sourdGarde(), 2000);
    if (fromGesture && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => this._freeRotation()).catch(() => {});
    this._freeRotation();
    if (!this.audio.running) this._showWake(); else this._hideWake();
    this.voice.warm();
    this._loadQuota();
    this.log(`Wilson ${VERSION} démarré${this.remote.on ? ' (journal à distance actif)' : ''}`);
    setTimeout(() => this.remote.flush(), 20000);   // 1er bilan une fois la vision chargée
    if (this._imported) { this.log('Réglages copiés depuis un autre appareil'); this.badge('Réglages copiés depuis ton autre appareil ✓', 6000); }
    setTimeout(() => this.sync.pull(), 3000);       // réglages communs : le plus récent gagne
    setTimeout(() => { this.memoire.synchroniser(); this.questions.synchroniser(); }, 6000);   // mémoire et questions (7 septies)
    this.setState('veille');
    this.applySettings();
  }

  async _startVision() {
    try {
      this.vision = new Vision(); this.vision.mirror = !this.settings.mirror; this.vision.calib = { yaw: 0, pitch: 0, down: 0, ...(this.settings.gazeCalib || {}) };
      this.vision.onPresence = (p) => this._presence(p);
      this.vision.onInfo = (m) => this.log(m);
      const v = this.vision;
      await v.start();
      // Journal du 05/11/26, 18h08:53 (appli) : la voiture a été reconnue pendant que la caméra s'ouvrait ; la caméra arrêtée
      // entre-temps se rallumait quand même (« Caméra prête », puis la vision tournait en voiture).
      if (this.vision !== v || this._voitureBt) { try { v.stop(); } catch (_) {} if (this.vision === v) { this.vision = null; this.qui.attacher(null); } this.log('Caméra refermée aussitôt : en voiture'); return; }
      this.log('Caméra prête');
      this.qui.attacher(this.vision);
    } catch (e) { this.vision = null; this.log('Caméra indisponible : ' + e.message); }
  }

  // G3 : ce qui a changé à la dernière mise à jour (champ « nouveautes » de version.json, écrit à chaque publication).
  // Dit une seule fois, en une phrase, à la première discussion qui suit ; ensuite seulement si on le lui demande.
  async _lireNouveautes() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(); if (j.version !== VERSION || !j.nouveautes) return;
      this._nv = { texte: String(j.nouveautes).slice(0, 600), date: j.date || '' };
      let dit = ''; try { dit = localStorage.getItem('wilson.nouveautesDites') || ''; } catch (_) {}
      this._nv.aDire = dit !== VERSION;
      this.log(`Mise à jour ${VERSION}${j.date ? ' du ' + j.date : ''} : ${this._nv.texte.slice(0, 200)}`, true);
    } catch (_) {}
  }
  _nouveautes(mode) {
    const n = this._nv; if (!n) return '';
    let t = `\nTa dernière mise à jour (version ${VERSION}${n.date ? ', ' + n.date : ''}), faite d'après les remarques de Timothée et ton journal : ${n.texte} Si on te demande ce qui a changé, dis-le simplement.`;
    // Pas en voiture (journal du 12/11/26, 08h42:28 : 12 s de nouveautés enchaînées à « C'est parti, je te guide vers… », pendant qu'il
    // cherchait à corriger la destination) : elles seront dites à la première discussion hors de la voiture, ou s'il les demande.
    // 1.43.0 (réponse de Timothée à q261113a, 13/11/26, 07h09:42 : « sur le premier appareil sur lequel tu me vois ») : dites
    // une seule fois pour tous ses appareils. Le réglage commun nvDites (synchronisé par le script) dit qu'elles l'ont été.
    if (n.aDire && this.settings.nvDites === VERSION) n.aDire = false;
    if (n.aDire && mode === 'live' && !this.enVoiture) {
      try { this.settings.nvDites = VERSION; this.applySettings('nvDites'); } catch (_) {}
      t += ' C\'est ta première discussion depuis : après avoir répondu à ce qu\'on te demande, dis en une phrase courte ce qui a changé (une seule fois).';
      n.aDire = false; try { localStorage.setItem('wilson.nouveautesDites', VERSION); } catch (_) {}
    } else if (!n.aDire) {
      // Journal du 25/11/26 : nouveautés de la 1.45.31 dites à 17h12 sur la tablette, puis redites mot pour mot à 20h39 (copiées
      // de ses derniers échanges), avec un « C'est allumé » sans avoir rien allumé. Déjà dites : plus jamais de lui-même.
      t += ' Tu les as déjà racontées à Timothée : ne les redis jamais de toi-même, même si tes derniers échanges en parlent.';
    }
    return t;
  }

  _swEnvoyer(m) { try { const c = navigator.serviceWorker.controller; if (c) c.postMessage(m); } catch (_) {} }
  _messageSw(d) {
    if (d.type === 'retour' && d.fait === false) this.badge('Pas de version précédente gardée sur cet appareil', 6000);
    if (d.type === 'etat' && d.etat && d.etat.statut === 'retour' && !d.etat.signale) {
      this.log(`Retour arrière (${d.etat.raison || 'sans précision'}) : version ${String(d.etat.echec || '?').replace('wilson-', '')} abandonnée, retour à la version ${String(d.etat.precedente || '?').replace('wilson-', '')} jusqu'à la prochaine publication`, true);
    }
  }
  // Pour un bouton « version précédente » dans les réglages (emplacement et texte à décider avec Timothée) : le service worker
  // resert la version précédente et recharge la page.
  versionPrecedente() { this.log('Retour à la version précédente demandé'); this._swEnvoyer({ type: 'retour', raison: 'demandé dans les réglages' }); }

  // Mise à jour automatique : la tablette reste allumée en permanence, Wilson se met donc à jour tout seul.
  async _checkUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (!version || version === VERSION) return;
      const [v0, t0] = (sessionStorage.getItem('wilson.reloadedFor') || '|0').split('|');
      if (v0 === version && Date.now() - +t0 < 30 * 60000) return;              // déjà tenté il y a peu : on attendra
      this.log(`Nouvelle version disponible : ${version}`);
      if (this.swReg) { try { await this.swReg.update(); } catch (_) {} }
      this._reloadWhenIdle(version);
    } catch (_) {}
  }
  _reloadWhenIdle(why) {
    if (this._majEnCours) return;
    this._majEnCours = true;
    const t0 = performance.now();
    const go = () => {
      const attente = performance.now() - t0;
      // jamais pendant un appel ni dans les réglages ; la fin de sa phrase, un outil ou l'installation : 2 min au plus
      if (this.phone || this.settingsOpen) return setTimeout(go, 5000);
      const occupe = (this.audio && this.audio.playing) || this._outilsEnCours > 0 || (this._searches && this._searches.size)
        || (this.swReg && (this.swReg.installing || this.swReg.waiting));
      if (occupe && attente < 120000) return setTimeout(go, 1500);
      try { sessionStorage.setItem('wilson.reloadedFor', `${why}|${Date.now()}`); } catch (_) {}
      const parlait = this.state === 'conversation' || this.state === 'eveil';
      this.log(`Mise à jour (${why}) : ${parlait ? 'je le dis, ' : ''}tête de mise à jour, puis rechargement`, true);
      this._teteMaj();
      if (parlait) { try { this.discard = true; this.voice.speak('Je me mets à jour, je ne suis pas disponible pendant une minute.'); } catch (_) {} }
      this.remote.flush({ beacon: true });
      setTimeout(() => location.reload(), parlait ? 4500 : 2500);
    };
    go();
  }
  // Remarque → correction tout de suite par Claude sur le PC (décision de Timothée du 16/11/26), avec les 15 dernières
  // minutes du journal de l'appareil (ce qu'il a dit, ce que Wilson a répondu, les outils, les erreurs).
  async lancerCorrection(remarque) {
    if (!this.claude || !this.claude.on) return null;
    const depuis = Date.now() - 15 * 60000, T = this.logsT || [];
    const lignes = this.logs.filter((_, i) => (T[i] || 0) >= depuis);
    const contexte = `Appareil : ${deviceName()}${this.enVoiture ? ' (en voiture)' : ''} ; Wilson ${VERSION}.\nJournal de l'appareil, 15 dernières minutes :\n${lignes.join('\n')}`.slice(-30000);
    const r = await this.claude.corriger({ remarque, contexte, appareil: deviceName() });
    this.log(`Correction ${r.accepte ? (r.pcLa ? 'envoyée au PC de la maison' : 'en attente du PC de la maison (absent)') : 'pas envoyée' + (r.erreur ? ' : ' + r.erreur : '')} : « ${String(remarque).slice(0, 100)} »`, true);
    return r;
  }
  // « Changer un peu de tête » pendant la mise à jour (16/11/26) : visage voilé, roue qui tourne, « pas disponible ».
  _teteMaj() {
    try { this.face.setEmotion('reflexion', 60000, 1); } catch (_) {}
    if (document.getElementById('tete-maj')) return;
    const d = document.createElement('div');
    d.id = 'tete-maj';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;'
      + 'background:rgba(8,10,20,.78);color:#F3E3B0;font:600 26px/1.3 system-ui,sans-serif;text-align:center;padding:24px';
    d.innerHTML = '<div style="font-size:90px;line-height:1;animation:wilson-maj 2s linear infinite">⚙</div>'
      + '<div>Je me mets à jour…</div><div style="font-size:18px;font-weight:400;opacity:.85">Pas disponible pendant une minute</div>'
      + '<style>@keyframes wilson-maj{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(d);
  }

  // Portrait et paysage : l'appli installée était verrouillée en paysage ; on laisse l'appareil tourner.
  _freeRotation() {
    try { if (screen.orientation && screen.orientation.lock && (document.fullscreenElement || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches)) screen.orientation.lock('any').catch(() => {}); } catch (_) {}
  }

  _showWake() { $('wake').hidden = false; }
  _hideWake() { $('wake').hidden = true; }
  async _wakeLock() { try { if ('wakeLock' in navigator) { this._wl = await navigator.wakeLock.request('screen'); } } catch (_) {} }

  saveSettingsQuiet() { saveSettings(this.settings); }

  applySettings(key, { fromSync = false } = {}) {
    const s = this.settings;
    if (key && !fromSync) {
      if (key === 'logUrl') { if (this.remote.on) this.sync.pull({ adopt: true }); }        // appareil qui rejoint : il prend les réglages communs
      else if (!LOCAL_ONLY.includes(key)) { s._sale = true; saveSettings(s); this.sync.schedulePush(); }   // W19 : l'heure vient du script, pas d'ici
    }
    if (s.face !== this.face.styleName) this.face.setStyle(s.face);
    this.eco.setSpeed(s.ecoSpeed);
    if ((key === 'haUrl' || key === 'haToken') && this.maison.on) this.maison.rafraichir().catch(() => {});
    if (key === 'apiKey' || key === 'model') {          // nouvelle clé : nouveau quota, on repart de zéro
      this.quotaUntil = 0; this.ecoQuotaUntil = 0; this.brain.authMode = this.brain.modelUsed = this.brain.level = null; this.brain.refused = {}; this.brain.think = false; this.brain.proactive = false; this.brain._save(); this.eco.modelUsed = null; this.log('Clé ou modèle changé');
    }
    if (this.vision) this.vision.mirror = !s.mirror;
    if (key === 'bargeIn' && this.started) {
      this.audio.setEchoCancel(s.bargeIn === 'directe').then((ch) => ch && this.log(`Micro rouvert — son : ${this.audio.describe()}`))
        .catch((e) => this.log('Micro : ' + e.message));
    }
    if (key === 'logUrl' && this.remote.on) { this.log('Journal à distance activé'); this.remote.flush(); }
    if (key === 'camera' && !this.car && !this._voitureBt) { if (s.camera && !this.vision && this.started) this._startVision(); if (!s.camera && this.vision) { this.vision.stop(); this.vision = null; this.qui.attacher(null); } }
    if (key === 'voitureAuto' && this.started) this._watchSpeed();
    this.oreille.sens = s.oreilleSens || 'normal';
    if (key === 'crm') { this.log(s.crm ? 'CRM relié à Wilson' : 'CRM détaché de Wilson'); if (s.crm) this.crm.status(true); }
    $('subtitle').hidden = !(s.subtitles || this.car);
    this.continuous = false;
  }

  // ---------- états ----------
  setState(st) {
    if (this.state === st) return;
    this.log(`État : ${this.state} → ${st}`); this.state = st;
    this._micVoiture();
    const f = this.face;
    switch (st) {
      case 'dodo':
        f.clearEmotion(); f.play('yawn'); setTimeout(() => this.state === 'dodo' && f.setMood('dort'), 1800);
        f.setBrightness(0.1); f.setFps(24); f.setListen(-1); this.vision && this.vision.setRate(3);
        this._lookShown = null; break;
      case 'veille':
        f.setMood(this.vision && this.vision.hasPerson ? 'neutre' : 'somnolent');
        f.setBrightness(this.vision && this.vision.hasPerson ? 0.45 : 0.3); f.setFps(40); f.setListen(-1);
        this.vision && this.vision.setRate(this.vision.hasPerson ? 8 : 4); this._lookShown = null; break;
      case 'eveil':
        f.setMood('attentif'); f.setBrightness(1); f.setFps(60);
        this.vision && this.vision.setRate(10); break;
      case 'conversation':
        this.paused = false; this._convAt = performance.now();
        f.setMood('ecoute'); f.setBrightness(1); f.setFps(60); this.vision && this.vision.setRate(10); break;
    }
  }

  _presence(p) {
    if (p) {
      this.presenceAt = performance.now();
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('wake'); }
      if (this.state === 'veille') { this.face.setMood('neutre'); this.face.setBrightness(0.45); this.vision && this.vision.setRate(8); }
    } else if (this.state === 'veille') { this.face.setMood('somnolent'); this.face.setBrightness(0.3); this.vision && this.vision.setRate(4); }
  }
  _isNight() { const h = new Date().getHours(), a = this.settings.nightStart, b = this.settings.nightEnd; return a > b ? (h >= a || h < b) : (h >= a && h < b); }

  // ---------- écoute au regard ----------
  // La phrase est-elle pour Wilson ? On le regarde (ou on vient de le regarder), ou bien la discussion est en cours.
  _addressed(now = performance.now()) {
    if (this.car) return this.state === 'conversation' || this.state === 'eveil';   // voiture : réveillé par son nom, seul avec lui
    if ((this._byName || this._voitureBt) && (this.state === 'conversation' || this.state === 'eveil')) return true;   // E3 : appelé par son prénom ; téléphone en voiture (03/11/26)
    const pol = this.settings.listenMode || 'regard', v = this.vision;
    if (pol === 'toucher') return false;
    if (pol === 'toujours') return true;
    if (!v || !v.gazeReady || v.stale) return false;                    // sans détection du regard (ou caméra figée) : toucher pour parler
    if (this.paused) return false;                                      // en veille faute de regard : il n'écoute plus
    if (v.looking) return true;
    // R3 : pendant une discussion, on peut détourner les yeux 3 s ; sinon il faut le regarder (1,5 s de marge de détection).
    // Depuis le 01/11/26 : à partir du dernier regard CONFIRMÉ (sureAt), plus d'une simple analyse « regarde » (lookAt).
    return now - (v.sureAt || 0) < (this.state === 'conversation' ? this._graceRegard() : 1500);
  }
  // Remarque de Timothée du 19/11/26, 08h44:07 (tablette du salon) : « que je continue de répondre même s'il tourne le regard
  // et que je ne repasse pas en veille tout de suite, qu'il y ait un délai d'au moins 30 secondes » (pas forcément sur le
  // téléphone). Sur la tablette, une fois la discussion ENGAGÉE (il a dit une phrase en le regardant : R1 pour commencer), il
  // peut détourner les yeux 30 s : Wilson l'écoute et lui répond encore. Avant, ou ailleurs : 3 s, comme avant.
  _graceRegard() {
    if (this.state !== 'conversation' || deviceName() !== 'tablette' || !this._dialogueEngage()) return LOOK_GRACE_MS;
    return REGARD_DIALOGUE_MS;
  }
  _dialogueEngage() { const t0 = this._convAt0 || 0; return (this._segs || []).some((S) => S.last >= t0 && S.vu >= SEG_VU_MIN); }

  // Le regard pilote la discussion (R3) : actif seulement avec la détection du regard.
  get _gazeMode() { const v = this.vision; return (this.settings.listenMode || 'regard') === 'regard' && !!(v && v.gazeReady && !v.stale); }

  // Plus regardé depuis 3 s : veille visuelle, micro coupé vers Gemini ; la session est gardée pour reprendre aussitôt.
  _pause() {
    if (this.paused) return;
    this.paused = true; this._pausedAt = performance.now();
    this.log(`Plus regardé depuis ${this._graceRegard() / 1000} s : veille (discussion gardée ${this.settings.convTimeout} s)`);
    const f = this.face; f.clearEmotion(); f.setMood('neutre'); f.setBrightness(0.45); f.setFps(40); f.setListen(-1);
    if (this.mode === 'live') { this.outBuf = []; this.outLen = 0; if (this.brain.open) this.brain.audioStreamEnd(); }
    if (this.ecoState) this.ecoState.cap = null;
  }
  // Fin de phrase forcée (voiture, journal du 05/11/26, 14h46-14h48) : Google croit encore entendre parler (bruit de la
  // route) et ne répond pas. audioStreamEnd lui fait traiter tout de suite ce qu'il a entendu ; le micro est retenu 1,5 s
  // (sinon le bruit relance aussitôt « quelqu'un parle »), puis « réponds-lui » s'il n'a toujours rien dit 2,5 s après.
  _forcerFinPhrase() {
    if (!this.brain.open) return;
    const conv = this.convId, turn = this._turnN, t0 = performance.now();
    this._forceAt = { at: t0, tour: turn, conv };          // réponse en retard après cette fin forcée → prévenu (20/11/26)
    this.outBuf = []; this.outLen = 0;
    this.brain.audioStreamEnd();
    this._micRetenuJusqua = t0 + MICRO_RETENU_MS;
    setTimeout(() => {
      if (conv !== this.convId || this.state !== 'conversation' || !this.brain.open || this.paused) return;
      if (this._liveTurn || this.audio.playing || this._turnN !== turn || (this._toolAt || 0) > t0 || (this._vv && this._vv.n === turn && this._vv.held.length)) {
        this.log(`Fin de phrase forcée : il répond (${((performance.now() - t0) / 1000).toFixed(1)} s)`); return;
      }
      this.log('Fin de phrase forcée, toujours rien : je lui dis de répondre');
      this.brain.sendText('[Il a fini sa phrase : réponds-lui maintenant, à voix haute, brièvement.]');
    }, REPONDS_APRES_MS);
  }
  // Regardé de nouveau : il se réactive tout de suite, et le début de la phrase n'est pas perdu (R2).
  _resume() {
    if (!this.paused) return;
    this.paused = false; const now = this._resumedAt = performance.now();
    this.log(`Regardé de nouveau après ${((now - this._pausedAt) / 1000).toFixed(1)} s : je t'écoute`);
    const f = this.face; f.setMood('ecoute'); f.setBrightness(1); f.setFps(60); f.play('wake');
    this.lastActivity = now;
    if (this.mode === 'live' && this.brain.open && this.audio.speaking) this.brain.sendAudio(this.audio.recent(800));
  }

  // Ce qui a été entendu ces dernières secondes (transcriptions), pour vérifier qu'un outil a bien été demandé.
  _entenduRecent(ms = 25000) { const now = performance.now(); return (this._heard || []).filter((h) => now - h.t < ms).map((h) => h.text).join(' '); }
  // Garde-fou (journal du 30/10/26, 08h22 : « avec le siège pupitre, tu sais » → photo + fiche du client « Kevin ») :
  // Gemini a parfois appelé un outil à partir d'un bruit ou d'une phrase pas pour lui. Pour la photo et les outils qui
  // portent sur un client, l'outil doit correspondre à ce qu'on a vraiment entendu ; sinon il ne fait rien et se tait.
  _outilPasDemande(c) {
    if (this.car && this._gate) return '';
    // Remarque qui reprend des mots qu'il n'a pas dits (journal du 16/11/26, 19h23:24 : « visage trop statique » noté sur
    // « j'ai une nouvelle remarque ») : refusée, Wilson lui demande sa remarque (une remarque lance une correction du code).
    if (c.name === 'remarque') return VP.remarqueInventee((c.args || {}).texte, this._entenduRecent(90000) + ' ' + String(this.brain.inText || '')) ? 'remarque' : '';
    const dit = this._entenduRecent(), n = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!dit.trim()) return '';                                                      // pas de transcription : on ne peut pas juger
    const d = n(dit), a = c.args || {};
    if (c.name === 'regarder') return /regard|vois|voir|montr|couleur|\blis\b|lire|decri|habill|qu.?est.?ce que|qu.?est.?ce qu|c.?est quoi|quoi ca|\bmain\b|tiens|ressemble|photo|devant toi|camera|doigts|reconnai|qui est|quelle marque|ceci|cela|combien d|objet|porte|tenue|coiffure/.test(d) ? '' : 'regarder';
    // « Répète » n'est pas « réaffiche » (journal du 05/11/26, 11h06:46 : « tu peux répéter ta dernière phrase ? » → reafficher).
    if (c.name === 'reafficher') return /affich|montr|ecran|remontr|revoi|image|photo|carte|meteo|plus longtemps|pas eu le temps/.test(d) ? '' : 'reafficher';
    if (['crm_client', 'crm_contacts', 'itineraire', 'appeler'].includes(c.name)) {
      const mots = n(a.client || a.lieu || '').split(/[^a-z0-9]+/).filter((m) => m.length >= 3);
      if (mots.some((m) => d.includes(m) || d.includes(m.slice(0, 4)))) return '';
      // Journal du 05/11/26, 11h07:17-11h07:43 : « Pourquoi tu m'as parlé de Tech Metallu ? » (TECMETALU) refusé 3 fois.
      // Nom collé, sans « h » ni lettres doublées (« tech metallu » = « tecmetalu ») ; et un client dont Wilson vient de
      // parler lui-même compte aussi.
      const colle = (x) => n(x).replace(/[^a-z0-9]/g, '').replace(/h/g, '').replace(/(.)\1+/g, '$1');
      const nom = colle(a.client || a.lieu || ''), ici = colle(dit + ' ' + (this._ditWilson || []).filter((x) => performance.now() - x.t < 120000).map((x) => x.text).join(' '));
      if (nom.length >= 4 && (ici.includes(nom) || [...Array(Math.max(0, nom.length - 4)).keys()].some((i) => ici.includes(nom.slice(i, i + 5))))) return '';
      if (/client|crm|fiche|commande|devis|appel|chez|rendez|rdv|\blui\b|\belle\b|societe|entreprise|adresse|itineraire|gps|numero/.test(d)) return '';
      return c.name;
    }
    return '';
  }

  // Les prénoms de la maison : sa mémoire, les visages appris, l'ancien réglage « Qui vit ici » (gardé caché).
  _prenomsMaison() {
    const l = [...this.memoire.prenoms(), ...this.famille.noms(), ...((this.settings.home || '').match(/\b[A-ZÉÈÀÂÎÔ][a-zéèêëàâîïôöûüç-]{2,}\b/g) || [])];
    return [...new Set(l)].filter((n) => n.toLowerCase() !== 'wilson');
  }

  // Wilson vient de parler (moins de 20 s) : un « oui », « non », « il va faire chaud ? » est sa réponse (journal du 30/10/26, 11h26).
  _dialogueEnCours() { return !!(this.playEndAt && performance.now() - this.playEndAt < 20000); }
  _autrePrenom(t) {
    const low = String(t || '').toLowerCase(), autres = this._prenomsMaison();
    const tete = (low.match(/^\s*(?:allez\s+|hé\s+|eh\s+|oh\s+)?([a-zéèêëàâîïôöûüç-]{3,})\s*[,!]/) || [])[1];
    return !!(tete && (autres.some((n) => n.toLowerCase() === tete && n.toLowerCase() !== 'wilson') || /^(loulou|maman|papa|chéri|chérie|bébé|mamie|papi|doudou|minou)$/.test(tete)));
  }

  // E2 : une phrase restée sans réponse mérite-t-elle une relance ? Seulement une vraie demande pour lui : son prénom, « tu »,
  // une question, un verbe de demande ; jamais si elle commence par le prénom de quelqu'un d'autre (« Louis, viens »).
  _semblePourMoi(t) {
    const x = String(t || '').trim(), low = x.toLowerCase();
    if (/\bwilson\b/i.test(x)) return true;
    const autres = this._prenomsMaison();
    // Un autre prénom (sa mémoire, les visages appris) ou un petit nom (« loulou », « maman »…) en tête de phrase : ce n'est pas pour lui.
    const tete = (low.match(/^\s*(?:allez\s+|hé\s+|eh\s+|oh\s+)?([a-zéèêëàâîïôöûüç-]{3,})\s*[,!]/) || [])[1];
    if (tete && (autres.some((n) => n.toLowerCase() === tete) || /^(loulou|maman|papa|chéri|chérie|cheri|cherie|bébé|bebe|mamie|papi|mon cœur|ma puce|doudou|minou)$/.test(tete))) return false;
    if (/^\s*allez\s+(loulou|maman|papa|chéri|chérie|ma puce|mon cœur)\b/.test(low)) return false;
    if (autres.some((n) => n.toLowerCase() !== 'wilson' && new RegExp('^\\s*' + n.toLowerCase() + '\\b').test(low))) return false;
    if (/^\s*(salut|coucou|bonjour|bonsoir|hello|hey|bonne nuit|merci)\b/.test(low)) return true;      // saluer Wilson en le regardant
    if (/\?/.test(x) || /\b(tu|toi|te|t'|peux-tu|pourrais-tu|sais-tu|est-ce que)\b/.test(low)) return true;
    return /^\s*(allume|éteins|eteins|mets|monte|baisse|coupe|lance|ouvre|ferme|arrête|arrete|stop|montre|cherche|dis|raconte|donne|fais|rappelle|note|appelle|regarde|quel|quelle|quels|quelles|combien|comment|pourquoi|où|quand|qui|c'est quoi)\b/.test(low);
  }

  // On le regarde vraiment (pas seulement « discussion en cours ») : la phrase lui est destinée à coup sûr.
  // Règle de Timothée du 01/11/26 : regard CONFIRMÉ (yeux ouverts, 0,6 s), avec 0,7 s de marge pour la fin d'un mot.
  _gazing(now = performance.now()) {
    const v = this.vision;
    return !!(v && v.gazeReady && !v.stale && (this.settings.listenMode || 'regard') === 'regard' && (v.looking || now - (v.sureAt || 0) < 700));
  }

  // ---------- R1 (règle de Timothée du 01/11/26) : répondre seulement s'il est SÛR qu'on le regarde ----------
  // Chaque morceau de voix envoyé à Gemini est compté, avec ou sans regard confirmé. Une réponse (ou un outil) n'est permise
  // que si, depuis sa dernière réponse, une phrase a été dite pendant qu'on le regardait — ou par un geste sûr (toucher,
  // bouton Oui/Non), ou pour finir une demande déjà permise (recherche, CRM, réponse tardive).
  get _verrouRegard() { return this._gazeMode && !this._byName && !this.car && !this.continuous && !this._voitureBt; }
  // Accord de Timothée du 03/11/26 : « uniquement quand je suis sur le téléphone, et quand il est branché à Android Auto ».
  // Téléphone relié à la voiture (un micro Bluetooth est là) : pas besoin de le regarder (il conduit) ; il se réveille quand
  // on dit « Wilson » (oreille du téléphone, confirmée par Gemini), répond sans regard, et se rendort après 45 s sans lui
  // parler. Ni la tablette, ni le téléphone hors de la voiture ne changent : là, la règle R1 (le regard) reste entière.
  get _voitureBt() {
    if (deviceName() !== 'téléphone' || !this.audio) return false;
    const now = performance.now();
    if (appli() && (this._btAppliAt == null || now - this._btAppliAt > 2000)) { this._btAppliAt = now;   // (dès le 1er appel : performance.now() part de 0 au chargement)
      this._btAppli = !!pont('bluetoothVoiture'); }   // A4, toutes les 2 s
    if (this.audio.btIn || this._btAppli) { this._btVuAt = now; return true; }
    return !!this._btVuAt && now - this._btVuAt < (this._voitureGraceMs ?? VOITURE_QUITTE_MS);   // 05/11/26 : pas de bascule sur un trou du Bluetooth
  }
  // Protocole voiture actif (PLAN 2 quinquies) : téléphone relié à la voiture, cerveau direct.
  get _protocole() { return this._voitureBt && this.mode === 'live'; }
  // En voiture, quelle que soit la façon (téléphone relié à la voiture, ou l'ancien mode voiture gardé en sommeil).
  // Journal du 05/11/26, 11h03-11h08 : depuis la 1.26.0, le téléphone relié à la voiture n'allumait que `_voitureBt` ;
  // tout ce qui testait `this.car` (consigne « En voiture » : réponses courtes, son mauvais → faire confirmer ; 3 min
  // d'essais sans réseau ; « je me mets en veille » dit à voix haute) restait éteint : Gemini se croyait sur la tablette du salon.
  get enVoiture() { return !!this.car || this._voitureBt; }
  // L'oreille (« Wilson ») : seulement à la maison, et seulement si la case « prenomMaison » est cochée (01/11/26) ; jamais
  // sur le téléphone relié à la voiture (remarque du 05/11/26, 14h48 : réveil au toucher).
  get _oreilleMaison() { return !!this.settings.prenomMaison && !this._voitureBt && !!(this.oreille && this.oreille.ready); }
  _noteVoix(now = performance.now()) {
    if (now - this.audio.lastVoicedAt >= 60) return;
    let S = this._seg;
    if (!S || now - S.last > SEG_GAP_MS) { S = this._seg = { start: now, last: now, n: 0, vu: 0 }; (this._segs = this._segs || []).push(S); if (this._segs.length > 12) this._segs.shift(); }
    S.last = now; S.n++; if (this._gazing(now)) S.vu++;
  }
  _permettre(ms, pourquoi) { const now = performance.now(); this._permisJusqua = Math.max(this._permisJusqua || 0, now + ms); this._permisPour = pourquoi; this._permisDepuis = now; }
  // Depuis quand ses phrases comptent : depuis la fin de sa dernière réponse (sinon depuis le début de la discussion).
  _depuisReponse() { return Math.max(this.playEndAt || 0, this._lastTurnAt || 0, this._convAt0 || 0) - 400; }
  _phraseRegardee(now = performance.now()) {
    const t = this._depuisReponse();
    return (this._segs || []).some((S) => S.last >= t && S.vu >= SEG_VU_MIN);
  }
  _reponsePermise(now = performance.now()) {
    if (!this._verrouRegard) return true;
    if (now < (this._permisJusqua || 0)) return true;
    // tablette, discussion engagée en le regardant : il a détourné les yeux depuis moins de 30 s (remarque du 19/11/26, 08h44)
    const v = this.vision, G = this._graceRegard();
    if (G > LOOK_GRACE_MS && !this.paused && v && now - (v.sureAt || 0) < G) return true;
    return this._phraseRegardee(now);
  }
  // Pour le journal : ce que la caméra voyait (combien de visages, regard confirmé ou non, dernières phrases).
  _etatRegard(now = performance.now()) {
    const v = this.vision; if (!v) return 'caméra coupée';
    const g = v.gaze, t = this._depuisReponse(), segs = (this._segs || []).filter((S) => S.last >= t);
    const voix = segs.reduce((a, S) => a + S.n, 0) * 0.02, vu = segs.reduce((a, S) => a + S.vu, 0) * 0.02;
    return `${v.faces || 0} visage(s), regard confirmé ${v.looking ? 'oui' : v.sureAt ? `il y a ${((now - v.sureAt) / 1000).toFixed(1)} s` : 'jamais'}`
      + `${g ? `, tête ${Math.round(g.gazeYaw)}°/${Math.round(g.pitch)}°, paupières ${Math.round(g.blink * 100)} %` : ''}, voix ${voix.toFixed(1)} s dont ${vu.toFixed(1)} s en le regardant`;
  }

  // En veille : quelqu'un parle en regardant Wilson → la conversation démarre avec le début de sa phrase.
  _watchFrame() {
    const now = performance.now();
    if (this.settingsOpen || now - this.playEndAt < ECO_TAIL_MS) return;
    if (this.audio.speaking && now - this.audio.lastVoicedAt < 60 && this._addressed(now)) this.startConversation('regard');
  }

  // Ancien déclencheur (mot « Wilson ») : gardé pour les tests et le bouton « Faire parler Wilson ».
  _onWakeWord(w) {
    this.log(`Entendu « Wilson » ${w.conf ? '(confiance ' + w.conf.toFixed(2) + ')' : '(à la volée)'}`);
    if (this.settingsOpen) return;
    this.startConversation('prenom');
  }

  // Journal du 18/11/26 (09h21:56, 09h23:09, 09h26:03, 09h27:59) : la discussion s'ouvrait au regard 1 à 3 s avant que son
  // visage soit reconnu ; la consigne de Gemini, écrite à l'ouverture, disait alors « tu ne sais pas encore qui te regarde » :
  // « Désolé, je ne te reconnais pas encore. Tu peux me dire ton prénom ? » (09h22:09), et la question de Claude, réservée à
  // Timothée reconnu, n'était jamais dans la consigne. À la maison, quand la reconnaissance tourne et que le visage vu n'est
  // pas encore sûr, on l'attend 2 s au plus avant d'ouvrir (ce qu'il dit pendant ce temps est gardé et envoyé ensuite).
  _attendreVisage(max = VISAGE_ATTENTE_MS) {
    const Q = this.qui, v = this.vision, ok = (A) => !!(A && (A.sur || A.inconnu));
    if (this._voitureBt || (this.famille && this.famille.telephone) || !Q || !Q.on || !Q.ready || !v || !v.faces || ok(Q.qui())) return Promise.resolve(null);
    const t0 = performance.now();
    return new Promise((fin) => {
      const iv = setInterval(() => {
        const A = Q.qui(), ms = Math.round(performance.now() - t0);
        if (!ok(A) && ms < max && this.state === 'eveil' && v.faces) return;
        clearInterval(iv);
        this.log(`Visages : ${A && A.sur ? `${A.nom} reconnu` : A && A.inconnu ? 'visage inconnu' : 'pas encore reconnu'} ${ms} ms après le regard, avant d'ouvrir la discussion`);
        fin(A);
      }, 100);
    });
  }

  // opts.handle : reprendre une session de Gemini (même fil), après un appel ou une coupure de réseau.
  async startConversation(reason, opts = {}) {
    if (this.outils && this.outils.sonne) this.outils._arreterSonnerie();
    if (this.state === 'eveil' || this.state === 'conversation') return;
    if (this.phone) { if (reason === 'toucher') this.badge('Appel en cours : je ne t\'entends pas pendant l\'appel', 5000); return; }
    if (reason === 'message' && (!navigator.onLine || !this.settings.apiKey)) return;   // un message à remettre attendra (7 sexies, M3)
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    if (!navigator.onLine) {
      // Sans réseau (C8) : il le dit (voix du téléphone, sans Internet), et la phrase qui l'a réveillé part au retour du réseau.
      this.face.setEmotion('confus', 3000); this.badge("Pas d'Internet : je te réponds dès qu'il revient", 6000);
      const pcm = this._wakePcm || (reason === 'prenom' ? this.audio.recent(4000) : null); this._wakePcm = null;
      if (this.enVoiture || ['prenom', 'toucher', 'apres_appel', 'apres_appel_entrant', 'reponse_tardive'].includes(reason)) this._netLost('hors ligne au réveil', { start: { reason, pcm, handle: opts.handle } });
      return;
    }
    this._convDebut = Date.now();   // 7 septies : début de la discussion, pour la passe de mémoire
    // Quel cerveau ? Direct (Gemini Live) si possible, sinon mode économique (Gemini Flash + voix de la tablette).
    const now = Date.now(), want = this.settings.brainMode || 'auto';
    const liveBlocked = this.quotaUntil && now < this.quotaUntil, ecoBlocked = this.ecoQuotaUntil && now < this.ecoQuotaUntil;
    const mode = want === 'eco' ? 'eco' : want === 'live' ? 'live' : (liveBlocked ? 'eco' : 'live');
    // Message de la famille (M3) sans voix naturelle : la voix de la tablette le lit, sans dépenser de requête.
    if (reason === 'message' && (mode === 'eco' || (mode === 'live' && liveBlocked))) {
      if (this.famille.remise) this.famille.remise.lu = performance.now() + 2000;
      this.face.setEmotion('joie', 2500, 0.7); this._say(this._messageSay || ''); return;
    }
    if ((mode === 'live' && liveBlocked) || (mode === 'eco' && ecoBlocked)) {         // quota épuisé : on ne gaspille pas d'essais
      this.face.setEmotion('gene', 3000); this.face.play('shake');
      this.badge((mode === 'eco' ? this.ecoQuotaMsg : this.quotaMsg) + ' (appui long sur moi → « Vérifier » pour réessayer)', 9000, true); return;
    }
    this.setState('eveil'); this.convId = (this.convId || 0) + 1; const myConv = this.convId;
    if (mode === 'eco') warmUp(this.settings.apiKey);
    const preroll = this._wakePcm ? [this._wakePcm] : reason === 'prenom' ? [this.audio.recent(4000)] : reason === 'regard' ? [this.audio.recent(PREROLL_MS)] : [];
    this._wakePcm = null;
    // Mode voiture : la 1re phrase doit contenir « Wilson » (transcription de Gemini) ; sinon il se tait et se rendort (C6).
    this._gate = this.car && reason === 'prenom' ? { ok: false, buf: [], until: performance.now() + NAME_GATE_MS } : null;   // maison : le prénom est déjà vérifié par Gemini
    this._byName = reason === 'prenom' && !this.car;                    // E3 : ouverte par le prénom → pas besoin de le regarder
    // R1 (01/11/26) : la phrase qui ouvre la discussion au regard a été dite avec le regard confirmé (_addressed) ; le toucher et
    // les réveils pour une réponse attendue sont des demandes sûres.
    this._segs = []; this._seg = null; this._permisJusqua = 0; this._convAt0 = performance.now();
    if (reason === 'regard') { this._seg = { start: performance.now(), last: performance.now(), n: SEG_VU_MIN, vu: SEG_VU_MIN }; this._segs.push(this._seg);
      const L = this.vision && this.vision.lookInfo;
      this.log(`Regard confirmé : ${L ? `${L.faces} visage(s), taille ${L.size}, tête ${L.yaw}°/${L.pitch}°, paupières ${Math.round(L.blink * 100)} %, ${L.n} analyses en ${L.ms} ms${L.force ? ' (simulé)' : ''}` : 'détails indisponibles'}`); }
    if (['toucher', 'test', 'apres_appel', 'apres_appel_entrant', 'reponse_tardive', 'message'].includes(reason)) this._permettre(30000, reason);
    if (mode === 'eco') return this._startEco(reason, preroll);
    this.mode = 'live';
    this.pending = preroll;
    this.discard = false; this.endAfterSpeech = false; this.brain.handle = opts.handle || null;
    this.lastActivity = performance.now();
    if (reason === 'regard' && !opts.handle) {
      await this._attendreVisage();
      if (this.convId !== myConv || this.state !== 'eveil') return;    // arrêtée pendant l'attente (appel…)
    }
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), interrupts: this.settings.bargeIn === 'directe', extra: this._extraTools(), garder: this._voitureBt ? OUTILS_VOITURE : null });
    } catch (e) {
      if (this.convId !== myConv) return;                              // arrêtée entre-temps (appel…)
      this.log('Gemini : ' + e.message);
      this.lastError = e.message;
      if (isNetErr(e) && (this.enVoiture || ['prenom', 'toucher', 'apres_appel', 'apres_appel_entrant', 'reponse_tardive'].includes(reason))) {
        // Réseau trop faible pour joindre Google (C8) : même chose que hors ligne, la phrase est gardée (8 s au plus).
        const pcm = (this.pending || []).length ? concat(this.pending).slice(0, 16000 * 8) : null;
        this.mode = null; this.pending = null; this.setState('veille');
        this._netLost('Google injoignable au réveil', { start: { reason, pcm, handle: opts.handle } });
        return;
      }
      if (e.quota) this._quotaPause(e.message);
      if (e.quota && want === 'auto' && !(this.ecoQuotaUntil && Date.now() < this.ecoQuotaUntil)) {
        this.log('Direct refusé (quota) → mode économique');
        this.badge('Mode économique : je réfléchis avec Gemini Flash', 5000);
        return this._startEco(reason, this.pending || []);           // la phrase déjà enregistrée n'est pas perdue
      }
      this.face.setEmotion('confus', 4000);
      this.badge(e.auth ? 'Google refuse ma clé — appui long sur moi, puis « Vérifier la clé »'
        : e.quota ? this.quotaMsg
        : `Je n'arrive pas à joindre mon cerveau : ${shorten(e.message)}`, 15000, true);
      this.mode = null; this.setState('veille'); return;
    }
    if (this.convId !== myConv || this.state !== 'eveil') { this.brain.close(); return; }   // arrêtée pendant la connexion (appel…)
    this.log(`Conversation ouverte (${reason})`);
    this.setState('conversation');
    // Envoi du tampon (la phrase avec « Wilson ») puis passage au direct.
    const all = this.pending; this.pending = null;
    const flat = concat(all);
    for (let i = 0; i < flat.length; i += 3200) this.brain.sendAudio(flat.subarray(i, i + 3200));
    this._derniereReponse = null; this._doublon = null;      // nouvelle discussion : rien à comparer
    if (reason === 'test') this.brain.sendText('Présente-toi en une phrase, avec chaleur.');
    // Journal du 12/11/26, 08h26:10 : « la voiture a refusé » est arrivé 3 s après la fin de la discussion ; dit à voix haute
    // alors que personne ne le regardait (R1), incompris (« Tu dis quoi là ? », 08h26:43), et Gemini ne le savait pas
    // (« Concernant la voiture, tu disais quoi ? », 08h27:28). Gardé, il passe en premier à la discussion suivante.
    const NV = this._nouvelleVoiture; this._nouvelleVoiture = null;
    const dejaRemise = NV && NV.msgId && (this.famille.msgs || []).some((m) => m.id === NV.msgId && m.remis);   // dite par un autre appareil
    const nouvelleVoiture = NV && !dejaRemise && reason !== 'test' && Date.now() - NV.at < 15 * 60000 ? NV : null;
    if (nouvelleVoiture) {
      this._nvEnvoi = { ...nouvelleVoiture, conv: this.convId };   // 1.43.0 : gardée tant qu'elle n'est pas vraiment dite
      const min = Math.max(1, Math.round((Date.now() - nouvelleVoiture.at) / 60000));
      this.brain.sendText(`[Nouvelles de la voiture, arrivées il y a ${min} min, pendant que personne ne te regardait : ${nouvelleVoiture.phrase} Dis-le-lui d'abord, en une phrase, sans rien ajouter.]`);
      this.log('Voiture : nouvelle gardée, donnée au début de la discussion', true);
    }
    const PA = reason === 'toucher' && this.enVoiture && !this._aDire && !nouvelleVoiture ? this._propAppelGardee() : null;
    if (reason === 'toucher' && !this._aDire && !nouvelleVoiture) this.brain.sendText(PA ? this._propAppelTexte(PA) : this.enVoiture ? '[Timothée vient de toucher l\'écran pour te parler : dis seulement « Oui ? » et écoute.]' : "[Quelqu'un vient de toucher ton visage sur l'écran pour te parler. Salue-le très brièvement et écoute.]");
    if (reason === 'apres_appel') { this.brain.sendText(this._apresAppelTexte()); this._propAppelNote(reason); }
    if (reason === 'apres_appel_entrant') { this.brain.sendText(this._apresAppelEntrantTexte()); this._propAppelNote(reason); }
    if (reason === 'reponse_tardive' && !this._aDireEnvoyer() && this._lateText) this.brain.sendText(this._lateText);
    if (reason === 'message' && this._messageText) { this.brain.sendText(this._messageText); this._messageText = null; }
    if (reason === 'prenom' && this._wakeText) {
      // Une réponse du CRM attend encore (journal du 05/11/26, 11h05:13 : « Bon ben j'attends la réponse, Wilson ») :
      // elle passe d'abord, avec ce qu'il vient de dire.
      if (!(this._aDire && this._aDireEnvoyer(this._wakeDemande || ''))) this.brain.sendText(this._wakeText);
      // Journal du 04/11/26, 11h49:54 (voiture) : réveillé avec sa demande, Gemini n'a rien dit et rien ne l'a relancé.
      this._demandeTexte = { texte: this._wakeDemande || '', at: performance.now(), conv: this.convId, vu: false };
      if (this._wakeDemande) this._noteHeard(this._wakeDemande, true);         // pour le garde-fou des outils (nom du client dit)
    } else if (this._aDire && !['reponse_tardive', 'message', 'test', 'prenom'].includes(reason)) this._aDireEnvoyer();
    this._wakeText = null;
    if (this.netWait && this.netWait.start) this._netBack();          // réveillé sans réseau : c'est reparti
    this.lastActivity = performance.now();
  }

  endConversation(why) {
    if (this.state !== 'conversation' && this.state !== 'eveil') return;
    if (this.netWait && !this.netWait.start) { clearTimeout(this.netWait.timer); this.netWait = null; }
    const depuis = (t) => (t ? `${Math.round((performance.now() - t) / 1000)} s` : '—');
    { // 7 septies : la passe de mémoire relit la discussion 15 s après (en arrière-plan) ; les questions de Claude posées sont notées tout de suite
      const t0 = this._convDebut || 0, t1 = Date.now(), qs = this.questions.poseesSansReponse(this.convId); this._convDebut = 0;
      // 18/11/26 : question de Claude pas finie, ou dite à l'instant sans un mot de Timothée après → reposée à la discussion suivante.
      this.questions.finDiscussion({ joue: !!(this.audio.playing || this.voice.speaking), entenduIlYa: this._heardAt ? performance.now() - this._heardAt : Infinity });
      if (t0 && why !== 'essai de voix') setTimeout(() => this._passeMemoire(t0, t1, qs), 15000);
    }
    this.log(`Fin de conversation (${why}) — dernière parole de Wilson il y a ${depuis(this.playEndAt)}, de Timothée il y a ${depuis(this._heardAt)}${this._voitureBt ? ', en voiture' : ''}`); this._byName = false; this.convId++; this.endAfterSpeech = false; this._liveTurn = null; this.paused = false; this._searchMs = 0; this._vv = null; this._vvHerite = null;
    this._nvSuivi('');   // 1.43.0 : nouvelle de la voiture pas encore dite → gardée pour la suivante
    { const PA = this._propAppel;                                       // 24/11/26 : proposition d'après l'appel pas encore dite → gardée
      if (PA && PA.conv === this.convId - 1) { PA.conv = null; PA.at = Date.now(); this.log(`Proposition d'après l'appel${PA.call && PA.call.nom ? ' (' + PA.call.nom + ')' : ''} pas encore dite : gardée pour la discussion suivante`); } }
    // Une réponse du CRM envoyée mais pas encore dite (journal du 05/11/26, 11h04:22) : elle reste à dire ; en voiture, il
    // se réveille pour la dire (C11 bis), sauf si on l'a fait taire au volant (elle passera à la prochaine discussion).
    const P = this._aDire;
    if (P && P.conv === this.convId - 1) {
      P.conv = null; this.log(`Réponse à « ${P.question.slice(0, 60)} » pas encore dite : gardée pour la dire`);
      if (this.enVoiture && why !== 'volant' && why !== 'essai de voix') setTimeout(() => { if (this._aDire === P && this.state === 'veille' && !this.phone && !document.hidden) this.startConversation('reponse_tardive'); }, 2500);
    }
    // Les outils du CRM vont au bout (une préparation affiche sa carte « Oui / Non ») ; les recherches s'arrêtent.
    if (this._searches) { for (const c of this._searches.values()) if (!c.crm) c.abort(); this._searches.clear(); }
    if (this._voitureBt && why !== 'essai de voix' && why !== 'volant') { try { this.audio.tone('dodo'); } catch (_) {} }   // en voiture : il entend qu'il se rendort
    this.brain.close(); this.audio.flush(); this.voice.cancel(); this.outBuf = []; this.outLen = 0;
    if (this.ecoState) this.ecoState.queue = []; this.ecoState = null; this.mode = null;
    this.face.setTalk(0); this.face.setListen(-1); this.face.clearEmotion();
    $('subtitle').textContent = '';
    if (this.continuous && why !== 'mode') { setTimeout(() => this.startConversation('continu'), 1500); }
    this.setState('veille');
  }

  // ---------- son ----------
  _wireAudio() {
    this.audio.on('info', (m) => this.log('Audio : ' + m));
    this.audio.on('mic', ({ taken, why }) => (taken ? this._phoneStart(why) : this._phoneEnd(why)));
    this.audio.on('frame', (f32, i16, db) => {
      this._capAt = performance.now();                                           // le micro arrive (garde « sourd », 04/11/26)
      this.reactions.son(db, this.audio.floor);                                  // sursaut sur un bruit fort (7 sexies, Q)
      this.famille.feed(f32);                                                    // oreille de garde, pendant la garde seulement (G2)
      if (this._earTest) this.oreille.feed(f32, this.audio.speaking);              // réglages : « Tester l'oreille »
      if (this.state === 'veille' || this.state === 'dodo') {
        if (this.car) {                                                         // voiture : réveil au nom, pas au regard
          if (!this.settingsOpen && !this.speaking && performance.now() - this.playEndAt > 800) this.oreille.feed(f32, this.audio.speaking);
          return;
        }
        // Remarque de Timothée du 05/11/26, 14h48 (« quand je suis en voiture, supprimer la détection de son ; Timothée me
        // réveillera en touchant l'écran, on discutera, puis je me rendormirai ») : téléphone relié à la voiture → ni oreille
        // (« Wilson »), ni regard ; seulement le toucher (et lui-même, pour dire une réponse du CRM qui attend, C11 bis).
        if (this._voitureBt) return;
        // E3 : à la maison, personne ne le regarde (canapé…) : l'oreille guette « Wilson » ; le regard reste le plus rapide.
        // Accord de Timothée du 01/11/26 : par défaut, à la maison, seulement au regard (réglage « prenomMaison »).
        if (this._oreilleMaison && !this.settingsOpen && !this.speaking && performance.now() - this.playEndAt > 800 && !this._gazing()) this.oreille.feed(f32, this.audio.speaking);
        this._watchFrame(); return;
      }
      if (this.state === 'eveil') { if (this.pending) { this.pending.push(i16); this._noteVoix(); } return; }
      if (this.state === 'conversation' && this.mode === 'eco') {
        // Pendant qu'il parle, le micro entend sa propre voix : on n'enregistre rien, on guette seulement
        // « stop », « chut », « arrête » avec l'oreille locale (et la voix forte si « coupure directe » est choisie).
        if (this.voice.speaking) { if (this.settings.bargeIn === 'directe') this._bargeCheck(db); }
        else this._ecoFrame(i16);
        return;
      }
      if (this.state === 'conversation' && this.paused && !this.car && this._oreilleMaison && !this.speaking && performance.now() - this.playEndAt > 800) this.oreille.feed(f32, this.audio.speaking);
      if (this.state !== 'conversation' || !this.brain.open) return;
      const now = performance.now();
      if (this.voice.speaking) return;                                 // sa voix de secours (réseau…) ne part pas vers Gemini
      if (this.settings.bargeIn === 'prudente') {
        // Il parle : rien n'est envoyé (le micro, sans annulation d'écho, entend sa voix) ; on le coupe en touchant l'écran (R4).
        // Y compris pendant un petit trou entre deux morceaux de sa réponse : sinon l'écho de sa voix lui coupait la parole (24/10/26).
        if (this.audio.playing || (this._modelTalking && now - this._modelTalking < TURN_GATE_MS)) return;
        if (now - this.playEndAt < (this.audio.aec ? TAIL_MS : TAIL_NOAEC_MS)) return;
      }
      if (this.paused) return;                                         // plus regardé : rien ne part (R3, R9)
      if (now < (this._micRetenuJusqua || 0)) return;                  // fin de phrase forcée : Google traite ce qu'il a entendu
      if (now < (this.audio.toneJusqua || 0)) return;                  // son de réflexion : Google ne doit pas le prendre pour une voix
      if (now - this.audio.lastVoicedAt < 60 && !this.audio.playing) this.lastUserVoice = now;   // la personne parle (base du délai)
      this._noteVoix(now);                                             // R1 : dite en le regardant, ou pas
      this.outBuf.push(i16); this.outLen += i16.length;
      if (this.outLen >= 1600) { this.brain.sendAudio(concat(this.outBuf)); this.outBuf = []; this.outLen = 0; }
    });
    this.audio.on('speechstart', () => {
      const now = performance.now(); this._speechStartAt = now;
      if (this.state === 'conversation') { if (this.mode === 'live') this.lastUserSpeech = this.lastActivity = now; return; }
      this.presenceAt = now;                                   // quelqu'un parle dans la pièce
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('tilt'); }
    });
    this.audio.on('speechend', () => {
      this._speechEndAt = performance.now() - 440;            // la détection attend 22 blocs de 20 ms de silence
      if (this.state === 'conversation' && this.mode === 'live') this.lastUserSpeech = this.lastActivity = performance.now();
      this._netKeepPhrase();
    });
    this.audio.on('drained', () => {
      this.playEndAt = performance.now(); this.lastActivity = this.playEndAt; this.face.setTalk(0);
      if (this.questions) this.questions.finiDeParler();      // question de Claude dite jusqu'au bout (18/11/26)
      if (this.endAfterSpeech) { this.endAfterSpeech = false; const id = this.convId; setTimeout(() => id === this.convId && this.endConversation('au revoir'), 700); }
    });
  }

  // R4 : quelqu'un parle par-dessus Wilson → silence immédiat.
  _bargeCheck(db) {
    const b = this.barge;
    const thr = Math.max(-46, b.echo + 10);
    if (db > thr) b.n++; else { b.n = Math.max(0, b.n - 1); b.echo = b.echo * 0.97 + db * 0.03; }
    if (b.n >= 8) { b.n = 0; this.interrupt('voix'); }
  }

  interrupt(why) {
    const live = this.audio.playing, tts = this.voice.speaking;
    if (!live && !tts) return;
    this.log(`Coupé (${why})`);
    this.questions.coupe(why);                           // question de Claude pas finie : reposée plus tard (18/11/26)
    this.playEndAt = -1e9; this.face.setTalk(0);
    this.face.setEmotion('ecoute', 2500); this.face.play('startle');
    if (live) {
      this.audio.flush(); this.discard = true;
      if (this.brain.open) this.brain.sendAudio(this.audio.recent(700));     // le début de la phrase part tout de suite
    }
    if (tts) {
      this._cutAt = performance.now();                                   // pas d'enregistrement de l'audio passé : il contient sa voix
      this.voice.cancel();
      this.playEndAt = this._cutAt - (ECO_TAIL_MS - 300);
    }
    this.lastActivity = this.lastUserSpeech = performance.now();
  }

  // ---------- cerveau ----------
  _wireBrain() {
    const b = this.brain;
    // Journal plus complet (demande de Timothée du 04/11/26, 11h53 : « des bugs se passent et ne sont pas relevés ») :
    // chaque résultat d'outil rendu à Gemini et chaque consigne que l'appli lui glisse sont écrits au journal.
    const respond0 = b.respond.bind(b), sendText0 = b.sendText.bind(b);
    b.respond = (rs) => {
      for (const r of rs || []) {
        if (r.name === 'exprimer_emotion') continue;
        const txt = typeof r.response?.result === 'string' ? r.response.result : JSON.stringify(r.response || {});
        this.log(`Outil ${r.name} → Gemini : « ${txt.replace(/\s+/g, ' ').slice(0, 600)} »${r.scheduling ? ` (${r.scheduling})` : ''}`, true);
        this._noteChiffres(txt);                                                   // chiffres qui ont une source (garde du 05/11/26)
        if (!/ne correspond pas à ce que tu as entendu|Personne ne te regardait/.test(txt)) this._noteSource(txt);   // noms qui ont une source (protocole voiture)
      }
      if ((rs || []).some((r) => r.name !== 'exprimer_emotion')) this._vvFonde(`le résultat de ${(rs || []).map((r) => r.name).join(', ')}`);
      respond0(rs);
      // Chien de garde (journal du 04/11/26, 11h50:59 et 11h51:37) : sur Gemini 3.1, après l'outil « remarque », il n'a plus
      // rien dit jusqu'à ce que Timothée le rappelle. S'il reste muet 5 s après un résultat, relance une fois.
      // Jamais après une recherche lancée en arrière-plan (journal du 05/11/26, 11h05:51) : il avait déjà dit « je cherche,
      // je te tiens au courant » et devait se taire ; « tu as le résultat de ton outil, réponds » l'a poussé à inventer
      // « 120 clients actifs », puis « 135 », alors que l'analyste n'avait encore rien trouvé.
      const muet = (rs || []).every((r) => r.name === 'exprimer_emotion' || /ne dis rien|ne redis rien|ne fais rien/i.test(JSON.stringify(r.response || {})));
      const fond = (rs || []).some((r) => /arrière-plan/i.test(String((r.response && r.response.result) || '')));
      // Journal du 05/11/26, 14h40:22 et 14h41:09 : il avait déjà dit « C'est noté… » (et sa réponse) AVANT le résultat de
      // remarque ; « muet après le résultat » → relance → « C'est noté. Merci ! » de trop. Outil qui n'apporte rien à dire
      // (remarque, retenir, oublier) et plus d'une seconde de voix déjà dite dans ce tour : pas de relance.
      const rien = (rs || []).every((r) => ['remarque', 'memoriser', 'oublier', 'terminer_conversation', 'exprimer_emotion'].includes(r.name));
      const dejaDit = rien && this._liveTurn && this._liveTurn.sec >= 1;
      if (dejaDit) this.log(`Résultat de ${(rs || []).map((r) => r.name).join(', ')} : il a déjà répondu dans ce tour, pas de relance`);
      if (!muet && !fond && !dejaDit) this._apresOutil = { at: performance.now(), conv: this.convId, turnN: this._turnN, noms: (rs || []).map((r) => r.name).join(', ') };
    };
    b.sendText = (t) => {
      this.log(`Consigne à Gemini : « ${String(t).replace(/\s+/g, ' ').slice(0, 400)} »`, true); this._noteChiffres(t);
      // Protocole voiture : un résultat donné en message (analyste, outil fini après coup) ou une phrase dictée par l'appli
      // peut être dit ; une simple relance (« réponds-lui ») ne lève pas le verrou.
      if (RE_CONSIGNE_FONDEE.test(String(t))) { if (!/^\[ATTENTION/.test(String(t))) this._noteSource(t); this._vvFonde('un résultat donné en message'); }
      sendText0(t);
    };
    b.on('audio', (i16, rate) => this._liveAudio(i16, rate));
    this._liveAudio = (i16, rate) => {
      if (this.discard || this.state !== 'conversation') return;
      // R1 (règle de Timothée du 01/11/26) : il ne parle que s'il est sûr qu'on le regardait en lui parlant.
      if (this._retenu === this._turnN || this._doublon === this._turnN) return;
      if (!this._liveTurn && !this.audio.playing && !this._reponsePermise()) {
        this._retenu = this._turnN; this._nRetenues = (this._nRetenues || 0) + 1;
        this.log(`Réponse retenue : personne ne me regardait vraiment pendant la phrase (${this._etatRegard()})`);
        return;
      }
      if (this._protocole) {                                              // verrou de vérité (protocole voiture)
        const vv = this._vvTour();
        if (vv.hold && !vv.outil) { vv.held.push([i16, rate]); return; }
      }
      if (this.voice.speaking) { this.voice.cancel(); this.log('Voix du téléphone coupée : Wilson parle (une seule voix à la fois)'); }
      const G = this._gate;
      if (G && !G.ok) {
        if (performance.now() < G.until) { G.buf.push([i16, rate]); return; }   // réponse retenue : le nom n'est pas encore vérifié
        if (!this.car) { this.log('Pas de transcription du prénom à temps : je me tais et je me rendors', true); this._gate = null; this.endConversation('pas mon nom'); return; }
        this._gateOpen('pas de transcription à temps');
      }
      if (!this.audio.playing) { this.barge.n = 0; this.barge.echo = Math.max(-60, this.audio.db); }
      this._modelOut = (this._modelOut || 0) + 1; this._modelTalking = performance.now();
      if (!this._liveTurn) {
        // 1er son de la réponse : délai depuis la fin de la phrase de la personne (R8). Noté à la fin du tour, s'il a parlé.
        // Si Wilson enchaîne (suite de sa réponse, après une recherche…), ce n'est pas une nouvelle attente : pas de délai.
        const now = performance.now(), e = this._speechEndAt || 0, h = this._heardAt || 0, after = Math.max(this.playEndAt || 0, this._lastTurnAt || 0);
        // Fin de phrase détectée sur la tablette ; à défaut (bruit continu, dehors…), dernier mot transcrit par Google.
        // (20/11/26 : « le réseau est lent » dit par le téléphone pendant l'attente ne remet pas le délai à « ? »)
        const L = this._lent, hl = L && L.conv === this.convId && L.tour === this._turnN && L.heardAt > (this._lastTurnAt || 0) ? L.heardAt : 0;
        const end = e > after && !this.audio.speaking ? e : h > after ? h : hl;
        // (plus de 60 s : ce n'était pas une attente, mais une phrase bien plus ancienne — « 90,7 s » après un essai de voix, 04/11/26)
        const dl = end && end > (this._convAt || 0) - 15000 ? Math.round((now - end) / 100) / 10 : null;   // « 34,1 s » après un toucher (04/11/26, 11h37)
        this._liveTurn = { t: now, sec: 0, delay: dl != null && dl <= 60 ? dl : null, search: this._searchMs || 0 };
        this._searchMs = 0; this._tourPermis = this._turnN;            // ce tour a eu le droit de parler (R1) : son outil aussi
      }
      this._apresOutil = null; this._voixDepuis = performance.now();
      // Question de trop repérée dans le texte (16/11/26) : le son suivant est mis de côté, joué jusqu'à la coupe seulement.
      if (this._tropTour === this._turnN) { if (this._trop && this._trop.tour === this._turnN) this._tropGarder(i16, rate); return; }
      this._liveTurn.sec += i16.length / (rate || 24000);
      this.audio.play(i16, rate); this.lastActivity = performance.now();
    };
    b.on('interrupted', () => {
      const ours = this.discard;                         // c'est nous qui l'avons coupé (toucher) : déjà silencieux
      this.discard = false; this._modelTalking = 0;
      if (!ours && this.settings.bargeIn !== 'directe') {
        // Coupure prudente : Google signale parfois une interruption (outil de recherche, relance…) alors que personne ne
        // parle. Ce qui est déjà reçu est joué jusqu'au bout : plus de phrases tronquées (journal du 24/10/26).
        if (this._liveTurn && this._liveTurn.sec > 0.3) this.log(`Google a interrompu sa réponse après ${this._liveTurn.sec.toFixed(1)} s : la fin déjà reçue est jouée`);
        return;
      }
      if (this._liveTurn && this._liveTurn.sec > 0.3 && !ours) this.log(`Coupé par Google après ${this._liveTurn.sec.toFixed(1)} s de réponse (il a cru entendre parler)`);
      if (!ours) this.questions.coupe('Google');         // question de Claude pas finie : reposée plus tard (18/11/26)
      this.audio.flush(); this.face.setTalk(0); this._liveTurn = null;
    });
    b.on('turn', ({ user, wilson }) => {
      // Ce tour a appelé un outil : sa réponse vient avec le résultat… sauf si le résultat est déjà rendu et que Timothée a
      // reparlé après (journal du 05/11/26, 14h48:25 : remarque notée à 14h48:05, puis « visiblement on va pas y arriver… »
      // resté sans réponse : « Wilson attend le résultat de son outil », alors qu'il n'attendait plus rien).
      const outilEnCours = this._outilsEnCours > 0 || !!(this._searches && this._searches.size);
      const hadTool = this._toolTurn === this._turnN && (outilEnCours || !((this._heardAt || 0) > (this._outilRepAt || 0) + 300 && user));
      if (this._trop && this._trop.tour === this._turnN && !this._trop.fini) this._tropFin('tour fini');   // question de trop : coupe placée (16/11/26)
      this._turnN++;                                     // ce qui sera entendu ensuite appartient au tour suivant
      if (this._gate && !this._gate.ok) {
        if (!user || nomDit(user)) this._gateOpen(user ? 'nom dans la transcription' : 'pas de transcription');
        else { this.log(`Pas mon nom dans « ${user.slice(0, 100)} » : je me tais et je me rendors`, true); this._gate = null; this.endConversation('pas mon nom'); return; }
      }
      this.discard = false; this._modelOut = (this._modelOut || 0) + 1; this._modelTalking = 0;
      // Réponse coupée par Google (« […] » ajouté par brain.js) : elle n'est pas finie (journal du 19/11/26, 16h08:41).
      const coupee = /\[…\]\s*$/.test(String(wilson || ''));
      wilson = cleanSpeech(wilson);
      this._emoTour = null;
      // Protocole voiture : verrou de vérité (réponse sans outil jamais dite, nom inventé corrigé).
      const vv = this._protocole && this._vv && this._vv.n === this._turnN - 1 ? this._vv : null;
      if (vv && this._vvFin(vv, user, wilson) === 'jete') {
        this._liveTurn = null;
        if (user) { this.log(`Entendu : « ${user.slice(0, 600)} »`, true); (this._entendus = this._entendus || []).push(user); this._entendus.splice(0, this._entendus.length - 6); this._parleDepuis = true; }
        if (user) this.memory.addExchange(user, '', this.famille._parle());
        $('subtitle').textContent = '';
        return;
      }
      if (this._doublon === this._turnN - 1) {
        // Réponse identique à la précédente, sans que personne ait parlé entre les deux : coupée (journal du 04/11/26).
        const did = this._didascalie === this._turnN - 1;
        this._doublon = null; this._didascalie = null; this._liveTurn = null; this._modelTalking = 0;
        this.log(did ? (VP.ditPasPourMoi(wilson) && !VP.estDidascalie(wilson) ? `« Ce n'est pas pour moi » coupé (il se tait vraiment, sans le dire) : « ${wilson.slice(0, 100)} »` : `Didascalie coupée (il voulait se taire, rien n'est dit) : « ${wilson.slice(0, 100)} »`) : `Réponse en double coupée (déjà dite) : « ${wilson.slice(0, 100)} »`, true);
        if (did && user) { this.log(`Entendu : « ${user.slice(0, 600)} »`, true); (this._entendus = this._entendus || []).push(user); this._entendus.splice(0, this._entendus.length - 6); }
        return;
      }
      if (this._retenu === this._turnN - 1) {
        // Réponse retenue (R1) : rien n'a été dit ; on note ce qu'il aurait dit, et surtout pas de relance.
        this._retenu = null; this._liveTurn = null; this._modelTalking = 0;
        if (user) this.log(`Entendu (sans regard) : « ${user.slice(0, 600)} »`, true);
        this.log(`Wilson se tait (personne ne le regardait)${wilson ? ` — il aurait dit : « ${wilson.slice(0, 100)} »` : ''}`, true);
        this._nvSuivi(wilson, true);
        if (user) (this._entendus = this._entendus || []).push(user), this._entendus.splice(0, this._entendus.length - 6);
        $('subtitle').textContent = '';
        return;
      }
      if (wilson) this._nvSuivi(wilson);
      if (wilson && user) this._maisonSansOutil(user, wilson);   // « C'est allumé » sans rien commander (25/11/26, 20h39)
      if (wilson) this._lastTurnAt = performance.now();   // un tour muet (puis relance) ne compte pas : délai réellement ressenti
      // La suite d'une demande (outil) est dite : la permission donnée par l'outil s'arrête ; la prochaine phrase devra être
      // dite en le regardant (R1). Le toucher et les boutons gardent leurs 30 s.
      if (wilson && /^outil/.test(this._permisPour || '') && (this._outilRepAt || 0) >= (this._permisDepuis || 0) && !(this._searches && this._searches.size) && !(this._analyses && this._analyses.size)) this._permisJusqua = 0;
      if (user) this.log(`Entendu : « ${user.slice(0, 600)} »`, true);
      const imgs = this._imgN || 0, T = this._liveTurn; this._imgN = 0;
      if (T && wilson) {
        const s = T.delay;
        this.log(`Délais (direct) : 1er son ${s != null ? s + ' s' : '?'} après la fin de ta phrase (${this.brain.modelUsed}${T.search ? `, dont recherche ${(T.search / 1000).toFixed(1)} s` : ''})`);
        this.remote.mesure({ google: s, voix: s != null ? Math.round((s + 0.06 + (this.audio.ctx.outputLatency || 0)) * 10) / 10 : null, modele: this.brain.modelUsed, reflexion: 'direct',
          recherche: T.search ? Math.round(T.search / 100) / 10 : null });
        this.log(`Voix du direct : ${T.sec.toFixed(1)} s reçues${this.audio.trous ? `, ${this.audio.trous} trou(s) dans sa voix (${(this.audio.trousSec || 0).toFixed(1)} s de silence en tout, voix gardée d'avance portée à ${(this.audio.avance || 0).toFixed(2)} s)` : ''}, niveau de sortie max ${Math.round((this._outPeak || 0) * 100)} %, ${imgs} photo(s) prise(s) à la demande${this.vision ? `, lumière ${Math.round(this.vision.light * 100)} %` : ''}`);
      }
      this._liveTurn = null; this._outPeak = 0; this.audio.nouveauTour();
      // Journal du 05/11/26, 11h05:35 (« Tu te rappelles pas ma dernière question ? » → « trou de mémoire ») : une demande
      // arrivée par l'oreille (« Wilson, j'en suis où dans mes clients actifs ? ») part en texte, sans transcription de
      // Google : elle n'entrait pas dans les derniers échanges, et la discussion suivante ne la connaissait pas.
      const DT = this._demandeTexte;
      const userLog = user || (DT && DT.conv === this.convId && !DT.note && DT.texte ? (DT.note = true, DT.texte) : '');
      if (userLog || wilson) this.memory.addExchange(userLog, wilson, this.famille._parle());
      if (wilson) { (this._ditWilson = this._ditWilson || []).push({ t: performance.now(), text: wilson }); this._ditWilson.splice(0, this._ditWilson.length - 8); }
      if (wilson) this._aDireDit(wilson, coupee);                               // réponse attendue enfin donnée ?
      if (wilson) this._verifierChiffres(wilson);                               // chiffre inventé ? (journal du 05/11/26)
      if (user) (this._entendus = this._entendus || []).push(user), this._entendus.splice(0, this._entendus.length - 6);
      if (user) this._parleDepuis = true;
      // Il a reparlé APRÈS le résultat de l'outil (tour suivant) : la relance « réponds » ne vaut plus pour cet outil.
      if (user && this._apresOutil && this._turnN - 1 > this._apresOutil.turnN) this._apresOutil = null;
      if (wilson) {
        this._demandeTexte = null;
        this._derniereReponse = { texte: wilson, at: performance.now(), coupee }; this._parleDepuis = false;
        if (this._propAppel && this._propAppel.conv === this.convId) this._propAppel = null;   // proposition d'après l'appel dite
        this.log('Wilson : ' + wilson.slice(0, 1500), true); /* 19/11/26 : réponse entière (avant : 120 caractères) */ this._remarqueOubliee(wilson); this._enregistreFaux(wilson); this._afficheSansOutil(wilson);
        this.famille.dit(wilson);                                                // message de la famille bien transmis (7 sexies, M3)
        this.questions.dit(wilson, this.convId);                                 // question de Claude posée à Timothée (7 septies, D)
        // Journal du 30/10/26, 22h39 : « To hear your thoughts on something specific, just let me know. » → il le redit en français.
        if (enAnglais(wilson) && this.brain.open && performance.now() - (this._anglaisAt || -1e9) > 15000) {
          this._anglaisAt = performance.now(); this.log('Wilson a répondu en anglais : je lui demande de le redire en français');
          this.brain.sendText('[Tu viens de répondre en anglais. Redis-le maintenant en français, brièvement, sans t\'excuser. Toujours en français ensuite.]');
        }
      }
      // Demande transmise en texte (oreille) restée sans réponse alors qu'on le regardait : relance, une fois (01/11/26).
      else if (!user && this._demandeTexte && this._demandeTexte.conv === this.convId && performance.now() - this._demandeTexte.at < 15000
        && (this._demandeTexte.vu || this._gazing() || this._voitureBt) && this.brain.open && !this.paused && !hadTool && this._nudgedFor !== this._demandeTexte.texte) {
        const D = this._demandeTexte; this._nudgedFor = D.texte; this._demandeTexte = null;
        this.log(`Wilson s'est tu sur une demande ${this._voitureBt && !D.vu ? 'faite en voiture' : 'dite en le regardant'} : relance`);
        this.brain.sendText(`[On te parlait${this._voitureBt && !D.vu ? ' (Timothée, en voiture)' : ' en te regardant'} (« ${D.texte} ») : réponds maintenant, à voix haute.]`);
      }
      // (pas de relance pendant qu'un outil travaille : CRM ou recherche en cours, il répondra avec le résultat — journal du 25/10/26, 10h21)
      else if (user && realPhrase(user) && (this._gazeMode || this._byName || this._voitureBt) && this.brain.open && !this.paused && this._nudgedFor !== user && !hadTool && this._reponsePermise() && !(this._searches && this._searches.size) && !(this._analyses && [...this._analyses.values()].some((A) => !A.cancelled))
        && (this._dialogueEnCours() || this._semblePourMoi(user)) && !this._autrePrenom(user) && !(this.vision && this.vision.faces > 1)) {
        // Écoute au regard : tout ce qu'il entend lui est adressé. Une vraie phrase restée sans réponse (souvent la 1re
        // d'une discussion, journal du 24/10/26) → on lui demande de répondre, une seule fois.
        this._nudgedFor = user;
        const deLoin = (this._byName || this._voitureBt) && !this._gazing();
        this.log(`Wilson s'est tu alors qu'on lui parlait${this._voitureBt ? ' (en voiture)' : deLoin ? ' (appelé par son prénom)' : ' en le regardant'}${this._dialogueEnCours() ? ', juste après sa réponse' : ''} : relance`);
        this.brain.sendText(`[On te parlait${deLoin ? '' : ' en te regardant'} : réponds maintenant, à voix haute, à ce qui vient d'être dit.]`);
      } else if (hadTool && !wilson) this.log('Wilson attend le résultat de son outil : il répondra avec');
      else this.log(`Wilson se tait (il pense que la phrase n'était pas pour lui${user && this._verrouRegard && !this._reponsePermise() ? ' : personne ne le regardait' : user && this._gazeMode && !this._dialogueEnCours() && !this._semblePourMoi(user) ? ' : pas une demande pour lui' : this.vision && this.vision.faces > 1 ? ' : plusieurs personnes devant lui' : ''})`);
      setTimeout(() => { if (!this.audio.playing) $('subtitle').textContent = ''; }, 5000);
    });
    b.on('heard', (t) => {
      if (this.state !== 'conversation') return;
      this.lastActivity = this._heardAt = performance.now(); this._noteHeard(t); this._noteChiffres(t, 'dit');
      if (this._protocole && String(t || '').trim()) {                   // protocole voiture : une demande de travail verrouille le tour
        const vv = this._vvTour(); vv.user = String(t);
        const travail = VP.estTravail(t, { clients: [...this.crm.cache.values()].map((e) => e.societe) }) || (this._travailRecent() && !VP.horsTravail(t) && !this._reaction(t));
        if (travail && !vv.travail) { vv.travail = true; this._travailAt = performance.now(); this._travailConv = this.convId; if (!vv.outil) this._vvRetenir(vv, 'demande de travail'); }
        else if (travail) { this._travailAt = performance.now(); this._travailConv = this.convId; }
      }
      if (String(t || '').trim()) this._heardTurnN = this._turnN;          // phrase en cours de transcription (pas encore de réponse)
      if (String(t || '').trim()) this._parleDepuis = true;
      if (this._gate && !this._gate.ok && nomDit(t)) this._gateOpen('nom entendu');
    });
    b.on('said', (t) => {
      if (this._retenu === this._turnN || this._doublon === this._turnN) return;
      if (VP.estDidascalie(t) || (!this._protocole && VP.ditPasPourMoi(t))) {   // didascalie (« (Wilson reste silencieux…) ») ou « ce n'est pas pour moi » dit à voix haute (14/11/26) : coupée
        this._doublon = this._turnN; this._didascalie = this._turnN; this.audio.flush(); this.face.setTalk(0); this._liveTurn = null; this._modelTalking = 0;
        $('subtitle').textContent = '';
        return;
      }
      if (this._protocole) {
        const vv = this._vvTour();
        if (!vv.outil && !vv.hold && (vv.travail || this._travailRecent()) && (VP.annonceRecherche(t) || VP.affirmeFait(t))) this._vvRetenir(vv, 'il annonce une recherche ou affirme un fait sans outil');
        // « C'est parti, je te guide vers … » sans l'outil itineraire (journal du 19/11/26, 14h08:52 : « Hermès à Lu », réponse au
        // choix entre deux clients, n'était pas une demande de travail) : retenu, l'outil doit d'abord lancer le guidage.
        if (!vv.outil && !vv.hold && VP.annonceGuidage(t)) this._vvRetenir(vv, 'il annonce le guidage sans l\'avoir lancé');
        if (vv.hold && !vv.outil) return;                                // rien d'affiché non plus
        this._vvNoms(vv, t);
      }
      if (this._estDoublon(t)) {
        this._doublon = this._turnN; this.audio.flush(); this.face.setTalk(0); this._liveTurn = null; this._modelTalking = 0;
        $('subtitle').textContent = '';
        return;
      }
      this._couperFinDeTrop(t);
      if (this.brain.syncTools) {                          // pas d'outil du visage sur ce modèle : l'expression suit le texte
        const e = emotionDuTexte(t);
        if (e && e !== this._emoTour) { this._emoTour = e; this.face.setEmotion(e, 6500, 0.8); }
      }
      if (this.settings.subtitles || this.car) $('subtitle').textContent = cleanSpeech(t).slice(-220);
    });
    b.on('toolcall', (calls) => this._tools(calls));
    b.on('toolcancel', (ids) => {        // la personne a coupé Wilson pendant une recherche : on l'abandonne
      for (const id of ids) {
        const E = this._ecrituresEnAttente && this._ecrituresEnAttente.get(id);   // remarque / crm_noter qui attend la fin de sa phrase (20/11/26)
        if (E) { E.annule = true; E.annuleAt = performance.now(); this.log(`Outil ${E.name} annulé par Google (Timothée parlait encore) : pas lancé, j'attends la fin de sa phrase`); continue; }
        const A = this._analyses && this._analyses.get(id);
        if (A) { A.cancelled = true; this.log('Question au CRM : Gemini n\'attend plus, la réponse viendra quand même'); continue; }   // C11 bis
        const c = this._searches && this._searches.get(id);
        if (c && c.crm) { c.annule = true; this.log(`Outil ${c.crm} annulé par Google (Timothée parlait encore) : je le finis quand même et je lui donne le résultat`); continue; }
        if (c) { this._searches.delete(id); c.abort(); this.log('Recherche annulée par Google (on parlait encore)'); }
        else this.log(`Google annule un outil déjà fini (${id.slice(0, 12)})`);
      }
    });
    b.on('goaway', () => this._reconnect('goAway'));
    b.on('closed', (e) => {
      if (e.expected) return;
      this.log(`Connexion fermée (${e.code}${e.reason ? ' : ' + e.reason : ''})`);
      if (this.state === 'conversation') this._reconnect('coupure');
    });
    b.on('log', (m) => this.log(m));
    b.on('ready', () => { this._liveGen = (this._liveGen || 0) + 1; });   // nouvelle session : un outil d'avant n'y a plus de réponse attendue
  }

  // ---------- capteurs ----------
  _wireSensors() {
    const s = this.sensors;
    $('wake').addEventListener('pointerup', () => this.start(true));
    $('car-btn').hidden = !VOITURE || deviceName() !== 'téléphone';
    $('car-btn').addEventListener('click', () => { if (this.car) this.exitCar('bouton'); else this.enterCar('bouton'); });
    $('car-exit').addEventListener('click', () => this.exitCar('bouton'));
    s.on('tap', () => {
      if (!this.started) { this.boot(); return; }
      this.voice.warm();
      if (this.audio.holdErr && this._voitureBt) this._holdTry = 0;            // lecteur refusé faute de geste : un toucher le relance
      if (!this.audio.running) { this.audio.resume(); this._hideWake(); return; }
      // Remarques de Timothée du 06/11/26, 08h48-08h49 : en voiture, retoucher l'écran pendant la discussion le rendort tout de
      // suite (sans attendre la minute de silence), sauf si une fenêtre à valider (Oui / Non, bouton…) est affichée.
      if (this.enVoiture && (this.state === 'conversation' || this.state === 'eveil')) {
        const F = this._fenetreOuverte();
        if (!F) { this.log('Voiture : écran retouché pendant la discussion : je me rendors', true); this.endConversation('toucher'); return; }
        this.log(`Voiture : écran touché, mais ${F} est affiché(e) : je reste éveillé`);
      }
      if (this.speaking) { this.interrupt('toucher'); return; }
      if (this.state === 'veille' || this.state === 'dodo') { this.famille.presence('écran touché'); this.face.setEmotion('surprise', 900); this.startConversation('toucher'); return; }
      this.face.setEmotion('rire', 1600);
    });
    s.on('doubletap', () => { this.face.doWink(1); this.face.setEmotion('joie', 1800); });
    s.on('longpress', () => this.ui.open());
    s.on('shake', () => {
      // Un téléphone bouge tout le temps (dans la main, en voiture) : plus de « Oulà, ça a bougé ! » (journal du 25/10/26).
      if (this.car || deviceName() === 'téléphone') return;
      this.face.setEmotion('peur', 2500);
      if (!(this.state === 'conversation' && this.mode === 'live' && this.brain.open)) return;
      // Journal du 19/11/26, 08h40:56 : la tablette a bougé pendant que Wilson lui disait un message ; la consigne a fait couper
      // sa réponse par Google, le message est resté à moitié dit, et « Tu peux répéter ? » (08h41:16, 08h41:20) a eu deux
      // fois « oups, ça a bougé ! ». Pendant qu'il parle (ou que sa réponse arrive) : seulement la tête de peur, rien à Gemini.
      if (this.speaking || this._liveTurn) { this.log('Tablette secouée pendant qu\'il parle : rien dit à Gemini, sa phrase continue'); return; }
      this.brain.sendText('[La tablette vient d\'être secouée ou déplacée.]');
    });
    s.on('battery', (b) => {
      const was = this.battery; this.battery = b;
      if (was && was.charging && !b.charging) { this.face.setEmotion('triste', 4000); this.badge('Je ne suis plus branché', 8000); }
      if (was && !was.charging && b.charging) this.face.setEmotion('joie', 2500);
    });
    s.on('network', (on) => {
      this.log(on ? 'Téléphone de nouveau en ligne' : 'Téléphone hors ligne');
      if (!on) {
        this.badge('Plus de réseau', 6000); this.face.setEmotion('confus', 3000);
        if (this.state === 'conversation') this._netLost('hors ligne');      // la discussion attend le réseau (C8)
        return;
      }
      if (this.netWait) this._netSchedule(300);
      this.crm.flushQueue();
      // En voiture, la discussion s'est arrêtée faute de réseau il y a peu : il prévient que c'est revenu.
      if (!this.netWait && this.enVoiture && this._netEndedAt && Date.now() - this._netEndedAt < 10 * 60000 && this.state === 'veille') {
        this._netEndedAt = 0; this.audio.tone('revenu'); this._say('Le réseau est revenu.');
      }
    });
  }

  // ---------- boucle ----------
  _tick() {
    const now = performance.now(), f = this.face, v = this.vision;
    // La famille (7 sexies) : visages et réactions 4 fois par seconde, messages et garde chaque seconde.
    if (now - (this._quiAt || 0) > 250) { this._quiAt = now; try { this.qui.tick(now); this.reactions.tick(now); } catch (e) { this.log('Erreur : visages/réactions ' + e.message); } }
    if (now - (this._familleAt || 0) > 1000) { this._familleAt = now; try { this.famille.tick(now); } catch (e) { this.log('Erreur : famille ' + e.message); } }
    // Regard : la personne suivie, sinon il laisse traîner ses yeux.
    f.setLook(v && v.target && this.state !== 'dodo' ? v.target[0] : null, v && v.target ? v.target[1] : 0);
    // Retour visuel : quand on le regarde, ses yeux s'ouvrent grand et l'écran s'éclaire → « je t'écoute ».
    if (v && (this.state === 'veille' || this.state === 'dodo')) {
      const look = !!(v.looking && v.gazeReady && (this.settings.listenMode || 'regard') === 'regard');
      if (look !== this._lookShown) {
        if (look && this.state === 'dodo') this.setState('veille');
        this._lookShown = look;
        if (look) {
          f.setMood('attentif'); f.setBrightness(1); f.setFps(60); v.setRate(10); this.presenceAt = now;
          this.famille.presence('quelqu\'un me regarde');                     // garde automatique : la maison n'est plus vide (G5)
          // On le regarde : on prépare la connexion à Google et la voix de la tablette (au plus une fois par minute).
          if (!this._warmAt || now - this._warmAt > 60000) { this._warmAt = now; warmUp(this.settings.apiKey); this.voice.warm(true); }
        } else { f.setMood(v.hasPerson ? 'neutre' : 'somnolent'); f.setBrightness(v.hasPerson ? 0.45 : 0.3); f.setFps(40); v.setRate(v.hasPerson ? 8 : 4); }
      }
    }
    if (v && v.modelsDone && !this._gazeAnnounced && this.started) {
      this._gazeAnnounced = true;
      this.log(`Vision (en arrière-plan) : ${v.mode}, regard ${v.gazeReady ? 'prêt (' + (v.delegate === 'GPU' ? 'carte graphique' : 'processeur') + ')' : 'indisponible'}${v.errors.length ? ' — ' + v.errors.join(' · ') : ''}`);
      if (v.gazeReady) this.badge('Regarde-moi et parle-moi : je t\'écoute', 5000);
      else this.badge('Je ne vois pas bien les visages : touche-moi pour me parler', 10000, true);
    }
    // Question au CRM en cours (C11) : tête qui réfléchit tant qu'il cherche (sauf quand il parle)
    if (this._analyses && this._analyses.size && !this.speaking && f.emotion !== 'reflexion') f.setEmotion('reflexion', 60000, 0.7);
    // Lèvres
    if (this.audio.playing) { const [l, r] = this.audio.outputLevels(); f.setTalk(l, r); this._outPeak = Math.max(this._outPeak || 0, l); }
    else if (this.voice.speaking) f.setTalk(this.voice.mouth(now), 0.25);
    if (this.state === 'conversation') {
      const E = this.ecoState, thinking = E && (E.busy || E.cap);
      // une question à l'analyste garde la discussion ouverte 90 s ; au-delà, la réponse viendra de toute façon (C11 bis)
      // (et une réponse du CRM qu'il est en train de donner ne se coupe pas : journal du 05/11/26, 11h04:22)
      // 1.43.0 (journal du 13/11/26, 21h39:39 : la recherche sur Xavier Niel arrive au moment où Timothée détourne les yeux,
      // veille aussitôt, la réponse n'est jamais dite ; remarque du 13/11/26, 07h10:34 : « donne la réponse dès que tu l'as,
      // même si je ne suis plus devant ») : un résultat d'outil reçu garde l'écoute ouverte jusqu'à ce qu'il soit dit (12 s au plus).
      const AOr = this._apresOutil, attendReponse = !!(AOr && AOr.conv === this.convId && now - AOr.at < 12000);
      const searching = !!(this._searches && this._searches.size) || [...(this._analyses || new Map()).values()].some((A) => now - A.t0 < 90000) || this._aDireEnCours(now) || attendReponse;
      // Images : aucune envoyée d'office (R6) ; seulement à la demande (outil « regarder »).
      const keep = this.car || this._voitureBt ? CAR_IDLE_MS : this.settings.convTimeout * 1000;
      const idle = now - Math.max(this.lastActivity, this.lastUserSpeech);
      // Réseau qui ne passe plus (le son du micro s'accumule sans partir, 3 s) : même chose qu'une coupure (C8).
      if (this.mode === 'live' && this.brain.open && !this.netWait) {
        const ba = (this.brain.ws && this.brain.ws.bufferedAmount) || 0;
        if (ba > 96000) {
          this._stallSince = this._stallSince || now;
          if (now - this._stallSince > 3000) { this._stallSince = 0; this.log(`Réseau bloqué : ${Math.round(ba / 1000)} ko du micro en attente d'envoi`); this._netLost('réseau trop lent'); }
        } else this._stallSince = 0;
      }
      if (this.netWait) {
        // réseau coupé : la discussion attend (C8), son délai à elle décide
      } else if (this._gazeMode && !this.continuous && !this._byName && !this._voitureBt) {
        // R3 : le regard pilote la discussion. 3 s sans regard (sauf s'il parle ou cherche) → veille ; regardé → reprise.
        const lastSeen = Math.max(v.sureAt || 0, this.playEndAt || 0, this._resumedAt || 0, this._convAt || 0);
        if (this.paused) {
          if (v.looking) this._resume();
          else if (now - this._pausedAt > keep) this.endConversation('plus regardé');
        } else if (!this.speaking && !thinking && !searching && now - lastSeen > this._graceRegard()) this._pause();
        else if (v.looking && !this.speaking && !thinking && !searching && idle > LOOKED_IDLE_MS) this.endConversation('silence');
      } else {
        if (this.paused) this._resume();
        // Sans détection du regard : la conversation se ferme d'elle-même après un silence.
        // Mode éco : seule une vraie réponse prolonge la conversation (un bruit de fond continu ne la garde plus ouverte).
        const busyEar = this.mode === 'eco' ? false : this.audio.speaking;
        // Appelé par son prénom, personne ne le regarde (journal du 30/10/26, 23h06-23h21 : « Merci Wilson, de rien,
        // voilà » pendant une soirée → discussion restée ouverte 15 min, les voix autour la prolongeaient sans fin) :
        // 45 s sans qu'il dise un mot ni qu'on le rappelle → veille.
        if ((this._byName || this._voitureBt) && this.mode === 'live' && !this.continuous && !this._gazing(now) && !this.speaking && !thinking && !searching
          && now - Math.max(this.playEndAt || 0, this._convAt || 0, this._prenomAt || 0, this._resumedAt || 0, ...(this._voitureBt ? [this._heardAt || 0] : [])) > (this._voitureBt ? CAR_IDLE_MS : BYNAME_IDLE_MS)) this.endConversation('silence : personne ne lui parle');   // en voiture : ce qu'il dit compte aussi, 60 s de calme (remarque du 04/11/26, 11h50 : « tu te mets en veille alors que je parle ») ; la radio est coupée pendant la discussion
        else if (!this.continuous && !this.speaking && !busyEar && !thinking && !searching && idle > keep) this.endConversation('silence');
      }
      if (this.continuous && idle > 30000 && f.p.bright.t > 0.5) { f.setBrightness(0.3); f.setMood('somnolent'); }
      if (this.continuous && idle < 1000 && f.p.bright.t < 0.5) { f.setBrightness(1); f.setMood('ecoute'); }
    }
    // Téléphone relié à la voiture (03/11/26) : noté au journal, et une bulle dit comment lui parler.
    const vb = this._voitureBt;
    if (vb !== !!this._voitureBtVu && this.started) {
      this._voitureBtVu = vb;
      this._voitureBtDepuis = vb ? Date.now() : null;            // monté dans la voiture à cette heure (prochain rendez-vous)
      if (vb) {
        // Remarque du 05/11/26, 15h54 : pas de caméra en voiture (ni regard, ni visages, ni réactions).
        if (this.vision) { this.vision.stop(); this.vision = null; this.qui.attacher(null); this.log('Voiture : caméra éteinte'); }
        // Remarque du 05/11/26, 14h48 : plus d'oreille en voiture (il fallait l'appeler 3, 5, 10 fois) ; réveil au toucher.
        this.log('Voiture : téléphone relié en Bluetooth — réveil en touchant l\'écran (pas d\'oreille ni de regard), je réponds sans qu\'on me regarde, je me rendors après 1 min de silence');
        this.badge('En voiture : touche l\'écran pour me parler', 6000);
        // Remarque du 05/11/26, 09h47 (« stocker des informations en local pour aller plus vite ») : en montant dans la
        // voiture, la journée est préparée (fiches des clients du jour gardées) : la 1re question sur un client va plus vite.
        if (this.crm && this.crm.on) this.crm.prefetch();
      } else {
        this.log('Voiture : plus de Bluetooth — de nouveau, je réponds quand on me regarde');
        if (this.settings.camera && !this.vision && this.started && !this.car) this._startVision();
      }
    }
    // Lecteur multimédia (04/11/26) : en voiture, pendant une discussion (et 8 s après), pour qu'Android Auto joue sa voix.
    const veutLecteur = vb && (this.state === 'eveil' || this.state === 'conversation' || this.audio.playing);
    if (veutLecteur) this._holdUntil = now + 8000;
    const garde = vb && now < (this._holdUntil || 0);
    if (garde !== !!this._holdOn || (garde && !this.audio.holding && now - (this._holdTry || 0) > 5000)) {
      // Appli Android (appli 2, journal du 05/11/26, 18h09 : « encore un problème du son ») : la vue web ne demande pas le son
      // à Android comme Chrome ; l'appli le demande elle-même, sinon Android Auto ne passe pas sa voix dans les haut-parleurs.
      if (appli() && garde !== !!this._holdOn) { const e = pont('sonVoiture', garde); if (garde) this.log(`Appli : son de la voiture demandé (${e || 'appli 1 : pas possible, mets l\'appli à jour'})`); }
      this._holdOn = garde; this._holdTry = now;
      this.audio.mediaHold(garde, (a) => { this.log(`Bouton ${a} (volant ou écran de la voiture) : je me tais`); if (this.state === 'conversation') this.endConversation('volant'); });
    }
    const AO = this._apresOutil;
    // Journal du 05/11/26, 09h40-09h46 (voiture) : 4 fois muet après « remarque » ou « rappel », relancé au bout de 5 s
    // (« c'est pas normal que tu mettes autant de temps ») → 3 s, s'il ne parle plus depuis 1,5 s (sinon 6 s : le bruit de
    // la route peut passer pour de la voix).
    if (AO && (AO.conv !== this.convId || this.state !== 'conversation')) this._apresOutil = null;
    else if (AO && now - AO.at > APRES_OUTIL_MS && ((!this.audio.speaking && now - (this.audio.lastVoicedAt || 0) > 1500) || now - AO.at > 2 * APRES_OUTIL_MS) && !this.audio.playing && this.brain.open && !this.paused && !(this._searches && this._searches.size) && !(this._analyses && [...this._analyses.values()].some((A) => !A.cancelled))) {
      this._apresOutil = null;
      this.log(`Wilson muet ${((now - AO.at) / 1000).toFixed(0)} s après le résultat de ${AO.noms} : relance`);
      // en voiture, Google peut croire qu'on parle encore (bruit de la route) : fin de phrase forcée d'abord (05/11/26, 14h48)
      if (vb) { this.outBuf = []; this.outLen = 0; this.brain.audioStreamEnd(); this._micRetenuJusqua = now + MICRO_RETENU_MS; }
      this.brain.sendText('[Tu as le résultat de ton outil : réponds-lui maintenant à voix haute, brièvement, en français, avec seulement ce que dit ce résultat (aucun chiffre ni détail inventé).]');
    }
    // Journal du 05/11/26, 09h47:21 (voiture) : 1er son 44,9 s après la fin de sa phrase. Le bruit de la route faisait
    // croire à Google qu'il parlait encore : il attendait la fin de la phrase. Phrase transcrite, plus un mot depuis 5 s,
    // le micro du téléphone n'entend plus de voix depuis 2 s, pas de réponse ni d'outil en cours → on lui dit de répondre
    // (une fois par phrase).
    // Journal du 05/11/26, 14h46-14h48 (voiture) : « il est quelle heure ? » dit quatre fois en 40 s avant la réponse ;
    // « c'est l'enfer, tu réponds pas à mes questions ». Le bruit de la route faisait passer le micro du téléphone pour de
    // la voix (la règle « micro sans voix depuis 2 s » attendait 9 s), et la consigne « réponds » envoyée pendant que Google
    // croyait encore entendre parler restait sans effet (18 s, puis 47 s après une remarque). Maintenant : 3 s sans un mot
    // transcrit (4,5 s si le micro croit encore entendre une voix : c'est souvent la route) → fin de phrase FORCÉE (audioStreamEnd : Google traite tout de suite ce qu'il a entendu ; micro retenu 1,5 s
    // pour qu'il ne reparte pas sur le bruit), puis « réponds » 2,5 s après s'il n'a toujours rien dit. Aussi quand il avait
    // appelé un outil plus tôt dans le tour, dès que Timothée a reparlé après le résultat.
    const AO2 = this._apresOutil;
    // il a reparlé après le résultat : c'est sa phrase qui attend. Une phrase d'un tour SUIVANT seulement : la transcription
    // de la demande elle-même arrive souvent après le résultat de l'outil (journal du 05/11/26, 21h45:29-21h45:30 : agenda
    // lu, transcription 1 s plus tard → chien de garde désarmé, Wilson muet jusqu'à la veille).
    if (AO2 && (this._heardAt || 0) > AO2.at + 300 && (this._heardTurnN || 0) > AO2.turnN) this._apresOutil = null;
    const outilEnCours = this._outilsEnCours > 0 || !!(this._searches && this._searches.size) || !!(this._analyses && [...this._analyses.values()].some((A) => !A.cancelled && !A.fond));
    // Remarque du 18/11/26, 17h58:01 (« arrête de me couper quand je t'explique quelque chose d'un peu long ») : à 17h56:41,
    // une explication a eu sa fin forcée au bout de 4,5 s alors qu'il continuait. Il a annoncé une explication (« un point que
    // je voudrais aborder », « j'ai pas fini ») ou la phrase s'arrête sur « euh », « et », une virgule… (VP.phraseEnCours) :
    // 6 s sans un mot (9 s si le micro entend encore une voix) au lieu de 3 s (4,5 s).
    let attente = ATTENTE_GOOGLE_MS;
    if (vb && this.state === 'conversation' && this.mode === 'live' && this.brain.open && !this.paused && !this.netWait
      && this._heardTurnN === this._turnN && this._heardAt && now - this._heardAt > ATTENTE_GOOGLE_MS && this._nudgedTurn !== this._turnN
      && !this.audio.playing && !this.audio.micTaken && (attente = VP.phraseEnCours(this.brain.inText) ? ATTENTE_EXPLIQUE_MS : ATTENTE_GOOGLE_MS) && now - this._heardAt > attente
      && ((!this.audio.speaking && now - (this.audio.lastVoicedAt || 0) > 1500) || now - this._heardAt > attente * 1.5)
      && !this._liveTurn && !this._apresOutil && !outilEnCours && (this._heardAt || 0) > (this._outilRepAt || 0) && !(this._vv && this._vv.n === this._turnN && this._vv.held.length)) {
      this._nudgedTurn = this._turnN;
      this.log(`Google attend encore la fin de ta phrase (${((now - this._heardAt) / 1000).toFixed(0)} s sans un mot, ${attente > ATTENTE_GOOGLE_MS ? 'il expliquait quelque chose : attendu plus longtemps' : 'bruit de la route ?'}) : fin de phrase forcée`);
      this._forcerFinPhrase();
    }
    // Remarque du 20/11/26, 17h16 (« Wilson met trop de temps à répondre ») et sa réponse de 18h13 : quand le réseau est
    // mauvais, la réponse peut mettre 15 à 20 s, sans rien entendre ; « il faudrait un message instantané pour prévenir ».
    // En voiture : fin de phrase forcée et, 3,5 s plus tard, toujours rien de Google (ni voix, ni outil) → la voix du
    // téléphone le dit tout de suite (une fois par tour, une fois par minute au plus avec « plus de réseau »), puis le petit
    // son de réflexion jusqu'à la réponse. La réponse qui arrive coupe cette voix (une seule voix à la fois).
    const FF = this._forceAt;
    if (vb && FF && FF.conv === this.convId && FF.tour === this._turnN && this._lentTour !== this._turnN && now - FF.at > LENT_APRES_FORCE_MS
      && this.state === 'conversation' && this.mode === 'live' && this.brain.open && !this.paused && !this.netWait
      && !this._liveTurn && !this.audio.playing && !this.voice.speaking && !this.audio.micTaken && !outilEnCours && !this._apresOutil
      && (this._heardAt || 0) < FF.at && (this._toolAt || 0) < FF.at && !(this._vv && this._vv.n === this._turnN && this._vv.held.length)) {
      this._lentTour = this._turnN;
      const d = Date.now(), attendu = ((now - (this._heardAt || FF.at)) / 1000).toFixed(1);
      if (d - Math.max(this._lentDitAt || 0, this._netToldAt || 0) > 60000) {
        this._lentDitAt = d; this._lent = { conv: this.convId, tour: this._turnN, heardAt: this._heardAt || 0 };
        this.log(`Réponse en retard : rien de Google ${attendu} s après ta phrase (réseau lent ?) : je le dis tout de suite`);
        this._say('Le réseau est lent, je te réponds dès que ça passe.');
      } else {
        this._lent = { conv: this.convId, tour: this._turnN, heardAt: this._heardAt || 0 };
        this.log(`Réponse en retard : rien de Google ${attendu} s après ta phrase (déjà dit il y a moins d'une minute : petit son seulement)`);
      }
    }
    this._messageAuCalme(now, outilEnCours);               // message de la famille : dit au calme s'il le regarde (18/11/26, 21h45)
    this._questionAuCalme(now, outilEnCours);              // question de Claude : l'appli choisit le moment (18/11/26)
    // En voiture, personne ne regarde l'écran : caméra à 2 analyses/s et visage à 30 images/s pendant la discussion, pour que
    // le téléphone garde de la marge pour le son (grésillements, remarque du 04/11/26, 11h32).
    if (vb && this.state === 'conversation') { if (this.vision && this.vision.fps > 2) this.vision.setRate(2); if (this.face.fpsDiv < 2) this.face.setFps(30); }
    // Remarque de Timothée du 04/11/26, 10h13 : en voiture il ne regarde pas l'écran ; pendant qu'il cherche (CRM, analyste,
    // Internet), un petit « tic-tac » doux toutes les 2,5 s dit qu'il réfléchit (jusqu'à 32 s de silence ce matin-là).
    // Remarque du 05/11/26, 09h44-09h45 (« dis-moi quand tu réfléchis ou que tu enregistres quelque chose », « le petit bip
    // bip, c'était bien ») : aussi pendant qu'un outil travaille (remarque, rappel, météo…) et tant qu'il n'a pas répondu après.
    // Remarque du 05/11/26, 16h07 (« quand il cherche, je veux l'entendre, le bip-bip ; là il n'y avait pas le bip-bip quand il
    // recherchait dans le CRM ») : aussi pendant le verrou de vérité (il attend le résultat d'un outil), et le bruit de la
    // route ne le fait plus taire (avant : rien tant que le micro croyait entendre une voix).
    const vvAttend = this._protocole && this._vv && this._vv.n === this._turnN && this._vv.hold && !this._vv.outil;
    const cherche = this.state === 'conversation' && ((this._searches && this._searches.size) || (this._analyses && [...this._analyses.values()].some((A) => !A.cancelled || A.fond))
      || this._outilsEnCours > 0 || !!this._apresOutil || vvAttend
      || !!(this._lent && this._lent.conv === this.convId && this._lent.tour === this._turnN && !this._liveTurn));   // réponse en retard (20/11/26)
    // (journal du 05/11/26, 11h03:19-11h04:20 : « Je cherche : petit son… » écrit 20 fois : le compteur repartait de zéro
    // chaque fois que le bruit de la route passait pour de la voix ; il n'est remis à zéro que quand il ne cherche plus)
    // Question de Timothée du 06/11/26, 00h11 (« pourquoi je n'ai pas le bip-bip pendant qu'il recherche, comme sur le
    // téléphone ? ») : à la maison aussi, pendant une vraie recherche (Claude, analyste, CRM, Internet) — pas pour une lampe —,
    // même s'il a détourné les yeux et que la discussion s'est mise en veille, jusqu'à la réponse.
    // Remarque de Timothée du 11/11/26, 20h58:09 (« rajoute le petit son que tu fais quand tu recherches une information pour
    // toutes les requêtes ») : à la maison aussi pour les autres outils qui font attendre (maison, météo, bourse…) ; il ne
    // part qu'après 1 s d'attente, donc jamais pour une lampe qui répond tout de suite.
    const rechMaison = !vb && this.settings.bipMaison !== false && (this.state === 'conversation' || this.state === 'veille')
      && ((this._analyses && this._analyses.size > 0) || (this.state === 'conversation' && ((this._searches && this._searches.size > 0) || this._outilsEnCours > 0)));
    if (((cherche && vb) || rechMaison) && !this.audio.playing && !this.voice.speaking && now - (this._heardAt || 0) > 1200) {
      if (!this._chercheDepuis) this._chercheDepuis = now;
      if (now - this._chercheDepuis > (vvAttend ? 0 : 1000) && now - (this._ticAt || 0) > 2500) { this._ticAt = now; try { this.audio.tone('reflexion'); } catch (_) {} if (!this._ticN++) this.log(`Je cherche : petit son de réflexion (${vb ? 'voiture' : 'maison'})`); }
    } else if (!cherche && !rechMaison) { this._chercheDepuis = 0; this._ticN = 0; }
    else this._chercheDepuis = 0;
    // A13 (demande du 06/11/26, 00h11) : nouvelle version de l'appli Android téléchargée → installée seulement quand Wilson est
    // en veille et pas en voiture (jamais pendant une discussion ni sur la route) ; l'appli se rouvre toute seule ensuite.
    if (appli() && now - (this._majAt || 0) > 60000) {
      this._majAt = now;
      if (pont('majPrete') && (this.state === 'veille' || this.state === 'dodo') && !this._voitureBt && !this.car && !this.phone && !(this._analyses && this._analyses.size) && !this._aDire) {
        this.log(`Appli : ${pont('majInstaller')}`);
      }
    }
    // Veille → dodo quand la pièce est vide (ou la nuit).
    if (v && v.hasPerson) this.presenceAt = now;
    if (this.state === 'veille' && !this.car) {
      const empty = now - this.presenceAt;
      const dark = v && v.light < 0.05;
      if (empty > 10 * 60000 || (this._isNight() && empty > 2 * 60000) || (dark && empty > 2 * 60000)) this.setState('dodo');
    }
  }
}

// Méthodes rangées dans js/app/ (24/11/26) : ajoutées à App telles quelles (mêmes propriétés que des méthodes de classe).
for (const M of [EcoMethodes, ConsignesMethodes, ReseauMethodes, ReponsesMethodes, OutilsMethodes, VoitureMethodes, CrmMethodes, EcranMethodes]) {
  for (const nom of Object.getOwnPropertyNames(M.prototype)) {
    if (nom === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(App.prototype, nom)) throw new Error('méthode en double : ' + nom);
    Object.defineProperty(App.prototype, nom, Object.getOwnPropertyDescriptor(M.prototype, nom));
  }
}

const IMPORT_CHIFFRE = await importerLienChiffre();   // lien de copie chiffré (W10) : demande le code avant de démarrer
const app = new App();
window.wilson = app;
app.boot();
