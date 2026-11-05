"""Appli Android (PLAN 9) : la page de Wilson avec un faux pont window.WilsonAndroid (comme dans l'appli).
 1. Voiture reconnue par Android (micro Bluetooth vu par le pont), même si la page ne voit pas le nom du micro ; caméra éteinte.
 2. Journal : « 1.31.0 · téléphone (appli 1) » ; onglet État : « Appli Android ».
 3. « Guide-moi vers Miroiterie 35 » : le guidage part directement (pont naviguer, adresse de la fiche), sans bouton à
    toucher, la discussion continue, Wilson dit « C'est parti… » ; même demande redite : pas relancé.
 4. Consigne de la voiture : « Le guidage part directement dans la voiture ».
 5. Bouton « Y aller » (s'il s'affiche) : guidage par le pont, la discussion n'est pas fermée.
"""
import asyncio, re, json, os, base64, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  window.__bt = false;
  window.__nav = [];
  window.WilsonAndroid = { version: () => '1', naviguer: (a, n) => { window.__nav.push([a, n]); return 'ok : Google Maps'; }, peutRevenir: () => true, demanderRetour: () => {}, revenir: () => {}, premierPlan: () => true, bluetoothVoiture: () => true };
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt ? [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }] : []),  // (ici : pas de nom Bluetooth, le pont le sait)
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}

CLIENTS = {
    'MIROITERIE': {'cle': '["M LEROY","MIROITERIE 35"]', 'societe': 'MIROITERIE 35', 'contact': 'M LEROY Paul', 'ville': 'Bruz', 'adresse': 'MIROITERIE 35 BRUZ', 'contacts': [{'nom': 'M LEROY Paul', 'tel': '06 11 22 33 44'}]},
    'GALLAIS': {'cle': '["MME AUDRAN Valerie","GALLAIS SARL"]', 'societe': 'GALLAIS SARL', 'contact': 'MME AUDRAN Valerie', 'ville': 'Chavagne', 'adresse': 'GALLAIS SARL CHAVAGNE',
                'contacts': [{'nom': 'MME AUDRAN Valerie', 'tel': '06 62 22 60 48'}, {'nom': 'MME CORDIER Isabelle', 'tel': '02 99 00 00 00'}]},
}
PLUSIEURS = 'Plusieurs clients possibles pour « {} » : ART DU BOIS 72, contact M DE GAULLE Nicolas ; GALLAIS SARL (GALLAIS SARL CHAVAGNE), contact MME CORDIER Isabelle.'


def gemini_json(o):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(o, ensure_ascii=False)}]}}]})


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def parle(conn, texte, sec=1.0, fin=True):
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    if fin: send(conn, turnComplete=True)


def outil(conn, name, args, cid):
    conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))


async def main():
    st = {'calls': []}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA + ' WilsonAndroid/1')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, camera:true, v:4}));")
        await ctx.add_init_script(STUB)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_client':
                q = (d.get('client') or '').upper(); cle = d.get('cle') or ''
                hit = next((c for k, c in CLIENTS.items() if (cle and c['cle'] == cle) or (q and k in q)), None)
                body = {'ok': True, **hit, 'texte': f"Client : {hit['societe']}, {hit['adresse']}."} if hit else {'ok': True, 'texte': 'Client introuvable.'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a in ('mem_lire', 'mem_ecrire'): body = {'ok': True, 'souvenirs': []}
            elif a == 'q_lire': body = {'ok': True, 'questions': []}
            elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': ['Timothée'], 'garde': None}
            else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(GL, lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json({}))))
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'texts': [], 'tools': [], 'setup': None}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(1500)
        has = lambda t: any(t in l for l in logs)
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)

        async def attendre(cond, s=8.0):
            t0 = time.monotonic()
            while time.monotonic() - t0 < s:
                if cond(): return True
                await asyncio.sleep(0.1)
            return False

        check('Voiture reconnue par le pont Android (micro Bluetooth vu par Android, pas par la page)', await page.evaluate("wilson._voitureBt && !wilson.audio.btIn"))
        check('… caméra éteinte', await page.evaluate("wilson.vision === null") and has('Voiture : caméra éteinte'))
        await page.evaluate("wilson.remote.flush()")
        await attendre(lambda: any('version' in c for c in st['calls']), 6)
        v = next((c.get('version') for c in st['calls'] if c.get('version')), '')
        check('Journal : « … · téléphone (appli 1) »', v.endswith('· téléphone (appli 1)'), v)
        bil = await page.evaluate("wilson.bilan()")
        check('Onglet État : « Appli Android : oui (appli 1), retour après le GPS : oui »', 'oui (appli 1), retour après le GPS : oui' in bil.get('Appli Android', ''), str(bil.get('Appli Android')))

        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
        await attendre(lambda: conns and conns[-1]['texts'], 4)
        c = conns[-1]
        check('Consigne : « Le guidage part directement dans la voiture » (pas de bouton à toucher)', 'Le guidage part directement dans la voiture' in sysp(c) and 'appuyer sur « Y aller »' not in sysp(c))
        send(c, inputTranscription={'text': 'Vas-y, guide-moi vers Miroiterie 35.'})
        await page.wait_for_timeout(300)
        outil(c, 'itineraire', {'client': 'Miroiterie 35'}, 'i1')
        await attendre(lambda: resp(c, 'i1') is not None, 6)
        nav = await page.evaluate('window.__nav')
        r = resp(c, 'i1') or ''
        check('Guidage lancé directement par le pont, vers l\'adresse de la fiche', nav == [['MIROITERIE 35 BRUZ', 'MIROITERIE 35']], str(nav))
        check('… sans bouton à toucher, et Gemini le sait (« lancé avec Google Maps … tu reviens tout seul »)', 'est lancé avec Google Maps' in r and 'tu reviens tout seul' in r and await page.evaluate("document.getElementById('cards').hidden"), r[:300])
        parle(c, "C'est parti, je te guide vers Miroiterie 35, à Bruz.")
        await page.wait_for_timeout(400)
        check('… la discussion continue (pas de fin « itinéraire ») et la réponse est dite', await page.evaluate("wilson.state") == 'conversation' and not has('Fin de conversation (itinéraire)') and any("Wilson : C'est parti, je te guide" in l for l in logs))
        outil(c, 'itineraire', {'client': 'Miroiterie 35'}, 'i2')
        await attendre(lambda: resp(c, 'i2') is not None, 6)
        check('Même demande redite : le guidage n\'est pas relancé', len(await page.evaluate('window.__nav')) == 1)
        # bouton « Y aller » : guidage par le pont, discussion gardée
        await page.evaluate("wilson.showRoute({ societe: 'GALLAIS SARL', adresse: 'GALLAIS SARL CHAVAGNE', maps: 'https://www.google.com/maps/dir/?api=1&destination=x', waze: 'https://waze.com/ul?q=x' })")
        await page.click('#cards .card-go.route')
        await page.wait_for_timeout(400)
        nav = await page.evaluate('window.__nav')
        check('Bouton « Y aller » dans l\'appli : guidage par le pont, la discussion n\'est pas fermée', nav[-1] == ['GALLAIS SARL CHAVAGNE', 'GALLAIS SARL'] and await page.evaluate("wilson.state") == 'conversation', str(nav))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, str(errs)[:400])
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
