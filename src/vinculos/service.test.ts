import { test } from "node:test";
import assert from "node:assert/strict";
import { concluirVinculo, desvincularConta } from "./service.ts";
import { ErroVinculo } from "./types.ts";
import { ErroRone } from "../rone/types.ts";
import type { PerfilRone } from "../rone/types.ts";
import type { Vinculo } from "./types.ts";

const discordId = "100000000000000001";
const conta = { jogadorId: "123", servidorId: "456" };
const sessao = { ...conta, jwt: "jwt-ficticio" };
const perfil: PerfilRone = { ...conta, nome: "Teste", nivel: 1, avatar: null };

test("salva somente após login e perfil, preservando Discord ID como string", async () => {
  const ordem: string[] = [];
  const api = {
    autenticar: async () => { ordem.push("login"); return sessao; },
    consultarPerfil: async (jwt: string) => { assert.equal(jwt, sessao.jwt); ordem.push("perfil"); return perfil; },
  };
  const repositorio = { inserir: async (vinculo: Vinculo) => {
    ordem.push("inserir");
    assert.equal(typeof vinculo.discordId, "string");
    assert.deepEqual(vinculo, { discordId, ...sessao });
  } };
  assert.deepEqual(await concluirVinculo(discordId, conta, "1234", api, repositorio), perfil);
  assert.deepEqual(ordem, ["login", "perfil", "inserir"]);
});

for (const codigo of ["nao_autenticado", "timeout", "indisponivel", "rejeitada", "resposta_invalida"] as const) {
  test(`falha de login ou perfil (${codigo}) não salva nem repete ações`, async () => {
    for (const etapa of ["login", "perfil"]) {
      let logins = 0;
      let perfis = 0;
      let escritas = 0;
      const falha = new ErroRone(codigo, "Erro simulado");
      const api = {
        autenticar: async () => { logins++; if (etapa === "login") throw falha; return sessao; },
        consultarPerfil: async () => { perfis++; throw falha; },
      };
      await assert.rejects(concluirVinculo(discordId, conta, "1234", api, { inserir: async () => { escritas++; } }), (erro) => erro === falha);
      assert.equal(logins, 1);
      assert.equal(perfis, etapa === "login" ? 0 : 1);
      assert.equal(escritas, 0);
    }
  });
}

test("login ou perfil de outra conta não cria vínculo", async () => {
  for (const etapa of ["login", "perfil"]) {
    for (const campo of ["jogadorId", "servidorId"] as const) {
      let escritas = 0;
      const api = {
        autenticar: async () => etapa === "login" ? { ...sessao, [campo]: "999" } : sessao,
        consultarPerfil: async () => etapa === "perfil" ? { ...perfil, [campo]: "999" } : perfil,
      };
      await assert.rejects(concluirVinculo(discordId, conta, "1234", api, { inserir: async () => { escritas++; } }),
        (erro: unknown) => erro instanceof ErroVinculo && erro.codigo === "conta_divergente");
      assert.equal(escritas, 0);
    }
  }
});

test("ID do Discord inválido não inicia login", async () => {
  let logins = 0;
  await assert.rejects(concluirVinculo("1' OR 1=1", conta, "1234", {
    autenticar: async () => { logins++; return sessao; }, consultarPerfil: async () => perfil,
  }, { inserir: async () => {} }), (erro: unknown) => erro instanceof ErroVinculo && erro.codigo === "entrada_invalida");
  assert.equal(logins, 0);
});

test("conflito de vínculo não é anunciado como sucesso nem repetido", async () => {
  let escritas = 0;
  const conflito = new ErroVinculo("conta_ja_vinculada", "Conflito simulado");
  await assert.rejects(concluirVinculo(discordId, conta, "1234", {
    autenticar: async () => sessao, consultarPerfil: async () => perfil,
  }, { inserir: async () => { escritas++; throw conflito; } }), (erro) => erro === conflito);
  assert.equal(escritas, 1);
});

test("desvincular revoga a sessão antes de remover a credencial", async () => {
  const ordem: string[] = [];
  const resultado = await desvincularConta(discordId, {
    encerrarSessao: async (jwt) => { assert.equal(jwt, sessao.jwt); ordem.push("logout"); },
  }, {
    buscar: async () => ({ discordId, ...sessao }),
    remover: async () => { ordem.push("remover"); return true; },
  });
  assert.deepEqual(ordem, ["logout", "remover"]);
  assert.deepEqual(resultado, { removido: true, revogacao: "confirmada" });
});

test("logout indisponível ainda permite remoção local sem afirmar revogação", async () => {
  let logouts = 0;
  let remocoes = 0;
  const resultado = await desvincularConta(discordId, {
    encerrarSessao: async () => { logouts++; throw new ErroRone("timeout", "Falha simulada"); },
  }, {
    buscar: async () => ({ discordId, ...sessao }),
    remover: async () => { remocoes++; return true; },
  });
  assert.deepEqual(resultado, { removido: true, revogacao: "nao_confirmada" });
  assert.equal(logouts, 1);
  assert.equal(remocoes, 1);
});

test("credencial corrompida pode ser removida sem tentar logout", async () => {
  let logouts = 0;
  const resultado = await desvincularConta(discordId, { encerrarSessao: async () => { logouts++; } }, {
    buscar: async () => { throw new ErroVinculo("credencial_invalida", "Falha simulada"); },
    remover: async () => true,
  });
  assert.deepEqual(resultado, { removido: true, revogacao: "nao_confirmada" });
  assert.equal(logouts, 0);
});

test("sem vínculo não há logout nem remoção; falha de banco não vira sucesso", async () => {
  const naoChamar = async (): Promise<never> => { throw new Error("Não deveria executar"); };
  assert.deepEqual(await desvincularConta(discordId, { encerrarSessao: naoChamar }, {
    buscar: async () => null, remover: naoChamar,
  }), { removido: false, revogacao: "nao_necessaria" });
  const erro = new ErroVinculo("banco_indisponivel", "Falha simulada");
  await assert.rejects(desvincularConta(discordId, { encerrarSessao: naoChamar }, {
    buscar: async () => { throw erro; }, remover: naoChamar,
  }), (recebido) => recebido === erro);
});
