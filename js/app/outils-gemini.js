// Wilson — méthodes de la classe App (js/app.js) : liste des outils donnés à Gemini, recherche Internet.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { sayable } from '../eco.js';
import { CRM_TOOL_NAMES } from '../crm.js';
import { MAISON_TOOL_NAMES } from '../maison.js';
import { OUTILS_NAMES } from '../outils.js';
import { Famille, FAMILLE_TOOL_NAMES } from '../famille.js';
import { demandeEnCours } from '../memoire.js';
import * as VP from '../voiture.js';
import { appli, SEARCH_MAX_MS, fmtDate, $, sleep, CHOSE_A_RAPPELER } from './commun.js';

export class OutilsMethodes {

  _tools(calls) {
    const res = [];
    // Modèle aux outils synchrones (3.1 Flash Live) : il reprend la parole après CHAQUE outil, mémoriser compris ; une relance
    // en plus lui faisait répondre deux fois (journal du 04/11/26, 10h02 et 10h45).
    if (this.brain.syncTools ? calls.length : calls.some((c) => c.name !== 'exprimer_emotion' && c.name !== 'memoriser')) { this._toolTurn = this._turnN; this._toolAt = performance.now(); }
    for (const c of calls) {
      const a = c.args || {};
      // 19/11/26 (remarque de Timothée, 18h24) : chaque outil demandé par Gemini est noté, avec ce qu'il demande.
      if (c.name !== 'exprimer_emotion') this.log(`Outil demandé : ${c.name} ${JSON.stringify(a).slice(0, 300)}`);
      // Dictée en cours (26/11/26) : ni relecture ni écriture à chaque pause ; tout son texte lui sera donné à la fin.
      if (c.name !== 'exprimer_emotion' && this._dicteeEcoute()) {
        this.log(`Outil ${c.name} refusé : dictée en cours (tout sera donné à « J'ai fini »)`);
        res.push({ id: c.id, name: c.name, response: { result: "Dictée en cours : ne fais rien et ne dis rien, n'appelle aucun outil. L'appli te donnera tout son texte quand il aura fini." } });
        continue;
      }
      // Journal du 11/11/26, 11h55:28 et 21h03:30 : « Je regarde où tu en es… » / « Je prépare ton briefing… » dit (permis),
      // puis l'outil du MÊME tour refusé (« voix 0.0 s ») : la fin de cette petite phrase remettait le compte à zéro, et
      // Timothée a dû redemander. Un outil appelé dans un tour qui a déjà eu le droit de parler est permis.
      const memeTour = this._tourPermis === this._turnN && !!this._liveTurn;
      if (!['exprimer_emotion'].includes(c.name) && !this._reponsePermise() && !memeTour) {
        this.log(`Outil ${c.name} refusé : personne ne me regardait vraiment pendant la phrase (${this._etatRegard()})`, true);
        res.push({ id: c.id, name: c.name, response: { result: "Personne ne te regardait : ce n'était pas pour toi. Ne fais rien et ne dis rien." } });
        continue;
      }
      if (c.name !== 'exprimer_emotion') this._permettre(95000, 'outil ' + c.name);
      const pasDemande = this._outilPasDemande(c);
      if (pasDemande) {
        this.log(`Outil ${c.name} refusé : rien de tel dans ce qui a été dit${pasDemande === 'remarque' ? ` (remarque « ${String(a.texte || '').slice(0, 80)} »)` : ''} (« ${this._entenduRecent(pasDemande === 'remarque' ? 90000 : 25000).slice(-120)} »)`, true);
        const pourquoi = pasDemande === 'remarque' ? "Il ne t'a pas encore dit sa remarque : ce que tu voulais noter, il ne l'a pas dit. Ne note rien et ne dis pas « c'est noté ». Dis seulement « Je t'écoute, c'est quoi ta remarque ? », puis note-la avec ses mots quand il l'aura dite."
          : pasDemande === 'reafficher' ? "Il ne t'a rien demandé d'afficher : s'il veut que tu répètes, redis simplement ta dernière phrase, sans outil."
          : this.enVoiture && pasDemande !== 'regarder' ? `Le client « ${a.client || ''} » ne correspond pas à ce que tu as entendu. S'il te parle bien d'un client, redemande-lui son nom pour vérifier ; si ce n'était pas pour toi (radio), tais-toi.`
          : "Personne ne t'a demandé cela : ce que tu as entendu n'était sans doute pas pour toi (bruit, gens qui parlent entre eux). Ne fais rien et ne dis rien.";
        res.push({ id: c.id, name: c.name, response: { result: pourquoi } });
        continue;
      }
      if (c.name === 'remarque') {
        const refus = this._remarqueRefus();
        if (refus) { res.push({ id: c.id, name: c.name, response: { result: `REFUSÉ : seul Timothée peut faire corriger ton programme (sa règle du 16/11/26). Ne note rien, ne dis pas « c'est noté ». Dis seulement : « ${refus} »` } }); continue; }
      }
      if ((c.name === 'remarque' || c.name === 'crm_noter') && !c.apresPhrase) { this._apresSaPhrase(c); continue; }   // fin de sa phrase d'abord (20/11/26)
      if (c.name === 'question_difficile') { this._analyse(c, 'claude'); continue; }   // Claude sur le PC (PLAN 10), en arrière-plan
      if (c.name === 'mails') { this._analyse(c, 'mail'); continue; }                  // ses e-mails, lus par Claude sur le PC (11/11/26)
      if (CRM_TOOL_NAMES.includes(c.name)) { this._crmTool(c); continue; }     // réponse envoyée quand le CRM a répondu
      if (MAISON_TOOL_NAMES.includes(c.name)) { this._maisonCmd(c); continue; } // réponse envoyée quand Home Assistant a agi
      if (OUTILS_NAMES.includes(c.name)) { this._outil(c); continue; }        // écran, minuteur, rappel, météo, courses
      if (FAMILLE_TOOL_NAMES.includes(c.name)) { this._familleOutil(c); continue; }   // messages, visages, garde (7 sexies)
      if (c.name === 'repondre_question') { this._questionOutil(c); continue; }       // réponse de Timothée à Claude (7 septies)
      let out = { result: 'ok' }, silent = true;
      switch (c.name) {
        case 'exprimer_emotion': {
          this.face.setEmotion(a.emotion, 6500, a.intensite || 0.9);
          const g = { oui: 'nod', non: 'shake', sautiller: 'bounce', pencher_la_tete: 'tilt' }[a.geste];
          if (g) this.face.play(g); if (a.geste === 'clin_oeil') this.face.doWink(1);
          break;
        }
        case 'memoriser':
          // Journal du 05/11/26, 11h01:25 : « ce soir, quand Wilson nous verra à la maison, rappelle-nous de parler du cadeau
          // de Louis » → memoriser « … de discuter du sujet avec Camille » (le sujet perdu), puis effacé par la passe de
          // mémoire 2 min après (une chose ponctuelle) : la demande a disparu sans un mot. Une chose à faire ou à rappeler
          // n'est pas un souvenir : Gemini est renvoyé vers le bon outil.
          if (CHOSE_A_RAPPELER.test(a.fait || '')) {
            this.log(`memoriser refusé : « ${String(a.fait).slice(0, 100)} » est une chose à rappeler, pas un souvenir`, true);
            out = { result: "Ce n'est pas un souvenir mais une chose à rappeler : ne le mémorise pas. Pour qu'on le dise à la maison quand on vous verra, appelle messages (action deposer, pour « tous » ou son prénom, aussi_pour_moi true, a_la_maison true, apres = l'heure, texte = la chose à rappeler avec son sujet précis) ; pour une heure précise, appelle rappel ; pour l'agenda Famille, appelle agenda. Puis confirme en une phrase." };
            silent = false; break;
          }
          this.memoire.ajouter(a.fait, { cat: a.categorie, qui: a.qui || this.famille._parle(), origine: 'demandé' }); this.log('Retenu (demandé) : ' + a.fait, true); this.face.play('nod'); out = { result: 'mémorisé' }; break;
        case 'oublier': {
          if (demandeEnCours(a.sujet)) {   // « oublie ce que je viens de te dire » : sa demande en cours, pas un souvenir (journal du 18/11/26, 21h56)
            this.log(`Oublier « ${a.sujet} » : c'est sa demande en cours qu'il laisse tomber, aucun souvenir effacé`, true);
            out = { result: "Ce n'est pas un souvenir à effacer : il laisse tomber ce qu'il venait de te demander. Ne fais rien de cette demande, ne la reprends pas, ne pose aucune question, et dis seulement « D'accord, j'oublie. »" };
            silent = false; break;
          }
          const g = this.memoire.oublier(a.sujet || ''); out = { result: g.length ? 'Oublié : ' + g.join(' ; ') : 'Aucun souvenir ne correspond.' }; silent = false; this.log('Oublier « ' + a.sujet + ' » : ' + g.length + (g.length ? ' (' + g.join(' ; ') + ')' : ''), true); break; }
        case 'date_et_heure':
          if (this._protocole) { this._heureOutil(c); continue; }      // en voiture : seulement s'il l'a demandée (réponse envoyée quand sa phrase est transcrite)
          out = { result: fmtDate() }; silent = false; break;
        // Journal du 05/11/26, 21h51:53-21h52:07 : « Non, je ne suis pas en charge », puis « Oui, il est branché » : inventé
        // (l'onglet État disait « 81 %, branchée »). La vraie batterie de l'appareil.
        case 'batterie': {
          const b = this.battery;
          out = { result: b ? `Batterie : ${Math.round(b.level * 100)} %, ${b.charging ? 'branché (en charge)' : 'pas branché (sur batterie)'}. Dis-le simplement.` : "Cet appareil ne donne pas l'état de sa batterie : dis-le simplement." };
          silent = false; this.log(`Batterie demandée : ${b ? Math.round(b.level * 100) + ' %, ' + (b.charging ? 'branché' : 'pas branché') : 'inconnue'}`, true); break;
        }
        case 'terminer_conversation': { this.endAfterSpeech = true; const id = this.convId; setTimeout(() => { if (id === this.convId && this.endAfterSpeech && !this.audio.playing) this.endConversation('au revoir'); }, 4000); break; }
        case 'chercher': this._search(c, a.question || ''); continue;      // réponse envoyée à la fin de la recherche
        case 'maison': this._maisonTool(c, a.demande || ''); continue;    // réponse envoyée quand Home Assistant a répondu
        case 'regarder': {                                                  // R6 : photo seulement quand on la demande
          const img = this._photo();
          if (img) { this.brain.sendImage(img); this.log(`Photo prise à la demande${a.quoi ? ` (« ${String(a.quoi).slice(0, 80)} »)` : ''}`, true); this.face.play('tilt'); }
          out = { result: img ? "Photo prise : décris maintenant ce que tu vois sur l'image que tu viens de recevoir, en répondant à la question." : "La caméra est coupée : dis-le simplement." };
          silent = false; break;
        }
        default: out = { error: 'outil inconnu' }; silent = false;
      }
      const r = { id: c.id, name: c.name, response: out }; if (silent && this.brain.canSchedule) r.scheduling = 'SILENT';
      res.push(r);
    }
    if (res.length) this.brain.respond(res);
  }

  // Journal du 12/11/26, 08h44-08h47 : « Voilà. », « Bah, c'est pas trop tôt. » → date_et_heure → « Il est 8h46. », cinq fois
  // (« arrête de me dire l'heure à chaque fois »). L'heure n'est donnée que s'il l'a demandée (ou un rappel, un minuteur,
  // l'agenda) — en voiture seulement : c'est le verrou de vérité (« pas de réponse sans outil ») qui lui faisait appeler cet
  // outil pour une simple réaction. La transcription de sa phrase arrive souvent après l'appel de l'outil : elle est attendue 1,5 s au plus ; sans
  // elle, ce qu'il a dit dans les 20 dernières secondes décide ; rien du tout : l'heure est donnée.
  async _heureOutil(c) {
    const conv = this.convId, tour = this._turnN;
    const frais = () => ((this._heard || []).filter((h) => h.n === tour).map((h) => h.text).join(' ') + ' ' + String(this.brain.inText || '')).trim();
    for (let i = 0; i < 6 && !frais(); i++) await sleep(250);
    if (conv !== this.convId || !this.brain.open) return;
    const dit = frais() || this._entenduRecent(20000).trim();
    const refus = !!dit && !VP.demandeHeure(dit);
    if (refus) this.log(`Outil date_et_heure : il n'a pas demandé l'heure (« ${dit.slice(-100)} ») — pas donnée`, true);
    this.brain.respond([{ id: c.id, name: c.name, response: { result: refus ? "Il ne t'a PAS demandé l'heure ni la date : ne les dis pas. Réponds seulement à ce qu'il vient de dire ; si ce n'était pas une demande (une réaction, un bruit), ne dis rien du tout." : fmtDate() } }]);
  }

  // Durée d'un outil (recherche, CRM) : comptée dans le tour en cours (il a déjà dit « je regarde… »), sinon dans le suivant.
  // Avant, elle restait en attente et s'affichait sur une réponse sans rapport (journal du 25/10/26, 09h14).
  _noteToolMs(ms) { if (this._liveTurn) this._liveTurn.search = (this._liveTurn.search || 0) + ms; else this._searchMs = ms; }

  // Trouve l'info : recherche Google ; si Google la refuse (quota de recherche…), même question sans Internet, réponse prudente.
  // 1. Tavily par le script de Timothée (gratuit : 1 000 recherches par mois) ; 2. recherche Google de Gemini (pas gratuite
  // sur les Gemini 3) ; 3. sans Internet. raw : renvoie les infos trouvées telles quelles (le mode direct les reformule lui-même).
  async _lookup(question, signal, t0 = performance.now(), { raw = false } = {}) {
    const key = this.settings.apiKey, sys = this._system('eco-search');
    if (this.remote.on) {
      try {
        const r = await this.remote.ask({ action: 'chercher', question }, signal);
        if (r && r.ok) {
          const info = [r.reponse ? `Réponse trouvée : ${r.reponse}` : '', ...(r.resultats || []).slice(0, 4).map((x, i) => `Source ${i + 1} (${x.titre}) : ${x.extrait}`)].filter(Boolean).join('\n');
          this.log(`Recherche Tavily faite en ${((performance.now() - t0) / 1000).toFixed(1)} s (${(r.resultats || []).length} résultat(s))`);
          this._searchState = 'Tavily ✓';
          if (!info) return "Je n'ai rien trouvé.";
          if (raw) return `${info}\nRéponds à l'oral en une à trois phrases, sans lire de liens ni d'adresses web.`;
          const out = await this.eco.ask({ key, system: sys, search: true, web: false, fresh: true, signal,
            text: `[Question : « ${question} ». Résultats d'une recherche Internet :\n${info}\nRéponds à partir de ces résultats, au format JSON demandé.]` });
          return sayable(out.reponse) || "Je n'ai rien trouvé de sûr.";
        }
        this._searchState = 'Tavily refusé : ' + ((r && r.erreur) || '?');
        this.log('Recherche Tavily impossible : ' + ((r && r.erreur) || 'réponse vide'));
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        this._searchState = 'Tavily injoignable : ' + e.message;
        this.log('Recherche Tavily impossible : ' + e.message);
      }
    }
    const noWeb = () => this.eco.ask({ key, system: sys, search: true, web: false, fresh: true, signal,
      text: `[Question : « ${question} ». La recherche Internet est impossible pour l'instant : réponds avec ce que tu sais en le précisant, ou dis que tu ne peux pas savoir. Réponds au format JSON demandé.]` });
    let out, until = 0;
    try { until = +localStorage.getItem('wilson.rechercheRefusee') || 0; } catch (_) {}
    if (until > Date.now()) out = await noWeb();                                   // Google refuse la recherche en ce moment : pas d'essai inutile
    else {
      try {
        out = await this.eco.ask({ key, system: sys, search: true, fresh: true, signal, text: `[Question : « ${question} ». Fais une recherche Google, puis réponds au format JSON demandé.]` });
      } catch (e) {
        if (e.name === 'AbortError' || e.auth) throw e;
        this.log('Recherche Google refusée : ' + e.message + ' → réponse sans Internet');
        out = await noWeb();
        // Sans Internet ça marche : c'est bien la recherche qui est refusée (quota) → on ne la retente pas avant 6 h.
        if (e.quota) { try { localStorage.setItem('wilson.rechercheRefusee', String(Date.now() + 6 * 3600000)); } catch (_) {} }
      }
    }
    this.log(`Recherche faite en ${((performance.now() - t0) / 1000).toFixed(1)} s (${out.model}${out.searched ? ', avec Google' : ', sans résultat Google'})`);
    return sayable(out.reponse) || "Je n'ai rien trouvé de sûr.";
  }

  // Outil « chercher » du mode direct : Wilson dit qu'il cherche, l'appli interroge Gemini Flash-Lite + Google Search,
  // et le résultat lui est rendu dès qu'il arrive (filet de sécurité : 30 s).
  // Remplace la recherche intégrée de Gemini Live, restée bloquée sur « je cherche ça tout de suite » le 23/10/26.
  async _search(call, question) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    this.face.setEmotion('reflexion', SEARCH_MAX_MS + 2000, 0.6);
    const pid = this.pill('Je cherche sur Internet…');
    this.log(`Recherche (direct) : « ${question.slice(0, 120)} »`, true);
    const timer = setTimeout(() => ctl.abort(), SEARCH_MAX_MS);
    let result;
    try { result = await this._lookup(question, ctl.signal, t0, { raw: true }); }
    catch (e) {
      if (!this._searches.has(call.id)) return;                                  // annulée : rien à répondre
      result = e.name === 'AbortError' ? "La recherche a pris trop de temps. Dis-le simplement, en une phrase."
        : "Je n'ai pas pu obtenir l'information (Google refuse pour l'instant). Dis-le simplement.";
      this.log(`Recherche impossible (${((performance.now() - t0) / 1000).toFixed(1)} s) : ${e.name === 'AbortError' ? 'trop longue' : e.message}`);
    } finally { clearTimeout(timer); }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id);
    this._noteToolMs(performance.now() - t0);
    this.face.clearEmotion(); this.pillEnd(pid, true, '');
    this.brain.respond([{ id: call.id, name: call.name, response: { result } }]);
    // Filet de sécurité : si Gemini ne dit rien 6 s après le résultat, on lui demande de répondre.
    const n = this._modelOut;
    setTimeout(() => {
      if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
      this.log('Pas de réponse 6 s après la recherche : relance');
      this.brain.sendText('[Donne maintenant ta réponse à voix haute, en français, à partir du résultat de la recherche.]');
    }, 6000);
  }
}
