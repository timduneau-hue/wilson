"""Vision qui se répare toute seule (24/10/26 : sur la tablette, plus aucun regard détecté, Wilson restait figé).
Repères du regard en échec → repris sur le processeur ; analyse bloquée → relancée. Modèles réels, fausse caméra « pos »."""
import asyncio, re, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', f'--use-file-for-fake-video-capture={S}/fixtures/pos.y4m', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'])
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'eco', v:3}));")
        page = await ctx.new_page(); logs = []
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/.*'), lambda r: asyncio.ensure_future(r.fulfill(status=200, headers={'access-control-allow-origin': '*'}, body='{}')))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.vision && wilson.vision.gazeReady', timeout=120000)
        await page.wait_for_function('wilson.vision.looking', timeout=30000)
        check('Départ : il voit qu\'on le regarde', True)

        # 1. Repères du regard en échec à répétition (comme la carte graphique qui lâche) → repris sur le processeur.
        await page.evaluate("wilson.vision.worker.postMessage({ type: 'debug', failLm: 60 })")
        await page.wait_for_function("wilson.vision.fixes.length >= 1", timeout=40000)
        fx = await page.evaluate('wilson.vision.fixes[0]')
        check('Repères en échec → réparés (repris sur le processeur), noté dans le journal', 'repris sur le processeur' in fx and any('repris sur le processeur' in l for l in logs), fx)
        await page.wait_for_function('wilson.vision.looking', timeout=40000)
        check('… et il voit de nouveau qu\'on le regarde', True)

        # 2. Analyse complètement bloquée → relancée au bout de ~8 s, le regard revient.
        await page.evaluate("wilson.vision.worker.postMessage({ type: 'debug', stall: true })")
        await page.wait_for_function('wilson.vision.restarts >= 1', timeout=20000)
        check('Analyse bloquée → relancée automatiquement', any('analyse relancée' in l for l in logs))
        await page.wait_for_function('wilson.vision.gazeReady && wilson.vision.looking', timeout=120000)
        check('… regard de nouveau détecté après la relance', True)
        bil = await page.evaluate('wilson.bilan().Vision')
        check('Bilan : relances et réparations indiquées', 'relancée 1 fois' in bil and 'réparation' in bil, bil)

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
