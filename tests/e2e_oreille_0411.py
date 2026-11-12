"""Journal du 04/11/26, 16h57-16h59 (téléphone relié à la voiture, 1.26.3) : 8 « Wilson » reconnus par l'oreille
(dernières phrases : 110.74✓ 83.86✓ … dans l'état), aucun réveil et rien au journal ; réveillé seulement au regard à 16h59:38.
Une vérification par Gemini restée bloquée (réseau mobile, pas de délai) faisait ignorer tous les « Wilson » suivants.
1. Vérification bloquée : abandonnée au bout de 4 s, Wilson se réveille quand même (voiture) avec la phrase et la consigne « Oui ? ».
2. « Wilson » entendu pendant une vérification : noté au journal (« ignoré »), plus jamais en silence.
3. Phrases de l'oreille notées au journal en voiture Bluetooth ; second avis (« presque ») permis en voiture Bluetooth.
4. Gemini répond « non » vite : pas de réveil (rien ne change).
"""
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
    ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=ua)
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
        # Google ne répond jamais (réseau mobile bloqué)
        async def bloque(route): await asyncio.sleep(30)
        await page.route(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'), bloque)
        await page.evaluate("wilson.oreille.templates = [[1], [1], [1]]; wilson.oreille.seuil = 167.3; wilson.audio.speaking = false; wilson.audio.lastVoicedAt = 0")
        check('Téléphone relié à la voiture, en veille', await page.evaluate("wilson._voitureBt && wilson.state === 'veille'"))
        await page.evaluate("window.__dit = []; wilson.voice.speak = (t) => { window.__dit.push(String(t)); return Promise.resolve(); }")
        await page.evaluate("wilson._onName({ score: 83.9, limite: 167.3 })")
        await page.wait_for_timeout(600)
        await page.evaluate("wilson._onName({ score: 110.7, limite: 167.3 })")
        await page.wait_for_timeout(200)
        check('« Wilson » possible pendant une vérification : gardé et vérifié juste après (plus jamais ignoré)', has('vérifié juste après'), str([l for l in logs if 'Oreille' in l])[-200:])
        await page.wait_for_timeout(11000)
        etat = await page.evaluate("wilson.state")
        dit = await page.evaluate("window.__dit.slice()")
        check('Vérification bloquée (réseau lent) : PAS de réveil (17h53-17h55 : il parlait tout seul)', etat == 'veille' and has('trop lente (plus de 10 s) : pas de réveil'), etat + str([l for l in logs if 'Oreille' in l])[-300:])
        check('… mais il prévient qu\'il n\'arrive pas à vérifier (voix du téléphone)', any('réseau est trop lent' in x for x in dit), str(dit))
        await page.wait_for_timeout(11000)
        dit = await page.evaluate("window.__dit.slice()")
        check('… le candidat gardé est vérifié ensuite ; toujours pas de réveil, et pas prévenu deux fois en 5 min', await page.evaluate("wilson.state") == 'veille' and has('déjà prévenu') and len([x for x in dit if 'réseau' in x]) == 1, str(dit))
        check('… le verrou de vérification est libéré', await page.evaluate('!wilson._nomEnCours'))
        # Sans réseau du tout : pas de réveil non plus
        await page.evaluate("wilson._prevenuAt = 0; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); wilson._onName({ score: 90, limite: 167.3 })")
        await page.wait_for_timeout(300)
        dit = await page.evaluate("window.__dit.slice()")
        check('Sans réseau : pas de réveil, il dit qu\'il n\'a pas de réseau', await page.evaluate("wilson.state") == 'veille' and any("pas de réseau" in x for x in dit), str(dit))
        await page.evaluate("Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })")
        # Gemini confirme « Wilson » : réveil, et le son part en 8 kHz
        sent = []
        async def oui(route):
            sent.append(route.request.post_data or '')
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps({'texte': 'Wilson', 'nom_sur': True, 'tele': False})}]}}]}))
        await page.unroute(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'))
        await page.route(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'), oui)
        await page.evaluate("wilson._nomCalme = 0; wilson._onName({ score: 95, limite: 167.3 })")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        rate = 0
        try:
            d = json.loads(sent[-1]); wav = base64.b64decode(d['contents'][0]['parts'][0]['inlineData']['data']); rate = int.from_bytes(wav[24:28], 'little')
        except Exception as e: rate = str(e)
        check('Gemini confirme « Wilson » : réveil ; son envoyé en 8 kHz (deux fois plus léger)', rate == 8000, str(rate))
        await page.wait_for_timeout(500)
        conn = conns[-1]
        check('… « Wilson » tout seul : « Oui ? »', any('dis seulement « Oui ? »' in x for x in conn['texts']), str(conn['texts'])[:200])
        await page.unroute(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'))
        await page.route(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'), bloque)
        # journal de l'oreille et second avis en voiture Bluetooth
        await page.evaluate("wilson.endConversation('test')")
        await page.wait_for_function('wilson.state === "veille"', timeout=8000)
        await page.evaluate("wilson._oreilleLog({ score: 190.2, oui: false, duree: 1.1 }); wilson._oreilleLog({ score: 900, oui: false, duree: 2.0 })")
        check('Phrase proche de « Wilson » notée au journal en voiture Bluetooth (pas le bruit lointain)', has('écart 190.2') and not has('écart 900.0'))
        await page.evaluate("wilson._secondAvis({ score: 190.2, limite: 167.3, duree: 1.1 })")
        await page.wait_for_timeout(11000)
        check('Second avis (« presque ») permis en voiture Bluetooth, avec délai maximal', has('Second avis impossible'), str([l for l in logs if 'avis' in l])[-160:])
        # Gemini répond vite « non » : pas de réveil
        await page.unroute(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'))
        await page.route(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'), lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json',
            body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps({'texte': 'il fait beau', 'nom_sur': False, 'tele': False})}]}}]}))))
        await page.evaluate("wilson._nomCalme = 0; wilson._onName({ score: 150.0, limite: 167.3 })")
        await page.wait_for_timeout(2500)
        check('Gemini répond « non » à temps : pas de réveil', await page.evaluate("wilson.state") == 'veille' and has('Gemini entend « il fait beau » → non'))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
