"""Journal du 04/11/26, 10h00-10h50 (téléphone en voiture, Gemini 3.1 Flash Live) :
- la même réponse jouée 2 ou 3 fois à ~5 s d'écart (remarque de Timothée : « pas besoin de répéter deux fois la même phrase ») :
  Gemini 3.1 Flash Live n'a que des outils synchrones ; après l'outil du visage (exprimer_emotion), appelé presque à chaque
  phrase, il reprenait la parole et redisait sa réponse ; il disait aussi « response:exprimer_emotion », « try{ » ;
- crm_confirmer rappelé après l'enregistrement → « c'est enregistré » redit ;
- 32 s de silence pendant les recherches : il ne voit pas l'écran en voiture (remarque de 10h13) → petit son de réflexion ;
- briefings trop courts (remarque de 10h13:52).
Vérifie : pas d'outil du visage sur 3.1 (gardé sur 3.8), expression d'après le texte, réponse en double coupée (mais pas
quand on lui a reparlé), pas de relance après un outil sur 3.1, crm_confirmer de trop, texte parasite nettoyé, son de
réflexion en voiture (pas à la maison), consignes de briefing.
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
        # ---- 1. Téléphone en voiture, Gemini 3.1 Flash Live (comme le 04/11/26) ----
        conns = []
        b, page, logs = await run(p, PHONE_UA, True, 'gemini-3.1-flash-live-preview', conns)
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]; st = conn['setup']
        noms = [f['name'] for f in st['tools'][0]['functionDeclarations']]
        sys = st['systemInstruction']['parts'][0]['text']
        check('3.1 Flash Live : pas d\'outil du visage déclaré', 'exprimer_emotion' not in noms and 'memoriser' in noms, f'{len(noms)} outils')
        check('… ni « behavior » (outils synchrones seulement sur ce modèle)', not any('behavior' in f for f in st['tools'][0]['functionDeclarations']))
        check('… ni consigne « appelle exprimer_emotion » dans la consigne', 'exprimer_emotion' not in sys)
        check('… consignes : briefing complet, prévenir avant de chercher', 'BRIEFING COMPLET' in sys or 'briefing' in sys.lower())
        m38 = await page.evaluate("import('./js/brain.js').then((m) => { const s = m.buildSetup({ model: 'gemini-3.8-live', voice: 'Puck', system: \"Ton visage : appelle exprimer_emotion dès que…\\nSuite\", level: 0 }); return { n: s.tools[0].functionDeclarations.map((f) => f.name + ':' + (f.behavior || '')), sys: s.systemInstruction.parts[0].text, sync: m.asyncTools('gemini-3.1-flash-live-preview') }; })")
        check('Gemini 3.8 : l\'outil du visage reste (outils en arrière-plan)', 'exprimer_emotion:NON_BLOCKING' in m38['n'] and 'exprimer_emotion' in m38['sys'] and m38['sync'] is False, str(m38['n'][:2]))

        # Réponse, puis la même réponse sans que personne ait parlé (ce qui se passait après chaque outil).
        await page.evaluate("window.__parle(700)"); await page.wait_for_timeout(800)
        R = "C'est noté, je l'ai bien pris en compte pour ma prochaine mise à jour. Merci de me le dire !"
        reponse(conn, R, "Pas besoin de répéter deux fois la même phrase.")
        await page.wait_for_timeout(200)
        check('1re réponse jouée', await page.evaluate('wilson.audio.playing'))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        emo = await page.evaluate('wilson._emoTour')
        n0 = await page.evaluate('wilson.audio.playedSec')
        reponse(conn, R + 'response:exprimer_emotion C\'est noté', sec=2.0)
        await page.wait_for_timeout(500)
        n1 = await page.evaluate('wilson.audio.playedSec')
        check('Même réponse redite sans qu\'on lui parle : coupée', any('Réponse en double évitée' in l for l in logs) and any('Réponse en double coupée' in l for l in logs), f'{n1 - n0:.2f} s jouées en plus')
        check('… presque rien n\'est joué (2 s reçues)', n1 - n0 < 0.5 and not await page.evaluate('wilson.audio.playing'), f'{n1 - n0:.2f} s')
        check('… et pas de relance derrière', not any('relance' in l for l in logs))
        # On lui reparle (« redis-le ») : la même phrase est permise.
        await page.evaluate("window.__parle(700)"); await page.wait_for_timeout(800)
        k = len([l for l in logs if 'Réponse en double' in l])
        reponse(conn, R, "Tu peux répéter ?")
        await page.wait_for_timeout(200)
        check('On lui demande de répéter : la même phrase est jouée', await page.evaluate('wilson.audio.playing') and len([l for l in logs if 'Réponse en double' in l]) == k)
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        # Une réponse qui commence par la même phrase d'attente mais dit autre chose : jouée.
        await page.evaluate("window.__parle(600)"); await page.wait_for_timeout(700)
        reponse(conn, 'Je regarde dans le CRM… Pour SN Samarch, le chiffre est en baisse.', 'Et SN Samarch ?')
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        reponse(conn, 'Je regarde dans le CRM… Romain Thibaudeau a commandé il y a huit jours.')
        await page.wait_for_timeout(200)
        check('Suite différente après « Je regarde dans le CRM… » : jouée', await page.evaluate('wilson.audio.playing') and len([l for l in logs if 'Réponse en double' in l]) == k)
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)

        # Outil sur 3.1 (memoriser) : la réponse vient après l'outil → pas de relance (sinon deux réponses).
        await page.evaluate("window.__parle(700)"); await page.wait_for_timeout(800)
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 't1', 'name': 'memoriser', 'args': {'fait': 'Timothée m\'entend bien dans la voiture.'}}]}}))
        send(conn, inputTranscription={'text': 'Écoute, elle a l\'air de bien fonctionner là, je t\'entends.'}); send(conn, turnComplete=True)
        await page.wait_for_timeout(600)
        check('3.1 : outil mémoriser puis tour muet → pas de relance (il répond après l\'outil)', not any("s'est tu alors qu'on lui parlait" in l for l in logs)
              and any('attend le résultat de son outil' in l for l in logs) and any(t['id'] == 't1' for t in conn['tools']))

        # Expression du visage d'après le texte, texte parasite nettoyé.
        u = await page.evaluate("""import('./js/app.js').then((m) => ({
          e: [m.emotionDuTexte('Haha, bien vu !'), m.emotionDuTexte('Désolé, je n\\'ai pas compris.'), m.emotionDuTexte('Génial, je retiens ça !'), m.emotionDuTexte('Tu veux que je cherche autre chose ?'), m.emotionDuTexte('Il est 10h17.')],
          d: [m.memeDebut('Re ! Désolé pour la coupure, je suis toujours là ! On parl', 'Re ! Désolé pour la coupure, je suis toujours là ! On parlait de JNF'), m.memeDebut('Oui', 'Oui, je suis là'), m.memeDebut('Je regarde dans le CRM... Alors', 'Je regarde dans le CRM... Pour SN Samarch le chiffre')] }))""")
        check('Expression d\'après le texte (rire, gêne, joie, curieux, rien)', u['e'] == ['rire', 'gene', 'joie', 'curieux', None], str(u['e']))
        check('Comparaison des réponses (même début ; trop court ; phrase d\'attente seule)', u['d'] == [True, False, False], str(u['d']))
        check('… émotion choisie pendant la 1re réponse (« Merci… ! »)', emo in ('joie', None) , str(emo))
        sub = await page.evaluate("(() => { wilson.log('x'); return null; })()")
        ws = [l for l in logs if l.startswith('Wilson : ') or 'Wilson : ' in l]
        check('Texte parasite « response:exprimer_emotion » retiré du journal', not any('response:exprimer_emotion' in l for l in logs))

        # crm_confirmer rappelé après un enregistrement réussi : rien redit.
        r = await page.evaluate("(async () => { const C = wilson.crm; C.pending = null; C.dernierEnregistre = { at: Date.now() - 3000, relu: 'Tâche pour aujourd\\'hui, MECANO SOUD' }; return wilson._crmRun('crm_confirmer', {}, new AbortController().signal, { heard: [] }); })()")
        check('crm_confirmer de trop (déjà enregistré) : « ne redis rien », rien d\'affiché', 'DÉJÀ ENREGISTRÉ' in r['info'] and not r.get('dire') and any('crm_confirmer de trop' in l for l in logs), r['info'][:80])
        r2 = await page.evaluate("(async () => { const C = wilson.crm; C.pending = null; C.dernierEnregistre = { at: Date.now() - 600000, relu: 'x' }; return wilson._crmRun('crm_confirmer', {}, new AbortController().signal, { heard: [] }); })()")
        check('… mais longtemps après : refus normal du verrou', 'NON ENREGISTRÉ' in r2['info'], r2['info'][:60])

        # Son de réflexion en voiture pendant une recherche.
        await page.evaluate("window.__tones = []; const t0 = wilson.audio.tone.bind(wilson.audio); wilson.audio.tone = (k) => { window.__tones.push(k); t0(k); }; wilson._searches = new Map([['s1', { abort() {} }]])")
        await page.wait_for_timeout(4800)
        tones = await page.evaluate('window.__tones')
        check('Voiture : pendant une recherche, petit son de réflexion (toutes les 2,5 s)', tones.count('reflexion') >= 1 and any('petit son de réflexion' in l for l in logs), str(tones))
        await page.evaluate("wilson._searches.clear(); window.__tones = []"); await page.wait_for_timeout(3000)
        check('… recherche finie : plus de son', await page.evaluate('window.__tones.length') == 0)
        errs = [l for l in logs if 'PAGEERROR' in l]
        await b.close()

        # ---- 2. Tablette (maison) : le son de réflexion aussi (avant le 06/11/26 : seulement le visage) ----
        conns = []
        b, page, logs = await run(p, TAB_UA, False, 'gemini-3.1-flash-live-preview', conns)
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        await page.evaluate("window.__look = true; window.__tones = []; const t0 = wilson.audio.tone.bind(wilson.audio); wilson.audio.tone = (k) => { window.__tones.push(k); t0(k); }; wilson._searches = new Map([['s1', { abort() {} }]])")
        await page.wait_for_timeout(4000)
        check('Tablette : petit son de réflexion pendant une recherche aussi (demande du 06/11/26, 00h11)', 'reflexion' in await page.evaluate('window.__tones'))
        errs += [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()

        # ---- 3. Consigne de l'analyste : briefing long permis ----
    from subprocess import run as sh
    out = sh(['node', '-e', "import('%s/../js/analyste.js').then((m) => console.log(m.consigneAnalyste('S', { voiture: true }).includes('BRIEFINGS') || m.consigneAnalyste('S', { voiture: true }).includes('briefings')))" % S], capture_output=True, text=True).stdout.strip()
    check('Analyste : briefing = vraie analyse de coach (6 à 10 phrases), même en voiture', out == 'true', out)
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
