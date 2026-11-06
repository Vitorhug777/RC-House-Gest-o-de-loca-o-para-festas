/* =========================================================================
   RC House — Banco de dados na Planilha Google (Google Apps Script)
   -------------------------------------------------------------------------
   Como usar (passo a passo completo no README.md → "Banco de dados na planilha"):
     1. Crie uma planilha nova no Google Sheets.
     2. Menu Extensões → Apps Script. Apague o que estiver lá e cole ESTE ficheiro.
     3. Troque a CHAVE_DE_ACESSO abaixo por uma senha só sua e guarde.
     4. Implantar → Nova implantação → Tipo "App da Web"
          Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
        Copie o URL que termina em /exec.
     5. No app RC House → Ajustes → Planilha Google: cole o URL e a chave → Conectar.

   A planilha ganha 3 abas, criadas automaticamente:
     • Reservas    — uma linha por reserva
     • Pagamentos  — uma linha por pagamento do saldo (ligada à reserva pelo ID)
     • Ajustes     — padrões do contrato (locadora, Pix, taxa, horários…)

   Pode editar as células à vontade. As colunas "Pago após o sinal", "Falta receber",
   "Cliente" e "Data do evento" (na aba Pagamentos) são calculadas pelo script: não precisa mexer nelas.
   Para criar uma reserva direto na planilha, preencha pelo menos Data do evento e Cliente;
   o ID (1, 2, 3…) é gerado na próxima sincronização. Na aba Pagamentos, "ID da reserva" é esse número.
   Depois de alterar este código, use Implantar → Gerenciar implantações → editar (lápis)
   → Versão: "Nova versão" para o URL continuar o mesmo.
   ========================================================================= */

// ⚠️ Troque por uma senha só sua (mínimo 8 caracteres). A mesma chave vai no app.
const CHAVE_DE_ACESSO = 'troque-esta-chave';

const ABA_RESERVAS = 'Reservas';
const ABA_PAGAMENTOS = 'Pagamentos';
const ABA_AJUSTES = 'Ajustes';
const VERSAO_API = 2;

const STATUS_LABEL = { pending: 'Aguardando assinatura', confirmed: 'Confirmado', cancelled: 'Cancelado' };
/* Preenchimento dos dados pelo locatário (link enviado pelo WhatsApp) */
const PREENCH_LABEL = { aguardando: 'Aguardando assinatura do locatário', assinado: 'Assinado pelo locatário', recebido: 'Dados recebidos', concluido: 'Dados revisados' };
const MAX_IMG = 45000; // caracteres de uma imagem de assinatura (uma célula aceita 50 000)

/* [campo no app, cabeçalho na planilha, tipo]
   tipos: text · date · time · money · bool · status · datetime · calc (fórmula, só leitura) */
const COL_RESERVAS = [
  ['numero', 'ID', 'int'],
  ['status', 'Situação', 'status'],
  ['data', 'Data do evento', 'date'],
  ['entrada', 'Entrada', 'time'],
  ['saida', 'Saída', 'time'],
  ['evento', 'Evento', 'text'],
  ['locatario.nome', 'Cliente', 'text'],
  ['locatario.cpf', 'CPF do cliente', 'text'],
  ['locatario.rg', 'RG do cliente', 'text'],
  ['locatario.fone', 'Telefone do cliente', 'text'],
  ['valores.total', 'Valor total', 'money'],
  ['valores.sinal', 'Sinal', 'money'],
  ['valores.caucao', 'Caução', 'money'],
  ['valores.saldo', 'Saldo do contrato', 'money'],
  ['_pago', 'Pago após o sinal', 'calc'],
  ['_falta', 'Falta receber', 'calc'],
  ['valores.saldoManual', 'Saldo editado à mão', 'bool'],
  ['valores.chavePix', 'Chave Pix', 'text'],
  ['valores.taxaHora', 'Hora excedente', 'money'],
  ['locador.nome', 'Locadora', 'text'],
  ['locador.cpf', 'CPF da locadora', 'text'],
  ['locador.fone', 'Telefone da locadora', 'text'],
  ['assinatura.local', 'Local da assinatura', 'text'],
  ['assinatura.data', 'Data da assinatura', 'date'],
  ['createdAt', 'Criado em', 'datetime'],
  ['updatedAt', 'Atualizado em', 'datetime'],
  ['signedAt', 'Assinado em', 'datetime'],
  ['cancelledAt', 'Cancelado em', 'datetime'],
  ['preenchimento.status', 'Preenchimento do locatário', 'pstatus'],
  ['preenchimento.enviadoEm', 'Link enviado em', 'datetime'],
  ['preenchimento.recebidoEm', 'Dados recebidos em', 'datetime'],
  ['preenchimento.campos', 'Campos enviados pelo locatário', 'text'],
  ['preenchimento.token', 'Token do link', 'text'],  // coluna escondida
  ['assinaturaLocatario.em', 'Assinado pelo locatário em', 'datetime'],
  ['assinaturaLocatario.codigo', 'Código de verificação', 'text'],
  ['assinaturaLocatario.dispositivo', 'Dispositivo da assinatura', 'text'],
  ['assinaturaLocatario.img', 'Assinatura do locatário (imagem)', 'text'],  // coluna escondida
  ['id', 'Código interno', 'text']   // coluna escondida: identifica a reserva entre aparelhos
];

const COL_PAGAMENTOS = [
  ['numero', 'ID', 'int'],
  ['reservaNumero', 'ID da reserva', 'int'],
  ['_cliente', 'Cliente', 'calc'],
  ['_dataEvento', 'Data do evento', 'calc'],
  ['valor', 'Valor', 'money'],
  ['data', 'Data do pagamento', 'date'],
  ['forma', 'Forma', 'text'],
  ['obs', 'Observação', 'text'],
  ['createdAt', 'Registrado em', 'datetime'],
  ['id', 'Código interno', 'text']
];

const AJUSTES = [
  ['locadorNome', 'Nome da locadora', 'text'],
  ['locadorCpf', 'CPF da locadora', 'text'],
  ['locadorFone', 'Telefone da locadora', 'text'],
  ['chavePix', 'Chave Pix padrão', 'text'],
  ['taxaHoraExcedente', 'Taxa por hora excedente', 'money'],
  ['valorDiariaPadrao', 'Valor padrão da diária', 'money'],
  ['localAssinatura', 'Local de assinatura', 'text'],
  ['horaEntradaPadrao', 'Entrada padrão', 'time'],
  ['horaSaidaPadrao', 'Saída padrão', 'time'],
  ['assinaturaLocadora', 'Assinatura da locadora (imagem)', 'text'],
  ['_atualizado', 'Atualizado em', 'datetime']
];

const FORMATOS = {
  text: '@', time: '@', status: '@', pstatus: '@',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm:ss',
  money: '"R$" #,##0.00'
};

/* =========================================================================
   Entrada da API
   ========================================================================= */
function doGet() {
  return ContentService.createTextOutput(
    'API da RC House a funcionar ✔\nCole este endereço no app: Ajustes → Planilha Google.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const publica = req.acao === 'convite_ler' || req.acao === 'convite_enviar'; // página do locatário: só o token, sem senha
    if (!publica) verificarChave_(req.chave);
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (req.acao === 'ping') out = ping_();
      else if (req.acao === 'sync') out = sincronizar_(req);
      else if (req.acao === 'convite_ler') out = conviteLer_(req);
      else if (req.acao === 'convite_enviar') out = conviteEnviar_(req);
      else throw new Error('Ação desconhecida: ' + req.acao);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    out = { ok: false, erro: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function verificarChave_(chave) {
  const certa = PropertiesService.getScriptProperties().getProperty('CHAVE_DE_ACESSO') || CHAVE_DE_ACESSO;
  if (!certa || certa === 'troque-esta-chave' || certa.length < 8) {
    throw new Error('Defina uma CHAVE_DE_ACESSO (8+ caracteres) no Apps Script e crie uma nova versão da implantação.');
  }
  if (String(chave || '') !== certa) throw new Error('Chave de acesso incorreta.');
}

function ping_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = lerTudo_(ss);
  if (db.mudou) gravarTudo_(ss, db);
  return {
    ok: true, versao: VERSAO_API,
    planilha: { nome: ss.getName(), url: ss.getUrl() },
    reservas: db.reservas.length,
    pagamentos: db.reservas.reduce(function (t, b) { return t + b.pagamentos.length; }, 0),
    temAjustes: !!db.ajustesAtualizado
  };
}

/* Recebe as alterações do aparelho, aplica-as (a mais recente ganha) e devolve tudo */
function sincronizar_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = lerTudo_(ss);
  const porId = {};
  db.reservas.forEach(function (b) { porId[b.id] = b; });
  const rejeitadas = [];
  const conhecidas = {};
  (req.conhecidas || []).forEach(function (k) { conhecidas[String(k)] = true; });

  (req.excluir || []).forEach(function (id) {
    if (porId[id]) { delete porId[id]; db.mudou = true; }
  });

  (req.enviar || []).forEach(function (b) {
    if (!b || !b.id || !b.data) return;
    const atual = porId[b.id];
    if (atual && ms_(atual.updatedAt) > ms_(b.updatedAt)) { rejeitadas.push(b.id); return; } // a planilha tem uma versão mais nova
    protegerDadosLocatario_(atual, b);
    const assinada = atual && atual.assinaturaLocatario && atual.assinaturaLocatario.em;
    if (b.assinaturaLocatario === null) b.assinaturaLocatario = {};                 // a RC House alterou o contrato: assinatura removida
    else b.assinaturaLocatario = assinada ? atual.assinaturaLocatario : {};          // só a página do locatário cria assinaturas
    const linhasPag = {}, numPag = {};
    if (atual) { b._linha = atual._linha; atual.pagamentos.forEach(function (p) { linhasPag[p.id] = p._linha; numPag[p.id] = p.numero; }); }
    b.numero = atual ? atual.numero : 0;                                       // o número é sempre dado pela planilha
    b.pagamentos = (Array.isArray(b.pagamentos) ? b.pagamentos : []).map(function (p) { return Object.assign({}, p, { _linha: linhasPag[p.id], numero: numPag[p.id] || 0 }); });
    porId[b.id] = b;
    db.mudou = true;
  });

  if (req.ajustes && (!db.ajustesAtualizado || ms_(req.ajustesAtualizado) >= ms_(db.ajustesAtualizado))) {
    db.ajustes = Object.assign({}, db.ajustes, req.ajustes);
    db.ajustesAtualizado = req.ajustesAtualizado || new Date().toISOString();
    db.mudouAjustes = true;
  }

  db.reservas = Object.keys(porId).map(function (k) { return porId[k]; });
  numerar_(db);
  if (db.mudou || db.mudouAjustes) gravarTudo_(ss, db);

  return {
    ok: true, versao: VERSAO_API,
    planilha: { nome: ss.getName(), url: ss.getUrl() },
    reservas: db.reservas.map(completar_(db.ajustes)).map(function (r) {
      // imagem da assinatura só vai para o aparelho que ainda não a tem (poupa dados a cada sincronização)
      if (r.assinaturaLocatario && conhecidas[r.id + '|' + r.assinaturaLocatario.em]) delete r.assinaturaLocatario.img;
      return r;
    }),
    ajustes: db.ajustes,
    ajustesAtualizado: db.ajustesAtualizado || null,
    rejeitadas: rejeitadas,
    agora: new Date().toISOString()
  };
}

/* =========================================================================
   Leitura
   ========================================================================= */
function lerTudo_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const shR = prepararAba_(ss, ABA_RESERVAS, COL_RESERVAS);
  const shP = prepararAba_(ss, ABA_PAGAMENTOS, COL_PAGAMENTOS);
  const shA = prepararAjustes_(ss);
  const db = { reservas: [], brutosR: [], brutosP: [], ajustes: {}, ajustesAtualizado: null, mudou: false, mudouAjustes: false };

  /* Ajustes */
  const aj = shA.getLastRow() > 1 ? shA.getRange(2, 1, shA.getLastRow() - 1, 3).getValues() : [];
  aj.forEach(function (r) {
    const def = AJUSTES.find(function (a) { return a[0] === String(r[2]).trim() || a[1] === String(r[0]).trim(); });
    if (!def) return;
    const v = deCelula_(r[1], def[2], tz);
    if (def[0] === '_atualizado') db.ajustesAtualizado = v || null;
    else if (v !== '' && v != null) db.ajustes[def[0]] = v;
  });

  /* Reservas */
  const tR = lerTabela_(shR, COL_RESERVAS);
  const vistos = {};
  tR.linhas.forEach(function (row) {
    if (linhaVazia_(row, tR.calc)) return;
    const b = { locador: {}, locatario: {}, valores: {}, assinatura: {}, pagamentos: [] };
    COL_RESERVAS.forEach(function (c) {
      if (c[2] === 'calc') return;
      const i = tR.idx[c[0]]; if (i == null) return;
      definir_(b, c[0], deCelula_(row[i], c[2], tz));
    });
    if (!b.data || !(b.locatario.nome || b.evento)) { db.brutosR.push(limparCalc_(row, tR.calc)); return; } // linha incompleta: fica intacta na planilha
    const bruto = tR.idx.numero != null ? String(row[tR.idx.numero]).trim() : '';
    if (!b.id && bruto && !/^\d+$/.test(bruto)) { b.id = bruto; db.mudou = true; } // versão anterior: o código longo estava na coluna ID
    if (!b.id || vistos[b.id]) { b.id = Utilities.getUuid(); db.mudou = true; }
    vistos[b.id] = true;
    b._linha = row;
    db.reservas.push(b);
  });

  /* Pagamentos */
  const porId = {}, porNumero = {};
  db.reservas.forEach(function (b) { porId[b.id] = b; if (b.numero) porNumero[b.numero] = b; });
  const tP = lerTabela_(shP, COL_PAGAMENTOS);
  const vistosP = {};
  tP.linhas.forEach(function (row) {
    if (linhaVazia_(row, tP.calc)) return;
    const p = {};
    COL_PAGAMENTOS.forEach(function (c) {
      if (c[2] === 'calc') return;
      const i = tP.idx[c[0]]; if (i == null) return;
      p[c[0]] = deCelula_(row[i], c[2], tz);
    });
    const ref = tP.idx.reservaNumero != null ? String(row[tP.idx.reservaNumero]).trim() : '';
    const dono = /^\d+$/.test(ref) ? porNumero[+ref] : porId[ref];          // número curto (ou código longo da versão anterior)
    if (!dono || !(p.valor > 0)) { db.brutosP.push(limparCalc_(row, tP.calc)); return; } // reserva inexistente ou sem valor: fica intacta
    if (!/^\d+$/.test(ref)) db.mudou = true;
    const brutoP = tP.idx.numero != null ? String(row[tP.idx.numero]).trim() : '';
    if (!p.id && brutoP && !/^\d+$/.test(brutoP)) { p.id = brutoP; db.mudou = true; }
    if (!p.id || vistosP[p.id]) { p.id = Utilities.getUuid(); db.mudou = true; }
    vistosP[p.id] = true;
    p._linha = row;
    delete p.reservaNumero;
    dono.pagamentos.push(p);
  });

  if (numerar_(db)) db.mudou = true;

  /* Colunas calculadas desatualizadas (pagamento editado à mão, célula com erro…) → regrava */
  db.reservas.forEach(function (b) {
    const calc = calcReserva_(b);
    ['_pago', '_falta'].forEach(function (k) {
      const i = tR.idx[k];
      if (i != null && b._linha[i] !== calc[k]) db.mudou = true;
    });
    b.pagamentos.forEach(function (p) {
      const i = tP.idx._cliente;
      if (i != null && p._linha[i] !== (b.locatario.nome || '')) db.mudou = true;
    });
  });
  return db;
}

function lerTabela_(sh, cols) {
  const lastCol = Math.max(sh.getLastColumn(), 1), lastRow = sh.getLastRow();
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  const idx = {}, calc = [];
  cols.forEach(function (c) {
    const i = header.findIndex(function (h) { return norm_(h) === norm_(c[1]); });
    if (i >= 0) { idx[c[0]] = i; if (c[2] === 'calc') calc.push(i); }
  });
  const linhas = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  return { header: header, idx: idx, calc: calc, linhas: linhas, largura: lastCol };
}

/* =========================================================================
   Gravação (reescreve as linhas de dados; cabeçalho, formatos e colunas extras ficam)
   ========================================================================= */
function gravarTudo_(ss, db) {
  const tz = ss.getSpreadsheetTimeZone();
  const shR = ss.getSheetByName(ABA_RESERVAS), shP = ss.getSheetByName(ABA_PAGAMENTOS);
  const tR = lerTabela_(shR, COL_RESERVAS), tP = lerTabela_(shP, COL_PAGAMENTOS);

  const reservas = db.reservas.slice().sort(function (a, b) {
    return a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.entrada || '').localeCompare(String(b.entrada || ''));
  });

  /* Reservas */
  const linhasR = reservas.map(function (b, n) {
    const row = linhaBase_(b._linha, tR.largura);
    COL_RESERVAS.forEach(function (c) {
      const i = tR.idx[c[0]]; if (i == null) return;
      if (c[2] === 'calc') row[i] = calcReserva_(b)[c[0]];
      else row[i] = paraCelula_(obter_(b, c[0]), c[2], tz);
    });
    return row;
  }).concat(db.brutosR);
  escreverLinhas_(shR, linhasR, tR, COL_RESERVAS);

  /* Pagamentos */
  const pags = [];
  reservas.forEach(function (b) {
    (b.pagamentos || []).slice().sort(function (x, y) { return String(x.data).localeCompare(String(y.data)); })
      .forEach(function (p) { pags.push(Object.assign({}, p, { reservaNumero: b.numero, _dono: b })); });
  });
  const linhasP = pags.map(function (p) {
    const row = linhaBase_(p._linha, tP.largura);
    COL_PAGAMENTOS.forEach(function (c) {
      const i = tP.idx[c[0]]; if (i == null) return;
      if (c[0] === '_cliente') row[i] = p._dono.locatario.nome || '';
      else if (c[0] === '_dataEvento') row[i] = paraCelula_(p._dono.data, 'date', tz);
      else row[i] = paraCelula_(p[c[0]], c[2], tz);
    });
    return row;
  }).concat(db.brutosP);
  escreverLinhas_(shP, linhasP, tP, COL_PAGAMENTOS);

  /* Ajustes */
  if (db.mudouAjustes) {
    const shA = ss.getSheetByName(ABA_AJUSTES);
    const vals = AJUSTES.map(function (a) {
      const v = a[0] === '_atualizado' ? db.ajustesAtualizado : db.ajustes[a[0]];
      return [a[1], paraCelula_(v == null ? '' : v, a[2], tz), a[0]];
    });
    shA.getRange(2, 1, vals.length, 3).setValues(vals);
    AJUSTES.forEach(function (a, n) { shA.getRange(n + 2, 2).setNumberFormat(FORMATOS[a[2]] || '@'); });
  }
  SpreadsheetApp.flush();
}

function linhaBase_(antiga, largura) {
  const row = new Array(largura).fill('');
  (antiga || []).forEach(function (v, i) { if (i < largura) row[i] = v; });
  return row;
}

function escreverLinhas_(sh, linhas, t, cols) {
  const antigas = Math.max(sh.getLastRow() - 1, 0);
  const precisa = linhas.length + 1;
  if (sh.getMaxRows() < precisa) sh.insertRowsAfter(sh.getMaxRows(), precisa - sh.getMaxRows());
  if (antigas > 0) sh.getRange(2, 1, antigas, t.largura).clearContent();
  if (!linhas.length) return;
  sh.getRange(2, 1, linhas.length, t.largura).setValues(linhas);
  // Formatos e caixas de seleção já estão nas linhas existentes: só as linhas novas precisam (mais rápido)
  const novas = linhas.length - antigas;
  if (novas <= 0) return;
  cols.forEach(function (c) {
    const i = t.idx[c[0]]; if (i == null) return;
    const rg = sh.getRange(antigas + 2, i + 1, novas, 1);
    if (c[2] === 'calc') rg.setNumberFormat(c[0] === '_dataEvento' ? FORMATOS.date : FORMATOS.money);
    else if (FORMATOS[c[2]]) rg.setNumberFormat(FORMATOS[c[2]]);
    if (c[2] === 'bool') rg.insertCheckboxes();
  });
}

/* =========================================================================
   Estrutura das abas
   ========================================================================= */
function prepararAba_(ss, nome, cols) {
  let sh = ss.getSheetByName(nome);
  const nova = !sh;
  if (nova) sh = ss.insertSheet(nome);
  const lastCol = sh.getLastColumn();
  const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  const faltam = cols.filter(function (c) { return !header.some(function (h) { return norm_(h) === norm_(c[1]); }); });
  if (faltam.length) {
    const ini = header.filter(function (h) { return h !== ''; }).length ? lastCol + 1 : 1;
    if (sh.getMaxColumns() < ini + faltam.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), ini + faltam.length - 1 - sh.getMaxColumns());
    sh.getRange(1, ini, 1, faltam.length).setValues([faltam.map(function (c) { return c[1]; })]);
    estilizarAba_(sh, cols);
  }
  return sh;
}

function estilizarAba_(sh, cols) {
  const t = lerTabela_(sh, cols);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, t.largura).setFontWeight('bold').setBackground('#0D0D10').setFontColor('#D4AF37');
  const n = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c) {
    const i = t.idx[c[0]]; if (i == null) return;
    const rg = sh.getRange(2, i + 1, n, 1);
    if (c[2] === 'calc') { rg.setNumberFormat(c[0] === '_dataEvento' ? FORMATOS.date : FORMATOS.money).setBackground('#F4F4F6'); sh.getRange(1, i + 1).setNote('Calculado automaticamente pelo app — não precisa editar.'); }
    else if (FORMATOS[c[2]]) rg.setNumberFormat(FORMATOS[c[2]]);
    if (c[2] === 'status') rg.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([STATUS_LABEL.pending, STATUS_LABEL.confirmed, STATUS_LABEL.cancelled], true).setAllowInvalid(true).build());
    if (c[0] === 'numero') sh.getRange(1, i + 1).setNote('Número gerado automaticamente. Não altere.');
    if (c[0] === 'reservaNumero') sh.getRange(1, i + 1).setNote('Número (ID) da reserva na aba Reservas.');
    if (c[0] === 'id') { sh.getRange(1, i + 1).setNote('Código interno usado pelo app. Não altere.'); sh.hideColumns(i + 1); }
    if (c[0] === 'assinaturaLocatario.img') { sh.getRange(1, i + 1).setNote('Imagem da assinatura desenhada pelo locatário.'); sh.hideColumns(i + 1); }
    if (c[0] === 'preenchimento.token') { sh.getRange(1, i + 1).setNote('Chave secreta do link enviado ao locatário. Não altere nem partilhe.'); sh.hideColumns(i + 1); }
    if (c[2] === 'pstatus') rg.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([PREENCH_LABEL.aguardando, PREENCH_LABEL.assinado, PREENCH_LABEL.recebido, PREENCH_LABEL.concluido], true).setAllowInvalid(true).build());
    if (c[0] === 'updatedAt') sh.getRange(1, i + 1).setNote('Atualiza sozinho quando a linha é editada.');
  });
}

function prepararAjustes_(ss) {
  let sh = ss.getSheetByName(ABA_AJUSTES);
  if (!sh) {
    sh = ss.insertSheet(ABA_AJUSTES);
    sh.getRange(1, 1, 1, 3).setValues([['Configuração', 'Valor', 'Código (não alterar)']])
      .setFontWeight('bold').setBackground('#0D0D10').setFontColor('#D4AF37');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, AJUSTES.length, 3).setValues(AJUSTES.map(function (a) { return [a[1], '', a[0]]; }));
    AJUSTES.forEach(function (a, n) { sh.getRange(n + 2, 2).setNumberFormat(FORMATOS[a[2]] || '@'); });
    sh.getRange(2, 3, AJUSTES.length, 1).setFontColor('#9CA3AF');
  }
  return sh;
}

/* IDs curtos 1, 2, 3… (reservas e pagamentos). Repetidos ou vazios recebem o próximo número livre.
   Devolve true se algum número foi atribuído. */
function numerar_(db) {
  let mudou = false;
  function seq(lista) {
    const usados = {}; let max = 0; const faltam = [];
    lista.forEach(function (x) {
      const n = Number(x.numero) || 0;
      if (n > 0 && !usados[n]) { usados[n] = true; if (n > max) max = n; } else faltam.push(x);
    });
    faltam.sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); })
      .forEach(function (x) { x.numero = ++max; mudou = true; });
  }
  seq(db.reservas);
  const pags = [];
  db.reservas.forEach(function (b) { (b.pagamentos || []).forEach(function (p) { pags.push(p); }); });
  seq(pags);
  return mudou;
}

/* =========================================================================
   Página do locatário (preencher.html) — acesso só com o token secreto do link
   ========================================================================= */
const CAMPOS_LOCATARIO = ['nome', 'cpf', 'rg', 'fone'];

function acharConvite_(db, token) {
  token = String(token || '');
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;          // formato do token gerado pelo app
  return db.reservas.find(function (b) { return b.preenchimento && b.preenchimento.token === token && b.status !== 'cancelled'; }) || null;
}

/* Só o necessário para o locatário reconhecer a reserva — nenhum dado de outras reservas */
function camposDoLocatario_(b) { return String((b.preenchimento && b.preenchimento.campos) || '').split(/[,\s]+/).filter(function (k) { return CAMPOS_LOCATARIO.indexOf(k) >= 0; }); }
/* Campos que o locatário pode preencher: os vazios + os que ele mesmo enviou antes (se o preenchimento foi reaberto) */
function editaveis_(b) { const lt = b.locatario || {}, seus = camposDoLocatario_(b); return CAMPOS_LOCATARIO.filter(function (k) { return !lt[k] || seus.indexOf(k) >= 0; }); }

function dadosPublicos_(b) {
  const lt = b.locatario || {}, ed = editaveis_(b), atuais = {};
  ed.forEach(function (k) { if (lt[k]) atuais[k] = lt[k]; });   // reaberto: o locatário vê o que ele próprio enviou
  return {
    editaveis: ed, atuais: atuais,
    numero: b.numero, evento: b.evento || '', data: b.data, entrada: b.entrada || '', saida: b.saida || '',
    locadora: (b.locador && b.locador.nome) || '',
    // campos já preenchidos pela RC House: mostrados (dados sensíveis parcialmente ocultos), não editáveis
    preenchidos: {
      nome: ed.indexOf('nome') < 0 ? lt.nome || '' : '',
      cpf: ed.indexOf('cpf') < 0 && lt.cpf ? '•••.•••.' + String(lt.cpf).slice(-6) : '',
      rg: ed.indexOf('rg') < 0 && lt.rg ? '••••' + String(lt.rg).slice(-3) : '',
      fone: ed.indexOf('fone') < 0 && lt.fone ? '(••) •••••-' + String(lt.fone).replace(/\D/g, '').slice(-4) : ''
    }
  };
}

function conviteLer_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = lerTudo_(ss);
  const b = acharConvite_(db, req.token);
  if (!b) return { ok: false, estado: 'invalido', erro: 'Este link não é válido ou foi substituído por um novo. Peça um link atualizado à RC House.' };
  const st = b.preenchimento.status;
  return {
    ok: true, estado: st === 'aguardando' ? 'aberto' : st === 'assinado' ? 'assinado' : 'enviado',
    reserva: dadosPublicos_(b), contrato: contratoPublico_(b, db.ajustes), assinaturaLocadora: db.ajustes.assinaturaLocadora || ''
  };
}

/* O contrato desta reserva (o mesmo que a RC House vê), sem dados internos do app */
function contratoPublico_(b, aj) {
  const c = completar_(aj)(b);
  delete c.preenchimento; delete c.pagamentos; delete c.id;
  return c;
}

/* Código de verificação: resumo (SHA-256) do conteúdo do contrato + assinatura no momento em que foi assinado */
function codigoVerificacao_(b, img, em) {
  const v = b.valores || {}, lr = b.locador || {}, lt = b.locatario || {}, as = b.assinatura || {};
  const txt = JSON.stringify([b.id, b.numero, b.data, b.entrada, b.saida, b.evento, lr.nome, lr.cpf, lr.fone, lt.nome, lt.cpf, lt.rg, lt.fone,
    v.total, v.sinal, v.caucao, v.saldo, v.chavePix, v.taxaHora, as.local, as.data, em, img]);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  const hex = bytes.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('').toUpperCase();
  return hex.slice(0, 4) + '-' + hex.slice(4, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16);
}

function conviteEnviar_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = lerTudo_(ss);
  const b = acharConvite_(db, req.token);
  if (!b) return { ok: false, estado: 'invalido', erro: 'Este link não é válido ou foi substituído por um novo. Peça um link atualizado à RC House.' };
  if (b.preenchimento.status !== 'aguardando') return { ok: false, estado: b.preenchimento.status === 'assinado' ? 'assinado' : 'enviado', erro: 'Este contrato já foi assinado.' };
  const img = String(req.assinatura || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(img) || img.length < 300) return { ok: false, estado: 'aberto', erro: 'Desenhe a sua assinatura para continuar.', campo: 'assinatura' };
  if (img.length > MAX_IMG) return { ok: false, estado: 'aberto', erro: 'A assinatura ficou grande demais. Limpe e assine de novo.', campo: 'assinatura' };
  if (req.aceite !== true) return { ok: false, estado: 'aberto', erro: 'Confirme que leu e concorda com o contrato.', campo: 'aceite' };

  const d = req.dados || {}, lt = b.locatario, erros = {};
  const limpo = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); };
  const novos = {};
  const ed = editaveis_(b);
  ed.forEach(function (k) { novos[k] = d[k]; });                                // o que a RC House preencheu não muda
  if ('nome' in novos) {
    const n = limpo(novos.nome, 120);
    if (n.split(' ').filter(Boolean).length < 2) erros.nome = 'Informe o nome completo.'; else novos.nome = n;
  }
  if ('cpf' in novos) {
    const c = String(novos.cpf || '').replace(/\D/g, '');
    if (!cpfValido_(c)) erros.cpf = 'CPF inválido.'; else novos.cpf = c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if ('rg' in novos) {
    const r = limpo(novos.rg, 20).toUpperCase();
    if (r.replace(/[^0-9A-Z]/g, '').length < 4) erros.rg = 'Informe o RG.'; else novos.rg = r;
  }
  if ('fone' in novos) {
    const f = String(novos.fone || '').replace(/\D/g, '');
    if (f.length < 10 || f.length > 11) erros.fone = 'Telefone com DDD (10 ou 11 dígitos).';
    else novos.fone = f.length === 11 ? f.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : f.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  if (Object.keys(erros).length) return { ok: false, estado: 'aberto', erro: 'Confira os campos destacados.', campos: erros };

  Object.keys(novos).forEach(function (k) { lt[k] = novos[k]; });
  b.preenchimento.campos = ed.join(', ');
  const agora = new Date().toISOString();
  b.assinatura = Object.assign({}, b.assinatura, { data: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') }); // data do contrato = data da assinatura
  if (!b.assinatura.local) b.assinatura.local = db.ajustes.localAssinatura || 'Uberlândia - MG';
  b.assinaturaLocatario = { em: agora, img: img, dispositivo: limpo(req.dispositivo, 180), codigo: codigoVerificacao_(b, img, agora) };
  b.status = 'confirmed';                 // contrato assinado pelas duas partes
  b.signedAt = agora;
  delete b.cancelledAt;
  b.preenchimento.status = 'assinado';
  b.preenchimento.recebidoEm = agora;
  b.updatedAt = agora;
  db.mudou = true;
  gravarTudo_(ss, db);
  return { ok: true, estado: 'assinado', reserva: dadosPublicos_(b), contrato: contratoPublico_(b, db.ajustes), assinaturaLocadora: db.ajustes.assinaturaLocadora || '' };
}

/* Um aparelho com uma cópia antiga (ainda "aguardando") não pode apagar os dados que o locatário acabou de enviar */
function protegerDadosLocatario_(atual, b) {
  const pa = atual && atual.preenchimento, pb = b.preenchimento;
  if (!pa || (pa.status !== 'recebido' && pa.status !== 'assinado') || !pb || pb.status !== 'aguardando' || pb.token !== pa.token) return;
  // "Reabrir preenchimento" de propósito: a cópia já conhecia este envio (mesma data de recebimento) → vale a reabertura
  if (pb.recebidoEm && ms_(pb.recebidoEm) >= ms_(pa.recebidoEm)) return;
  pb.status = pa.status;
  pb.recebidoEm = pa.recebidoEm;
  pb.campos = pa.campos;
  b.locatario = b.locatario || {};
  CAMPOS_LOCATARIO.forEach(function (k) { if (!b.locatario[k]) b.locatario[k] = atual.locatario[k]; });
  if (pa.status === 'assinado') {   // contrato assinado entretanto: mantém confirmado
    b.status = atual.status; b.signedAt = atual.signedAt;
    b.assinatura = Object.assign({}, b.assinatura, { data: atual.assinatura && atual.assinatura.data });
  }
}

function cpfValido_(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  let s = 0, r;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; if (r !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === +c[10];
}

/* Valores calculados (em reais) das colunas "Pago após o sinal" e "Falta receber" */
function calcReserva_(b) {
  const pago = (b.pagamentos || []).reduce(function (t, p) { return t + (Number(p.valor) || 0); }, 0);
  const saldo = Number(b.valores && b.valores.saldo) || 0;
  const falta = b.status === 'cancelled' ? 0 : Math.max(0, saldo - pago);
  return { _pago: Math.round(pago) / 100, _falta: Math.round(falta) / 100 };
}

/* Opcional — mantém o script "acordado" para o primeiro acesso não demorar.
   No Apps Script: menu Acionadores (ícone de relógio) → Adicionar acionador →
   função: manterAcordado · origem: Baseado no tempo · Contador de minutos · A cada 10 minutos. */
function manterAcordado() {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_RESERVAS);
}

/* Menu na planilha */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('RC House')
    .addItem('Preparar / reparar abas', 'prepararPlanilha')
    .addToUi();
}
function prepararPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  estilizarAba_(prepararAba_(ss, ABA_RESERVAS, COL_RESERVAS), COL_RESERVAS);
  estilizarAba_(prepararAba_(ss, ABA_PAGAMENTOS, COL_PAGAMENTOS), COL_PAGAMENTOS);
  prepararAjustes_(ss);
  const db = lerTudo_(ss);
  gravarTudo_(ss, db);
  const sh1 = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (sh1 && sh1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh1);
  SpreadsheetApp.getActive().toast('Abas prontas: Reservas, Pagamentos e Ajustes.', 'RC House');
}

/* Edição manual na planilha → marca a linha como alterada (para o app saber que esta versão é a mais nova) */
function onEdit(e) {
  try {
    const sh = e.range.getSheet(), nome = sh.getName();
    if (e.range.getRow() < 2) return;
    const agora = new Date();
    if (nome === ABA_RESERVAS) {
      const t = lerTabela_(sh, COL_RESERVAS), c = t.idx.updatedAt;
      if (c == null || (e.range.getColumn() === c + 1 && e.range.getNumColumns() === 1)) return;
      sh.getRange(e.range.getRow(), c + 1, e.range.getNumRows(), 1).setValue(agora);
    } else if (nome === ABA_PAGAMENTOS) {
      const tP = lerTabela_(sh, COL_PAGAMENTOS), shR = e.source.getSheetByName(ABA_RESERVAS);
      if (tP.idx.reservaNumero == null || !shR) return;
      const ids = sh.getRange(e.range.getRow(), tP.idx.reservaNumero + 1, e.range.getNumRows(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
      const tR = lerTabela_(shR, COL_RESERVAS);
      if (tR.idx.updatedAt == null || tR.idx.numero == null) return;
      tR.linhas.forEach(function (row, n) { if (ids.indexOf(String(row[tR.idx.numero]).trim()) >= 0) shR.getRange(n + 2, tR.idx.updatedAt + 1).setValue(agora); });
    } else if (nome === ABA_AJUSTES) {
      const n = AJUSTES.findIndex(function (a) { return a[0] === '_atualizado'; });
      if (e.range.getRow() !== n + 2) sh.getRange(n + 2, 2).setValue(agora);
    }
  } catch (err) { /* edição manual nunca deve falhar por causa disto */ }
}

/* =========================================================================
   Conversões célula ⇄ app (no app os valores em R$ são centavos inteiros)
   ========================================================================= */
function paraCelula_(v, tipo, tz) {
  if (v === undefined || v === null) return '';
  switch (tipo) {
    case 'money': return v === '' ? '' : Math.round(Number(v) || 0) / 100;
    case 'int': return Number(v) > 0 ? Math.round(Number(v)) : '';
    case 'bool': return !!v;
    case 'status': return STATUS_LABEL[v] || STATUS_LABEL.pending;
    case 'pstatus': return PREENCH_LABEL[v] || '';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? Utilities.parseDate(v + ' 12:00:00', tz, 'yyyy-MM-dd HH:mm:ss') : String(v);
    case 'datetime': { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d; }
    default: return String(v);
  }
}

function deCelula_(v, tipo, tz) {
  const vazio = v === '' || v === null || v === undefined;
  switch (tipo) {
    case 'money': {
      if (vazio) return 0;
      if (typeof v === 'number') return Math.round(v * 100);
      let s = String(v).replace(/[^\d,.-]/g, '');
      if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
      return Math.round((parseFloat(s) || 0) * 100);
    }
    case 'bool': return v === true || /^(true|verdadeiro|sim|s|x|1)$/i.test(String(v).trim());
    case 'int': { const n = String(v).trim(); return /^\d+$/.test(n) && +n > 0 ? +n : 0; }
    case 'pstatus': {
      const s = norm_(v);
      if (/^aguard/.test(s)) return 'aguardando';
      if (/^assinad/.test(s)) return 'assinado';
      if (/^(dados receb|receb)/.test(s)) return 'recebido';
      if (/^(dados revis|revis|conclu)/.test(s)) return 'concluido';
      return '';
    }
    case 'status': {
      const s = norm_(v);
      if (/^(confirm|assinad|confirmed)/.test(s)) return 'confirmed';
      if (/^(cancel)/.test(s)) return 'cancelled';
      return 'pending';
    }
    case 'date': {
      if (vazio) return '';
      if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      const s = String(v).trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad_(m[2]) + '-' + pad_(m[1]);
      return '';
    }
    case 'time': {
      if (vazio) return '';
      if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
      const m = String(v).trim().match(/^(\d{1,2})(?:[:hH.](\d{2}))?/);
      return m ? pad_(m[1]) + ':' + (m[2] || '00') : '';
    }
    case 'datetime': {
      if (vazio) return '';
      if (v instanceof Date) return v.toISOString();
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (m) return Utilities.parseDate(m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]) + ' ' + pad_(m[4] || 0) + ':' + (m[5] || '00') + ':' + (m[6] || '00'), tz, 'yyyy-MM-dd HH:mm:ss').toISOString();
      const d = new Date(s);
      return isNaN(d) ? '' : d.toISOString();
    }
    default: return vazio ? '' : String(v).trim();
  }
}

/* Preenche o que faltar numa reserva criada à mão na planilha (com os Ajustes) */
function completar_(aj) {
  return function (b) {
    const out = JSON.parse(JSON.stringify(b, function (k, v) { return k === '_linha' ? undefined : v; }));
    out.status = out.status || 'pending';
    out.locador = out.locador || {}; out.locatario = out.locatario || {}; out.valores = out.valores || {}; out.assinatura = out.assinatura || {};
    if (!out.locador.nome) out.locador.nome = aj.locadorNome || '';
    if (!out.locador.cpf) out.locador.cpf = aj.locadorCpf || '';
    if (!out.locador.fone) out.locador.fone = aj.locadorFone || '';
    if (!out.entrada) out.entrada = aj.horaEntradaPadrao || '08:00';
    if (!out.saida) out.saida = aj.horaSaidaPadrao || '22:00';
    const v = out.valores;
    ['total', 'sinal', 'caucao', 'saldo', 'taxaHora'].forEach(function (k) { v[k] = Math.max(0, Math.round(Number(v[k]) || 0)); });
    if (!v.taxaHora) v.taxaHora = aj.taxaHoraExcedente || 0;
    if (!v.chavePix) v.chavePix = aj.chavePix || '';
    if (!v.saldoManual) v.saldo = Math.max(0, v.total - v.sinal);
    if (!out.assinatura.local) out.assinatura.local = aj.localAssinatura || 'Uberlândia - MG';
    if (!out.assinatura.data) out.assinatura.data = (out.createdAt || new Date().toISOString()).slice(0, 10);
    if (!out.createdAt) out.createdAt = new Date().toISOString();
    if (!out.updatedAt) out.updatedAt = out.createdAt;
    ['signedAt', 'cancelledAt'].forEach(function (k) { if (!out[k]) delete out[k]; });
    if (!out.assinaturaLocatario || !out.assinaturaLocatario.em) delete out.assinaturaLocatario;
    else ['codigo', 'dispositivo'].forEach(function (k) { if (!out.assinaturaLocatario[k]) delete out.assinaturaLocatario[k]; });
    const pr = out.preenchimento || {};
    if (!pr.status && !pr.token) delete out.preenchimento;
    else ['enviadoEm', 'recebidoEm'].forEach(function (k) { if (!pr[k]) delete pr[k]; });
    out.pagamentos = (out.pagamentos || []).map(function (p) {
      return { id: p.id, numero: p.numero, valor: p.valor, data: p.data || out.data, forma: p.forma || '', obs: p.obs || '', createdAt: p.createdAt || out.updatedAt };
    });
    return out;
  };
}

/* =========================================================================
   Utilitários
   ========================================================================= */
function obter_(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
function definir_(o, path, v) {
  const p = path.split('.');
  let a = o;
  for (let i = 0; i < p.length - 1; i++) a = a[p[i]] = a[p[i]] || {};
  a[p[p.length - 1]] = v;
}
function ms_(iso) { const t = iso ? new Date(iso).getTime() : 0; return isNaN(t) ? 0 : t; }
function pad_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function norm_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function linhaVazia_(row, ignorar) { return row.every(function (v, i) { return (ignorar && ignorar.indexOf(i) >= 0) || v === '' || v === null || v === false; }); }
function limparCalc_(row, calc) { const r = row.slice(); calc.forEach(function (i) { r[i] = ''; }); return r; }
function colLetra_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
