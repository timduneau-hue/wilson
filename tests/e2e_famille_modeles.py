"""La famille avec les VRAIS modèles (PLAN 7 sexies) : apprendre un visage sur la fausse caméra (photo pos), le reconnaître
(sûr), un autre visage (neg_down) reconnu comme inconnu, un visage de profil ou trop loin écarté ; oreille de garde (YAMNet)
sur des bips de détecteur de fumée → alerte au script. Lent (modèles chargés dans Chromium sans carte graphique)."""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
TABLETTE = 'Mozilla/5.0 (Linux; Android 11; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
BIPS = """(async () => {   // détecteur de fumée (3,1 kHz, motif T3) : 12 s de son, donné à l'oreille de garde par paquets de 0,5 s
  const O = wilson.famille.oreille, n = 8000;
  for (let k = 0; k < 24; k++) { const f = new Float32Array(n); for (let i = 0; i < n; i++) { const t = (k * n + i) / 16000, c = t % 4; f[i] = (c < 3 && (c % 1) < 0.5 ? 0.5 : 0) * Math.sin(2 * Math.PI * 3100 * t); }
    O.feed(f); await new Promise((r) => setTimeout(r, 350)); }
})()"""


async def ouvrir(b, video, st, store=None):
    args_ctx = dict(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block', user_agent=TABLETTE)
    ctx = await b.new_context(**args_ctx)
    init = "localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps({'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'logUrl': URL, 'gardeAuto': False, 'v': 4})
    if store: init += "localStorage.setItem('wilson.visages', %s);" % json.dumps(store)
    await ctx.add_init_script(init)
    page = await ctx.new_page(); logs = []
    async def script(route):
        req = route.request; H = {'access-control-allow-origin': '*'}
        d = json.loads(req.post_data or '{}') if req.method == 'POST' else {}
        a = d.get('action', ''); body = {'ok': True}
        if a == 'alerte': st['alertes'].append(d); body = {'ok': True, 'envoye': True}
        elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': d.get('noms') or [], 'garde': None}
        elif a == 'reglages_lire': body = {'ok': True, 'reglages': None, 't': 0}
        elif not a: await route.fulfill(status=200, headers=H, body='ok'); return
        await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
    await page.route(re.compile(r'https://script\.google\.com/.*'), script)
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    await page.goto('http://127.0.0.1:8765/index.html')
    await page.wait_for_function('window.wilson && wilson.vision && wilson.vision.gazeReady', timeout=180000)
    return ctx, page, logs


async def main():
    st = {'alertes': []}
    async with async_playwright() as p:
        def lancer(video): return p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-video-capture={S}/fixtures/{video}.y4m', f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        # ---- 1. Apprendre, puis reconnaître ----
        b = await lancer('pos'); ctx, page, logs = await ouvrir(b, 'pos', st)
        check('Personne d\'appris : le modèle des visages n\'est pas chargé (V4)', await page.evaluate("!wilson.qui.worker"))
        pas = []
        await page.expose_function('__pas', lambda t: pas.append(t))
        r = await page.evaluate("wilson.famille.run('visages', { action: 'apprendre', prenom: 'Timothée' }, { onPas: (t, n, total) => window.__pas((t || '') + ' ' + n + '/' + total) })")
        check('Apprendre le visage de « Timothée » (V2, outil visages)', 'Visage de Timothée appris' in r, r)
        check('… consignes données pendant l\'apprentissage', any('Regarde-moi' in x for x in pas) and any(x.endswith('/12') for x in pas), str(pas[:6]))
        store = await page.evaluate("localStorage.getItem('wilson.visages')")
        regl = await page.evaluate("localStorage.getItem('wilson.settings')")
        check('Empreintes gardées sur l\'appareil (wilson.visages), pas dans les réglages partagés (V1)', store and 'Timothée' in store and '"desc"' in store and 'desc' not in regl)
        await page.wait_for_function("wilson.qui.actuel && wilson.qui.actuel.sur", timeout=60000)
        A = await page.evaluate("JSON.stringify(wilson.qui.actuel)")
        check('Reconnu : « c\'est Timothée », sûr (V3)', '"nom":"Timothée"' in A and '"sur":true' in A, A)
        n = await page.evaluate("wilson.qui.stats.n"); await page.wait_for_timeout(8000)
        n2 = await page.evaluate("wilson.qui.stats.n")
        check('Une fois sûr : plus d\'analyse toutes les 1,5 s (au plus une toutes les 20 s, V4)', n2 - n <= 1, f'{n} → {n2}')
        check('Bilan : reconnaissance décrite, sans empreinte', 'Timothée' in await page.evaluate("wilson.bilan()['Visages (sur cet appareil)']") and '0.0' not in await page.evaluate("wilson.bilan()['Visages (sur cet appareil)'].split('—')[0]"))
        # ---- Oreille de garde réelle (YAMNet) ----
        await page.evaluate("wilson.famille.activer('demandee', 'test'); wilson.famille.garde.vide = Date.now()")
        await page.wait_for_function("wilson.famille.oreille.ready", timeout=120000)
        check('Garde : oreille de garde prête (MediaPipe Audio + YAMNet, sur l\'appareil)', True)
        await page.evaluate(BIPS)
        for _ in range(60):
            if st['alertes']: break
            await page.wait_for_timeout(500)
        al = [a for a in st['alertes'] if a['genre'] == 'fumee']
        check('Bips de détecteur de fumée → alerte « détecteur de fumée » par le script, avec photo (G3)', al and al[0]['texte'] == 'détecteur de fumée' and len(al[0].get('photo') or '') > 1000, str([l for l in logs if 'Garde' in l][-6:]))
        await page.evaluate("wilson.famille._finGarde('test')"); await page.wait_for_timeout(500)
        check('Fin de garde : l\'oreille de garde s\'arrête (rien ne tourne hors garde)', await page.evaluate("!wilson.famille.oreille.on"))
        errs = [l for l in logs if 'PAGEERROR' in l or 'Erreur :' in l]
        check('Aucune erreur JavaScript', not errs, str(errs[:3]))
        await b.close()
        # ---- 2. Un autre visage : inconnu ----
        b = await lancer('neg_down'); ctx, page, logs = await ouvrir(b, 'neg_down', st, store)
        await page.wait_for_function("wilson.qui.actuel && (wilson.qui.actuel.sur || wilson.qui.actuel.inconnu)", timeout=90000)
        A = await page.evaluate("JSON.stringify(wilson.qui.actuel)")
        check('Autre personne : « visage inconnu », jamais « Timothée » (V3)', '"inconnu":true' in A and '"sur":false' in A, A)
        await b.close()
        # ---- 3. De profil : écarté (pas d'empreinte) ----
        b = await lancer('neg_turned'); ctx, page, logs = await ouvrir(b, 'neg_turned', st, store)
        await page.wait_for_timeout(12000)
        r = await page.evaluate("JSON.stringify([wilson.qui.actuel, wilson.qui.stats.refus, wilson.qui.stats.n])")
        check('Visage de profil : écarté, ni prénom ni « inconnu »', json.loads(r)[0] is None and json.loads(r)[1] > 0 and json.loads(r)[2] == 0, r)
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications OK')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
