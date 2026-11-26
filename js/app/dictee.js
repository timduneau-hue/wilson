// Wilson — méthodes de la classe App (js/app.js) : la dictée d'un compte rendu ou d'un long texte, avec le bouton « J'ai fini ».
// Remarque de Timothée du 26/11/26, 09h25-09h26 (en voiture) : « quand j'ai un compte rendu à saisir, tu mets un petit bouton ;
// j'appuie et là tu compiles tout, au lieu d'envoyer toutes les infos tout de suite, parce que j'ai pas le temps de finir mes
// phrases ». Ce matin-là (09h12-09h15), chaque pause de sa dictée terminait son tour : Wilson relisait tout le compte rendu et
// redemandait « Je l'enregistre ? » cinq fois de suite. Pendant la dictée, Wilson se tait : ce qu'il dit est mis bout à bout,
// sans réponse ni outil ; « J'ai fini » (le bouton, l'écran touché, ou « j'ai fini », « c'est tout » à la fin d'une phrase) donne
// tout le texte d'un coup à Gemini, qui le met au propre et prépare UNE écriture, relue une seule fois.
import * as VP from '../voiture.js';
import { $, esc } from './commun.js';

const DICTEE_ANNONCE_MS = 8000;           // il n'a rien dit après l'ouverture : la dictée commence quand même
const DICTEE_CALME_MS = 3 * 60000;        // 3 min sans un mot pendant la dictée : elle se termine toute seule
const DICTEE_COUPEE_MS = 15 * 60000;      // coupée (appel, réseau) : reprise à la discussion suivante pendant 15 min
// Texte qui n'est pas encore le contenu : « Visite », « Appel », « Compte rendu de visite », « Visite avec Marie Durand ».
const TEXTE_VIDE = /^(?:(?:un |le )?compte[- ]rendu(?: d[eu']\s*(?:la |l')?(?:visite|appel|rendez-vous|rdv))?|(?:une |la )?visite|(?:un |l')?appel|rdv|rendez-vous|note|tache|passage|rien)?(?:\s+(?:avec|chez|pour|de|a)\s+[^,.;:!?]{1,60})?[\s.!]*$/;
const VEUT_DICTER = /\bcompte[- ]?rendus?\b|\bcr de (visite|l'appel)\b|\bdict(er|e|ee|es)\b|\blong(ue)? (texte|note)\b|\bj'ai (plein de|des) (choses|trucs) a (noter|dire)\b/;
// « J'ai fini », « fin de la dictée » à la fin de ce qu'il vient de dire ; « c'est tout », « terminé » dits seuls (« le chantier
// est terminé » reste dans la dictée).
const FIN = /(?:^|[\s,.;!?])(?:(?:bon|voila|ok|alors|et|euh)[\s,]+)*(?:j'ai (?:fini|termine)|fin de (?:la )?dictee)(?:[\s,]+wilson)?[\s.!?]*$|^\s*(?:(?:bon|voila|ok|alors|euh)[\s,]+)*(?:c'est (?:tout|fini|termine)|termine|stop)(?:[\s,]+wilson)?[\s.!?]*$/;
const ANNULE = /^\s*(?:non[\s,]+)?(?:annule(?:r|z)?|laisse tomber|oublie)(?:[\s,]+(?:la dictee|tout|ca|le compte[- ]rendu))?[\s.!?]*$/;

export class DicteeMethodes {

  // crm_noter sans le contenu (texte vide, ou seulement « Visite » quand il annonce un compte rendu) : la dictée s'ouvre.
  _dicteeVoulue(call) {
    if (this.mode !== 'live' || !this.brain.open || !this.enVoiture) return false;
    const a = call.args || {}, type = String(a.type || 'tache');
    if (type === 'rdv' || this._dictee) return false;
    const t = VP.plat(String(a.texte || '')).trim();
    if (!t) return true;
    if (!TEXTE_VIDE.test(t)) return false;
    const dit = VP.plat(this._entenduRecent ? this._entenduRecent(20000) : '');
    return VEUT_DICTER.test(dit) || VEUT_DICTER.test(t);
  }

  _dicteeOuvrir(call, { reprise = null } = {}) {
    const a = { ...(call ? call.args || {} : reprise.args) };
    const pour = [a.client, a.contact].filter(Boolean).join(', ');
    const quoi = a.type === 'compte_rendu' ? `le compte rendu${a.echange === 'appel' ? ' de l\'appel' : a.echange === 'visite' ? ' de la visite' : ''}` : a.type === 'tache' ? 'la tâche' : 'la note';
    const D = this._dictee = { args: a, pour, quoi, segments: reprise ? reprise.segments.slice() : [], etat: 'annonce', conv: this.convId, t0: performance.now(), dernierAt: performance.now(), reponduAt: 0 };
    if (call && call.suite) D.segments.push(String(call.suite).trim());           // il avait déjà commencé à dicter
    this._dicteeBouton();
    clearInterval(this._dicteeT); this._dicteeT = setInterval(() => this._dicteeVeille(), 1000);
    this.log(`Dictée ${reprise ? 'reprise' : 'ouverte'} : ${quoi}${pour ? ' pour ' + pour : ''} — bouton « J'ai fini » à l'écran, Wilson se tait jusque-là`, true);
    const phrase = reprise ? 'On reprend ta dictée, je t\'écoute. Touche « J\'ai fini » quand tu as terminé.' : `Je t'écoute${pour ? ' pour ' + pour : ''}. Prends ton temps, et touche « J'ai fini » quand tu as terminé.`;
    const texte = `Dictée ouverte : rien n'est encore écrit. Dis seulement : « ${phrase} » Ensuite, tant qu'il dicte, tu ne dis RIEN (aucun mot, aucune relecture, aucune question) et tu n'appelles aucun outil : l'appli met tout bout à bout et te donnera tout son texte quand il aura fini.`;
    D.reponduAt = performance.now();
    if (!call) this.brain.sendText(`[Dis seulement : « ${phrase} » Puis tu te tais : tant qu'il dicte, tu ne dis rien et tu n'appelles aucun outil.]`);
    else if (call.annule) this.brain.sendText(`[Résultat de crm_noter (demandé juste avant, il parlait encore) : ${texte}]`);
    else this.brain.respond([{ id: call.id, name: call.name, response: { result: texte } }]);
  }

  // Wilson écoute la dictée (sa voix est coupée, ses outils refusés). L'annonce faite (ou 8 s sans rien), la dictée commence.
  _dicteeEcoute() {
    const D = this._dictee;
    if (!D || D.conv !== this.convId) return false;
    if (D.etat === 'annonce' && D.reponduAt && performance.now() - D.reponduAt > DICTEE_ANNONCE_MS && !this.audio.playing) { D.etat = 'ecoute'; this.log('Dictée : Wilson n\'a rien annoncé, la dictée commence quand même'); }
    return D.etat === 'ecoute';
  }

  // Fin d'un tour du direct. Renvoie true si la dictée l'a pris (rien d'autre à faire pour ce tour).
  _dicteeTour(user, wilson) {
    const D = this._dictee;
    if (!D || D.conv !== this.convId) return false;
    if (D.etat === 'annonce') {
      if (wilson && D.reponduAt && (this._voixDepuis || 0) > D.reponduAt) { D.etat = 'ecoute'; D.dernierAt = performance.now(); this.log('Dictée : annonce faite, j\'écoute sans rien dire'); }
      return false;                                                         // l'annonce elle-même : tour normal
    }
    if (!this._dicteeEcoute()) return false;
    const u = String(user || '').trim();
    if (wilson) this.log(`Dictée : Wilson se tait (il aurait dit « ${String(wilson).slice(0, 100)} »)`);
    if (!u) return true;
    D.dernierAt = performance.now();
    this.log(`Dictée : « ${u.slice(0, 600)} »`, true);
    const p = VP.plat(u);
    if (ANNULE.test(p)) { this._dicteeAnnuler('il a dit « ' + u.slice(0, 40) + ' »'); return true; }
    const m = FIN.exec(p);
    if (m) {
      const reste = u.slice(0, m.index).replace(/[\s,;]+$/, '').trim();       // plat() garde la longueur du texte
      if (reste) D.segments.push(reste);
      this._dicteeFinir('il a dit « ' + u.slice(m.index).trim().slice(0, 30) + ' »');
      return true;
    }
    D.segments.push(u);
    return true;
  }

  // Le bouton, ou l'écran touché pendant la dictée.
  _dicteeFinir(pourquoi) {
    const D = this._dictee; if (!D || D.etat === 'fini') return;
    D.etat = 'fini'; this._dictee = null; clearInterval(this._dicteeT); this.hideCard('dictee');
    const texte = D.segments.join(' ').replace(/\s+/g, ' ').trim();
    this.log(`Dictée finie (${pourquoi}) : ${texte ? `${texte.split(' ').length} mots` : 'rien de dicté'}`, true);
    this._permettre(30000, 'fin de la dictée'); this._resumedAt = this.lastActivity = performance.now();
    if (!(this.state === 'conversation' && this.mode === 'live' && this.brain.open)) return;
    const a = D.args, champs = [`type ${a.type || 'compte_rendu'}`, a.client ? `client « ${a.client} »` : '', a.contact ? `contact « ${a.contact} »` : '', a.echange ? `échange ${a.echange}` : '', a.date ? `date « ${a.date} »` : ''].filter(Boolean).join(', ');
    if (!texte) { this.brain.sendText(`[La dictée est finie mais il n'a rien dicté. Demande-lui seulement, en une phrase, ce qu'il veut noter${D.pour ? ' pour ' + D.pour : ''}.]`); return; }
    this._noteSource(texte);
    this.brain.sendText(`[Dictée finie (${pourquoi}). Voici TOUT ce qu'il a dicté, mot pour mot (transcription parfois approximative) : « ${texte.slice(0, 4000)} ». Mets-le au propre en un seul texte, dans l'ordre, sans rien inventer ni rien perdre (tu peux corriger un mot visiblement mal transcrit), puis appelle crm_noter UNE seule fois (${champs}, texte = ce texte mis au propre), sans rien dire avant ; relis-lui ensuite la phrase préparée une fois et demande « Je l'enregistre ? ».]`);
  }

  _dicteeAnnuler(pourquoi) {
    const D = this._dictee; if (!D) return;
    this._dictee = null; clearInterval(this._dicteeT); this.hideCard('dictee');
    this.log(`Dictée annulée (${pourquoi}) : rien n'est noté`, true);
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) { this._permettre(30000, 'dictée annulée'); this.brain.sendText('[Il a annulé la dictée : rien n\'est noté. Dis seulement « D\'accord, je ne note rien. »]'); }
  }

  // Chaque seconde : 3 min sans un mot → finie toute seule ; discussion coupée (appel, réseau) → gardée pour la suivante.
  _dicteeVeille() {
    const D = this._dictee; if (!D) { clearInterval(this._dicteeT); return; }
    if (D.conv !== this.convId) {
      clearInterval(this._dicteeT); this.hideCard('dictee');
      if (D.segments.length) { D.etat = 'coupee'; D.coupeeAt = Date.now(); this.log(`Dictée coupée (fin de la discussion) : ${D.segments.length} morceau(x) gardé(s), elle reprendra à la discussion suivante`, true); }
      else { this._dictee = null; this.log('Dictée coupée avant qu\'il ait rien dicté : abandonnée'); }
      return;
    }
    if (D.etat === 'ecoute' && performance.now() - Math.max(D.dernierAt, this._heardAt || 0) > DICTEE_CALME_MS) this._dicteeFinir('3 min sans un mot');
  }

  // Au début d'une discussion : une dictée coupée par un appel reprend (rien de ce qu'il a déjà dicté n'est perdu).
  _dicteeReprendre() {
    const D = this._dictee;
    if (!D || D.etat !== 'coupee') return false;
    if (Date.now() - D.coupeeAt > DICTEE_COUPEE_MS || this.mode !== 'live' || !this.brain.open) { this._dictee = null; this.log('Dictée coupée depuis plus de 15 min : abandonnée'); return false; }
    this._dictee = null;
    this._dicteeOuvrir(null, { reprise: D });
    return true;
  }

  _dicteeBouton() {
    const el = $('cards'), D = this._dictee; if (!el || !D) return;
    el.innerHTML = `<div class="card dictee" data-kind="dictee"><div class="card-t">Dictée${D.pour ? ' — ' + esc(D.pour) : ''}</div><div class="card-r">Parle tranquillement : je ne t'interromps pas.</div>`
      + `<div class="card-b"><button class="card-ok card-fini" type="button">J'ai fini</button><button class="card-x" type="button">Annuler</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-fini').addEventListener('click', (ev) => { ev.stopPropagation(); this._dicteeFinir('bouton « J\'ai fini »'); });
    el.querySelector('.card-x').addEventListener('click', (ev) => { ev.stopPropagation(); this._dicteeAnnuler('bouton « Annuler »'); });
    clearTimeout(this._cardT);
    this._ecran = { kind: 'dictee', at: Date.now() };
  }
}
