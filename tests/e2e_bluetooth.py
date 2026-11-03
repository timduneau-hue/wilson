"""Son en voiture (Android Auto / Bluetooth) — journal du 02/11/26, 16h43, téléphone dans la voiture : 17 s de voix jouées,
« j'ai pas entendu la réponse ». Si Chrome prend le micro Bluetooth de la voiture, Android passe tout le son de la page sur
le canal « appel », que la voiture ne joue pas. Wilson doit écouter avec le micro du téléphone quand un micro Bluetooth est là.

Appareils simulés comme sur Chrome Android (« Speakerphone », « Headset earpiece », « Bluetooth headset ») :
1. Voiture déjà connectée au démarrage : micro du téléphone choisi (deviceId exact), journal « micro Bluetooth présent, évité ».
2. Premier démarrage sans les noms des micros (permission pas encore donnée) : Chrome a pris le Bluetooth → on recommence
   une fois avec le micro du téléphone.
3. Pas de voiture : micro par défaut, rien de changé (tablette).
4. La voiture se connecte pendant que Wilson tourne : micro rouvert sur celui du téléphone ; elle se déconnecte : défaut.
"""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

# window.__bt : voiture connectée ; window.__noms : noms des micros connus ; window.__defaut : micro que Chrome prend par défaut.
STUB = """(() => {
  window.__bt = %s; window.__noms = %s; window.__defaut = %s; window.__gum = [];
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  const devs = () => { const L = (l) => window.__noms ? l : ''; const d = [
      { deviceId: 'default', kind: 'audioinput', label: L('Default'), groupId: 'g' },
      { deviceId: 'id-speaker', kind: 'audioinput', label: L('Speakerphone'), groupId: 'g1' },
      { deviceId: 'id-earpiece', kind: 'audioinput', label: L('Headset earpiece'), groupId: 'g2' }];
    if (window.__bt) d.push({ deviceId: 'id-bt', kind: 'audioinput', label: L('Bluetooth headset'), groupId: 'g3' });
    d.push({ deviceId: 'cam', kind: 'videoinput', label: L('camera 1, facing front'), groupId: 'g4' });
    return d; };
  md.enumerateDevices = async () => devs().map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => {
    const st = await gum0(c && c.audio ? { audio: true, video: false } : c);
    if (c && c.audio) {
      const want = c.audio.deviceId && c.audio.deviceId.exact;
      const id = want || (window.__bt ? 'id-bt' : window.__defaut);
      const lab = { 'id-speaker': 'Speakerphone', 'id-earpiece': 'Headset earpiece', 'id-bt': 'Bluetooth headset', default: 'Default' }[id] || id;
      window.__gum.push(want || 'défaut');
      const t = st.getAudioTracks()[0];
      Object.defineProperty(t, 'label', { get: () => lab });
      const gs = t.getSettings.bind(t); t.getSettings = () => ({ ...gs(), deviceId: id });
      window.__noms = true;            // après le premier accès au micro, Chrome donne les noms
    }
    return st;
  };
})();"""


async def run(p, bt, noms, label):
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block')
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', v:4}));")
    await ctx.add_init_script(STUB % ('true' if bt else 'false', 'true' if noms else 'false', "'default'"))
    page = await ctx.new_page(); logs = []
    await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    await page.goto('http://127.0.0.1:8765/index.html')
    await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
    await page.wait_for_timeout(400)
    return b, page, logs


async def main():
    async with async_playwright() as p:
        # 1. Voiture déjà connectée, noms connus.
        b, page, logs = await run(p, True, True, 'voiture')
        g = await page.evaluate('window.__gum')
        m = [l for l in logs if 'Micro prêt' in l]
        check('Voiture connectée au démarrage : micro du téléphone choisi (pas le Bluetooth)', g[:1] == ['id-speaker'], str(g))
        check('… journal : « micro Bluetooth présent, évité »', m and 'Speakerphone' in m[-1] and 'évité' in m[-1], (m[-1] if m else '')[-160:])
        lab = await page.evaluate('wilson.audio.stream.getAudioTracks()[0].label')
        check('… le micro en service est celui du téléphone', lab == 'Speakerphone', lab)
        check('… bilan (onglet État) : le micro est indiqué', 'Speakerphone' in (await page.evaluate("wilson.bilan()['Son']")))
        errs = [l for l in logs if 'PAGEERROR' in l]
        await b.close()

        # 2. Premier démarrage : noms inconnus, Chrome prend le Bluetooth → on recommence avec le micro du téléphone.
        b, page, logs = await run(p, True, False, 'voiture sans noms')
        g = await page.evaluate('window.__gum')
        lab = await page.evaluate('wilson.audio.stream.getAudioTracks()[0].label')
        check('Premier démarrage (noms des micros inconnus) : Bluetooth pris, puis micro du téléphone', g == ['défaut', 'id-speaker'] and lab == 'Speakerphone', f'{g} → {lab}')
        errs += [l for l in logs if 'PAGEERROR' in l]
        await b.close()

        # 3. Pas de voiture (tablette, téléphone seul) : rien ne change.
        b, page, logs = await run(p, False, True, 'maison')
        g = await page.evaluate('window.__gum')
        m = [l for l in logs if 'Micro prêt' in l]
        check('Sans voiture : micro par défaut, comme avant', g == ['défaut'] and m and 'Bluetooth' not in m[-1], f"{g} {(m[-1] if m else '')[-100:]}")

        # 4. La voiture se connecte pendant que Wilson tourne, puis se déconnecte.
        await page.evaluate("window.__bt = true; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
        await page.wait_for_function("wilson.audio.stream && wilson.audio.stream.getAudioTracks()[0].label === 'Speakerphone'", timeout=5000)
        check('Voiture connectée en cours de route : micro rouvert sur celui du téléphone', True)
        check('… noté dans le journal', any('micro Bluetooth présent' in l for l in logs) and any('évité' in l for l in logs))
        # Le micro rouvert alimente toujours Wilson (le son du micro arrive au nœud de capture).
        n0 = await page.evaluate('wilson.audio.ringFilled'); await page.wait_for_timeout(500)
        await page.evaluate("wilson.audio.ringFilled = 0"); await page.wait_for_timeout(500)
        check('… et Wilson entend toujours (le micro rouvert alimente l\'écoute)', await page.evaluate('wilson.audio.ringFilled') > 0)
        await page.evaluate("window.__bt = false; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
        await page.wait_for_function("window.__gum[window.__gum.length - 1] === 'défaut'", timeout=5000)
        check('Voiture déconnectée : retour au micro par défaut', True, str(await page.evaluate('window.__gum')))
        errs += [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
