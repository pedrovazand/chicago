import { test } from "node:test";
import assert from "node:assert/strict";
import { AtendimentoBooster } from "./benefit-service.ts";
import type { Beneficio, DiscordBeneficio, ReferenciaAtendimento, RepositorioBeneficio } from "./benefit-types.ts";
import { ErroBooster } from "./types.ts";
import { validarHex, validarIcone, validarNome } from "./preferences.ts";
import { permissoesAtendimento } from "./benefit-discord.ts";
import { PermissionFlagsBits as P } from "discord.js";

const config = { servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5", mensagemPainelId: "6", painelPendente: false, imagemPainel: null };
const copiar = (b: Beneficio): Beneficio => ({ ...b, icone: b.icone ? Buffer.from(b.icone) : null });

function ambiente() {
  const salvos = new Map<string, Beneficio>();
  const ocupados = new Set<string>();
  const chamadas = { canais: 0, cargos: 0, atribuicoes: 0, consultas: 0 };
  let boost = true;
  let gradiente = true;
  let icone = true;
  const repo: RepositorioBeneficio = {
    exclusivo: async (g, u, tarefa) => {
      const chave = `${g}:${u}`;
      if (ocupados.has(chave)) throw new ErroBooster("Operação em andamento");
      ocupados.add(chave);
      try {
        return await tarefa({
          buscar: async () => salvos.has(chave) ? copiar(salvos.get(chave)!) : null,
          salvar: async (b) => { salvos.set(chave, copiar(b)); },
        });
      } finally { ocupados.delete(chave); }
    },
  };
  const discord: DiscordBeneficio = {
    elegivel: async () => { chamadas.consultas++; return boost; },
    recursos: async () => ({ gradiente, icone }),
    canalExiste: async () => true,
    apagarCanal: async () => {},
    criarCanal: async () => { chamadas.canais++; return "10"; },
    recuperarCanal: async () => "10",
    prepararCanal: async () => {},
    apresentar: async () => "11",
    criarCargo: async () => { chamadas.cargos++; return "12"; },
    aplicarCargo: async (_config, b) => {
      assert.equal(salvos.get("1:100")?.cargoId, b.cargoId, "ID deve estar persistido antes da atribuição");
      chamadas.atribuicoes++;
    },
  };
  const novo = () => new AtendimentoBooster(repo, { buscar: async () => config }, discord);
  const b = () => copiar(salvos.get("1:100")!);
  const ref = (): ReferenciaAtendimento => ({ servidorId: "1", usuarioId: "100", canalId: b().canalId!, sessao: b().sessao, revisao: b().revisao });
  const resumo = async (service: AtendimentoBooster) => {
    await service.alterar(ref(), "nome", { nome: "Meu cargo" });
    await service.alterar(ref(), "solida");
    await service.alterar(ref(), "cores", { primaria: "#ad75ff" });
    await service.alterar(ref(), "icone", { icone: null });
  };
  return { novo, repo, discord, chamadas, b, ref, resumo, salvos,
    tirarBoost: () => { boost = false; }, tirarGradiente: () => { gradiente = false; }, tirarIcone: () => { icone = false; } };
}

test("nome e HEX são validados sem aceitar formatos incompletos", () => {
  assert.equal(validarHex(" #ad75ff "), "#AD75FF");
  for (const v of ["#FFF", "#GG1234", "123456", "#1234567", "red"]) assert.throws(() => validarHex(v), ErroBooster);
  assert.equal(validarNome(" Meu cargo "), "Meu cargo");
  for (const v of ["", "a\nb", "x".repeat(101)]) assert.throws(() => validarNome(v));
  assert.throws(() => validarIcone(Buffer.from("não é PNG")));
});

test("permissões privadas são explícitas e fechamento bloqueia envio do solicitante", () => {
  const abertas = permissoesAtendimento("1", "100", "999", "4", false);
  assert.equal(abertas.length, 4);
  assert.equal(BigInt(abertas[0].deny) & P.ViewChannel, P.ViewChannel);
  assert.deepEqual(abertas.map(o => o.id), ["1", "4", "100", "999"]);
  const fechada = permissoesAtendimento("1", "100", "999", "4", true)[2];
  assert.equal(BigInt(fechada.deny) & P.SendMessages, P.SendMessages);
  assert.equal(BigInt(fechada.allow) & P.SendMessages, 0n);
});

test("sem boost não abre atendimento nem salva benefício", async () => {
  const a = ambiente(); a.tirarBoost();
  await assert.rejects(a.novo().abrir("1", "100"), /boost ativo/);
  assert.equal(a.chamadas.canais, 0);
  assert.equal(a.salvos.size, 0);
});

test("fluxo completo persiste cargo antes de atribuir e reabertura edita o mesmo", async () => {
  const a = ambiente(); const service = a.novo();
  assert.equal(await service.abrir("1", "100"), "10");
  await a.resumo(service);
  await service.alterar(a.ref(), "confirmar");
  assert.equal(a.b().cargoEstado, "ativo");
  assert.equal(a.b().etapa, "concluido");
  assert.equal(a.b().corPrimaria, "#AD75FF");
  await service.alterar(a.ref(), "fechar");
  assert.equal(a.b().canalEstado, "fechado");
  const reiniciado = a.novo();
  await reiniciado.abrir("1", "100");
  await a.resumo(reiniciado);
  await reiniciado.alterar(a.ref(), "confirmar");
  assert.deepEqual({ canais: a.chamadas.canais, cargos: a.chamadas.cargos, atribuicoes: a.chamadas.atribuicoes }, { canais: 2, cargos: 1, atribuicoes: 2 });
  assert.equal(a.b().cargoId, "12");
});

test("reinício durante coleta recupera canal, etapa e escolhas", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  await service.alterar(a.ref(), "nome", { nome: "Persistido" });
  await a.novo().abrir("1", "100");
  assert.equal(a.b().etapa, "estilo");
  assert.equal(a.b().nome, "Persistido");
  assert.equal(a.chamadas.canais, 1);
});

test("outro usuário, canal ou revisão antiga não opera o atendimento", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  const antigo = a.ref();
  for (const alterado of [{ ...antigo, usuarioId: "200" }, { ...antigo, canalId: "999" }, { ...antigo, sessao: "a".repeat(32) }]) {
    await assert.rejects(service.alterar(alterado, "cancelar"), /não pertence/);
  }
  await service.alterar(antigo, "nome", { nome: "Teste" });
  await assert.rejects(service.alterar(antigo, "cancelar"), /não pertence/);
  assert.equal(a.b().etapa, "estilo");
});

test("cliques simultâneos não duplicam canal nem confirmação do cargo", async () => {
  const a = ambiente(); const service = a.novo();
  const aberturas = await Promise.allSettled([service.abrir("1", "100"), service.abrir("1", "100")]);
  assert.equal(aberturas.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(a.chamadas.canais, 1);
  await a.resumo(service);
  const ref = a.ref();
  const confirmacoes = await Promise.allSettled([service.alterar(ref, "confirmar"), service.alterar(ref, "confirmar")]);
  assert.equal(confirmacoes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(a.chamadas.cargos, 1);
  assert.equal(a.chamadas.atribuicoes, 1);
});

test("falha de atribuição retoma após reinício sem criar outro cargo", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100"); await a.resumo(service);
  const aplicar = a.discord.aplicarCargo;
  a.discord.aplicarCargo = async () => { throw new Error("Discord indisponível"); };
  await assert.rejects(service.alterar(a.ref(), "confirmar"));
  assert.equal(a.b().cargoId, "12");
  assert.equal(a.b().cargoEstado, "pendente");
  a.discord.aplicarCargo = aplicar;
  await a.novo().alterar(a.ref(), "confirmar");
  assert.equal(a.chamadas.cargos, 1);
  assert.equal(a.b().cargoEstado, "ativo");
});

test("criação de cargo ambígua fica pendente e não é repetida", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100"); await a.resumo(service);
  a.discord.criarCargo = async () => { a.chamadas.cargos++; throw new Error("Resposta perdida"); };
  await assert.rejects(service.alterar(a.ref(), "confirmar"));
  assert.equal(a.b().cargoEstado, "criando");
  await assert.rejects(a.novo().alterar(a.ref(), "confirmar"), /Não criarei outro/);
  assert.equal(a.chamadas.cargos, 1);
});

test("erro local de permissão antes do POST permite corrigir e tentar novamente", async () => {
  const a = ambiente(); const service = a.novo();
  const criar = a.discord.criarCanal;
  a.discord.criarCanal = async () => { throw new ErroBooster("Falta Gerenciar canais"); };
  await assert.rejects(service.abrir("1", "100"), /Gerenciar canais/);
  assert.equal(a.b().canalEstado, "novo");
  a.discord.criarCanal = criar;
  await service.abrir("1", "100"); await a.resumo(service);
  const criarCargo = a.discord.criarCargo;
  a.discord.criarCargo = async () => { throw new ErroBooster("Falta Gerenciar cargos"); };
  await assert.rejects(service.alterar(a.ref(), "confirmar"));
  assert.equal(a.b().cargoEstado, "nenhum");
  a.discord.criarCargo = criarCargo;
  await service.alterar(a.ref(), "confirmar");
  assert.equal(a.chamadas.cargos, 1);
});

test("criação de canal com resposta perdida é recuperada, sem repetir POST", async () => {
  const a = ambiente(); const service = a.novo();
  a.discord.criarCanal = async () => { a.chamadas.canais++; throw new Error("Resposta perdida"); };
  await assert.rejects(service.abrir("1", "100"));
  assert.equal(a.b().canalEstado, "criando");
  await a.novo().abrir("1", "100");
  assert.equal(a.b().canalId, "10");
  assert.equal(a.chamadas.canais, 1);
});

test("perda do boost entre coleta e confirmação impede criação", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100"); await a.resumo(service); a.tirarBoost();
  await assert.rejects(service.alterar(a.ref(), "confirmar"), /boost não está ativo/);
  assert.equal(a.chamadas.cargos, 0);
});

test("HEX inválido não avança etapa nem grava cor; gradiente indisponível é recusado", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  await service.alterar(a.ref(), "nome", { nome: "Teste" }); a.tirarGradiente();
  await assert.rejects(service.alterar(a.ref(), "gradiente"), /indisponíveis/);
  await service.alterar(a.ref(), "solida");
  await assert.rejects(service.alterar(a.ref(), "cores", { primaria: "#ABC" }), /seis dígitos/);
  assert.equal(a.b().etapa, "cores");
  assert.equal(a.b().corPrimaria, null);
});

test("Voltar e Cancelar persistem sem criar cargo", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100"); await a.resumo(service);
  await service.alterar(a.ref(), "voltar"); assert.equal(a.b().etapa, "icone");
  await service.alterar(a.ref(), "cancelar"); assert.equal(a.b().etapa, "cancelado");
  assert.equal(a.chamadas.cargos, 0);
});

test("canal excluído é substituído preservando cargo pendente e escolhas", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100"); await a.resumo(service);
  const aplicar = a.discord.aplicarCargo;
  a.discord.aplicarCargo = async () => { throw new Error("Falha de atribuição simulada"); };
  await assert.rejects(service.alterar(a.ref(), "confirmar"));
  const anterior = a.b();
  a.discord.canalExiste = async () => false;
  a.discord.criarCanal = async () => { a.chamadas.canais++; return "20"; };
  a.discord.aplicarCargo = aplicar;
  assert.equal(await a.novo().abrir("1", "100"), "20");
  assert.equal(a.b().cargoId, anterior.cargoId);
  assert.equal(a.b().cargoEstado, "pendente");
  assert.equal(a.b().nome, anterior.nome);
  assert.equal(a.b().etapa, "resumo");
  assert.equal(a.b().corPrimaria, anterior.corPrimaria);
  await a.novo().alterar(a.ref(), "confirmar");
  assert.equal(a.chamadas.cargos, 1);
  assert.equal(a.b().cargoEstado, "ativo");
});

test("acesso recusado ou erro de rede não substitui canal nem perde referências", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  const anterior = a.b();
  for (const erro of [new Error("403"), new Error("Timeout")]) {
    a.discord.canalExiste = async () => { throw erro; };
    await assert.rejects(a.novo().abrir("1", "100"));
    assert.deepEqual(a.b(), anterior);
  }
  assert.equal(a.chamadas.canais, 1);
});

test("cliques simultâneos recriam canal excluído uma única vez", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  a.discord.canalExiste = async () => false;
  const resultados = await Promise.allSettled([service.abrir("1", "100"), service.abrir("1", "100")]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(a.chamadas.canais, 2); // original e substituto, nunca dois substitutos
});

for (const etapa of ["concluido", "cancelado"] as const) {
  test(`encerrar ${etapa} apaga somente o canal e preserva o benefício`, async () => {
    const a = ambiente(); const service = a.novo();
    await service.abrir("1", "100");
    await a.resumo(service);
    await service.alterar(a.ref(), etapa === "concluido" ? "confirmar" : "cancelar");
    const antes = a.b(); const ref = a.ref(); let apagados = 0;
    a.discord.apagarCanal = async (b) => { assert.equal(b.canalId, "10"); apagados++; };
    a.discord.apresentar = async () => { throw new Error("Não publicar em canal apagado"); };
    await service.alterar(ref, "fechar");
    assert.equal(apagados, 1);
    assert.equal(a.b().canalId, null);
    assert.equal(a.b().mensagemId, null);
    assert.equal(a.b().canalEstado, "fechado");
    assert.equal(a.b().cargoId, antes.cargoId);
    assert.equal(a.b().corPrimaria, antes.corPrimaria);
    await assert.rejects(service.alterar(ref, "fechar"), /não pertence/);
    assert.equal(apagados, 1);
  });
}

test("falha de exclusão mantém atendimento aberto para tentar novamente", async () => {
  const a = ambiente(); const service = a.novo();
  await service.abrir("1", "100");
  await service.alterar(a.ref(), "cancelar");
  const antes = a.b();
  a.discord.apagarCanal = async () => { throw new ErroBooster("Gerenciar canais"); };
  await assert.rejects(service.alterar(a.ref(), "fechar"), /Gerenciar canais/);
  assert.deepEqual(a.b(), antes);
});
