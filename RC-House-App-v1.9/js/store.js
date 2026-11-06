/* =========================================================================
   RC House — Camada de dados
   -------------------------------------------------------------------------
   • Persistência imediata em localStorage (síncrona) + espelho em IndexedDB
     (cópia de segurança automática caso o localStorage seja limpo).
   • Fila de alterações pendentes para a Planilha Google (ver js/sync.js):
     cada reserva criada/alterada/excluída e cada mudança nos Ajustes fica
     marcada até a planilha confirmar que a recebeu — funciona offline.
   ========================================================================= */
(function () {
  'use strict';

  /* v2: começa do zero — os dados de teste das versões anteriores (rchouse.db.v1) são apagados */
  var KEY = 'rchouse.db.v2';
  var QUEUE_KEY = 'rchouse.syncq.v2';
  var OLD_KEYS = ['rchouse.db.v1', 'rchouse.syncq.v1', 'rchouse.sheets.v1'];
  var SCHEMA_VERSION = 2;
  var IDB_NAME = 'rchouse-v2';
  var OLD_IDB = 'rchouse';
  var IDB_STORE = 'snapshots';

  var DEFAULT_SETTINGS = {
    locadorNome: 'Geisemone Rocha da Silva',
    locadorCpf: '',
    locadorFone: '(34) 9209-0119',
    chavePix: '',
    taxaHoraExcedente: 0,      // centavos
    valorDiariaPadrao: 0,      // centavos (opcional)
    localAssinatura: 'Uberlândia - MG',
    horaEntradaPadrao: '08:00',
    horaSaidaPadrao: '22:00'
  };

  /* Estrutura de um agendamento
     {
       id, status: 'pending' | 'confirmed' | 'cancelled',
       data: 'YYYY-MM-DD', entrada: 'HH:MM', saida: 'HH:MM', evento,
       locador:   { nome, cpf, fone },
       locatario: { nome, cpf, rg, fone },
       valores:   { total, sinal, caucao, saldo, saldoManual, chavePix, taxaHora }   // centavos
       assinatura:{ local, data: 'YYYY-MM-DD' },
       pagamentos:[ { id, valor, data: 'YYYY-MM-DD', forma, obs, createdAt } ]   // pagamentos do saldo após o sinal
       createdAt, updatedAt, signedAt, cancelledAt   // ISO datetime
     } */

  var db = emptyDb();
  var queue = { dirty: {}, deleted: {}, settings: false };
  var listeners = [];

  function emptyDb() {
    return { schemaVersion: SCHEMA_VERSION, settings: Object.assign({}, DEFAULT_SETTINGS), settingsUpdatedAt: null, bookings: [] };
  }

  function load() {
    try {
      var q = localStorage.getItem(QUEUE_KEY);
      if (q) queue = normalizeQueue(JSON.parse(q));
    } catch (e) { }
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { db = normalize(JSON.parse(raw)); return true; }
    } catch (e) { console.warn('[RC] Falha ao ler localStorage', e); }
    return false;
  }

  function normalizeQueue(q) {
    q = q || {};
    return { dirty: q.dirty || {}, deleted: q.deleted || {}, settings: !!q.settings };
  }

  /* Garante que todos os campos existem (dados vindos da planilha, que pode ser editada à mão) */
  function normalizeBooking(b) {
    var s = db && db.settings ? db.settings : DEFAULT_SETTINGS;
    b.status = STATUS_OK[b.status] ? b.status : 'pending';
    b.entrada = b.entrada || s.horaEntradaPadrao || '08:00';
    b.saida = b.saida || s.horaSaidaPadrao || '22:00';
    b.evento = b.evento || '';
    b.locador = Object.assign({ nome: '', cpf: '', fone: '' }, b.locador || {});
    b.locatario = Object.assign({ nome: '', cpf: '', rg: '', fone: '' }, b.locatario || {});
    b.valores = Object.assign({ total: 0, sinal: 0, caucao: 0, saldo: 0, saldoManual: false, chavePix: '', taxaHora: 0 }, b.valores || {});
    b.assinatura = Object.assign({ local: s.localAssinatura || 'Uberlândia - MG', data: (b.createdAt || new Date().toISOString()).slice(0, 10) }, b.assinatura || {});
    b.pagamentos = Array.isArray(b.pagamentos) ? b.pagamentos.filter(function (p) { return p && p.id; }) : [];
    return b;
  }
  var STATUS_OK = { pending: 1, confirmed: 1, cancelled: 1 };

  function normalize(data) {
    data = data || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {}),
      settingsUpdatedAt: data.settingsUpdatedAt || null,
      bookings: Array.isArray(data.bookings) ? data.bookings.filter(function (b) { return b && b.id && b.data; }).map(normalizeBooking) : []
    };
  }

  function saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) { }
  }

  /* info.source = 'local' (alteração feita neste aparelho) | 'remote' (veio da planilha) */
  function persist(info) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { console.warn('[RC] Falha ao gravar localStorage', e); }
    saveQueue();
    idbWrite(db);
    info = info || { source: 'local' };
    listeners.forEach(function (fn) { try { fn(db, info); } catch (e) { console.error(e); } });
  }

  function markDirty(b) { queue.dirty[b.id] = b.updatedAt || new Date().toISOString(); delete queue.deleted[b.id]; }
  function markDeleted(id) { delete queue.dirty[id]; queue.deleted[id] = true; }

  /* ---------- Espelho IndexedDB ---------- */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) return reject(new Error('sem IndexedDB'));
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbWrite(data) {
    idbOpen().then(function (idb) {
      var tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(data)), 'latest');
    }).catch(function () { });
  }
  function idbRead() {
    return idbOpen().then(function (idb) {
      return new Promise(function (resolve) {
        var tx = idb.transaction(IDB_STORE, 'readonly');
        var r = tx.objectStore(IDB_STORE).get('latest');
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function sortBookings(list) {
    return list.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : (a.entrada || '').localeCompare(b.entrada || '');
    });
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  var Store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,

    init: function () {
      try { OLD_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { }
      try { if (window.indexedDB) indexedDB.deleteDatabase(OLD_IDB); } catch (e) { }
      var ok = load();
      if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () { }); }
      if (!ok) {
        // localStorage vazio: tenta recuperar a última cópia do IndexedDB
        return idbRead().then(function (snap) {
          if (snap && snap.bookings && snap.bookings.length) {
            db = normalize(snap);
            try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { }
            return 'restored';
          }
          return 'fresh';
        });
      }
      return Promise.resolve('loaded');
    },

    onChange: function (fn) { listeners.push(fn); },

    /* ---- Configurações ---- */
    getSettings: function () { return Object.assign({}, db.settings); },
    saveSettings: function (s) {
      db.settings = Object.assign({}, db.settings, s);
      db.settingsUpdatedAt = new Date().toISOString();
      queue.settings = true;
      persist();
    },

    /* ---- Agendamentos ---- */
    all: function () { return sortBookings(db.bookings); },
    get: function (id) { return db.bookings.find(function (b) { return b.id === id; }) || null; },
    byDate: function (iso) { return sortBookings(db.bookings.filter(function (b) { return b.data === iso; })); },
    activeByDate: function (iso, exceptId) {
      return db.bookings.find(function (b) { return b.data === iso && b.status !== 'cancelled' && b.id !== exceptId; }) || null;
    },
    byMonth: function (year, month) {
      var prefix = year + '-' + U.pad(month + 1) + '-';
      return sortBookings(db.bookings.filter(function (b) { return b.data.indexOf(prefix) === 0; }));
    },

    save: function (booking) {
      var now = new Date().toISOString();
      var existing = booking.id ? Store.get(booking.id) : null;
      if (existing) {
        // os pagamentos são geridos à parte (addPayment/removePayment): o formulário não os sobrescreve
        var pays = existing.pagamentos;
        Object.assign(existing, booking, { updatedAt: now, pagamentos: pays || [] });
        normalizeBooking(existing);
        markDirty(existing);
      } else {
        booking.id = booking.id || U.uid();
        booking.status = booking.status || 'pending';
        booking.createdAt = now;
        booking.updatedAt = now;
        normalizeBooking(booking);
        db.bookings.push(booking);
        markDirty(booking);
      }
      persist();
      return Store.get(booking.id);
    },

    setStatus: function (id, status) {
      var b = Store.get(id); if (!b) return null;
      var now = new Date().toISOString();
      b.status = status;
      b.updatedAt = now;
      if (status === 'confirmed') { b.signedAt = now; delete b.cancelledAt; }
      if (status === 'cancelled') b.cancelledAt = now;
      if (status === 'pending') {
        delete b.signedAt; delete b.cancelledAt;
        // voltar a "aguardando" anula a assinatura eletrónica do locatário (se houver)
        if (b.assinaturaLocatario) b.assinaturaLocatario = null;
        if (b.preenchimento && b.preenchimento.status === 'assinado') b.preenchimento = null;
      }
      markDirty(b);
      persist();
      return b;
    },

    /* ---- Pagamentos do saldo (não alteram os valores do contrato) ---- */
    addPayment: function (id, pay) {
      var b = Store.get(id); if (!b) return null;
      b.pagamentos = Array.isArray(b.pagamentos) ? b.pagamentos : [];
      b.pagamentos.push({ id: U.uid(), valor: pay.valor, data: pay.data, forma: pay.forma || '', obs: pay.obs || '', createdAt: new Date().toISOString() });
      b.updatedAt = new Date().toISOString();
      markDirty(b);
      persist();
      return b;
    },
    /* Preenchimento pelo locatário (link): patch = { status, token, enviadoEm, recebidoEm } ou null para cancelar */
    setPreenchimento: function (id, patch) {
      var b = Store.get(id); if (!b) return null;
      b.preenchimento = patch === null ? null : Object.assign({}, b.preenchimento || {}, patch);
      b.updatedAt = new Date().toISOString();
      markDirty(b);
      persist();
      return b;
    },
    removePayment: function (id, payId) {
      var b = Store.get(id); if (!b || !b.pagamentos) return null;
      b.pagamentos = b.pagamentos.filter(function (x) { return x.id !== payId; });
      b.updatedAt = new Date().toISOString();
      markDirty(b);
      persist();
      return b;
    },

    remove: function (id) {
      db.bookings = db.bookings.filter(function (b) { return b.id !== id; });
      markDeleted(id);
      persist();
    },

    /* Apaga só os dados deste aparelho (a planilha não é alterada) */
    clearAll: function () {
      db = emptyDb();
      queue = { dirty: {}, deleted: {}, settings: false };
      persist();
    },

    /* =================================================================
       Sincronização com a Planilha Google (usado por js/sync.js)
       ================================================================= */
    pendingCount: function () {
      return Object.keys(queue.dirty).length + Object.keys(queue.deleted).length + (queue.settings ? 1 : 0);
    },
    /* Pacote a enviar + "recibo" para saber o que confirmar quando a resposta chegar */
    syncPayload: function () {
      var sent = { dirty: Object.assign({}, queue.dirty), deleted: Object.keys(queue.deleted), settings: queue.settings, settingsUpdatedAt: db.settingsUpdatedAt };
      var enviar = Object.keys(sent.dirty).map(Store.get).filter(Boolean).map(clone);
      // a imagem da assinatura do locatário nunca sobe deste aparelho (só a página do locatário a cria)
      enviar.forEach(function (b) { if (b.assinaturaLocatario) delete b.assinaturaLocatario.img; });
      // assinaturas que este aparelho já tem: a planilha não as manda de novo
      var conhecidas = db.bookings.filter(function (b) { return b.assinaturaLocatario && b.assinaturaLocatario.img; })
        .map(function (b) { return b.id + '|' + b.assinaturaLocatario.em; });
      return {
        body: { enviar: enviar, excluir: sent.deleted, conhecidas: conhecidas, ajustes: sent.settings ? clone(db.settings) : null, ajustesAtualizado: sent.settings ? db.settingsUpdatedAt : null },
        sent: sent
      };
    },
    /* Aplica a resposta da planilha: a planilha passa a ser a verdade, exceto o que mudou aqui
       enquanto o pedido estava a caminho (isso continua na fila e vai na próxima vez). */
    syncApply: function (sent, resp) {
      Object.keys(sent.dirty).forEach(function (id) { if (queue.dirty[id] === sent.dirty[id]) delete queue.dirty[id]; });
      sent.deleted.forEach(function (id) { delete queue.deleted[id]; });
      if (sent.settings && db.settingsUpdatedAt === sent.settingsUpdatedAt) queue.settings = false;

      var before = JSON.stringify(db);
      var local = {};
      db.bookings.forEach(function (b) { local[b.id] = b; });
      var list = [], seen = {};
      (resp.reservas || []).forEach(function (b) {
        if (!b || !b.id || !b.data || queue.deleted[b.id]) return;
        seen[b.id] = true;
        var mine = local[b.id];
        if (queue.dirty[b.id] && mine) { list.push(mine); return; }
        var at = b.assinaturaLocatario, la = mine && mine.assinaturaLocatario;
        if (at && !at.img && la && la.img && la.em === at.em) at.img = la.img; // mantém a imagem que já estava aqui
        list.push(normalizeBooking(b));
      });
      Object.keys(queue.dirty).forEach(function (id) { if (!seen[id] && local[id]) list.push(local[id]); });
      db.bookings = list;

      if (!queue.settings && resp.ajustesAtualizado) {
        db.settings = Object.assign({}, DEFAULT_SETTINGS, resp.ajustes || {});
        db.settingsUpdatedAt = resp.ajustesAtualizado;
      }
      var changed = JSON.stringify(db) !== before;
      if (changed) persist({ source: 'remote' }); else saveQueue();
      return changed;
    },
    /* Ao ligar a planilha: as reservas deste aparelho entram na fila (juntar) */
    queueEverything: function () {
      db.bookings.forEach(markDirty);
      persist();
    },
    queueSettings: function () {
      queue.settings = true;
      if (!db.settingsUpdatedAt) db.settingsUpdatedAt = new Date().toISOString();
      saveQueue();
    },
    /* Ao ligar a planilha: descarta o que há neste aparelho e fica só com a planilha */
    resetForRemote: function () {
      db.bookings = [];
      queue = { dirty: {}, deleted: {}, settings: false };
      persist({ source: 'remote' });
    }
  };

  window.Store = Store;
})();
