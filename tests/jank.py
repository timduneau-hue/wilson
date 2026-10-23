"""Fluidité du fil principal (animation) pendant l'analyse du regard : intervalles entre images (requestAnimationFrame).
Usage : python3 jank.py [port_ancienne_version]  — compare avec une autre version servie sur ce port si on le donne."""
import asyncio, json, sys
from playwright.async_api import async_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
async def run(port, label):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-video-capture={S}/fixtures/pos.y4m', f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', listenMode:'regard', v:3}));")
        pg = await ctx.new_page()
        await pg.route('**/generativelanguage.googleapis.com/**', lambda r: r.abort())
        await pg.goto(f'http://127.0.0.1:{port}/index.html')
        await pg.wait_for_function('window.wilson && wilson.vision && wilson.vision.gazeReady', timeout=120000)
        try: await pg.wait_for_function('!wilson.vision.worker || (wilson.vision.tuned && wilson.vision.tuned.lm)', timeout=60000)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        r = await pg.evaluate("""() => new Promise((res) => { const gaps = []; let last = performance.now(); const t0 = last;
            const f = (t) => { gaps.push(t - last); last = t; if (t - t0 < 8000) requestAnimationFrame(f); else {
              gaps.sort((a, b) => a - b); const n = gaps.length;
              res({ frames: n, fps: +(n / 8).toFixed(1), p95: +gaps[Math.floor(n * 0.95)].toFixed(1), max: +gaps[n - 1].toFixed(1), over50: gaps.filter((g) => g > 50).length,
                    looking: wilson.vision.looking, analyses: wilson.vision.stats.n, ms: Math.round(wilson.vision.stats.ms) }); } };
            requestAnimationFrame(f); })""")
        print(label.ljust(22), json.dumps(r), flush=True)
        await b.close()
async def main():
    if len(sys.argv) > 1: await run(int(sys.argv[1]), 'ancienne version')
    await run(8765, 'version actuelle')
asyncio.run(main())
