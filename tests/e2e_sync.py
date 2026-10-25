"""Mêmes réglages sur tous les appareils (PLAN 2 ter) : copie par QR code / lien, puis synchronisation par le script."""
import asyncio, json, re, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
PHONE = {'apiKey': 'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', 'voice': 'Charon', 'city': 'Angers', 'logUrl': URL,
         'home': 'Timothée, sa femme et le chat', 'convTimeout': 20, 'gazeCalib': {'yaw': 9, 'pitch': -4, 'down': 0.1}, 'mirror': True, 'v': 3}


async def main():
    store = {'reglages': None, 't': 0, 'old': False, 'calls': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):          # script de Timothée simulé : journal + réglages communs
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action')
            H = {'access-control-allow-origin': '*'}
            if a and store['old']:
                await route.fulfill(status=200, headers=H, body='ok'); return
            store['calls'].append(a)
            if a == 'reglages_lire': body = {'ok': True, 'reglages': store['reglages'], 't': store['t']}
            elif a == 'reglages_ecrire':
                if store['reglages'] is not None and store['t'] >= d['t']: body = {'ok': True, 'applique': False, 't': store['t']}
                else: store['reglages'], store['t'] = d['reglages'], d['t']; body = {'ok': True, 'applique': True, 't': d['t']}
            else:
                await route.fulfill(status=200, headers=H, body='ok'); return
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def device(settings, name):
            ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
            if settings is not None:
                await ctx.add_init_script("if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('wilson.settings', %s); }" % json.dumps(json.dumps(settings)))
            await ctx.add_init_script("Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared = d; }, configurable: true });")
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://script\.google\.com/.*'), script)
            await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), lambda ws: None)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            return ctx, page, logs

        # --- Téléphone (référence) : le script est à jour, rien de commun encore → le téléphone envoie ses réglages.
        _, phone, plogs = await device(PHONE, 'téléphone')
        await phone.goto('http://127.0.0.1:8765/index.html')
        await phone.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await phone.wait_for_function("wilson.sync.state.startsWith('à jour')", timeout=8000)
        for _ in range(30):                                  # « premier envoi » : l'état change avant la fin de l'envoi
            if store['reglages']: break
            await asyncio.sleep(0.1)
        check('Téléphone : 1er appareil relié, ses réglages deviennent la référence', store['reglages'] and store['reglages']['voice'] == 'Charon' and 'gazeCalib' not in store['reglages'] and 'mirror' not in store['reglages'], str(store['calls']))

        # --- Copier les réglages : QR code + lien + partage.
        await phone.evaluate('wilson.ui.open()')
        await phone.click('#t-copy'); await phone.wait_for_timeout(300)
        qr = await phone.evaluate("(() => { const c = document.getElementById('copy-qr'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) k++; return { w: c.width, dark: k / (d.length / 4), shown: !document.getElementById('copy-box').hidden }; })()")
        link = await phone.evaluate('wilson.ui._link')
        check('QR code de copie affiché', qr['shown'] and qr['w'] >= 200 and 0.2 < qr['dark'] < 0.7, str(qr))
        check('Lien : adresse de Wilson + réglages après « # » (jamais envoyés à GitHub)', link.startswith('http://127.0.0.1:8765/index.html#reglages=') and len(link) < 1500, f"{len(link)} caractères")
        await phone.click('#t-share'); await phone.wait_for_timeout(200)
        sh = await phone.evaluate('window.__shared')
        check('Bouton « Partager le lien »', sh and sh['url'] == link)
        await phone.screenshot(path=f'{S}/shots/copie_reglages.png')
        await phone.evaluate("document.getElementById('s-close').click()")

        # --- Tablette neuve (rien de réglé) : on ouvre le lien → tout est copié, sauf ce qui est propre à l'appareil.
        _, tab, tlogs = await device(None, 'tablette')
        await tab.goto(link)
        await tab.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        st = await tab.evaluate("({s: wilson.settings, url: location.href, welcome: !document.getElementById('welcome').hidden, badge: document.getElementById('badge').textContent})")
        s = st['s']
        check('Tablette : clé, voix, ville, maison, script copiés', s['apiKey'] == PHONE['apiKey'] and s['voice'] == 'Charon' and s['city'] == 'Angers' and s['home'] == PHONE['home'] and s['logUrl'] == URL and s['convTimeout'] == 20, '')
        check('… calibrage et sens du regard restent ceux de la tablette', s['gazeCalib'] == {'yaw': 0, 'pitch': 0, 'down': 0} and s['mirror'] is False)
        check('… réglages effacés de l\'adresse, pas d\'écran d\'accueil, message de confirmation', '#' not in st['url'] and not st['welcome'] and 'copiés' in st['badge'], st['badge'])
        saved = await tab.evaluate("JSON.parse(localStorage.getItem('wilson.settings')).voice")
        check('… et gardés sur la tablette', saved == 'Charon')

        # --- Changement sur le téléphone → la tablette suit.
        await phone.evaluate('wilson.ui.open()')
        await phone.select_option('#s-voice', 'Zephyr')
        await phone.fill('#s-city', 'Nantes'); await phone.dispatch_event('#s-city', 'change')
        await phone.wait_for_timeout(2000)
        check('Téléphone : changement envoyé au script', store['reglages']['voice'] == 'Zephyr' and store['reglages']['city'] == 'Nantes')
        await tab.evaluate('wilson.sync.pull()'); await tab.wait_for_timeout(500)
        s = await tab.evaluate('wilson.settings')
        check('Tablette : prend le changement (voix, ville)', s['voice'] == 'Zephyr' and s['city'] == 'Nantes' and any('Réglages mis à jour depuis un autre appareil' in l for l in tlogs), '')
        await tab.evaluate("wilson.ui.open()")
        txt = await tab.inner_text('#s-sync')
        check('Réglages : état de la synchronisation affiché', 'à jour' in txt, txt)
        await tab.evaluate("document.getElementById('s-close').click()")

        # --- Changement sur la tablette → le téléphone suit (le plus récent gagne).
        await tab.evaluate("wilson.ui.open()")
        await tab.select_option('#s-timeout', '30'); await tab.wait_for_timeout(2000)
        await phone.evaluate('wilson.sync.pull()'); await phone.wait_for_timeout(500)
        check('Changement sur la tablette → le téléphone suit', await phone.evaluate('wilson.settings.convTimeout') == 30)
        # Le calibrage du regard reste local.
        await tab.evaluate("wilson.settings.gazeCalib = {yaw: 5, pitch: 0, down: 0}; wilson.applySettings('gazeCalib')"); await tab.wait_for_timeout(2000)
        check('Calibrage du regard : jamais envoyé aux autres appareils', 'gazeCalib' not in store['reglages'])

        # --- PC relié plus tard en collant l'adresse du script : il prend les réglages communs (pas l'inverse).
        _, pc, pclogs = await device({'apiKey': 'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', 'voice': 'Puck', 'city': 'Paris', 'v': 3}, 'PC')
        await pc.goto('http://127.0.0.1:8765/index.html')
        await pc.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await pc.evaluate('wilson.ui.open()')
        await pc.fill('#s-logurl', URL); await pc.dispatch_event('#s-logurl', 'change'); await pc.wait_for_timeout(1500)
        s = await pc.evaluate('wilson.settings')
        check('PC qui rejoint : il adopte les réglages communs (sans écraser ceux du téléphone)', s['voice'] == 'Zephyr' and s['city'] == 'Nantes' and store['reglages']['city'] == 'Nantes', f"{s['voice']}, {s['city']}")

        # --- Script pas encore mis à jour : rien ne casse, la raison est affichée.
        store['old'] = True
        await phone.evaluate('wilson.sync.pull()'); await phone.wait_for_timeout(300)
        stt = await phone.evaluate('wilson.sync.state')
        check('Script pas encore mis à jour : message clair, rien ne casse', 'mettre à jour' in stt, stt)

        errs = [l for l in plogs + tlogs + pclogs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
