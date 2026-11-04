"""Journal du 04/11/26, 11h29-11h52 (téléphone en voiture, 1.26.2) :
- 11h45:53 : crm_noter (tâche Karine Viola) annulé par Google pendant qu'il parlait → rien préparé ; 11h48:37 : « J'enregistre la
  tâche maintenant. C'est bon » alors que le verrou avait refusé → faux enregistrement ;
- 11h31 et 11h47 : « Wilson » tout seul → rien, rendormi 8 s après ; 11h49:54 : réveillé avec sa demande, muet, pas de relance ;
- 11h50:59, 11h51:37 : muet après l'outil « remarque » (Gemini 3.1) jusqu'à ce qu'on le rappelle ;
- 11h50 : « tu te mets en veille alors que je suis en train de parler » ; 11h32 : grésillements ;
- demande de Timothée : un journal plus complet.
"""
import asyncio, re, json, os, base64
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

STUB = """(() => {
  window.__bt = true;
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt ? [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }] : []),
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
TAB_UA = 'Mozilla/5.0 (Linux; Android 10; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def run(p, ua, bt, model, conns):
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=ua)
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'%s', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, v:4}));" % model)
    await ctx.add_init_script(STUB.replace('window.__bt = true', 'window.__bt = ' + ('true' if bt else 'false')))
    await ctx.add_init_script(GAZE)
    page = await ctx.new_page(); logs = []
    async def script(route):
        if 'crm_client' in (route.request.post_data or ''): await asyncio.sleep(1.5)     # CRM lent : Google annule avant la réponse
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                            body=json.dumps({'ok': True, 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}))
    await page.route(re.compile(r'https://script\.google\.com/.*'), script)
    await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
    page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    def handler(ws):
        conn = {'ws': ws, 'texts': [], 'setup': None, 'tools': []}; conns.append(conn)
        def on_msg(m):
            d = json.loads(m)
            if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
            elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
        ws.on_message(on_msg)
    await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
    await page.goto('http://127.0.0.1:8765/index.html')
    await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
    await page.wait_for_timeout(500)
    return b, page, logs


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def reponse(conn, texte, entendu=None, sec=0.8):
    if entendu: send(conn, inputTranscription={'text': entendu})
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, turnComplete=True)


async def main():
    async with async_playwright() as p:
        conns = []
        b, page, logs = await run(p, PHONE_UA, True, 'gemini-3.1-flash-live-preview', conns)
        has = lambda t: any(t in l for l in logs)
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        check('Journal : consignes de l\'appli à Gemini écrites (« Consigne à Gemini »)', has('Consigne à Gemini'))
        # --- son du téléphone : tampon « lecture », caméra et visage allégés en voiture ---
        await page.wait_for_timeout(300)
        a = await page.evaluate("({ m: wilson.audio.mobile, fps: wilson.vision ? wilson.vision.fps : -1, div: wilson.face.fpsDiv })")
        check('Téléphone : sortie son en tampon « lecture » (grésillements)', a['m'] is True, str(a))
        check('Voiture, en discussion : caméra à 2 analyses/s, visage à 30 images/s', a['fps'] in (2, -1) and a['div'] >= 2, str(a))

        # --- 1. outil du CRM annulé par Google : il va au bout, le résultat est donné en message ---
        n0 = len(conn['texts'])
        await page.evaluate("window.__parle(500)"); await page.wait_for_timeout(600)
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'k1', 'name': 'crm_client', 'args': {'client': 'Karine Viola'}}]}}))
        await page.wait_for_timeout(50)
        conn['ws'].send(json.dumps({'toolCallCancellation': {'ids': ['k1']}}))
        await page.wait_for_timeout(2500)
        t = conn['texts'][n0:]
        check('Outil du CRM annulé par Google : pas abandonné, noté au journal', has('annulé par Google (Timothée parlait encore) : je le finis'))
        check('… fini, son résultat est donné à Gemini en message (pas de réponse à un outil annulé)', any('[Résultat de crm_client' in x for x in t) and not any(r['id'] == 'k1' for r in conn['tools'])
              and has('fini malgré l\'annulation'), str(t)[:200])

        # --- 2. faux « c'est enregistré » ---
        await page.evaluate("wilson.crm.pending = null; wilson.crm.dernierEnregistre = null")
        n0 = len(conn['texts'])
        await page.evaluate("window.__parle(500)"); await page.wait_for_timeout(600)
        reponse(conn, "Pardon, tu as raison. J'enregistre la tâche maintenant. C'est bon, c'est enregistré dans le CRM.", 'Tu l\'as noté ?')
        await page.wait_for_timeout(400)
        t = conn['texts'][n0:]
        check('Wilson dit « c\'est enregistré » sans écriture confirmée : corrigé tout de suite', any('rien n\'est enregistré dans le CRM' in x for x in t) and has('alors que le CRM n\'a rien enregistré'), str(t)[:160])
        await page.wait_for_function('!wilson.audio.playing', timeout=6000)
        await page.evaluate("wilson.crm.dernierEnregistre = { at: Date.now(), relu: 'Tâche' }")
        n0 = len(conn['texts'])
        await page.evaluate("window.__parle(500)"); await page.wait_for_timeout(600)
        reponse(conn, "C'est noté dans tes tâches pour aujourd'hui, c'est enregistré.", 'Oui vas-y.')
        await page.wait_for_timeout(400)
        check('… mais pas après un vrai enregistrement', not any('rien n\'est enregistré' in x for x in conn['texts'][n0:]))
        await page.wait_for_function('!wilson.audio.playing', timeout=6000)
        n0 = len(conn['texts'])
        reponse(conn, "Ce n'est pas encore enregistré, je te relis la phrase.", None)
        await page.wait_for_timeout(300)
        check('… ni quand il dit que ce n\'est PAS enregistré', not any('rien n\'est enregistré' in x for x in conn['texts'][n0:]))
        await page.wait_for_function('!wilson.audio.playing', timeout=6000)

        # --- 3. muet après un outil : relance au bout de 5 s ---
        await page.evaluate("window.__parle(500)"); await page.wait_for_timeout(600)
        n0 = len(conn['texts'])
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'r1', 'name': 'date_et_heure', 'args': {}}]}}))
        send(conn, inputTranscription={'text': 'Il est quelle heure ?'}); send(conn, turnComplete=True)
        await page.wait_for_timeout(6000)
        t = conn['texts'][n0:]
        check('Journal : résultat de l\'outil rendu à Gemini (« Outil date_et_heure → Gemini »)', has('Outil date_et_heure → Gemini'))
        check('Muet 5 s après le résultat d\'un outil : relance une fois', sum('réponds-lui maintenant' in x for x in t) == 1 and has('Wilson muet 5 s après le résultat de date_et_heure'), str(t)[:160])
        await page.wait_for_timeout(5500)
        check('… une seule fois', sum('réponds-lui maintenant' in x for x in conn['texts'][n0:]) == 1)
        # outil qui dit « ne dis rien » : pas de relance
        n0 = len(conn['texts'])
        await page.evaluate("wilson.brain.respond([{ id: 'z', name: 'crm_confirmer', response: { result: 'DÉJÀ ENREGISTRÉ… ne redis rien' } }])")
        await page.wait_for_timeout(6000)
        check('… pas de relance après un résultat « ne redis rien »', not any('réponds-lui maintenant' in x for x in conn['texts'][n0:]))

        # --- 4. « Wilson » tout seul en voiture : « Oui ? », 20 s d'écoute ---
        n0 = len(conn['texts'])
        await page.evaluate("wilson._heardAt = 0; wilson._ecouteSeule()")
        await page.wait_for_timeout(9500)
        check('« Wilson » tout seul en voiture : il répond « Oui ? »', any('dis seulement « Oui ? »' in x for x in conn['texts'][n0:]) and has('je réponds « Oui ? »'))
        check('… et il est toujours là après 9 s (avant : rendormi au bout de 8 s)', await page.evaluate("wilson.state") == 'conversation')

        # --- 5. en voiture, ce qu'il dit garde la discussion ouverte ; veille annoncée par un son ---
        await page.evaluate("window.__tones = []; const t0 = wilson.audio.tone.bind(wilson.audio); wilson.audio.tone = (k) => { window.__tones.push(k); t0(k); }")
        await page.evaluate("const o = performance.now() - 50000; wilson.playEndAt = wilson._convAt = wilson._prenomAt = wilson._resumedAt = o; wilson._heardAt = performance.now() - 5000; wilson.lastActivity = performance.now()")
        await page.wait_for_timeout(800)
        check('Voiture : il parle encore (Wilson muet depuis 50 s) → pas de veille', await page.evaluate("wilson.state") == 'conversation')
        await page.evaluate("const o = performance.now() - 61000; wilson.playEndAt = wilson._convAt = wilson._prenomAt = wilson._resumedAt = wilson._heardAt = o")
        await page.wait_for_function('wilson.state === "veille"', timeout=3000)
        check('… 60 s de calme : veille, avec un petit son et le contexte au journal', 'dodo' in await page.evaluate('window.__tones') and has('dernière parole de Wilson il y a'))

        # --- 6. réveil par le prénom avec sa demande, Gemini muet : relance en voiture ---
        await page.evaluate("wilson._wakeText = '[On vient de te parler de loin : « est-ce que tu m\\'écoutes ? »]'; wilson._wakeDemande = 'est-ce que tu m\\'écoutes ?'; wilson.startConversation('prenom')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]; await page.wait_for_timeout(300)
        n0 = len(conn['texts'])
        send(conn, turnComplete=True); await page.wait_for_timeout(400)
        check('Réveillé par « Wilson, est-ce que tu m\'écoutes ? », Gemini muet : relance (voiture, sans regard)', any('réponds maintenant, à voix haute' in x for x in conn['texts'][n0:]) and has('demande dite en le regardant : relance') or any('réponds maintenant' in x for x in conn['texts'][n0:]), str(conn['texts'][n0:])[:160])

        # --- 7. recherche dans le CRM en arrière-plan (question de 12h19) ---
        conn = conns[-1]; n0 = len(conn['texts']); k = len(conn['tools'])
        await page.route(re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*'), lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json',
            body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps({'action': 'repondre', 'reponse': 'SN Samarch a commandé 1 715 € de serrures à larder.'})}]}}]}))))
        await page.evaluate("window.__parle(500)"); await page.wait_for_timeout(600)
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'q1', 'name': 'crm_question', 'args': {'question': 'Quelles serrures a commandé SN Samarch ?'}}]}}))
        await page.wait_for_timeout(400)
        r = [x for x in conn['tools'][k:] if x['id'] == 'q1']
        check('Question au CRM (3.1) : résultat d\'outil immédiat « je cherche, je te tiens au courant » (Wilson reste libre)', r and 'arrière-plan' in r[0]['response']['result'] and has('Analyste en arrière-plan'), str(r)[:120])
        await page.wait_for_function("window.wilson && !(wilson._analyses && wilson._analyses.size)", timeout=15000); await page.wait_for_timeout(500)
        t = conn['texts'][n0:]
        check('… la réponse arrive ensuite en message (« J\'ai la réponse à ta question »)', any('La recherche dans le CRM que tu avais lancée' in x for x in t), str(t)[-1:][:160] if t else '')
        # point d'avancement : dit seulement si personne ne parle, au plus toutes les 12 s
        n0 = len(conn['texts'])
        pt = await page.evaluate("""(() => { const ctl = new AbortController(); const A = { id: 'q2', question: 'Devis à relancer', ctl, fond: true, cancelled: true, dernierPoint: performance.now() - 20000, t0: performance.now(), conv: wilson.convId };
          wilson._analyses = wilson._analyses || new Map(); wilson._analyses.set('q2', A); wilson.audio.lastVoicedAt = performance.now() - 5000; wilson.audio.speaking = false;
          wilson._pointAnalyse(ctl.signal, 2, 'je regarde les devis de cette année'); wilson._pointAnalyse(ctl.signal, 3, 'je compare avec l\\'an dernier');
          wilson._analyses.delete('q2'); return true; })()""")
        t = conn['texts'][n0:]
        check('… point d\'avancement dit en quelques mots, une fois (pas deux en moins de 12 s)', sum('Point d\'avancement' in x for x in t) == 1 and has('moins de 12 s'), str(t)[:160])

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
