/* =========================================================================
   RC House — Sincronização com a Planilha Google (via Apps Script)
   -------------------------------------------------------------------------
   O app continua a gravar primeiro no aparelho (funciona offline). Este módulo
   envia a fila de alterações para a planilha e traz de volta a versão da
   planilha — em cada alteração, ao abrir o app, ao voltar a ter internet e a
   cada minuto com o app aberto.
   O script da planilha está em apps-script/Codigo.gs.
   ========================================================================= */
(function () {
  'use strict';

  var CFG_KEY = 'rchouse.sheets.v2';   // só neste aparelho (não vai para a planilha)
  var POLL_MS = 60000, RETRY_MS = 30000, DEBOUNCE_MS = 1500, TIMEOUT_MS = 30000;

  var FIXED = (window.RC_CONFIG && window.RC_CONFIG.planilhaUrl) || '';      // URL fixo no código (js/config.js)
  var FIXED_KEY = (window.RC_CONFIG && window.RC_CONFIG.chave) || '';
  var cfg = readCfg();
  if (FIXED) {
    if (cfg.url && cfg.url !== FIXED) cfg = {};                            // planilha trocada no config.js: liga de novo
    cfg.url = FIXED;
    if (FIXED_KEY) cfg.chave = FIXED_KEY;
  }
  var st = { state: cfg.url && cfg.chave ? 'idle' : 'off', error: cfg.lastError || '', busy: false, again: false };
  var loginListeners = [];
  var timer = null, poll = null, statusListeners = [];

  function readCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  function emit() {
    var s = Sync.status();
    statusListeners.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
  }
  function setState(state, error) {
    st.state = state;
    st.error = error || '';
    cfg.lastError = st.error;
    writeCfg();
    emit();
  }

  function validUrl(url) { return /^https:\/\/script\.google(usercontent)?\.com\/.+\/exec(\?.*)?$/.test(url); }

  /* POST com Content-Type text/plain: o Apps Script aceita sem "preflight" de CORS */
  function request(url, chave, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ chave: chave }, body)),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('A planilha respondeu com erro ' + res.status + '.');
      return res.text();
    }).then(function (text) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error('Resposta inesperada. Confira se a implantação está como "Qualquer pessoa" e se o URL termina em /exec.'); }
      if (!data.ok) throw new Error(data.erro || 'Erro desconhecido na planilha.');
      return data;
    }, function (err) {
      if (err && err.name === 'AbortError') throw new Error('A planilha demorou demais a responder.');
      if (err instanceof TypeError) throw new Error(navigator.onLine === false ? 'Sem internet.' : 'Não foi possível contactar a planilha. Confira o URL.');
      throw err;
    }).finally(function () { if (to) clearTimeout(to); });
  }

  function on() { return !!(cfg.url && cfg.chave && cfg.connected === true); }

  function run() {
    if (!on()) return Promise.resolve(false);
    if (st.busy) { st.again = true; return Promise.resolve(false); }
    if (navigator.onLine === false) { setState('offline'); return Promise.resolve(false); }
    st.busy = true; st.again = false;
    setState('syncing');
    var pack = Store.syncPayload();
    return request(cfg.url, cfg.chave, Object.assign({ acao: 'sync' }, pack.body)).then(function (resp) {
      var changed = Store.syncApply(pack.sent, resp);
      cfg.lastSync = new Date().toISOString();
      if (resp.planilha) { cfg.planilhaUrl = resp.planilha.url; cfg.planilhaNome = resp.planilha.nome; }
      setState('ok');
      return changed;
    }).catch(function (err) {
      console.warn('[RC] Sincronização falhou', err);
      setState(navigator.onLine === false ? 'offline' : 'error', err.message);
      if (FIXED && /chave de acesso incorreta/i.test(err.message)) { Sync.logout(false); return false; } // senha mudou no script: pede de novo, sem apagar nada
      schedule(RETRY_MS);
      return false;
    }).finally(function () {
      st.busy = false;
      if (st.again || Store.pendingCount()) { if (st.state === 'ok') schedule(300); }
    });
  }

  function schedule(ms) {
    if (!on()) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms == null ? DEBOUNCE_MS : ms);
  }

  function startPolling() {
    clearInterval(poll);
    if (!on()) return;
    poll = setInterval(function () { if (document.visibilityState === 'visible') run(); }, POLL_MS);
  }

  var Sync = {
    isOn: on,
    /* Modo "planilha fixa": o URL vem de js/config.js e cada aparelho só precisa da senha */
    isFixed: function () { return !!FIXED; },
    needsLogin: function () { return !!FIXED && !on(); },
    hasFixedKey: function () { return !!FIXED_KEY; },
    fixedKey: function () { return FIXED_KEY; },
    onLogin: function (fn) { loginListeners.push(fn); },
    login: function (chave) {
      chave = String(chave || '').trim();
      if (!chave) return Promise.reject(new Error('Digite a senha.'));
      if (navigator.onLine === false) return Promise.reject(new Error('Sem internet. Na primeira vez é preciso estar conectado.'));
      // Ficaram alterações por enviar (ex.: a senha foi trocada no script com mudanças offline): envia-as
      if (Store.pendingCount()) {
        return request(FIXED, chave, { acao: 'ping' }).then(function (info) { return Sync.connect(FIXED, chave, info, 'merge'); });
      }
      // Caso normal: UM só pedido valida a senha e já traz a agenda toda (a planilha é a única fonte)
      st.busy = true; setState('syncing');
      return request(FIXED, chave, { acao: 'sync', enviar: [], excluir: [] }).then(function (resp) {
        cfg = { url: FIXED, chave: chave, connected: true, lastSync: new Date().toISOString(),
          planilhaUrl: resp.planilha && resp.planilha.url, planilhaNome: resp.planilha && resp.planilha.nome };
        writeCfg();
        Store.resetForRemote();
        Store.syncApply({ dirty: {}, deleted: [], settings: false }, resp);
        if (!resp.ajustesAtualizado) { Store.queueSettings(); schedule(500); } // planilha nova: envia os Ajustes deste aparelho
        st.busy = false;
        setState('ok');
        startPolling();
      }, function (err) { st.busy = false; setState('off'); throw err; });
    },
    /* Sair deste aparelho: esquece a senha. clearData=true apaga também a cópia local (os dados ficam na planilha) */
    logout: function (clearData) {
      clearTimeout(timer); clearInterval(poll);
      cfg = { url: FIXED };
      writeCfg();
      if (clearData) Store.clearAll();
      setState('off');
      loginListeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    },
    config: function () { return { url: cfg.url || '', chave: cfg.chave || '', planilhaUrl: cfg.planilhaUrl || '', planilhaNome: cfg.planilhaNome || '' }; },
    status: function () {
      return { state: st.state, error: st.error, pending: Store.pendingCount(), lastSync: cfg.lastSync || null, on: on(), fixed: !!FIXED, planilhaUrl: cfg.planilhaUrl || '', planilhaNome: cfg.planilhaNome || '' };
    },
    onStatus: function (fn) { statusListeners.push(fn); },

    /* 1º passo da ligação: testa o URL e a chave e diz o que há na planilha */
    test: function (url, chave) {
      url = String(url || '').trim(); chave = String(chave || '').trim();
      if (!validUrl(url)) return Promise.reject(new Error('O URL deve ser o da implantação do Apps Script e terminar em /exec.'));
      if (!chave) return Promise.reject(new Error('Informe a chave de acesso definida no script.'));
      return request(url, chave, { acao: 'ping' });
    },
    /* 2º passo: grava a ligação e faz a primeira sincronização.
       mode: 'merge' (envia o que há neste aparelho e junta) | 'remote' (fica só com a planilha) */
    connect: function (url, chave, info, mode) {
      cfg = { url: String(url).trim(), chave: String(chave).trim(), planilhaUrl: info.planilha && info.planilha.url, planilhaNome: info.planilha && info.planilha.nome, connected: true };
      writeCfg();
      if (mode === 'remote') Store.resetForRemote();
      else Store.queueEverything();
      // os Ajustes da planilha têm prioridade; só envia os deste aparelho se a planilha ainda não tiver
      if (!info.temAjustes) Store.queueSettings();
      startPolling();
      return run();
    },
    disconnect: function () {
      if (FIXED) return Sync.logout(true);
      clearTimeout(timer); clearInterval(poll);
      cfg = {}; writeCfg();
      setState('off');
    },
    now: function () { return run(); },
    schedule: schedule
  };

  /* Gatilhos automáticos */
  Store.onChange(function (db, info) { if (!info || info.source !== 'remote') { emit(); schedule(); } });
  window.addEventListener('online', function () { schedule(200); });
  window.addEventListener('offline', function () { if (cfg.url) setState('offline'); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') schedule(200); });
  startPolling();

  window.Sync = Sync;
})();
