"""Mode voiture (PLAN 2 quater, C5–C7) sur un « téléphone » (Android simulé) : bouton voiture, caméra coupée, journée du CRM
préparée, oreille apprise sur des voix de synthèse (python3 make_voix.py), réveil quand le micro dit « Wilson, qui je vois demain ? »
mais pas pour « Il fait beau », réponse retenue tant que Gemini n'a pas confirmé le nom (C6), mode voiture tout seul en roulant (GPS)."""
import asyncio, re, json, base64, os
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
CLE = json.dumps(['Jean Gaudin', 'Menuiserie Gaudin'], ensure_ascii=False)
UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
LOAD_WAV = """async (noms) => {
  const lire = async (n) => { const b = await (await fetch('tests/fixtures/voix/' + n + '.wav')).arrayBuffer(); const v = new DataView(b); let o = 12;
    while (o < b.byteLength) { const id = String.fromCharCode(v.getUint8(o), v.getUint8(o+1), v.getUint8(o+2), v.getUint8(o+3)), n2 = v.getUint32(o + 4, true);
      if (id === 'data') return new Int16Array(b.slice(o + 8, o + 8 + n2)); o += 8 + n2; } };
  const t = []; for (const n of noms) t.push(await lire(n));
  return wilson.oreille.apprendre(t.slice(0, 5), [t[5]]);
}"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    if not os.path.exists(os.path.join(S, 'fixtures', 'voix', 'voiture_micro.wav')):
        print('Lance d\'abord : python3 make_voix.py'); return
    conns, sc = [], {'calls': []}
    mock = {'user': 'Wilson, qui je vois demain ?'}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/voix/voiture_micro.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if a.startswith('crm_'): sc['calls'].append(d)
            body = {'ok': True, 'reglages': None, 't': 0}
            if a == 'crm_journee': body = {'ok': True, 'rdv': [{'cle': CLE, 'contact': 'Jean Gaudin', 'societe': 'Menuiserie Gaudin', 'heure': '14h00'}], 'texte': "Aujourd'hui : 1 rendez-vous.\n- 14h00 : Jean Gaudin, Menuiserie Gaudin"}
            elif a == 'crm_client': body = {'ok': True, 'cle': CLE, 'societe': 'Menuiserie Gaudin', 'contact': 'Jean Gaudin', 'ville': 'Cholet', 'texte': 'Client : Menuiserie Gaudin, Cholet', 'contacts': [{'nom': 'Jean Gaudin', 'tel': '0611223344'}]}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        def handler(ws):
            conn = {'ws': ws, 'audio_in': 0, 'texts': [], 'answered': False}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}})); return
                ri = d.get('realtimeInput') or {}
                if 'text' in ri: conn['texts'].append(ri['text'])
                if 'audio' in ri:
                    conn['audio_in'] += 1
                    if conn['audio_in'] == 3 and not conn['answered']:
                        conn['answered'] = True
                        asyncio.ensure_future(answer(conn))
            ws.on_message(on_msg)

        async def answer(conn):
            ws = conn['ws']
            # La réponse arrive AVANT la transcription : elle doit être retenue (C6).
            for c in audio_chunks(0.6):
                ws.send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
            await asyncio.sleep(0.6)
            conn['held'] = await page.evaluate("({ playing: wilson.audio.playing, gate: !!(wilson._gate && wilson._gate.buf.length) })")
            ws.send(json.dumps({'serverContent': {'inputTranscription': {'text': mock['user']}}}))
            await asyncio.sleep(0.4)
            try: conn['after'] = await page.evaluate("({ playing: wilson.audio.playing, played: wilson.audio.playedSec, state: wilson.state })")
            except Exception as e: conn['after'] = {'err': str(e)[:200]}
            ws.send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Demain tu vois Jean Gaudin à 14h00.'}, 'turnComplete': True}}))

        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, user_agent=UA, is_mobile=True, has_touch=True,
                                  permissions=['microphone', 'camera', 'geolocation'], geolocation={'latitude': 47.06, 'longitude': -0.88}, service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'logUrl': URL, 'crm': True, 'voitureAuto': True, 'v': 3}))
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille" && wilson.started', timeout=20000)
        check('Téléphone : bouton « Mode voiture » visible', await page.evaluate("!document.getElementById('car-btn').hidden"))

        r = await page.evaluate(LOAD_WAV, ['nom_0', 'nom_1', 'nom_2', 'nom_3', 'nom_4', 'calib_sans_nom'])
        check('Oreille apprise (5 « Wilson » + 1 phrase sans le nom)', r['ok'] and r['n'] == 5, json.dumps(r)[:200])

        # Bouton voiture
        await page.click('#car-btn')
        st = await page.evaluate("({ car: !!wilson.car, cls: document.body.classList.contains('car'), vision: !!wilson.vision, hint: document.getElementById('car-hint').textContent, ov: !document.getElementById('car').hidden })")
        check('Mode voiture : écran voiture, caméra coupée, « Dis Wilson »', st['car'] and st['cls'] and st['ov'] and not st['vision'] and 'Wilson' in st['hint'], str(st))
        await page.wait_for_timeout(1500)
        acts = [c['action'] for c in sc['calls']]
        check('Journée préparée : agenda du jour puis fiche du RDV', acts[:2] == ['crm_journee', 'crm_client'], str(acts))
        await page.screenshot(path=os.path.join(S, 'shots', 'voiture.png'))

        # Le micro dit « Il fait beau » (rien) puis « Wilson, qui je vois demain ? » (réveil). Le fichier tourne en boucle (~19 s).
        try:
            await page.wait_for_function('wilson.state === "conversation"', timeout=45000)
            woke = True
        except Exception: woke = False
        lines = [l for l in logs if 'Oreille :' in l or 'Entendu « Wilson »' in l]
        check('Réveil par l\'oreille sur « Wilson, qui je vois demain ? »', woke and any('Entendu « Wilson » (oreille' in l for l in logs), '\n'.join(lines[-6:]))
        check('… « Il fait beau aujourd\'hui » n\'a réveillé personne', any(re.search(r'Oreille : phrase de .* écart [\d.]+ \(limite [\d.]+\)( → presque)?$', l) for l in logs), '\n'.join(lines[-6:]))
        await page.wait_for_function('wilson.audio.playedSec > 0.3', timeout=15000)
        conn = conns[-1]
        for _ in range(30):
            if 'after' in conn: break
            await asyncio.sleep(0.1)
        check('Début de la phrase envoyé à Gemini (tampon du micro)', conn['audio_in'] >= 3)
        check('Réponse retenue tant que le nom n\'est pas confirmé par la transcription (C6)', conn.get('held', {}).get('gate') and not conn['held']['playing'], str(conn.get('held')))
        check('… puis jouée dès que « Wilson » est transcrit', conn.get('after', {}).get('played', 0) > 0 or conn.get('after', {}).get('playing'), str(conn.get('after')))
        sysp = conn['setup']['systemInstruction']['parts'][0]['text']
        check('Consigne voiture : il conduit, réponses très courtes', 'vous êtes dans sa voiture' in sysp and 'conduit' in sysp and 'très courtes' in sysp)
        check('En voiture, la discussion continue sans le nom ni le regard', await page.evaluate("wilson._addressed()"))

        # Réveil par erreur (radio) : la transcription n'a pas le nom → silence et retour en veille
        await asyncio.sleep(0.5)                       # fin du tour de la 1re discussion
        await page.evaluate("wilson.endConversation('test')")
        mock['user'] = "Il fait beau sur toute la région."
        n0 = len(conns); played0 = await page.evaluate('wilson.audio.playedSec')
        await page.evaluate("wilson._onName({ score: 1, limite: 2 })")
        await page.wait_for_function('wilson.state === "conversation"', timeout=10000)
        try: await page.wait_for_function("wilson.state === 'veille'", timeout=15000)
        except Exception: print('\n'.join(logs[-25:]))
        played1 = await page.evaluate('wilson.audio.playedSec')
        check('Faux réveil (pas « Wilson » dans la transcription) : rien n\'est dit, il se rendort', played1 == played0 and any('Pas mon nom dans' in l for l in logs), f'{played0} → {played1}')

        # Quitter
        await page.click('#car-exit')
        st = await page.evaluate("({ car: !!wilson.car, cls: document.body.classList.contains('car') })")
        check('Quitter le mode voiture', not st['car'] and not st['cls'])

        # En roulant : mode voiture tout seul (GPS)
        lat = 47.06
        for _ in range(5):
            lat += 0.0004; await ctx.set_geolocation({'latitude': lat, 'longitude': -0.88}); await page.wait_for_timeout(1100)
            if await page.evaluate('!!wilson.car'): break
        st = await page.evaluate("({ car: wilson.car, speed: wilson.speed })")
        check('En roulant (GPS) : mode voiture tout seul', st['car'] and st['car']['why'] == 'en roulant', str(st))
        bil = await page.evaluate('wilson.bilan()')
        check('Bilan du journal : mode voiture, vitesse, oreille, CRM', 'en roulant' in bil['Mode voiture'] and 'km/h' in bil['Mode voiture'] and 'apprise' in bil['Oreille (voiture)'] and 'relié' in bil['CRM'], json.dumps({k: bil[k] for k in ('Mode voiture', 'Oreille (voiture)', 'CRM')}, ensure_ascii=False))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
