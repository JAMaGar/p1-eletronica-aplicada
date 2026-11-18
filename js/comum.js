/* Funções comuns às páginas do aluno e do professor. */
(function () {
  "use strict";
  var P1 = (window.P1 = window.P1 || {});

  P1.$ = function (s, el) { return (el || document).querySelector(s); };
  P1.$$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  P1.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  P1.configurado = function () {
    return !!(window.P1_CONFIG && P1_CONFIG.API && !/COLE_AQUI/.test(P1_CONFIG.API));
  };

  /* POST para o Apps Script. text/plain evita a consulta prévia (CORS) que o Apps Script não responde. */
  P1.chamar = function (corpo, tentativas) {
    tentativas = tentativas || 1;
    if (!P1.configurado())
      return Promise.resolve({ ok: false, status: 503, erro: "o sistema ainda não foi configurado pelo professor (js/config.js)" });
    var n = 0;
    function espera(k) { return new Promise(function (ok) { setTimeout(ok, 900 * k + Math.random() * 900); }); }
    function uma() {
      n++;
      return fetch(P1_CONFIG.API, { method: "POST", body: JSON.stringify(corpo), redirect: "follow",
                                    headers: { "Content-Type": "text/plain;charset=utf-8" } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok && j.status === 503 && n < tentativas) return espera(n).then(uma);
          return j;
        }, function (e) {
          if (n < tentativas) return espera(n).then(uma);
          return { ok: false, status: 0, erro: "sem conexão com o servidor (" + (e && e.message || e) + ")", rede: true };
        });
    }
    return uma();
  };

  /* Mesma leitura de número do servidor (Codigo.gs → lerNumero_). */
  P1.lerNumero = function (s) {
    s = String(s == null ? "" : s).replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/[xX×]10\^?/, "e");
    if (!s) return [];
    var c = [];
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) c.push(s.replace(/\./g, "").replace(",", "."));
      else c.push(s.replace(/,/g, ""));
    } else if (s.indexOf(",") >= 0) c.push(s.replace(",", "."));
    else {
      c.push(s);
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) c.push(s.replace(/\./g, ""));
    }
    return c.map(function (x) { return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(x) ? Number(x) : NaN; })
            .filter(function (x) { return isFinite(x); });
  };

  /* Número no formato brasileiro com até `casas` decimais significativas. */
  P1.num = function (v, casas) {
    if (v == null || !isFinite(v)) return "—";
    casas = casas == null ? 3 : casas;
    var a = Math.abs(v), d = a >= 1000 ? 1 : a >= 100 ? 2 : casas;
    return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
  };
  P1.pts = function (v) { return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  P1.letra = function (i) { return "abcdefgh".charAt(i); };

  P1.relogio = function (ms) {
    ms = Math.max(0, ms);
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
  };

  P1.ESTADOS = { nao_iniciada: "não iniciou", em_andamento: "em andamento", enviada: "enviada",
                 enviada_auto: "enviada automaticamente (tempo esgotado)" };
})();
