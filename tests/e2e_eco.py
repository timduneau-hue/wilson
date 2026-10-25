"""Mode économique : direct refusé (quota) → Gemini Flash + voix de la tablette."""
import asyncio, json, re, base64, struct
from playwright.async_api import async_playwright

import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

FAKE_TTS = """
(() => {
  const spoken = []; window.__spoken = spoken;
  const fake = { speaking: false, pending: false, _u: null, _t: null,
    getVoices() { return [{ name: 'Google français', lang: 'fr-FR', localService: true }, { name: 'Anglais', lang: 'en-US', localService: true }]; },
    speak(u) { if (!(u.text || '').trim()) { setTimeout(() => u.onend && u.onend({}), 5); return; } spoken.push(u.text); this.speaking = true; this._u = u; clearTimeout(this._t);
      this._t = setTimeout(() => { this.speaking = false; const x = this._u; this._u = null; x && x.onend && x.onend({}); }, 300 + u.text.length * 15); },
    cancel() { clearTimeout(this._t); const x = this._u; this._u = null; this.speaking = false; if (x && x.onerror) x.onerror({ error: 'interrupted' }); },
    addEventListener() {}, };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
})();
"""

async def main():
    st = {'reqs': [], 'reply': None, 'eco': 'ok', 'think_reject': False, 'replies_seq': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', subtitles: true, listenMode:'toujours', v:3}));")
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        async def ws_handler(ws):   # Gemini Live : toujours « quota »
            ws.on_message(lambda m: asyncio.ensure_future(ws.close(code=1011, reason='You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/live_sessions, limit: 0, model: gemini-3.8-live')))
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), ws_handler)

        async def gen(route):
            req = route.request
            if st['eco'] == 'down': await route.abort('internetdisconnected'); return
            if req.method == 'OPTIONS':
                await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}); return
            body = json.loads(req.post_data); model = req.url.split('/models/')[1].split(':')[0]
            st['reqs'].append({'model': model, 'body': body, 'key': req.headers.get('x-goog-api-key')})
            H = {'access-control-allow-origin': '*'}
            think = (body.get('generationConfig', {}).get('thinkingConfig') or {}).get('thinkingLevel')
            if st['think_reject'] and think == 'minimal':
                await route.fulfill(status=400, content_type='application/json', headers=H, body=json.dumps({'error': {'code': 400, 'message': 'Thinking level "minimal" is not supported for this model.'}})); return
            if st['eco'] == 'quota':
                await route.fulfill(status=429, content_type='application/json', headers=H, body=json.dumps({'error': {'code': 429, 'message': 'You exceeded your current quota. Please retry later.', 'status': 'RESOURCE_EXHAUSTED'}})); return
            reply = (st['replies_seq'].pop(0) if st.get('replies_seq') else None) or st['reply'] or {'entendu': 'Test', 'pour_moi': True, 'reponse': 'OK', 'emotion': 'neutre'}
            order = ['pour_moi', 'chercher', 'regarder', 'emotion', 'reponse', 'geste', 'memoriser', 'oublier', 'fin', 'entendu']
            reply = {k: reply[k] for k in order if k in reply}
            text = '```json\n' + json.dumps(reply, ensure_ascii=False) + '\n```'
            st['stream_used'] = 'stream' in req.url
            if 'stream' in req.url:
                n = max(1, len(text) // 4); chunks = [text[i:i + n] for i in range(0, len(text), n)]
                sse = ''.join('data: ' + json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': c}]}}]}, ensure_ascii=False) + '\r\n\r\n' for c in chunks)
                await route.fulfill(status=200, content_type='text/event-stream', headers=H, body=sse)
            else:
                await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': text}]}}]}))
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:(stream)?[gG]enerateContent.*'), gen)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)

        await page.wait_for_timeout(1500)
        await page.evaluate("""window.__voice = () => { const a = new Int16Array(16000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.12) * 8000 * (0.6 + 0.4 * Math.sin(i * 0.002));
          wilson.audio.speaking = true; wilson.audio._offCnt = 0; wilson.audio.lastVoicedAt = performance.now(); let pushed = false;
          const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now();
            const c = wilson.ecoState && wilson.ecoState.cap; if (c && !pushed) { pushed = true; c.chunks.push(a); c.len += a.length; c.voiced = (c.voiced || 0) + 30; } }, 20);
          setTimeout(() => clearInterval(iv), 500); }""")

        # 1. Réveil : direct refusé → mode économique, la phrase est envoyée
        st['reply'] = {'entendu': "Wilson, retiens que le chat s'appelle Moustache", 'pour_moi': True, 'reponse': "C'est noté, Moustache !", 'emotion': 'joie', 'geste': 'oui', 'memoriser': ["Le chat de la famille s'appelle Moustache."], 'oublier': '', 'fin': False}
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function('wilson.mode === "eco"', timeout=10000)
        check('Direct refusé (quota) → bascule en mode économique', True)
        try:
            await page.wait_for_function('window.__spoken.length >= 1', timeout=10000)
        except Exception:
            print('REQS', len(st['reqs'])); print(chr(10).join(l for l in logs if 'Wilson' in l or 'rror' in l)[-3000:])
            print(await page.evaluate("JSON.stringify({mode: wilson.mode, st: wilson.state, eco: wilson.ecoState && {busy: wilson.ecoState.busy, cap: !!wilson.ecoState.cap, len: wilson.ecoState.cap && wilson.ecoState.cap.len}, speaking: wilson.audio.speaking, vs: wilson.voice.speaking})"))
            raise
        r0 = st['reqs'][0]; body = r0['body']; parts = body['contents'][-1]['parts']
        wav = next((p_['inlineData'] for p_ in parts if p_.get('inlineData', {}).get('mimeType') == 'audio/wav'), None)
        raw = base64.b64decode(wav['data']) if wav else b''
        rate = struct.unpack('<I', raw[24:28])[0] if len(raw) > 44 else 0
        check('Phrase envoyée en WAV 16 kHz (silences retirés)', raw[:4] == b'RIFF' and rate == 16000 and (len(raw) - 44) / 32000 >= 1, f"{(len(raw)-44)/32000:.1f} s")
        check('Aucune photo jointe d\'office (R6)', not any(p_.get('inlineData', {}).get('mimeType') == 'image/jpeg' for p_ in parts))
        gc = body['generationConfig']
        check('1re requête sans outil (pas de recherche « au cas où »), JSON imposé par schéma, réflexion minimale',
              'tools' not in body and gc.get('responseMimeType') == 'application/json' and (gc.get('responseSchema') or {}).get('propertyOrdering', [])[:5] == ['pour_moi', 'chercher', 'regarder', 'emotion', 'reponse']
              and 'MODE ÉCONOMIQUE' in body['systemInstruction']['parts'][0]['text'] and gc['thinkingConfig']['thinkingLevel'] == 'minimal', r0['model'])
        lst = await page.evaluate("wilson.face.listenShown")
        check("Plus de halo d'écoute en bas de l'écran", lst < 0.02, f"{lst:.3f}")
        check("Modèle rapide (Flash-Lite) en flux, clé dans l'en-tête", r0['model'] == 'gemini-3.5-flash-lite' and st.get('stream_used') and r0['key'].startswith('AQ.'), r0['model'])
        sp = await page.evaluate('window.__spoken')
        check('Réponse lue par la voix de la tablette', sp[-1] == "C'est noté, Moustache !", str(sp))
        await page.wait_for_timeout(150)
        info = await page.evaluate("({facts: wilson.memory.facts.map(f=>f.text), emo: wilson.face.emotion, talk: wilson.face.talk, sub: document.getElementById('subtitle').textContent, log: wilson.memory.log.slice(-1)[0]})")
        check('Souvenir enregistré', "Le chat de la famille s'appelle Moustache." in info['facts'])
        check('Émotion « joie »', info['emo'] == 'joie')
        check('Bouche animée pendant la voix', info['talk'] > 0.05, f"{info['talk']:.2f}")
        check('Sous-titres + journal', 'Moustache' in info['sub'] and 'Moustache' in (info['log'] or {}).get('user', ''))
        await page.wait_for_function('!wilson.voice.speaking', timeout=5000)

        # 2. Phrase suivante sans le prénom (détection de voix simulée)
        n = len(st['reqs'])
        st['reply'] = {'entendu': 'Et il a quel âge ?', 'pour_moi': True, 'reponse': 'Tu ne me l\'as pas encore dit !', 'emotion': 'curieux'}
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__voice()")
        try:
            await page.wait_for_function(f'window.__spoken.length >= 2', timeout=10000)
        except Exception:
            print('REQS', len(st['reqs'])); print(chr(10).join(l for l in logs)[-3000:])
            print(await page.evaluate("JSON.stringify({mode: wilson.mode, st: wilson.state, eco: wilson.ecoState && {busy: wilson.ecoState.busy, cap: !!wilson.ecoState.cap}, speaking: wilson.audio.speaking, vs: wilson.voice.speaking, pe: performance.now()-wilson.playEndAt, lv: performance.now()-wilson.audio.lastVoicedAt})"))
            raise
        hist = st['reqs'][-1]['body']['contents']
        check('Suite de la conversation sans redire « Wilson »', len(st['reqs']) == n + 1, f"{len(st['reqs']) - n} requête")
        check('Historique de la conversation transmis', len(hist) == 3 and 'Moustache' in json.dumps(hist[0], ensure_ascii=False), f"{len(hist)} messages")
        await page.wait_for_function('!wilson.voice.speaking', timeout=5000)

        # 2b. Photo à la demande (R6) : « regarder » → phrase d'attente, puis 2e requête avec une photo nette.
        n = len(st['reqs'])
        st['replies_seq'] = [{'pour_moi': True, 'regarder': True, 'emotion': 'curieux', 'reponse': 'Je regarde…', 'entendu': 'De quelle couleur est mon pull ?'},
                             {'pour_moi': True, 'regarder': False, 'emotion': 'joie', 'reponse': 'Ton pull est bleu marine.', 'entendu': ''}]
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__voice()")
        await page.wait_for_function("window.__spoken.includes('Ton pull est bleu marine.')", timeout=10000)
        r1, r2 = st['reqs'][n]['body'], st['reqs'][n + 1]['body']
        img2 = next((p_['inlineData'] for p_ in r2['contents'][-1]['parts'] if p_.get('inlineData', {}).get('mimeType') == 'image/jpeg'), None)
        check('Regarder (économique) : 1re requête sans photo, 2e avec une photo nette', not any(p_.get('inlineData', {}).get('mimeType') == 'image/jpeg' for p_ in r1['contents'][-1]['parts'])
              and img2 is not None and len(img2['data']) > 1000 and 'Photo prise' in json.dumps(r2['contents'][-1], ensure_ascii=False), f"{len(st['reqs']) - n} requêtes")
        check('… phrase d\'attente puis réponse', (await page.evaluate('window.__spoken'))[-2:] == ['Je regarde…', 'Ton pull est bleu marine.'])
        st['replies_seq'] = []
        # (la fausse voix de ce test ne met pas les phrases en file : la 1re ne finit qu'au filet de sécurité, d'où l'attente)
        await page.wait_for_function('!wilson.voice.speaking', timeout=15000)

        # 2c. Pas de réseau (PLAN C8) : il le dit, la phrase est gardée et renvoyée au retour du réseau
        await page.wait_for_function('!wilson.voice.speaking', timeout=8000)
        old = st['reply']; st['eco'] = 'down'; ns = len(await page.evaluate('window.__spoken'))
        st['reply'] = {'entendu': 'Quelle heure est-il ?', 'pour_moi': True, 'reponse': 'Il est dix heures.', 'emotion': 'neutre'}
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__voice()")
        await page.wait_for_function("!!wilson.netWait", timeout=8000)
        await page.wait_for_timeout(300)
        sp = (await page.evaluate('window.__spoken'))[ns:]
        check('Économique sans réseau : il le dit, la phrase est gardée', any('plus de réseau' in x for x in sp) and await page.evaluate("!!(wilson.netWait && wilson.netWait.eco && wilson.state === 'conversation')"), str(sp))
        st['eco'] = 'ok'
        await page.evaluate("window.dispatchEvent(new Event('online'))")
        await page.wait_for_function("window.__spoken.includes('Il est dix heures.')", timeout=8000)
        check('… réseau revenu : la même phrase est renvoyée, il y répond', not await page.evaluate('!!wilson.netWait'))
        st['reply'] = old
        await page.wait_for_function('!wilson.voice.speaking', timeout=8000)

        # 3. Les gens parlent entre eux → silence
        st['reply'] = {'entendu': 'On mange à quelle heure ?', 'pour_moi': False, 'reponse': '', 'emotion': 'neutre'}
        await page.wait_for_timeout(1200); k = len(await page.evaluate('window.__spoken'))
        await page.evaluate("window.__voice()")
        await page.wait_for_function(f'!wilson.ecoState || (!wilson.ecoState.busy && !wilson.ecoState.cap)', timeout=10000); await page.wait_for_timeout(300)
        check('Pas pour lui → il se tait', len(await page.evaluate('window.__spoken')) == k)

        # 4. Coupure pendant qu'il parle
        st['reply'] = {'entendu': 'Raconte-moi une longue histoire', 'pour_moi': True, 'reponse': "Il était une fois un petit robot qui vivait dans un salon. " * 4, 'emotion': 'joie'}
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__voice()")
        await page.wait_for_function('wilson.voice.speaking', timeout=10000); await page.wait_for_timeout(300)
        await page.evaluate("wilson.interrupt('test')")
        r = await page.evaluate("({sp: wilson.voice.speaking, cap: !!(wilson.ecoState && wilson.ecoState.cap)})")
        check('Coupé → silence immédiat, sans réenregistrer sa propre voix', not r['sp'] and not r['cap'], str(r))
        st['reply'] = {'entendu': 'Attends', 'pour_moi': True, 'reponse': 'Oui ?', 'emotion': 'ecoute'}
        await page.wait_for_function('!wilson.ecoState || !wilson.ecoState.busy', timeout=10000)
        await page.wait_for_timeout(400); await page.evaluate("window.__voice()")
        await page.wait_for_function("window.__spoken.slice(-1)[0] === 'Oui ?'", timeout=10000)
        check('… et écoute la suite juste après', True)

        # 5. Au revoir → veille
        await page.wait_for_function('!wilson.ecoState || (!wilson.ecoState.busy && !wilson.ecoState.cap)', timeout=10000)
        st['reply'] = {'entendu': 'Merci Wilson, bonne nuit', 'pour_moi': True, 'reponse': 'Bonne nuit !', 'emotion': 'tendresse', 'fin': True}
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__voice()")
        await page.wait_for_function('wilson.state === "veille"', timeout=10000)
        check('« Bonne nuit » → retour en veille', await page.evaluate('wilson.mode === null'))

        # 6. Réglage de réflexion refusé → nouvel essai
        st['think_reject'] = True; await page.evaluate('wilson.eco.thinking = "minimal"'); n = len(st['reqs'])
        st['reply'] = {'entendu': 'Wilson quelle heure', 'pour_moi': True, 'reponse': 'Il est sept heures.', 'emotion': 'neutre'}
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function("window.__spoken.slice(-1)[0] === 'Il est sept heures.'", timeout=10000)
        thinks = [(x['body']['generationConfig'].get('thinkingConfig') or {}).get('thinkingLevel') for x in st['reqs'][n:]]
        check('Réflexion « minimal » refusée → réessai en « low » (jamais la réflexion par défaut, lente)', thinks == ['minimal', 'low'], str(thinks))
        live_calls = await page.evaluate('wilson.brain.modelUsed')
        await page.evaluate("wilson.endConversation('test')"); st['think_reject'] = False

        # 7. Quota du mode économique épuisé aussi
        st['eco'] = 'quota'; n = len(st['reqs'])
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function('wilson.state === "veille"', timeout=15000); await page.wait_for_timeout(200)
        badge = await page.evaluate("document.getElementById('badge').textContent")
        check('Quota économique épuisé → message clair, retour en veille', 'mode économique' in badge and 'épuisé' in badge, badge)
        check('Chaque modèle essayé une fois au plus (3.x puis secours 2.5)', len(st['reqs']) - n <= 5, f"{len(st['reqs']) - n} requêtes : {[x['model'] for x in st['reqs'][n:]]}")
        n = len(st['reqs'])
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})"); await page.wait_for_timeout(800)
        check('Ensuite : aucune requête gaspillée', len(st['reqs']) == n)

        # 7b. Lecture partielle du JSON (parole en flux)
        cases = ['```json\n{"pour_moi": true, "emotion": "joie", "reponse": "Il fait 12.5 degrés à Nantes. Pense à ta veste',
                 '{"pour_moi": false, "emotion"',
                 '{"pour_moi": true, "emotion": "neutre", "reponse": "Oui \\"Moustache\\" !", "geste"']
        res = await page.evaluate("async (cases) => { const m = await import('./js/eco.js'); return cases.map((c) => m.partialReply(c)); }", cases)
        pr = {'a': res[0], 'b': res[1], 'c': res[2]}
        check('Lecture partielle : phrase en cours, émotion, guillemets échappés', pr['a']['pourMoi'] is True and pr['a']['emotion'] == 'joie' and pr['a']['reponse'].startswith('Il fait 12.5') and not pr['a']['closed'] and pr['b']['pourMoi'] is False and pr['c']['reponse'] == 'Oui "Moustache" !' and pr['c']['closed'], json.dumps(pr, ensure_ascii=False)[:200])

        # 8. Réglages : diagnostic complet
        st['eco'] = 'ok'
        await page.evaluate('wilson.ui.open()')
        await page.click('#t-key')
        await page.wait_for_function("document.getElementById('s-keystatus').textContent.includes('parler')", timeout=20000)
        t = await page.inner_text('#s-keystatus')
        check('Vérifier : direct refusé mais mode économique ✓', 'Mode économique ✓' in t and 'Direct impossible' in t and 'peut parler' in t, t.replace('\n', ' | ')[:260])
        await page.screenshot(path=f'{S}/shots/settings_eco.png')
        opts = await page.evaluate("[...document.querySelectorAll('#s-ecovoice option')].map(o=>o.textContent)")
        check('Voix françaises proposées (pas l\'anglaise)', any('Google français' in o for o in opts) and not any('Anglais' in o for o in opts), str(opts))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
