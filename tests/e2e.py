"""Test de bout en bout de Wilson dans Chromium, avec un faux serveur Gemini Live."""
import asyncio, re, json, base64, re, sys, time, math
import numpy as np
from playwright.async_api import async_playwright

import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
WAV = sys.argv[1] if len(sys.argv) > 1 else f'{S}/fixtures/quiet.wav'
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('✅' if ok else '❌'), name, detail, flush=True)

def voice_pcm(seconds, f0=140):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    sig = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 8)) * env * 6000
    return sig.astype(np.int16)

def audio_chunks(seconds):
    pcm = voice_pcm(seconds); out = []
    for i in range(0, len(pcm), 4800):
        out.append(base64.b64encode(pcm[i:i + 4800].tobytes()).decode())
    return out

class Mock:
    def __init__(self): self.conns = []; self.script = []; self.refuse = False
    async def handler(self, ws):
        if self.refuse:
            ws.on_message(lambda m: asyncio.ensure_future(ws.close(code=1008, reason='API key not valid. Please pass a valid API key.'))); return
        conn = {'ws': ws, 'setup': None, 'audio': 0, 'audio_bytes': 0, 'images': 0, 'texts': [], 'tool_responses': [], 'first_audio_len': None}
        self.conns.append(conn)
        def on_msg(m):
            d = json.loads(m)
            if 'setup' in d:
                conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                ws.send(json.dumps({'sessionResumptionUpdate': {'newHandle': f'handle-{len(self.conns)}', 'resumable': True}}))
            elif 'realtimeInput' in d:
                ri = d['realtimeInput']
                if 'audio' in ri:
                    n = len(base64.b64decode(ri['audio']['data'])) // 2
                    conn['audio'] += 1; conn['audio_bytes'] += n
                    if conn['first_audio_len'] is None: conn['first_audio_len'] = n
                if 'video' in ri: conn['images'] += 1
                if 'text' in ri: conn['texts'].append(ri['text'])
            elif 'toolResponse' in d:
                conn['tool_responses'].extend(d['toolResponse']['functionResponses'])
        ws.on_message(on_msg)

def send(conn, obj): conn['ws'].send(json.dumps(obj))

async def main():
    mock = Mock()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("""localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', convTimeout: 20, subtitles: true}));""")
        page = await ctx.new_page()
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        logs = []
        page.on('console', lambda m: logs.append(m.text))
        page.on('pageerror', lambda e: (logs.append('PAGEERROR ' + str(e)), print('PAGEERROR', e)))
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), mock.handler)
        t0 = time.time()
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && window.wilson.state === "veille"', timeout=20000)
        check('Démarrage : état veille', True, f'{time.time() - t0:.1f}s')
        check('Plus d\'oreille locale à charger (écoute au regard)', await page.evaluate('!wilson.ear'))
        st = await page.evaluate('({run: wilson.audio.running, sr: wilson.audio.ctx.sampleRate, vision: wilson.vision && wilson.vision.mode})')
        check('Micro actif', st['run'], str(st))
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{S}/shots/e2e_veille.png')

        # --- Réveil par le prénom ---
        await page.evaluate("wilson._onWakeWord({text: 'wilson', conf: 0.93})")
        await page.wait_for_function('wilson.state === "conversation"', timeout=10000)
        conn = mock.conns[-1]
        s = conn['setup']
        check('Setup Gemini : modèle, voix, outils, VAD', s['model'] == 'models/gemini-3.8-live' and s['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'] == 'Puck'
              and any('functionDeclarations' in t for t in s['tools']) and 'realtimeInputConfig' in s, s['model'])
        check('Consigne système contient les règles et la date', 'ne dis rien du tout' in s['systemInstruction']['parts'][0]['text'] and 'Nous sommes' in s['systemInstruction']['parts'][0]['text'])
        await page.wait_for_timeout(1200)
        check('Tampon envoyé (≥ 3 s d\'audio avant/pendant le prénom)', conn['audio_bytes'] >= 16000 * 3, f"{conn['audio_bytes'] / 16000:.1f}s, 1er bloc {conn['first_audio_len']} éch.")
        check('Image caméra envoyée au réveil', conn['images'] >= 1, f"{conn['images']} image(s)")

        # --- Réponse de Wilson : émotion + mémoire + voix ---
        send(conn, {'toolCall': {'functionCalls': [
            {'id': 't1', 'name': 'exprimer_emotion', 'args': {'emotion': 'joie', 'intensite': 0.9, 'geste': 'oui'}},
            {'id': 't2', 'name': 'memoriser', 'args': {'fait': "Le chat de la famille s'appelle Moustache."}}]}})
        send(conn, {'serverContent': {'inputTranscription': {'text': "Wilson, retiens que le chat s'appelle Moustache."}}})
        for c in audio_chunks(2.4):
            send(conn, {'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}})
        send(conn, {'serverContent': {'outputTranscription': {'text': "C'est noté, Moustache ! Joli nom."}}})
        await page.wait_for_timeout(300)
        r = await page.evaluate('new Promise((res) => { let mx = 0; const t0 = performance.now(); const iv = setInterval(() => { mx = Math.max(mx, wilson.face.talk); if (performance.now() - t0 > 600) { clearInterval(iv); res({playing: wilson.audio.playing, emo: wilson.face.emotion, facts: wilson.memory.facts.map(f=>f.text), talk: mx, sub: document.getElementById("subtitle").textContent}); } }, 30); })')
        check('Wilson parle (audio joué)', r['playing'], '')
        check('Bouche animée par la voix', r['talk'] > 0.05, f"ouverture {r['talk']:.2f}")
        check('Émotion « joie » appliquée', r['emo'] == 'joie')
        check('Souvenir enregistré', "Le chat de la famille s'appelle Moustache." in r['facts'], str(r['facts']))
        check('Sous-titres', 'Moustache' in r['sub'], r['sub'])
        await page.screenshot(path=f'{S}/shots/e2e_parle.png')
        await page.wait_for_timeout(200)
        tr = {x['id']: x for x in conn['tool_responses']}
        check('Réponses outils silencieuses (SILENT)', tr.get('t1', {}).get('scheduling') == 'SILENT' and tr.get('t2', {}).get('scheduling') == 'SILENT', json.dumps(conn['tool_responses'])[:160])
        a_before = conn['audio']
        await page.wait_for_timeout(400)
        check('Pendant qu\'il parle, sa voix n\'est pas renvoyée (mode prudent)', conn['audio'] - a_before <= 1, f"{conn['audio'] - a_before} bloc(s)")

        # --- On lui coupe la parole ---
        await page.evaluate("wilson.interrupt('test')")
        r = await page.evaluate('({playing: wilson.audio.playing, discard: wilson.discard})')
        check('Coupé : silence immédiat', not r['playing'] and r['discard'])
        for c in audio_chunks(0.6):
            send(conn, {'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}})
        await page.wait_for_timeout(250)
        check('La suite de la phrase coupée est ignorée', not await page.evaluate('wilson.audio.playing'))
        send(conn, {'serverContent': {'interrupted': True}})
        send(conn, {'serverContent': {'turnComplete': True}})
        await page.wait_for_timeout(300)
        a1 = conn['audio']; await page.wait_for_timeout(600)
        check('Après la coupure, le micro repart vers Gemini', conn['audio'] > a1, f"+{conn['audio'] - a1} blocs")
        log = await page.evaluate('wilson.memory.log')
        check('Journal des échanges', len(log) >= 1 and 'Moustache' in json.dumps(log, ensure_ascii=False), json.dumps(log[-1], ensure_ascii=False)[:120])

        # --- Outils bloquants : heure + oubli ---
        send(conn, {'toolCall': {'functionCalls': [{'id': 't3', 'name': 'date_et_heure', 'args': {}}, {'id': 't4', 'name': 'oublier', 'args': {'sujet': 'le chat Moustache'}}]}})
        await page.wait_for_timeout(300)
        tr = {x['id']: x for x in conn['tool_responses']}
        check('date_et_heure répond (format jj/mm/aa, 20h44)', re.search(r'\d\d/\d\d/\d\d, \d+h\d\d', tr.get('t3', {}).get('response', {}).get('result', '')) is not None, tr.get('t3', {}).get('response', {}).get('result'))
        facts = await page.evaluate('wilson.memory.facts.length')
        check('oublier efface le souvenir', facts == 0 and 'Oublié' in tr.get('t4', {}).get('response', {}).get('result', ''), tr.get('t4', {}).get('response', {}).get('result'))

        # --- Reconnexion (goAway) avec reprise de session ---
        n_before = len(mock.conns)
        send(conn, {'goAway': {'timeLeft': '5s'}})
        await page.wait_for_function(f'true', timeout=1000); await page.wait_for_timeout(1200)
        check('goAway → reconnexion avec reprise de session', len(mock.conns) == n_before + 1 and mock.conns[-1]['setup'].get('sessionResumption', {}).get('handle') == f'handle-{n_before}',
              str(mock.conns[-1]['setup'].get('sessionResumption')))
        check('Toujours en conversation après reconnexion', await page.evaluate('wilson.state') == 'conversation')
        conn = mock.conns[-1]

        # --- Au revoir ---
        send(conn, {'toolCall': {'functionCalls': [{'id': 't5', 'name': 'terminer_conversation', 'args': {}}]}})
        for c in audio_chunks(1.0):
            send(conn, {'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}})
        send(conn, {'serverContent': {'turnComplete': True}})
        await page.wait_for_function('wilson.state === "veille"', timeout=8000)
        check('« Au revoir » → retour en veille après sa phrase', True)
        check('Retour en veille', await page.evaluate('wilson.state') == 'veille')

        # --- Silence → fin de conversation ---
        await page.evaluate("wilson.settings.convTimeout = 3")
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000)
        check('Toucher le visage ouvre une conversation (message d\'accueil)', any('toucher' in t for t in mock.conns[-1]['texts']), str(mock.conns[-1]['texts'])[:100])
        t1 = time.time()
        await page.wait_for_function('wilson.state === "veille"', timeout=15000)
        check('Silence → retour en veille tout seul', True, f'{time.time() - t1:.1f}s (réglé à 3 s)')

        # --- Clé refusée ---
        mock.refuse = True
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_timeout(1500)
        r = await page.evaluate('({st: wilson.state, badge: document.getElementById("badge").textContent, emo: wilson.face.emotion})')
        check('Clé refusée : message clair + retour en veille', r['st'] == 'veille' and 'clé' in r['badge'], str(r))
        await page.screenshot(path=f'{S}/shots/e2e_cle.png')

        # --- Réglages (appui long) ---
        await page.mouse.move(640, 400); await page.mouse.down(); await page.wait_for_timeout(1700); await page.mouse.up()
        await page.wait_for_timeout(300)
        check('Appui long → réglages', await page.evaluate('!document.getElementById("settings").hidden'))
        await page.screenshot(path=f'{S}/shots/e2e_reglages.png')

        errs = [l for l in logs if 'PAGEERROR' in l or 'Uncaught' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        print('\n'.join(l for l in logs if '[Wilson]' in l or 'tection' in l or 'arn' in l)[-3500:])
        await b.close()
    ok = sum(1 for r in results if r[1]); print(f'\n{ok}/{len(results)} vérifications OK')

asyncio.run(main())
