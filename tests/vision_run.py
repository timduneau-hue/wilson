import os
import asyncio, json, sys
from playwright.async_api import async_playwright
async def run(name):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-video-capture={os.path.dirname(os.path.abspath(__file__))}/fixtures/{name}.y4m'])
        ctx = await b.new_context(permissions=['camera']); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:300]) if m.type in ('warning','error') else None)
        await pg.goto('http://127.0.0.1:8765/tests/vision.html'); await pg.wait_for_function('document.title === "done"', timeout=120000)
        out = await pg.evaluate('window.__out'); print(name.ljust(11), json.dumps(out, ensure_ascii=False), errs[:4], flush=True)
        await b.close()
async def main():
    for n in sys.argv[1:]: await run(n)
asyncio.run(main())
