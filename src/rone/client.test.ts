import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { ClienteRone } from "./client.ts";
import { ErroRone } from "./types.ts";
import type { TipoErroRone } from "./types.ts";

// Todas as respostas são simuladas: nenhum teste usa rede ou conta real.
const conta = { jogadorId: "123", servidorId: "456" };
const jwtFicticio = "jwt-ficticio-apenas-para-teste";

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });
}

function simular(responder: (url: string, opcoes: RequestInit) => Response | Promise<Response>) {
  let chamadas = 0;
  const transporte: typeof fetch = async (url, opcoes) => {
    chamadas++;
    return responder(String(url), opcoes ?? {});
  };
  return { cliente: new ClienteRone({ transporte, baseUrl: "https://arena.fastapicloud.dev/api" }), chamadas: () => chamadas };
}

function erroDoTipo(tipo: TipoErroRone) {
  return (erro: unknown) => erro instanceof ErroRone && erro.tipo === tipo;
}

test("envio de código respeita contrato e faz uma única chamada", async () => {
  const { cliente, chamadas } = simular((url, opcoes) => {
    assert.equal(url, "https://arena.fastapicloud.dev/api/user/auth/send-vc");
    assert.equal(opcoes.method, "POST");
    assert.deepEqual(JSON.parse(String(opcoes.body)), { role_id: 123, zone_id: 456 });
    const headers = new Headers(opcoes.headers);
    assert.equal(headers.get("Authorization"), null);
    assert.match(headers.get("User-Agent") ?? "", /ChicagoDiscordBot/);
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(opcoes.redirect, "error");
    return json({ code: 0, data: "" });
  });
  await cliente.solicitarCodigo(conta);
  assert.equal(chamadas(), 1);
});

test("login valida identidade, converte código para inteiro e descarta token não necessário", async () => {
  const { cliente } = simular((url, opcoes) => {
    assert.match(url, /\/user\/auth\/login$/);
    assert.deepEqual(JSON.parse(String(opcoes.body)), { role_id: 123, zone_id: 456, vc: 123 });
    return json({ code: 0, data: { jwt: jwtFicticio, roleid: 123, zoneid: 456, token: "nao-persistir" } });
  });
  assert.deepEqual(await cliente.autenticar(conta, "0123"), { ...conta, jwt: jwtFicticio });
});

for (const [indice, data] of [null, {}, { jwt: "", roleid: 123, zoneid: 456 }, { jwt: jwtFicticio, roleid: 999, zoneid: 456 }].entries()) {
  test(`login recusa sessão vazia, incompleta ou de outra conta: caso ${indice + 1}`, async () => {
    const { cliente } = simular(() => json({ code: 0, data }));
    await assert.rejects(cliente.autenticar(conta, "1234"), erroDoTipo("resposta_invalida"));
  });
}

test("entradas inválidas são recusadas antes de acessar a rede", async () => {
  const { cliente, chamadas } = simular(() => { throw new Error("Não deveria chamar o transporte"); });
  for (const jogadorId of ["0", "-1", "1.5", "abc", "001", "9007199254740992"]) {
    await assert.rejects(cliente.solicitarCodigo({ ...conta, jogadorId }), erroDoTipo("entrada_invalida"));
  }
  for (const codigo of ["123", "12345", "abcd", " 1234"]) {
    await assert.rejects(cliente.autenticar(conta, codigo), erroDoTipo("entrada_invalida"));
  }
  await assert.rejects(cliente.consultarPerfil(""), erroDoTipo("entrada_invalida"));
  assert.equal(chamadas(), 0);
});

test("perfil usa somente Bearer JWT e retorna IDs como strings", async () => {
  const { cliente } = simular((url, opcoes) => {
    assert.match(url, /\/user\/info\?lang=pt$/);
    assert.equal(new Headers(opcoes.headers).get("Authorization"), `Bearer ${jwtFicticio}`);
    return json({ code: 0, data: { roleId: 123, zoneId: 456, name: "Jogador fictício", level: 10 } });
  });
  assert.deepEqual(await cliente.consultarPerfil(jwtFicticio), {
    ...conta, nome: "Jogador fictício", nivel: 10, avatar: null,
  });
});

test("perfil não transforma dados vazios em conta confirmada", async () => {
  for (const data of [null, "", {}, { roleId: 123, zoneId: 456, level: "10" }]) {
    const { cliente } = simular(() => json({ code: 0, data }));
    await assert.rejects(cliente.consultarPerfil(jwtFicticio), erroDoTipo("resposta_invalida"));
  }
});

test("logout usa o endpoint documentado e não transmite o token secundário", async () => {
  const { cliente, chamadas } = simular((url, opcoes) => {
    assert.match(url, /\/user\/auth\/logout$/);
    assert.equal(opcoes.method, "POST");
    assert.equal(opcoes.body, undefined);
    assert.equal(new Headers(opcoes.headers).get("Authorization"), `Bearer ${jwtFicticio}`);
    return json({ code: 0, data: "" });
  });
  await cliente.encerrarSessao(jwtFicticio);
  assert.equal(chamadas(), 1);
});

test("herói retorna apenas nome, função, rota e imagem, removendo rótulos vazios", async () => {
  const { cliente } = simular((url) => {
    assert.match(url, /\/heroes\/Luo%20Yi\?lang=pt&size=1$/);
    return json({ code: 0, data: { records: [{ data: { hero: { data: {
      name: "Luo Yi", sortlabel: ["Mage", ""], roadsortlabel: ["Mid Lane", ""], head: "https://example.com/hero.png", story: "ignorar",
    } } } }] } });
  });
  assert.deepEqual(await cliente.consultarHeroi("Luo Yi"), {
    nome: "Luo Yi", funcoes: ["Mage"], rotas: ["Mid Lane"], imagem: "https://example.com/hero.png",
  });
});

test("herói vazio tem erro próprio e imagem insegura não é aceita", async () => {
  const vazio = simular(() => json({ code: 0, data: { records: [] } }));
  await assert.rejects(vazio.cliente.consultarHeroi("Inexistente"), erroDoTipo("nao_encontrado"));
  const inseguro = simular(() => json({ code: 0, data: { records: [{ data: { hero: { data: {
    name: "Miya", head: "javascript:alert(1)",
  } } } }] } }));
  await assert.rejects(inseguro.cliente.consultarHeroi("Miya"), erroDoTipo("resposta_invalida"));
});

for (const [status, tipo] of [[401, "nao_autenticado"], [403, "indisponivel"], [404, "nao_encontrado"], [422, "rejeitada"], [429, "limite"], [503, "indisponivel"]] as const) {
  test(`HTTP ${status} vira ${tipo} sem expor corpo externo nem repetir login`, async () => {
    const { cliente, chamadas } = simular(() => json({ code: "ERRO", message: jwtFicticio }, status));
    await assert.rejects(cliente.autenticar(conta, "1234"), (erro: unknown) => {
      assert.ok(erro instanceof ErroRone);
      assert.equal(erro.tipo, tipo);
      assert.ok(!inspect(erro).includes(jwtFicticio));
      return true;
    });
    assert.equal(chamadas(), 1);
  });
}

test("HTTP 200 com code não zero não é sucesso nem sessão expirada presumida", async () => {
  const { cliente, chamadas } = simular(() => json({ code: 123, msg: jwtFicticio }));
  await assert.rejects(cliente.solicitarCodigo(conta), erroDoTipo("rejeitada"));
  assert.equal(chamadas(), 1);
});

test("HTML, JSON malformado e envelope inválido são recusados", async () => {
  for (const resposta of [
    new Response("<html>bloqueio</html>"),
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    json(null), json({ code: "0", data: {} }),
  ]) {
    const { cliente } = simular(() => resposta);
    await assert.rejects(cliente.solicitarCodigo(conta), erroDoTipo("resposta_invalida"));
  }
});

test("falha de rede não vaza causa e não repete envio de código", async () => {
  const { cliente, chamadas } = simular(() => { throw new Error(`Falha contendo ${jwtFicticio}`); });
  await assert.rejects(cliente.solicitarCodigo(conta), (erro: unknown) => {
    assert.ok(erro instanceof ErroRone);
    assert.equal(erro.tipo, "indisponivel");
    assert.ok(!inspect(erro).includes(jwtFicticio));
    assert.equal(erro.cause, undefined);
    return true;
  });
  assert.equal(chamadas(), 1);
});

test("timeout cancela a espera e não repete login", async () => {
  let chamadas = 0;
  const transporte: typeof fetch = async (_url, opcoes) => {
    chamadas++;
    return new Promise<Response>((_resolve, reject) => {
      // Mantém o teste ativo e falha se o AbortSignal não funcionar.
      const limite = setTimeout(() => reject(new Error("Timeout não disparou")), 500);
      opcoes?.signal?.addEventListener("abort", () => {
        clearTimeout(limite);
        reject(opcoes.signal?.reason);
      }, { once: true });
    });
  };
  const cliente = new ClienteRone({ transporte, timeoutMs: 10 });
  await assert.rejects(cliente.autenticar(conta, "1234"), erroDoTipo("timeout"));
  assert.equal(chamadas, 1);
});

test("configuração insegura é recusada antes de qualquer requisição", () => {
  for (const baseUrl of ["http://example.com/api", "https://usuario:senha@example.com/api", "https://example.com/api?token=segredo", "https://example.com/"]) {
    assert.throws(() => new ClienteRone({ baseUrl }), erroDoTipo("entrada_invalida"));
  }
});

test("temporadas usam Bearer JWT e são validadas, ordenadas e deduplicadas", async () => {
  const { cliente } = simular((url, opcoes) => {
    assert.match(url, /\/user\/season\?lang=pt$/);
    assert.equal(new Headers(opcoes.headers).get("Authorization"), `Bearer ${jwtFicticio}`);
    return json({ code: 0, data: { sids: [39, 40, 39] } });
  });
  assert.deepEqual(await cliente.consultarTemporadas(jwtFicticio), [40, 39]);
  const vazio = simular(() => json({ code: 0, data: { sids: [] } }));
  assert.deepEqual(await vazio.cliente.consultarTemporadas(jwtFicticio), []);
  for (const sids of [null, [null], ["40"], [-1], [9007199254740992]]) {
    const invalido = simular(() => json({ code: 0, data: { sids } }));
    await assert.rejects(invalido.cliente.consultarTemporadas(jwtFicticio), erroDoTipo("resposta_invalida"));
  }
});

test("histórico valida campos usados sem converter IDs grandes de partidas", async () => {
  const { cliente } = simular((url, opcoes) => {
    assert.match(url, /\/user\/matches\?sid=40&limit=5&lang=pt$/);
    assert.equal(opcoes.method, "GET");
    assert.equal(new Headers(opcoes.headers).get("Authorization"), `Bearer ${jwtFicticio}`);
    return json({ code: 0, data: {
      pageInfo: { hasNext: true, nextCursor: "4143043017340290910" },
      result: [{ sid: 40, bid: 4132717739868068400, bid_s: "4132717739868068534", hid: 1, hid_e: { n: "Miya" }, k: 3, d: 0, a: 2, res: 1, ts: 1774857999 }],
    } });
  });
  assert.deepEqual(await cliente.consultarHistorico(jwtFicticio, 40), {
    temporada: 40, temMais: true, partidas: [{ heroi: "Miya", heroiId: "1", resultado: "vitoria", abates: 3, mortes: 0, assistencias: 2, ocorridaEm: 1774857999 }],
  });
});

test("histórico vazio e campos opcionais ausentes não viram estatísticas inventadas", async () => {
  const vazio = simular(() => json({ code: 0, data: { result: [] } }));
  assert.deepEqual(await vazio.cliente.consultarHistorico(jwtFicticio, 40), { temporada: 40, partidas: [], temMais: null });
  const parcial = simular(() => json({ code: 0, data: { result: [{}] } }));
  const historico = await parcial.cliente.consultarHistorico(jwtFicticio, 40);
  assert.deepEqual(historico.partidas[0], { heroi: null, heroiId: null, resultado: "nao_informado", abates: null, mortes: null, assistencias: null, ocorridaEm: null });
});

test("histórico recusa contagens, resultados, temporadas e paginação malformados", async () => {
  for (const partida of [{ k: "3" }, { d: -1 }, { a: 1.5 }, { res: 2 }, { sid: 39 }, { ts: Number.MAX_SAFE_INTEGER }, { hid_e: "Miya" }]) {
    const { cliente } = simular(() => json({ code: 0, data: { result: [partida] } }));
    await assert.rejects(cliente.consultarHistorico(jwtFicticio, 40), erroDoTipo("resposta_invalida"));
  }
  for (const data of [null, {}, { result: null }, { result: [], pageInfo: { hasNext: "sim" } }]) {
    const { cliente } = simular(() => json({ code: 0, data }));
    await assert.rejects(cliente.consultarHistorico(jwtFicticio, 40), erroDoTipo("resposta_invalida"));
  }
});

test("histórico respeita o limite e não usa cursor nem faz consultas adicionais", async () => {
  const { cliente, chamadas } = simular(() => json({ code: 0, data: { result: [{ res: 0 }, { res: 1 }], pageInfo: { hasNext: false } } }));
  const resultado = await cliente.consultarHistorico(jwtFicticio, 40, 1);
  assert.equal(resultado.partidas.length, 1);
  assert.equal(resultado.partidas[0].resultado, "derrota");
  assert.equal(resultado.temMais, true);
  assert.equal(chamadas(), 1);
});

test("histórico rejeita opções inválidas sem acessar a rede", async () => {
  const { cliente, chamadas } = simular(() => { throw new Error("Não deveria acessar a rede"); });
  for (const [temporada, limite] of [[-1, 5], [1.5, 5], [40, 0], [40, 11]]) {
    await assert.rejects(cliente.consultarHistorico(jwtFicticio, temporada, limite), erroDoTipo("entrada_invalida"));
  }
  assert.equal(chamadas(), 0);
});

test("recusa de temporadas ou partidas preserva só operação, HTTP e código de resultado", async () => {
  for (const operacao of ["temporadas", "partidas"] as const) {
    const { cliente, chamadas } = simular(() => json({
      code: -123,
      message: `Mensagem externa contendo ${jwtFicticio}`,
      data: { jwt: jwtFicticio, vc: "4321" },
    }));
    const promessa = operacao === "temporadas"
      ? cliente.consultarTemporadas(jwtFicticio)
      : cliente.consultarHistorico(jwtFicticio, 40);
    await assert.rejects(promessa, (erro: unknown) => {
      assert.ok(erro instanceof ErroRone);
      assert.equal(erro.tipo, "rejeitada");
      assert.deepEqual(erro.diagnostico, { operacao, statusHttp: 200, codigoApi: -123 });
      const exibido = inspect(erro);
      assert.ok(!exibido.includes(jwtFicticio));
      assert.ok(!exibido.includes("4321"));
      assert.ok(!exibido.includes("sid=40"));
      assert.equal(erro.cause, undefined);
      return true;
    });
    assert.equal(chamadas(), 1);
  }
});

test("estatísticas usam somente /user/stats com Bearer e convertem a nota documentada", async () => {
  const { cliente, chamadas } = simular((url, opcoes) => {
    assert.match(url, /\/user\/stats\?lang=pt$/);
    assert.equal(opcoes.method, "GET");
    assert.equal(new Headers(opcoes.headers).get("Authorization"), `Bearer ${jwtFicticio}`);
    assert.equal(opcoes.body, undefined);
    return json({ code: 0, data: { tc: 3, wc: 1, as: 762.3552, mvpc: 0, gt: 77.95 } });
  });
  const dados = await cliente.consultarEstatisticas(jwtFicticio);
  assert.equal(dados.partidas, 3);
  assert.equal(dados.vitorias, 1);
  assert.equal(dados.mvps, 0);
  assert.ok(dados.winrate !== null && Math.abs(dados.winrate - 33.3333333333) < 0.000001);
  assert.ok(dados.notaMedia !== null && Math.abs(dados.notaMedia - 7.623552) < 0.000001);
  assert.equal(chamadas(), 1);
  assert.ok(!("gt" in dados));
});

test("estatísticas com zero partidas não calculam porcentagem nem inventam campos", async () => {
  const { cliente } = simular(() => json({ code: 0, data: { tc: 0, wc: 0, mvpc: 0 } }));
  assert.deepEqual(await cliente.consultarEstatisticas(jwtFicticio), {
    partidas: 0, vitorias: 0, mvps: 0, winrate: null, notaMedia: null,
  });
});

test("estatísticas incompletas preservam null e zero vitórias pode produzir 0%", async () => {
  const parcial = simular(() => json({ code: 0, data: { wc: 5 } }));
  assert.deepEqual(await parcial.cliente.consultarEstatisticas(jwtFicticio), {
    partidas: null, vitorias: 5, mvps: null, winrate: null, notaMedia: null,
  });
  const semVitorias = simular(() => json({ code: 0, data: { tc: 10, wc: 0, as: 0 } }));
  const dados = await semVitorias.cliente.consultarEstatisticas(jwtFicticio);
  assert.equal(dados.winrate, 0);
  assert.equal(dados.notaMedia, 0);
});

test("estatísticas vazias, negativas, não numéricas ou contraditórias são recusadas", async () => {
  for (const data of [null, {}, { tc: null, wc: null }, { tc: -1 }, { wc: "5" }, { tc: 1.5 }, { mvpc: -2 }, { tc: 2, wc: 3 }, { tc: 0, wc: 1 }, { as: "750" }, { as: -1 }, { tc: 9007199254740992 }]) {
    const { cliente } = simular(() => json({ code: 0, data }));
    await assert.rejects(cliente.consultarEstatisticas(jwtFicticio), erroDoTipo("resposta_invalida"));
  }
  const infinito = simular(() => new Response('{"code":0,"data":{"tc":1,"as":1e309}}', { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(infinito.cliente.consultarEstatisticas(jwtFicticio), erroDoTipo("resposta_invalida"));
});

test("recusa de estatísticas tem diagnóstico seguro e uma única tentativa", async () => {
  const { cliente, chamadas } = simular(() => json({ code: 10407, message: jwtFicticio, data: { jwt: jwtFicticio, vc: "4321" } }));
  await assert.rejects(cliente.consultarEstatisticas(jwtFicticio), (erro: unknown) => {
    assert.ok(erro instanceof ErroRone);
    assert.equal(erro.tipo, "rejeitada");
    assert.deepEqual(erro.diagnostico, { operacao: "estatisticas", statusHttp: 200, codigoApi: 10407 });
    assert.ok(!inspect(erro).includes(jwtFicticio));
    assert.ok(!inspect(erro).includes("4321"));
    return true;
  });
  assert.equal(chamadas(), 1);
});
