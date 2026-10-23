"""Mode direct : recherche par l'outil « chercher » (Gemini Flash-Lite + Google Search), jamais bloquée.
Cas réel du 23/10/26 : la recherche intégrée de Gemini Live a dit « je cherche ça tout de suite… Let me check » puis plus rien."""
import asyncio, re, json, base64, os, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns, eco = [], {'reqs': [], 'delay': 0, 'reply': 'Demain à Argenteuil, soleil et 18 degrés.'}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'toujours', convTimeout: 60, city:'Argenteuil', v:3}));")
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'tool_responses': [], 'texts': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['tool_responses'].extend(d['toolResponse']['functionResponses'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        async def gen(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS':
                await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            body = json.loads(req.post_data); eco['reqs'].append(body)
            if eco['delay']: await asyncio.sleep(eco['delay'])
            text = json.dumps({'pour_moi': True, 'emotion': 'joie', 'reponse': eco['reply'], 'entendu': ''}, ensure_ascii=False)
            try:
                await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': text}]},
                    'groundingMetadata': {'webSearchQueries': ['météo Argenteuil demain']}}]}))
            except Exception: pass
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*Content.*'), gen)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.mode === "live"', timeout=10000)
        conn = conns[-1]
        sysp = conn['setup']['systemInstruction']['parts'][0]['text']
        check('Consigne : phrase d\'attente en français puis outil chercher (avec la ville)', 'appelle chercher' in sysp and 'Argenteuil' in sysp and 'toujours en français' in sysp)

        # 1. Recherche normale : le résultat repart vers Gemini Live, Wilson le dit.
        await page.evaluate("(() => { const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now(); }, 20); setTimeout(() => clearInterval(iv), 300); })()")
        await page.wait_for_timeout(400)
        t0 = time.time()
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's1', 'name': 'chercher', 'args': {'question': 'Quel temps fera-t-il demain à Argenteuil ?'}}]}}))
        for _ in range(50):
            if conn['tool_responses']: break
            await asyncio.sleep(0.1)
        dt = time.time() - t0
        r = conn['tool_responses'][0] if conn['tool_responses'] else {}
        check('Résultat renvoyé à Gemini Live', r.get('id') == 's1' and 'soleil et 18 degrés' in r.get('response', {}).get('result', ''), f"{dt:.1f} s : {json.dumps(r, ensure_ascii=False)[:140]}")
        q = eco['reqs'][-1] if eco['reqs'] else {}
        check('Recherche faite par Flash-Lite + Google Search, question seule (sans historique ni son)', q.get('tools') == [{'googleSearch': {}}] and len(q.get('contents', [])) == 1
              and 'inlineData' not in json.dumps(q.get('contents')) and 'Argenteuil' in json.dumps(q.get('contents'), ensure_ascii=False), str(len(q.get('contents', []))))
        for c in audio_chunks(1.0):
            conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Demain, grand soleil et 18 degrés.'}, 'turnComplete': True}}))
        await page.wait_for_timeout(400)
        d = next((l for l in logs if 'Délais (direct)' in l), '')
        check('Délais : temps de recherche indiqué', 'dont recherche' in d, d)
        await page.wait_for_function('!wilson.audio.playing', timeout=5000); await page.wait_for_timeout(600)

        # 2. Recherche trop longue : au bout de ~9 s, Gemini reçoit « pas abouti » (Wilson n'attend jamais indéfiniment).
        eco['delay'] = 15; n = len(conn['tool_responses']); t0 = time.time()
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's2', 'name': 'chercher', 'args': {'question': 'Résultat du match de ce soir ?'}}]}}))
        for _ in range(140):
            if len(conn['tool_responses']) > n: break
            await asyncio.sleep(0.1)
        dt = time.time() - t0
        r = conn['tool_responses'][n] if len(conn['tool_responses']) > n else {}
        check('Recherche trop longue : réponse « pas abouti » après ~9 s', r.get('id') == 's2' and 'pas abouti' in r.get('response', {}).get('result', '') and 8 <= dt <= 11.5, f"{dt:.1f} s")

        # 3. Gemini reste muet après le résultat : relance au bout de 10 s.
        await page.wait_for_timeout(10500)
        check('Gemini muet 10 s après le résultat → relance', any('Donne maintenant ta réponse' in x for x in conn['texts']) and any('relance' in l for l in logs), str(conn['texts'][-1:]))

        # 4. On coupe Wilson pendant une recherche : elle est abandonnée, rien n'est renvoyé.
        eco['delay'] = 3; n = len(conn['tool_responses'])
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's3', 'name': 'chercher', 'args': {'question': 'Horaires du cinéma'}}]}}))
        await page.wait_for_timeout(500)
        conn['ws'].send(json.dumps({'toolCallCancellation': {'ids': ['s3']}}))
        await page.wait_for_timeout(3500)
        check('Recherche annulée : pas de réponse envoyée', len(conn['tool_responses']) == n and any('Recherche annulée' in l for l in logs))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
