import os
import asyncio, re, json
from playwright.async_api import async_playwright
res=[]
def check(n, ok, d=''): res.append(bool(ok)); print(('✅' if ok else '❌'), n, d, flush=True)
S = os.path.dirname(os.path.abspath(__file__))
VJ = os.path.join(S, '..', 'version.json')   # modifié pendant le test puis remis à l'identique
ORIG=open(VJ).read()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav','--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, permissions=['microphone','camera'])
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345'}));")
        pg = await ctx.new_page(); loads = []; pg.on('load', lambda: loads.append(1)); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        await pg.goto('http://127.0.0.1:8765/index.html'); await pg.wait_for_function('window.wilson && wilson.state==="veille"', timeout=20000)
        await pg.wait_for_timeout(1500)
        await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(1000)
        check('Même version : pas de rechargement', len(loads) == 1, f'{len(loads)} chargement(s)')
        open(VJ,'w').write('{"version": "9.9.9"}\n')
        try:
            await pg.evaluate("wilson.state = 'conversation'"); await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(2000)
            check('Nouvelle version pendant une conversation : il attend', len(loads) == 1)
            await pg.evaluate("wilson.state = 'veille'")
            await pg.wait_for_timeout(16500)
            check('… puis se recharge dès qu\'il est en veille', len(loads) == 2, f'{len(loads)} chargements')
            await pg.wait_for_function('window.wilson && wilson.state==="veille"', timeout=20000)
            await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(1500)
            check('Pas de boucle de rechargement si la version tarde', len(loads) == 2, f'{len(loads)} chargements')
        finally:
            open(VJ,'w').write(ORIG)
        check('Aucune erreur JavaScript', not errs, str(errs)[:200])
        await b.close()
    print(f'{sum(res)}/{len(res)} OK')
asyncio.run(main())
