// Wilson — relais Claude du PC de la maison (PLAN.md, section 10).
// Attend les questions difficiles de Wilson dans la file du script « Wilson journal », les passe à Claude Code (claude -p,
// abonnement de Timothée, aucune clé API) et rend la réponse. Claude n'a que la recherche Internet, la lecture de pages et
// le CRM en lecture seule (crm-mcp.mjs) : aucune commande, aucun fichier, aucune écriture.
// Lancé tout seul à l'ouverture de session (boucle.cmd, fenêtre cachée) ; Node 18 ou plus, sans bibliothèque.

import { spawn, spawnSync, execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 'relais 6';
const DEPOT = 'https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc/';
const FICHIERS = ['relais.mjs', 'crm-mcp.mjs', 'consigne.md'];
const MAJ_MS = 6 * 3600000;            // le relais se met à jour tout seul depuis GitHub, toutes les 6 h (demande du 06/11/26)
const DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_EN_COURS = 2;                 // deux questions en même temps au plus
const CLAUDE_MAX_MS = 4 * 60000;        // au-delà, Claude est arrêté (Wilson a dit qu'il attendait 4 min au plus)
const MAX_TOURS = 30;
const OUTILS = 'WebSearch,WebFetch';
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

// W16 : effort de réflexion. config.json « effort » l'impose s'il est écrit ; sinon « high », sauf une question CRM courte et
// simple (un chiffre, une fiche, une liste) : « medium », plus rapide et moins gourmand pour l'abonnement.
const COMPLEXE = /compar|analys|évolu|tendance|pourquoi|stratég|prévis|classement|palmar[eè]s|tous les|chaque|par (mois|an|client|famille)|depuis (le|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i;
export function effortPour(q, impose) {
  if (impose) return impose;
  return q && q.type === 'crm' && String(q.question || '').length <= 140 && !COMPLEXE.test(String(q.question || '')) ? 'medium' : 'high';
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
    `Type de question : ${q.type === 'crm' ? 'CRM (ses données de commercial)' : 'recherche (Internet, produits, technique)'}.`,
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
export function argumentsClaude({ mcp, consigne, modele = 'sonnet', effort = 'high', crm = true }) {
  return ['-p', '--output-format', 'json', '--model', modele, '--effort', effort, '--max-turns', String(MAX_TOURS),
    '--tools', OUTILS, '--allowedTools', crm ? `${OUTILS},mcp__crm` : OUTILS, '--permission-mode', 'dontAsk',
    ...(crm ? ['--mcp-config', mcp] : []), '--strict-mcp-config', '--system-prompt', consigne, '--no-session-persistence'];
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
  constructor({ cfg = {}, journal = () => {}, fetchImpl = globalThis.fetch, vbox, run, maintenant = () => Date.now(), pauseMs = 5000 } = {}) {
    const c = cfg.ha === false ? null : (cfg.ha || {});
    // 11/11/26 : ce Home Assistant répond sur le port 80 (http://homeassistant.local), pas sur 8123 : les deux sont essayés.
    this.on = !!c; this.urls = (c && c.url ? [c.url] : ['http://homeassistant.local', 'http://homeassistant.local:8123']).map((u) => String(u).replace(/\/+$/, ''));
    this.url = this.urls[0]; this.vm = (c && c.vm) || '';
    this.journal = journal; this.fetch = fetchImpl; this.maintenant = maintenant;
    this.vbox = vbox !== undefined ? vbox : [process.env.VBOX_MSI_INSTALL_PATH && path.join(process.env.VBOX_MSI_INSTALL_PATH, 'VBoxManage.exe'),
      'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe'].filter(Boolean).find((x) => { try { return fs.existsSync(x); } catch (_) { return false; } }) || '';
    this.run = run || ((args) => new Promise((ok) => execFile(this.vbox, args, { timeout: 60000, windowsHide: true }, (e, out, err) => ok({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') }))));
    this.muet = 0; this.actionAt = 0; this.ip = ''; this.enPanne = 0; this.dit = ''; this.pauseMs = pauseMs; this.dejaVu = false;
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
    if (ok) {
      if (this.enPanne) this.journal(`Home Assistant répond de nouveau (muet depuis ${Math.round((this.maintenant() - this.enPanne) / 60000)} min)`);
      this.muet = 0; this.enPanne = 0; this.dejaVu = true;
      if (!this.ip) { try { const d = await import('node:dns'); this.ip = (await d.promises.lookup(new URL(this.url).hostname, { family: 4 })).address; } catch (_) {} }
      return 'ok';
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
    this.journal(a.ok && b.ok ? `Home Assistant muet depuis ${Math.round((this.maintenant() - this.enPanne) / 60000)} min alors que sa machine virtuelle tourne : câble réseau virtuel débranché puis rebranché (il reprend une adresse)`
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
    if (this.enCours) return false;
    for (const [f, t] of change) fs.writeFileSync(path.join(this.dir, f), t);
    this.journal(`mis à jour depuis GitHub (${change.map((x) => x[0]).join(', ')}) : je redémarre`);
    await this.viderJournal();
    return true;
  }

  async boucle() {
    let attente = 5000;
    this.journal(`démarré (${VERSION}, ${os.hostname()}, Node ${process.versions.node}, ${this.cfg.modele || 'sonnet'}, effort ${this.cfg.effort || 'high (medium pour une question CRM simple)'})`);
    let dernierJournal = Date.now(), derniereMaj = Date.now() - MAJ_MS + 60000;   // 1re vérification une minute après le démarrage
    let derniereHA = Date.now() - HA_VERIF_MS + 90000, verifHA = null;                // Home Assistant : 1re vérification 1 min 30 après
    while (!this.stop) {
      try {
        if (!verifHA && Date.now() - derniereHA > HA_VERIF_MS) {
          derniereHA = Date.now();
          verifHA = this.gardeHA.verifier({ pcEnLigne: Date.now() - this.scriptOkAt < 3 * 60000 }).catch((e) => this.log('maison : vérification impossible : ' + e.message)).finally(() => { verifHA = null; });
        }
        if (Date.now() - dernierJournal > 10000) { dernierJournal = Date.now(); await this.viderJournal(); }
        if (!this.enCours && Date.now() - derniereMaj > MAJ_MS && this.majAuto !== false) {
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

  exe() {
    const c = [this.cfg.claude, process.env.CLAUDE_EXE, path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')].filter(Boolean);
    for (const x of c) if (fs.existsSync(x)) return x;
    try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); } catch (_) {}
    throw new Error('Claude Code introuvable sur le PC (relancer l\'installation)');
  }

  _claude(q) {
    return new Promise((ok, ko) => {
      const travail = path.join(this.dir, 'travail'); fs.mkdirSync(travail, { recursive: true });
      const args = argumentsClaude({ mcp: path.join(this.dir, 'mcp.json'), consigne: fs.readFileSync(path.join(this.dir, 'consigne.md'), 'utf8'), modele: this.cfg.modele || 'sonnet', effort: effortPour(q, this.cfg.effort), crm: q.type === 'crm' || q.crm !== false });
      const env = { ...process.env, ENABLE_TOOL_SEARCH: 'false', DISABLE_AUTOUPDATER: process.env.DISABLE_AUTOUPDATER || '' };
      delete env.ANTHROPIC_API_KEY;                                         // jamais de facturation à l'usage : l'abonnement seulement
      const p = spawn(this.exe(), args, { cwd: travail, env, windowsHide: true, detached: process.platform !== 'win32' });
      let out = '', err = '';
      const minuteur = setTimeout(() => { arreterArbre(p); ko(new Error(`Claude n'a pas fini en ${CLAUDE_MAX_MS / 60000} min`)); }, CLAUDE_MAX_MS);
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
