/* Página do aluno: entrada → iniciar → responder (salvamento automático) → enviar → recibo/resultado. */
(function () {
  "use strict";
  var $ = P1.$, $$ = P1.$$, esc = P1.esc;
  var sessao = null;            // {token, aluno:{rm,nome,versao}}
  var prova = null;             // prova pública (sem gabarito)
  var prazo = 0, desvio = 0;    // prazo_ms do servidor; desvio = relógio do servidor − relógio local
  var resp = {};                // respostas atuais
  var sujo = false, salvando = false, tSalvar = null, tRelogio = null, tEspera = null;
  var enviando = false, saidas = 0, enviadoAuto = false;
  var envioId = "", inicioAtual = "";

  /* ── utilidades ─────────────────────────────────────────────────────── */
  function aviso(html, tipo) { $("#msg").innerHTML = html ? '<div class="' + (tipo || "aviso") + '">' + html + "</div>" : ""; }
  function tela(id) {
    ["entrada", "antes", "prova", "recibo"].forEach(function (t) { $("#tela-" + t).hidden = t !== id; });
    $("#barra").hidden = id !== "prova";
    document.body.classList.toggle("com-barra", id === "prova");
  }
  function chaveLocal() { return "p1ele:" + (sessao ? sessao.aluno.rm : "") + ":" + inicioAtual; }
  function guardarLocal() { if (inicioAtual) try { localStorage.setItem(chaveLocal(), JSON.stringify({ t: agoraServ(), r: resp })); } catch (e) {} }
  function lerLocal() { try { return JSON.parse(localStorage.getItem(chaveLocal()) || "null"); } catch (e) { return null; } }
  function agoraServ() { return Date.now() + desvio; }
  function acertarRelogio(j) { if (j && j.agora_ms) desvio = j.agora_ms - Date.now(); }

  function api(corpo, tent) {
    if (sessao && corpo.acao !== "entrar") corpo.token = sessao.token;
    return P1.chamar(corpo, tent).then(function (j) {
      if (!j.ok && j.status === 401 && corpo.acao !== "entrar") {
        sair("Sua sessão expirou. Entre de novo com o RM e o código: suas respostas estão guardadas.");
      }
      return j;
    });
  }

  function confirmar(txt) {
    return new Promise(function (ok) {
      $("#dlg-txt").innerHTML = txt; $("#dlg").hidden = false;
      $("#dlg-sim").onclick = function () { $("#dlg").hidden = true; ok(true); };
      $("#dlg-nao").onclick = function () { $("#dlg").hidden = true; ok(false); };
    });
  }

  function sair(msg) {
    clearInterval(tRelogio); clearTimeout(tSalvar); clearTimeout(tEspera);
    sessao = null; prova = null;
    try { sessionStorage.removeItem("p1ele:sessao"); } catch (e) {}
    tela("entrada");
    $("#msg-entrada").innerHTML = msg ? '<div class="aviso">' + esc(msg) + "</div>" : "";
  }

  /* ── entrada ────────────────────────────────────────────────────────── */
  $("#form-entrada").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("#form-entrada button"); b.disabled = true;
    $("#msg-entrada").innerHTML = '<div class="info">Conferindo…</div>';
    P1.chamar({ acao: "entrar", rm: $("#rm").value, codigo: $("#codigo").value }, 3).then(function (j) {
      b.disabled = false;
      if (!j.ok) { $("#msg-entrada").innerHTML = '<div class="erro">' + esc(j.erro) + "</div>"; return; }
      sessao = { token: j.token, aluno: j.aluno };
      try { sessionStorage.setItem("p1ele:sessao", JSON.stringify(sessao)); } catch (e) {}
      $("#msg-entrada").innerHTML = "";
      seguir(j.estado);
    });
  });
  $("#sair1").onclick = $("#sair2").onclick = function (e) { e.preventDefault(); sair(""); };

  /* Decide a tela a partir do estado devolvido pelo servidor. */
  function seguir(est) {
    aviso("");
    if (!est || est.estado === "nao_iniciada") return mostrarAntes(est || {});
    if (est.estado === "em_andamento") return retomar();
    mostrarRecibo(est);
  }

  function mostrarAntes(est) {
    tela("antes");
    $("#a-nome").textContent = sessao.aluno.nome.split(" ")[0];
    clearTimeout(tEspera);
    if (est.aberta) {
      $("#a-situacao").innerHTML = '<div class="ok">A prova está aberta. Quando estiver pronto, clique abaixo.</div>';
      $("#btn-iniciar").hidden = false;
    } else {
      $("#a-situacao").innerHTML = '<div class="info">A prova ainda não foi aberta pelo professor. Esta página confere sozinha a cada 20 segundos.</div>';
      $("#btn-iniciar").hidden = true;
      tEspera = setTimeout(function () {
        api({ acao: "estado" }).then(function (j) { if (j.ok && sessao) seguir(j.estado); else if (sessao) mostrarAntes(est); });
      }, 20000);
    }
  }

  $("#btn-iniciar").addEventListener("click", function () {
    confirmar("Iniciar a prova agora? O cronômetro de <b>90 minutos</b> começa no clique e não pode ser pausado.").then(function (sim) {
      if (!sim) return;
      $("#btn-iniciar").disabled = true;
      retomar().then(function () { $("#btn-iniciar").disabled = false; });
    });
  });

  /* iniciar_ no servidor: cria a prova (1ª vez) ou devolve a que está em andamento. */
  function retomar() {
    aviso('<div class="info">Carregando a prova…</div>', "");
    return api({ acao: "iniciar" }, 4).then(function (j) {
      if (!j.ok) { aviso(esc(j.erro), "erro"); if (j.status !== 401) mostrarAntes({ aberta: false }); return; }
      aviso("");
      if (!j.prova) return seguir(j.estado);
      prova = j.prova; prazo = j.estado.prazo_ms; acertarRelogio(j.estado);
      resp = j.rascunho || {}; inicioAtual = String(j.estado.inicio || "");
      var loc = lerLocal();          // alteração feita neste aparelho depois do último salvamento no servidor
      if (loc && loc.r && loc.t > (j.salvo_ms || 0) && JSON.stringify(loc.r) !== JSON.stringify(resp)) {
        resp = loc.r; sujo = true;
      }
      envioId = "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      desenhar();
      tela("prova");
      $("#b-aluno").textContent = sessao.aluno.nome + " · RM " + sessao.aluno.rm;
      $("#b-salvo").textContent = j.salvo_em ? "salvo " + j.salvo_em.slice(11, 16) : "nada salvo ainda";
      clearInterval(tRelogio); tRelogio = setInterval(tique, 500); tique();
      if (sujo) agendarSalvar(500);
    });
  }

  /* ── desenho da prova ───────────────────────────────────────────────── */
  function desenhar() {
    var h = "", parteB = false;
    h += '<div class="cartao cab-prova"><h1>' + esc(prova.titulo) + '</h1><p>Total: 10,0 pontos · Duração: ' +
         prova.duracao_min + " minutos</p></div>";
    h += '<h2 class="parte">Parte A — questões objetivas <span>(0,5 ponto cada)</span></h2>';
    prova.questoes.forEach(function (q, n) {
      if (q.tipo === "problema" && !parteB) {
        parteB = true;
        h += '<h2 class="parte">Parte B — problemas <span>(digite o resultado na unidade indicada)</span></h2>';
      }
      h += '<article class="cartao questao" id="q-' + q.id + '"><div class="q-cab"><span class="q-num">' + (n + 1) +
           '</span><span class="q-aula">' + esc(q.aula) + '</span><span class="q-pts">' + P1.pts(q.pontos) + " pt</span></div>";
      h += '<div class="q-enun">' + q.enunciado + "</div>";
      if (q.tipo === "objetiva") {
        h += '<div class="alts">';
        q.alternativas.forEach(function (a, i) {
          h += '<label class="alt"><input type="radio" name="' + q.id + '" value="' + i + '"' +
               (String(resp[q.id]) === String(i) ? " checked" : "") + '><span class="alt-l">' + P1.letra(i) +
               ')</span><span>' + a + "</span></label>";
        });
        h += '</div><button class="btn-limpar" data-q="' + q.id + '" type="button">limpar resposta</button>';
      } else {
        h += '<figure class="fig">' + q.figura + "</figure>";
        q.itens.forEach(function (it) {
          var k = q.id + "." + it.id;
          h += '<div class="item"><div class="item-r"><b>' + it.id + ")</b> " + it.rotulo + ' <span class="q-pts">(' +
               P1.pts(it.pontos) + ' pt)</span></div><div class="campo"><input type="text" inputmode="decimal" data-k="' + k +
               '" value="' + esc(resp[k] || "") + '" maxlength="30" autocomplete="off" placeholder="resultado">' +
               '<span class="unid">' + esc(it.unidade) + '</span><span class="lido" data-lido="' + k + '"></span></div></div>';
        });
        h += '<label class="dev">Desenvolvimento (fórmulas e contas):<textarea data-k="' + q.id + '.dev" rows="5" maxlength="4000" ' +
             'placeholder="Ex.: Izmáx = Pz/Vz = …">' + esc(resp[q.id + ".dev"] || "") + "</textarea></label>";
      }
      h += "</article>";
    });
    $("#questoes").innerHTML = h;
    $$("#questoes input[type=radio]").forEach(function (el) {
      el.addEventListener("change", function () { resp[el.name] = Number(el.value); mudou(); });
    });
    $$("#questoes [data-k]").forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.value) resp[el.dataset.k] = el.value; else delete resp[el.dataset.k];
        if (el.tagName === "INPUT") mostrarLido(el);
        mudou();
      });
      if (el.tagName === "INPUT") mostrarLido(el);
    });
    $$(".btn-limpar").forEach(function (b) {
      b.addEventListener("click", function () {
        $$('input[name="' + b.dataset.q + '"]').forEach(function (r) { r.checked = false; });
        delete resp[b.dataset.q]; mudou();
      });
    });
  }

  function mostrarLido(el) {
    var alvo = $('[data-lido="' + el.dataset.k + '"]'), c = P1.lerNumero(el.value);
    if (!el.value) alvo.textContent = "";
    else if (!c.length) { alvo.textContent = "não é um número"; alvo.className = "lido ruim"; }
    else {
      alvo.className = "lido";
      alvo.textContent = "= " + c[0].toLocaleString("pt-BR", { maximumFractionDigits: 6 }) +
        (c.length > 1 ? " ou " + c[1].toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : "");
    }
  }

  /* ── salvamento automático ─────────────────────────────────────────── */
  function mudou() { sujo = true; guardarLocal(); $("#b-salvo").textContent = "alterado…"; agendarSalvar(3000); }
  function agendarSalvar(ms) { clearTimeout(tSalvar); tSalvar = setTimeout(salvar, ms); }
  function salvar() {
    if (!sujo || enviando || !sessao) return;
    if (salvando) return agendarSalvar(1500);
    salvando = true; sujo = false;
    var copia = JSON.parse(JSON.stringify(resp));
    api({ acao: "salvar", respostas: copia, saidas: saidas }, 2).then(function (j) {
      salvando = false;
      if (j.ok && j.encerrada) return encerradaPeloServidor(j.estado);
      if (j.ok) {
        acertarRelogio(j); if (j.prazo_ms) prazo = j.prazo_ms;
        $("#b-salvo").textContent = "salvo " + String(j.salvo_em).slice(11, 16);
        $("#b-salvo").classList.remove("ruim");
      } else {
        sujo = true;
        $("#b-salvo").textContent = j.rede ? "sem internet — guardado no aparelho" : "não salvou: " + j.erro;
        $("#b-salvo").classList.add("ruim");
        if (j.status !== 401) agendarSalvar(10000);
      }
    });
  }
  setInterval(function () { if (sujo && !salvando && prova) salvar(); }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!prova || enviando) return;
    if (document.visibilityState === "hidden") { saidas++; sujo = true; salvar(); }
  });

  /* ── cronômetro ─────────────────────────────────────────────────────── */
  function tique() {
    var falta = prazo - agoraServ();
    $("#b-relogio").textContent = P1.relogio(falta);
    var al = $("#b-alerta");
    $("#barra").classList.toggle("urgente", falta <= 5 * 60000);
    if (falta <= 0) {
      al.hidden = false; al.textContent = "Tempo esgotado — enviando a prova…";
      if (!enviando && !enviadoAuto) { enviadoAuto = true; enviar(true); }
    } else if (falta <= 5 * 60000) {
      al.hidden = false; al.textContent = "Faltam menos de 5 minutos. A prova será enviada automaticamente quando o tempo acabar.";
    } else al.hidden = true;
  }

  /* ── envio ──────────────────────────────────────────────────────────── */
  function faltando() {
    var n = 0;
    prova.questoes.forEach(function (q) {
      if (q.tipo === "objetiva") { if (resp[q.id] === undefined) n++; }
      else q.itens.forEach(function (it) { if (!resp[q.id + "." + it.id]) n++; });
    });
    return n;
  }
  function pedirEnvio() {
    var n = faltando();
    confirmar((n ? "<b>" + n + " resposta(s) em branco.</b><br>" : "") + "Enviar a prova agora? Depois do envio não é possível alterar.")
      .then(function (sim) { if (sim) enviar(false); });
  }
  $("#b-enviar").addEventListener("click", pedirEnvio);
  $("#btn-enviar-fim").addEventListener("click", pedirEnvio);

  function enviar(auto) {
    enviando = true; clearTimeout(tSalvar);
    $$("#b-enviar, #btn-enviar-fim").forEach(function (b) { b.disabled = true; });
    guardarLocal();
    aviso("Enviando…", "info");
    api({ acao: "enviar", respostas: JSON.parse(JSON.stringify(resp)), envio_id: envioId, auto: !!auto, saidas: saidas }, 6)
      .then(function (j) {
        if (j.ok) { clearInterval(tRelogio); aviso(""); return mostrarRecibo(j.estado); }
        enviando = false;
        $$("#b-enviar, #btn-enviar-fim").forEach(function (b) { b.disabled = false; });
        aviso("Não foi possível enviar: " + esc(j.erro) + ". " + (auto ?
              "Suas respostas salvas valem; tentando de novo em 15 s." : "Tente de novo."), "erro");
        if (auto) setTimeout(function () { enviadoAuto = false; }, 15000);
      });
  }

  function encerradaPeloServidor(est) {
    clearInterval(tRelogio); enviando = true;
    mostrarRecibo(est);
    aviso("O tempo da prova terminou e ela foi enviada automaticamente com as respostas salvas.", "aviso");
  }

  /* ── recibo e resultado ─────────────────────────────────────────────── */
  function mostrarRecibo(est) {
    tela("recibo"); prova = null; clearTimeout(tEspera);
    if (inicioAtual) try { localStorage.removeItem(chaveLocal()); } catch (e) {}
    $("#r-dados").innerHTML = '<table class="tab-recibo"><tr><th>Aluno</th><td>' + esc(sessao.aluno.nome) + " (RM " + esc(sessao.aluno.rm) +
      ')</td></tr><tr><th>Protocolo</th><td><b class="protocolo">' + esc(est.protocolo) + "</b></td></tr><tr><th>Recebida em</th><td>" +
      esc(est.enviado_em) + "</td></tr><tr><th>Situação</th><td>" + esc(P1.ESTADOS[est.estado] || est.estado) + "</td></tr></table>" +
      "<p>Anote o protocolo. Você pode fechar esta página.</p>";
    if (!est.notas_liberadas || !est.resultado) {
      $("#r-resultado").innerHTML = '<div class="info">A nota e a correção aparecem aqui quando o professor liberar. Entre de novo mais tarde.</div>';
      return;
    }
    $("#r-resultado").innerHTML = resultadoHtml(est.resultado);
  }

  function resultadoHtml(r) {
    var h = '<div class="nota-final">Nota: <b>' + P1.pts(r.nota) + "</b> / 10,00</div>";
    if (r.comentario) h += '<div class="comentario"><b>Comentário do professor:</b><br>' + esc(r.comentario).replace(/\n/g, "<br>") + "</div>";
    h += '<table class="tab-res"><tr><th>Questão</th><th>Sua resposta</th><th>Gabarito</th><th>Pontos</th></tr>';
    r.gabarito.forEach(function (g, n) {
      if (g.correta !== undefined) {
        var it = r.itens[g.id] || {}, m = r.respostas[g.id];
        h += "<tr><td>" + (n + 1) + "</td><td>" + (m === undefined ? "—" : P1.letra(m) + ")") + "</td><td>" + P1.letra(g.correta) +
             ")</td><td>" + P1.pts(it.pontos || 0) + " / " + P1.pts(it.max || 0) + "</td></tr>";
        h += '<tr class="expl"><td></td><td colspan="3">' + g.explicacao + "</td></tr>";
      } else {
        g.itens.forEach(function (gi) {
          var k = g.id + "." + gi.id, it = r.itens[k] || {};
          h += "<tr><td>" + (n + 1) + gi.id + ")</td><td>" + esc(r.respostas[k] || "—") + " " + esc(gi.unidade) + "</td><td>" +
               P1.num(gi.valor) + " " + esc(gi.unidade) + "</td><td>" + P1.pts(it.pontos || 0) + " / " + P1.pts(it.max || 0) +
               (it.obs ? '<br><small>' + esc(it.obs) + "</small>" : "") + "</td></tr>";
        });
        h += '<tr class="expl"><td></td><td colspan="3">' + g.resolucao + "</td></tr>";
      }
    });
    return h + "</table>";
  }

  $("#btn-atualizar").addEventListener("click", function () {
    api({ acao: "estado" }, 2).then(function (j) { if (j.ok) seguir(j.estado); else aviso(esc(j.erro), "erro"); });
  });

  window.addEventListener("beforeunload", function (e) {
    if (prova && sujo && !enviando) { guardarLocal(); e.preventDefault(); e.returnValue = ""; }
  });

  /* ── início ─────────────────────────────────────────────────────────── */
  if (!P1.configurado()) aviso("O sistema ainda não foi configurado pelo professor.", "erro");
  try { sessao = JSON.parse(sessionStorage.getItem("p1ele:sessao") || "null"); } catch (e) { sessao = null; }
  if (sessao) {
    tela("antes"); $("#a-nome").textContent = sessao.aluno.nome.split(" ")[0];
    $("#a-situacao").innerHTML = '<div class="info">Conferindo a situação da prova…</div>';
    api({ acao: "estado" }, 3).then(function (j) { if (j.ok) seguir(j.estado); else if (sessao) sair(j.erro); });
  } else tela("entrada");

  window.P1_TESTE = { estado: function () { return { resp: resp, prazo: prazo, desvio: desvio, sujo: sujo, saidas: saidas }; },
                      tique: tique, salvar: salvar };
})();
