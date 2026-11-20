# Contournement pour les tests de Wilson sur le PC de la maison (19/11/26).
# Sur ce PC (Windows), aucun Chromium ne termine jamais audioWorklet.addModule : le son de la page reste bloqué et
# tous les tests e2e attendent « demarrage » jusqu'à expirer. L'atelier du relais ne pouvait donc plus rien publier.
# Ce dossier n'est mis dans PYTHONPATH que par le relais (pc/relais.mjs, atelier, Windows seulement) ; ailleurs (GitHub,
# autres machines) rien ne change. Python charge alors ce fichier au démarrage : quand Playwright ouvre un contexte,
# sur les pages servies en local (127.0.0.1 / localhost) seulement, le module audio est remplacé par un ScriptProcessor
# qui envoie des blocs de 20 ms, comme js/worklets/capture.js.
SHIM = r"""
(() => {
  if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || !window.AudioWorklet || window.__shimWorklet) return;
  window.__shimWorklet = true;
  AudioWorklet.prototype.addModule = function () { return Promise.resolve(); };
  // 20/11/26 : un ScriptProcessor reçoit des zéros même sans micro branché ; capture.js, lui, n'envoie alors rien. Sans ce
  // compte des sources branchées, Wilson croyait le micro pris par un appel (« silence numérique ») et e2e_android bloquait.
  const c0 = AudioNode.prototype.connect, d0 = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (dest, ...r) {
    if (dest && dest.__shim) { dest.__ins = (dest.__ins || 0) + 1; (this.__to = this.__to || []).push(dest); }
    return c0.call(this, dest, ...r);
  };
  AudioNode.prototype.disconnect = function (...a) {
    const t = this.__to || [], d = a[0], un = a.length && d && typeof d === 'object';
    for (const x of (un ? t.filter((y) => y === d) : t)) x.__ins = Math.max(0, (x.__ins || 0) - 1);
    this.__to = un ? t.filter((y) => y !== d) : [];
    return d0.apply(this, a);
  };
  window.AudioWorkletNode = function (ctx, name) {
    const sp = ctx.createScriptProcessor(1024, 1, 1);
    sp.__shim = true;
    const size = Math.round(ctx.sampleRate * 0.02);
    let buf = new Float32Array(size), n = 0;
    const port = { onmessage: null, postMessage() {}, start() {}, close() {} };
    sp.onaudioprocess = (e) => {
      if (!sp.__ins) return;                                 // micro débranché : rien, comme capture.js
      const ch = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        buf[n++] = ch[i];
        if (n === size) { const b = buf; buf = new Float32Array(size); n = 0; if (port.onmessage) port.onmessage({ data: b }); }
      }
    };
    sp.port = port;
    return sp;
  };
})();
"""

try:
    from playwright._impl import _browser, _browser_type

    def _avec_shim(orig):
        async def f(self, *a, **k):
            ctx = await orig(self, *a, **k)
            try:
                await ctx.add_init_script(script=SHIM)
            except Exception:
                pass
            return ctx
        return f

    _browser.Browser.new_context = _avec_shim(_browser.Browser.new_context)
    _browser_type.BrowserType.launch_persistent_context = _avec_shim(_browser_type.BrowserType.launch_persistent_context)
except Exception:
    pass
