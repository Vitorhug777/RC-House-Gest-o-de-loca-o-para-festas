/* =========================================================================
   RC House — Bloco de assinatura (desenho com o dedo, caneta ou rato)
   window.SignaturePad(canvas) → { clear(), isEmpty(), toDataURL(), onChange(fn) }
   A imagem final é recortada à volta do traço e reduzida (PNG leve, cabe numa célula da planilha).
   ========================================================================= */
(function () {
  'use strict';

  function SignaturePad(canvas) {
    var ctx = canvas.getContext('2d');
    var strokes = [], current = null, listeners = [];
    var ratio = 1;

    function resize() {
      var r = canvas.getBoundingClientRect();
      ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.round(r.width * ratio);
      canvas.height = Math.round(r.height * ratio);
      redraw();
    }
    function style(c, scale) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#111114'; c.lineWidth = 2.6 * scale;
    }
    function drawStroke(c, pts, scale, ox, oy) {
      if (!pts.length) return;
      c.beginPath();
      c.moveTo((pts[0].x - ox) * scale, (pts[0].y - oy) * scale);
      if (pts.length === 1) c.lineTo((pts[0].x - ox) * scale + 0.1, (pts[0].y - oy) * scale + 0.1);
      for (var i = 1; i < pts.length - 1; i++) { // curva suave pelos pontos médios
        var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        c.quadraticCurveTo((pts[i].x - ox) * scale, (pts[i].y - oy) * scale, (mx - ox) * scale, (my - oy) * scale);
      }
      if (pts.length > 1) { var l = pts[pts.length - 1]; c.lineTo((l.x - ox) * scale, (l.y - oy) * scale); }
      c.stroke();
    }
    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      style(ctx, ratio);
      strokes.forEach(function (s) { drawStroke(ctx, s, ratio, 0, 0); });
    }
    function point(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function emit() { listeners.forEach(function (fn) { try { fn(); } catch (x) { } }); }

    canvas.style.touchAction = 'none'; // o dedo desenha em vez de rolar a página
    canvas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (x) { }
      current = [point(ev)]; strokes.push(current); redraw();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!current) return;
      ev.preventDefault();
      var evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      evs.forEach(function (x) { current.push(point(x)); });
      redraw();
    });
    function end() { if (current) { current = null; emit(); } }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
    window.addEventListener('resize', function () {
      // mantém o desenho ao rodar o celular, ajustando à nova largura
      var old = canvas.getBoundingClientRect().width, w0 = canvas.width / ratio;
      resize();
      if (w0 && old && Math.abs(old - w0) > 1) {
        var k = old / w0; strokes.forEach(function (s) { s.forEach(function (p) { p.x *= k; p.y *= k; }); }); redraw();
      }
    });
    resize();

    return {
      clear: function () { strokes = []; current = null; redraw(); emit(); },
      isEmpty: function () {
        var n = 0; strokes.forEach(function (s) { n += s.length; });
        return n < 8; // um toque ou um risquinho não conta como assinatura
      },
      onChange: function (fn) { listeners.push(fn); },
      /* PNG recortado à volta do traço, no máximo 520 × 170 px (menor se preciso) */
      toDataURL: function () {
        // reduz se ficar grande demais para uma célula da planilha (limite ~45 000 caracteres)
        for (var mw = 520, url = ''; mw >= 240; mw -= 80) { url = this._export(mw, mw * 170 / 520); if (url.length < 44000) return url; }
        return url;
      },
      _export: function (MW, MH) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        strokes.forEach(function (s) { s.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
        if (!isFinite(minX)) return '';
        var pad = 6; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        var w = maxX - minX, h = maxY - minY;
        var scale = Math.min(MW / w, MH / h, 2);
        var out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(w * scale)); out.height = Math.max(1, Math.round(h * scale));
        var c = out.getContext('2d');
        style(c, Math.max(scale, 1));
        strokes.forEach(function (s) { drawStroke(c, s, scale, minX, minY); });
        return out.toDataURL('image/png');
      }
    };
  }

  window.SignaturePad = SignaturePad;
})();
