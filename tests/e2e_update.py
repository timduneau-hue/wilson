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
        ctx = await b.new_context(bypass_csp=True, viewport={'width':1280,'height':800}, permissions=['microphone','camera'])
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345'}));")
        pg = await ctx.new_page(); loads = []; pg.on('load', lambda: loads.append(1)); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        await pg.goto('http://127.0.0.1:8765/index.html'); await pg.wait_for_function('window.wilson && wilson.state==="veille"', timeout=20000)
        await pg.wait_for_timeout(1500)
        await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(1000)
        check('Même version : pas de rechargement', len(loads) == 1, f'{len(loads)} chargement(s)')
        open(VJ,'w').write('{"version": "9.9.9"}\n')
        try:
            # Décision de Timothée du 16/11/26 : tout de suite, avec une tête de mise à jour, sans couper sa phrase ni un outil.
            await pg.evaluate("wilson.state = 'conversation'; wilson._outilsEnCours = 1"); await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(2500)
            check('Nouvelle version pendant un outil en cours : il finit d\'abord', len(loads) == 1, f'{len(loads)} chargements')
            await pg.evaluate("wilson._outilsEnCours = 0"); await pg.wait_for_timeout(2200)
            tete = await pg.evaluate("!!document.getElementById('tete-maj') && document.getElementById('tete-maj').textContent")
            check('… puis tête de mise à jour « pas disponible », même en pleine discussion', tete and 'Je me mets à jour' in tete and 'Pas disponible' in tete, str(tete))
            await pg.wait_for_timeout(5000)
            check('… et se recharge tout de suite (sans attendre la veille ni la nuit)', len(loads) == 2, f'{len(loads)} chargements')
            await pg.wait_for_function('window.wilson && wilson.state==="veille"', timeout=20000)
            await pg.evaluate('wilson._checkUpdate()'); await pg.wait_for_timeout(1500)
            check('Pas de boucle de rechargement si la version tarde', len(loads) == 2, f'{len(loads)} chargements')
            await pg.evaluate("sessionStorage.clear(); wilson.phone = true; wilson._reloadWhenIdle('9.9.9')"); await pg.wait_for_timeout(4000)
            check('Jamais pendant un appel téléphonique', len(loads) == 2 and not await pg.evaluate("!!document.getElementById('tete-maj')"), f'{len(loads)} chargements')
            await pg.evaluate("wilson.phone = false"); await pg.wait_for_timeout(8500)
            check('… mise à jour dès la fin de l\'appel', len(loads) == 3, f'{len(loads)} chargements')
            await pg.wait_for_function('window.wilson && wilson.state==="veille"', timeout=20000)
            src = await pg.evaluate("fetch('./js/app.js').then((r) => r.text()).then((t) => Promise.all([t, ...[...t.matchAll(/from '\\.\\/(app\\/[^']+)'/g)].map((m) => fetch('./js/' + m[1]).then((r) => r.text()))])).then((l) => l.join('\\n'))")
            check('Vérifie toutes les 5 minutes, à toute heure (plus seulement la nuit)', 'const MAJ_VERIF_MS = 5 * 60000' in src and 'setInterval(() => this._checkUpdate(), MAJ_VERIF_MS)' in src and 'MAJ_HEURE' not in src)
        finally:
            open(VJ,'w').write(ORIG)
        check('Aucune erreur JavaScript', not errs, str(errs)[:200])
        await b.close()
    print(f'{sum(res)}/{len(res)} OK')
asyncio.run(main())
