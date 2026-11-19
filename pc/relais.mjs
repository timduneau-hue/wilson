// Wilson — relais Claude du PC de la maison (PLAN.md, section 10).
// Attend les questions difficiles de Wilson dans la file du script « Wilson journal », les passe à Claude Code (claude -p,
// abonnement de Timothée, aucune clé API) et rend la réponse. Claude n'a que la recherche Internet, la lecture de pages et
// le CRM en lecture seule (crm-mcp.mjs) : aucune commande, aucun fichier, aucune écriture.
// Relais 10 (décision de Timothée du 16/11/26) : l'ATELIER. Une remarque faite à Wilson (« il y a un bug ») arrive ici tout de
// suite ; Claude corrige le code (dépôts wilson et crm-boschat, clonés dans atelier\) et lance les tests, sans pouvoir ni
// pousser ni publier lui-même ; c'est le relais qui ouvre ensuite la demande de modification sur GitHub (gh, compte de
// Timothée). Wilson et CRM : publiés seuls si les vérifications passent (plus aucun Merge depuis le 19/11/26).
// Lancé tout seul à l'ouverture de session (boucle.cmd, fenêtre cachée) ; Node 18 ou plus, sans bibliothèque.

import { spawn, spawnSync, execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 'relais 10';
const DEPOT = 'https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc/';
const FICHIERS = ['relais.mjs', 'crm-mcp.mjs', 'consigne.md', 'mail-mcp.mjs', 'garde-chrome.mjs', 'consigne-mail.md', 'consigne-correction.md'];
const MAJ_MS = 6 * 3600000;            // le relais se met à jour tout seul depuis GitHub, toutes les 6 h (demande du 06/11/26)
const DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_EN_COURS = 2;                 // deux questions en même temps au plus
const CLAUDE_MAX_MS = 4 * 60000;        // au-delà, Claude est arrêté (Wilson a dit qu'il attendait 4 min au plus)
const MAX_TOURS = 30;
const OUTILS = 'WebSearch,WebFetch';
// E-mails (demande du 11/11/26) : question de type « mail ». Claude n'a alors PAS Internet (un e-mail piégé ne doit pas pouvoir
// faire sortir ce qu'il lit), seulement le Gmail perso (mail-mcp.mjs), le CRM en lecture et, pour la boîte pro, Chrome
// limité à Outlook par garde-chrome.mjs. Outlook par Chrome est lent : 9 min au plus, 60 étapes.
export const MAIL_MAX_MS = 9 * 60000;
const MAIL_TOURS = 60;
const CHROME_INTERDITS = ['javascript_tool', 'file_upload', 'upload_image', 'gif_creator', 'shortcuts_execute', 'shortcuts_list', 'read_network_requests', 'read_console_messages', 'switch_browser'].map((x) => 'mcp__claude-in-chrome__' + x).join(',');
export const MARQUE_DIRE = /^\s*(?:\*\*)?À DIRE\s*:?(?:\*\*)?\s*:?\s*$/im;
export const MARQUE_DETAIL = /^\s*(?:\*\*)?DÉTAIL\s*:?(?:\*\*)?\s*:?\s*$/im;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const heure = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
const jour = (d = new Date()) => `${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;

// ---------- Ce que Claude rend : « À DIRE » (oral) et « DÉTAIL » (références, sources) ----------
// Journal du 10/11/26, 08h47:23 et 08h48:58 : Claude a « répondu » « You've hit your weekly limit · resets 4am (Europe/Paris) »
// (limite d'utilisation de l'abonnement), et Wilson l'a lu comme la réponse du CRM. Ce message est une erreur, pas une réponse.
export const LIMITE = /hit your .{0,30}limit|usage limit|limit (reached|exceeded)|limit\s*·\s*resets|rate.?limit|out of (extra )?usage|credit balance is too low/i;
export function limiteAtteinte(texte) { const t = String(texte || ''); return t.length < 400 && LIMITE.test(t); }
// Heure de reprise annoncée : « resets 4am », « resets 4:30pm », « resets 16h » ; sinon dans une heure (même règle que js/claude.js).
export function repriseLimite(texte, maintenant = new Date()) {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm)?/i.exec(String(texte || ''));
  if (!m) return maintenant.getTime() + 3600000;
  let h = +m[1] % 24; const mn = +(m[2] || 0);
  if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12;
  if (m[3] && /am/i.test(m[3]) && h === 12) h = 0;
  const d = new Date(maintenant); d.setHours(h, mn, 0, 0);
  if (d.getTime() <= maintenant.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// W16 : effort de réflexion. config.json « effort » l'impose s'il est écrit ; sinon « high », TOUJOURS : décision de Timothée
// du 16/11/26 (« je préfère avoir une information fiable qu'une information pas fiable ; en voiture j'ai le temps d'attendre »).
// Avant : « medium » pour une question CRM courte et simple.
export function effortPour(q, impose) {
  return impose || 'high';
}
// Modèle de Claude : Opus 5.5 (décision de Timothée du 16/11/26). « sonnet » dans config.json était seulement la valeur posée
// par l'ancien installateur, pas un choix : il est remplacé ; tout autre modèle écrit dans config.json l'emporte.
export const MODELE_DEFAUT = 'claude-opus-5-5';
export function modelePour(cfgModele) {
  const m = String(cfgModele || '').trim();
  return !m || m === 'sonnet' ? MODELE_DEFAUT : m;
}

// W15 : arrêter Claude ET tout ce qu'il a lancé (Windows : taskkill /T /F ; ailleurs : le groupe de processus).
export function commandeArret(pid, plateforme = process.platform) {
  return plateforme === 'win32' ? ['taskkill', ['/pid', String(pid), '/T', '/F']] : null;
}
export function arreterArbre(p, { plateforme = process.platform, executer = (c, a) => spawnSync(c, a, { windowsHide: true, timeout: 15000 }), tuer = (pid, sig) => process.kill(pid, sig) } = {}) {
  if (!p || !p.pid) return;
  const c = commandeArret(p.pid, plateforme);
  try {
    if (c) executer(c[0], c[1]);
    else tuer(-p.pid, 'SIGKILL');
  } catch (_) { try { p.kill(); } catch (_2) {} }
}

export function decouper(texte) {
  const t = String(texte || '').replace(/\r/g, '').trim();
  const i = t.search(MARQUE_DIRE), j = t.search(MARQUE_DETAIL);
  let dire = t, detail = '';
  if (i >= 0 || j >= 0) {
    const finDire = j > i ? j : t.length;
    dire = i >= 0 ? t.slice(i, finDire).replace(MARQUE_DIRE, '') : t.slice(0, j);
    detail = j >= 0 ? t.slice(j).replace(MARQUE_DETAIL, '') : '';
  }
  dire = dire.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]+/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  return { dire: dire.slice(0, 3000), detail: detail.trim().slice(0, 12000) };
}

// ---------- La demande faite à Claude ----------
export function demande(q, maintenant = new Date()) {
  return [
    `Date et heure : ${jour(maintenant)} ${heure(maintenant)} (heure de Paris).`,
    `Type de question : ${q.type === 'crm' ? 'CRM (ses données de commercial)' : q.type === 'mail' ? `e-mails — boîte à regarder : ${q.boite === 'perso' ? 'PERSO seulement (Gmail)' : q.boite === 'pro' ? 'PRO seulement (Outlook, dans Chrome)' : 'les deux (Gmail perso, et Outlook pro dans Chrome)'}` : 'recherche (Internet, produits, technique)'}.`,
    `Timothée est en voiture : ${q.voiture ? 'oui (réponse très courte, il conduit)' : 'non'}.`,
    `Question de Timothée, dictée à Wilson : « ${q.question} »`,
    q.contexte ? `\nContexte donné par Wilson :\n${q.contexte}` : '',
    q.regles ? `\nRègles du CRM (à suivre pour toute question sur ses données) :\n${q.regles}` : '',
    q.type !== 'crm' && q.crm === false ? '\nCe n\'est pas Timothée qui demande : tu n\'as pas accès à son CRM et tu n\'en parles pas.' : '',
    '\nRéponds dans le format demandé : « À DIRE : » puis « DÉTAIL : ».',
  ].filter(Boolean).join('\n');
}

// consigne : le texte de consigne.md (passé tel quel : --system-prompt remplace la consigne de développeur de Claude Code).
// effort : réflexion de Claude (low, medium, high, xhigh, max) ; « high » par défaut : des réponses fiables (06/11/26).
// crm : le CRM n'est branché que si c'est Timothée qui demande (règle du 06/11/26) ; sinon Claude n'a qu'Internet.
// mail : { pro, reglages } pour une question sur les e-mails (pro : Outlook dans Chrome ; reglages : fichier du crochet de garde).
export function argumentsClaude({ mcp, consigne, modele = MODELE_DEFAUT, effort = 'high', crm = true, mail = null }) {
  if (mail) {
    return ['-p', '--output-format', 'json', '--model', modele, '--effort', effort, '--max-turns', String(MAIL_TOURS),
      '--tools', '', '--allowedTools', `mcp__mail,mcp__crm${mail.pro ? ',mcp__claude-in-chrome' : ''}`, '--permission-mode', 'dontAsk',
      ...(mail.pro ? ['--chrome', '--disallowedTools', CHROME_INTERDITS, '--settings', mail.reglages] : ['--no-chrome']),
      '--mcp-config', mcp, '--strict-mcp-config', '--system-prompt', consigne, '--no-session-persistence'];
  }
  return ['-p', '--output-format', 'json', '--model', modele, '--effort', effort, '--max-turns', String(MAX_TOURS),
    '--tools', OUTILS, '--allowedTools', crm ? `${OUTILS},mcp__crm` : OUTILS, '--permission-mode', 'dontAsk',
    ...(crm ? ['--mcp-config', mcp] : []), '--strict-mcp-config', '--system-prompt', consigne, '--no-session-persistence'];
}

// ---------- L'atelier : corriger le code après une remarque (relais 10, 16/11/26) ----------
export const PROPRIETAIRE = 'timduneau-hue';
export const DEPOTS_ATELIER = { wilson: 'wilson', crm: 'crm-boschat' };
export const ATELIER_MAX_MS = 60 * 60000;           // une heure au plus
const ATELIER_TOURS = 300;
// Claude lit, modifie et lance les tests (node, python) dans atelier\ ; il ne peut ni commiter, ni pousser, ni appeler gh,
// ni aller sur Internet : la publication est faite par le relais lui-même, après lui.
export const ATELIER_OUTILS = 'Read,Edit,Write,Glob,Grep,Bash(node:*),Bash(python:*),Bash(python3:*),Bash(py:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*)';
export const ATELIER_INTERDITS = 'Bash(git push:*),Bash(git commit:*),Bash(git reset:*),Bash(git checkout:*),Bash(git remote:*),Bash(gh:*),Bash(curl:*),Bash(npx:*),Bash(npm:*),WebFetch,WebSearch';
export function argumentsAtelier({ consigne, modele = MODELE_DEFAUT, effort = 'high' }) {
  return ['-p', '--output-format', 'json', '--model', modele, '--effort', effort, '--max-turns', String(ATELIER_TOURS),
    '--tools', 'Read,Edit,Write,Glob,Grep,Bash', '--allowedTools', ATELIER_OUTILS, '--disallowedTools', ATELIER_INTERDITS,
    '--permission-mode', 'dontAsk', '--strict-mcp-config', '--append-system-prompt', consigne, '--no-session-persistence'];
}
const deux = (n) => String(n).padStart(2, '0');
export const dateRemarque = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${deux(d.getHours())}h${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
export const nomBranche = (d = new Date()) => `remarque-${String(d.getFullYear()).slice(2)}${deux(d.getMonth() + 1)}${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}`;
export function demandeCorrection(q, maintenant = new Date()) {
  return [
    `Date et heure : ${jour(maintenant)} ${heure(maintenant)} (heure de Paris).`,
    `Remarque de Timothée, dite à Wilson (${dateRemarque(new Date(q.t || maintenant))}, ${q.appareil || 'appareil inconnu'}) :`,
    `« ${q.question} »`,
    q.contexte ? `\n${q.contexte}` : '',
    '\nLes dépôts sont clonés ici (branche main à jour) : wilson\\ et crm-boschat\\. Un serveur local sert déjà wilson sur http://127.0.0.1:8765.',
    'Termine OBLIGATOIREMENT en écrivant le fichier RESULTAT.json (dans ce dossier), au format décrit dans ta consigne.',
  ].filter(Boolean).join('\n');
}
// Ce que Claude a écrit dans RESULTAT.json, nettoyé (rien d'autre n'est cru).
export function lireResultat(texte) {
  let j = null; try { j = JSON.parse(String(texte || '').replace(/^\uFEFF/, '')); } catch (_) {}
  if (!j || typeof j !== 'object') return null;
  const txt = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').trim().slice(0, n);
  const depot = (x) => x && typeof x === 'object' && txt(x.titre, 120) ? { titre: txt(x.titre, 120).replace(/\s+/g, ' '), description: txt(x.description, 6000) } : null;
  return { dire: txt(j.dire, 600).replace(/\s+/g, ' '), question: txt(j.question, 400).replace(/\s+/g, ' '), wilson: depot(j.wilson), crm: depot(j.crm) };
}

// ---------- Home Assistant (demande de Timothée du 11/11/26 : « occupe-toi de Home Assistant ») ----------
// Du 07/11/26, 09h20, au 11/11/26, 09h46 : la machine virtuelle « HomeAssistant » tournait, mais sans adresse réseau
// (« IPv4 addresses for enp0s3: (No address) » : carte en pont sur le Wi-Fi du PC, adresse jamais reprise) ; rebrancher son
// câble réseau virtuel l'a remise en route tout de suite. Le relais, qui tourne sur ce PC, la surveille : toutes les 5 min,
// Home Assistant répond-il ? Sinon (et seulement si le PC lui-même a du réseau), au plus une fois par 30 min : machine
// arrêtée → démarrée sans fenêtre ; machine en route mais muette deux fois de suite → câble virtuel débranché puis rebranché
// (seulement si le PC l'a déjà vue répondre : la carte en pont sur le Wi-Fi ne se laisse pas toujours joindre par le PC).
// Tout est noté dans le journal de Wilson (« Maison (PC) : … »). config.json : "ha": false pour couper, ou
// { "url": "http://…:8123", "vm": "nom de la machine" }.
export const HA_VERIF_MS = 5 * 60000, HA_ACTION_MS = 30 * 60000;
export class GardeHA {
  constructor({ cfg = {}, journal = () => {}, fetchImpl = globalThis.fetch, vbox, run, maintenant = () => Date.now(), pauseMs = 5000, lookup4 } = {}) {
    const c = cfg.ha === false ? null : (cfg.ha || {});
    // 11/11/26 : ce Home Assistant répond sur le port 80 (http://homeassistant.local), pas sur 8123 : les deux sont essayés.
    this.on = !!c; this.urls = (c && c.url ? [c.url] : ['http://homeassistant.local', 'http://homeassistant.local:8123']).map((u) => String(u).replace(/\/+$/, ''));
    this.url = this.urls[0]; this.vm = (c && c.vm) || '';
    this.journal = journal; this.fetch = fetchImpl; this.maintenant = maintenant;
    this.vbox = vbox !== undefined ? vbox : [process.env.VBOX_MSI_INSTALL_PATH && path.join(process.env.VBOX_MSI_INSTALL_PATH, 'VBoxManage.exe'),
      'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe'].filter(Boolean).find((x) => { try { return fs.existsSync(x); } catch (_) { return false; } }) || '';
    this.run = run || ((args) => new Promise((ok) => execFile(this.vbox, args, { timeout: 60000, windowsHide: true }, (e, out, err) => ok({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') }))));
    this.muet = 0; this.actionAt = 0; this.ip = ''; this.enPanne = 0; this.dit = ''; this.pauseMs = pauseMs; this.dejaVu = false;
    this.dejaVu4 = false; this.sansV4 = false;
    this.lookup4 = lookup4 || (async (h) => { const d = await import('node:dns'); return (await d.promises.lookup(h, { family: 4 })).address; });
  }
  // Panne du 14/11/26 (15h02) : Home Assistant répondait (en IPv6, et par Tailscale), mais sa machine virtuelle n'avait plus
  // d'adresse IPv4 (« ipv4 address: [] », DHCP perdu sur le pont Wi-Fi) : télé, Chromecast et prises Tapo, qui ne parlent
  // qu'en IPv4, étaient tous « injoignables » pendant que tous les voyants étaient au vert. On vérifie donc aussi l'IPv4.
  async repondV4() {
    let v4 = '';
    try { v4 = await this.lookup4(new URL(this.url).hostname); } catch (_) {}
    const ip = v4 || this.ip; if (!ip) return false;
    const port = new URL(this.url).port;
    if (await this.repond(`http://${ip}${port ? ':' + port : ''}`)) { this.ip = ip; return true; }
    return false;
  }
  async repond(url) {
    try { const r = await this.fetch(url + '/manifest.json', { signal: AbortSignal.timeout(8000) }); return r.status > 0; } catch (_) { return false; }
  }
  async vmNom() {
    if (this.vm) return this.vm;
    const r = await this.run(['list', 'vms']);
    const noms = [...r.out.matchAll(/^"(.+)"\s+\{/gm)].map((m) => m[1]);
    return (this.vm = noms.find((n) => /home ?assistant|haos|hass/i.test(n)) || '');
  }
  async enRoute(nom) { const r = await this.run(['list', 'runningvms']); return r.out.split(/\r?\n/).some((l) => l.startsWith(`"${nom}" `)); }
  // pcEnLigne : le PC joint le script de Wilson (sinon, inutile de toucher à Home Assistant).
  async verifier({ pcEnLigne = true } = {}) {
    if (!this.on || !this.vbox) { if (this.on && !this.dit) { this.dit = 'pas de VirtualBox'; this.journal('VirtualBox introuvable sur ce PC : je ne surveille pas Home Assistant'); } return 'coupé'; }
    let ok = false;
    for (const u of [this.url, ...this.urls.filter((x) => x !== this.url)]) if (await this.repond(u)) { ok = true; this.url = u; break; }
    if (!ok && this.ip) { const port = new URL(this.url).port; ok = await this.repond(`http://${this.ip}${port ? ':' + port : ''}`); }
    // Répond, mais plus en IPv4 ? Seulement si le PC l'a déjà jointe en IPv4 (le pont Wi-Fi ne se laisse pas toujours joindre).
    const v4 = ok ? await this.repondV4() : false;
    if (ok && (v4 || !this.dejaVu4)) {
      if (this.enPanne) this.journal(this.sansV4 ? `Home Assistant a retrouvé son adresse IPv4 : les appareils de la maison lui répondent de nouveau (coupé depuis ${Math.round((this.maintenant() - this.enPanne) / 60000)} min)`
        : `Home Assistant répond de nouveau (muet depuis ${Math.round((this.maintenant() - this.enPanne) / 60000)} min)`);
      this.muet = 0; this.enPanne = 0; this.dejaVu = true; this.sansV4 = false; if (v4) this.dejaVu4 = true;
      return 'ok';
    }
    if (ok && !v4) {
      if (!this.sansV4) this.journal('Home Assistant répond, mais plus en IPv4 : il ne joint plus les appareils de la maison (télé, prises), qui seront « injoignables »');
      this.sansV4 = true; this.dejaVu = true;
    }
    this.muet++; if (!this.enPanne) this.enPanne = this.maintenant();
    if (!pcEnLigne) return 'pc hors ligne';
    const nom = await this.vmNom();
    if (!nom) { if (this.dit !== 'pas de vm') { this.dit = 'pas de vm'; this.journal('Home Assistant ne répond pas, et je ne trouve pas sa machine virtuelle dans VirtualBox'); } return 'pas de vm'; }
    if (this.maintenant() - this.actionAt < HA_ACTION_MS) return 'attente';
    if (!(await this.enRoute(nom))) {
      this.actionAt = this.maintenant();
      const r = await this.run(['startvm', nom, '--type', 'headless']);
      this.journal(r.ok ? `Home Assistant ne répondait pas : sa machine virtuelle « ${nom} » était arrêtée, je l'ai démarrée` : `machine virtuelle « ${nom} » arrêtée, démarrage impossible : ${r.err.slice(0, 160)}`);
      return r.ok ? 'démarrée' : 'échec';
    }
    // Le PC ne joint pas toujours la machine en pont sur le Wi-Fi (11/11/26 : refusé depuis le PC alors qu'elle avait son
    // adresse) : le câble n'est rebranché que si le PC l'a déjà vue répondre (sinon « muet » ne veut rien dire).
    if (!this.dejaVu) { if (this.dit !== 'jamais vu') { this.dit = 'jamais vu'; this.journal(`Home Assistant ne répond pas au PC (${this.url}) ; sa machine virtuelle tourne : je ne touche à rien tant que je ne l'ai pas vu répondre une fois`); } return 'jamais vu'; }
    if (this.muet < 2) return 'muet';
    this.actionAt = this.maintenant();
    const a = await this.run(['controlvm', nom, 'setlinkstate1', 'off']);
    await new Promise((ok) => setTimeout(ok, this.pauseMs));
    const b = await this.run(['controlvm', nom, 'setlinkstate1', 'on']);
    this.journal(a.ok && b.ok ? `Home Assistant ${this.sansV4 ? 'sans IPv4' : 'muet'} depuis ${Math.round((this.maintenant() - this.enPanne) / 60000)} min alors que sa machine virtuelle tourne : câble réseau virtuel débranché puis rebranché (il reprend une adresse)`
      : `Home Assistant muet, câble réseau virtuel impossible à rebrancher : ${(a.err || b.err).slice(0, 160)}`);
    return a.ok && b.ok ? 'câble rebranché' : 'échec';
  }
}

// ---------- Le relais ----------
export class Relais {
  constructor({ dir = DIR, config, fetchImpl = globalThis.fetch, lancer, log } = {}) {
    this.dir = dir;
    this.cfg = config || JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    this.fetch = fetchImpl; this.enCours = 0; this.lignes = []; this.stop = false;
    this.lancerClaude = lancer || ((q) => this._claude(q));
    this.log = log || ((m) => this._log(m));
    this.gardeHA = new GardeHA({ cfg: this.cfg, fetchImpl, journal: (m) => { this.log('maison : ' + m); this.lignes.push({ t: Date.now(), m: 'Maison (PC) : ' + m }); } });
    this.scriptOkAt = 0;
    this.vides = 0;          // appels « claude_prendre » restés vides à la suite (W15)
    this.limite = null;      // { jusqua, texte } : limite d'utilisation de Claude atteinte (W16)
  }

  _log(m) {
    const l = `${new Date().toISOString()} ${m}`;
    console.log(l);
    try {
      const f = path.join(this.dir, 'relais.log');
      if (fs.existsSync(f) && fs.statSync(f).size > 1e6) fs.renameSync(f, f + '.1');
      fs.appendFileSync(f, l + os.EOL);
    } catch (_) {}
  }
  // Ligne pour le journal de Wilson (onglet Journal, colonne B « relais 1 · PC ») : Claude le lit pour diagnostiquer.
  journal(m) { this.log(m); this.lignes.push({ t: Date.now(), m: 'Relais Claude : ' + m }); }
  async viderJournal() {
    if (!this.lignes.length) return;
    const lignes = this.lignes.splice(0, 50);
    try { await this.post({ version: `${VERSION} · PC`, appareil: 'PC (relais Claude)', lignes }, 30000, true); }
    catch (e) { this.lignes.unshift(...lignes.slice(-20)); this.log('journal pas envoyé : ' + e.message); }
  }

  async post(o, ms = 40000, texte = false) {
    const r = await this.fetch(this.cfg.script, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(o), signal: AbortSignal.timeout(ms) });
    const t = await r.text();
    if (texte) return t;
    try { return JSON.parse(t); } catch (_) { throw new Error(`réponse illisible du script (${r.status}) : ${t.slice(0, 120)}`); }
  }

  // Mise à jour du relais depuis GitHub : les fichiers ont changé → vérifiés (node --check), remplacés, puis le relais
  // s'arrête et boucle.cmd le relance 15 s plus tard avec le nouveau code. Jamais pendant une question.
  async miseAJour() {
    if (this.enCours) return false;
    const change = [];
    for (const f of FICHIERS) {
      const r = await this.fetch(DEPOT + f + '?t=' + Date.now(), { signal: AbortSignal.timeout(30000), cache: 'no-store' });
      if (!r.ok) return false;
      const neuf = await r.text(), chemin = path.join(this.dir, f);
      const ici = fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : '';
      if (neuf.length > 200 && neuf !== ici) change.push([f, neuf]);
    }
    if (!change.length) return false;
    for (const [f, t] of change) {
      if (!f.endsWith('.mjs')) continue;
      const tmp = path.join(this.dir, f.replace(/\.mjs$/, '.neuf.mjs'));
      fs.writeFileSync(tmp, t);
      const v = spawnSync(process.execPath, ['--check', tmp], { windowsHide: true });
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (v.status !== 0) { this.journal(`mise à jour ignorée : ${f} ne passe pas la vérification`); return false; }
    }
    if (this.enCours || this.atelier) return false;
    for (const [f, t] of change) fs.writeFileSync(path.join(this.dir, f), t);
    this.journal(`mis à jour depuis GitHub (${change.map((x) => x[0]).join(', ')}) : je redémarre`);
    await this.viderJournal();
    return true;
  }

  async boucle() {
    let attente = 5000;
    this.journal(`démarré (${VERSION}, ${os.hostname()}, Node ${process.versions.node}, ${modelePour(this.cfg.modele)}, effort ${this.cfg.effort || 'high'})`);
    let dernierJournal = Date.now(), derniereMaj = Date.now() - MAJ_MS + 60000;   // 1re vérification une minute après le démarrage
    let derniereHA = Date.now() - HA_VERIF_MS + 90000, verifHA = null;                // Home Assistant : 1re vérification 1 min 30 après
    while (!this.stop) {
      try {
        if (!verifHA && Date.now() - derniereHA > HA_VERIF_MS) {
          derniereHA = Date.now();
          verifHA = this.gardeHA.verifier({ pcEnLigne: Date.now() - this.scriptOkAt < 3 * 60000 }).catch((e) => this.log('maison : vérification impossible : ' + e.message)).finally(() => { verifHA = null; });
        }
        if (Date.now() - dernierJournal > 10000) { dernierJournal = Date.now(); await this.viderJournal(); }
        if (!this.enCours && !this.atelier && Date.now() - derniereMaj > MAJ_MS && this.majAuto !== false) {
          derniereMaj = Date.now();
          try { if (await this.miseAJour()) { this.stop = true; process.exit(0); } } catch (e) { this.log('mise à jour impossible : ' + e.message); }
        }
        if (this.enCours >= MAX_EN_COURS) {                                   // occupé : il dit seulement qu'il est là
          await this.post({ action: 'claude_prendre', secret: this.cfg.secret, max: 0, occupe: this.enCours, version: VERSION, limite: this.limiteActive() }, 30000);
          await pause(20000); continue;
        }
        const t0 = Date.now();
        const r = await this.post({ action: 'claude_prendre', secret: this.cfg.secret, attente: 25, occupe: this.enCours, version: VERSION, limite: this.limiteActive() }, 45000);
        if (!r.ok) throw new Error(r.erreur || 'refus du script');
        attente = 5000; this.scriptOkAt = Date.now();
        if (r.question) { this.vides = 0; this.traiter(r.question); }
        else {
          // W15 : pause entre deux appels vides. Le script attend d'ordinaire ~25 s ; s'il répond tout de suite (quota, panne),
          // la pause double à chaque appel vide de suite (2 s, 4 s… jusqu'à 30 s) au lieu de le harceler.
          this.vides++;
          if (Date.now() - t0 < 2000) await pause(Math.min(1000 * 2 ** Math.min(this.vides, 5), 30000));
          else await pause(500);
        }
      } catch (e) {
        this.log(`script injoignable ou refus : ${e.message} — nouvel essai dans ${Math.round(attente / 1000)} s`);
        await pause(attente); attente = Math.min(attente * 2, 60000);
      }
    }
  }

  // W16 : la limite en cours (pour la signaler au script), ou null quand elle est passée.
  limiteActive() {
    if (this.limite && this.limite.jusqua > Date.now()) return this.limite;
    this.limite = null; return null;
  }
  async traiter(q) {
    if (q && q.type === 'correction') { this.corriger(q); return; }   // l'atelier : à part, une à la fois (relais 10)
    this.enCours++;
    const t0 = Date.now();
    this.journal(`question reçue (${q.type}${q.voiture ? ', en voiture' : ''}) : « ${String(q.question).slice(0, 160)} »`);
    let rendu;
    try {
      // Limite déjà atteinte : on ne lance pas Claude pour rien, Wilson bascule tout de suite.
      const lim = this.limiteActive();
      if (lim) throw new Error(`limite d'utilisation de Claude atteinte : ${lim.texte}`);
      const r = await this.lancerClaude(q);
      const s = Math.round((Date.now() - t0) / 1000);
      if (!r.dire) throw new Error('Claude n\'a rien répondu');
      rendu = { ok: true, dire: r.dire, detail: r.detail, duree: s, etapes: r.etapes || 0 };
      this.journal(`réponse en ${s} s (${r.etapes || '?'} étape(s)) : ${r.dire.slice(0, 200)}`);
    } catch (e) {
      rendu = { ok: false, erreur: String(e.message || e).slice(0, 400), duree: Math.round((Date.now() - t0) / 1000) };
      if (limiteAtteinte(rendu.erreur) && !this.limiteActive()) {                 // W16 : noter la limite, la signaler au script
        this.limite = { jusqua: repriseLimite(rendu.erreur), texte: rendu.erreur.replace(/^limite d'utilisation de Claude atteinte\s*:\s*/i, '').slice(0, 200) };
        this.journal(`limite d'utilisation de Claude atteinte : plus de question avant ${heure(new Date(this.limite.jusqua))}`);
      }
      this.journal(`échec après ${rendu.duree} s : ${rendu.erreur}`);
    }
    for (let n = 0; n < 4; n++) {                                           // rendre la réponse, même si le réseau hoquette
      try { const r = await this.post({ action: 'claude_rendre', secret: this.cfg.secret, id: q.id, ...rendu }, 30000); if (r.ok) break; this.log('réponse refusée : ' + r.erreur); break; }
      catch (e) { this.log('réponse pas rendue : ' + e.message); await pause(3000 * (n + 1)); }
    }
    this.enCours--;
    await this.viderJournal();
  }

  // ---------- L'atelier (relais 10) ----------
  corriger(q) {
    this.atelierFile = (this.atelierFile || Promise.resolve()).then(() => this._corriger(q)).catch((e) => this.log('atelier : ' + e.message));
    return this.atelierFile;
  }
  outil(nom) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const connus = { git: [path.join(pf, 'Git', 'cmd', 'git.exe')], gh: [path.join(pf, 'GitHub CLI', 'gh.exe')],
      python: [path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'), path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe')] };
    if (this.cfg[nom] && fs.existsSync(this.cfg[nom])) return this.cfg[nom];
    for (const x of connus[nom] || []) if (fs.existsSync(x)) return x;
    try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', [nom], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim(); } catch (_) {}
    throw new Error(`${nom} introuvable sur le PC : lancer l'installation de l'atelier (atelier.ps1)`);
  }
  cmd(nom, args, cwd, ms = 120000) {
    return execFileSync(this.outil(nom), args, { cwd, encoding: 'utf8', windowsHide: true, timeout: ms, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  preparerDepot(base, depot) {
    const dir = path.join(base, depot);
    if (!fs.existsSync(path.join(dir, '.git'))) { this.cmd('gh', ['repo', 'clone', `${PROPRIETAIRE}/${depot}`, dir, '--', '--depth', '50'], base, 600000); return dir; }
    this.cmd('git', ['fetch', '--depth', '50', 'origin', 'main'], dir, 300000);
    this.cmd('git', ['checkout', '-f', '-B', 'main', 'origin/main'], dir);
    this.cmd('git', ['clean', '-fd'], dir);
    return dir;
  }
  // La demande de modification : le relais (pas Claude) commite, pousse une branche et ouvre la demande.
  publier(base, cle, info, q, quand) {
    const depot = DEPOTS_ATELIER[cle], dir = path.join(base, depot);
    const change = this.cmd('git', ['status', '--porcelain'], dir);
    if (!change) return null;
    if (!info) { this.cmd('git', ['checkout', '-f', 'main'], dir); this.cmd('git', ['clean', '-fd'], dir); this.journal(`atelier : ${depot} modifié sans titre dans RESULTAT.json, rien de publié`); return null; }
    const branche = nomBranche(quand);
    this.cmd('git', ['checkout', '-B', branche], dir);
    this.cmd('git', ['add', '-A'], dir);
    const msg = `${info.titre}\n\n${info.description}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
    this.cmd('git', ['-c', 'user.name=Claude (PC de la maison)', '-c', 'user.email=noreply@anthropic.com', 'commit', '-q', '-m', msg], dir);
    this.cmd('git', ['push', '-q', '-u', 'origin', branche], dir, 300000);
    // dépôt public (wilson) : jamais la remarque mot pour mot (un nom de client pourrait s'y trouver)
    const corps = `${info.description}\n\n${cle === 'crm' ? `Remarque de Timothée : « ${q.question} »\n\n` : ''}Demande ouverte par l'atelier du PC de la maison (relais 10), après une remarque faite à Wilson.\n\nRemarques traitées jusqu'au ${dateRemarque(new Date(q.t || Date.now()))}`;
    const url = this.cmd('gh', ['pr', 'create', '--repo', `${PROPRIETAIRE}/${depot}`, '--base', 'main', '--head', branche, '--title', info.titre, '--body', corps], dir, 120000);
    this.cmd('git', ['checkout', '-f', 'main'], dir);
    this.journal(`atelier : demande ouverte sur ${depot} : ${url.split(/\s+/).pop()}`);
    return { depot, url: url.split(/\s+/).pop() };
  }
  serveurTests(dir) {
    try { return spawn(this.outil('python'), ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: dir, windowsHide: true, stdio: 'ignore', detached: process.platform !== 'win32' }); }
    catch (e) { this.journal('atelier : serveur de test impossible : ' + e.message); return null; }
  }
  async _corriger(q) {
    this.atelier = true;
    const t0 = Date.now(), quand = new Date();
    this.journal(`correction reçue (${q.appareil || '?'}) : « ${String(q.question).slice(0, 160)} »`);
    let rendu;
    try {
      const lim = this.limiteActive();
      if (lim) throw new Error(`limite d'utilisation de Claude atteinte : ${lim.texte}`);
      const base = path.join(this.dir, 'atelier'); fs.mkdirSync(base, { recursive: true });
      this.cmd('gh', ['auth', 'status'], base);                              // GitHub branché ? (sinon : atelier.ps1)
      for (const d of Object.values(DEPOTS_ATELIER)) this.preparerDepot(base, d);
      const fRes = path.join(base, 'RESULTAT.json'); try { fs.unlinkSync(fRes); } catch (_) {}
      const serveur = this.serveurTests(path.join(base, DEPOTS_ATELIER.wilson));
      let r;
      try { r = await this._claudeAtelier(q, base); } finally { if (serveur) arreterArbre(serveur); }
      const res = lireResultat(fs.existsSync(fRes) ? fs.readFileSync(fRes, 'utf8') : '') || { dire: '', question: '', wilson: null, crm: null };
      const liens = [];
      for (const cle of Object.keys(DEPOTS_ATELIER)) { const l = this.publier(base, cle, res[cle], q, quand); if (l) liens.push(l); }
      const s = Math.round((Date.now() - t0) / 1000);
      const dire = res.dire || (liens.length ? 'Correction proposée.' : res.question ? '' : 'Rien à corriger dans le code pour cette remarque.');
      rendu = { ok: true, dire, question: res.question || '', detail: liens.map((l) => `${l.depot === 'crm-boschat' ? 'CRM' : 'Wilson'} (publié seul si les vérifications passent) : ${l.url}`).join('\n'), duree: s, etapes: r.etapes || 0 };
      this.journal(`correction finie en ${Math.round(s / 60)} min : ${dire}${res.question ? ' — question : ' + res.question : ''}`);
    } catch (e) {
      rendu = { ok: false, erreur: String(e.message || e).slice(0, 400), duree: Math.round((Date.now() - t0) / 1000) };
      if (limiteAtteinte(rendu.erreur) && !this.limiteActive()) this.limite = { jusqua: repriseLimite(rendu.erreur), texte: rendu.erreur.slice(0, 200) };
      this.journal(`correction impossible après ${Math.round(rendu.duree / 60)} min : ${rendu.erreur}`);
    }
    for (let n = 0; n < 4; n++) {
      try { const r = await this.post({ action: 'claude_rendre', secret: this.cfg.secret, id: q.id, ...rendu }, 30000); if (r.ok) break; this.log('compte rendu refusé : ' + r.erreur); break; }
      catch (e) { this.log('compte rendu pas rendu : ' + e.message); await pause(3000 * (n + 1)); }
    }
    this.atelier = false;
    await this.viderJournal();
  }
  _claudeAtelier(q, base) {
    return new Promise((ok, ko) => {
      const args = argumentsAtelier({ consigne: fs.readFileSync(path.join(this.dir, 'consigne-correction.md'), 'utf8'), modele: modelePour(this.cfg.modele), effort: 'high' });
      const env = { ...process.env, ENABLE_TOOL_SEARCH: 'false', DISABLE_AUTOUPDATER: process.env.DISABLE_AUTOUPDATER || '' };
      delete env.ANTHROPIC_API_KEY;                                         // jamais de facturation à l'usage : l'abonnement seulement
      // 19/11/26 : sur le PC de la maison, Chromium ne charge jamais le module audio (audioWorklet.addModule) et tous les
      // tests e2e restaient bloqués, donc plus rien n'était publié. tests\pc_audio\sitecustomize.py le remplace, pour les
      // tests lancés ici seulement ; PYTHONIOENCODING : les tests affichent des émojis.
      if (process.platform === 'win32') {
        const shim = path.join(base, DEPOTS_ATELIER.wilson, 'tests', 'pc_audio');
        env.PYTHONPATH = [shim, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
        env.PYTHONIOENCODING = 'utf-8';
      }
      const p = spawn(this.exe(), args, { cwd: base, env, windowsHide: true, detached: process.platform !== 'win32' });
      let out = '', err = '';
      const minuteur = setTimeout(() => { arreterArbre(p); ko(new Error(`la correction n'a pas fini en ${ATELIER_MAX_MS / 60000} min`)); }, ATELIER_MAX_MS);
      p.stdout.on('data', (b) => { out += b; });
      p.stderr.on('data', (b) => { err += b; });
      p.on('error', (e) => { clearTimeout(minuteur); ko(e); });
      p.on('close', (code) => {
        clearTimeout(minuteur);
        let j = null; try { j = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() || ''); } catch (_) {}
        if (!j) return ko(new Error(`Claude s'est arrêté (code ${code}) : ${(err || out).trim().slice(0, 300) || 'aucune sortie'}`));
        if (limiteAtteinte(j.result) || (j.is_error && limiteAtteinte(err))) return ko(new Error(`limite d'utilisation de Claude atteinte : ${String(j.result || err).trim().slice(0, 200)}`));
        if (j.is_error) return ko(new Error(`Claude : ${j.subtype || 'erreur'} ${String(j.result || err).slice(0, 200)}`));
        ok({ etapes: j.num_turns || 0 });
      });
      p.stdin.end(demandeCorrection(q), 'utf8');
    });
  }

  exe() {
    const c = [this.cfg.claude, process.env.CLAUDE_EXE, path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')].filter(Boolean);
    for (const x of c) if (fs.existsSync(x)) return x;
    try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); } catch (_) {}
    throw new Error('Claude Code introuvable sur le PC (relancer l\'installation)');
  }

  // Question sur les e-mails : les deux fichiers que Claude Code lit sont écrits ici (chemins de CE PC), à chaque question :
  // mcp-mail.json (Gmail perso + CRM en lecture) et reglages-mail.json (crochet : garde-chrome.mjs avant chaque action Chrome).
  fichiersMail(q) {
    const node = process.execPath, f = (n) => path.join(this.dir, n), slash = (x) => x.replace(/\\/g, '/');
    const mcp = f('mcp-mail.json'), reglages = f('reglages-mail.json');
    fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { crm: { type: 'stdio', command: node, args: [f('crm-mcp.mjs')] }, mail: { type: 'stdio', command: node, args: [f('mail-mcp.mjs')] } } }, null, 1));
    fs.writeFileSync(reglages, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'mcp__claude-in-chrome__.*', hooks: [{ type: 'command', command: `"${slash(node)}" "${slash(f('garde-chrome.mjs'))}"`, timeout: 15 }] }] } }, null, 1));
    return { mcp, mail: { pro: q.boite !== 'perso', reglages } };
  }

  _claude(q) {
    return new Promise((ok, ko) => {
      const travail = path.join(this.dir, 'travail'); fs.mkdirSync(travail, { recursive: true });
      const mail = q.type === 'mail', maxMs = mail ? MAIL_MAX_MS : CLAUDE_MAX_MS;
      const args = mail ? argumentsClaude({ ...this.fichiersMail(q), consigne: fs.readFileSync(path.join(this.dir, 'consigne-mail.md'), 'utf8'), modele: modelePour(this.cfg.modele), effort: effortPour(q, this.cfg.effort) })
        : argumentsClaude({ mcp: path.join(this.dir, 'mcp.json'), consigne: fs.readFileSync(path.join(this.dir, 'consigne.md'), 'utf8'), modele: modelePour(this.cfg.modele), effort: effortPour(q, this.cfg.effort), crm: q.type === 'crm' || q.crm !== false });
      const env = { ...process.env, ENABLE_TOOL_SEARCH: 'false', DISABLE_AUTOUPDATER: process.env.DISABLE_AUTOUPDATER || '' };
      delete env.ANTHROPIC_API_KEY;                                         // jamais de facturation à l'usage : l'abonnement seulement
      const p = spawn(this.exe(), args, { cwd: travail, env, windowsHide: true, detached: process.platform !== 'win32' });
      let out = '', err = '';
      const minuteur = setTimeout(() => { arreterArbre(p); ko(new Error(`Claude n'a pas fini en ${maxMs / 60000} min`)); }, maxMs);
      p.stdout.on('data', (b) => { out += b; });
      p.stderr.on('data', (b) => { err += b; });
      p.on('error', (e) => { clearTimeout(minuteur); ko(e); });
      p.on('close', (code) => {
        clearTimeout(minuteur);
        let j = null; try { j = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() || ''); } catch (_) {}
        if (!j) return ko(new Error(`Claude s'est arrêté (code ${code}) : ${(err || out).trim().slice(0, 300) || 'aucune sortie'}`));
        if (limiteAtteinte(j.result) || (j.is_error && limiteAtteinte(err))) return ko(new Error(`limite d'utilisation de Claude atteinte : ${String(j.result || err).trim().slice(0, 200)}`));
        if (j.is_error) return ko(new Error(`Claude : ${j.subtype || 'erreur'} ${String(j.result || err).slice(0, 200)}`));
        const r = decouper(j.result || '');
        ok({ ...r, etapes: j.num_turns || 0 });
      });
      p.stdin.end(demande(q), 'utf8');
    });
  }
}

// Une seule copie du relais à la fois (la tâche planifiée peut le relancer) : un petit port réservé sur la machine elle-même.
function verrou() {
  return new Promise((ok) => {
    const srv = net.createServer();
    srv.once('error', () => ok(false));
    srv.listen(47613, '127.0.0.1', () => ok(true));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--essai')) {                                 // essai à la main : node relais.mjs --essai « question »
    const R = new Relais();
    const q = { id: 'essai', type: 'internet', question: process.argv.slice(process.argv.indexOf('--essai') + 1).join(' ') || 'Quelle est la charge maximale d\'une paumelle Simonswerk Tectus TE 340 3D ?' };
    R.lancerClaude(q).then((r) => { console.log('\nÀ DIRE :', r.dire, '\n\nDÉTAIL :', r.detail); process.exit(0); }, (e) => { console.error('Échec :', e.message); process.exit(1); });
  } else verrou().then((libre) => { if (!libre) { console.log('Le relais tourne déjà.'); process.exit(3); } new Relais().boucle(); });
}
