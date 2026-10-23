"""Rapidité du mode économique (PLAN.md, section 6 bis) : envoi anticipé, recherche en deux temps, relance, garde-fous."""
import asyncio, json, re, base64, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

# Fausse voix de la tablette : note l'heure de chaque phrase dite.
FAKE_TTS = """
(() => {
  const spoken = []; window.__spoken = spoken; window.__spokenAt = [];
  const fake = { speaking: false, _u: null, _t: null,
    getVoices() { return [{ name: 'Google français', lang: 'fr-FR', localService: true }]; },
    speak(u) { if (!(u.text || '').trim()) { setTimeout(() => u.onend && u.onend({}), 5); return; }
      spoken.push(u.text); window.__spokenAt.push(performance.now()); this.speaking = true; this._u = u; clearTimeout(this._t);
      this._t = setTimeout(() => { this.speaking = false; const x = this._u; this._u = null; x && x.onend && x.onend({}); }, 250 + u.text.length * 8); },
    cancel() { clearTimeout(this._t); const x = this._u; this._u = null; this.speaking = false; if (x && x.onerror) x.onerror({ error: 'interrupted' }); },
    addEventListener() {}, };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
})();
"""

VOICE = """window.__voice = (ms = 500) => { const a = new Int16Array(16000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.12) * 8000 * (0.6 + 0.4 * Math.sin(i * 0.002));
  wilson.audio.speaking = true; wilson.audio._offCnt = 0; wilson.audio.lastVoicedAt = performance.now(); let pushed = false;
  const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now();
    const c = wilson.ecoState && wilson.ecoState.cap; if (c && !pushed) { pushed = true; c.chunks.push(a); c.len += a.length; c.voiced = (c.voiced || 0) + 30; } }, 20);
  setTimeout(() => clearInterval(iv), ms); }"""


def wav_seconds(body):
    for p_ in body['contents'][-1]['parts']:
        d = p_.get('inlineData', {})
        if d.get('mimeType') == 'audio/wav':
            return (len(base64.b64decode(d['data'])) - 44) / 32000
    return 0


async def main():
    st = {'reqs': [], 'replies': [], 'search_reply': None, 'delays': [], 'schema_reject': False}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("if (!sessionStorage.getItem('keep')) localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'eco', listenMode:'toujours', city:'Argenteuil', v:3}));")
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        async def gen(route):
            req = route.request
            if req.method == 'OPTIONS':
                await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}); return
            body = json.loads(req.post_data); model = req.url.split('/models/')[1].split(':')[0]
            entry = {'model': model, 'body': body, 't': time.monotonic(), 'search': 'tools' in body}
            st['reqs'].append(entry)
            H = {'access-control-allow-origin': '*'}
            gc = body.get('generationConfig', {})
            if st['schema_reject'] and 'responseSchema' in gc:
                await route.fulfill(status=400, content_type='application/json', headers=H, body=json.dumps({'error': {'code': 400, 'message': 'Invalid JSON payload received. Unknown name "responseSchema" at \'generation_config\': Cannot find field.'}})); return
            delay = st['delays'].pop(0) if st['delays'] else 0
            if delay: await asyncio.sleep(delay)
            if entry['search']:
                reply = st['search_reply'] or {'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Rien trouvé.'}
            else:
                reply = st['replies'].pop(0) if len(st['replies']) > 1 else (st['replies'][0] if st['replies'] else {'pour_moi': True, 'reponse': 'OK'})
            order = ['pour_moi', 'chercher', 'emotion', 'reponse', 'geste', 'memoriser', 'oublier', 'fin', 'entendu']
            reply = {k: reply[k] for k in order if k in reply}
            text = json.dumps(reply, ensure_ascii=False)
            n = max(1, len(text) // 4); chunks = [text[i:i + n] for i in range(0, len(text), n)]
            sse = ''.join('data: ' + json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': c}]}}]}, ensure_ascii=False) + '\r\n\r\n' for c in chunks)
            try:
                await route.fulfill(status=200, content_type='text/event-stream', headers=H, body=sse)
            except Exception:
                entry['aborted'] = True     # la tablette a annulé cette requête (envoi anticipé ou relance perdante)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:(stream)?[gG]enerateContent.*'), gen)

        async def boot():
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
            await page.wait_for_timeout(800); await page.evaluate(VOICE)

        async def open_conv():
            if await page.evaluate('wilson.state') != 'conversation':
                await page.evaluate("wilson.startConversation('ouvert')")
                await page.wait_for_function('wilson.state === "conversation" && wilson.mode === "eco"', timeout=5000)
            await page.wait_for_function('!wilson.ecoState.busy && !wilson.ecoState.cap && !wilson.voice.speaking', timeout=15000)
            await page.wait_for_timeout(1150)    # garde anti-écho après sa dernière parole

        def delais():
            return [l for l in logs if 'Délais' in l]

        async def new_delais(c, timeout=10):   # la ligne « Délais » s'écrit quand Wilson a fini de parler
            for _ in range(int(timeout * 10)):
                if len(delais()) > c: return delais()[-1]
                await asyncio.sleep(0.1)
            return ''

        await boot()

        # 1. Envoi anticipé confirmé : une seule requête, partie ~250 ms après la voix ; Wilson ne parle qu'après 500 ms de silence.
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken')); c = len(delais())
        st['replies'] = [{'pour_moi': True, 'chercher': '', 'emotion': 'joie', 'reponse': 'Bonjour toi !', 'entendu': 'Salut Wilson'}]
        await page.evaluate('window.__voice()')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=8000)
        d = await new_delais(c)
        m_env = re.search(r'envoi ([\d.]+) s \(anticipé\)', d); m_first = re.search(r'1re phrase ([\d.]+) s', d)
        check('Envoi anticipé : la phrase part dès ~250 ms de silence', len(st['reqs']) - n == 1 and m_env and float(m_env.group(1)) <= 0.45, d)
        check('… mais Wilson attend la fin de phrase confirmée (≥ 0,5 s) pour parler', m_first and 0.5 <= float(m_first.group(1)) <= 0.9, m_first.group(0) if m_first else '')
        check('Ligne « Délais » complète (réflexion, modèle)', 'réflexion minimal' in d and 'gemini-3.5-flash-lite' in d)

        # 2. Envoi anticipé annulé : la personne reprend après une courte pause → une seule réponse, à la phrase complète.
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken'))
        st['replies'] = [{'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Réponse à la phrase entière.', 'entendu': 'Je voudrais savoir… combien de pattes a une araignée'}]
        st['delays'] = [0.6]                       # Google met 0,6 s : l'envoi anticipé est encore en route quand la personne reprend
        await page.evaluate('window.__voice(500)')
        await page.wait_for_timeout(850)           # silence de ~350 ms : envoi anticipé parti, fin pas encore confirmée
        await page.evaluate('window.__voice(500)')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=8000); await page.wait_for_timeout(1500)
        sp = (await page.evaluate('window.__spoken'))[k:]
        reqs = st['reqs'][n:]
        check('Reprise après une pause : envoi anticipé annulé, phrase complète renvoyée', len(reqs) == 2 and wav_seconds(reqs[1]['body']) > wav_seconds(reqs[0]['body']) + 0.5,
              f"{len(reqs)} requêtes, {[round(wav_seconds(r['body']), 1) for r in reqs]} s")
        check('… une seule réponse dite', sp == ['Réponse à la phrase entière.'], str(sp))
        check('… rien de la requête annulée dans l\'historique', await page.evaluate("wilson.eco.history.filter(h => h.role === 'model').length") == 2)
        check('Annulation notée dans le journal', any('Envoi anticipé annulé' in l for l in logs))

        # 3. Recherche en deux temps : phrase d'attente tout de suite, puis réponse issue de Google Search.
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken')); c = len(delais())
        st['replies'] = [{'pour_moi': True, 'chercher': 'météo Argenteuil demain', 'emotion': 'reflexion', 'reponse': 'Attends, je regarde.', 'entendu': 'Quel temps fera-t-il demain ?'}]
        st['search_reply'] = {'pour_moi': True, 'emotion': 'joie', 'reponse': 'Demain, grand soleil et 18 degrés.'}
        st['delays'] = [0, 1.6]                    # la recherche prend 1,6 s
        await page.evaluate('window.__voice()')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=8000)
        await page.wait_for_timeout(900)           # phrase d'attente finie, recherche en cours
        gap = await page.evaluate('({sp: wilson.voice.speaking, mouth: wilson.voice.mouth()})')
        await page.wait_for_function(f'window.__spoken.length > {k + 1}', timeout=8000)
        sp = (await page.evaluate('window.__spoken'))[k:]
        reqs = st['reqs'][n:]
        r2 = reqs[1]['body'] if len(reqs) > 1 else {}
        last = (r2.get('contents') or [{}])[-1].get('parts', [])
        check('Phrase d\'attente dite tout de suite, puis le résultat', sp == ['Attends, je regarde.', 'Demain, grand soleil et 18 degrés.'], str(sp))
        check('2e requête : Google Search, texte seul (pas de son renvoyé), sans schéma',
              len(reqs) == 2 and r2.get('tools') == [{'googleSearch': {}}] and all('inlineData' not in x for x in last) and 'météo Argenteuil demain' in last[-1].get('text', '')
              and 'responseSchema' not in r2.get('generationConfig', {}) and 'RECHERCHE' in r2['systemInstruction']['parts'][0]['text'], json.dumps(last, ensure_ascii=False)[:160])
        check('Bouche fermée pendant la recherche (Wilson ne fait pas semblant de parler)', gap['sp'] and gap['mouth'] == 0, str(gap))
        check('Ville de la maison connue pour la recherche', 'Argenteuil' in reqs[0]['body']['systemInstruction']['parts'][0]['text'])
        d = await new_delais(c)
        check('Recherche notée dans « Délais »', 'recherche' in d, d)

        # 4. Relance : Google ne répond pas (lenteur aléatoire) → la même requête repart après ~2,2 s ; la plus rapide gagne.
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken')); c = len(delais())
        st['replies'] = [{'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Me voilà.', 'entendu': 'Tu es là ?'}]
        st['delays'] = [8, 0]
        t0 = time.monotonic()
        await page.evaluate('window.__voice()')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=12000)
        dt = time.monotonic() - t0
        await page.wait_for_timeout(300)
        reqs = st['reqs'][n:]
        check('Relance après ~2,2 s : réponse en ~3 s au lieu de 8 s', len(reqs) == 2 and dt < 4.5 and 1.8 < reqs[1]['t'] - reqs[0]['t'] < 3.0,
              f"{len(reqs)} requêtes, réponse après {dt:.1f} s, relance à {reqs[1]['t'] - reqs[0]['t']:.1f} s" if len(reqs) == 2 else f"{len(reqs)} requêtes")
        d = await new_delais(c)
        check('… notée « relancée » dans le journal', 'relancée' in d, d)
        check('… une seule réponse dite', (await page.evaluate('window.__spoken'))[k:] == ['Me voilà.'])

        # 5. Garde-fou du palier gratuit : déjà 10 requêtes dans la minute → ni envoi anticipé ni relance.
        await page.wait_for_timeout(5000)          # la requête lente perdante se termine
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken')); c = len(delais())
        await page.evaluate('wilson.eco.sent = Array(10).fill(performance.now())')
        st['replies'] = [{'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Doucement.', 'entendu': 'Encore ?'}]
        st['delays'] = [3]
        await page.evaluate('window.__voice()')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=12000)
        d = await new_delais(c)
        check('Garde-fou : une seule requête, envoi normal (pas anticipé), pas de relance', len(st['reqs']) - n == 1 and '(anticipé)' not in d and 'relancée' not in d, d)

        # 6. JSON imposé refusé par Google → réessai sans schéma, retenu.
        await page.evaluate('wilson.eco.sent = []')
        await open_conv(); n = len(st['reqs']); k = len(await page.evaluate('window.__spoken'))
        st['schema_reject'] = True
        st['replies'] = [{'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Sans schéma.', 'entendu': 'Test'}]
        await page.evaluate('window.__voice()')
        await page.wait_for_function(f'window.__spoken.length > {k}', timeout=8000)
        reqs = st['reqs'][n:]
        check('Schéma refusé → réessai sans schéma (même modèle), retenu', [('responseSchema' in r['body']['generationConfig']) for r in reqs] == [True, False]
              and await page.evaluate('wilson.eco.noSchema && JSON.parse(localStorage.getItem("wilson.eco")).noSchema === true'), str([r['model'] for r in reqs]))
        st['schema_reject'] = False

        # 7. Réglage retenu par une ancienne version (réflexion par défaut = lente) → on repart de « minimal ».
        await page.evaluate("""sessionStorage.setItem('keep', '1'); localStorage.setItem('wilson.eco', JSON.stringify({speed:'rapide', model:'gemini-3.5-flash-lite', thinking:null, noSearch:false}))""")
        await boot()
        th = await page.evaluate('wilson.eco.thinking')
        check('Ancien réglage « réflexion par défaut » oublié : retour à « minimal »', th == 'minimal', str(th))

        # 8. Fonctions pures : ordre des réglages de réflexion.
        order = await page.evaluate("(() => { const e = wilson.eco; e.thinking = 'minimal'; const a = e._thinkOrder(); e.thinking = 'low'; const b = e._thinkOrder(); e.thinking = 'minimal'; return [a, b]; })()")
        check('Ordre de réflexion : minimal → low → défaut en dernier', order[0] == ['minimal', 'low', None] and order[1] == ['low', 'minimal', None], str(order))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
