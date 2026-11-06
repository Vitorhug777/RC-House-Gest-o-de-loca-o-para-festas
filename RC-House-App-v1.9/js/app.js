/* =========================================================================
   RC House Espaço de Eventos — App de Agendamentos & Contratos (PWA)
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Constantes
     --------------------------------------------------------------------- */
  var CARD_PHOTOS = ['IMG_0319', 'IMG_0338', 'IMG_0334'];
  var EVENT_SUGGESTIONS = ['Aniversário', 'Confraternização Familiar', 'Casamento', 'Chá de Bebê', 'Batizado', 'Formatura', 'Confraternização de Empresa'];
  var STATUS = {
    pending: { label: 'Aguardando Assinatura', short: 'Aguardando', badge: 'badge-pending', color: '#F59E0B' },
    confirmed: { label: 'Confirmado (Contrato Assinado)', short: 'Confirmado', badge: 'badge-confirmed', color: '#10B981' },
    cancelled: { label: 'Cancelado', short: 'Cancelado', badge: 'badge-cancelled', color: '#EF4444' }
  };
  var INSTALL_DISMISS_KEY = 'rchouse.installDismissedAt';
  /* Preenchimento dos dados pelo locatário via link */
  var PREENCH = {
    aguardando: { label: 'Link enviado — aguardando o locatário', short: 'Link enviado', badge: 'badge bg-wait/15 text-[#B45309]', icon: 'send' },
    assinado: { label: 'Assinado pelo locatário', short: 'Assinado por link', badge: 'badge bg-ok/15 text-[#047857]', icon: 'badge-check' },
    recebido: { label: 'Dados recebidos — revisar', short: 'Dados recebidos', badge: 'badge bg-gold/15 text-gold-deep', icon: 'badge-check' },
    concluido: { label: 'Dados do locatário revisados', short: 'Dados revisados', badge: 'badge bg-ok/15 text-[#047857]', icon: 'circle-check' }
  };
  function preench(b) { var p = b && b.preenchimento; return p && PREENCH[p.status] ? p.status : ''; }
  function nomeLocatario(b) { return (b.locatario && b.locatario.nome) || (preench(b) === 'aguardando' ? 'Locatário vai preencher pelo link' : 'Sem nome'); }
  function newToken() { // 192 bits aleatórios → 32 caracteres (URL-safe)
    var a = new Uint8Array(24); crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /* Base pública dos links: siteUrl (js/config.js) ou o endereço atual, se for um site na internet */
  function publicBase() {
    var cfg = String((window.RC_CONFIG && window.RC_CONFIG.siteUrl) || '').trim();
    if (/^https?:\/\//i.test(cfg)) return cfg.replace(/\/*$/, '/');
    if (/^https?:$/.test(location.protocol) && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return new URL('.', location.href).href;
    return '';
  }
  function fillLink(b) {
    var base = publicBase() || new URL('.', location.href).href;
    return new URL('preencher.html', base).href.split('#')[0] + '#t=' + b.preenchimento.token;
  }

  var e = U.escapeHTML;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var isXL = function () { return window.matchMedia('(min-width: 1280px)').matches; };
  /* O painel direito só existe em Agenda/Reservas e em ecrãs ≥ 1280px */
  var panelActive = function () { return isXL() && (state.view === 'agenda' || state.view === 'reservas'); };
  var VIEW_BASE = 'px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6 pb-36 lg:pb-10 mx-auto';

  /* ---------------------------------------------------------------------
     Estado da interface
     --------------------------------------------------------------------- */
  var now = new Date();
  var state = {
    view: 'agenda',
    calY: now.getFullYear(),
    calM: now.getMonth(),
    selectedDate: U.todayISO(),
    selectedId: null,      // reserva em foco no painel direito (desktop)
    filter: 'upcoming',    // filtro da lista de reservas
    contractReturn: null,  // reserva a que o botão Voltar do contrato regressa
    keepSelect: null,      // reserva a manter selecionada na próxima mudança de ecrã (após salvar)
    search: '',
    form: null             // rascunho do formulário
  };

  /* ---------------------------------------------------------------------
     Helpers de UI
     --------------------------------------------------------------------- */
  function hydrateIcons(root) {
    $$('[data-icon]', root || document).forEach(function (el) {
      el.outerHTML = icon(el.getAttribute('data-icon'), el.getAttribute('data-cls') || 'w-5 h-5');
    });
  }

  function photoFor(b) {
    var s = String(b.id || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return CARD_PHOTOS[h % CARD_PHOTOS.length];
  }

  /* Situação financeira: o sinal já está pago; os pagamentos registados abatem o saldo restante do contrato */
  function finance(b) {
    var v = b.valores || {};
    var rec = (b.pagamentos || []).reduce(function (t, x) { return t + (x.valor || 0); }, 0);
    var pend = Math.max(0, (v.saldo || 0) - rec);
    var recebido = (v.sinal || 0) + rec;          // sinal (pago no ato) + pagamentos registados — sem contar o sinal duas vezes
    var quitado = pend === 0 && (v.total || 0) > 0;
    var pct = quitado ? 100 : v.total ? Math.min(99, Math.floor(recebido / v.total * 100)) : 0;
    return { pagamentos: rec, recebido: recebido, pendente: pend, pago: recebido, pct: pct, quitado: quitado };
  }

  function statusBadge(st, long) {
    var S = STATUS[st] || STATUS.pending;
    return '<span class="' + S.badge + '"><span class="dot" style="background:' + S.color + '"></span>' + (long ? S.label : S.short) + '</span>';
  }

  function toast(msg, tone) {
    var root = $('#toastRoot');
    var el = document.createElement('div');
    var ic = tone === 'error' ? 'triangle-alert' : tone === 'ok' ? 'circle-check' : 'info';
    var col = tone === 'error' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-gold';
    el.className = 'toast-in pointer-events-auto glass-dark text-white rounded-2xl pl-3 pr-4 py-3 shadow-lift border border-white/10 flex items-center gap-2.5 text-sm font-semibold max-w-md';
    el.innerHTML = '<span class="' + col + '">' + icon(ic, 'w-5 h-5') + '</span><span>' + e(msg) + '</span>';
    root.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; }, 3200);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var root = $('#dialogRoot');
      var tone = opts.tone || 'dark';
      var okCls = tone === 'danger' ? 'btn bg-bad text-white' : tone === 'ok' ? 'btn-ok' : 'btn-dark';
      root.innerHTML =
        '<div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">' +
        '<div class="absolute inset-0 bg-obsidian/60 backdrop-blur-sm fade-in" data-dlg="cancel"></div>' +
        '<div class="relative w-full max-w-sm card p-6 pop-in" role="alertdialog" aria-modal="true">' +
        '<div class="w-12 h-12 rounded-2xl grid place-items-center mb-4 ' + (tone === 'danger' ? 'bg-bad/10 text-bad' : tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-gold/15 text-gold-deep') + '">' + icon(opts.icon || 'info', 'w-6 h-6') + '</div>' +
        '<h3 class="font-display text-xl font-semibold">' + e(opts.title) + '</h3>' +
        (opts.text ? '<p class="mt-2 text-sm text-black/60 leading-relaxed">' + opts.text + '</p>' : '') +
        '<div class="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">' +
        (opts.cancelText === false ? '' : '<button class="btn-light" data-dlg="cancel">' + e(opts.cancelText || 'Cancelar') + '</button>') +
        (opts.altText ? '<button class="btn-light" data-dlg="alt">' + e(opts.altText) + '</button>' : '') +
        '<button class="' + okCls + '" data-dlg="ok">' + e(opts.okText || 'Confirmar') + '</button>' +
        '</div></div></div>';
      root.onclick = function (ev) {
        var t = ev.target.closest('[data-dlg]'); if (!t) return;
        var r = t.getAttribute('data-dlg');
        root.innerHTML = ''; root.onclick = null;
        resolve(r === 'ok' ? true : r === 'alt' ? 'alt' : false);
      };
      var ok = $('[data-dlg="ok"]', root); if (ok) ok.focus();
    });
  }

  /* ---------------------------------------------------------------------
     Overlays (drawer de detalhes, contrato, fotos) com suporte ao botão
     "voltar" do Android
     --------------------------------------------------------------------- */
  var overlayOpen = false;
  function openOverlay(html, opts) {
    var root = $('#overlayRoot');
    root.innerHTML = html;
    hydrateIcons(root);
    document.documentElement.style.overflow = 'hidden';
    if (!overlayOpen) { history.pushState({ rcOverlay: true }, ''); }
    overlayOpen = true;
    if (opts && opts.onOpen) opts.onOpen(root);
  }
  function closeOverlay(fromPop) {
    if (!overlayOpen) return;
    overlayOpen = false;
    if (!fromPop) state.contractReturn = null; // fecho explícito (X, Esc, fundo): não regressa a nenhuma reserva
    $('#overlayRoot').innerHTML = '';
    document.documentElement.style.overflow = '';
    if (!fromPop && history.state && history.state.rcOverlay) history.back();
  }
  window.addEventListener('popstate', function () {
    if (!overlayOpen) return;
    var back = state.contractReturn;
    closeOverlay(true);
    if (back && $('#overlayRoot') && !panelActive() && Store.get(back)) { state.contractReturn = null; openBooking(back); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if ($('#dialogRoot').innerHTML) { $('#dialogRoot').innerHTML = ''; $('#dialogRoot').onclick = null; return; }
      if (document.getElementById('dayPop')) { closeDayPopover(); return; }
      if (!overlayOpen && state.selectedId && panelActive()) { state.selectedId = null; refreshAll(); return; }
      closeOverlay();
    }
  });

  /* ---------------------------------------------------------------------
     Router (hash)
     --------------------------------------------------------------------- */
  function parseRoute() {
    var h = (location.hash || '#/agenda').replace(/^#\/?/, '');
    var parts = h.split('/');
    return { name: parts[0] || 'agenda', arg: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function route() {
    if (overlayOpen) { overlayOpen = false; $('#overlayRoot').innerHTML = ''; document.documentElement.style.overflow = ''; }
    var r = parseRoute();
    var view = $('#view');
    var nav = r.name === 'editar' ? 'novo' : (r.name || 'agenda');
    if (['agenda', 'reservas', 'novo', 'ajustes'].indexOf(nav) < 0) { location.hash = '#/agenda'; return; }

    state.view = nav;
    // Painel direito apenas onde é útil; Novo/Ajustes ganham a largura toda
    // Ao mudar de ecrã o painel de detalhes fecha (não reserva espaço enquanto fechado)
    state.selectedId = state.keepSelect || null;
    state.keepSelect = null;
    closeDayPopover();
    syncPanelLayout();
    view.className = VIEW_BASE + (nav === 'agenda' ? ' max-w-[1120px] dash-fit' : nav === 'reservas' ? ' max-w-[1100px]' : ' max-w-[1040px]');

    if (nav === 'agenda') renderAgenda(view);
    else if (nav === 'reservas') renderReservas(view);
    else if (r.name === 'editar') renderForm(view, r.arg, null);
    else if (nav === 'novo') renderForm(view, null, r.arg);
    else renderAjustes(view);
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-nav') === nav); });
    $('#topSubtitle').textContent = { agenda: 'Painel & Agenda', reservas: 'Reservas', novo: r.name === 'editar' ? 'Editar Agendamento' : 'Novo Agendamento', ajustes: 'Ajustes' }[nav] || 'Espaço de Eventos';
    view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
    hydrateIcons(view);
    renderRightPanel();
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     VIEW: Painel & Agenda
     ===================================================================== */
  function monthStats(y, m) {
    var list = Store.byMonth(y, m);
    var s = { confirmed: 0, pending: 0, cancelled: 0, revenue: 0, receivable: 0, received: 0 };
    list.forEach(function (b) {
      s[b.status] = (s[b.status] || 0) + 1;
      if (b.status !== 'cancelled') {
        var f = finance(b);
        s.revenue += (b.valores && b.valores.total) || 0;
        s.received += f.recebido;
        s.receivable += f.pendente;
      }
    });
    return s;
  }

  function renderAgenda(view) {
    var settings = Store.getSettings();
    view.innerHTML =
      /* Cabeçalho compacto */
      '<header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">' +
      '<div class="min-w-0"><div class="kicker">' + e(U.greeting()) + ', ' + e(U.firstName(settings.locadorNome)) + '</div>' +
      '<h1 class="font-display text-[24px] sm:text-[28px] font-semibold leading-tight">Bem-vindo ao Painel RC House</h1></div>' +
      '<p id="heroSummary" class="text-[13px] sm:text-sm text-black/60 font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5"></p>' +
      '</header>' +

      /* Indicadores */
      '<section id="statsRow" class="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"></section>' +
      '<p id="statsNote" class="mt-1.5 px-1 text-[11px] text-black/45 font-medium"></p>' +

      /* Calendário + detalhes do dia (os detalhes passam para o painel direito em ecrãs ≥ 1280px) */
      '<section class="dash-main mt-3 grid grid-cols-1">' +
      '<div class="card cal-card p-4 sm:p-5 min-w-0" id="calendarCard"></div>' +
      '</section>';

    renderMonthParts();
  }

  function renderMonthParts() {
    var y = state.calY, m = state.calM;
    var s = monthStats(y, m);
    var mesNome = U.MESES[m].charAt(0).toUpperCase() + U.MESES[m].slice(1);

    var hs = $('#heroSummary');
    if (hs) {
      hs.innerHTML = '<span class="text-gold-deep font-bold">' + mesNome + ':</span>' +
        '<span class="inline-flex items-center gap-1.5"><span class="dot" style="background:#10B981"></span>' + s.confirmed + ' evento' + (s.confirmed === 1 ? '' : 's') + ' confirmado' + (s.confirmed === 1 ? '' : 's') + '</span>' +
        '<span class="text-black/25">•</span>' +
        '<span class="inline-flex items-center gap-1.5"><span class="dot" style="background:#F59E0B"></span>' + s.pending + ' aguardando assinatura</span>';
    }

    var sr = $('#statsRow');
    if (sr) {
      var stat = function (ic, label, value, tone) {
        return '<div class="card px-3.5 py-3 sm:px-4 flex items-center gap-3 min-w-0">' +
          '<span class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hidden xs:grid lg:hidden 2xl:grid place-items-center shrink-0 ' + tone + '">' + icon(ic, 'w-5 h-5') + '</span>' +
          '<div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-wider text-black/45 leading-tight" title="' + label + '">' + label + '</div>' +
          '<div class="text-[17px] sm:text-xl lg:text-lg 2xl:text-xl font-extrabold tracking-tight leading-tight whitespace-nowrap">' + value + '</div></div></div>';
      };
      var brl = function (c) { return '<span class="text-xs font-bold text-black/40 mr-0.5">R$</span>' + U.formatBRL(c, false); };
      sr.innerHTML =
        stat('calendar-check', 'Confirmados', s.confirmed, 'bg-ok/12 text-ok') +
        stat('hourglass', 'Aguardando assinatura', s.pending, 'bg-wait/15 text-wait') +
        stat('banknote', 'Recebido', brl(s.received), 'bg-gold/15 text-gold-deep') +
        stat('hand-coins', 'A receber', brl(s.receivable), 'bg-obsidian/5 text-obsidian');
      var sn = $('#statsNote');
      if (sn) sn.textContent = 'Valores das reservas com evento em ' + U.MESES[m] + ' de ' + y + ' (sinal + pagamentos registados; canceladas não entram).';
    }

    renderCalendar();
    renderRightPanel();
  }

  function renderCalendar() {
    var card = $('#calendarCard'); if (!card) return;
    var y = state.calY, m = state.calM;
    var first = new Date(y, m, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var today = U.todayISO();
    var mesNome = U.MESES[m].charAt(0).toUpperCase() + U.MESES[m].slice(1);

    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div aria-hidden="true"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = y + '-' + U.pad(m + 1) + '-' + U.pad(d);
      var list = Store.byDate(iso);
      var active = list.find(function (b) { return b.status !== 'cancelled'; });
      var hasCancelled = list.some(function (b) { return b.status === 'cancelled'; });
      // Estados independentes que coexistem: situação (fundo suave + etiqueta com ícone e texto), hoje (marcador), selecionado (borda)
      var cls = 'cal-day';
      if (active) cls += active.status === 'confirmed' ? ' is-confirmed' : ' is-pending';
      else cls += ' is-free';
      if (iso < today) cls += ' is-past';
      if (iso === today) cls += ' is-today';
      if (iso === state.selectedDate) cls += ' is-selected';
      var title = U.formatLong(iso) + (iso === today ? ' (hoje)' : '') +
        (active ? ' — ' + STATUS[active.status].label + ' — ' + ((active.locatario && active.locatario.nome) || '') : hasCancelled ? ' — Livre (reserva cancelada)' : ' — Livre');
      var tag = active ? '<span class="cal-tag">' + icon(active.status === 'confirmed' ? 'circle-check' : 'hourglass', 'w-3 h-3 shrink-0') +
        '<span class="cal-tag-t">' + (active.status === 'confirmed' ? 'Confirmado' : 'Aguardando') + '</span>' +
        '<span class="cal-tag-s">' + (active.status === 'confirmed' ? 'Conf.' : 'Aguard.') + '</span></span>' +
        '<span class="cal-name">' + e(U.firstName(active.locatario && active.locatario.nome)) + '</span>' : '';
      cells += '<button type="button" class="' + cls + '" data-action="select-day" data-date="' + iso + '" title="' + e(title) + '" aria-label="' + e(title) + '"' + (iso === state.selectedDate ? ' aria-pressed="true"' : '') + '>' +
        (iso === today ? '<span class="cal-today" aria-hidden="true">Hoje</span>' : '') +
        '<span class="cal-num">' + d + '</span>' + tag +
        (hasCancelled && !active ? '<span class="cal-x" aria-hidden="true">' + icon('ban', 'w-3 h-3') + '</span>' : '') + '</button>';
    }
    // completa a última semana para manter a grelha regular
    var total = startDow + daysInMonth;
    for (var k = total; k % 7 !== 0; k++) cells += '<div aria-hidden="true"></div>';

    card.innerHTML =
      '<div class="flex items-center justify-between gap-3">' +
      '<h2 class="section-title !text-[20px]">' + mesNome + ' <span class="text-black/35">' + y + '</span></h2>' +
      '<div class="flex items-center gap-1.5">' +
      '<button type="button" class="btn-light !h-9 !px-3 text-xs" data-action="cal-today">Hoje</button>' +
      '<button type="button" class="btn-light !h-9 !w-9 !px-0" data-action="cal-prev" aria-label="Mês anterior">' + icon('chevron-left', 'w-5 h-5') + '</button>' +
      '<button type="button" class="btn-light !h-9 !w-9 !px-0" data-action="cal-next" aria-label="Próximo mês">' + icon('chevron-right', 'w-5 h-5') + '</button>' +
      '</div></div>' +
      '<div class="mt-3 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-black/35 uppercase">' +
      U.DIAS_CURTOS.map(function (dd) { return '<div>' + dd + '</div>'; }).join('') + '</div>' +
      '<div class="cal-grid mt-1.5 grid grid-cols-7 gap-1.5 rounded-2xl bg-mist p-1.5" id="calGrid">' + cells + '</div>' +
      '<div class="cal-legend mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] font-semibold text-black/60">' +
      '<span class="inline-flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-[5px] bg-white border border-black/15"></span>Livre</span>' +
      '<span class="inline-flex items-center gap-1.5"><span class="lg-tag is-pending">' + icon('hourglass', 'w-3 h-3') + '</span>Aguardando assinatura</span>' +
      '<span class="inline-flex items-center gap-1.5"><span class="lg-tag is-confirmed">' + icon('circle-check', 'w-3 h-3') + '</span>Confirmado</span>' +
      '<span class="inline-flex items-center gap-1.5"><span class="text-bad">' + icon('ban', 'w-3.5 h-3.5') + '</span>Cancelado</span>' +
      '<span class="inline-flex items-center gap-1.5"><span class="text-[9px] font-extrabold tracking-wider text-gold-deep border-b-2 border-gold leading-none pb-px">HOJE</span>Hoje</span>' +
      '<span class="inline-flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-[5px] bg-white ring-2 ring-obsidian"></span>Selecionado</span>' +
      '</div>';

    // Swipe para mudar de mês no telemóvel
    var grid = $('#calGrid'), sx = null;
    grid.addEventListener('touchstart', function (ev) { sx = ev.touches[0].clientX; }, { passive: true });
    grid.addEventListener('touchend', function (ev) {
      if (sx === null) return;
      var dx = ev.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
    });
  }

  /* ---------- Popover do dia (dia livre ou com mais de uma reserva) ---------- */
  function closeDayPopover() {
    var pop = document.getElementById('dayPop'); if (pop) pop.remove();
  }

  function openDayPopover(iso, anchor) {
    closeDayPopover();
    var list = Store.byDate(iso);
    var active = list.find(function (b) { return b.status !== 'cancelled'; });
    var past = iso < U.todayISO();
    var pop = document.createElement('div');
    pop.id = 'dayPop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Opções para ' + U.formatLong(iso));
    pop.className = 'fixed z-[70] w-[264px] max-w-[calc(100vw-24px)] bg-white rounded-2xl border border-black/[.06] shadow-lift p-3 pop-in';
    pop.innerHTML =
      '<div class="flex items-start justify-between gap-2 px-1">' +
      '<div class="min-w-0"><div class="kicker">' + e(U.relativeDay(iso)) + '</div>' +
      '<div class="text-sm font-bold first-letter:uppercase leading-snug">' + e(U.formatLong(iso)) + '</div></div>' +
      '<button type="button" data-action="close-pop" class="w-8 h-8 -mr-1 rounded-full hover:bg-mist grid place-items-center text-black/50 shrink-0" aria-label="Fechar">' + icon('x', 'w-4 h-4') + '</button></div>' +
      (list.length ? '<div class="mt-2 space-y-1">' + (list.length > 1 ? '<div class="px-1 text-[11px] font-bold uppercase tracking-wider text-black/40">' + list.length + ' reservas neste dia</div>' : '') +
        list.map(function (b) {
          return '<button type="button" data-action="open-booking" data-id="' + b.id + '" class="w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-mist">' +
            '<span class="min-w-0"><span class="block text-sm font-semibold truncate' + (b.status === 'cancelled' ? ' line-through text-black/45' : '') + '">' + e(b.locatario.nome || 'Sem nome') + '</span>' +
            '<span class="block text-[11px] text-black/50 truncate">' + e(b.evento || '') + ' · ' + e(b.entrada || '') + '–' + e(b.saida || '') + '</span></span>' +
            statusBadge(b.status) + '</button>';
        }).join('') + '</div>' : '') +
      (active ? '' :
        (list.length ? '' : '<p class="mt-1 px-1 text-xs text-black/55">' + (past ? 'Dia livre (data já passou).' : 'Dia livre — disponível para reserva.') + '</p>') +
        '<a href="#/novo/' + iso + '" class="btn-gold w-full mt-2.5 !h-10">' + icon('calendar-plus', 'w-4 h-4') + 'Agendar nesta data</a>');
    document.body.appendChild(pop);
    hydrateIcons(pop);
    // posiciona junto ao dia, sem sair do ecrã
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, vw = innerWidth, vh = innerHeight, m = 12;
    var left = Math.min(Math.max(m, r.left + r.width / 2 - pw / 2), vw - pw - m);
    var top = r.bottom + 8;
    if (top + ph > vh - m) top = r.top - ph - 8;
    if (top < m) top = Math.max(m, Math.min(vh - ph - m, r.top));
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    var first = pop.querySelector('[data-action="open-booking"], a'); if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', function (ev) {
    var pop = document.getElementById('dayPop');
    if (pop && !pop.contains(ev.target) && !ev.target.closest('[data-action="select-day"]')) closeDayPopover();
  });
  window.addEventListener('resize', closeDayPopover);
  window.addEventListener('scroll', closeDayPopover, true);

  function shiftMonth(delta) {
    closeDayPopover();
    var d = new Date(state.calY, state.calM + delta, 1);
    state.calY = d.getFullYear(); state.calM = d.getMonth();
    renderMonthParts();
  }

  /* =====================================================================
     VIEW: Reservas — lista em linhas + filtros combináveis
     ===================================================================== */
  /* Um único filtro, com as visões mais usadas */
  var FILTERS = [
    ['upcoming', 'Próximas'],
    ['pending', 'Aguardando'],
    ['debt', 'A receber'],
    ['past', 'Realizadas'],
    ['cancelled', 'Canceladas'],
    ['all', 'Todas']
  ];

  function matchFilter(b, val) {
    var today = U.todayISO(), active = b.status !== 'cancelled';
    if (val === 'upcoming') return active && b.data >= today;
    if (val === 'pending') return b.status === 'pending';
    if (val === 'debt') return active && finance(b).pendente > 0;
    if (val === 'past') return active && b.data < today;
    if (val === 'cancelled') return !active;
    return true;
  }

  function matchSearch(b) {
    var q = U.slug(state.search).replace(/-/g, ' ').trim();
    var qd = U.onlyDigits(state.search);
    if (!q && !qd) return true;
    var hay = U.slug([b.locatario.nome, b.evento, b.locatario.rg].join(' ')).replace(/-/g, ' ');
    var digits = U.onlyDigits([b.locatario.cpf, b.locatario.fone, b.data].join(''));
    return (q && hay.indexOf(q) >= 0) || (qd.length >= 3 && digits.indexOf(qd) >= 0) || (!!qd && String(b.numero || '') === qd);
  }

  function filteredBookings() {
    return Store.all().filter(function (b) { return matchSearch(b) && matchFilter(b, state.filter); });
  }

  function renderReservas(view) {
    view.innerHTML =
      '<div class="flex items-end justify-between gap-3">' +
      '<div><div class="kicker">Gestão</div><h1 class="font-display text-[28px] font-semibold leading-tight">Reservas</h1></div>' +
      '</div>' +
      '<div class="mt-4 relative">' +
      '<span class="absolute left-4 top-1/2 -translate-y-1/2 text-black/35">' + icon('search', 'w-5 h-5') + '</span>' +
      '<input id="searchInput" type="search" class="input !h-12 !pl-12 !bg-white shadow-soft" placeholder="Buscar por nº, cliente, CPF, telefone ou evento…" value="' + e(state.search) + '">' +
      '</div>' +
      '<div id="filterBar" class="mt-3"></div>' +
      '<div id="resList" class="res-list mt-4"></div>';
    renderFilterBar();
    renderResList();
    $('#searchInput').addEventListener('input', U.debounce(function (ev) { state.search = ev.target.value; renderFilterBar(); renderResList(); }, 120));
  }

  function renderFilterBar() {
    var box = $('#filterBar'); if (!box) return;
    var base = Store.all().filter(matchSearch); // contagens respeitam a busca
    box.innerHTML = '<div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Filtrar reservas">' +
      FILTERS.map(function (o) {
        var c = base.filter(function (b) { return matchFilter(b, o[0]); }).length;
        var on = state.filter === o[0];
        return '<button type="button" data-action="set-filter" data-value="' + o[0] + '" aria-pressed="' + on + '" class="seg-btn shrink-0' + (on ? ' is-active' : '') + '">' +
          o[1] + '<span class="seg-count">' + c + '</span></button>';
      }).join('') + '</div>';
  }

  function payBadge(b) {
    if (b.status === 'cancelled') return '<span class="text-xs font-semibold text-black/35">— sem cobrança</span>';
    var f = finance(b), v = b.valores || {};
    if (!(v.total > 0)) return '<span class="text-xs font-semibold text-black/35">Sem valor</span>';
    if (f.quitado) return '<span class="badge bg-ok/15 text-[#047857]">' + icon('circle-check', 'w-3.5 h-3.5') + 'Quitado</span>';
    return '<span class="badge bg-wait/15 text-[#B45309]">' + icon('clock', 'w-3.5 h-3.5') + 'Falta ' + U.formatBRL(f.pendente) + '</span>';
  }

  function resRowHTML(b) {
    var v = b.valores || {};
    var d = U.parseISO(b.data);
    var dia = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];
    var sel = state.selectedId === b.id;
    return '<button type="button" data-action="open-booking" data-id="' + b.id + '" class="res-row' + (sel ? ' is-selected' : '') + (b.status === 'cancelled' ? ' is-cancelled' : '') + '"' + (sel ? ' aria-current="true"' : '') + '>' +
      '<span class="rr-client"><img src="assets/img/thumbs/' + photoFor(b) + '.jpg" alt="" loading="lazy" class="w-10 h-10 rounded-xl object-cover shrink-0">' +
      '<span class="min-w-0"><span class="rr-name' + (b.locatario && b.locatario.nome ? '' : ' text-black/45') + '">' + e(nomeLocatario(b)) + '</span>' +
      '<span class="rr-sub">' + (b.numero ? 'Nº ' + b.numero + ' · ' : '') + e(b.evento || 'Evento') + '</span></span></span>' +
      '<span class="rr-date"><span class="rr-strong">' + dia + ', ' + e(U.formatBR(b.data)) + '</span>' +
      '<span class="rr-sub">' + e(b.entrada || '--:--') + '–' + e(b.saida || '--:--') + ' · ' + e(U.relativeDay(b.data)) + '</span></span>' +
      '<span class="rr-status">' + statusBadge(b.status) + ((preench(b) === 'aguardando' || preench(b) === 'recebido') && b.status !== 'cancelled' ? ' <span class="' + PREENCH[preench(b)].badge + '">' + icon(PREENCH[preench(b)].icon, 'w-3.5 h-3.5') + PREENCH[preench(b)].short + '</span>' : '') + '</span>' +
      '<span class="rr-total"><span class="rr-lbl">Total</span>' + U.formatBRL(v.total) + '</span>' +
      '<span class="rr-pay">' + payBadge(b) + '</span>' +
      '</button>';
  }

  function renderResList() {
    var box = $('#resList'); if (!box) return;
    var list = filteredBookings();
    if (state.filter === 'past' || state.filter === 'cancelled') list = list.reverse();
    if (!list.length) {
      box.innerHTML = '<div class="card p-5 flex items-start gap-3">' +
        '<span class="w-10 h-10 rounded-xl bg-mist text-black/45 grid place-items-center shrink-0">' + icon('search', 'w-5 h-5') + '</span>' +
        '<div><h3 class="font-semibold">Nenhuma reserva encontrada</h3>' +
        '<p class="text-sm text-black/50 mt-0.5">Nenhuma reserva em "' + e((FILTERS.find(function (f) { return f[0] === state.filter; }) || [0, 'Todas'])[1]) + '"' + (state.search ? ' para esta busca' : '') + '.</p>' +
        ((state.filter !== 'all' || state.search) ? '<button type="button" data-action="clear-filters" class="btn-light !h-9 mt-3 !text-xs">' + icon('x', 'w-3.5 h-3.5') + 'Ver todas</button>' : '') +
        '</div></div>';
      return;
    }
    var groups = [], idx = {};
    list.forEach(function (b) {
      var d = U.parseISO(b.data);
      var k = U.MESES[d.getMonth()] + ' ' + d.getFullYear();
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ k: k, items: [] }); }
      groups[idx[k]].items.push(b);
    });
    box.innerHTML = '<div class="res-table">' +
      '<div class="res-head" aria-hidden="true"><span>Cliente / evento</span><span>Data e horário</span><span><span class="rh-full">Situação</span><span class="rh-mid">Situação / pagamento</span></span><span class="text-right">Valor total</span><span class="rh-pay">Pagamento</span></div>' +
      groups.map(function (g) {
        return '<div class="res-group">' + g.k + '</div>' + g.items.map(resRowHTML).join('');
      }).join('') + '</div>';
  }

  /* =====================================================================
     Detalhes da reserva — componente único (painel direito no desktop,
     gaveta no celular): resumo → contrato/WhatsApp → financeiro → ações
     ===================================================================== */
  function detailHTML(b, inPanel) {
    var v = b.valores || {};
    var lt = b.locatario || {};
    var fin = finance(b);
    var d = U.parseISO(b.data);
    var pays = (b.pagamentos || []).slice().sort(function (x, y) { return x.data < y.data ? -1 : x.data > y.data ? 1 : 0; });
    var sigText = b.status === 'confirmed' ? 'Assinado' + (b.signedAt ? ' em ' + U.formatBR(b.signedAt.slice(0, 10)) : '') :
      b.status === 'pending' ? 'Aguardando assinatura do cliente' : 'Cancelada' + (b.cancelledAt ? ' em ' + U.formatBR(b.cancelledAt.slice(0, 10)) : '');
    var cancelled = b.status === 'cancelled';

    /* 1. Resumo */
    var html =
      '<div class="relative shrink-0 bg-obsidian text-white px-5 pb-5 ' + (inPanel ? 'pt-5' : 'pt-7 rounded-t-[28px]') + '">' +
      (inPanel ? '' : '<div class="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-white/30"></div>') +
      '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">' + statusBadge(b.status).replace('badge-', 'badge !bg-white/90 badge-') +
      (b.numero ? '<span class="text-xs text-gold font-bold">Nº ' + b.numero + '</span>' : '') +
      '<span class="text-xs text-white/60 font-medium">' + e(sigText) + '</span></div>' +
      (inPanel ?
        '<button type="button" data-action="close-panel" class="h-9 pl-3 pr-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 shrink-0" aria-label="Fechar detalhes">Fechar' + icon('x', 'w-4 h-4') + '</button>' :
        '<button type="button" data-action="close-overlay" class="h-9 pl-2.5 pr-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 shrink-0" aria-label="Voltar">' + icon('arrow-left', 'w-4 h-4') + 'Voltar</button>') +
      '</div>' +
      '<div class="mt-2 font-display text-[23px] font-semibold leading-tight break-words">' + e(nomeLocatario(b)) + '</div>' +
      '<div class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-sm text-white/80">' +
      '<span class="text-gold">' + icon('calendar-days', 'w-4 h-4') + '</span><span class="first-letter:uppercase">' + e(U.formatLong(b.data)) + ' <span class="text-white/45">· ' + e(U.relativeDay(b.data)) + '</span></span>' +
      '<span class="text-gold">' + icon('clock', 'w-4 h-4') + '</span><span>' + e(b.entrada || '--:--') + 'h às ' + e(b.saida || '--:--') + 'h</span>' +
      '<span class="text-gold">' + icon('party-popper', 'w-4 h-4') + '</span><span class="break-words">' + e(b.evento || '—') + '</span>' +
      '</div>' +
      (b.status === 'pending' ? '<button type="button" data-action="mark-signed" data-id="' + b.id + '" class="btn-ok w-full mt-4">' + icon('circle-check', 'w-5 h-5') + 'Marcar como "Contrato Assinado"</button>' : '') +
      '</div>' +

      '<div class="p-5 space-y-4">' +

      /* 2. Contrato e contacto */
      '<div class="grid grid-cols-2 gap-2">' +
      '<button type="button" data-action="open-contract" data-id="' + b.id + '" class="btn-dark btn-lg !text-sm">' + icon('file-text', 'w-5 h-5') + 'Ver contrato</button>' +
      '<button type="button" data-action="share-wa" data-id="' + b.id + '" class="btn-wa btn-lg !text-sm">' + icon('message-circle', 'w-5 h-5') + 'WhatsApp</button>' +
      '</div>' +

      /* 2b. Dados do locatário por link */
      fillSectionHTML(b) +

      /* 3. Financeiro */
      '<section class="rounded-2xl bg-obsidian text-white p-4" aria-label="Financeiro">' +
      '<div class="flex items-center justify-between gap-2"><div class="text-[11px] font-bold uppercase tracking-wider text-white/45">Financeiro</div>' +
      (fin.quitado ? '<span class="badge bg-ok/20 text-ok">' + icon('circle-check', 'w-3.5 h-3.5') + '100% pago</span>' : '<span class="text-[11px] text-gold font-bold">' + fin.pct + '% pago</span>') + '</div>' +
      '<div class="mt-1 flex items-baseline justify-between gap-2"><span class="text-xs text-white/50 font-semibold">Valor total</span><span class="text-[26px] font-extrabold tracking-tight">' + U.formatBRL(v.total) + '</span></div>' +
      '<div class="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + fin.pct + '"><div class="h-full rounded-full ' + (fin.quitado ? 'bg-ok' : 'bg-gradient-to-r from-gold to-[#F3D77A]') + '" style="width:' + fin.pct + '%"></div></div>' +
      '<div class="mt-3 grid grid-cols-2 gap-2 text-sm">' +
      '<div class="rounded-xl bg-white/[.06] p-3"><div class="text-[11px] text-white/50 font-semibold">Total recebido</div><div class="font-bold text-ok">' + U.formatBRL(fin.recebido) + '</div></div>' +
      '<div class="rounded-xl bg-white/[.06] p-3"><div class="text-[11px] text-white/50 font-semibold">Saldo a receber</div>' +
      (fin.quitado ? '<div class="font-bold text-ok">Quitado ✓</div>' : '<div class="font-bold text-wait">' + U.formatBRL(fin.pendente) + '</div>') + '</div>' +
      '</div>' +
      /* histórico */
      '<div class="mt-3"><div class="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1.5">Histórico de pagamentos</div><div class="space-y-1.5">' +
      ((v.sinal || 0) > 0 ? '<div class="flex items-center gap-3 rounded-xl bg-white/[.06] px-3 py-2">' +
        '<span class="w-7 h-7 rounded-lg bg-gold/20 text-gold grid place-items-center shrink-0">' + icon('key-round', 'w-4 h-4') + '</span>' +
        '<span class="min-w-0 flex-1"><span class="block text-sm font-bold">' + U.formatBRL(v.sinal) + '</span>' +
        '<span class="block text-[11px] text-white/55">Sinal de reserva (arras) · pago no ato' + (b.createdAt ? ' · ' + e(U.formatBR(b.createdAt.slice(0, 10))) : '') + '</span></span></div>' : '') +
      pays.map(function (x) {
        return '<div class="flex items-center gap-3 rounded-xl bg-white/[.06] px-3 py-2">' +
          '<span class="w-7 h-7 rounded-lg bg-ok/20 text-ok grid place-items-center shrink-0">' + icon('circle-check', 'w-4 h-4') + '</span>' +
          '<span class="min-w-0 flex-1"><span class="block text-sm font-bold">' + U.formatBRL(x.valor) + '</span>' +
          '<span class="block text-[11px] text-white/55 truncate">' + e(U.formatBR(x.data)) + (x.forma ? ' · ' + e(x.forma) : '') + (x.obs ? ' · ' + e(x.obs) : '') + '</span></span>' +
          '<button type="button" data-action="del-payment" data-id="' + b.id + '" data-pid="' + x.id + '" class="w-8 h-8 rounded-lg hover:bg-white/10 text-white/45 hover:text-bad grid place-items-center shrink-0" aria-label="Apagar pagamento">' + icon('trash', 'w-4 h-4') + '</button></div>';
      }).join('') +
      (!(v.sinal > 0) && !pays.length ? '<p class="text-xs text-white/45 px-1">Nenhum pagamento registrado.</p>' : '') +
      '</div></div>' +
      (cancelled ? '' : fin.pendente > 0 ?
        '<button type="button" data-action="add-payment" data-id="' + b.id + '" class="btn-gold w-full mt-3">' + icon('hand-coins', 'w-5 h-5') + 'Registrar pagamento</button>' :
        fin.quitado ? '<div class="mt-3 flex items-center gap-2 rounded-xl bg-ok/15 border border-ok/30 px-3 py-2.5 text-sm font-bold text-ok">' + icon('badge-check', 'w-5 h-5') + 'Saldo quitado — nada a receber</div>' : '') +
      '<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 font-medium">' +
      ((v.caucao || 0) > 0 ? '<span>Caução: <b class="text-white/80">' + U.formatBRL(v.caucao) + '</b></span>' : '') +
      '<span>Hora excedente: <b class="text-white/80">' + U.formatBRL(v.taxaHora) + '</b></span></div>' +
      (v.chavePix ? '<button type="button" data-action="copy-pix" data-pix="' + e(v.chavePix) + '" class="mt-3 w-full flex items-center justify-between gap-2 rounded-xl bg-gold/10 border border-gold/25 px-3 py-2.5 text-left"><span class="min-w-0"><span class="block text-[11px] text-gold font-bold">Chave Pix</span><span class="block text-sm font-semibold truncate">' + e(v.chavePix) + '</span></span>' + icon('copy', 'w-4 h-4 text-gold shrink-0') + '</button>' : '') +
      '</section>' +

      /* 4. Ações */
      '<a href="#/editar/' + b.id + '" class="btn-light w-full">' + icon('pencil', 'w-4 h-4') + 'Editar reserva</a>' +
      '<div class="rounded-2xl border border-dashed border-bad/25 p-3">' +
      '<div class="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-2 px-1">Ações que alteram a reserva</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
      (b.status === 'confirmed' ? '<button type="button" data-action="mark-pending" data-id="' + b.id + '" class="btn-ghost !h-10 !text-xs text-black/60 col-span-2">' + icon('undo-2', 'w-4 h-4') + 'Voltar a "Aguardando"</button>' : '') +
      (cancelled ?
        '<button type="button" data-action="reactivate" data-id="' + b.id + '" class="btn-light !h-10 !text-xs">' + icon('rotate-ccw', 'w-4 h-4') + 'Reativar</button>' :
        '<button type="button" data-action="cancel-booking" data-id="' + b.id + '" class="btn-danger !h-10 !text-xs">' + icon('ban', 'w-4 h-4') + 'Cancelar reserva</button>') +
      '<button type="button" data-action="delete-booking" data-id="' + b.id + '" class="btn-ghost !h-10 !text-xs text-bad">' + icon('trash', 'w-4 h-4') + 'Excluir</button>' +
      '</div></div>' +
      '</div>';
    return html;
  }

  /* ---------- Preenchimento pelo locatário: acompanhamento na reserva ---------- */
  function fillStepsHTML(b) {
    var st = preench(b), steps = (st === 'aguardando' || st === 'assinado') ? [
      ['Link enviado', true],
      ['Dados e assinatura', st === 'assinado'],
      ['Contrato concluído', st === 'assinado' && b.status === 'confirmed']
    ] : [
      ['Aguardando preenchimento', true],
      ['Dados recebidos', st === 'recebido' || st === 'concluido'],
      ['Revisados', st === 'concluido'],
      ['Contrato concluído', st === 'concluido' && b.status === 'confirmed']
    ];
    return '<ol class="mt-3 grid ' + (steps.length === 3 ? 'grid-cols-3' : 'grid-cols-4') + ' gap-1.5" aria-label="Andamento">' + steps.map(function (s, i) {
      var cur = !s[1] && (i === 0 || steps[i - 1][1]);
      return '<li class="min-w-0"><div class="h-1.5 rounded-full ' + (s[1] ? 'bg-ok' : cur ? 'bg-wait' : 'bg-black/10') + '"></div>' +
        '<div class="mt-1 text-[10px] leading-tight font-bold ' + (s[1] ? 'text-[#047857]' : cur ? 'text-[#B45309]' : 'text-black/40') + '">' + s[0] + '</div></li>';
    }).join('') + '</ol>';
  }

  function fillSectionHTML(b) {
    var st = preench(b), lt = b.locatario || {}, p = b.preenchimento || {};
    if (b.status === 'cancelled') return '';
    var missing = !lt.cpf || !lt.rg || !lt.fone;
    if (!st) return missing ? '<button type="button" data-action="fill-start" data-id="' + b.id + '" class="btn-light w-full !h-11 !text-sm">' + icon('send', 'w-4 h-4') + 'Pedir os dados ao locatário por link</button>' : '';
    var when = function (iso) { return iso ? U.formatBR(iso.slice(0, 10)) + ' às ' + new Date(iso).toTimeString().slice(0, 5) : ''; };
    var head = function (tone, ic, title, sub) {
      return '<div class="flex items-start gap-3"><span class="w-10 h-10 rounded-xl grid place-items-center shrink-0 ' + tone + '">' + icon(ic, 'w-5 h-5') + '</span>' +
        '<div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-wider text-black/45">Dados do locatário</div>' +
        '<div class="font-bold leading-tight">' + title + '</div>' + (sub ? '<div class="text-xs text-black/50 mt-0.5">' + sub + '</div>' : '') + '</div></div>';
    };
    if (st === 'aguardando') {
      var s = Sync.status(), notLive = s.on && (s.pending > 0 || s.state !== 'ok');
      return '<section class="rounded-2xl border border-wait/30 bg-wait/10 p-4" aria-label="Dados do locatário">' +
        head('bg-wait/15 text-[#B45309]', 'send', 'Aguardando o locatário assinar', p.enviadoEm ? 'Link criado em ' + when(p.enviadoEm) : '') +
        fillStepsHTML(b) +
        (notLive ? '<p data-fill-notlive class="mt-3 text-xs font-semibold text-[#B45309]">' + icon('cloud-off', 'w-3.5 h-3.5 inline -mt-0.5') + ' O link começa a funcionar assim que o app sincronizar com a planilha.</p>' : '') +
        '<div class="grid grid-cols-2 gap-2 mt-3">' +
        '<button type="button" data-action="fill-copy" data-id="' + b.id + '" class="btn-light !h-10 !text-xs">' + icon('copy', 'w-4 h-4') + 'Copiar link</button>' +
        '<button type="button" data-action="fill-wa" data-id="' + b.id + '" class="btn-wa !h-10 !text-xs">' + icon('message-circle', 'w-4 h-4') + 'Enviar no WhatsApp</button>' +
        '<button type="button" data-action="fill-new" data-id="' + b.id + '" class="btn-ghost !h-9 !text-xs text-black/60">' + icon('refresh-cw', 'w-4 h-4') + 'Gerar novo link</button>' +
        '<button type="button" data-action="fill-cancel" data-id="' + b.id + '" class="btn-ghost !h-9 !text-xs text-black/60">' + icon('x', 'w-4 h-4') + 'Cancelar link</button>' +
        '</div></section>';
    }
    var rows = [['Nome', lt.nome], ['CPF', lt.cpf], ['RG', lt.rg], ['Telefone', lt.fone]].map(function (r) {
      return '<div class="flex items-baseline justify-between gap-3 py-1.5 border-b border-black/[.06] last:border-0"><span class="text-xs text-black/50 font-semibold shrink-0">' + r[0] + '</span><span class="text-sm font-semibold text-right break-words min-w-0">' + (r[1] ? e(r[1]) : '<span class="text-bad">não informado</span>') + '</span></div>';
    }).join('');
    if (st === 'assinado') {
      var sg = b.assinaturaLocatario || {};
      return '<section class="rounded-2xl border border-ok/30 bg-ok/10 p-4" aria-label="Contrato assinado">' +
        head('bg-ok/15 text-ok', 'badge-check', 'Contrato assinado pelo locatário', sg.em ? 'Em ' + when(sg.em) + (sg.codigo ? ' · código ' + e(sg.codigo) : '') : '') +
        fillStepsHTML(b) +
        (sg.img ? '<div class="mt-3 rounded-xl bg-white px-3 py-2 text-center"><img class="sig-thumb mx-auto" src="' + e(sg.img) + '" alt="Assinatura de ' + e(lt.nome || 'locatário') + '"><div class="text-[11px] text-black/45 border-t border-black/10 mt-1 pt-1">' + e(lt.nome || '') + '</div></div>' : '') +
        '<div class="mt-2 rounded-xl bg-white px-3 py-1">' + rows + '</div>' +
        '<div class="grid grid-cols-2 gap-2 mt-3">' +
        '<button type="button" data-action="open-contract" data-id="' + b.id + '" class="btn-dark !h-10 !text-xs">' + icon('file-text', 'w-4 h-4') + 'Ver contrato</button>' +
        '<button type="button" data-action="download-pdf" data-id="' + b.id + '" class="btn-light !h-10 !text-xs">' + icon('download', 'w-4 h-4') + 'Baixar PDF</button>' +
        '</div>' +
        '<p class="mt-2 text-[11px] text-black/50">Assinatura eletrônica feita pelo locatário no link. Se alterar dados do contrato, será preciso assinar de novo.</p>' +
        '</section>';
    }
    if (st === 'recebido') {
      return '<section class="rounded-2xl border border-gold/30 bg-gold/10 p-4" aria-label="Dados do locatário">' +
        head('bg-gold/20 text-gold-deep', 'badge-check', 'Dados recebidos — revise', p.recebidoEm ? 'Enviados pelo locatário em ' + when(p.recebidoEm) : '') +
        fillStepsHTML(b) +
        '<div class="mt-3 rounded-xl bg-white px-3 py-1">' + rows + '</div>' +
        '<p class="mt-2 text-[11px] text-black/50">Os dados já estão no contrato. O envio pelo locatário não é uma assinatura.</p>' +
        '<button type="button" data-action="fill-done" data-id="' + b.id + '" class="btn-ok w-full mt-3 !h-11 !text-sm">' + icon('circle-check', 'w-5 h-5') + 'Marcar como revisado</button>' +
        '<div class="grid grid-cols-2 gap-2 mt-2">' +
        '<a href="#/editar/' + b.id + '" class="btn-light !h-10 !text-xs">' + icon('pencil', 'w-4 h-4') + 'Corrigir dados</a>' +
        '<button type="button" data-action="fill-reopen" data-id="' + b.id + '" class="btn-ghost !h-10 !text-xs text-black/60">' + icon('rotate-ccw', 'w-4 h-4') + 'Reabrir link</button>' +
        '</div></section>';
    }
    return '<section class="rounded-2xl border border-black/[.06] p-4" aria-label="Dados do locatário">' +
      head('bg-ok/10 text-ok', 'circle-check', b.status === 'confirmed' ? 'Contrato concluído' : 'Dados revisados', b.status === 'confirmed' ? 'Dados do locatário revisados e contrato assinado.' : 'Falta o contrato assinado.') +
      fillStepsHTML(b) + '</section>';
  }

  function waFillMessage(b) {
    var nome = U.firstName(b.locatario && b.locatario.nome);
    return 'Olá' + (nome ? ', ' + nome : '') + '! 😊\n\n' +
      'Para prepararmos o contrato da sua reserva na *RC House Espaço de Eventos* (' + U.formatBR(b.data) + (b.evento ? ' · ' + b.evento : '') + '), preencha seus dados e assine o contrato por este link (você vê o contrato antes de assinar):\n\n' +
      fillLink(b) + '\n\nLeva menos de 2 minutos. Qualquer dúvida, estou à disposição!';
  }
  function copyText(text, input) {
    var ok = function () { toast('Link copiado', 'ok'); };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, function () { toast(text, 'info'); });
    if (input) { input.select(); try { document.execCommand('copy'); ok(); return; } catch (x) { } }
    toast(text, 'info');
  }
  function fillWhatsApp(b) {
    var d = U.onlyDigits(b.locatario && b.locatario.fone);
    window.open((d.length >= 10 ? 'https://wa.me/55' + d : 'https://wa.me/') + '?text=' + encodeURIComponent(waFillMessage(b)), '_blank', 'noopener');
  }

  /* Diálogo com o link (logo após salvar ou ao gerar um novo) */
  function fillLinkDialog(id, justCreated) {
    var b = Store.get(id); if (!b || preench(b) !== 'aguardando') return;
    var root = $('#dialogRoot'), link = fillLink(b);
    root.innerHTML =
      '<div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">' +
      '<div class="absolute inset-0 bg-obsidian/60 backdrop-blur-sm fade-in" data-fd="close"></div>' +
      '<div class="relative w-full max-w-md card p-6 pop-in" role="dialog" aria-modal="true" aria-labelledby="fdTitle">' +
      '<div class="w-12 h-12 rounded-2xl grid place-items-center mb-4 bg-gold/15 text-gold-deep">' + icon('send', 'w-6 h-6') + '</div>' +
      '<h3 id="fdTitle" class="font-display text-xl font-semibold">' + (justCreated ? 'Reserva salva! Envie o link' : 'Link para o locatário') + '</h3>' +
      '<p class="mt-1 text-sm text-black/60">Envie para ' + e(U.firstName(b.locatario.nome) || 'o locatário') + ' preencher os dados, ver o contrato e assinar pelo celular. O contrato assinado volta sozinho para o app.</p>' +
      '<input id="fdLink" class="input mt-4 !text-xs" readonly value="' + e(link) + '" aria-label="Link de preenchimento">' +
      '<p id="fdState" class="mt-2 text-xs font-semibold min-h-[18px]"></p>' +
      '<div class="mt-4 grid grid-cols-2 gap-2">' +
      '<button type="button" class="btn-light" data-fd="copy">' + icon('copy', 'w-4 h-4') + 'Copiar link</button>' +
      '<button type="button" class="btn-wa" data-fd="wa">' + icon('message-circle', 'w-4 h-4') + 'WhatsApp</button>' +
      '</div>' +
      '<button type="button" class="btn-ghost w-full mt-2 text-black/60" data-fd="close">Fechar</button>' +
      '</div></div>';
    var stEl = $('#fdState'), inp = $('#fdLink');
    inp.addEventListener('focus', function () { inp.select(); });
    var show = function () {
      var s = Sync.status();
      if (!$('#fdState')) return;
      if (!publicBase()) { stEl.className = 'mt-2 text-xs font-semibold text-bad'; stEl.innerHTML = icon('triangle-alert', 'w-3.5 h-3.5 inline -mt-0.5') + ' Este link é do seu computador e não abre no celular do locatário. Abra o app pelo endereço da Vercel (ou preencha <b>siteUrl</b> em js/config.js) e copie o link de novo.'; return; }
      if (!s.on) { stEl.className = 'mt-2 text-xs font-semibold text-bad'; stEl.textContent = 'A planilha não está ligada: o link só funciona com a planilha.'; return; }
      if (s.state === 'ok' && !s.pending) { stEl.className = 'mt-2 text-xs font-semibold text-[#047857]'; stEl.innerHTML = icon('circle-check', 'w-3.5 h-3.5 inline -mt-0.5') + ' Link ativo — já pode enviar.'; }
      else if (s.state === 'offline' || s.state === 'error') { stEl.className = 'mt-2 text-xs font-semibold text-[#B45309]'; stEl.textContent = 'Sem conexão com a planilha: o link funciona assim que o app sincronizar.'; }
      else { stEl.className = 'mt-2 text-xs font-semibold text-black/50'; stEl.textContent = 'Ativando o link…'; }
    };
    show();
    Sync.now().then(show, show);
    root.onclick = function (ev) {
      var t = ev.target.closest('[data-fd]'); if (!t) return;
      var a = t.getAttribute('data-fd');
      if ((a === 'copy' || a === 'wa') && !publicBase()) { toast('Abra o app pelo endereço da Vercel para gerar um link que funcione', 'error'); return; }
      if (a === 'copy') copyText(link, inp);
      else if (a === 'wa') fillWhatsApp(Store.get(id) || b);
      else { root.innerHTML = ''; root.onclick = null; refreshBooking(id); }
    };
  }

  /* Quadro para desenhar uma assinatura → Promise<dataURL PNG | null> */
  function signatureDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = $('#dialogRoot');
      root.innerHTML =
        '<div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">' +
        '<div class="absolute inset-0 bg-obsidian/60 backdrop-blur-sm fade-in"></div>' +
        '<div class="relative w-full max-w-lg card p-5 sm:p-6 pop-in" role="dialog" aria-modal="true" aria-labelledby="sigTitle">' +
        '<h3 id="sigTitle" class="font-display text-xl font-semibold">' + e(opts.title || 'Sua assinatura') + '</h3>' +
        '<p class="mt-1 text-sm text-black/60">' + (opts.text || 'Assine com o dedo, a caneta ou o rato no quadro abaixo.') + '</p>' +
        '<div class="sig-wrap mt-4"><canvas class="sig-box" id="sigCanvas" aria-label="Quadro de assinatura"></canvas><div class="sig-guide"></div><div class="sig-hint" id="sigHint">Assine aqui</div></div>' +
        '<div class="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">' +
        '<button type="button" class="btn-light" data-sig="cancel">Cancelar</button>' +
        '<div class="flex gap-2"><button type="button" class="btn-ghost text-black/60 flex-1" data-sig="clear">' + icon('rotate-ccw', 'w-4 h-4') + 'Limpar</button>' +
        '<button type="button" class="btn-gold flex-1" data-sig="ok" disabled>' + icon('circle-check', 'w-4 h-4') + (opts.okText || 'Salvar assinatura') + '</button></div>' +
        '</div></div></div>';
      var canvas = $('#sigCanvas'), pad = SignaturePad(canvas), okBtn = $('[data-sig="ok"]', root);
      pad.onChange(function () { var empty = pad.isEmpty(); okBtn.disabled = empty; canvas.classList.toggle('is-signed', !empty); $('#sigHint').hidden = !empty; });
      root.onclick = function (ev) {
        var t = ev.target.closest('[data-sig]'); if (!t) return;
        var a = t.getAttribute('data-sig');
        if (a === 'clear') { pad.clear(); return; }
        var out = a === 'ok' && !pad.isEmpty() ? pad.toDataURL() : null;
        root.innerHTML = ''; root.onclick = null;
        resolve(out);
      };
    });
  }
  /* Garante que a assinatura da locadora existe antes de mandar um contrato para assinar */
  function ensureLocadoraSignature() {
    if (Store.getSettings().assinaturaLocadora) return Promise.resolve(true);
    return signatureDialog({ title: 'Primeiro, a sua assinatura', text: 'O contrato chega ao locatário <b>já assinado por você</b>. Desenhe a sua assinatura uma vez — fica guardada em Ajustes.' })
      .then(function (img) { if (!img) return false; Store.saveSettings({ assinaturaLocadora: img }); toast('Assinatura guardada', 'ok'); return true; });
  }

  function startFill(id, confirmFirst) {
    var go = confirmFirst ? confirmDialog({ title: 'Gerar novo link?', icon: 'refresh-cw', text: 'O link anterior deixa de funcionar. Envie o novo ao locatário.', okText: 'Gerar novo link' }) : Promise.resolve(true);
    go.then(function (ok) { return ok && ensureLocadoraSignature(); }).then(function (ok) {
      if (!ok) return;
      Store.setPreenchimento(id, { status: 'aguardando', token: newToken(), enviadoEm: new Date().toISOString(), recebidoEm: '' });
      refreshBooking(id);
      fillLinkDialog(id, false);
    });
  }

  function openBooking(id) {
    var b = Store.get(id); if (!b) return;
    closeDayPopover();
    state.selectedDate = b.data;
    if (panelActive()) {
      state.selectedId = id;
      renderRightPanel();
      if ($('#calendarCard')) renderCalendar();
      if ($('#resList')) renderResList();
      return;
    }
    openOverlay(
      '<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">' +
      '<div class="absolute inset-0 bg-obsidian/55 backdrop-blur-[2px] fade-in" data-action="close-overlay"></div>' +
      '<div class="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto no-scrollbar bg-white rounded-t-[28px] sm:rounded-[28px] shadow-lift sheet-up pb-safe">' +
      detailHTML(b, false) + '</div></div>'
    );
  }

  function panelTitle(t) {
    return '<div class="flex items-center gap-2 px-1"><span class="w-1 h-4 rounded-full bg-gold"></span><h2 class="text-[11px] font-bold uppercase tracking-[.18em] text-black/50">' + t + '</h2></div>';
  }

  /* Painel direito: fechado por padrão; abre só com uma reserva selecionada (Agenda ou Reservas, desktop ≥ 1280px).
     Fechado, não ocupa espaço: a área principal volta a ter a largura toda. */
  function syncPanelLayout() {
    var open = !!(state.selectedId && (state.view === 'agenda' || state.view === 'reservas') && Store.get(state.selectedId));
    if (!open) state.selectedId = null;
    var app = $('#app');
    app.classList.toggle('has-panel', open);
    app.classList.toggle('panel-wide', open);
    return open;
  }

  function renderRightPanel() {
    var panel = $('#rightPanel'); if (!panel) return;
    var wasOpen = $('#app').classList.contains('has-panel');
    if (!syncPanelLayout()) { panel.innerHTML = ''; return; }
    panel.innerHTML = '<div class="w-full' + (wasOpen ? '' : ' panel-in') + '">' + detailHTML(Store.get(state.selectedId), true) + '</div>';
  }

  /* =====================================================================
     VIEW: Novo / Editar agendamento
     ===================================================================== */
  function blankBooking(dateISO) {
    var s = Store.getSettings();
    return {
      id: null, status: 'pending',
      data: dateISO || '',
      entrada: s.horaEntradaPadrao || '08:00',
      saida: s.horaSaidaPadrao || '22:00',
      evento: '',
      locador: { nome: s.locadorNome, cpf: s.locadorCpf, fone: s.locadorFone },
      locatario: { nome: '', cpf: '', rg: '', fone: '' },
      valores: { total: s.valorDiariaPadrao || 0, sinal: 0, caucao: 0, saldo: s.valorDiariaPadrao || 0, saldoManual: false, chavePix: s.chavePix, taxaHora: s.taxaHoraExcedente || 0 },
      assinatura: { local: s.localAssinatura || 'Uberlândia - MG', data: U.todayISO() }
    };
  }

  function formBlock(n, ic, title, sub, body) {
    return '<section class="card p-5 sm:p-6">' +
      '<div class="flex items-start gap-3 mb-5">' +
      '<span class="w-11 h-11 rounded-2xl bg-obsidian text-gold grid place-items-center shrink-0">' + icon(ic, 'w-5 h-5') + '</span>' +
      '<div><div class="text-[11px] font-bold uppercase tracking-[.16em] text-gold-deep">' + n + '</div><h2 class="font-display text-[20px] font-semibold leading-tight">' + title + '</h2>' +
      (sub ? '<p class="text-xs text-black/45 mt-0.5">' + sub + '</p>' : '') + '</div></div>' + body + '</section>';
  }
  function fld(label, inner, cls) { return '<label class="field ' + (cls || '') + '"><span class="field-label">' + label + '</span>' + inner + '</label>'; }
  function money(name, value, extra) {
    return '<div class="input-prefix"><span>R$</span><input class="input" inputmode="numeric" data-mask="money" name="' + name + '" value="' + (value ? U.formatBRL(value, false) : '') + '" placeholder="0,00" ' + (extra || '') + '></div>';
  }

  function renderForm(view, editId, dateISO) {
    var b = editId ? Store.get(editId) : null;
    if (editId && !b) { location.hash = '#/reservas'; return; }
    var f = b ? JSON.parse(JSON.stringify(b)) : blankBooking(dateISO);
    state.form = f;
    var v = f.valores, lt = f.locatario, lr = f.locador;

    view.innerHTML =
      /* Banner */
      '<section class="relative overflow-hidden rounded-[28px] h-[150px] sm:h-[180px] shadow-lift">' +
      '<img src="assets/img/IMG_0317.jpg" alt="" class="absolute inset-0 w-full h-full object-cover" style="object-position:center 70%">' +
      '<div class="absolute inset-0 bg-gradient-to-r from-[#0D0D10]/92 via-[#0D0D10]/55 to-[#0D0D10]/10"></div>' +
      '<div class="relative h-full flex items-center gap-4 px-5 sm:px-7 text-white">' +
      '<img src="assets/brand/logo-rc-house.png" alt="RC House" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full ring-2 ring-gold/60 shadow-lift">' +
      '<div><div class="kicker !text-gold">' + (b ? 'Editar reserva' : 'Contrato de locação') + '</div>' +
      '<h1 class="font-display text-[26px] sm:text-[32px] font-semibold leading-tight">' + (b ? 'Editar Agendamento' : 'Novo Agendamento') + '</h1>' +
      '<p class="text-xs sm:text-sm text-white/70">Preencha os dados — o contrato A4 é gerado automaticamente.</p></div></div></section>' +

      (b && b.status === 'confirmed' ? '<div class="mt-4 rounded-2xl bg-wait/10 border border-wait/25 p-4 text-sm flex gap-3"><span class="text-wait">' + icon('triangle-alert', 'w-5 h-5') + '</span><span>Este contrato já foi <b>assinado</b>. Alterações geram uma nova versão do documento — lembre-se de reenviar ao cliente se necessário.</span></div>' : '') +

      '<form id="bookingForm" class="mt-5 space-y-4" novalidate autocomplete="off">' +

      formBlock('Cláusula 1ª', 'calendar-days', 'Data e Detalhes do Evento', 'Data da locação, horários e motivo',
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
        fld('Data da Locação *', '<input class="input" type="date" name="data" required value="' + e(f.data) + '">', 'col-span-2') +
        fld('Horário de Entrada *', '<input class="input" type="time" name="entrada" required value="' + e(f.entrada) + '">') +
        fld('Horário de Saída *', '<input class="input" type="time" name="saida" required value="' + e(f.saida) + '">') +
        '</div>' +
        '<div id="dateHint" class="mt-2 text-xs font-semibold min-h-[18px]"></div>' +
        fld('Evento / Motivo *', '<input class="input" name="evento" required maxlength="80" placeholder="Ex.: Aniversário, Confraternização Familiar" value="' + e(f.evento) + '" list="eventList">', 'mt-2 block') +
        '<datalist id="eventList">' + EVENT_SUGGESTIONS.map(function (s) { return '<option value="' + e(s) + '">'; }).join('') + '</datalist>' +
        '<div class="mt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">' + EVENT_SUGGESTIONS.slice(0, 6).map(function (s) { return '<button type="button" class="chip !h-8 !text-xs" data-action="pick-event" data-value="' + e(s) + '">' + e(s) + '</button>'; }).join('') + '</div>'
      ) +

      formBlock('Seção 2', 'user', 'Locatário(a) / Responsável', 'Dados de quem aluga o espaço',
        '<div class="mb-4"><span class="field-label">Quem preenche os dados do locatário?</span>' +
        '<div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quem preenche os dados do locatário">' +
        '<button type="button" role="radio" data-action="fill-mode" data-value="manual" class="chip !h-auto py-2.5 justify-center text-center">' + icon('pencil', 'w-4 h-4 shrink-0') + 'Eu preencho agora</button>' +
        '<button type="button" role="radio" data-action="fill-mode" data-value="link" class="chip !h-auto py-2.5 justify-center text-center">' + icon('send', 'w-4 h-4 shrink-0') + 'O locatário, por link</button>' +
        '</div>' +
        '<p id="fillModeHint" class="mt-2 text-xs text-black/55 leading-relaxed" hidden>Você salva a reserva e envia um link pelo WhatsApp. O locatário preenche <b>nome, CPF, RG e telefone</b>, vê o contrato com a sua assinatura e <b>assina pelo celular</b>. O contrato assinado volta sozinho para o app. O nome abaixo é opcional.</p>' +
        '</div>' +
        '<div class="grid sm:grid-cols-2 gap-3">' +
        fld('<span id="nomeLabel">Nome Completo do Locatário *</span>', '<input class="input" name="locatario.nome" autocomplete="off" placeholder="Nome completo" value="' + e(lt.nome) + '">', 'sm:col-span-2') +
        fld('CPF', '<input class="input" name="locatario.cpf" inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00" value="' + e(lt.cpf) + '"><span class="block text-[11px] mt-1 font-semibold min-h-[16px]" data-hint="locatario.cpf"></span>') +
        fld('RG', '<input class="input" name="locatario.rg" placeholder="Ex.: MG-12.345.678" value="' + e(lt.rg) + '">') +
        fld('Fone / WhatsApp', '<input class="input" name="locatario.fone" inputmode="tel" data-mask="phone" placeholder="(00) 00000-0000" value="' + e(lt.fone) + '">', 'sm:col-span-2') +
        '</div>'
      ) +

      formBlock('Cláusulas 2ª e 4ª', 'wallet', 'Valores, Sinal, Caução e Pagamento', 'Use apenas números — a máscara de R$ é automática',
        '<div class="grid sm:grid-cols-2 gap-3">' +
        fld('Valor Total da Diária *', money('valores.total', v.total)) +
        fld('Sinal de Reserva / Arras', money('valores.sinal', v.sinal)) +
        fld('Valor de Caução <span class="normal-case font-semibold text-black/35">(opcional)</span>', money('valores.caucao', v.caucao)) +
        '<label class="field"><span class="field-label flex items-center justify-between">Saldo Restante <span id="saldoMode" class="normal-case tracking-normal"></span></span>' + money('valores.saldo', v.saldo) + '</label>' +
        fld('Chave Pix para Pagamento', '<input class="input" name="valores.chavePix" placeholder="CPF, e-mail, telefone ou chave aleatória" value="' + e(v.chavePix) + '">', 'sm:col-span-2') +
        fld('Taxa por Hora Excedente', money('valores.taxaHora', v.taxaHora)) +
        '</div>' +
        '<div id="moneySummary" class="mt-4"></div>'
      ) +

      formBlock('Fechamento', 'map-pin', 'Local e Data de Assinatura', 'Aparece por extenso no final do contrato',
        '<div class="grid sm:grid-cols-2 gap-3">' +
        fld('Local', '<input class="input" name="assinatura.local" value="' + e(f.assinatura.local) + '">') +
        fld('Data de assinatura', '<input class="input" type="date" name="assinatura.data" value="' + e(f.assinatura.data) + '">') +
        '</div>' +
        '<div class="mt-3 rounded-xl bg-mist px-4 py-3 text-sm"><span class="text-black/45 font-semibold">No contrato: </span><b id="signPreview"></b></div>'
      ) +

      /* Dados da locadora — pré-preenchidos pelos Ajustes, recolhidos por padrão */
      '<section class="card p-5 sm:p-6" id="locadoraSec">' +
      '<div class="flex items-start gap-3">' +
      '<span class="w-11 h-11 rounded-2xl bg-obsidian text-gold grid place-items-center shrink-0">' + icon('shield-check', 'w-5 h-5') + '</span>' +
      '<div class="min-w-0 flex-1"><div class="text-[11px] font-bold uppercase tracking-[.16em] text-gold-deep">Seção 1 · pré-preenchido</div>' +
      '<h2 class="font-display text-[20px] font-semibold leading-tight">Dados da locadora</h2>' +
      '<p id="locadoraSummary" class="text-xs text-black/50 mt-0.5 break-words"></p></div>' +
      '<button type="button" data-action="toggle-section" data-target="locadoraBody" aria-expanded="false" aria-controls="locadoraBody" class="btn-light !h-9 !px-3 !text-xs shrink-0">' + icon('pencil', 'w-4 h-4') + '<span>Editar</span></button>' +
      '</div>' +
      '<div id="locadoraBody" class="mt-5" hidden>' +
      '<div class="grid sm:grid-cols-3 gap-3">' +
      fld('Nome', '<input class="input" name="locador.nome" value="' + e(lr.nome) + '">', 'sm:col-span-3') +
      fld('CPF', '<input class="input" name="locador.cpf" inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00" value="' + e(lr.cpf) + '">', 'sm:col-span-2') +
      fld('Fone', '<input class="input" name="locador.fone" inputmode="tel" data-mask="phone" placeholder="(00) 00000-0000" value="' + e(lr.fone) + '">') +
      '</div><p class="mt-3 text-[11px] text-black/45">Para mudar o padrão de todas as reservas, use Ajustes.</p></div>' +
      '</section>' +

      '<div class="sticky bottom-[96px] lg:bottom-4 z-20 pt-2">' +
      '<div class="glass-light rounded-[22px] p-2 shadow-lift border border-black/5 flex gap-2">' +
      '<button type="button" data-action="cancel-form" class="btn-light btn-lg !px-4 shrink-0" aria-label="Cancelar">' + icon('x', 'w-5 h-5') + '</button>' +
      '<button type="submit" id="formSubmit" class="btn-gold btn-lg flex-1">' + icon('file-check', 'w-5 h-5') + (b ? 'Salvar e Ver Contrato' : 'Salvar e Gerar Contrato') + '</button>' +
      '</div></div>' +
      '</form>';

    var form = $('#bookingForm');
    form.addEventListener('input', onFormInput);
    form.addEventListener('change', onFormInput);
    form.addEventListener('submit', onFormSubmit);
    f._fillMode = preench(f) === 'aguardando' || preench(f) === 'assinado' ? 'link' : 'manual';
    applyFillMode();
    updateFormDerived();
  }

  /* O que entra no contrato (para saber se uma edição invalida a assinatura do locatário) */
  function contractKey(b) {
    var v = b.valores || {}, lr = b.locador || {}, lt = b.locatario || {}, as = b.assinatura || {};
    return JSON.stringify([b.data, b.entrada, b.saida, (b.evento || '').trim(), lr.nome, lr.cpf, lr.fone, (lt.nome || '').trim(), lt.cpf, lt.rg, lt.fone,
      v.total || 0, v.sinal || 0, v.caucao || 0, v.saldo || 0, v.chavePix || '', v.taxaHora || 0, as.local]);
  }

  /* Formulário: "Eu preencho agora" × "O locatário, por link" */
  function applyFillMode() {
    var f = state.form; if (!f) return;
    var link = f._fillMode === 'link';
    $$('[data-action="fill-mode"]').forEach(function (btn) {
      var on = btn.getAttribute('data-value') === f._fillMode;
      btn.classList.toggle('is-active', on); btn.setAttribute('aria-checked', String(on));
    });
    var hint = $('#fillModeHint'); if (hint) hint.hidden = !link;
    var nl = $('#nomeLabel'); if (nl) nl.textContent = link ? 'Nome do locatário (opcional)' : 'Nome Completo do Locatário *';
    // por link, os campos do locatário só aparecem se já tiverem dados (para corrigir o que ele enviou)
    var lt = f.locatario || {}, hasData = !!(lt.cpf || lt.rg || lt.fone);
    ['locatario.cpf', 'locatario.rg', 'locatario.fone'].forEach(function (n) {
      var el = $('[name="' + n + '"]'), box = el && el.closest('.field'); if (box) box.hidden = link && !hasData;
    });
    var nm = $('[name="locatario.nome"]'); if (nm) nm.classList.remove('is-invalid');
    var sb = $('#formSubmit');
    if (sb) sb.innerHTML = link ? icon('send', 'w-5 h-5') + (preench(f) === 'aguardando' || preench(f) === 'assinado' ? 'Salvar alterações' : 'Salvar e gerar link') :
      icon('file-check', 'w-5 h-5') + (f.id ? 'Salvar e Ver Contrato' : 'Salvar e Gerar Contrato');
  }

  function setPath(obj, path, val) {
    var p = path.split('.'), o = obj;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]] = o[p[i]] || {};
    o[p[p.length - 1]] = val;
  }

  function onFormInput(ev) {
    var el = ev.target; if (!el.name) return;
    var mask = el.getAttribute('data-mask');
    var f = state.form;
    if (mask && ev.type === 'input') {
      var before = el.value;
      var fn = mask === 'cpf' ? U.maskCPF : mask === 'phone' ? U.maskPhone : U.maskMoney;
      var after = fn(before);
      if (after !== before) { el.value = after; try { el.setSelectionRange(after.length, after.length); } catch (x) { } }
    }
    var value = mask === 'money' ? U.parseMoney(el.value) : el.value;
    setPath(f, el.name, value);
    el.classList.remove('is-invalid');

    if (el.name === 'valores.saldo' && ev.type === 'input') f.valores.saldoManual = true;
    if ((el.name === 'valores.total' || el.name === 'valores.sinal') && !f.valores.saldoManual) {
      f.valores.saldo = Math.max(0, (f.valores.total || 0) - (f.valores.sinal || 0));
      var s = $('[name="valores.saldo"]'); if (s) s.value = f.valores.saldo ? U.formatBRL(f.valores.saldo, false) : '0,00';
    }
    updateFormDerived();
  }

  function updateFormDerived() {
    var f = state.form; if (!f) return;
    var v = f.valores;

    var sm = $('#saldoMode');
    if (sm) sm.innerHTML = v.saldoManual ?
      '<button type="button" data-action="recalc-saldo" class="text-[11px] font-bold text-gold-deep underline">Recalcular automático</button>' :
      '<span class="text-[11px] font-bold text-ok">Automático</span>';

    var ms = $('#moneySummary');
    if (ms) {
      var diff = (v.total || 0) - (v.sinal || 0);
      ms.innerHTML = '<div class="grid grid-cols-3 gap-2 text-center">' +
        '<div class="rounded-xl bg-mist p-3"><div class="text-[10px] font-bold uppercase tracking-wider text-black/45">Total</div><div class="font-extrabold text-[15px] mt-0.5">' + U.formatBRL(v.total) + '</div></div>' +
        '<div class="rounded-xl bg-ok/10 p-3"><div class="text-[10px] font-bold uppercase tracking-wider text-[#047857]">Sinal</div><div class="font-extrabold text-[15px] mt-0.5">' + U.formatBRL(v.sinal) + '</div></div>' +
        '<div class="rounded-xl bg-wait/10 p-3"><div class="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">Saldo</div><div class="font-extrabold text-[15px] mt-0.5">' + U.formatBRL(v.saldo) + '</div></div>' +
        '</div>' +
        ((v.sinal || 0) > (v.total || 0) ? '<p class="mt-2 text-xs font-semibold text-bad">O sinal é maior que o valor total.</p>' : '') +
        (v.saldoManual && v.saldo !== Math.max(0, diff) ? '<p class="mt-2 text-xs font-semibold text-black/50">Saldo editado manualmente (cálculo automático seria ' + U.formatBRL(Math.max(0, diff)) + ').</p>' : '') +
        ((v.caucao || 0) > 0 ? '<p class="mt-2 text-xs font-semibold text-black/55">' + icon('info', 'w-3.5 h-3.5 inline -mt-0.5') + ' A caução de ' + U.formatBRL(v.caucao) + ' constará no quadro do Sinal de Reserva do contrato.</p>' : '');
    }

    var ls = $('#locadoraSummary');
    if (ls) ls.textContent = [f.locador.nome || 'Nome não informado', f.locador.cpf ? 'CPF ' + f.locador.cpf : 'CPF não informado', f.locador.fone || 'sem telefone'].join(' · ');

    var sp = $('#signPreview');
    if (sp) sp.textContent = (f.assinatura.local || 'Uberlândia - MG') + ', ' + U.formatExtenso(f.assinatura.data || U.todayISO());

    var dh = $('#dateHint');
    if (dh) {
      if (!f.data) dh.innerHTML = '';
      else {
        var conflict = Store.byDate(f.data).find(function (x) { return x.status !== 'cancelled' && x.id !== f.id; });
        if (conflict) dh.innerHTML = '<span class="text-bad inline-flex items-center gap-1">' + icon('triangle-alert', 'w-3.5 h-3.5') + 'Já existe reserva nesta data: ' + e(conflict.locatario.nome) + ' (' + STATUS[conflict.status].short + ')</span>';
        else dh.innerHTML = '<span class="text-ok inline-flex items-center gap-1">' + icon('circle-check', 'w-3.5 h-3.5') + 'Data livre · ' + e(U.formatLong(f.data)) + '</span>' +
          (f.data < U.todayISO() ? ' <span class="text-wait ml-1">(data no passado)</span>' : '');
      }
    }

    var ch = $('[data-hint="locatario.cpf"]');
    if (ch) {
      var d = U.onlyDigits(f.locatario.cpf);
      ch.innerHTML = d.length === 11 ? (U.isValidCPF(d) ? '<span class="text-ok">CPF válido</span>' : '<span class="text-wait">Confira o CPF — dígitos verificadores não conferem</span>') : '';
    }
  }

  function toggleSection(id, forceOpen) {
    var body = document.getElementById(id); if (!body) return;
    var open = forceOpen === true ? true : body.hidden;
    body.hidden = !open;
    var btn = $('[data-target="' + id + '"]');
    if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.innerHTML = icon(open ? 'chevron-down' : 'pencil', 'w-4 h-4') + '<span>' + (open ? 'Recolher' : 'Editar') + '</span>'; }
  }

  function onFormSubmit(ev) {
    ev.preventDefault();
    var f = state.form;
    var byLink = f._fillMode === 'link';
    var required = [['data', f.data], ['entrada', f.entrada], ['saida', f.saida], ['evento', (f.evento || '').trim()], ['valores.total', f.valores.total]];
    if (!byLink) required.push(['locatario.nome', (f.locatario.nome || '').trim()]); // por link, o locatário preenche
    var bad = [];
    required.forEach(function (r) { if (!r[1]) bad.push(r[0]); });
    // CPF e telefones: opcionais, mas se preenchidos têm de estar completos
    [['locatario.cpf', f.locatario.cpf, [11]], ['locador.cpf', f.locador.cpf, [11]], ['locatario.fone', f.locatario.fone, [10, 11]], ['locador.fone', f.locador.fone, [10, 11]]].forEach(function (r) {
      var n = U.onlyDigits(r[1]).length; if (n && r[2].indexOf(n) < 0) bad.push(r[0]);
    });
    var firstBad = null;
    bad.forEach(function (name) {
      var el = $('[name="' + name + '"]'); if (!el) return;
      el.classList.add('is-invalid');
      var hiddenBody = el.closest('[hidden]');
      if (hiddenBody) toggleSection(hiddenBody.id, true); // abre a secção recolhida que contém o erro
      firstBad = firstBad || el;
    });
    if (firstBad) {
      toast(bad.length === 1 ? 'Corrija o campo destacado.' : 'Corrija os ' + bad.length + ' campos destacados.', 'error');
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { firstBad.focus({ preventScroll: true }); }, 350);
      return;
    }
    var conflict = Store.byDate(f.data).find(function (x) { return x.status !== 'cancelled' && x.id !== f.id; });
    var orig = f.id ? Store.get(f.id) : null;
    var resign = !!(orig && orig.assinaturaLocatario && orig.assinaturaLocatario.em && contractKey(orig) !== contractKey(f));
    var go = (resign ? confirmDialog({
      title: 'Contrato já assinado pelo locatário', icon: 'triangle-alert', tone: 'danger',
      text: 'Você mudou dados do contrato que <b>' + e(orig.locatario.nome) + '</b> já assinou. Ao salvar, essa assinatura é removida' + (byLink ? ' e um <b>novo link</b> é gerado para assinar a versão nova.' : ' e o contrato volta a "Aguardando assinatura".'),
      okText: 'Salvar e pedir nova assinatura', cancelText: 'Voltar'
    }) : Promise.resolve(true)).then(function (ok) { return ok && (!byLink || ensureLocadoraSignature()); }).then(function (ok) {
      if (!ok) return false;
      return conflict ? confirmDialog({
      title: 'Data já reservada',
      text: 'Já existe uma reserva de <b>' + e(conflict.locatario.nome) + '</b> em ' + U.formatBR(f.data) + ' (' + STATUS[conflict.status].label + '). Deseja salvar mesmo assim?',
      okText: 'Salvar mesmo assim', icon: 'triangle-alert', tone: 'danger'
    }) : true;
    });

    go.then(function (ok) {
      if (!ok) return;
      if (resign) { f.assinaturaLocatario = null; f.status = 'pending'; f.signedAt = null; if (preench(f) === 'assinado') f.preenchimento = null; }
      f.evento = f.evento.trim();
      f.locatario.nome = (f.locatario.nome || '').trim();
      var isNew = !f.id, cur = preench(f);
      cur = preench(f);
      if (byLink && cur !== 'aguardando') f.preenchimento = { status: 'aguardando', token: newToken(), enviadoEm: new Date().toISOString() };
      if (!byLink && cur === 'aguardando') f.preenchimento = null; // passou a preencher à mão: o link deixa de valer
      delete f._fillMode;
      var saved = Store.save(JSON.parse(JSON.stringify(f)));
      state.selectedDate = saved.data;
      var d = U.parseISO(saved.data); state.calY = d.getFullYear(); state.calM = d.getMonth();
      state.keepSelect = isXL() ? saved.id : null;
      state.form = null;
      location.hash = '#/agenda';
      if (preench(saved) === 'aguardando') { // fluxo por link: mostra o link para enviar
        toast(isNew ? 'Reserva salva · Aguardando dados do locatário' : 'Alterações salvas', 'ok');
        setTimeout(function () { fillLinkDialog(saved.id, true); }, 60);
        return;
      }
      toast(isNew ? 'Agendamento salvo · Aguardando Assinatura' : 'Alterações salvas', 'ok');
      setTimeout(function () { state.contractReturn = panelActive() ? null : saved.id; openContract(saved.id, isNew); }, 60);
    });
  }

  /* =====================================================================
     Contrato: visualização, PDF, WhatsApp
     ===================================================================== */
  function fitContracts(root) {
    $$('.contract-viewport', root || document).forEach(function (vp) {
      var page = vp.querySelector('.ct-page'); if (!page) return;
      var w = vp.clientWidth; if (!w) return;
      var s = w / 794;
      page.style.transform = 'scale(' + s + ')';
      vp.style.height = Math.round(1122 * s) + 'px';
    });
  }
  var wasXL = isXL();
  window.addEventListener('resize', U.debounce(function () {
    if (isXL() !== wasXL) { wasXL = isXL(); renderRightPanel(); }
    fitContracts();
  }, 120));

  function openContract(id, justCreated) {
    var b = Store.get(id); if (!b) return;
    var pending = b.status === 'pending';
    openOverlay(
      '<div class="fixed inset-0 z-50 bg-obsidian/95 backdrop-blur-md flex flex-col fade-in">' +
      /* topo */
      '<div class="pt-safe shrink-0"><div class="h-16 px-3 sm:px-6 flex items-center gap-3 text-white">' +
      '<button type="button" data-action="contract-back" class="h-11 pl-3 pr-4 rounded-full bg-white/10 hover:bg-white/15 flex items-center gap-1.5 text-sm font-semibold" aria-label="Voltar à reserva">' + icon('arrow-left', 'w-5 h-5') + '<span class="hidden sm:inline">Voltar à reserva</span></button>' +
      '<div class="min-w-0 flex-1"><div class="font-display text-lg font-semibold leading-tight truncate">' + (justCreated ? 'Contrato pronto!' : 'Contrato de Locação') + '</div>' +
      '<div class="text-xs text-white/55 truncate">' + e(b.locatario.nome) + ' · ' + e(U.formatBR(b.data)) + '</div></div>' +
      '<span class="hidden sm:inline-flex">' + statusBadge(b.status, true) + '</span>' +
      '</div></div>' +
      /* corpo */
      '<div class="flex-1 min-h-0 overflow-y-auto no-scrollbar">' +
      '<div class="max-w-6xl mx-auto px-4 sm:px-6 pb-56 lg:pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:items-start">' +
      '<div class="contract-viewport js-fit mx-auto w-full max-w-[794px]">' + Contract.render(b) + '</div>' +
      '<div class="hidden lg:block sticky top-0 space-y-3 text-white" id="ctActionsDesk"></div>' +
      '</div></div>' +
      /* ações mobile */
      '<div class="lg:hidden fixed inset-x-0 bottom-0 z-10 pb-safe"><div class="mx-3 mb-3 glass-dark rounded-[24px] p-2.5 border border-white/10 space-y-2" id="ctActionsMob"></div></div>' +
      '</div>',
      {
        onOpen: function (root) {
          var actions = function (desk) {
            return (desk ? '<div class="rounded-2xl bg-white/[.06] border border-white/10 p-5"><div class="kicker !text-gold">' + (justCreated ? 'Agendamento salvo' : 'Contrato') + '</div><div class="font-display text-2xl font-semibold mt-1">' + e(b.locatario.nome) + '</div><div class="text-sm text-white/60 mt-1">' + e(b.evento) + ' · ' + e(U.formatBR(b.data)) + '</div><div class="mt-3">' + statusBadge(b.status, true) + '</div></div>' : '') +
              '<div class="grid ' + (desk ? 'grid-cols-1' : 'grid-cols-2') + ' gap-2">' +
              '<button type="button" data-action="download-pdf" data-id="' + b.id + '" class="btn-gold btn-lg !text-sm js-pdf-btn">' + icon('download', 'w-5 h-5') + 'Baixar PDF</button>' +
              '<button type="button" data-action="share-wa" data-id="' + b.id + '" class="btn-wa btn-lg !text-sm js-pdf-btn">' + icon('message-circle', 'w-5 h-5') + 'Enviar WhatsApp</button>' +
              (desk ? '<button type="button" data-action="print-contract" data-id="' + b.id + '" class="btn btn-lg !text-sm bg-white/10 text-white border border-white/15">' + icon('printer', 'w-5 h-5') + 'Imprimir</button>' : '') +
              '</div>' +
              (pending ? '<button type="button" data-action="mark-signed" data-id="' + b.id + '" class="btn-ok btn-lg w-full !text-sm">' + icon('circle-check', 'w-5 h-5') + 'Marcar como "Contrato Assinado"</button>' : '') +
              '<p class="js-pdf-status text-center text-[11px] text-white/45 font-medium">Preparando PDF…</p>';
          };
          $('#ctActionsDesk', root).innerHTML = actions(true);
          $('#ctActionsMob', root).innerHTML = actions(false);
          fitContracts(root);
          requestAnimationFrame(function () { fitContracts(root); });
          // Pré-gera o PDF para que o "compartilhar" seja instantâneo (exigência do navigator.share)
          Contract.generatePdf(b).then(function () {
            $$('.js-pdf-status', root).forEach(function (p) { p.innerHTML = icon('circle-check', 'w-3.5 h-3.5 inline -mt-0.5 text-ok') + ' PDF A4 pronto · ' + e(Contract.fileName(b)); });
          }).catch(function (err) {
            console.error(err);
            $$('.js-pdf-status', root).forEach(function (p) { p.textContent = 'Não foi possível preparar o PDF. Tente novamente.'; });
          });
        }
      }
    );
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function withBusy(btn, promise, label) {
    if (!btn) return promise;
    var html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = '<span class="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>' + (label || 'Gerando…');
    return promise.finally(function () { btn.disabled = false; btn.innerHTML = html; });
  }

  function downloadPdf(id, btn) {
    var b = Store.get(id); if (!b) return;
    withBusy(btn, Contract.generatePdf(b)).then(function (blob) {
      downloadBlob(blob, Contract.fileName(b));
      toast('PDF do contrato baixado', 'ok');
    }).catch(function (err) { console.error(err); toast('Erro ao gerar o PDF', 'error'); });
  }

  function waMessage(b) {
    var v = b.valores;
    return 'Olá, ' + U.firstName(b.locatario.nome) + '! 😊\n\n' +
      'Segue o *Contrato de Locação* da *RC House Espaço de Eventos*:\n\n' +
      '📅 Data: *' + U.formatBR(b.data) + '* (' + b.entrada + 'h às ' + b.saida + 'h)\n' +
      '🎉 Evento: ' + b.evento + '\n' +
      '💰 Valor total: ' + U.formatBRL(v.total) + '\n' +
      '✅ Sinal de reserva: ' + U.formatBRL(v.sinal) + '\n' +
      '⏳ Saldo restante: ' + U.formatBRL(v.saldo) + ' (até a entrega das chaves)\n' +
      ((v.caucao || 0) > 0 ? '🔐 Caução: ' + U.formatBRL(v.caucao) + '\n' : '') +
      (v.chavePix ? '🔑 Chave Pix: ' + v.chavePix + '\n' : '') +
      '\nPor favor, confira os dados, assine e devolva o contrato para confirmarmos a sua data. Qualquer dúvida estou à disposição!\n\n' +
      (b.locador && b.locador.nome ? b.locador.nome + '\n' : '') + 'RC House Espaço de Eventos';
  }

  function openWhatsAppLink(b) {
    var d = U.onlyDigits(b.locatario.fone);
    var url = (d.length >= 10 ? 'https://wa.me/55' + d : 'https://wa.me/') + '?text=' + encodeURIComponent(waMessage(b));
    window.open(url, '_blank', 'noopener');
  }

  function shareWhatsApp(id, btn) {
    var b = Store.get(id); if (!b) return;
    var canShareFiles = !!(navigator.canShare && window.File);
    withBusy(btn, Contract.generatePdf(b)).then(function (blob) {
      var file = new File([blob], Contract.fileName(b), { type: 'application/pdf' });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Contrato RC House', text: waMessage(b) })
          .then(function () { toast('Contrato compartilhado', 'ok'); })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return;
            // Sem gesto válido ou falha: cai para o download + link do WhatsApp
            downloadBlob(blob, Contract.fileName(b)); openWhatsAppLink(b);
          });
      }
      // Desktop / navegadores sem partilha de ficheiros
      downloadBlob(blob, Contract.fileName(b));
      openWhatsAppLink(b);
      toast('PDF baixado — anexe-o na conversa do WhatsApp', 'info');
    }).catch(function (err) { console.error(err); toast('Erro ao gerar o PDF', 'error'); openWhatsAppLink(b); });
  }

  function printContract(id) {
    var b = Store.get(id); if (!b) return;
    var host = document.createElement('div');
    host.className = 'print-host'; host.style.display = 'none';
    host.innerHTML = Contract.render(b);
    document.body.appendChild(host);
    document.body.classList.add('printing-contract');
    var done = function () { document.body.classList.remove('printing-contract'); host.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); setTimeout(done, 1500); }, 50);
  }

  /* =====================================================================
     Mudanças de status
     ===================================================================== */
  function refreshAll() {
    var r = parseRoute();
    if (r.name === 'agenda' || r.name === '') renderMonthParts();
    if (r.name === 'reservas') { renderFilterBar(); renderResList(); }
    renderRightPanel();
  }

  function markSigned(id) {
    var b = Store.get(id); if (!b) return;
    confirmDialog({
      title: 'Contrato assinado?',
      text: 'Confirme que <b>' + e(b.locatario.nome) + '</b> devolveu o contrato assinado. O evento de <b>' + U.formatBR(b.data) + '</b> ficará <b style="color:#10B981">Confirmado</b> na agenda.',
      okText: 'Sim, contrato assinado', icon: 'circle-check', tone: 'ok'
    }).then(function (ok) {
      if (!ok) return;
      Store.setStatus(id, 'confirmed');
      closeOverlay();
      toast('Evento confirmado · Contrato assinado ✅', 'ok');
      setTimeout(refreshAll, 30);
      if (!isXL()) setTimeout(function () { openBooking(id); }, 260);
    });
  }

  function setStatusWithConfirm(id, status) {
    var b = Store.get(id); if (!b) return;
    var cfg = {
      cancelled: { title: 'Cancelar reserva?', text: 'A data <b>' + U.formatBR(b.data) + '</b> voltará a ficar livre. Pela Cláusula 3ª, o sinal pago pelo locatário não é reembolsado em caso de desistência imotivada.', okText: 'Cancelar reserva', icon: 'ban', tone: 'danger', cancelText: 'Voltar', msg: 'Reserva cancelada' },
      pending: { title: 'Voltar para "Aguardando"?', text: 'O status deixará de ser "Contrato Assinado".' + (b.assinaturaLocatario ? ' <b>A assinatura eletrônica do locatário será removida.</b>' : ''), okText: 'Confirmar', icon: 'undo-2', msg: 'Status: Aguardando Assinatura' }
    }[status];
    if (status === 'pending' && b.status === 'cancelled') {
      var conflict = Store.activeByDate(b.data);
      if (conflict) { toast('Não é possível reativar: a data já tem outra reserva.', 'error'); return; }
      Store.setStatus(id, 'pending'); toast('Reserva reativada · Aguardando Assinatura', 'ok');
      closeOverlay(); setTimeout(refreshAll, 30); return;
    }
    confirmDialog(cfg).then(function (ok) {
      if (!ok) return;
      Store.setStatus(id, status);
      toast(cfg.msg, status === 'cancelled' ? 'info' : 'ok');
      closeOverlay(); setTimeout(refreshAll, 30);
    });
  }

  /* Registar pagamento do saldo */
  function paymentDialog(id) {
    var b = Store.get(id); if (!b) return;
    var fin = finance(b);
    var formas = ['Pix', 'Dinheiro', 'Cartão', 'Transferência'];
    var root = $('#dialogRoot');
    root.innerHTML =
      '<div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">' +
      '<div class="absolute inset-0 bg-obsidian/60 backdrop-blur-sm fade-in" data-pay="cancel"></div>' +
      '<form id="payForm" class="relative w-full max-w-sm card p-6 pop-in" novalidate>' +
      '<div class="w-12 h-12 rounded-2xl grid place-items-center mb-4 bg-gold/15 text-gold-deep">' + icon('hand-coins', 'w-6 h-6') + '</div>' +
      '<h3 class="font-display text-xl font-semibold">Registrar pagamento</h3>' +
      '<p class="mt-1 text-sm text-black/55">' + e(b.locatario.nome) + ' · falta <b class="text-obsidian">' + U.formatBRL(fin.pendente) + '</b> do saldo.</p>' +
      '<div class="mt-4 space-y-3">' +
      '<label class="field"><span class="field-label">Valor recebido</span><div class="input-prefix"><span>R$</span><input class="input" name="valor" inputmode="numeric" value="' + U.formatBRL(fin.pendente, false) + '"></div>' +
      '<span class="block text-[11px] mt-1 font-semibold text-black/45" id="payHint">Valor total do saldo — ajuste se for um pagamento parcial.</span></label>' +
      '<label class="field"><span class="field-label">Data do pagamento</span><input class="input" type="date" name="data" value="' + U.todayISO() + '"></label>' +
      '<div><span class="field-label">Forma</span><div class="flex flex-wrap gap-1.5" id="payFormas">' +
      formas.map(function (f, i) { return '<button type="button" class="chip !h-9 ' + (i === 0 ? 'is-active' : '') + '" data-forma="' + f + '">' + f + '</button>'; }).join('') + '</div></div>' +
      '<label class="field"><span class="field-label">Observação <span class="normal-case font-semibold text-black/35">(opcional)</span></span><input class="input" name="obs" maxlength="60" placeholder="Ex.: pago na entrega das chaves"></label>' +
      '</div>' +
      '<div class="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">' +
      '<button type="button" class="btn-light" data-pay="cancel">Cancelar</button>' +
      '<button type="submit" class="btn-gold">' + icon('circle-check', 'w-4 h-4') + 'Registrar</button>' +
      '</div></form></div>';
    var form = $('#payForm', root), forma = formas[0];
    var valor = $('[name="valor"]', form);
    valor.focus(); valor.select();
    valor.addEventListener('input', function () {
      valor.value = U.maskMoney(valor.value);
      var c = U.parseMoney(valor.value), hint = $('#payHint');
      valor.classList.remove('is-invalid');
      hint.className = 'block text-[11px] mt-1 font-semibold ' + (c > fin.pendente ? 'text-bad' : 'text-black/45');
      hint.textContent = c > fin.pendente ? 'Maior que o saldo pendente (' + U.formatBRL(fin.pendente) + ').' :
        c === fin.pendente ? 'Quita o saldo.' : c > 0 ? 'Pagamento parcial — ficará faltando ' + U.formatBRL(fin.pendente - c) + '.' : '';
    });
    root.onclick = function (ev) {
      var f = ev.target.closest('[data-forma]');
      if (f) { forma = f.getAttribute('data-forma'); $$('[data-forma]', root).forEach(function (x) { x.classList.toggle('is-active', x === f); }); return; }
      if (ev.target.closest('[data-pay="cancel"]')) { root.innerHTML = ''; root.onclick = null; }
    };
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var c = U.parseMoney(valor.value);
      if (!c || c > fin.pendente) { valor.classList.add('is-invalid'); valor.focus(); return; }
      Store.addPayment(id, { valor: c, data: $('[name="data"]', form).value || U.todayISO(), forma: forma, obs: $('[name="obs"]', form).value.trim() });
      root.innerHTML = ''; root.onclick = null;
      var after = finance(Store.get(id));
      toast(after.quitado ? 'Pagamento registrado · Saldo quitado ✅' : 'Pagamento registrado · Falta ' + U.formatBRL(after.pendente), 'ok');
      refreshBooking(id);
    });
  }

  function refreshBooking(id) {
    refreshAll();
    if (overlayOpen && !panelActive() && $('#overlayRoot .sheet-up')) openBooking(id); // atualiza o drawer aberto
  }

  function deletePayment(id, pid) {
    var b = Store.get(id); if (!b) return;
    var x = (b.pagamentos || []).find(function (p) { return p.id === pid; }); if (!x) return;
    confirmDialog({ title: 'Apagar pagamento?', text: 'O pagamento de <b>' + U.formatBRL(x.valor) + '</b> (' + U.formatBR(x.data) + ') será removido e o valor volta a constar como pendente.', okText: 'Apagar', icon: 'trash', tone: 'danger' })
      .then(function (ok) { if (!ok) return; Store.removePayment(id, pid); toast('Pagamento removido', 'info'); refreshBooking(id); });
  }

  function deleteBooking(id) {
    var b = Store.get(id); if (!b) return;
    confirmDialog({ title: 'Excluir definitivamente?', text: 'A reserva de <b>' + e(b.locatario.nome) + '</b> será apagada' + (Sync.isOn() ? ' deste aparelho e da planilha' : ' deste aparelho') + '. Esta ação não pode ser desfeita.', okText: 'Excluir', icon: 'trash', tone: 'danger' })
      .then(function (ok) {
        if (!ok) return;
        Store.remove(id);
        if (state.selectedId === id) state.selectedId = null;
        toast('Reserva excluída', 'info');
        closeOverlay(); setTimeout(refreshAll, 30);
      });
  }

  /* =====================================================================
     VIEW: Ajustes
     ===================================================================== */
  function renderAjustes(view) {
    var s = Store.getSettings();
    view.innerHTML =
      '<div><div class="kicker">Configurações</div><h1 class="font-display text-[30px] font-semibold leading-tight">Ajustes</h1></div>' +
      '<div class="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] items-start">' +

      '<form id="settingsForm" class="space-y-4" autocomplete="off">' +
      formBlock('Padrões do contrato', 'shield-check', 'Configurações Padrão do Locador', 'Usadas para pré-preencher cada novo agendamento',
        '<div class="grid sm:grid-cols-2 gap-3">' +
        fld('Nome do(a) Locador(a)', '<input class="input" name="locadorNome" value="' + e(s.locadorNome) + '">', 'sm:col-span-2') +
        fld('CPF da Locadora', '<input class="input" name="locadorCpf" inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00" value="' + e(s.locadorCpf) + '">') +
        fld('Telefone padrão', '<input class="input" name="locadorFone" inputmode="tel" data-mask="phone" value="' + e(s.locadorFone) + '">') +
        fld('Chave Pix padrão', '<input class="input" name="chavePix" placeholder="CPF, e-mail, telefone ou aleatória" value="' + e(s.chavePix) + '">', 'sm:col-span-2') +
        fld('Taxa por hora excedente', money('taxaHoraExcedente', s.taxaHoraExcedente)) +
        fld('Valor padrão da diária <span class="normal-case font-semibold text-black/35">(opcional)</span>', money('valorDiariaPadrao', s.valorDiariaPadrao)) +
        fld('Local de assinatura', '<input class="input" name="localAssinatura" value="' + e(s.localAssinatura) + '">', 'sm:col-span-2') +
        fld('Entrada padrão', '<input class="input" type="time" name="horaEntradaPadrao" value="' + e(s.horaEntradaPadrao) + '">') +
        fld('Saída padrão', '<input class="input" type="time" name="horaSaidaPadrao" value="' + e(s.horaSaidaPadrao) + '">') +
        '</div>' +
        '<button type="submit" class="btn-dark btn-lg w-full mt-5">' + icon('circle-check', 'w-5 h-5') + 'Salvar configurações</button>'
      ) +
      '</form>' +

      '<div class="space-y-4">' +
      /* Assinatura da locadora */
      '<section class="card p-5" id="sigCard"></section>' +
      /* Planilha Google (banco de dados) */
      '<section class="card p-5" id="sheetCard"></section>' +

      /* App */
      '<section class="relative overflow-hidden rounded-2xl bg-obsidian text-white p-5">' +
      '<div class="relative flex items-center gap-4"><img src="assets/brand/logo-rc-house.png" class="w-14 h-14 rounded-full ring-1 ring-white/20" alt="">' +
      '<div><div class="font-display text-xl font-semibold">App RC House</div><div class="text-xs text-white/60" id="installState"></div></div></div>' +
      '<button type="button" data-action="install" class="relative btn-gold btn-lg w-full mt-4 js-install-btn">' + icon('smartphone', 'w-5 h-5') + 'Criar Atalho Agora</button>' +
      '</section>' +

      '<section class="card p-5 text-xs text-black/55 leading-relaxed">' +
      '<div class="font-bold text-obsidian text-sm mb-1">RC House Espaço de Eventos</div>' +
      'Av. Abadio Bonifácio da Silva, 153 · Granada · Uberlândia - MG<br>Versão 1.7 · Os dados ficam na Planilha Google, com uma cópia no aparelho para funcionar sem internet.' +
      '</section>' +
      '</div></div>';

    var form = $('#settingsForm');
    form.addEventListener('input', function (ev) {
      var el = ev.target, m = el.getAttribute('data-mask'); if (!m) return;
      el.value = (m === 'cpf' ? U.maskCPF : m === 'phone' ? U.maskPhone : U.maskMoney)(el.value);
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = {};
      $$('[name]', form).forEach(function (el) { data[el.name] = el.getAttribute('data-mask') === 'money' ? U.parseMoney(el.value) : el.value.trim(); });
      Store.saveSettings(data);
      toast('Configurações salvas', 'ok');
    });
    updateInstallUI();
    renderSheetCard();
    renderSigCard();
  }

  function renderSigCard() {
    var card = $('#sigCard'); if (!card) return;
    var img = Store.getSettings().assinaturaLocadora;
    card.innerHTML = '<div class="flex items-center gap-3"><span class="w-11 h-11 rounded-2xl bg-gold/15 text-gold-deep grid place-items-center shrink-0">' + icon('pencil', 'w-5 h-5') + '</span>' +
      '<div class="min-w-0"><h2 class="font-display text-lg font-semibold leading-tight">Sua assinatura</h2><p class="text-xs text-black/45">Vai nos contratos enviados para o locatário assinar</p></div></div>' +
      (img ? '<div class="mt-3 rounded-xl bg-mist px-3 py-3 text-center"><img class="sig-thumb mx-auto" src="' + e(img) + '" alt="Sua assinatura"></div>' :
        '<p class="mt-3 text-xs text-black/55 leading-relaxed">Ainda não tem assinatura. Ela é pedida automaticamente na primeira vez que você enviar um contrato por link.</p>') +
      '<button type="button" data-action="sig-edit" class="btn-light w-full mt-3">' + icon('pencil', 'w-4 h-4') + (img ? 'Assinar de novo' : 'Desenhar assinatura') + '</button>';
  }

  /* =====================================================================
     Planilha Google (banco de dados) — ver js/sync.js e apps-script/Codigo.gs
     ===================================================================== */
  function syncText(s) {
    var n = s.pending, pend = n + ' alteraç' + (n === 1 ? 'ão' : 'ões') + ' por enviar';
    if (!s.on) return { t: 'Só neste aparelho', s: 'Planilha não ligada', ic: 'hard-drive-download', cls: 'sync-off' };
    if (s.state === 'syncing') return { t: 'Sincronizando…', s: s.planilhaNome || 'Planilha Google', ic: 'refresh-cw', cls: 'sync-syncing' };
    if (s.state === 'offline') return { t: 'Offline', s: n ? pend : 'Sincroniza quando voltar a internet', ic: 'cloud-off', cls: 'sync-offline' };
    if (s.state === 'error') return { t: 'Erro na planilha', s: n ? pend : 'Toque para ver', ic: 'triangle-alert', cls: 'sync-error' };
    if (n) return { t: 'Planilha Google', s: pend, ic: 'cloud', cls: 'sync-pending' };
    return { t: 'Planilha sincronizada', s: s.lastSync ? 'Atualizado ' + whenText(s.lastSync) : (s.planilhaNome || 'Planilha Google'), ic: 'cloud', cls: 'sync-ok' };
  }
  function whenText(iso) {
    var d = new Date(iso), diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return 'há ' + Math.floor(diff / 60) + ' min';
    var hm = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    return U.toISO(d) === U.todayISO() ? 'hoje às ' + hm : U.formatBR(U.toISO(d)) + ' às ' + hm;
  }

  function renderSyncPills() {
    var s = Sync.status(), x = syncText(s);
    $$('.js-sync-pill').forEach(function (el) {
      var top = el.getAttribute('data-sync-variant') === 'top';
      el.className = 'js-sync-pill ' + (top ? 'sync-top ' : 'sync-side ') + x.cls;
      el.title = x.t + ' — ' + x.s + (s.error ? ' (' + s.error + ')' : '');
      el.setAttribute('aria-label', el.title);
      el.hidden = top && !s.on; // no celular, só aparece com a planilha ligada
      el.innerHTML = '<span class="sync-ic">' + icon(x.ic, top ? 'w-5 h-5' : 'w-5 h-5 text-gold') + (s.on ? '<span class="sync-dot"></span>' : '') + '</span>' +
        (top ? '' : '<span class="min-w-0"><span class="sync-t truncate">' + e(x.t) + '</span><span class="sync-s truncate">' + e(x.s) + '</span></span>');
    });
    renderSheetStatus();
    // aviso "o link começa a funcionar quando sincronizar": some sozinho quando a sincronização termina
    if (s.state === 'ok' && !s.pending && $('[data-fill-notlive]')) { renderRightPanel(); var dr = $('#overlayRoot .sheet-up [data-id]'); if (dr && overlayOpen && !panelActive()) openBooking(dr.getAttribute('data-id')); }
  }

  function renderSheetCard() {
    var card = $('#sheetCard'); if (!card) return;
    var s = Sync.status(), c = Sync.config();
    var head = '<div class="flex items-center gap-3"><span class="w-11 h-11 rounded-2xl bg-ok/10 text-ok grid place-items-center shrink-0">' + icon('file-spreadsheet', 'w-5 h-5') + '</span>' +
      '<div class="min-w-0"><h2 class="font-display text-lg font-semibold leading-tight">Planilha Google</h2><p class="text-xs text-black/45">Banco de dados · ' + (s.on ? 'ligada' : 'desligada') + '</p></div></div>';
    if (s.fixed) {
      card.innerHTML = head +
        '<div id="sheetStatus" class="mt-4"></div>' +
        (s.planilhaUrl ? '<a href="' + e(s.planilhaUrl) + '" target="_blank" rel="noopener" class="mt-3 w-full flex items-center justify-between gap-2 rounded-xl bg-mist px-3 py-2.5 text-left">' +
          '<span class="min-w-0"><span class="block text-[11px] text-black/45 font-bold">Planilha</span><span class="block text-sm font-semibold truncate">' + e(s.planilhaNome || 'Abrir no Google Sheets') + '</span></span>' + icon('external-link', 'w-4 h-4 text-black/45 shrink-0') + '</a>' : '') +
        '<p class="text-xs text-black/55 mt-3 leading-relaxed">Este app já vem ligado à planilha da RC House: todos os aparelhos veem a mesma agenda. Pode editar as reservas direto na planilha.</p>' +
        '<div class="grid grid-cols-2 gap-2 mt-3">' +
        '<button type="button" data-action="sheet-sync" class="btn-light">' + icon('refresh-cw', 'w-4 h-4') + 'Sincronizar</button>' +
        (Sync.hasFixedKey() ? '<button type="button" data-action="sheet-help" class="btn-ghost text-black/60">' + icon('info', 'w-4 h-4') + 'Como funciona</button>' :
          '<button type="button" data-action="sheet-disconnect" class="btn-ghost text-black/60">' + icon('lock', 'w-4 h-4') + 'Sair deste aparelho</button>') +
        '</div>';
      renderSheetStatus();
      return;
    }
    if (!s.on) {
      card.innerHTML = head +
        '<p class="text-xs text-black/55 mt-3 leading-relaxed">Guarde as reservas numa planilha do Google Sheets: a agenda fica igual no celular e no PC, e pode ver e editar tudo direto na planilha. O app continua a funcionar sem internet e envia as alterações quando a conexão voltar.</p>' +
        '<button type="button" data-action="sheet-help" class="btn-light w-full mt-3 !h-10 !text-xs">' + icon('info', 'w-4 h-4') + 'Como criar a planilha (5 min)</button>' +
        '<form id="sheetForm" class="mt-4 space-y-3" autocomplete="off" novalidate>' +
        fld('URL do app da Web (termina em /exec)', '<input class="input" name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + e(c.url) + '">') +
        fld('Chave de acesso', '<input class="input" name="chave" type="password" placeholder="A mesma definida no script" value="' + e(c.chave) + '">') +
        '<p id="sheetErr" class="text-xs font-semibold text-bad min-h-[16px]"></p>' +
        '<button type="submit" class="btn-dark btn-lg w-full">' + icon('cloud', 'w-5 h-5') + 'Conectar planilha</button>' +
        '</form>';
      $('#sheetForm').addEventListener('submit', function (ev) { ev.preventDefault(); connectSheet(ev.target); });
      return;
    }
    card.innerHTML = head +
      '<div id="sheetStatus" class="mt-4"></div>' +
      (s.planilhaUrl ? '<a href="' + e(s.planilhaUrl) + '" target="_blank" rel="noopener" class="mt-3 w-full flex items-center justify-between gap-2 rounded-xl bg-mist px-3 py-2.5 text-left">' +
        '<span class="min-w-0"><span class="block text-[11px] text-black/45 font-bold">Planilha</span><span class="block text-sm font-semibold truncate">' + e(s.planilhaNome || 'Abrir no Google Sheets') + '</span></span>' + icon('external-link', 'w-4 h-4 text-black/45 shrink-0') + '</a>' : '') +
      '<div class="grid grid-cols-2 gap-2 mt-3">' +
      '<button type="button" data-action="sheet-sync" class="btn-light">' + icon('refresh-cw', 'w-4 h-4') + 'Sincronizar</button>' +
      '<button type="button" data-action="sheet-disconnect" class="btn-ghost text-black/60">' + icon('unlink', 'w-4 h-4') + 'Desligar</button>' +
      '</div>' +
      '<button type="button" data-action="sheet-help" class="btn-ghost w-full mt-1 !h-9 !text-xs text-black/50">' + icon('info', 'w-4 h-4') + 'Como funciona a planilha</button>';
    renderSheetStatus();
  }

  function renderSheetStatus() {
    var box = $('#sheetStatus'); if (!box) return;
    var s = Sync.status(), x = syncText(s);
    var tone = s.state === 'error' ? 'bg-bad/10 text-bad' : s.state === 'offline' || s.pending ? 'bg-wait/10 text-[#B45309]' : 'bg-ok/10 text-[#047857]';
    box.innerHTML = '<div class="rounded-xl ' + tone + ' px-3 py-2.5 flex items-start gap-2.5">' +
      '<span class="shrink-0 mt-0.5' + (s.state === 'syncing' ? ' animate-spin' : '') + '">' + icon(x.ic, 'w-4 h-4') + '</span>' +
      '<span class="min-w-0 text-sm"><b class="block">' + e(x.t) + '</b><span class="block text-xs opacity-80">' + e(x.s) + '</span>' +
      (s.error ? '<span class="block text-xs mt-1 font-semibold">' + e(s.error) + '</span>' : '') +
      (s.lastSync && s.state !== 'ok' ? '<span class="block text-[11px] mt-1 text-black/45">Última sincronização: ' + e(whenText(s.lastSync)) + '</span>' : '') +
      '</span></div>';
  }

  function connectSheet(form) {
    var url = form.url.value.trim(), chave = form.chave.value.trim();
    var err = $('#sheetErr'), btn = form.querySelector('[type="submit"]');
    err.textContent = '';
    var local = Store.all().length;
    withBusy(btn, Sync.test(url, chave), 'Conectando…').then(function (info) {
      var n = info.reservas;
      var ask = n > 0 && local > 0 ? confirmDialog({
        title: 'Juntar com a planilha?', icon: 'file-spreadsheet',
        text: 'A planilha <b>' + e(info.planilha.nome) + '</b> já tem <b>' + n + ' reserva' + (n === 1 ? '' : 's') + '</b> e este aparelho tem <b>' + local + '</b>.<br><br>' +
          '<b>Juntar</b>: envia as deste aparelho e mantém as da planilha (se a mesma reserva estiver nos dois, fica a alteração mais recente).<br>' +
          '<b>Usar só a planilha</b>: descarta as reservas deste aparelho.',
        okText: 'Juntar', altText: 'Usar só a planilha', cancelText: 'Cancelar'
      }).then(function (c) { return c === true ? 'merge' : c === 'alt' ? 'remote' : null; }) :
        Promise.resolve(n > 0 ? 'remote' : 'merge');
      return ask.then(function (mode) {
        if (!mode) return;
        return Sync.connect(url, chave, info, mode).then(function () {
          var st = Sync.status();
          if (st.state === 'error') toast(st.error, 'error');
          else toast(mode === 'merge' && local ? local + ' reserva(s) enviada(s) para a planilha' : 'Planilha ligada', 'ok');
          if (state.view === 'ajustes') route();
        });
      });
    }).catch(function (x) { err.textContent = x.message; });
  }

  function sheetHelp() {
    var on = Sync.isOn();
    confirmDialog({
      title: on ? 'Como funciona a planilha' : 'Criar a planilha', icon: 'file-spreadsheet', okText: 'Entendi', cancelText: false,
      altText: on ? null : 'Copiar código do script',
      text: (on ? '' :
        '<ol class="sync-steps text-sm text-black/70">' +
        '<li>No computador, crie uma planilha nova em <b>sheets.google.com</b>.</li>' +
        '<li>Menu <b>Extensões → Apps Script</b>. Apague o código e cole o do ficheiro <code>apps-script/Codigo.gs</code> (botão abaixo copia).</li>' +
        '<li>Na linha <code>CHAVE_DE_ACESSO</code>, troque <code>troque-esta-chave</code> por uma senha sua e salve.</li>' +
        '<li><b>Implantar → Nova implantação</b> → tipo <b>App da Web</b>. Executar como: <b>Eu</b>. Quem pode acessar: <b>Qualquer pessoa</b>. Autorize.</li>' +
        '<li>Copie o URL que termina em <code>/exec</code> e cole-o aqui com a chave.</li></ol>') +
        '<p class="' + (on ? '' : 'mt-3 ') + 'text-xs text-black/55 leading-relaxed">Abas: <b>Reservas</b>, <b>Pagamentos</b> e <b>Ajustes</b>. Pode editar as células: o app recebe as mudanças em até 1 minuto. Para criar uma reserva na planilha, preencha pelo menos <b>Data do evento</b> e <b>Cliente</b>. Se a mesma reserva for alterada em dois sítios, fica a alteração mais recente. ' + (Sync.isFixed() ? 'Cada aparelho só precisa da senha na primeira vez.' : 'Faça a ligação em cada aparelho (celular e PC) com o mesmo URL e chave.') + '</p>'
    }).then(function (r) {
      if (r !== 'alt') return;
      fetch('apps-script/Codigo.gs', { cache: 'no-store' }).then(function (res) { if (!res.ok) throw 0; return res.text(); })
        .then(function (code) { return navigator.clipboard.writeText(code); })
        .then(function () { toast('Código do script copiado', 'ok'); setTimeout(sheetHelp, 400); },
          function () { toast('Não foi possível copiar. Abra o ficheiro apps-script/Codigo.gs da pasta do app.', 'error'); });
    });
  }

  function disconnectSheet() {
    if (Sync.isFixed()) {
      var pend = Store.pendingCount();
      confirmDialog({
        title: 'Sair deste aparelho?', icon: 'lock', tone: 'danger', okText: 'Sair',
        text: 'A cópia das reservas guardada neste aparelho é apagada e a senha será pedida de novo. <b>A planilha não é alterada.</b>' + (pend ? '<br><br><b class="text-bad">Há ' + pend + ' alteração(ões) que ainda não chegaram à planilha e serão perdidas.</b>' : '')
      }).then(function (ok) { if (!ok) return; Sync.logout(true); state.selectedId = null; location.hash = '#/agenda'; route(); });
      return;
    }
    confirmDialog({
      title: 'Desligar a planilha?', icon: 'unlink',
      text: 'Este aparelho deixa de sincronizar. Os dados continuam na planilha e na cópia deste aparelho.' + (Store.pendingCount() ? '<br><br><b class="text-bad">Há ' + Store.pendingCount() + ' alteração(ões) que ainda não chegaram à planilha.</b>' : ''),
      okText: 'Desligar', tone: 'danger'
    }).then(function (ok) { if (!ok) return; Sync.disconnect(); toast('Planilha desligada', 'info'); route(); });
  }

  /* Ecrã de entrada (modo planilha fixa): pede a senha uma única vez em cada aparelho */
  function showLogin() {
    var root = $('#loginRoot');
    if (!root || $('#loginForm')) return;
    root.innerHTML =
      '<div class="fixed inset-0 z-[80] bg-obsidian text-white flex items-center justify-center p-6 overflow-y-auto">' +
      '<form id="loginForm" class="w-full max-w-sm text-center pop-in" novalidate autocomplete="on">' +
      '<img src="assets/brand/logo-rc-house.png" alt="RC House" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full ring-2 ring-gold/60 shadow-lift mx-auto">' +
      '<div class="mt-5 font-display text-[28px] font-semibold leading-tight">RC House</div>' +
      '<div class="text-[11px] uppercase tracking-[.2em] text-gold">Agenda &amp; Contratos</div>' +
      '<label class="block mt-6 text-left"><span class="block text-[11px] font-bold uppercase tracking-wider text-white/55 mb-1.5">Senha de acesso</span>' +
      '<input class="input !bg-white !text-obsidian" name="chave" type="password" autocomplete="current-password" placeholder="Digite a senha" autofocus></label>' +
      '<p id="loginErr" class="mt-2 text-left text-xs font-semibold text-bad min-h-[16px]"></p>' +
      '<button type="submit" class="btn-gold btn-lg w-full mt-2">' + icon('lock', 'w-5 h-5') + 'Entrar</button>' +
      '<p class="mt-4 text-xs text-white/45 leading-relaxed">A senha só é pedida uma vez neste aparelho. As reservas ficam na planilha da RC House e aparecem iguais em todos os aparelhos.</p>' +
      '</form></div>';
    document.documentElement.style.overflow = 'hidden';
    var form = $('#loginForm');
    setTimeout(function () { form.chave.focus(); }, 50);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('[type="submit"]'), err = $('#loginErr');
      err.textContent = '';
      withBusy(btn, Sync.login(form.chave.value), 'Entrando…').then(function () {
        root.innerHTML = '';
        document.documentElement.style.overflow = '';
        var n = Store.all().length;
        toast(n ? 'Tudo pronto! ' + n + ' reserva' + (n === 1 ? '' : 's') + ' carregada' + (n === 1 ? '' : 's') + ' da planilha' : 'Ligado à planilha', 'ok');
        route();
      }).catch(function (x) { err.textContent = x.message; form.chave.select(); });
    });
  }

  /* Dados novos vindos da planilha: atualiza o ecrã sem perder o que está a ser digitado */
  var fillSeen = null; // situação do preenchimento de cada reserva na última atualização
  function fillSnapshot() { var m = {}; Store.all().forEach(function (b) { m[b.id] = preench(b); }); return m; }
  function onRemoteChange() {
    var now = fillSnapshot(), changed = [];
    if (fillSeen) Object.keys(now).forEach(function (id) { if (fillSeen[id] === 'aguardando' && (now[id] === 'recebido' || now[id] === 'assinado')) changed.push(id); });
    fillSeen = now;
    changed.forEach(function (id) { var cb = Store.get(id); toast(U.firstName(cb.locatario.nome) + (preench(cb) === 'assinado' ? ' assinou o contrato ✅' : ' enviou os dados do contrato'), 'ok'); });
    var drawer = $('#overlayRoot .sheet-up [data-id]');
    if (changed.length && overlayOpen && drawer && changed.indexOf(drawer.getAttribute('data-id')) >= 0 && !panelActive()) openBooking(drawer.getAttribute('data-id'));
    if (state.view === 'agenda') renderMonthParts();
    else if (state.view === 'reservas') { renderFilterBar(); renderResList(); renderRightPanel(); }
    else if (state.view === 'ajustes') {
      renderSigCard();
      var sf = $('#settingsForm');
      if (sf && !sf.contains(document.activeElement)) {
        var cfg = Store.getSettings();
        $$('[name]', sf).forEach(function (el) { var v = cfg[el.name]; el.value = el.getAttribute('data-mask') === 'money' ? (v ? U.formatBRL(v, false) : '') : (v == null ? '' : v); });
      }
    }
    // gaveta de detalhes aberta (celular) com uma reserva que foi excluída noutro aparelho
    var sheet = $('#overlayRoot .sheet-up');
    if (overlayOpen && sheet && state.contractReturn == null) {
      var el = sheet.querySelector('[data-id]');
      if (el && !Store.get(el.getAttribute('data-id'))) closeOverlay();
    }
  }

  /* =====================================================================
     PWA: Service Worker + pop-up de instalação
     ===================================================================== */
  var deferredPrompt = null;
  var isStandalone = function () { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; };
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) { reg.update().catch(function () { }); })
        .catch(function (err) { console.warn('[RC] SW não registado', err); });
      // (o recarregamento automático após atualização fica no index.html)
    });
  }

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    deferredPrompt = ev;
    updateInstallUI();
    maybeShowInstallBanner();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null; hideInstallBanner(); updateInstallUI();
    toast('App RC House instalado na tela inicial 🎉', 'ok');
  });

  function updateInstallUI() {
    var installed = isStandalone();
    $$('.js-install-btn').forEach(function (b) { b.classList.toggle('hidden', installed); });
    var st = $('#installState');
    if (st) st.textContent = installed ? 'Instalado neste aparelho ✓' : deferredPrompt ? 'Pronto para instalar na tela inicial' : 'Adicione o atalho à tela inicial';
  }

  function maybeShowInstallBanner() {
    if (isStandalone()) return;
    var last = 0; try { last = +localStorage.getItem(INSTALL_DISMISS_KEY) || 0; } catch (x) { }
    if (Date.now() - last < 3 * 86400000) return;
    setTimeout(showInstallBanner, 1600);
  }

  function showInstallBanner() {
    if (isStandalone() || $('#installBanner')) return;
    $('#installRoot').innerHTML =
      '<div id="installBanner" class="fixed z-[60] left-3 right-3 bottom-[96px] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[380px] pop-in">' +
      '<div class="bg-obsidian/95 backdrop-blur-xl text-white rounded-[24px] p-4 shadow-lift border border-gold/20">' +
      '<div class="flex items-start gap-3">' +
      '<img src="assets/brand/logo-rc-house.png" alt="RC House" class="w-14 h-14 rounded-full ring-2 ring-gold/50 shrink-0">' +
      '<div class="flex-1 min-w-0"><div class="font-bold text-[15px]">📲 Instalar App RC House</div>' +
      '<p class="text-[13px] text-white/70 leading-snug mt-0.5">Adicione o atalho na tela inicial do seu celular para gerenciar reservas rapidamente</p></div>' +
      '<button type="button" data-action="dismiss-install" class="w-8 h-8 -mr-1 -mt-1 rounded-full hover:bg-white/10 grid place-items-center text-white/60 shrink-0" aria-label="Fechar">' + icon('x', 'w-4 h-4') + '</button>' +
      '</div>' +
      '<button type="button" data-action="install" class="btn-gold btn-lg w-full mt-3">' + icon('download', 'w-5 h-5') + 'Criar Atalho Agora</button>' +
      '</div></div>';
  }
  function hideInstallBanner() { $('#installRoot').innerHTML = ''; }

  function doInstall() {
    if (deferredPrompt) {
      var p = deferredPrompt; deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (c) {
        hideInstallBanner(); updateInstallUI();
        if (c && c.outcome === 'accepted') toast('Instalando o app…', 'ok');
      });
      return;
    }
    hideInstallBanner();
    var steps = isIOS ?
      '<ol class="mt-3 space-y-2 text-left"><li>1. Toque em <b>Partilhar</b> ' + icon('share-2', 'w-4 h-4 inline -mt-0.5') + ' na barra do Safari.</li><li>2. Escolha <b>Adicionar ao Ecrã principal</b>.</li><li>3. Toque em <b>Adicionar</b>.</li></ol>' :
      '<ol class="mt-3 space-y-2 text-left"><li>1. No Chrome, toque no menu <b>⋮</b> (canto superior direito).</li><li>2. Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>3. Confirme em <b>Instalar</b>.</li></ol><p class="mt-3 text-xs text-black/45">No PC: clique no ícone de instalar na barra de endereço do Chrome/Edge.</p>';
    confirmDialog({ title: 'Criar atalho na tela inicial', text: steps, okText: 'Entendi', cancelText: false, icon: 'smartphone' });
  }

  /* =====================================================================
     Delegação global de cliques
     ===================================================================== */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-action]');
    if (!t) return;
    var a = t.getAttribute('data-action');
    var id = t.getAttribute('data-id');
    switch (a) {
      case 'select-day': {
        // 1 reserva → abre os detalhes; dia livre ou várias reservas → popover junto ao dia
        var iso = t.getAttribute('data-date');
        var dayList = Store.byDate(iso);
        state.selectedDate = iso;
        renderCalendar(); // marca o dia selecionado (borda) sem apagar a situação
        if (dayList.length === 1 && dayList[0].status !== 'cancelled') { openBooking(dayList[0].id); break; }
        var cell = document.querySelector('[data-date="' + iso + '"]');
        if (cell) openDayPopover(iso, cell);
        break;
      }
      case 'cal-prev': shiftMonth(-1); break;
      case 'cal-next': shiftMonth(1); break;
      case 'cal-today': { var n = new Date(); state.calY = n.getFullYear(); state.calM = n.getMonth(); state.selectedDate = U.todayISO(); renderMonthParts(); break; }
      case 'open-booking': openBooking(id); break;
      case 'close-overlay': ev.preventDefault(); closeOverlay(); break;
      case 'close-pop': closeDayPopover(); break;
      case 'close-panel':
        state.selectedId = null; renderRightPanel();
        if ($('#resList')) renderResList();
        if ($('#calendarCard')) renderCalendar();
        break;
      case 'open-contract': state.contractReturn = id; openContract(id); break; // contrato numa vista própria, com retorno à reserva
      case 'download-pdf': downloadPdf(id, t); break;
      case 'share-wa': shareWhatsApp(id, t); break;
      case 'print-contract': printContract(id); break;
      case 'mark-signed': markSigned(id); break;
      case 'mark-pending': setStatusWithConfirm(id, 'pending'); break;
      case 'cancel-booking': setStatusWithConfirm(id, 'cancelled'); break;
      case 'reactivate': setStatusWithConfirm(id, 'pending'); break;
      case 'delete-booking': deleteBooking(id); break;
      case 'add-payment': paymentDialog(id); break;
      case 'del-payment': deletePayment(id, t.getAttribute('data-pid')); break;
      case 'fill-mode': if (state.form) { state.form._fillMode = t.getAttribute('data-value'); applyFillMode(); } break;
      case 'fill-start': startFill(id, false); break;
      case 'sig-edit': signatureDialog({}).then(function (img) { if (!img) return; Store.saveSettings({ assinaturaLocadora: img }); toast('Assinatura guardada', 'ok'); renderSigCard(); }); break;
      case 'fill-new': startFill(id, true); break;
      case 'fill-copy': { var fb = Store.get(id); if (fb && preench(fb) === 'aguardando') { if (!publicBase()) { fillLinkDialog(id, false); break; } copyText(fillLink(fb)); } break; }
      case 'fill-wa': { var fw = Store.get(id); if (fw && preench(fw) === 'aguardando') { if (!publicBase()) { fillLinkDialog(id, false); break; } fillWhatsApp(fw); } break; }
      case 'fill-cancel':
        confirmDialog({ title: 'Cancelar o link?', icon: 'x', tone: 'danger', okText: 'Cancelar link', cancelText: 'Voltar', text: 'O locatário deixa de conseguir enviar os dados por este link. Você pode preencher os dados à mão em <b>Editar reserva</b>.' })
          .then(function (ok) { if (!ok) return; Store.setPreenchimento(id, null); toast('Link cancelado', 'info'); refreshBooking(id); });
        break;
      case 'fill-reopen':
        confirmDialog({ title: 'Reabrir o preenchimento?', icon: 'rotate-ccw', okText: 'Reabrir', text: 'O mesmo link volta a funcionar e o locatário pode corrigir os dados que enviou. Os dados atuais continuam no contrato até ele reenviar.' })
          .then(function (ok) { if (!ok) return; Store.setPreenchimento(id, { status: 'aguardando' }); toast('Preenchimento reaberto · envie o link de novo se precisar', 'ok'); refreshBooking(id); });
        break;
      case 'fill-done': Store.setPreenchimento(id, { status: 'concluido' }); toast('Dados do locatário revisados', 'ok'); refreshBooking(id); break;
      case 'copy-pix': {
        var pix = t.getAttribute('data-pix');
        (navigator.clipboard ? navigator.clipboard.writeText(pix) : Promise.reject()).then(function () { toast('Chave Pix copiada', 'ok'); }, function () { toast(pix, 'info'); });
        break;
      }
      case 'toggle-section': toggleSection(t.getAttribute('data-target')); break;
      case 'set-filter': state.filter = t.getAttribute('data-value'); renderFilterBar(); renderResList(); break;
      case 'clear-filters': {
        state.filter = 'all'; state.search = '';
        var si = $('#searchInput'); if (si) si.value = '';
        renderFilterBar(); renderResList(); break;
      }
      case 'contract-back': {
        var back = state.contractReturn; state.contractReturn = null;
        if (back && !panelActive() && Store.get(back)) openBooking(back); // celular: volta para a gaveta da reserva
        else closeOverlay();                                              // desktop: a reserva continua selecionada no painel
        break;
      }
      case 'pick-event': {
        var inp = $('[name="evento"]'); inp.value = t.getAttribute('data-value');
        inp.dispatchEvent(new Event('input', { bubbles: true })); break;
      }
      case 'recalc-saldo': {
        var f = state.form; f.valores.saldoManual = false;
        f.valores.saldo = Math.max(0, (f.valores.total || 0) - (f.valores.sinal || 0));
        $('[name="valores.saldo"]').value = U.formatBRL(f.valores.saldo, false);
        updateFormDerived(); break;
      }
      case 'cancel-form': history.length > 1 ? history.back() : (location.hash = '#/agenda'); break;
      case 'install': doInstall(); break;
      case 'dismiss-install':
        try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (x) { }
        hideInstallBanner(); toast('Pode instalar depois pelo botão "Instalar" no menu', 'info'); break;
      case 'sheet-help': sheetHelp(); break;
      case 'sheet-sync': Sync.now().then(function (changed) { var st = Sync.status(); toast(st.state === 'ok' ? (changed ? 'Dados atualizados da planilha' : 'Tudo sincronizado') : (st.error || 'Sem internet'), st.state === 'ok' ? 'ok' : 'error'); }); break;
      case 'sheet-disconnect': disconnectSheet(); break;
    }
  });

  /* =====================================================================
     Arranque
     ===================================================================== */
  function boot() {
    hydrateIcons(document);
    Store.init().then(function (how) {
      if (how === 'restored') toast('Dados recuperados da cópia de segurança', 'ok');
      window.addEventListener('hashchange', route);
      if (!location.hash) history.replaceState(null, '', '#/agenda');
      route();
      updateInstallUI();
      fillSeen = fillSnapshot();
      Contract.setLocadoraSignature(function () { return Store.getSettings().assinaturaLocadora || ''; });
      Store.onChange(function (db, info) { if (info && info.source === 'remote') onRemoteChange(); else fillSeen = fillSnapshot(); });
      Sync.onStatus(renderSyncPills);
      renderSyncPills();
      setInterval(renderSyncPills, 60000); // atualiza o "há x min"
      Sync.onLogin(showLogin);
      if (Sync.needsLogin()) {
        if (Sync.hasFixedKey()) Sync.login(Sync.fixedKey()).then(function () { route(); }, function (x) { toast(x.message, 'error'); });
        else showLogin();
      } else if (Sync.isOn()) Sync.now();
      // iOS não dispara beforeinstallprompt: mostra o banner com instruções
      if (isIOS && !isStandalone()) maybeShowInstallBanner();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
