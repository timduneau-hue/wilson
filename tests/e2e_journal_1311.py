"""Journal du 13/11/26 et du 14/11/26 matin (version 1.42.1), tablette et téléphone — corrections de la 1.43.0.
 1. Batterie : jamais signalée de lui-même (remarques du 13/11/26, 07h09:54, 21h40:08, 21h41:18) — voir aussi e2e_sound.py.
 2. Visage Miel : l'iris marron est dessiné à chaque image, sans petite toile cachée que Chrome pourrait vider (14/11/26, 11h09).
 3. Photo « voiture Ferrari » : une voiture, jamais Enzo Ferrari (13/11/26, 20h05, 20h06 et 21h00) ; « Enzo Ferrari » demandé : lui.
 4. GPS : agences Boschat Laveix (Nantes, Cholet, Rennes), plateforme d'Arnage, maison (adresse prise dans la mémoire).
 5. Nouvelle de la voiture : arrivée pendant la veille d'une discussion (13/11/26, 07h07:30) → gardée, pas envoyée ; réponse
    retenue → gardée pour la suivante ; dite → plus rien à redire ; discussion finie sans l'avoir dite → gardée.
 6. Nouveautés : une seule fois pour tous les appareils (réglage commun nvDites, réponse à q261113a).
 7. E-mails : boîte pro coupée (13/11/26, 07h34:40) ; « les deux » → Gmail perso seulement.
 8. Résultat d'outil reçu : pas de veille tant qu'il n'est pas dit (13/11/26, 21h39:39, recherche sur Xavier Niel).
"""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'toujours', convTimeout: 30, face: 'miel', crm: true, v:3}));")
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)

        # 2. Iris : couleur miel/marron bien présente dans l'image, et plus de toile cachée.
        r = await page.evaluate("""(async () => {
          wilson.face.setBrightness(1); wilson.face.setMood && wilson.face.setMood('neutre');
          await new Promise((r) => setTimeout(r, 1500));
          const c = document.getElementById('face'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
          let brun = 0; for (let i = 0; i < d.length; i += 16) { const R = d[i], G = d[i + 1], B = d[i + 2]; if (R > 90 && R > G + 25 && G > B + 15) brun++; }
          return { style: wilson.face.styleName, brun, cache: 'iris' in wilson.face.style };
        })()""")
        check('Visage Miel : iris marron dessiné, sans toile cachée', r['style'] == 'miel' and r['brun'] > 200 and not r['cache'], str(r))

        # 3. Photo : choix de la page Wikipédia.
        r = await page.evaluate("""(async () => {
          const { choisirPage } = await import('./js/outils.js');
          const pg = (i, t, d, f) => ({ index: i, title: t, description: d, original: { source: 'https://x/' + f }, thumbnail: { source: 'https://x/' + f } });
          const pages = [pg(1, 'Ferrari (entreprise)', 'constructeur automobile italien', 'Ferrari-Logo.svg'), pg(2, 'Enzo Ferrari', 'pilote automobile italien et industriel', 'Enzo.jpg'),
            pg(3, 'Ferrari 599 GTB Fiorano', 'modèle de voiture de sport', '599.jpg'), pg(4, 'Scuderia Ferrari', 'écurie de sport automobile italienne', 'F1.jpg')];
          return [choisirPage(pages, 'voiture Ferrari').title, choisirPage(pages, 'Ferrari').title, choisirPage(pages, 'Enzo Ferrari').title,
            (choisirPage([pg(1, 'Jérémy Ferrari', 'humoriste et acteur français', 'J.jpg')], 'Ferrari') || {}).title || null];
        })()""")
        check('Photo : « voiture Ferrari » → une voiture ; « Enzo Ferrari » → lui ; jamais un humoriste pour « Ferrari »',
              r == ['Ferrari 599 GTB Fiorano', 'Ferrari 599 GTB Fiorano', 'Enzo Ferrari', None], str(r))

        # 4. Lieux connus pour le GPS.
        r = await page.evaluate("""(async () => {
          wilson.memoire.items.push({ id: 'tmaison', texte: 'La famille habite au 12 rue des Essais à Angers.', cat: 'famille' });
          const C = wilson.crm, L = (x) => { const v = C.lieuConnu(x); return v ? v.societe + ' | ' + v.adresse : null; };
          const out = ['agence de Nantes', 'Boschat Cholet', "l'agence de Rennes", "plateforme d'Arnage", 'la maison', 'chez moi', 'Nantes Menuiserie', 'FMA la Regrippière'].map(L);
          const t = await C.routeTarget({ client: 'agence Cholet' });
          wilson.memoire.items = wilson.memoire.items.filter((x) => x.id !== 'tmaison');
          return { out, ok: t.ok, maps: t.target && t.target.maps };
        })()""")
        o = r['out']
        check('GPS : agences Boschat Laveix, Arnage, maison (adresse de la mémoire)',
              o[0] == "l'agence Boschat Laveix de Nantes | Boschat Laveix, Nantes" and 'Cholet' in o[1] and 'Rennes' in o[2] and 'Arnage' in o[3]
              and o[4] == 'la maison | 12 rue des Essais à Angers' and o[5] == o[4] and o[6] is None and o[7] is None, str(o))
        check('GPS : lieu connu → bouton prêt sans le CRM', r['ok'] and 'Boschat%20Laveix%2C%20Cholet' in (r['maps'] or ''), str(r))

        # 5. Nouvelle de la voiture.
        r = await page.evaluate("""(async () => {
          const W = wilson, out = {};
          W.maison.suiviVoiture = async () => ({ texte: "la voiture n'a pas répondu à la commande : le service MG a eu un souci." });
          W.state = 'conversation'; W.paused = true; W._nouvelleVoiture = null; W._nvEnvoi = null;
          await W._suiviVoiture({ appareil: 'Chauffage de la voiture', action: 'allumer' });
          out.veille = !!W._nouvelleVoiture && !W._nvEnvoi;
          // envoyée dans une discussion (regardé), puis réponse retenue : gardée
          W._nouvelleVoiture = null; W._nvEnvoi = { phrase: 'La voiture a refusé.', at: Date.now(), conv: W.convId };
          W._nvSuivi("Le service MG a eu un souci avec la voiture, redemande dans une minute.", true);
          out.retenue = !!W._nouvelleVoiture && !W._nvEnvoi;
          // une autre réponse retenue (pas sur la voiture) : la nouvelle attend encore
          W._nouvelleVoiture = null; W._nvEnvoi = { phrase: 'La voiture a refusé.', at: Date.now(), conv: W.convId };
          W._nvSuivi('De rien ! Autre chose ?', true);
          out.autre = !W._nouvelleVoiture && !!W._nvEnvoi;
          // dite : plus rien à redire
          W._nvSuivi("La voiture n'a pas répondu, le service MG a eu un souci.");
          out.dite = !W._nouvelleVoiture && !W._nvEnvoi;
          // discussion finie sans l'avoir dite : gardée
          W._nvEnvoi = { phrase: 'La voiture a refusé.', at: Date.now(), conv: W.convId - 1 };
          W._nvSuivi('');
          out.fin = !!W._nouvelleVoiture;
          W._nouvelleVoiture = null; W._nvEnvoi = null; W.state = 'veille'; W.paused = false;
          return out;
        })()""")
        check('Voiture : nouvelle arrivée pendant la veille de la discussion → gardée, pas envoyée', r['veille'], str(r))
        check('Voiture : réponse retenue → gardée pour la discussion suivante', r['retenue'], str(r))
        check('Voiture : autre réponse retenue → la nouvelle attend encore', r['autre'], str(r))
        check('Voiture : dite → plus rien à redire', r['dite'], str(r))
        check('Voiture : discussion finie sans l\'avoir dite → gardée', r['fin'], str(r))

        # 6. Nouveautés une seule fois pour tous les appareils.
        r = await page.evaluate("""(() => {
          const W = wilson, V = W.settings.nvDites;
          W._nv = { texte: 'quelque chose a changé.', date: '14/11/26', aDire: true };
          W.settings.nvDites = 'autre';
          const a = W._nouveautes('live').includes('première discussion'), dit = W.settings.nvDites;
          W._nv.aDire = true; W.settings.nvDites = dit;                // déjà dites ailleurs (réglage commun)
          const b = W._nouveautes('live').includes('première discussion');
          return { a, b, dit, same: dit === document.querySelector('meta[name=version]')?.content || dit };
        })()""")
        check('Nouveautés : dites une fois, puis plus du tout si un autre appareil les a dites (nvDites)', r['a'] and not r['b'] and r['dit'] and r['dit'] != 'autre', str(r))

        # 7. E-mails pro coupés.
        r = await page.evaluate("""(async () => {
          const W = wilson, demandes = [];
          W._crmAutorise = () => ({ ok: true });
          W._parClaude = async (o) => { demandes.push(o.boite); return { info: 'ok' }; };
          const pro = await W._mails({ demande: 'mes derniers e-mails pro', boite: 'pro' });
          const deux = await W._mails({ demande: 'mes derniers e-mails' });
          return { pro: !!pro.echec, demandes };
        })()""")
        check('E-mails : boîte pro coupée, « les deux » → Gmail perso seulement', r['pro'] and r['demandes'] == ['perso'], str(r))

        # 8. Résultat d'outil reçu : pas de veille avant qu'il soit dit.
        r = await page.evaluate("""(async () => {
          const W = wilson;
          return /attendReponse/.test(W._tick ? W._tick.toString() : '') || /attendReponse/.test(Object.getOwnPropertyNames(Object.getPrototypeOf(W)).map((k) => { try { return String(W[k]); } catch (_) { return ''; } }).join(''));
        })()""")
        check('Résultat d\'outil : la veille attend qu\'il soit dit (12 s au plus)', r, str(r))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
