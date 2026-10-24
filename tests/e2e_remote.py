"""Journal à distance : Wilson envoie son journal, ses délais et son bilan au script Apps Script (simulé ici)."""
import asyncio, json, re, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
FAKE_TTS = """
(() => {
  const spoken = []; window.__spoken = spoken;
  const fake = { speaking: false, _u: null, _t: null,
    getVoices() { return [{ name: 'Google français', lang: 'fr-FR', localService: true }]; },
    speak(u) { if (!(u.text || '').trim()) { setTimeout(() => u.onend && u.onend({}), 5); return; } spoken.push(u.text); this.speaking = true; this._u = u;
      setTimeout(() => u.onstart && u.onstart({}), 30);
      this._t = setTimeout(() => { this.speaking = false; const x = this._u; this._u = null; x && x.onend && x.onend({}); }, 300); },
    cancel() { clearTimeout(this._t); const x = this._u; this._u = null; this.speaking = false; if (x && x.onerror) x.onerror({ error: 'interrupted' }); },
    addEventListener() {}, };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
})();
"""
# sendBeacon au moment du rechargement : Playwright ne voit pas ces envois, on note donc l'appel lui-même.
SPY_BEACON = """(() => { const o = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (u, d) => { const r = new FileReader(); const n = +(sessionStorage.getItem('beacons') || 0) + 1; sessionStorage.setItem('beacons', n);
    sessionStorage.setItem('beaconUrl', u); sessionStorage.setItem('beaconSize', d && d.size || 0); return o(u, d); }; })();"""
FAKE_QR = """window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; }
  async detect() { return window.__qr ? [{ rawValue: window.__qr }] : []; } };"""
VOICE = """window.__voice = () => { const a = new Int16Array(16000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.12) * 8000;
  wilson.audio.speaking = true; wilson.audio._offCnt = 0; wilson.audio.lastVoicedAt = performance.now(); let pushed = false;
  const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now();
    const c = wilson.ecoState && wilson.ecoState.cap; if (c && !pushed) { pushed = true; c.chunks.push(a); c.len += a.length; c.voiced = (c.voiced || 0) + 30; } }, 20);
  setTimeout(() => clearInterval(iv), 500); }"""


async def main():
    st = {'posts': [], 'fail': False}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("if (!sessionStorage.getItem('keep')) localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'eco', listenMode:'toujours', v:3}));")
        await ctx.add_init_script(FAKE_TTS); await ctx.add_init_script(FAKE_QR); await ctx.add_init_script(SPY_BEACON)
        page = await ctx.new_page(); logs = []; beacons = []
        ctx.on('request', lambda r: beacons.append((r.method, r.url, r.resource_type)) if 'script.google.com' in r.url else None)
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        async def script(route):
            req = route.request
            if req.method != 'POST':
                await route.fulfill(status=200, body='ok'); return
            if st['fail']:
                await route.abort('internetdisconnected'); return
            d = json.loads(req.post_data)
            if 'action' in d:                           # recherche, réglages communs : pas des envois du journal
                await route.fulfill(status=200, content_type='text/plain', body='ok'); return
            st['posts'].append(d)
            await route.fulfill(status=200, content_type='text/plain', body='ok')
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)

        async def gen(route):
            req = route.request
            H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS':
                await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            text = json.dumps({'pour_moi': True, 'chercher': '', 'emotion': 'joie', 'reponse': 'Le chat dort sur le canapé.', 'entendu': 'Où est le chat ?'}, ensure_ascii=False)
            await route.fulfill(status=200, content_type='text/event-stream', headers=H, body='data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': text}]}}]}, ensure_ascii=False) + '\r\n\r\n')
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*Content.*'), gen)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.evaluate(VOICE)

        # 1. Sans adresse : rien ne part.
        await page.evaluate("wilson.log('test sans adresse'); wilson.remote.flush()"); await page.wait_for_timeout(300)
        check('Sans adresse de script : rien n\'est envoyé', not st['posts'])

        # 2. Réglages : adresse invalide refusée, adresse valide acceptée.
        await page.evaluate('wilson.ui.open()')
        await page.fill('#s-logurl', 'https://exemple.com/pas-un-script'); await page.dispatch_event('#s-logurl', 'change')
        t = await page.inner_text('#s-logstatus')
        check('Adresse invalide refusée avec explication', 'script.google.com/macros' in t and not await page.evaluate('wilson.remote.on'), t[:90])
        await page.fill('#s-logurl', URL); await page.dispatch_event('#s-logurl', 'change')
        await page.wait_for_timeout(600)
        check('Adresse valide : journal activé et envoyé tout de suite', await page.evaluate('wilson.remote.on') and len(st['posts']) >= 1
              and any('Journal à distance activé' in l['m'] for l in st['posts'][-1]['lignes']), f"{len(st['posts'])} envoi(s)")
        p0 = st['posts'][-1]
        check('Bilan de la tablette joint (version, vision, navigateur…)', p0['version'].startswith(await page.evaluate('wilson.version') + ' · ') and all(k in p0['bilan'] for k in ['Version', 'État', 'Vision', 'Visage', 'Mode économique', 'Navigateur', 'Batterie']), ', '.join(list(p0['bilan'])[:8]))
        await page.evaluate("document.getElementById('s-close').click()")

        # 3. Une réponse : la phrase échangée et les délais partent.
        n_conv = len(st['posts'])
        await page.evaluate("wilson.startConversation('ouvert')")
        await page.wait_for_function('wilson.state === "conversation"', timeout=5000); await page.wait_for_timeout(300)
        await page.evaluate('window.__voice()')
        try:
            await page.wait_for_function("window.__spoken.includes('Le chat dort sur le canapé.')", timeout=8000)
        except Exception:
            print('\n'.join(l for l in logs if 'Wilson' in l or 'rror' in l)[-2500:]); raise
        await page.wait_for_function("wilson.logs.some(l => l.includes('Délais'))", timeout=8000)
        n = len(st['posts']); await page.evaluate('wilson.remote.flush()'); await page.wait_for_timeout(400)
        msgs = [l['m'] for p_ in st['posts'][n_conv:] for l in p_['lignes']]
        p1 = {'mesures': [m for p_ in st['posts'][n_conv:] for m in p_.get('mesures', [])]}
        check('Phrase échangée envoyée', any('Où est le chat' in m and 'canapé' in m for m in msgs), str(msgs)[:160])
        m1 = (p1['mesures'] or [{}])[0]
        check('Mesure de délais envoyée (onglet Délais)', isinstance(m1.get('complet'), (int, float)) and m1.get('modele') == 'gemini-3.5-flash-lite' and m1.get('reflexion') == 'minimal' and isinstance(m1.get('voix'), (int, float)), json.dumps(m1)[:200])

        # 4. Phrases masquées si on le demande ; le reste du journal part toujours.
        await page.evaluate("wilson.settings.logContent = false")
        await page.evaluate("wilson.log('« secret de famille » → réponse', true); wilson.log('Erreur technique visible')")
        n = len(st['posts']); await page.evaluate('wilson.remote.flush()'); await page.wait_for_timeout(300)
        msgs = [l['m'] for l in st['posts'][-1]['lignes']]
        check('Option décochée : phrases masquées, le technique reste', '[phrase masquée]' in msgs and 'Erreur technique visible' in msgs and not any('secret' in m for m in msgs), str(msgs))
        await page.evaluate("wilson.settings.logContent = true")

        # 5. Erreurs JavaScript notées.
        await page.evaluate("(() => { setTimeout(() => { throw new Error('boum de test'); }, 0); Promise.reject(new Error('promesse ratée de test')); })()")
        await page.wait_for_timeout(300); await page.evaluate('wilson.remote.flush()'); await page.wait_for_timeout(300)
        msgs = [l['m'] for l in st['posts'][-1]['lignes']]
        check('Erreurs JavaScript envoyées dans le journal', any(m.startswith('Erreur : ') and 'boum de test' in m for m in msgs) and any('promesse ratée de test' in m for m in msgs), str(msgs)[:200])

        # 6. Pas de réseau : les lignes sont gardées et repartent ensuite.
        st['fail'] = True
        await page.evaluate("wilson.log('ligne pendant la coupure')")
        ok = await page.evaluate('wilson.remote.flush()')
        st['fail'] = False
        ok2 = await page.evaluate('wilson.remote.flush()'); await page.wait_for_timeout(300)
        msgs = [l['m'] for l in st['posts'][-1]['lignes']]
        check('Coupure réseau : lignes gardées puis envoyées', ok is False and ok2 is True and 'ligne pendant la coupure' in msgs, f'{ok}, {ok2}')

        # 7. Beaucoup de lignes d'un coup : envoi rapide (sans attendre 30 s).
        n = len(st['posts'])
        await page.evaluate("for (let i = 0; i < 85; i++) wilson.log('rafale ' + i)")
        await page.wait_for_timeout(3000)
        check('Rafale de lignes : envoi en ~2 s', len(st['posts']) > n and any(l['m'] == 'rafale 84' for p_ in st['posts'][n:] for l in p_['lignes']))

        # 8. QR code scanné par la caméra → adresse enregistrée.
        await page.evaluate("wilson.settings.logUrl = ''; localStorage.setItem('wilson.settings', JSON.stringify(wilson.settings)); wilson.ui.open()")
        await page.evaluate("document.getElementById('t-logscan').click()")
        await page.wait_for_timeout(500)
        prev = await page.evaluate("!document.getElementById('logscan').hidden")
        await page.evaluate(f"window.__qr = '{URL}'")
        await page.wait_for_function("document.getElementById('s-logstatus').textContent.includes('QR code lu')", timeout=5000)
        saved = await page.evaluate("JSON.parse(localStorage.getItem('wilson.settings')).logUrl")
        check('QR code scanné : aperçu caméra, adresse enregistrée sur la tablette', prev and saved == URL and await page.inner_text('#s-logurl') == '' and await page.input_value('#s-logurl') == URL)
        stt = await page.inner_text('#s-logstatus')
        await page.evaluate("document.getElementById('s-close').click(); wilson.ui.open()")
        stt2 = await page.inner_text('#s-logstatus')
        check('Réglages : état du journal affiché (dernier envoi)', 'Actif' in stt2, stt2)

        # 9. « Envoyer maintenant ».
        n = len(st['posts'])
        await page.click('#t-logsend'); await page.wait_for_timeout(500)
        check('Bouton « Envoyer maintenant »', len(st['posts']) > n and 'envoyé' in (await page.inner_text('#s-logstatus')))
        await page.evaluate("document.getElementById('s-close').click()")

        # 10. Rechargement (mise à jour) : ce qui attend part avant.
        n = len(st['posts'])
        await page.evaluate("sessionStorage.setItem('keep', '1'); wilson.log('juste avant le rechargement')")
        await page.reload(); await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000); await page.wait_for_timeout(800)
        bc = await page.evaluate("({n: +(sessionStorage.getItem('beacons') || 0), u: sessionStorage.getItem('beaconUrl'), s: +(sessionStorage.getItem('beaconSize') || 0)})")
        check('Rechargement : ce qui attend part par « beacon » (envoi garanti par le navigateur)', bc['n'] >= 1 and bc['u'] == URL and bc['s'] > 100, str(bc))

        errs = [l for l in logs if 'PAGEERROR' in l and 'de test' not in l]
        check('Aucune autre erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
