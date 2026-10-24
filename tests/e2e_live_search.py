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
    conns, eco = [], {'reqs': [], 'delay': 0, 'reply': 'Demain à Argenteuil, soleil et 18 degrés.', 'quota_web': False}
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
            if eco['quota_web'] and 'tools' in body:      # quota de recherche Google épuisé (cas réel du 23/10/26)
                await route.fulfill(status=429, content_type='application/json', headers=H, body=json.dumps({'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED',
                    'message': 'You exceeded your current quota, please check your plan and billing details.',
                    'details': [{'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaMetric': 'generativelanguage.googleapis.com/search_grounding_requests', 'quotaId': 'SearchGroundingRequestsPerDay-FreeTier', 'quotaValue': '0'}]}]}})); return
            if eco['delay']: await asyncio.sleep(eco['delay'])
            text = json.dumps({'pour_moi': True, 'emotion': 'joie', 'reponse': eco['reply'], 'entendu': ''}, ensure_ascii=False)
            try:
                await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': text}]},
                    'groundingMetadata': {'webSearchQueries': ['météo Argenteuil demain']}}]}))
            except Exception: pass
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*Content.*'), gen)

        # Script de Timothée (journal + recherche Tavily), simulé.
        script = {'mode': 'ok', 'questions': []}
        async def script_route(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}')
            if d.get('action') != 'chercher' or script['mode'] == 'ancien':
                await route.fulfill(status=200, content_type='text/plain', headers={'access-control-allow-origin': '*'}, body='ok'); return
            script['questions'].append(d.get('question'))
            body = {'ok': True, 'reponse': 'Demain à Angers : éclaircies, de 9 à 17 degrés.', 'resultats': [{'titre': 'Météo Angers', 'url': 'https://m.example', 'extrait': 'Samedi éclaircies, 9 à 17 °C.'}]} \
                if script['mode'] == 'ok' else {'ok': False, 'erreur': 'clé Tavily absente du script'}
            await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script_route)

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

        # 2. Recherche lente (12 s) : Wilson a dit qu'il cherchait, il attend l'info et la donne (il n'abandonne pas).
        eco['delay'] = 12; eco['reply'] = 'Le match s\'est terminé sur le score de 2 à 1.'; n = len(conn['tool_responses']); t0 = time.time()
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's2', 'name': 'chercher', 'args': {'question': 'Résultat du match de ce soir ?'}}]}}))
        for _ in range(200):
            if len(conn['tool_responses']) > n: break
            await asyncio.sleep(0.1)
        dt = time.time() - t0
        r = conn['tool_responses'][n] if len(conn['tool_responses']) > n else {}
        check('Recherche lente : la vraie réponse arrive quand elle est prête (pas d\'abandon)', r.get('id') == 's2' and '2 à 1' in r.get('response', {}).get('result', '') and 11 <= dt <= 15, f"{dt:.1f} s")
        eco['delay'] = 0

        # 3. Gemini reste muet après le résultat : relance au bout de 6 s.
        await page.wait_for_timeout(6500)
        check('Gemini muet 6 s après le résultat → relance', any('Donne maintenant ta réponse' in x for x in conn['texts']) and any('relance' in l for l in logs), str(conn['texts'][-1:]))

        # 3b. Google refuse la recherche (quota) : même question sans Internet, réponse prudente plutôt que rien.
        eco['quota_web'] = True; eco['reply'] = 'Je ne peux pas vérifier en ligne pour l\'instant, mais en octobre il fait souvent doux.'
        n = len(conn['tool_responses']); k = len(eco['reqs'])
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's4', 'name': 'chercher', 'args': {'question': 'Quel temps fera-t-il demain à Angers ?'}}]}}))
        for _ in range(80):
            if len(conn['tool_responses']) > n: break
            await asyncio.sleep(0.1)
        r = conn['tool_responses'][n] if len(conn['tool_responses']) > n else {}
        reqs = eco['reqs'][k:]
        check('Recherche refusée (quota) : réponse sans Internet, Wilson répond quand même', r.get('id') == 's4' and 'vérifier en ligne' in r.get('response', {}).get('result', '')
              and reqs and 'tools' not in reqs[-1] and any('tools' in x for x in reqs), f"{len(reqs)} requêtes, dernière sans recherche : {'tools' not in reqs[-1] if reqs else '?'}")
        check('Détail du quota écrit dans le journal', any('SearchGroundingRequestsPerDay-FreeTier, limit: 0' in l for l in logs))
        await page.wait_for_timeout(300)
        k = len(eco['reqs'])
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 's5', 'name': 'chercher', 'args': {'question': 'Et après-demain ?'}}]}}))
        await page.wait_for_timeout(1500)
        check('Recherche refusée retenue : la suivante part directement sans Internet (1 seule requête)', len(eco['reqs']) - k == 1 and 'tools' not in eco['reqs'][k], f"{len(eco['reqs']) - k} requête(s)")
        await page.evaluate("localStorage.removeItem('wilson.rechercheRefusee')")
        eco['quota_web'] = False

        # 3c. Recherche gratuite par Tavily (via le script) : utilisée en premier, sans passer par Gemini.
        await page.evaluate("wilson.settings.logUrl = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'; localStorage.removeItem('wilson.rechercheRefusee')")
        async def ask_tool(cid, q):
            n0 = len(conn['tool_responses'])
            conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': 'chercher', 'args': {'question': q}}]}}))
            for _ in range(80):
                if len(conn['tool_responses']) > n0: break
                await asyncio.sleep(0.1)
            return conn['tool_responses'][n0] if len(conn['tool_responses']) > n0 else {}
        k = len(eco['reqs'])
        r = await ask_tool('t1', 'Quel temps fera-t-il demain à Angers ?')
        res = r.get('response', {}).get('result', '')
        check('Recherche par Tavily (script) : infos rendues à Wilson, sans requête Gemini', 'éclaircies, de 9 à 17' in res and 'Source 1 (Météo Angers)' in res and len(eco['reqs']) == k
              and script['questions'][-1:] == ['Quel temps fera-t-il demain à Angers ?'], res[:120])
        check('Journal : recherche Tavily notée', any('Recherche Tavily faite' in l for l in logs))
        script['mode'] = 'ancien'; k = len(eco['reqs'])
        r = await ask_tool('t2', 'Et dimanche ?')
        check('Script pas encore mis à jour : secours Gemini, et la raison est notée', r.get('id') == 't2' and len(eco['reqs']) > k and any('ancienne version' in l for l in logs))
        script['mode'] = 'sanscle'; k = len(eco['reqs'])
        r = await ask_tool('t3', 'Et lundi ?')
        check('Clé Tavily absente du script : secours Gemini, raison notée', r.get('id') == 't3' and len(eco['reqs']) > k and any('clé Tavily absente' in l for l in logs))
        script['mode'] = 'ok'
        await page.evaluate("wilson.settings.logUrl = ''")

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
