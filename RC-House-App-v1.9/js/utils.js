/* =========================================================================
   RC House — Utilitários (máscaras, formatação, datas)
   ========================================================================= */
(function () {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  function onlyDigits(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }

  /* ---------- Máscaras ---------- */
  function maskCPF(v) {
    var d = onlyDigits(v).slice(0, 11);
    if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return d;
  }

  function maskPhone(v) {
    var d = onlyDigits(v).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function maskTime(v) {
    var d = onlyDigits(v).slice(0, 4);
    if (d.length >= 3) return d.slice(0, 2) + ':' + d.slice(2);
    return d;
  }

  function isValidCPF(v) {
    var c = onlyDigits(v);
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    var s = 0, r, i;
    for (i = 0; i < 9; i++) s += +c[i] * (10 - i);
    r = (s * 10) % 11; if (r === 10) r = 0; if (r !== +c[9]) return false;
    s = 0;
    for (i = 0; i < 10; i++) s += +c[i] * (11 - i);
    r = (s * 10) % 11; if (r === 10) r = 0;
    return r === +c[10];
  }

  /* ---------- Moeda (valores guardados em centavos inteiros) ---------- */
  function formatBRL(cents, withSymbol) {
    var n = Math.round(Number(cents) || 0) / 100;
    var s = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return withSymbol === false ? s : 'R$ ' + s;
  }
  /* Máscara de moeda: os dígitos digitados entram como centavos */
  function maskMoney(v) {
    var d = onlyDigits(v).replace(/^0+/, '');
    if (!d) return '';
    return formatBRL(parseInt(d, 10), false);
  }
  function parseMoney(v) {
    var d = onlyDigits(v);
    return d ? parseInt(d, 10) : 0;
  }

  /* ---------- Datas (ISO local YYYY-MM-DD) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function parseISO(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function formatBR(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function formatExtenso(iso) {
    var d = parseISO(iso) || new Date();
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }
  function formatLong(iso) {
    var d = parseISO(iso);
    if (!d) return '';
    return DIAS_SEMANA[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }
  function formatShort(iso) {
    var d = parseISO(iso);
    if (!d) return '';
    return pad(d.getDate()) + ' ' + MESES_CURTOS[d.getMonth()];
  }
  function daysUntil(iso) {
    var d = parseISO(iso); if (!d) return null;
    var t = parseISO(todayISO());
    return Math.round((d - t) / 86400000);
  }
  function relativeDay(iso) {
    var n = daysUntil(iso);
    if (n === null) return '';
    if (n === 0) return 'Hoje';
    if (n === 1) return 'Amanhã';
    if (n === -1) return 'Ontem';
    if (n > 1) return 'Em ' + n + ' dias';
    return 'Há ' + Math.abs(n) + ' dias';
  }
  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }

  window.U = {
    MESES: MESES, MESES_CURTOS: MESES_CURTOS, DIAS_CURTOS: DIAS_CURTOS,
    onlyDigits: onlyDigits, maskCPF: maskCPF, maskPhone: maskPhone, maskTime: maskTime, isValidCPF: isValidCPF,
    formatBRL: formatBRL, maskMoney: maskMoney, parseMoney: parseMoney,
    pad: pad, toISO: toISO, todayISO: todayISO, parseISO: parseISO, formatBR: formatBR,
    formatExtenso: formatExtenso, formatLong: formatLong, formatShort: formatShort,
    daysUntil: daysUntil, relativeDay: relativeDay, greeting: greeting, firstName: firstName,
    escapeHTML: escapeHTML, uid: uid, slug: slug, debounce: debounce
  };
})();
