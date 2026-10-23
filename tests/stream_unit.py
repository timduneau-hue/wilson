import os
import asyncio, json
from playwright.async_api import async_playwright
JS = r"""
async () => {
  const m = await import('./js/eco.js');
  const replies = [
    "Bonjour ! Il fait beau à Nantes aujourd'hui, avec 18.5 degrés. Pense à ta veste ce soir.",
    "C'est noté, Moustache !",
    "Oui… je vois un \"chat\" roux sur le canapé ! Il a l'air très détendu, non ?",
    "Alors, la Terre tourne autour du Soleil en 365 jours, c'est pour ça qu'on a des saisons, et l'axe incliné de la planète change la quantité de lumière reçue selon les mois, ce qui explique l'hiver et l'été chez nous.",
  ];
  const fails = []; let runs = 0;
  for (const rep of replies) {
    const obj = { pour_moi: true, emotion: 'joie', reponse: rep, geste: 'aucun', memoriser: [], fin: false, entendu: 'test' };
    const full = '```json\n' + JSON.stringify(obj) + '\n```';
    for (let trial = 0; trial < 300; trial++) {
      runs++;
      let acc = '', spoken = 0, pushed = [], i = 0;
      while (i < full.length) {
        const n = 1 + Math.floor(Math.random() * 25); acc += full.slice(i, i + n); i += n;
        const pr = m.partialReply(acc);
        const txt = pr.reponse || '';
        const cut = pr.closed ? txt.length : m.sentenceCut(txt, spoken);
        if (cut > spoken) { pushed.push(txt.slice(spoken, cut).trim()); spoken = cut; }
      }
      const joined = pushed.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (joined !== rep.replace(/\s+/g, ' ').trim()) fails.push({ rep: rep.slice(0, 30), joined: joined.slice(0, 120), pushed });
    }
  }
  return { runs, fails: fails.slice(0, 3), nfails: fails.length };
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.goto('http://127.0.0.1:8765/visages.html')
        print(json.dumps(await pg.evaluate(JS), ensure_ascii=False, indent=1)[:1500])
        await b.close()
asyncio.run(main())
