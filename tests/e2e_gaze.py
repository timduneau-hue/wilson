"""Écoute au regard : on parle en regardant Wilson → il répond ; on parle sans le regarder → il ignore."""
import asyncio, json, re, sys
from playwright.async_api import async_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
res = []
def check(n, ok, d=''): res.append(bool(ok)); print(('✅' if ok else '❌'), n, d, flush=True)
FAKE_TTS = """(() => { const spoken = []; window.__spoken = spoken;
  const fake = { speaking: false, pending: false, getVoices() { return []; },
    speak(u) { if (!(u.text || '').trim()) { setTimeout(() => u.onend && u.onend({}), 5); return; } spoken.push(u.text); this.speaking = true; setTimeout(() => { this.speaking = false; u.onend && u.onend({}); }, 300 + u.text.length * 10); },
    cancel() { this.speaking = false; }, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); })();"""
VOICE = """window.__voice = () => { const a = new Int16Array(16000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.12) * 8000;
  wilson.audio.speaking = true; wilson.audio._offCnt = 0; wilson.audio.lastVoicedAt = performance.now(); let pushed = false;
  const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now(); wilson.audio.speaking = true; wilson.audio._offCnt = 0;
    const c = wilson.ecoState && wilson.ecoState.cap; if (c && !pushed) { pushed = true; c.chunks.push(a); c.len += a.length; c.voiced = (c.voiced || 0) + 30; } }, 20);
  setTimeout(() => clearInterval(iv), 600); }"""

async def run(video, expect_reply):
    st = {'reqs': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/bursts.wav', f'--use-file-for-fake-video-capture={S}/fixtures/{video}.y4m', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'])
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'eco', v:3}));")
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        async def gen(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            if 'models?' in req.url: await route.fulfill(status=200, headers=H, content_type='application/json', body='{"models":[]}'); return
            st['reqs'].append(json.loads(req.post_data))
            text = json.dumps({'pour_moi': True, 'emotion': 'joie', 'reponse': 'Oui, je te vois !', 'fin': False, 'entendu': 'Tu me vois ?'}, ensure_ascii=False)
            await route.fulfill(status=200, content_type='text/event-stream', headers=H, body='data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': text}]}}]}) + '\n\n')
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/.*'), gen)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille" && wilson.vision && wilson.vision.gazeReady', timeout=120000)
        if expect_reply:
            try: await page.wait_for_function('wilson.vision.looking', timeout=15000)
            except Exception: pass
        else: await page.wait_for_timeout(5000)
        info = await page.evaluate("({looking: wilson.vision.looking, gaze: wilson.vision.gaze && Math.round(wilson.vision.gaze.gazeYaw)})")
        if expect_reply:
            check(f'[{video}] Il voit qu\'on le regarde', info['looking'], str(info))
        else:
            check(f'[{video}] Visage tourné : il ne se croit pas regardé', not info['looking'], str(info))
        # Des phrases sont prononcées toutes les 5 s (fichier audio du faux micro).
        await page.wait_for_timeout(16000)
        sp = await page.evaluate('window.__spoken')
        if expect_reply:
            check(f'[{video}] On lui parle en le regardant → il répond (sans dire « Wilson »)', len(st['reqs']) >= 1 and 'Oui, je te vois !' in sp, f"{len(st['reqs'])} requête(s), {sp[:3]}")
            check(f'[{video}] Pas d\'oreille locale : aucun modèle « Vosk » téléchargé', not any('fr.part' in l for l in logs))
            txt = st['reqs'][0]['contents'][-1]['parts'][-1].get('text', '') if st['reqs'] else ''
            check(f'[{video}] Gemini sait qu\'on le regardait (il répond au lieu de douter)', 'te regardait' in txt, txt[:120])
            dl = [l for l in logs if 'Délais' in l]
            check(f'[{video}] Délais détaillés dans le journal', bool(dl), (dl[-1] if dl else '')[:160])
            vl = [l for l in logs if 'Vision (en arrière-plan)' in l]
            check(f'[{video}] Vision en arrière-plan annoncée', bool(vl), (vl[-1] if vl else '')[:120])
        else:
            check(f'[{video}] On parle sans le regarder → rien n\'est envoyé, il reste muet', len(st['reqs']) == 0 and sp == [], f"{len(st['reqs'])} requête(s)")
        errs = [l for l in logs if 'PAGEERROR' in l]
        check(f'[{video}] Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        print('   ', ' | '.join(l[9:] for l in logs if '[Wilson]' in l)[-1500:])
        await b.close()

async def main():
    which = sys.argv[1:] or ['pos', 'neg_turned']
    for w in which: await run(w, w.startswith('pos'))
    print(f"\n{sum(res)}/{len(res)} vérifications OK")
asyncio.run(main())
