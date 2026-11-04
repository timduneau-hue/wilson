"""Garde « sourd » en voiture (demande de Timothée du 04/11/26, 17h40 : « il faut que je sois au courant ») :
1. Appli cachée (écran éteint, autre appli) : noté au journal, petit son et phrase ; au retour, il dit combien de temps il
   n'a rien entendu.
2. Micro muet plus de 5 s à l'écran : il le dit et relance le son ; dès que le micro revient, il dit qu'il entend de nouveau.
3. À la maison (tablette), rien de tout ça."""

import asyncio, re, json, os, base64
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

STUB = """(() => {
  window.__bt = true;
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt ? [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }] : []),
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
TAB_UA = 'Mozilla/5.0 (Linux; Android 10; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def run(p, ua, bt, model, conns):
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=ua)
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'%s', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, v:4}));" % model)
    await ctx.add_init_script(STUB.replace('window.__bt = true', 'window.__bt = ' + ('true' if bt else 'false')))
    await ctx.add_init_script(GAZE)
    page = await ctx.new_page(); logs = []
    async def script(route):
        if 'crm_client' in (route.request.post_data or ''): await asyncio.sleep(1.5)     # CRM lent : Google annule avant la réponse
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                            body=json.dumps({'ok': True, 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}))
    await page.route(re.compile(r'https://script\.google\.com/.*'), script)
    await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    def handler(ws):
        conn = {'ws': ws, 'texts': [], 'setup': None, 'tools': []}; conns.append(conn)
        def on_msg(m):
            d = json.loads(m)
            if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
            elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
        ws.on_message(on_msg)
    await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
    await page.goto('http://127.0.0.1:8765/index.html')
    await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
    await page.wait_for_timeout(500)
    return b, page, logs


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def reponse(conn, texte, entendu=None, sec=0.8):
    if entendu: send(conn, inputTranscription={'text': entendu})
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, turnComplete=True)




async def main():
    async with async_playwright() as p:
        conns = []
        b, page, logs = await run(p, PHONE_UA, True, 'gemini-3.1-flash-live-preview', conns)
        has = lambda t: any(t in l for l in logs)
        await page.evaluate("window.__dit = []; const s0 = wilson.voice.speak.bind(wilson.voice); wilson.voice.speak = (t, o) => { window.__dit.push(t); return Promise.resolve(); }; wilson._sayAfter = (t) => window.__dit.push(t)")
        check('Téléphone relié à la voiture, en veille', await page.evaluate("wilson._voitureBt && wilson.state === 'veille'"))
        # 1. appli cachée
        await page.evaluate("wilson._sourdDebut('appli en arrière-plan ou écran éteint')")
        dit = await page.evaluate("window.__dit.slice()")
        check('Appli cachée : journal + « je ne t\'entends plus »', has('Sourd : appli en arrière-plan') and any('je ne t\'entends plus' in str(x) for x in dit), str(dit))
        await page.evaluate("wilson._sourd.at -= 125000; wilson._sourdFin()")
        dit = await page.evaluate("window.__dit.slice()")
        check('Au retour : il dit combien de temps il n\'entendait pas (2 minutes)', has('Sourd pendant 125 s') and any('2 minutes' in str(x) and 'je ne t\'entendais pas' in str(x) for x in dit), str(dit))
        # 2. micro muet
        await page.evaluate("window.__dit = []; wilson._shownAt = performance.now() - 10000; wilson._capAt = performance.now() - 7000; wilson.audio._emit = () => {}; wilson._sourdGarde()")
        dit = await page.evaluate("window.__dit.slice()")
        check('Micro muet 7 s : il le dit tout de suite', has('Sourd : micro muet') and any('mon micro est coupé' in str(x) for x in dit), str(dit) + str([l for l in logs if 'Sourd' in l]))
        await page.evaluate("wilson._sourd.at -= 30000; wilson._capAt = performance.now(); wilson._sourdGarde()")
        dit = await page.evaluate("window.__dit.slice()")
        check('Micro revenu : « je t\'écoute »', any('mon micro était coupé' in str(x) for x in dit) and not await page.evaluate("wilson._sourd"), str(dit))
        await b.close()
        # 3. tablette à la maison
        conns = []
        b, page, logs = await run(p, TAB_UA, False, 'gemini-3.1-flash-live-preview', conns)
        await page.evaluate("window.__dit = []; wilson.voice.speak = (t) => { window.__dit.push(t); return Promise.resolve(); }")
        await page.evaluate("wilson._sourdDebut('appli en arrière-plan ou écran éteint'); wilson._capAt = performance.now() - 9000; wilson._shownAt = 0; wilson._sourdGarde()")
        dit = await page.evaluate("window.__dit.slice()")
        check('À la maison : rien (pas de « sourd »)', not await page.evaluate("wilson._sourd") and not any('entends plus' in str(x) for x in dit) and not any('Sourd' in l for l in logs), str(dit))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK"); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
