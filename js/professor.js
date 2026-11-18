/* Painel do professor: cadastro, abrir/fechar, acompanhar, +tempo, reabrir, corrigir, liberar notas. */
(function () {
  "use strict";
  var $ = P1.$, $$ = P1.$$, esc = P1.esc;
  var chave = "", dados = null, banco = null, aberto = null, tAuto = null, editando = false;

  function aviso(html, tipo) {
    $("#msg").innerHTML = html ? '<div class="' + (tipo || "aviso") + '">' + html + "</div>" : "";
    if (tipo === "ok") setTimeout(function () { if ($("#msg .ok")) $("#msg").innerHTML = ""; }, 4000);
  }
  function api(corpo) {
    corpo.chave = chave;
    return P1.chamar(corpo, 3).then(function (j) {
      if (!j.ok && j.status === 403) { sairPainel(j.erro); }
      return j;
    });
  }
  function sairPainel(msg) {
    chave = ""; try { sessionStorage.removeItem("p1ele:chave"); } catch (e) {}
    $("#p-painel").hidden = true; $("#p-entrada").hidden = false; aviso(esc(msg), "erro");
  }
  function confirmar(txt, campoHtml) {
    return new Promise(function (ok) {
      $("#dlg-txt").innerHTML = txt; $("#dlg-campo").innerHTML = campoHtml || ""; $("#dlg").hidden = false;
      var c = $("#dlg-campo input, #dlg-campo textarea"); if (c) c.focus();
      $("#dlg-sim").onclick = function () { $("#dlg").hidden = true; ok({ sim: true, valor: c ? c.value : null }); };
      $("#dlg-nao").onclick = function () { $("#dlg").hidden = true; ok({ sim: false }); };
    });
  }

  /* ── entrada ─────────────────────────────────────────────────────────── */
  $("#form-chave").addEventListener("submit", function (ev) {
    ev.preventDefault(); chave = $("#chave").value.trim(); entrar();
  });
  function entrar() {
    aviso("Carregando…", "info");
    Promise.all([api({ acao: "prof_painel" }), api({ acao: "prof_banco" })]).then(function (r) {
      if (!r[0].ok) return aviso(esc(r[0].erro), "erro");
      try { sessionStorage.setItem("p1ele:chave", chave); } catch (e) {}
      banco = r[1].banco; aviso("");
      $("#p-entrada").hidden = true; $("#p-painel").hidden = false;
      receber(r[0]);
    });
  }

  function recarregar(silencioso) {
    if (!silencioso) aviso("Atualizando…", "info");
    return api({ acao: "prof_painel" }).then(function (j) {
      if (!j.ok) return aviso(esc(j.erro), "erro");
      if (!silencioso) aviso("");
      receber(j);
    });
  }
  $("#btn-recarregar").onclick = function () { recarregar(false); };

  function receber(j) {
    dados = j; dados.desvio = j.agora_ms - Date.now();
    $("#cfg-aberta").checked = j.config.aberta; $("#cfg-notas").checked = j.config.notas_liberadas;
    $("#lnk-planilha").href = j.planilha;
    $("#p-hora").textContent = "atualizado às " + new Date().toLocaleTimeString("pt-BR") + " · back-end " + j.versao;
    tabela();
    if (aberto && !editando) detalhe(aberto);   // não apaga ajustes em digitação
    clearTimeout(tAuto);
    var andamento = j.alunos.some(function (a) { return a.prova && a.prova.estado === "em_andamento"; });
    tAuto = setTimeout(function () { recarregar(true); }, andamento ? 30000 : 120000);
  }

  /* ── configuração ────────────────────────────────────────────────────── */
  function mudarCfg(k, v) {
    var c = { acao: "prof_config" }; c[k] = v;
    api(c).then(function (j) {
      if (!j.ok) return aviso(esc(j.erro), "erro");
      $("#cfg-aberta").checked = j.config.aberta; $("#cfg-notas").checked = j.config.notas_liberadas;
      aviso(k === "aberta" ? (v ? "Prova ABERTA: os alunos já podem iniciar." : "Prova fechada para novos inícios (quem já começou continua).")
                           : (v ? "Notas liberadas para quem já enviou." : "Notas ocultas para os alunos."), "ok");
    });
  }
  $("#cfg-aberta").onchange = function () { mudarCfg("aberta", this.checked); };
  $("#cfg-notas").onchange = function () { mudarCfg("notas_liberadas", this.checked); };

  /* ── tabela de alunos ────────────────────────────────────────────────── */
  function restante(p) {
    var ms = p.prazo_ms - (Date.now() + dados.desvio);
    return ms > 0 ? P1.relogio(ms) : "esgotado";
  }
  function tabela() {
    var h = "<tr><th>RM</th><th>Nome</th><th>Prova</th><th>Código</th><th>Situação</th><th>Início</th><th>Restante / envio</th>" +
            "<th>Saídas da tela</th><th>Nota auto</th><th>Nota final</th><th>Ações</th></tr>";
    if (!dados.alunos.length) h += '<tr><td colspan="11" class="vazio">Nenhum aluno cadastrado. Use o formulário abaixo.</td></tr>';
    dados.alunos.forEach(function (a) {
      var p = a.prova, est = p ? p.estado : "nao_iniciada";
      h += '<tr class="st-' + est + '"><td>' + esc(a.rm) + "</td><td>" + esc(a.nome) + "</td><td>" + esc(a.versao) +
           '</td><td><code class="codigo">' + esc(a.codigo) + "</code></td><td>" + esc(P1.ESTADOS[est]) +
           (a.tentativas_arquivadas ? "<br><small>" + a.tentativas_arquivadas + " tentativa(s) arquivada(s)</small>" : "") + "</td><td>" +
           (p ? esc(p.inicio.slice(11, 16)) : "—") + "</td><td>" +
           (!p ? "—" : est === "em_andamento" ? '<b class="rel" data-rm="' + esc(a.rm) + '">' + restante(p) + "</b>" +
                 (p.minutos_extra ? "<br><small>+" + p.minutos_extra + " min</small>" : "") + "<br><small>salvo " + esc((p.salvo_em || "—").slice(11, 16)) + "</small>"
                 : esc(p.enviado_em.slice(11, 16))) + "</td><td>" + (p ? p.saidas_da_tela : "—") + "</td><td>" +
           (p && p.nota_auto != null ? P1.pts(p.nota_auto) : "—") + "</td><td><b>" + (p && p.nota != null ? P1.pts(p.nota) : "—") +
           '</b></td><td class="acoes">';
      if (p) h += '<button class="btn mini" data-ac="ver" data-rm="' + esc(a.rm) + '">' + (est === "em_andamento" ? "Acompanhar" : "Corrigir") + "</button>";
      if (p && est !== "enviada") h += '<button class="btn mini" data-ac="tempo" data-rm="' + esc(a.rm) + '">+ tempo</button>';
      if (p) h += '<button class="btn mini perigo" data-ac="reabrir" data-rm="' + esc(a.rm) + '">Reabrir</button>';
      h += '<button class="btn mini" data-ac="codigo" data-rm="' + esc(a.rm) + '">Novo código</button>';
      if (!p) h += '<button class="btn mini perigo" data-ac="remover" data-rm="' + esc(a.rm) + '">Remover</button>';
      h += "</td></tr>";
    });
    $("#tab-alunos").innerHTML = h;
    $$("#tab-alunos [data-ac]").forEach(function (b) { b.onclick = function () { acao(b.dataset.ac, b.dataset.rm); }; });
  }
  setInterval(function () {
    if (!dados) return;
    $$(".rel").forEach(function (el) {
      var a = dados.alunos.filter(function (x) { return x.rm === el.dataset.rm; })[0];
      if (a && a.prova) el.textContent = restante(a.prova);
    });
  }, 1000);

  function aluno(rm) { return dados.alunos.filter(function (a) { return a.rm === rm; })[0]; }

  function acao(ac, rm) {
    var a = aluno(rm);
    if (ac === "ver") { aberto = rm; editando = false; detalhe(rm); $("#detalhe").scrollIntoView({ behavior: "smooth" }); return; }
    if (ac === "tempo") {
      return confirmar("Acrescentar quantos minutos à prova de <b>" + esc(a.nome) + "</b>? " +
                       (a.prova.estado === "enviada_auto" ? "A prova volta para o aluno, com o que ele já tinha escrito." : ""),
                       '<input type="number" min="1" max="90" value="10" class="campo-dlg">').then(function (r) {
        if (!r.sim) return;
        api({ acao: "prof_tempo", rm: rm, minutos: Number(r.valor) }).then(function (j) {
          if (!j.ok) return aviso(esc(j.erro), "erro");
          aviso("Novo prazo de " + esc(a.nome) + ": " + esc(j.prazo.slice(11, 16)) + ".", "ok"); recarregar(true);
        });
      });
    }
    if (ac === "reabrir") {
      return confirmar("<b>Reabrir</b> a prova de " + esc(a.nome) + "? A tentativa atual vai para a aba Historico e o aluno " +
                       "começa de novo, com 90 minutos novos (a prova precisa estar aberta).", '<input placeholder="motivo (opcional)" class="campo-dlg">')
        .then(function (r) {
          if (!r.sim) return;
          api({ acao: "prof_reabrir", rm: rm, motivo: r.valor || "" }).then(function (j) {
            if (!j.ok) return aviso(esc(j.erro), "erro");
            if (aberto === rm) { aberto = null; $("#detalhe").hidden = true; }
            aviso("Tentativa arquivada. " + esc(a.nome) + " pode iniciar de novo.", "ok"); recarregar(true);
          });
        });
    }
    if (ac === "codigo") {
      return confirmar("Gerar um <b>novo código de acesso</b> para " + esc(a.nome) + "? O código antigo deixa de funcionar.").then(function (r) {
        if (!r.sim) return;
        api({ acao: "prof_novo_codigo", rm: rm }).then(function (j) {
          if (!j.ok) return aviso(esc(j.erro), "erro");
          aviso("Novo código de " + esc(a.nome) + ": <code class='codigo'>" + esc(j.codigo) + "</code>", "ok"); recarregar(true);
        });
      });
    }
    if (ac === "remover") {
      return confirmar("Remover " + esc(a.nome) + " (RM " + esc(rm) + ") do cadastro?").then(function (r) {
        if (!r.sim) return;
        api({ acao: "prof_remover_aluno", rm: rm }).then(function (j) {
          if (!j.ok) return aviso(esc(j.erro), "erro");
          aviso("Aluno removido.", "ok"); recarregar(true);
        });
      });
    }
  }

  $("#form-aluno").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api({ acao: "prof_aluno", rm: $("#n-rm").value, nome: $("#n-nome").value, versao: $("#n-versao").value }).then(function (j) {
      if (!j.ok) return aviso(esc(j.erro), "erro");
      aviso("Aluno salvo: " + esc(j.aluno.nome) + " · RM " + esc(j.aluno.rm) + " · Prova " + esc(j.aluno.versao) +
            " · código <code class='codigo'>" + esc(j.aluno.codigo) + "</code>", "ok");
      $("#form-aluno").reset(); recarregar(true);
    });
  });

  /* ── detalhe / correção ─────────────────────────────────────────────── */
  function detalhe(rm) {
    var a = aluno(rm);
    if (!a || !a.prova) { $("#detalhe").hidden = true; return; }
    var p = a.prova, q = banco.versoes[a.versao].questoes, fin = p.estado !== "em_andamento";
    var r = fin ? (p.respostas || {}) : (p.rascunho || {}), corr = p.correcao ? p.correcao.itens : {};
    var h = '<div class="det-cab"><h2>' + esc(a.nome) + " · RM " + esc(a.rm) + " · Prova " + esc(a.versao) + "</h2>" +
            '<button class="btn" id="det-fechar">Fechar</button></div><p>' + esc(P1.ESTADOS[p.estado]) +
            (fin ? " em " + esc(p.enviado_em) + " · protocolo <b>" + esc(p.protocolo) + "</b>" :
                   " · mostrando o rascunho salvo às " + esc((p.salvo_em || "—").slice(11, 19))) +
            " · saídas da tela: " + p.saidas_da_tela + "</p>";
    if (fin) h += '<p class="nota-peq">A coluna <b>Ajuste</b> substitui a nota automática do item (deixe vazio para manter a automática). ' +
                  "A nota final é recalculada ao salvar.</p>";
    h += '<table class="tab tab-corr"><tr><th>Item</th><th>Resposta do aluno</th><th>Gabarito</th><th>Auto</th>' + (fin ? "<th>Ajuste</th>" : "") + "</tr>";
    q.forEach(function (Q, n) {
      if (Q.tipo === "objetiva") {
        var c = corr[Q.id] || {}, m = r[Q.id];
        h += '<tr class="' + (fin ? (c.ok ? "certo" : "errado") : "") + '"><td>' + (n + 1) + " <small>(" + esc(Q.aula) + ")</small></td><td>" +
             (m === undefined ? "—" : P1.letra(m) + ") " + Q.alternativas[m]) + "</td><td>" + P1.letra(Q.correta) + ")</td><td>" +
             (fin ? P1.pts(c.pontos || 0) : "") + " / " + P1.pts(Q.pontos) + "</td>" + (fin ? celAjuste(Q.id, c.max, p.ajustes) : "") + "</tr>";
      } else {
        Q.itens.forEach(function (it) {
          var k = Q.id + "." + it.id, c = corr[k] || {};
          var lido = P1.lerNumero(r[k]);
          h += '<tr class="' + (fin ? (c.ok ? "certo" : "errado") : "") + '"><td>' + (n + 1) + it.id + ") <small>" + esc(it.unidade) + "</small></td><td>" +
               esc(r[k] || "—") + (lido.length ? " <small>(= " + P1.num(lido[0], 4) + ")</small>" : "") + (c.obs ? '<br><small class="obs">' + esc(c.obs) + "</small>" : "") +
               "</td><td>" + P1.num(it.valor, 3) + " " + esc(it.unidade) + " <small>(±" + Math.round(it.tol * 100) + "%)</small></td><td>" +
               (fin ? P1.pts(c.pontos || 0) : "") + " / " + P1.pts(it.pontos) + "</td>" + (fin ? celAjuste(k, it.pontos, p.ajustes) : "") + "</tr>";
        });
        h += '<tr class="dev"><td></td><td colspan="' + (fin ? 4 : 3) + '"><b>Desenvolvimento:</b><pre>' + esc(r[Q.id + ".dev"] || "(em branco)") + "</pre></td></tr>";
      }
    });
    h += "</table>";
    if (fin) {
      h += '<label class="dev">Comentário para o aluno (aparece quando as notas forem liberadas):<textarea id="det-com" rows="3" maxlength="1500">' +
           esc(p.comentario) + "</textarea></label>" +
           '<p class="det-rod">Nota automática: <b>' + P1.pts(p.nota_auto) + '</b> · Nota final: <b id="det-nota">' + P1.pts(p.nota) +
           '</b> <button class="btn btn-prim" id="det-salvar">Salvar correção</button></p>';
    }
    $("#detalhe").innerHTML = h; $("#detalhe").hidden = false;
    $("#det-fechar").onclick = function () {
      if (editando && !window.confirm("Há ajustes não salvos. Fechar mesmo assim?")) return;
      aberto = null; editando = false; $("#detalhe").hidden = true;
    };
    if (fin) {
      $$("#detalhe input[data-aj]").forEach(function (el) { el.addEventListener("input", function () { editando = true; previa(); }); });
      $("#det-com").addEventListener("input", function () { editando = true; });
      $("#det-salvar").onclick = function () {
        var aj = {};
        $$("#detalhe input[data-aj]").forEach(function (el) { if (el.value.trim() !== "") aj[el.dataset.aj] = el.value.trim(); });
        api({ acao: "prof_ajustar", rm: rm, ajustes: aj, comentario: $("#det-com").value }).then(function (j) {
          if (!j.ok) return aviso(esc(j.erro), "erro");
          editando = false;
          aviso("Correção salva. Nota final de " + esc(a.nome) + ": " + P1.pts(j.nota), "ok"); recarregar(true);
        });
      };
    }
    function previa() {
      var t = 0;
      Object.keys(corr).forEach(function (k) {
        var el = $('#detalhe input[data-aj="' + k + '"]'), v = el && el.value.trim() !== "" ? Number(el.value.replace(",", ".")) : NaN;
        t += isFinite(v) ? v : corr[k].pontos;
      });
      $("#det-nota").textContent = P1.pts(t) + " (não salvo)";
    }
  }
  function celAjuste(k, max, aj) {
    var v = aj && aj[k] != null ? String(aj[k]).replace(".", ",") : "";
    return '<td><input class="aj" data-aj="' + k + '" value="' + esc(v) + '" inputmode="decimal" placeholder="0 a ' + P1.pts(max) + '"></td>';
  }

  /* ── CSV ─────────────────────────────────────────────────────────────── */
  $("#btn-csv").onclick = function () {
    var lin = [["RM", "Nome", "Prova", "Situacao", "Inicio", "Enviada em", "Protocolo", "Nota automatica", "Nota final", "Saidas da tela"]];
    dados.alunos.forEach(function (a) {
      var p = a.prova || {};
      lin.push([a.rm, a.nome, a.versao, P1.ESTADOS[p.estado || "nao_iniciada"], p.inicio || "", p.enviado_em || "", p.protocolo || "",
                p.nota_auto != null ? String(p.nota_auto).replace(".", ",") : "", p.nota != null ? String(p.nota).replace(".", ",") : "",
                p.saidas_da_tela != null ? p.saidas_da_tela : ""]);
    });
    var csv = "\ufeff" + lin.map(function (l) { return l.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var ln = document.createElement("a"); ln.href = url; ln.download = "P1_Eletronica_notas.csv"; document.body.appendChild(ln); ln.click();
    setTimeout(function () { URL.revokeObjectURL(url); ln.remove(); }, 1000);
  };

  /* ── prévia das provas com gabarito ──────────────────────────────────── */
  $$("[data-ver]").forEach(function (b) {
    b.onclick = function () {
      var v = b.dataset.ver, qs = banco.versoes[v].questoes, h = "<h2>Prova " + v + "</h2>";
      qs.forEach(function (q, n) {
        h += '<article class="questao previa"><div class="q-cab"><span class="q-num">' + (n + 1) + '</span><span class="q-aula">' + esc(q.aula) +
             '</span><span class="q-pts">' + P1.pts(q.pontos) + ' pt</span></div><div class="q-enun">' + q.enunciado + "</div>";
        if (q.tipo === "objetiva") {
          h += "<ol type='a'>" + q.alternativas.map(function (a, i) { return "<li" + (i === q.correta ? ' class="certa"' : "") + ">" + a + "</li>"; }).join("") +
               "</ol><p class='expl'>" + q.explicacao + "</p>";
        } else {
          h += '<figure class="fig">' + q.figura + "</figure><ul>" + q.itens.map(function (it) {
            return "<li>" + it.id + ") " + it.rotulo + " → <b>" + P1.num(it.valor, 3) + " " + esc(it.unidade) + "</b> (" + P1.pts(it.pontos) + " pt)</li>";
          }).join("") + "</ul><p class='expl'>" + q.resolucao + "</p>";
        }
        h += "</article>";
      });
      $("#previa").innerHTML = h;
    };
  });

  /* ── início ──────────────────────────────────────────────────────────── */
  if (!P1.configurado()) aviso("Falta colar a URL do Apps Script em js/config.js (veja o guia de implantação).", "erro");
  try { chave = sessionStorage.getItem("p1ele:chave") || ""; } catch (e) { chave = ""; }
  if (chave) entrar();
})();
