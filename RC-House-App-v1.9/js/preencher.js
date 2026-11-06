/* =========================================================================
   RC House — Página pública do locatário (preencher.html#t=<token>)
   1. Seus dados → 2. Ler o contrato (já assinado pela RC House) → 3. Assinar com o dedo
   → 4. Conferir o contrato assinado → 5. Confirmar → contrato assinado + PDF.
   A planilha só aceita o token desta reserva e valida tudo de novo.
   ========================================================================= */
(function () {
  'use strict';

  var API = (window.RC_CONFIG && window.RC_CONFIG.planilhaUrl) || '';
  var e = U.escapeHTML;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var app = $('#fillApp');

  // token na parte "#" do endereço: não é enviado a servidores nem fica em registos
  var token = (location.hash.match(/[#&]t=([A-Za-z0-9_-]{32,64})/) || [])[1] || '';
  if (token && history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#t=' + token);
  window.addEventListener('hashchange', function () { location.reload(); }); // outro link colado na mesma aba

  var FIELDS = [
    { k: 'nome', label: 'Nome completo', ph: 'Como está no documento', auto: 'name', check: function (v) { return v.trim().split(/\s+/).length >= 2 ? '' : 'Informe o nome completo (nome e sobrenome).'; } },
    { k: 'cpf', label: 'CPF', ph: '000.000.000-00', mode: 'numeric', mask: U.maskCPF, check: function (v) { var d = U.onlyDigits(v); return !d ? 'Informe o CPF.' : d.length < 11 ? 'O CPF tem 11 números.' : U.isValidCPF(d) ? '' : 'CPF inválido — confira os números.'; } },
    { k: 'rg', label: 'RG', ph: 'Ex.: MG-12.345.678', check: function (v) { return v.replace(/[^0-9a-z]/gi, '').length >= 4 ? '' : 'Informe o RG.'; } },
    { k: 'fone', label: 'Telefone / WhatsApp', ph: '(00) 00000-0000', mode: 'tel', auto: 'tel', mask: U.maskPhone, check: function (v) { var n = U.onlyDigits(v).length; return n === 10 || n === 11 ? '' : 'Informe o telefone com DDD.'; } }
  ];
  var state = { reserva: null, contrato: null, dados: {}, erros: {}, assinatura: '', aceite: false, zoom: false };

  function post(body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .catch(function (err) { if (err && err.name === 'AbortError') throw new Error('A conexão demorou demais.'); throw new Error(navigator.onLine === false ? 'Sem internet. Verifique a conexão e tente de novo.' : 'Não foi possível conectar. Tente de novo em instantes.'); })
      .finally(function () { if (to) clearTimeout(to); });
  }

  function render(html) {
    app.innerHTML = html;
    window.scrollTo(0, 0);
    fit();
  }
  function message(ic, tone, title, text, extra) {
    render('<section class="card p-6 text-center pop-in">' +
      '<div class="w-14 h-14 rounded-2xl grid place-items-center mx-auto ' + tone + '">' + icon(ic, 'w-7 h-7') + '</div>' +
      '<h1 class="mt-4 font-display text-[24px] font-semibold leading-tight">' + title + '</h1>' +
      '<p class="mt-2 text-sm text-black/60 leading-relaxed">' + text + '</p>' + (extra || '') + '</section>');
  }
  function stepper(n) {
    var names = ['Dados', 'Contrato', 'Assinar', 'Confirmar'];
    return '<ol class="card px-4 pt-3 pb-2 mb-3 grid grid-cols-4 gap-1.5" aria-label="Etapas">' + names.map(function (t, i) {
      var done = i < n, cur = i === n;
      return '<li><div class="h-1.5 rounded-full ' + (done ? 'bg-ok' : cur ? 'bg-gold' : 'bg-black/10') + '"></div>' +
        '<div class="mt-1 text-[11px] font-bold ' + (done ? 'text-[#047857]' : cur ? 'text-gold-deep' : 'text-black/40') + '">' + t + '</div></li>';
    }).join('') + '</ol>';
  }

  function reservaCard(r) {
    return '<section class="card p-5" aria-label="Sua reserva">' +
      '<div class="kicker">Sua reserva' + (r.numero ? ' · Nº ' + r.numero : '') + '</div>' +
      '<div class="mt-1 font-display text-[22px] font-semibold leading-tight break-words">' + e(r.evento || 'Evento') + '</div>' +
      '<div class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-sm text-black/70">' +
      '<span class="text-gold-deep">' + icon('calendar-days', 'w-4 h-4') + '</span><span class="first-letter:uppercase">' + e(U.formatLong(r.data)) + '</span>' +
      '<span class="text-gold-deep">' + icon('clock', 'w-4 h-4') + '</span><span>' + e(r.entrada || '--:--') + 'h às ' + e(r.saida || '--:--') + 'h</span>' +
      '<span class="text-gold-deep">' + icon('map-pin', 'w-4 h-4') + '</span><span>RC House · Av. Abadio Bonifácio da Silva, 153 · Granada</span>' +
      '</div></section>';
  }

  /* Contrato com os dados digitados (o mesmo texto que a RC House vê) */
  function contratoAtual() {
    var c = JSON.parse(JSON.stringify(state.contrato || {}));
    c.locatario = c.locatario || {};
    (state.reserva.editaveis || []).forEach(function (k) {
      var v = (state.dados[k] || '').trim();
      if (k === 'rg') v = v.toUpperCase();
      if (k === 'nome') v = v.replace(/\s+/g, ' ');
      c.locatario[k] = v;
    });
    c.assinatura = Object.assign({}, c.assinatura, { data: U.todayISO() }); // o contrato fica com a data em que é assinado
    return c;
  }
  function contractView(c, opts) {
    return '<div class="flex items-center justify-between gap-2 mb-2">' +
      '<span class="text-xs font-semibold text-black/50">' + (state.zoom ? 'Arraste para ler o contrato inteiro' : 'Dica: amplie com dois dedos ou toque em Ampliar') + '</span>' +
      '<button type="button" data-zoom class="btn-light !h-9 !px-3 !text-xs shrink-0">' + icon(state.zoom ? 'x' : 'maximize-2', 'w-4 h-4') + (state.zoom ? 'Ajustar' : 'Ampliar') + '</button></div>' +
      '<div class="ct-scroll' + (state.zoom ? ' is-zoom' : '') + '"><div class="contract-viewport js-fit mx-auto w-full">' + Contract.render(c, opts) + '</div></div>';
  }
  function fit() {
    $$('.contract-viewport', app).forEach(function (vp) {
      var page = vp.querySelector('.ct-page'); if (!page) return;
      if (state.zoom) { page.style.transform = 'none'; vp.style.width = '794px'; vp.style.height = '1122px'; return; }
      vp.style.width = '';
      var s = vp.clientWidth / 794;
      page.style.transform = 'scale(' + s + ')';
      vp.style.height = Math.round(1122 * s) + 'px';
    });
  }
  window.addEventListener('resize', fit);
  app.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-zoom]')) return;
    state.zoom = !state.zoom;
    var view = state.view; if (view) view();
  });

  /* ---------- 1. Dados ---------- */
  function showForm() {
    state.view = showForm;
    var r = state.reserva, pre = r.preenchidos || {}, ed = r.editaveis || [];
    var fixed = FIELDS.filter(function (f) { return ed.indexOf(f.k) < 0 && pre[f.k]; });
    var open = FIELDS.filter(function (f) { return ed.indexOf(f.k) >= 0; });
    if (!open.length) return showContract();
    render(stepper(0) + reservaCard(r) +
      '<form id="fillForm" class="card p-5 mt-3" novalidate autocomplete="on">' +
      '<h2 class="font-display text-[20px] font-semibold leading-tight">Seus dados para o contrato</h2>' +
      '<p class="text-xs text-black/50 mt-1">Campos com <b class="text-bad">*</b> são obrigatórios. Depois você lê o contrato e assina aqui mesmo, pelo celular.</p>' +
      (fixed.length ? '<div class="mt-4 rounded-xl bg-mist px-3 py-1">' + fixed.map(function (f) {
        return '<div class="flex items-baseline justify-between gap-3 py-2 border-b border-black/[.06] last:border-0"><span class="text-xs text-black/50 font-semibold shrink-0">' + f.label + '</span><span class="text-sm font-semibold text-right break-words min-w-0">' + e(pre[f.k]) + '</span></div>';
      }).join('') + '<p class="pb-2 text-[11px] text-black/45">Já preenchido pela RC House.</p></div>' : '') +
      '<div class="mt-4 space-y-3">' + open.map(function (f) {
        var v = state.dados[f.k] != null ? state.dados[f.k] : '', err = state.erros[f.k] || '';
        return '<label class="field block"><span class="field-label">' + f.label + ' <b class="text-bad">*</b></span>' +
          '<input class="input' + (err ? ' is-invalid' : '') + '" name="' + f.k + '" required value="' + e(v) + '" placeholder="' + f.ph + '"' +
          (f.mode ? ' inputmode="' + f.mode + '"' : '') + (f.auto ? ' autocomplete="' + f.auto + '"' : ' autocomplete="off"') +
          ' aria-invalid="' + (err ? 'true' : 'false') + '" aria-describedby="err-' + f.k + '">' +
          '<span id="err-' + f.k + '" class="block text-[12px] mt-1 font-semibold text-bad min-h-[16px]">' + e(err) + '</span></label>';
      }).join('') + '</div>' +
      '<button type="submit" class="btn-gold btn-lg w-full mt-2">Ver o contrato ' + icon('arrow-right', 'w-5 h-5') + '</button>' +
      '</form>');
    var form = $('#fillForm');
    form.addEventListener('input', function (ev) {
      var el = ev.target, f = FIELDS.find(function (x) { return x.k === el.name; }); if (!f) return;
      if (f.mask) { var m = f.mask(el.value); if (m !== el.value) el.value = m; }
      state.dados[f.k] = el.value;
      if (state.erros[f.k] && !f.check(el.value)) { delete state.erros[f.k]; el.classList.remove('is-invalid'); el.setAttribute('aria-invalid', 'false'); $('#err-' + f.k).textContent = ''; }
    });
    form.addEventListener('focusout', function (ev) { // valida ao sair do campo
      var el = ev.target, f = FIELDS.find(function (x) { return x.k === el.name; }); if (!f || !el.value) return;
      var msg = f.check(el.value);
      el.classList.toggle('is-invalid', !!msg); el.setAttribute('aria-invalid', String(!!msg)); $('#err-' + f.k).textContent = msg;
      if (msg) state.erros[f.k] = msg; else delete state.erros[f.k];
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      state.erros = {};
      open.forEach(function (f) { var v = form[f.k].value || ''; state.dados[f.k] = v; var m = f.check(v); if (m) state.erros[f.k] = m; });
      if (Object.keys(state.erros).length) { showForm(); var first = $('.is-invalid'); if (first) { first.focus(); first.scrollIntoView({ block: 'center' }); } return; }
      showContract();
    });
  }

  /* ---------- 2. Ler o contrato ---------- */
  function showContract() {
    state.view = showContract;
    var hasForm = (state.reserva.editaveis || []).length > 0;
    render(stepper(1) +
      '<section class="card p-4 sm:p-5">' +
      '<h2 class="font-display text-[20px] font-semibold leading-tight">Leia o contrato</h2>' +
      '<p class="text-xs text-black/55 mt-1 mb-3">Os seus dados já estão no contrato e a RC House já assinou. Confira tudo antes de assinar.</p>' +
      contractView(contratoAtual(), { signHere: true }) +
      '<button type="button" id="toSign" class="btn-gold btn-lg w-full mt-4">' + icon('pencil', 'w-5 h-5') + 'Assinar o contrato</button>' +
      (hasForm ? '<button type="button" id="toForm" class="btn-light w-full mt-2">' + icon('arrow-left', 'w-4 h-4') + 'Corrigir meus dados</button>' : '') +
      '</section>');
    $('#toSign').onclick = function () { showSign(); };
    if (hasForm) $('#toForm').onclick = function () { showForm(); };
  }

  /* ---------- 3. Assinar ---------- */
  function showSign(err) {
    state.view = null; // o quadro de assinatura não é recriado ao ampliar
    render(stepper(2) +
      '<section class="card p-4 sm:p-5">' +
      '<h2 class="font-display text-[20px] font-semibold leading-tight">Sua assinatura</h2>' +
      '<p class="text-xs text-black/55 mt-1">Assine com o dedo dentro do quadro, como no seu documento. Ela vai ser colocada no lugar certo do contrato.</p>' +
      '<div class="sig-wrap mt-3"><canvas class="sig-box" id="sigCanvas" aria-label="Quadro de assinatura"></canvas><div class="sig-guide"></div><div class="sig-hint" id="sigHint">Assine aqui</div></div>' +
      '<div class="flex justify-end mt-2"><button type="button" id="sigClear" class="btn-ghost !h-9 !text-xs text-black/60">' + icon('rotate-ccw', 'w-4 h-4') + 'Limpar e assinar de novo</button></div>' +
      '<label class="check-row mt-3 rounded-xl bg-mist px-3 py-3"><input type="checkbox" id="aceite"' + (state.aceite ? ' checked' : '') + '>' +
      '<span class="text-sm text-black/70 leading-snug">Li o contrato e concordo com todas as cláusulas. Esta assinatura eletrônica tem o mesmo valor da minha assinatura no papel.</span></label>' +
      (err ? '<p class="mt-3 text-sm font-semibold text-bad">' + e(err) + '</p>' : '') +
      '<button type="button" id="toReview" class="btn-gold btn-lg w-full mt-4" disabled>Ver contrato assinado ' + icon('arrow-right', 'w-5 h-5') + '</button>' +
      '<button type="button" id="backContract" class="btn-light w-full mt-2">' + icon('arrow-left', 'w-4 h-4') + 'Voltar ao contrato</button>' +
      '</section>');
    var canvas = $('#sigCanvas'), pad = SignaturePad(canvas), go = $('#toReview'), ac = $('#aceite');
    var upd = function () {
      var empty = pad.isEmpty();
      canvas.classList.toggle('is-signed', !empty); $('#sigHint').hidden = !empty;
      go.disabled = empty || !ac.checked;
    };
    pad.onChange(upd); ac.onchange = function () { state.aceite = ac.checked; upd(); };
    $('#sigClear').onclick = function () { pad.clear(); };
    $('#backContract').onclick = function () { showContract(); };
    go.onclick = function () { if (pad.isEmpty() || !ac.checked) return; state.assinatura = pad.toDataURL(); showReview(); };
    upd();
  }

  /* ---------- 4. Conferir o contrato assinado ---------- */
  function showReview(err) {
    state.view = function () { showReview(err); };
    render(stepper(3) +
      '<section class="card p-4 sm:p-5">' +
      '<h2 class="font-display text-[20px] font-semibold leading-tight">Confira o contrato assinado</h2>' +
      '<p class="text-xs text-black/55 mt-1 mb-3">Esta é a versão final, com as duas assinaturas. Ao confirmar, ela é enviada à RC House.</p>' +
      contractView(contratoAtual(), { signature: state.assinatura }) +
      (err ? '<p class="mt-3 text-sm font-semibold text-bad">' + e(err) + '</p>' : '') +
      '<button type="button" id="sendBtn" class="btn-ok btn-lg w-full mt-4">' + icon('circle-check', 'w-5 h-5') + 'Confirmar e enviar</button>' +
      '<button type="button" id="redo" class="btn-light w-full mt-2">' + icon('rotate-ccw', 'w-4 h-4') + 'Refazer a assinatura</button>' +
      '</section>');
    $('#redo').onclick = function () { showSign(); };
    $('#sendBtn').onclick = function () { send(this); };
  }

  /* ---------- 5. Enviar ---------- */
  function send(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>Enviando…';
    var dados = {};
    (state.reserva.editaveis || []).forEach(function (k) { dados[k] = state.dados[k]; });
    post({ acao: 'convite_enviar', token: token, dados: dados, assinatura: state.assinatura, aceite: true, dispositivo: navigator.userAgent.slice(0, 180) }).then(function (res) {
      if (res.ok) { state.contrato = res.contrato; Contract.setLocadoraSignature(res.assinaturaLocadora || ''); return showDone(false); }
      if (res.estado === 'assinado') return load();
      if (res.estado === 'invalido') return invalid(res.erro);
      if (res.campos) { state.erros = res.campos; return showForm(); }
      if (res.campo === 'assinatura' || res.campo === 'aceite') return showSign(res.erro);
      showReview(res.erro || 'Não foi possível enviar. Tente de novo.');
    }, function (err) { showReview(err.message); });
  }

  /* ---------- Contrato assinado ---------- */
  function showDone(already) {
    state.view = function () { showDone(already); };
    var c = state.contrato, sg = c.assinaturaLocatario || {};
    render('<section class="card p-5 text-center' + (already ? '' : ' pop-in') + '">' +
      '<div class="w-14 h-14 rounded-2xl grid place-items-center mx-auto bg-ok/10 text-ok">' + icon('badge-check', 'w-7 h-7') + '</div>' +
      '<h1 class="mt-3 font-display text-[24px] font-semibold leading-tight">' + (already ? 'Contrato assinado' : 'Contrato assinado!') + '</h1>' +
      '<p class="mt-2 text-sm text-black/60 leading-relaxed">' + (already ? 'Este contrato já foi assinado' : 'Obrigado' + (c.locatario && c.locatario.nome ? ', ' + e(U.firstName(c.locatario.nome)) : '') + '! A sua reserva de <b>' + e(U.formatBR(c.data)) + '</b> está confirmada') +
      (sg.em ? ' em ' + e(new Date(sg.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) : '') + '.</p>' +
      (sg.codigo ? '<p class="mt-2 text-xs text-black/45">Código de verificação: <b class="text-obsidian">' + e(sg.codigo) + '</b></p>' : '') +
      '<button type="button" id="pdfBtn" class="btn-gold btn-lg w-full mt-4">' + icon('download', 'w-5 h-5') + 'Baixar meu contrato (PDF)</button>' +
      '</section>' +
      '<section class="card p-4 sm:p-5 mt-3">' + contractView(c, {}) + '</section>');
    $('#pdfBtn').onclick = function () {
      var btn = this, html = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>Gerando PDF…';
      Contract.generatePdf(c).then(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = Contract.fileName(c); document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }).catch(function () { alertBox('Não foi possível gerar o PDF. Tente de novo.'); })
        .finally(function () { btn.disabled = false; btn.innerHTML = html; });
    };
  }
  function alertBox(msg) { var p = document.createElement('p'); p.className = 'mt-3 text-sm font-semibold text-bad'; p.textContent = msg; $('#pdfBtn').after(p); }

  function invalid(msg) {
    message('triangle-alert', 'bg-wait/15 text-[#B45309]', 'Link indisponível', e(msg || 'Este link não é válido ou foi substituído por um novo. Peça um link atualizado à RC House.'));
  }

  /* ---------- Início ---------- */
  function load() {
    if (!API) return invalid('Este endereço não está configurado.');
    if (!token) return invalid('O link está incompleto. Abra-o de novo a partir da mensagem do WhatsApp.');
    post({ acao: 'convite_ler', token: token }).then(function (res) {
      if (!res.ok) return invalid(res.erro);
      state.reserva = res.reserva; state.contrato = res.contrato;
      Contract.setLocadoraSignature(res.assinaturaLocadora || '');
      Object.keys(res.reserva.atuais || {}).forEach(function (k) { if (state.dados[k] == null) state.dados[k] = res.reserva.atuais[k]; });
      if (res.estado === 'assinado') return showDone(true);
      if (res.estado === 'enviado') return message('circle-check', 'bg-ok/10 text-ok', 'Dados já enviados', 'Os dados desta reserva já foram recebidos pela RC House. Se precisar corrigir alguma coisa, fale com a RC House pelo WhatsApp.');
      showForm();
    }, function (err) {
      message('cloud-off', 'bg-mist text-black/50', 'Não foi possível carregar', e(err.message), '<button type="button" id="retry" class="btn-dark btn-lg w-full mt-5">' + icon('refresh-cw', 'w-5 h-5') + 'Tentar de novo</button>');
      $('#retry').onclick = function () { render('<div class="card p-6 text-center text-sm text-black/55">Carregando…</div>'); load(); };
    });
  }
  load();
})();
