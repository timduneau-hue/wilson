"""Appli Android 3 : c'est l'appli qui écoute (micro du téléphone), la page n'ouvre plus aucun micro (PLAN 9, A12).
Journal du 05/11/26, 18h24 (« le son ne marche toujours pas dans la voiture ») : dans l'appli 2, la page prenait le micro
de la voiture (canal « appel » du Bluetooth) et la voix de Wilson ne passait plus dans les haut-parleurs.
 1. Démarrage : micro de l'appli demandé (sans anti-écho), aucun micro ouvert par la page ; « Micro prêt » le dit.
 2. Le son de l'appli (40 ms, 16 kHz) remplit le tampon, la voix est détectée, puis le silence.
 3. Discussion : le son de l'appli part vers Gemini ; voiture reconnue par le pont.
 4. Plus de son de l'appli pendant 2,5 s : micro relancé, puis « revenu ».
 5. Anti-écho changé : micro de l'appli relancé avec anti-écho, toujours pas de micro de la page.
 6. Appli qui ne sait pas ouvrir son micro : micro de la page, et le journal le dit.
"""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  window.__mic = Object.assign({ starts: [], stops: 0, push: true, ko: false, amp: 150, on: false }, window.__micInit || {});
  window.WilsonAndroid = { version: () => '3', naviguer: () => 'ok : Google Maps', peutRevenir: () => true, demanderRetour: () => {}, revenir: () => {},
    premierPlan: () => true, bluetoothVoiture: () => true, sonVoiture: () => 'mode normal, sorties : Bluetooth musique;, canal appel fermé, silence', etatSon: () => 'mode normal',
    microDemarre: (echo) => { __mic.starts.push(echo); if (__mic.ko) return 'erreur : micro impossible à ouvrir'; __mic.on = true; return 'ok : micro du téléphone, source reconnaissance vocale, 16 kHz, anti-bruit'; },
    microArrete: () => { __mic.stops++; __mic.on = false; } };
  let ph = 0;
  setInterval(() => {
    if (!__mic.on || !__mic.push || !window.__wilsonMicro) return;
    let s = '';
    for (let i = 0; i < 640; i++) {
      ph += 2 * Math.PI * 220 / 16000;
      const v = Math.round(Math.sin(ph) * __mic.amp + (Math.random() - 0.5) * 60) & 0xffff;
      s += String.fromCharCode(v & 0xff, v >> 8);
    }
    window.__wilsonMicro(btoa(s));
  }, 40);
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => { (window.__gum = window.__gum || []).push(!!(c && c.audio)); return gum0(c && c.audio ? { audio: true, video: false } : c); };
})();"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36 WilsonAndroid/3'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}


async def ouvrir(b, conns, init=''):
    ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, camera:true, v:4}));")
    if init: await ctx.add_init_script(init)
    await ctx.add_init_script(STUB)
    page = await ctx.new_page(); logs = []

    async def script(route):
        body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0, 'souvenirs': [], 'questions': [], 'messages': [], 'noms': ['Timothée'], 'garde': None}
        await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
    await page.route(re.compile(r'https://script\.google\.com/.*'), script)
    await page.route(GL, lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json', headers=H, body='{}')))
    await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

    def handler(ws):
        conn = {'ws': ws, 'audio': 0}; conns.append(conn)
        def on_msg(m):
            d = json.loads(m)
            if 'setup' in d: ws.send(json.dumps({'setupComplete': {}}))
            elif 'realtimeInput' in d and 'audio' in d['realtimeInput']: conn['audio'] += 1
        ws.on_message(on_msg)
    await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
    await page.goto('http://127.0.0.1:8765/index.html')
    await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
    await page.wait_for_timeout(1200)
    return ctx, page, logs


async def attendre(cond, s=8.0):
    t0 = time.monotonic()
    while time.monotonic() - t0 < s:
        if await cond(): return True
        await asyncio.sleep(0.1)
    return False


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx, page, logs = await ouvrir(b, conns)
        has = lambda t: any(t in l for l in logs)
        ev = page.evaluate

        mic = await ev('window.__mic')
        check('Démarrage : micro de l\'appli demandé, sans anti-écho', mic['starts'][:1] == [False], str(mic))
        check('… aucun micro ouvert par la page (getUserMedia audio)', True not in (await ev('window.__gum || []')), str(await ev('window.__gum || []')))
        check('… « Micro prêt » le dit (micro de l\'appli, micro du téléphone, voiture sur le canal musique)', any('Micro prêt' in l and "micro de l'appli (micro du téléphone, source reconnaissance vocale" in l and 'canal musique' in l for l in logs), str([l for l in logs if 'Micro prêt' in l])[:300])
        check('… pas de « micro de la page »', await ev('wilson.audio.natif && !wilson.audio.stream && !wilson.audio.src'))
        check('Voiture reconnue (pont) ; caméra éteinte', await ev('wilson._voitureBt && wilson.audio.btIn && wilson.vision === null'))
        # Remarque du 06/11/26, 08h57 : en veille dans la voiture, le micro de l'appli est arrêté ; rouvert au toucher.
        ok = await attendre(lambda: ev('wilson.audio.micPaused && window.__mic.stops >= 1'), 5)
        check('En veille dans la voiture : micro de l\'appli arrêté', ok and has('micro fermé (voiture, en veille'), str(await ev('window.__mic')))
        n0 = len((await ev('window.__mic'))['starts'])
        await page.wait_for_timeout(3000)
        check('… et pas relancé tout seul (« muet » voulu)', len((await ev('window.__mic'))['starts']) == n0 and not has("micro de l'appli muet depuis"))

        await ev("wilson.startConversation('toucher')")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
        check('Toucher : micro de l\'appli rouvert', await attendre(lambda: ev(f'!wilson.audio.micPaused && window.__mic.starts.length > {n0}'), 3))
        f0 = await ev('wilson.audio.ringFilled')
        await page.wait_for_timeout(600)
        f1 = await ev('wilson.audio.ringFilled')
        check('Le son de l\'appli remplit le tampon (16 kHz)', 7000 < f1 - f0 < 13000 or f1 >= 16000 * 14, f'{f0} → {f1}')
        await ev('window.__mic.amp = 14000')
        ok = await attendre(lambda: ev('wilson.audio.speaking'), 3)
        check('… voix détectée (son fort)', ok, str(await ev('wilson.audio.db')))
        await ev('window.__mic.amp = 150')
        ok = await attendre(lambda: ev('!wilson.audio.speaking'), 3)
        check('… puis le silence', ok)
        await ev('window.__mic.amp = 9000')
        ok = await attendre(lambda: asyncio.sleep(0, result=bool(conns and conns[-1]['audio'] > 5)), 4)
        check('Discussion : le son de l\'appli part vers Gemini', ok, str(conns[-1]['audio'] if conns else 'pas de connexion'))
        await ev('window.__mic.amp = 150')

        n0 = len((await ev('window.__mic'))['starts'])
        await ev('window.__mic.push = false')
        ok = await attendre(lambda: ev(f'window.__mic.starts.length > {n0} && window.__mic.stops >= 1'), 5)
        check('Plus de son de l\'appli pendant 2,5 s : micro relancé', ok and has("micro de l'appli muet depuis"), str(await ev('window.__mic')))
        check('… et marqué muet (comme un micro pris)', await ev('wilson.audio.micTaken'))
        await ev('window.__mic.push = true')
        ok = await attendre(lambda: ev('!wilson.audio.micTaken'), 3)
        check('… son revenu : « micro de l\'appli revenu », micro rendu', ok and has("micro de l'appli revenu"))

        await ev('window.__mic.starts = []')
        ch = await ev('wilson.audio.setEchoCancel(true)')
        mic = await ev('window.__mic')
        check('Anti-écho changé : micro de l\'appli relancé avec anti-écho', ch and mic['starts'] == [True], str(mic))
        check('… toujours aucun micro de la page', True not in (await ev('window.__gum || []')) and await ev('!wilson.audio.stream'))
        check('… describe : « anti-écho de l\'appli »', "anti-écho de l'appli" in await ev('wilson.audio.describe()'))
        s0 = (await ev('window.__mic'))['stops']
        await ev("wilson.endConversation('test')")
        check('Fin de la discussion : micro de l\'appli de nouveau arrêté', await attendre(lambda: ev(f'wilson.audio.micPaused && window.__mic.stops > {s0}'), 3))
        bil = await ev('wilson.bilan()')
        check('Onglet État : « micro : celui de l\'appli (téléphone) »', "micro : celui de l'appli (téléphone)" in bil.get('Appli Android', ''), str(bil.get('Appli Android')))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, str(errs)[:400])
        await ctx.close()

        # appli dont le micro ne s'ouvre pas : micro de la page
        ctx, page, logs = await ouvrir(b, conns, 'window.__micInit = { ko: true };')
        has = lambda t: any(t in l for l in logs)
        check('Micro de l\'appli impossible : micro de la page, et le journal le dit', has("micro de l'appli impossible (micro impossible à ouvrir) : micro de la page") and True in (await page.evaluate('window.__gum || []')) and not await page.evaluate('wilson.audio.natif'))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('… aucune erreur JavaScript', not errs, str(errs)[:400])
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
