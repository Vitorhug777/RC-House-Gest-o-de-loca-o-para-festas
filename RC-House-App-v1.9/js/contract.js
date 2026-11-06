/* =========================================================================
   RC House — Contrato (Folha Única A4) + geração de PDF
   Texto fiel ao contrato oficial da RC House Espaço de Eventos.
   ========================================================================= */
(function () {
  'use strict';

  var e = function (s) { return U.escapeHTML(s); };
  var BLANK = '<span class="ct-blank">&nbsp;</span>';

  function val(s, blankWidth) {
    s = (s == null ? '' : String(s)).trim();
    return s ? '<strong>' + e(s) + '</strong>' : '<span class="ct-blank" style="min-width:' + (blankWidth || 120) + 'px">&nbsp;</span>';
  }
  function money(cents) { return U.formatBRL(cents || 0, false); }

  /* Assinatura da locadora (desenhada uma vez em Ajustes; na página do locatário vem da planilha) */
  var locadoraSig = function () { return ''; };
  function setLocadoraSignature(src) { locadoraSig = typeof src === 'function' ? src : function () { return src || ''; }; }
  function safeImg(src) { return /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(String(src || '')) ? src : ''; }
  function fmtDateTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return U.pad(d.getDate()) + '/' + U.pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  }

  /* HTML completo da folha A4 (794 × 1122 px @96dpi)
     opts.signHere: mostra "ASSINE AQUI" no lugar da assinatura do locatário (página do locatário) */
  function render(b, opts) {
    opts = opts || {};
    var v = b.valores || {};
    var lr = b.locador || {};
    var lt = b.locatario || {};
    var as = b.assinatura || {};
    var temCaucao = (v.caucao || 0) > 0;
    var nomeLocador = (lr.nome || 'Geisemone Rocha da Silva').trim();
    var at = b.assinaturaLocatario || {};
    var sigT = opts.signature != null ? safeImg(opts.signature) : safeImg(at.img);   // prévia na página do locatário
    var sigL = safeImg(locadoraSig());

    return '' +
      '<div class="ct-page">' +
      '<div class="ct-frame">' +

      /* Cabeçalho */
      '<header class="ct-header">' +
      '<img class="ct-logo" src="' + window.RC_LOGO_DATA + '" alt="RC House">' +
      '<div class="ct-titles">' +
      '<h1>RC HOUSE ESPAÇO DE EVENTOS</h1>' +
      '<p>CONTRATO UNIVERSAL DE LOCAÇÃO TEMPORÁRIA POR DIÁRIA</p>' +
      '</div>' +
      '<div class="ct-datebox"><span>DATA DA LOCAÇÃO</span><strong>' + (b.data ? e(U.formatBR(b.data)) : '___/___/______') + '</strong></div>' +
      '</header>' +
      '<div class="ct-rule"></div>' +

      /* Quadro duplo */
      '<section class="ct-parties">' +
      '<div class="ct-party">' +
      '<h3>1. LOCADOR(A) / ADMINISTRADOR(A)</h3>' +
      '<p><span>Nome:</span> ' + val(nomeLocador, 200) + '</p>' +
      '<p><span>CPF:</span> ' + val(lr.cpf, 130) + '</p>' +
      '<p><span>Fone:</span> ' + val(lr.fone, 130) + '</p>' +
      '</div>' +
      '<div class="ct-party">' +
      '<h3>2. LOCATÁRIO(A) / RESPONSÁVEL</h3>' +
      '<p><span>Nome:</span> ' + val(lt.nome, 200) + '</p>' +
      '<p class="ct-row2"><span><span>CPF:</span> ' + val(lt.cpf, 110) + '</span><span><span>RG:</span> ' + val(lt.rg, 90) + '</span></p>' +
      '<p><span>Fone:</span> ' + val(lt.fone, 130) + '</p>' +
      '</div>' +
      '</section>' +

      /* Cláusula 1ª */
      '<section class="ct-clause">' +
      '<h2>CLÁUSULA 1ª - DO IMÓVEL, FINALIDADE E HORÁRIOS</h2>' +
      '<p>O presente contrato tem como objeto a locação do imóvel situado na Av. Abadio Bonifácio da Silva, nº 153, Bairro Granada, destinado estritamente à realização de evento particular e comemorativo familiar, vedada qualquer sublocação ou cessão a terceiros.</p>' +
      '<div class="ct-highlight">' +
      '<span><b>Horário de Entrada:</b> ' + (b.entrada ? e(b.entrada) + 'h' : BLANK) + '</span>' +
      '<i>|</i>' +
      '<span><b>Horário de Saída:</b> ' + (b.saida ? e(b.saida) + 'h' : BLANK) + '</span>' +
      '<i>|</i>' +
      '<span class="ct-grow"><b>Evento / Motivo:</b> ' + (b.evento ? e(b.evento) : BLANK) + '</span>' +
      '</div>' +
      '</section>' +

      /* Cláusula 2ª */
      '<section class="ct-clause">' +
      '<h2>CLÁUSULA 2ª - DO PREÇO, SINAL DE RESERVA E PAGAMENTO</h2>' +
      '<p>Pela diária ora ajustada, o Locatário pagará os valores acordados conforme a discriminação a seguir:</p>' +
      '<div class="ct-values">' +
      '<div class="ct-value"><span>VALOR TOTAL DA DIÁRIA</span><strong>R$ ' + money(v.total) + '</strong><em>(Valor acordado para a data)</em></div>' +
      '<div class="ct-value ct-value--accent"><span>SINAL DE RESERVA (ARRAS)</span><strong>R$ ' + money(v.sinal) + '</strong><em>(Pago no ato para garantia da data)</em>' +
      (temCaucao ? '<div class="ct-caucao">CAUÇÃO: <b>R$ ' + money(v.caucao) + '</b></div>' : '') +
      '</div>' +
      '<div class="ct-value"><span>SALDO RESTANTE</span><strong>R$ ' + money(v.saldo) + '</strong><em>(Até a entrega das chaves)</em></div>' +
      '</div>' +
      '<p class="ct-pix"><b>Chave Pix para Pagamento:</b> ' + val(v.chavePix, 220) + '</p>' +
      '</section>' +

      /* Cláusula 3ª */
      '<section class="ct-clause">' +
      '<h2>CLÁUSULA 3ª - DO CANCELAMENTO E ARRAS PENITENCIAIS</h2>' +
      '<p>O valor adiantado como Sinal de Reserva possui natureza jurídica de arras confirmatórias/penitenciais (Art. 418 do Código Civil). Em caso de cancelamento ou desistência imotivada por parte do Locatário, a quantia paga não será reembolsada, servindo de justa compensação pela indisponibilidade da data. Caso o impedimento decorra do Locador, este restituirá o sinal na forma da lei.</p>' +
      '</section>' +

      /* Cláusula 4ª */
      '<section class="ct-clause">' +
      '<h2>CLÁUSULA 4ª - DAS NORMAS DE USO, LEI DO SILÊNCIO E CONSERVAÇÃO</h2>' +
      '<ul>' +
      '<li><b>• Lei do Silêncio:</b> O Locatário compromete-se a cumprir rigorosamente as normas municipais de controle sonoro, reduzindo o volume do som nos horários estipulados por lei. Quaisquer multas, autos de infração ou acionamentos policiais por perturbação do sossego serão de responsabilidade direta e integral do Locatário.</li>' +
      '<li><b>• Danos e Avarias:</b> O imóvel, móveis e instalações são entregues em perfeito estado. Quaisquer danos, quebras estruturais, avarias em equipamentos ou extravios deverão ser ressarcidos imediatamente pelo Locatário em até 48 horas após a vistoria de saída.</li>' +
      '<li><b>• Devolução e Limpeza:</b> O imóvel deverá ser desocupado pontualmente no horário fixado, com o lixo devidamente recolhido em sacos plásticos. Atrasos na entrega das chaves acarretarão taxa adicional de R$ <strong>' + money(v.taxaHora) + '</strong>&nbsp;por hora excedente.</li>' +
      '</ul>' +
      '</section>' +

      /* Fechamento */
      '<section class="ct-closing">' +
      '<p>Por estarem plenamente ajustadas, as partes firmam o presente instrumento em duas vias.</p>' +
      '<p class="ct-place"><b>Local e Data:</b> ' + e(as.local || 'Uberlândia - MG') + ', ' + e(U.formatExtenso(as.data || U.todayISO())) + '</p>' +
      '</section>' +

      '<section class="ct-signs">' +
      '<div class="ct-sign"><div class="ct-sig-area">' + (sigL ? '<img src="' + sigL + '" alt="Assinatura da locadora">' : '') + '</div>' +
      '<div class="ct-line"></div><strong>' + e(nomeLocador) + '</strong><span>LOCADOR(A) - RC HOUSE</span></div>' +
      '<div class="ct-sign"><div class="ct-sig-area">' + (sigT ? '<img src="' + sigT + '" alt="Assinatura do locatário">' : opts.signHere ? '<span class="ct-sig-here">ASSINE AQUI</span>' : '') + '</div>' +
      '<div class="ct-line"></div><strong>' + (lt.nome ? e(lt.nome) : '&nbsp;') + '</strong><span>LOCATÁRIO(A) / CONTRATANTE</span>' +
      (sigT && at.em ? '<em>Assinado eletronicamente em ' + e(fmtDateTime(at.em)) + (lt.cpf ? ' · CPF ' + e(lt.cpf) : '') + (at.codigo ? '<br>Código de verificação: ' + e(at.codigo) : '') + '</em>' : '') +
      '</div>' +
      '</section>' +

      '<footer class="ct-footer">RC House Espaço de Eventos | Av. Abadio Bonifácio da Silva, 153 - Granada | Contrato Padrão de Locação - Folha Única</footer>' +

      '</div>' +
      '</div>';
  }

  function fileName(b) {
    var d = b.data ? U.formatBR(b.data).replace(/\//g, '-') : 'sem-data';
    var n = U.slug((b.locatario && b.locatario.nome) || 'cliente') || 'cliente';
    return 'Contrato-RC-House_' + d + '_' + n + '.pdf';
  }

  /* As bibliotecas de PDF (560 KB) só são carregadas quando é preciso gerar um contrato */
  var libs = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('Não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadLibs() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (!libs) libs = Promise.all([loadScript('vendor/html2canvas.min.js'), loadScript('vendor/jspdf.umd.min.js')])
      .catch(function (err) { libs = null; throw err; });
    return libs;
  }

  /* Gera o PDF (Blob) — sempre 1 única folha A4 */
  var cache = {};
  function generatePdf(b) {
    var key = b.id + '|' + (b.updatedAt || '') + '|' + locadoraSig().length + '|' + ((b.assinaturaLocatario && b.assinaturaLocatario.img) || '').length;
    if (cache[key]) return cache[key];

    var p = Promise.all([document.fonts && document.fonts.ready ? document.fonts.ready : null, loadLibs()]).then(function () {
      if (!window.html2canvas || !window.jspdf) throw new Error('Bibliotecas de PDF não carregadas');
      var host = document.createElement('div');
      host.className = 'ct-render-host';
      host.innerHTML = render(b);
      document.body.appendChild(host);
      var el = host.firstChild;

      // 1) Captura a folha (794 × 1122 px) em alta resolução
      return window.html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1122,
        windowWidth: 1280,
        windowHeight: 1400,
        scrollX: 0,
        scrollY: 0
      }).then(function (canvas) {
        host.remove();
        // 2) Coloca a imagem numa única página A4 (210 × 297 mm) — nunca gera 2ª página
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        pdf.setProperties({
          title: 'Contrato RC House - ' + U.formatBR(b.data),
          subject: 'Contrato Universal de Locação Temporária por Diária',
          author: 'RC House Espaço de Eventos',
          creator: 'RC House App'
        });
        return pdf.output('blob');
      }, function (err) { host.remove(); throw err; });
    });

    cache = {}; // guarda apenas o último gerado
    cache[key] = p;
    p.catch(function () { delete cache[key]; });
    return p;
  }

  window.Contract = { render: render, generatePdf: generatePdf, fileName: fileName, setLocadoraSignature: setLocadoraSignature };
})();
