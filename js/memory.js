// Wilson — mémoire : souvenirs durables + petit journal des derniers échanges, stockés sur la tablette.

const K_FACTS = 'wilson.facts', K_LOG = 'wilson.journal';
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('le la les de du des un une et a au aux en est son sa ses mon ma mes ton ta tes il elle on qui que je tu nous vous ils elles ce cette pour par sur dans avec'.split(' '));
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('mémoire pleine', e); } }

export class Memory {
  constructor() { this.facts = load(K_FACTS, []); this.log = load(K_LOG, []); }

  add(text) {
    text = (text || '').trim(); if (!text) return false;
    const n = norm(text);
    // Une information qui en reformule une autre la remplace (évite les doublons).
    const w = new Set(words(text));
    this.facts = this.facts.filter((f) => {
      const fw = words(f.text); if (!fw.length) return true;
      const common = fw.filter((x) => w.has(x)).length;
      return !(norm(f.text) === n || common / Math.max(fw.length, w.size) > 0.75);
    });
    this.facts.push({ text, date: today() });
    if (this.facts.length > 400) this.facts = this.facts.slice(-400);
    save(K_FACTS, this.facts); return true;
  }

  forget(subject) {
    const q = words(subject); if (!q.length) return [];
    const gone = [];
    this.facts = this.facts.filter((f) => {
      const fw = new Set(words(f.text)); const hit = q.filter((x) => fw.has(x)).length;
      const match = hit / q.length >= 0.6 || norm(f.text).includes(norm(subject));
      if (match) gone.push(f.text); return !match;
    });
    save(K_FACTS, this.facts); return gone;
  }
  remove(i) { this.facts.splice(i, 1); save(K_FACTS, this.facts); }
  clear() { this.facts = []; this.log = []; save(K_FACTS, []); save(K_LOG, []); }

  addExchange(user, wilson) {
    if (!user && !wilson) return;
    const d = new Date();
    this.log.push({ t: `${today()} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`, user, wilson });
    if (this.log.length > 30) this.log = this.log.slice(-30);
    save(K_LOG, this.log);
  }

  forPrompt() {
    const facts = this.facts.length ? this.facts.map((f) => `- ${f.text} (noté le ${f.date})`).join('\n') : '- (rien pour l\'instant)';
    const recent = this.log.slice(-10).map((e) => `[${e.t}] ${e.user ? 'Famille : ' + e.user : ''}${e.wilson ? ' / Wilson : ' + e.wilson : ''}`).join('\n');
    return { facts, recent };
  }

  export() { return JSON.stringify({ facts: this.facts, journal: this.log }, null, 2); }
  import(json) {
    const o = JSON.parse(json);
    if (Array.isArray(o.facts)) { this.facts = o.facts; save(K_FACTS, this.facts); }
    if (Array.isArray(o.journal)) { this.log = o.journal; save(K_LOG, this.log); }
  }
}
