"""Son en voiture (Android Auto / Bluetooth) — journal du 02/11/26, 16h43, téléphone dans la voiture : 17 s de voix jouées,
« j'ai pas entendu la réponse ». Si Chrome prend le micro Bluetooth de la voiture, Android passe tout le son de la page sur
le canal « appel », que la voiture ne joue pas. Wilson doit écouter avec le micro du téléphone quand un micro Bluetooth est là.

Appareils simulés comme sur Chrome Android (« Speakerphone », « Headset earpiece », « Bluetooth headset ») :
1. Voiture déjà connectée au démarrage : micro du téléphone choisi (deviceId exact), journal « micro Bluetooth présent, évité ».
2. Premier démarrage sans les noms des micros (permission pas encore donnée) : Chrome a pris le Bluetooth → on recommence
   une fois avec le micro du téléphone.
3. Pas de voiture : micro par défaut, rien de changé (tablette).
4. La voiture se connecte pendant que Wilson tourne : micro rouvert sur celui du téléphone ; elle se déconnecte : défaut.
5. Accord de Timothée du 03/11/26 : téléphone relié à la voiture → pas besoin de le regarder (réponse sans regard, pas de
   veille au bout de 3 s, oreille « Wilson » active) ; voiture déconnectée → le regard redevient obligatoire ;
   tablette avec un micro Bluetooth → rien ne change (R1 entière).
"""
import asyncio, re, json, os, base64
import numpy as np
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


PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
TAB_UA = 'Mozilla/5.0 (Linux; Android 10; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def run(p, bt, noms, label, ua=None, conns=None):
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', **({'user_agent': ua} if ua else {}))
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', v:4}));")
    await ctx.add_init_script(STUB % ('true' if bt else 'false', 'true' if noms else 'false', "'default'"))
    if ua: await ctx.add_init_script(GAZE)
    page = await ctx.new_page(); logs = []
    await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    if conns is not None:
        def handler(ws):
            conn = {'ws': ws, 'texts': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
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
        await b.close()

        # 5. Téléphone relié à la voiture (accord du 03/11/26) : pas besoin de le regarder.
        conns = []
        b, page, logs = await run(p, True, True, 'téléphone voiture', PHONE_UA, conns)
        await page.wait_for_timeout(600)
        check('Téléphone + voiture : noté au journal (« je réponds sans qu\'on me regarde »)', await page.evaluate('wilson._voitureBt') and any('Voiture : téléphone relié en Bluetooth' in l for l in logs))
        # Oreille « Wilson » active en veille, sans regard.
        await page.evaluate("wilson.oreille.templates = [[1], [1], [1]]; wilson.oreille.seuil = 1; window.__fed = 0; wilson.oreille.feed = () => { window.__fed++; }")
        await page.wait_for_timeout(500)
        check('… en veille, l\'oreille guette « Wilson » (sans qu\'on le regarde)', await page.evaluate('window.__fed') > 5, str(await page.evaluate('window.__fed')))
        # Discussion ouverte d'un coup d'œil, puis il regarde la route : pas de veille, et la réponse est jouée.
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        await page.evaluate("window.__look = false"); await page.wait_for_timeout(4500)
        check('… il regarde la route plus de 3 s : pas de veille', await page.evaluate('wilson.state === "conversation" && !wilson.paused'))
        conn = conns[-1]
        await page.evaluate("window.__parle(800)"); await page.wait_for_timeout(900)
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Quelle est la différence entre le mode sport et éco ?'}}}))
        for c in audio_chunks(0.8):
            conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Le mode sport rend l\'accélérateur plus vif.'}, 'turnComplete': True}}))
        await page.wait_for_timeout(250)
        check('… question posée sans le regarder (journal du 02/11/26, 16h43) : la réponse est jouée', await page.evaluate('wilson.audio.playing') and not any('Réponse retenue' in l for l in logs))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        # Lecteur multimédia (04/11/26, journal 03/11/26 09h25 « tu m'entends pas ») : en route pendant la discussion.
        h = await page.evaluate("(() => { const e = document.getElementById('media-hold'); return { ok: !!e, paused: e ? e.paused : null, loop: e && e.loop, st: navigator.mediaSession ? navigator.mediaSession.playbackState : '?', titre: navigator.mediaSession && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : '' }; })()")
        check('Voiture : lecteur multimédia en route pendant la discussion (pour qu\'Android Auto ouvre le son)', h['ok'] and h['paused'] is False and h['loop'] and h['st'] == 'playing' and h['titre'] == 'Wilson', str(h))
        check('… noté au journal et dans l\'onglet État', any('lecteur multimédia en route' in l for l in logs) and 'lecteur multimédia en route' in await page.evaluate("wilson.bilan()['Son']"))
        # Plus personne ne lui parle : il se rendort au bout de 45 s (pas de discussion ouverte sans fin avec la radio).
        await page.evaluate("wilson.playEndAt = wilson._convAt = wilson._prenomAt = wilson._resumedAt = performance.now() - 46000; wilson.lastActivity = performance.now()")
        await page.wait_for_function('wilson.state === "veille"', timeout=3000)
        check('… 45 s sans lui parler : il se rendort, même avec la radio', True)
        await page.evaluate("wilson._holdUntil = performance.now() - 1")
        await page.wait_for_function("document.getElementById('media-hold').paused", timeout=3000)
        check('… rendormi : le lecteur s\'arrête (la musique de la voiture peut reprendre)', any('lecteur multimédia arrêté' in l for l in logs))
        # Bouton pause du volant pendant une discussion : il se tait.
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000); await page.wait_for_timeout(400)
        # Chrome de test n'appelle pas les boutons du volant : on appelle le gestionnaire que Wilson a donné.
        await page.evaluate("wilson.log('Bouton pause (volant ou écran de la voiture) : je me tais'); wilson.endConversation('volant')")
        check('… bouton pause du volant : fin de la discussion', await page.evaluate('wilson.state') == 'veille' and any('Fin de conversation (volant)' in l for l in logs))
        # Voiture déconnectée : le regard redevient obligatoire.
        await page.evaluate("window.__bt = false; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
        await page.wait_for_function('!wilson._voitureBt', timeout=5000); await page.wait_for_timeout(300)
        f0 = await page.evaluate('window.__fed'); await page.wait_for_timeout(500)
        check('Voiture déconnectée : retour à la règle du regard (verrou actif, oreille coupée)', await page.evaluate('wilson._verrouRegard') and await page.evaluate('window.__fed') == f0
              and any('plus de Bluetooth' in l for l in logs))
        errs += [l for l in logs if 'PAGEERROR' in l]
        await b.close()

        # 6. Tablette avec un micro Bluetooth : rien ne change (R1 entière).
        b, page, logs = await run(p, True, True, 'tablette bluetooth', TAB_UA, [])
        await page.wait_for_timeout(600)
        check('Tablette avec un micro Bluetooth : la règle du regard reste entière', not await page.evaluate('wilson._voitureBt') and await page.evaluate('wilson._verrouRegard')
              and not any('Voiture : téléphone relié' in l for l in logs))
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_timeout(800)
        check('… et pas de lecteur multimédia sur la tablette', not await page.evaluate("!!document.getElementById('media-hold')"))
        errs += [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
