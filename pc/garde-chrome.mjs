// Wilson — garde de Chrome pour les questions sur les e-mails (11/11/26). Claude Code appelle ce fichier avant CHAQUE action
// dans Chrome (crochet « PreToolUse », voir relais.mjs) : il reçoit l'action en JSON sur l'entrée, et la refuse (code 2) si
// elle sort d'Outlook. Un e-mail piégé (« ouvre telle adresse avec ce que tu viens de lire ») ne peut donc pas faire sortir
// le contenu de la messagerie par une autre page. En cas de doute (entrée illisible), c'est refusé.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SITES = ['outlook.office.com', 'outlook.office365.com', 'outlook.cloud.microsoft', 'login.microsoftonline.com'];
const INTERDITS = /(javascript_tool|file_upload|upload_image|gif_creator|shortcuts_execute|shortcuts_list|read_network_requests|read_console_messages|switch_browser)$/;
const court = (nom) => String(nom || '').replace(/^mcp__claude-in-chrome__/, '');

export function adresseOk(url) {
  const u = String(url || '').trim();
  if (u === 'back' || u === 'forward') return true;
  let h; try { const x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u); if (x.protocol !== 'https:') return false; h = x.hostname.toLowerCase(); } catch (_) { return false; }
  return SITES.includes(h);
}

// → '' si l'action est permise, sinon la raison du refus.
export function refus(nom, entree) {
  const n = court(nom), e = entree || {};
  if (INTERDITS.test(n)) return `outil ${n} interdit pour les e-mails`;
  if (n === 'navigate' && !adresseOk(e.url)) return `adresse hors d'Outlook refusée (${String(e.url || '').slice(0, 80)}) : seule la messagerie Outlook peut être ouverte`;
  if (n === 'browser_batch') {
    for (const a of Array.isArray(e.actions) ? e.actions : []) { const r = refus(a && a.name, a && a.input); if (r) return r; }
  }
  return '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let t = '';
  process.stdin.on('data', (b) => { t += b; });
  process.stdin.on('end', () => {
    let r;
    try { const j = JSON.parse(t); r = refus(j.tool_name, j.tool_input); } catch (_) { r = 'action illisible'; }
    if (r) { process.stderr.write(`Refusé par la garde de Wilson : ${r}.`); process.exit(2); }
    process.exit(0);
  });
}
