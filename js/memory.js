// Wilson — le petit journal des derniers échanges (pour la continuité d'une discussion à l'autre), stocké sur l'appareil.
// Ce que Wilson retient pour longtemps est dans js/memoire.js (onglet « Mémoire » de la feuille du journal, demande du 05/11/26).

const K_LOG = 'wilson.journal', MAX = 60;
const pad = (n) => String(n).padStart(2, '0');
const today = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('mémoire pleine', e); } }

export class Memory {
  constructor() { this.log = load(K_LOG, []); }

  // qui : la personne reconnue (téléphone de Timothée, ou visage sûr sur la tablette), sinon vide.
  addExchange(user, wilson, qui = '') {
    if (!user && !wilson) return;
    const d = new Date();
    this.log.push({ t: `${today(d)} ${pad(d.getHours())}h${pad(d.getMinutes())}`, ts: d.getTime(), user, wilson, ...(qui ? { qui } : {}) });
    if (this.log.length > MAX) this.log = this.log.slice(-MAX);
    save(K_LOG, this.log);
  }
  depuis(t0, t1 = Infinity) { return this.log.filter((e) => (e.ts || 0) >= t0 && (e.ts || 0) <= t1); }

  recent(n = 10) {
    return this.log.slice(-n).map((e) => `[${e.t}] ${e.user ? `${e.qui || 'Famille'} : ${e.user}` : ''}${e.wilson ? ' / Wilson : ' + e.wilson : ''}`).join('\n');
  }
  clear() { this.log = []; save(K_LOG, []); }
}
